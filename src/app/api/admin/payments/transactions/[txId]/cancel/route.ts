import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { TossPaymentsAPI } from '@/lib/payments/toss-client';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { logSystemError } from '@/lib/utils/system-log';
import { logSettlementError } from '@/lib/payments/settlement-errors';

export const maxDuration = 30;

/**
 * POST /api/admin/payments/transactions/[txId]/cancel
 * 관리자가 결제(success tx)를 토스로 취소(환불).
 *
 * 안전 가드:
 *   - admin write 권한 필수 (partner 금지 — 금전 환불 영향)
 *   - tx.status='success' AND toss_payment_key 존재
 *   - 기본: 같은 monthly_report 에 다른 success tx 가 있는 "중복 결제" 케이스에만 허용
 *   - force=true 옵션: 단일 결제라도 강제 취소 (이 경우 monthly_report 를 미납으로 되돌림)
 *
 * 후처리:
 *   1) Toss cancel API 호출 → 카드사 환불 트리거
 *   2) tx.status = 'cancelled', raw_response = 토스 응답
 *   3) 중복 케이스: monthly_report 상태 그대로 (다른 success tx 가 paid 유지)
 *      단일 케이스(force): monthly_report 를 awaiting_payment 로 되돌리고 overdue 마킹
 *
 * 멱등성: 이미 status='cancelled' 면 즉시 success 반환.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ txId: string }> },
) {
  try {
    const { txId } = await context.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const guard = await requireAdminRole(supabase, user?.id, 'write');
    if (!guard.ok) return guard.response;

    const body = await request.json().catch(() => ({}));
    const reason: string = (body.reason as string) || '관리자 직접 취소';
    const force: boolean = !!body.force;

    if (reason.length < 2) {
      return NextResponse.json({ error: '취소 사유를 2자 이상 입력해주세요.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    const { data: tx } = await serviceClient
      .from('payment_transactions')
      .select('id, pt_user_id, monthly_report_id, status, toss_payment_key, total_amount, raw_response')
      .eq('id', txId)
      .single();

    if (!tx) return NextResponse.json({ error: '트랜잭션 없음' }, { status: 404 });

    // 멱등 — 이미 취소된 tx
    if (tx.status === 'cancelled') {
      return NextResponse.json({ success: true, alreadyCancelled: true });
    }

    if (tx.status !== 'success') {
      return NextResponse.json(
        { error: `취소는 success 상태에서만 가능합니다. 현재: ${tx.status}` },
        { status: 400 },
      );
    }

    if (!tx.toss_payment_key) {
      return NextResponse.json(
        { error: 'toss_payment_key 없음 — 토스 결제 미연동 tx', code: 'NO_PAYMENT_KEY' },
        { status: 400 },
      );
    }

    // 중복 검증 — 같은 리포트에 다른 success tx 가 있는지
    const { count: siblingSuccessCount } = await serviceClient
      .from('payment_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('monthly_report_id', tx.monthly_report_id)
      .eq('status', 'success')
      .neq('id', tx.id);

    const isDuplicate = (siblingSuccessCount ?? 0) > 0;

    if (!isDuplicate && !force) {
      return NextResponse.json(
        {
          error: '같은 리포트의 유일한 결제입니다. 이걸 취소하면 미납 처리됩니다. 정말 취소하려면 force=true 옵션을 사용하세요.',
          code: 'NOT_DUPLICATE',
          siblingSuccessCount: 0,
        },
        { status: 400 },
      );
    }

    // 토스 취소 호출
    let cancelResult;
    try {
      cancelResult = await TossPaymentsAPI.cancelPayment(tx.toss_payment_key, reason);
    } catch (cancelErr) {
      const detail = cancelErr instanceof Error ? cancelErr.message : String(cancelErr);
      await logSettlementError(serviceClient, {
        stage: 'admin_cancel_toss_api',
        monthlyReportId: tx.monthly_report_id,
        ptUserId: tx.pt_user_id,
        error: cancelErr,
      });
      return NextResponse.json(
        { error: `토스 취소 실패: ${detail}`, code: 'TOSS_CANCEL_FAILED' },
        { status: 502 },
      );
    }

    // tx 상태 갱신 — 멱등을 위해 status 가 success 인 row 만 update
    const { error: updErr } = await serviceClient
      .from('payment_transactions')
      .update({
        status: 'cancelled',
        cancel_reason: reason,
        cancelled_at: new Date().toISOString(),
        cancelled_by_admin_id: user?.id ?? null,
        raw_response: cancelResult as unknown as Record<string, unknown>,
      })
      .eq('id', tx.id)
      .eq('status', 'success');

    if (updErr) {
      // Toss 는 이미 취소됨 — DB 만 실패. 운영자가 수동 정리 필요.
      await logSettlementError(serviceClient, {
        stage: 'admin_cancel_db_update',
        monthlyReportId: tx.monthly_report_id,
        ptUserId: tx.pt_user_id,
        error: updErr,
        detail: { paymentKey: tx.toss_payment_key, cancelResult: cancelResult as unknown as Record<string, unknown> },
      });
      return NextResponse.json(
        {
          error: '토스 취소는 완료됐지만 DB 갱신 실패. 수동 확인 필요.',
          code: 'DB_UPDATE_FAILED',
          tossCancelResult: cancelResult,
        },
        { status: 500 },
      );
    }

    // 단일 결제(force) 취소면 monthly_report 를 미납으로 되돌림
    let reportReverted = false;
    if (!isDuplicate) {
      await serviceClient
        .from('monthly_reports')
        .update({
          fee_payment_status: 'awaiting_payment',
          fee_paid_at: null,
          fee_confirmed_at: null,
          payment_status: 'pending',
          payment_confirmed_at: null,
        })
        .eq('id', tx.monthly_report_id);

      // payment_overdue_since 가 비어있다면 오늘로 마킹
      await serviceClient
        .from('pt_users')
        .update({ payment_overdue_since: new Date().toISOString().slice(0, 10) })
        .eq('id', tx.pt_user_id)
        .is('payment_overdue_since', null);

      reportReverted = true;
    }

    return NextResponse.json({
      success: true,
      cancelled: true,
      isDuplicate,
      reportReverted,
      siblingSuccessCount: siblingSuccessCount ?? 0,
      tossCancel: {
        paymentKey: cancelResult.paymentKey,
        status: cancelResult.status,
        cancels: cancelResult.cancels,
      },
    });
  } catch (err) {
    console.error('POST /api/admin/payments/transactions/[txId]/cancel error:', err);
    void logSystemError({
      source: 'admin/payments/transactions/[txId]/cancel',
      error: err,
      category: 'payment',
    }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
