import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { TossPaymentsAPI, generateOrderId } from '@/lib/payments/toss-client';
import { calculateFeePenalty, getFeePaymentDDay } from '@/lib/utils/fee-penalty';
import { createNotification } from '@/lib/utils/notifications';
import { completeSettlement } from '@/lib/payments/complete-settlement';
import { logSettlementError } from '@/lib/payments/settlement-errors';

export const maxDuration = 30;


/**
 * POST /api/payments/execute
 * 수동 즉시 결제 실행
 * body: { reportId, cardId }
 *
 * 허용 상태: awaiting_payment, overdue, suspended
 *   - suspended 는 D+14 로 정지된 리포트. 사용자가 직접 결제하여 복구할 수 있게 허용한다.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { reportId, cardId } = await request.json();
    if (!reportId) return NextResponse.json({ error: 'reportId 필요' }, { status: 400 });

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id, profile_id')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) return NextResponse.json({ error: 'PT 사용자 없음' }, { status: 404 });

    const serviceClient = await createServiceClient();

    const { data: report } = await serviceClient
      .from('monthly_reports')
      .select('*')
      .eq('id', reportId)
      .eq('pt_user_id', ptUser.id)
      .single();

    if (!report) return NextResponse.json({ error: '리포트 없음' }, { status: 404 });

    if (!['awaiting_payment', 'overdue', 'suspended'].includes(report.fee_payment_status)) {
      return NextResponse.json({ error: '결제 불가 상태' }, { status: 400 });
    }

    // 카드 조회
    let cardQuery = serviceClient
      .from('billing_cards')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .eq('is_active', true);

    if (cardId) {
      cardQuery = cardQuery.eq('id', cardId);
    } else {
      cardQuery = cardQuery.eq('is_primary', true);
    }

    const { data: card } = await cardQuery.maybeSingle();
    if (!card) return NextResponse.json({ error: '결제 카드 없음. 카드를 먼저 등록해주세요.' }, { status: 400 });

    const baseAmount = report.total_with_vat || 0;
    let penaltyAmount = 0;

    if (report.fee_payment_deadline) {
      const dday = getFeePaymentDDay(report.fee_payment_deadline);
      if (dday < 0) {
        const penalty = calculateFeePenalty(baseAmount, Math.abs(dday));
        penaltyAmount = penalty.totalPenalty;
      }
    }

    const totalAmount = baseAmount + penaltyAmount;
    if (totalAmount <= 0) return NextResponse.json({ error: '결제 금액이 0원입니다' }, { status: 400 });

    const orderId = generateOrderId(report.year_month, ptUser.id);
    const orderName = `메가로드 수수료 ${report.year_month}`;

    // pending tx insert — monthly_report_id partial unique 로 중복 결제 방지
    const { data: tx, error: txError } = await serviceClient
      .from('payment_transactions')
      .insert({
        pt_user_id: ptUser.id,
        monthly_report_id: report.id,
        billing_card_id: card.id,
        toss_order_id: orderId,
        amount: baseAmount,
        penalty_amount: penaltyAmount,
        total_amount: totalAmount,
        status: 'pending',
        payment_method: 'card',
        is_auto_payment: false,
      })
      .select()
      .single();

    if (txError || !tx) {
      // unique 위반 — 이미 진행 중인 결제가 있음
      return NextResponse.json(
        { error: '이미 진행 중인 결제가 있습니다. 잠시 후 다시 시도해주세요.' },
        { status: 409 },
      );
    }

    try {
      const result = await TossPaymentsAPI.payWithBillingKey(
        card.billing_key,
        card.customer_key,
        totalAmount,
        orderId,
        orderName,
      );

      // 원자적 성공 처리
      const { error: rpcErr } = await serviceClient.rpc('payment_mark_success', {
        p_tx_id: tx.id,
        p_payment_key: result.paymentKey,
        p_receipt_url: result.receipt?.url || null,
        p_raw: result as unknown as Record<string, unknown>,
        p_approved_at: result.approvedAt,
      });

      if (rpcErr) throw rpcErr;

      try {
        await completeSettlement(serviceClient, report);
      } catch (settleErr) {
        await logSettlementError(serviceClient, {
          stage: 'execute_complete_settlement',
          monthlyReportId: report.id,
          ptUserId: ptUser.id,
          error: settleErr,
        });
      }

      // 조건부 락 해제
      await serviceClient.rpc('payment_clear_overdue_if_settled', {
        p_pt_user_id: ptUser.id,
      });

      await createNotification(serviceClient, {
        userId: ptUser.profile_id,
        type: 'fee_payment',
        title: '수수료 결제 및 정산 완료',
        message: `${report.year_month} 수수료 ${totalAmount.toLocaleString()}원이 결제되었습니다. 정산이 자동 확정되었습니다.`,
        link: '/my/report',
      });

      return NextResponse.json({
        success: true,
        transaction: { id: tx.id, amount: totalAmount, paymentKey: result.paymentKey },
      });
    } catch (payErr) {
      const errObj = payErr as { code?: string; message?: string; raw?: unknown };

      await serviceClient
        .from('payment_transactions')
        .update({
          status: 'failed',
          failure_code: errObj.code || 'UNKNOWN',
          failure_message: errObj.message || '결제 실패',
          raw_response: (errObj.raw as Record<string, unknown>) || null,
          failed_at: new Date().toISOString(),
        })
        .eq('id', tx.id);

      await serviceClient
        .from('billing_cards')
        .update({ failed_count: (card.failed_count || 0) + 1 })
        .eq('id', card.id);

      return NextResponse.json({
        error: errObj.message || '결제 실패',
        failureCode: errObj.code,
      }, { status: 402 });
    }
  } catch (err) {
    console.error('POST /api/payments/execute error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
