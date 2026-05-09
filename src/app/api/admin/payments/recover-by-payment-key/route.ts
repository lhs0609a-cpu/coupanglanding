import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { assertTossEnv } from '@/lib/payments/toss-client';
import { completeSettlement } from '@/lib/payments/complete-settlement';
import { logSettlementError } from '@/lib/payments/settlement-errors';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;

const TOSS_BASE = 'https://api.tosspayments.com/v1';

/**
 * POST /api/admin/payments/recover-by-payment-key
 *
 * Toss 머천트 대시보드에서 paymentKey 직접 복사 → 관리자 입력 → 즉시 복구.
 * orderId 미스매치 / settlements API 응답 이상 등 자동 복구 도구가 모두 실패한
 * 마지막 케이스 대응.
 *
 * 동작:
 *   1) Toss GET /v1/payments/{paymentKey} 직접 조회 → 권위 데이터 확보
 *   2) 응답의 orderId 로 우리 DB tx 매칭
 *      매칭 성공: payment_mark_success 로 즉시 복구
 *   3) orderId 매칭 실패 시 ptUserId + amount 매칭으로 unpaid tx 검색
 *      매칭 성공: 그 tx 의 toss_order_id 를 토스 orderId 로 업데이트 + payment_mark_success
 *
 * Body: { paymentKey: string, ptUserIdOrEmail?: string, dryRun?: boolean }
 *   - paymentKey 필수 (토스 머천트에서 복사)
 *   - ptUserIdOrEmail 권장 (orderId 미스매치 시 amount 매칭 범위 좁힘)
 *
 * 사용 시나리오:
 *   1) Toss 머천트 → 거래내역 → 해당 결제 클릭 → paymentKey 복사
 *   2) 이 endpoint 호출 → 즉시 복구
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const guard = await requireAdminRole(supabase, user?.id, 'write');
    if (!guard.ok) return guard.response;

    const body = (await request.json().catch(() => ({}))) as {
      paymentKey?: string;
      ptUserIdOrEmail?: string;
      dryRun?: boolean;
    };

    if (!body.paymentKey || typeof body.paymentKey !== 'string') {
      return NextResponse.json({ error: 'paymentKey 필수 (Toss 머천트에서 복사)' }, { status: 400 });
    }
    const paymentKey = body.paymentKey.trim();
    const dryRun = body.dryRun === true;

    let secretKey: string;
    try {
      ({ secretKey } = assertTossEnv());
    } catch (envErr) {
      return NextResponse.json({
        error: 'Toss 환경변수 미설정',
        detail: envErr instanceof Error ? envErr.message : String(envErr),
      }, { status: 500 });
    }
    const authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');

    const serviceClient = await createServiceClient();

    // ── 1) Toss 권위 데이터 조회 ──
    const tossRes = await fetch(
      `${TOSS_BASE}/payments/${encodeURIComponent(paymentKey)}`,
      { headers: { Authorization: authHeader }, signal: AbortSignal.timeout(15_000) },
    );
    if (tossRes.status === 404) {
      return NextResponse.json({
        error: '토스에 해당 paymentKey 없음 (잘못 입력 또는 다른 시스템 결제)',
        paymentKey,
      }, { status: 404 });
    }
    if (!tossRes.ok) {
      const detail = await tossRes.text().catch(() => '');
      return NextResponse.json({
        error: `토스 결제 조회 실패 (HTTP ${tossRes.status})`,
        detail: detail.slice(0, 500),
      }, { status: 502 });
    }
    const tossData = (await tossRes.json()) as Record<string, unknown>;
    const tossStatus = tossData.status as string | undefined;
    const tossOrderId = tossData.orderId as string | undefined;
    const tossTotalAmount = tossData.totalAmount as number | undefined;
    const tossApprovedAt = (tossData.approvedAt as string | undefined) ?? new Date().toISOString();
    const tossReceiptUrl = (tossData.receipt as { url?: string } | undefined)?.url ?? null;

    if (tossStatus !== 'DONE') {
      return NextResponse.json({
        error: `토스 결제 status=${tossStatus} — DONE 아니면 복구 불가`,
        tossStatus,
        tossData,
      }, { status: 422 });
    }

    if (!tossOrderId || !tossTotalAmount) {
      return NextResponse.json({
        error: '토스 응답에 orderId 또는 totalAmount 누락',
        tossData,
      }, { status: 502 });
    }

    // ── 2) 우리 DB tx 매칭 시도 ──
    // 2-A: orderId 직접 매칭
    interface TxRow {
      id: string;
      pt_user_id: string;
      monthly_report_id: string;
      status: string;
      total_amount: number;
      toss_order_id: string | null;
      is_final_failure: boolean;
    }
    const orderMatchRes = await serviceClient
      .from('payment_transactions')
      .select('id, pt_user_id, monthly_report_id, status, total_amount, toss_order_id, is_final_failure')
      .eq('toss_order_id', tossOrderId)
      .maybeSingle();
    let tx: TxRow | null = (orderMatchRes.data as TxRow | null) ?? null;

    let matchedBy: 'orderId' | 'amount_user' = 'orderId';

    // 2-B: orderId 매칭 실패 → ptUserIdOrEmail + amount 로 매칭
    if (!tx && body.ptUserIdOrEmail) {
      const input = body.ptUserIdOrEmail.trim();
      let resolvedPtUserId: string | null = null;

      if (input.includes('@')) {
        const { data: prof } = await serviceClient
          .from('profiles')
          .select('id')
          .eq('email', input)
          .maybeSingle();
        if (prof) {
          const { data: pt } = await serviceClient
            .from('pt_users')
            .select('id')
            .eq('profile_id', (prof as { id: string }).id)
            .maybeSingle();
          if (pt) resolvedPtUserId = (pt as { id: string }).id;
        }
      } else {
        resolvedPtUserId = input;
      }

      if (resolvedPtUserId) {
        // 미납 리포트 + 동일 amount 의 failed/pending tx
        const { data: candidates } = await serviceClient
          .from('payment_transactions')
          .select('id, pt_user_id, monthly_report_id, status, total_amount, toss_order_id, is_final_failure, monthly_reports!inner(fee_payment_status)')
          .eq('pt_user_id', resolvedPtUserId)
          .eq('total_amount', tossTotalAmount)
          .in('status', ['failed', 'pending'])
          .order('created_at', { ascending: false });

        const filtered = (candidates || []).filter((c) => {
          const mr = (c as unknown as { monthly_reports?: { fee_payment_status: string } | { fee_payment_status: string }[] }).monthly_reports;
          const mrObj = Array.isArray(mr) ? mr[0] : mr;
          return mrObj?.fee_payment_status !== 'paid';
        });

        if (filtered.length > 0) {
          tx = filtered[0] as unknown as TxRow;
          matchedBy = 'amount_user';

          // toss_order_id 업데이트 (다음 자동 복구 cron 이 정확히 매칭하게)
          if (!dryRun && tx) {
            await serviceClient
              .from('payment_transactions')
              .update({ toss_order_id: tossOrderId })
              .eq('id', tx.id);
          }
        }
      }
    }

    if (!tx) {
      return NextResponse.json({
        error: '우리 DB 에서 매칭되는 tx 없음',
        hint: 'ptUserIdOrEmail 파라미터 추가 시 amount 매칭 시도. 또는 mark-report-paid 로 수동 처리.',
        tossOrderId,
        tossTotalAmount,
      }, { status: 404 });
    }

    if (tx.status === 'success') {
      return NextResponse.json({
        success: true,
        message: '이미 success 상태 — 변경 없음',
        txId: tx.id,
        matchedBy,
      });
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        wouldRecover: {
          txId: tx.id,
          ptUserId: tx.pt_user_id,
          monthlyReportId: tx.monthly_report_id,
          prevStatus: tx.status,
          amount: tx.total_amount,
          matchedBy,
          tossOrderId,
          tossPaymentKey: paymentKey,
        },
      });
    }

    // ── 3) RPC 로 success 마킹 ──
    const { error: rpcErr } = await serviceClient.rpc('payment_mark_success', {
      p_tx_id: tx.id,
      p_payment_key: paymentKey,
      p_receipt_url: tossReceiptUrl,
      p_raw: tossData,
      p_approved_at: tossApprovedAt,
    });

    if (rpcErr) {
      await logSettlementError(serviceClient, {
        stage: 'recover_by_payment_key_rpc',
        monthlyReportId: tx.monthly_report_id as string,
        ptUserId: tx.pt_user_id as string,
        error: rpcErr,
        detail: { paymentKey, tossOrderId, severity: 'CRITICAL_DESYNC' },
      });
      return NextResponse.json({
        error: `payment_mark_success RPC 실패: ${rpcErr.message}`,
        txId: tx.id,
      }, { status: 500 });
    }

    // ── 4) 정산 후처리 ──
    const { data: fullReport } = await serviceClient
      .from('monthly_reports')
      .select('*')
      .eq('id', tx.monthly_report_id as string)
      .single();
    if (fullReport) {
      try {
        await completeSettlement(serviceClient, fullReport);
      } catch (settleErr) {
        await logSettlementError(serviceClient, {
          stage: 'recover_by_payment_key_complete_settlement',
          monthlyReportId: tx.monthly_report_id as string,
          ptUserId: tx.pt_user_id as string,
          error: settleErr,
        });
      }
    }

    // ── 5) 락 해제 ──
    const { data: cleared } = await serviceClient.rpc('payment_clear_overdue_if_settled', {
      p_pt_user_id: tx.pt_user_id,
    });

    console.log(
      `[recover-by-payment-key][RECOVERED] tx=${tx.id} ptUser=${tx.pt_user_id} ` +
      `paymentKey=${paymentKey} tossOrderId=${tossOrderId} amount=${tossTotalAmount} ` +
      `prev=${tx.status} matchedBy=${matchedBy}`,
    );

    return NextResponse.json({
      success: true,
      txId: tx.id,
      ptUserId: tx.pt_user_id,
      monthlyReportId: tx.monthly_report_id,
      prevStatus: tx.status,
      amount: tossTotalAmount,
      matchedBy,
      tossOrderId,
      tossPaymentKey: paymentKey,
      lockCleared: cleared === true,
    });
  } catch (err) {
    console.error('POST /api/admin/payments/recover-by-payment-key error:', err);
    void logSystemError({
      source: 'admin/payments/recover-by-payment-key',
      error: err,
      category: 'payment',
    }).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 },
    );
  }
}
