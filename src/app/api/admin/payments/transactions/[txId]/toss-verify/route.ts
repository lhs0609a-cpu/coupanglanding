import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { assertTossEnv } from '@/lib/payments/toss-client';
import { completeSettlement } from '@/lib/payments/complete-settlement';
import { logSettlementError } from '@/lib/payments/settlement-errors';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;

const TOSS_PAYMENTS_BASE = 'https://api.tosspayments.com/v1/payments';

/**
 * POST /api/admin/payments/transactions/[txId]/toss-verify
 * 특정 tx 의 toss_order_id 로 토스 API 직접 조회.
 *
 * 동작:
 *   1) 토스 GET /payments/orders/{orderId} 호출
 *   2) raw 응답 반환 (운영자가 DONE/CANCELED/ABORTED/EXPIRED/READY 등 직접 확인)
 *   3) status='DONE' 이고 우리 시스템이 success 가 아니면 → 자동 복구
 *      (payment_mark_success RPC + completeSettlement + 락 해제)
 *
 * 안전: admin write 권한, 토스 환불 발생 안 함.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ txId: string }> },
) {
  try {
    const { txId } = await context.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const guard = await requireAdminRole(supabase, user?.id, 'write');
    if (!guard.ok) return guard.response;

    const { secretKey: tossSecretKey } = assertTossEnv();
    const serviceClient = await createServiceClient();

    const { data: tx } = await serviceClient
      .from('payment_transactions')
      .select('id, pt_user_id, monthly_report_id, toss_order_id, toss_payment_key, status, total_amount, failure_code, failure_message')
      .eq('id', txId)
      .single();

    if (!tx) return NextResponse.json({ error: '트랜잭션 없음' }, { status: 404 });
    if (!tx.toss_order_id) {
      return NextResponse.json({ error: 'toss_order_id 없음' }, { status: 400 });
    }

    // 토스 조회
    const authHeader = 'Basic ' + Buffer.from(tossSecretKey + ':').toString('base64');
    const res = await fetch(
      `${TOSS_PAYMENTS_BASE}/orders/${encodeURIComponent(tx.toss_order_id)}`,
      { headers: { Authorization: authHeader }, signal: AbortSignal.timeout(15_000) },
    );

    if (res.status === 404) {
      return NextResponse.json({
        success: true,
        tossFound: false,
        tossStatus: null,
        ourStatus: tx.status,
        recovered: false,
        note: '토스에 해당 주문이 존재하지 않습니다. 결제 시도 자체가 안 된 케이스.',
        toss_order_id: tx.toss_order_id,
      });
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return NextResponse.json(
        {
          error: `토스 조회 실패 (${res.status})`,
          detail: errText.slice(0, 500),
          toss_order_id: tx.toss_order_id,
        },
        { status: 502 },
      );
    }

    const tossData = (await res.json()) as Record<string, unknown>;
    const tossStatus = (tossData.status as string | undefined) ?? null;
    const tossPaymentKey = (tossData.paymentKey as string | undefined) ?? null;
    const tossApprovedAt = (tossData.approvedAt as string | undefined) ?? null;
    const tossReceiptUrl = ((tossData.receipt as { url?: string } | undefined)?.url) ?? null;
    const tossTotalAmount = (tossData.totalAmount as number | undefined) ?? null;

    let recovered = false;
    let recoveryNote = '';

    // 토스 DONE인데 우리 시스템 success 아니면 자동 복구
    if (tossStatus === 'DONE' && tx.status !== 'success') {
      const { error: rpcErr } = await serviceClient.rpc('payment_mark_success', {
        p_tx_id: tx.id,
        p_payment_key: tossPaymentKey,
        p_receipt_url: tossReceiptUrl,
        p_raw: tossData,
        p_approved_at: tossApprovedAt ?? new Date().toISOString(),
      });

      if (rpcErr) {
        await logSettlementError(serviceClient, {
          stage: 'toss_verify_admin_mark_success_rpc',
          monthlyReportId: tx.monthly_report_id,
          ptUserId: tx.pt_user_id,
          error: rpcErr,
        });
        recoveryNote = `payment_mark_success RPC 실패: ${rpcErr.message}`;
      } else {
        // 정산 후처리
        const { data: fullReport } = await serviceClient
          .from('monthly_reports')
          .select('*')
          .eq('id', tx.monthly_report_id)
          .single();

        if (fullReport) {
          try {
            await completeSettlement(serviceClient, fullReport);
          } catch (settleErr) {
            await logSettlementError(serviceClient, {
              stage: 'toss_verify_admin_complete_settlement',
              monthlyReportId: tx.monthly_report_id,
              ptUserId: tx.pt_user_id,
              error: settleErr,
            });
          }
        }

        // 락 해제
        await serviceClient.rpc('payment_clear_overdue_if_settled', {
          p_pt_user_id: tx.pt_user_id,
        });

        recovered = true;
        recoveryNote = '토스 DONE 확인 → success 복구 + 정산 + 락 해제 완료';
      }
    } else if (tossStatus === 'DONE' && tx.status === 'success') {
      recoveryNote = '이미 success 상태 — 변경 없음';
    } else {
      recoveryNote = `토스 status=${tossStatus} — 결제 미완료 상태 확정 (시스템 마킹 정확함)`;
    }

    return NextResponse.json({
      success: true,
      tossFound: true,
      tossStatus,
      tossPaymentKey,
      tossApprovedAt,
      tossTotalAmount,
      tossReceiptUrl,
      ourStatus: tx.status,
      ourFailureCode: tx.failure_code,
      ourTotalAmount: tx.total_amount,
      recovered,
      recoveryNote,
      toss_order_id: tx.toss_order_id,
      tossRawResponse: tossData,
    });
  } catch (err) {
    console.error('POST /api/admin/payments/transactions/[txId]/toss-verify error:', err);
    void logSystemError({
      source: 'admin/payments/transactions/[txId]/toss-verify',
      error: err,
      category: 'payment',
    }).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 },
    );
  }
}
