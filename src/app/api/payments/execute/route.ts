import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { TossPaymentsAPI, generateCustomerKey, generateOrderId } from '@/lib/payments/toss-client';
import { calculateFeePenalty, getFeePaymentDDay } from '@/lib/utils/fee-penalty';
import { createNotification } from '@/lib/utils/notifications';
import { completeSettlement } from '@/lib/payments/complete-settlement';

/**
 * POST /api/payments/execute
 * 수동 즉시 결제 실행
 * body: { reportId, cardId }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { reportId, cardId } = await request.json();
    if (!reportId) return NextResponse.json({ error: 'reportId 필요' }, { status: 400 });

    // pt_user 조회
    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id, profile_id')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) return NextResponse.json({ error: 'PT 사용자 없음' }, { status: 404 });

    const serviceClient = await createServiceClient();

    // 리포트 조회
    const { data: report } = await serviceClient
      .from('monthly_reports')
      .select('*')
      .eq('id', reportId)
      .eq('pt_user_id', ptUser.id)
      .single();

    if (!report) return NextResponse.json({ error: '리포트 없음' }, { status: 404 });

    // 결제 가능 상태 확인
    if (!['awaiting_payment', 'overdue'].includes(report.fee_payment_status)) {
      return NextResponse.json({ error: '결제 불가 상태' }, { status: 400 });
    }

    // 카드 조회 (지정된 카드 or 기본 카드)
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

    const { data: card } = await cardQuery.single();
    if (!card) return NextResponse.json({ error: '결제 카드 없음. 카드를 먼저 등록해주세요.' }, { status: 400 });

    // 금액 계산 (원금 + 페널티)
    const baseAmount = report.total_with_vat || 0;
    let penaltyAmount = 0;

    if (report.fee_payment_deadline) {
      const dday = getFeePaymentDDay(report.fee_payment_deadline);
      if (dday < 0) {
        const daysOverdue = Math.abs(dday);
        const penalty = calculateFeePenalty(baseAmount, daysOverdue);
        penaltyAmount = penalty.totalPenalty;
      }
    }

    const totalAmount = baseAmount + penaltyAmount;
    if (totalAmount <= 0) return NextResponse.json({ error: '결제 금액이 0원입니다' }, { status: 400 });

    const orderId = generateOrderId(report.year_month, ptUser.id);
    const customerKey = generateCustomerKey(ptUser.id);
    const orderName = `메가로드 수수료 ${report.year_month}`;

    // 트랜잭션 레코드 생성 (pending)
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

    if (txError) throw txError;

    // 토스 결제 실행
    try {
      const result = await TossPaymentsAPI.payWithBillingKey(
        card.billing_key,
        customerKey,
        totalAmount,
        orderId,
        orderName,
      );

      // 결제 성공 — 트랜잭션 기록
      await serviceClient
        .from('payment_transactions')
        .update({
          status: 'success',
          toss_payment_key: result.paymentKey,
          receipt_url: result.receipt?.url || null,
          raw_response: result as unknown as Record<string, unknown>,
          approved_at: result.approvedAt,
        })
        .eq('id', tx.id);

      // 카드 last_used_at 갱신 + failed_count 리셋
      await serviceClient
        .from('billing_cards')
        .update({ last_used_at: new Date().toISOString(), failed_count: 0 })
        .eq('id', card.id);

      // 정산 자동 확정 (confirmed + 매출기록 + 세금계산서 + 트레이너 보너스)
      await completeSettlement(serviceClient, report);

      // 성공 알림
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
      // 결제 실패
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

      // 카드 실패 카운트 증가
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
