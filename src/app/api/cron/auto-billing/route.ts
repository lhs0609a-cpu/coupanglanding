import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { TossPaymentsAPI, generateOrderId } from '@/lib/payments/toss-client';
import { calculateFeePenalty, getFeePaymentDDay } from '@/lib/utils/fee-penalty';
import { createNotification } from '@/lib/utils/notifications';
import { completeSettlement } from '@/lib/payments/complete-settlement';

/**
 * GET /api/cron/auto-billing
 * 매일 03:00 KST 실행
 * 오늘 = billing_day인 사용자의 미납 수수료를 자동 결제
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const serviceClient = await createServiceClient();
    const today = new Date();
    const todayDay = today.getDate();

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    // 오늘이 billing_day인 활성 스케줄 조회
    const { data: schedules } = await serviceClient
      .from('payment_schedules')
      .select('*, billing_card:billing_cards(*)')
      .eq('auto_payment_enabled', true)
      .eq('billing_day', todayDay);

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ success: true, message: '오늘 결제 대상 없음', processed: 0 });
    }

    for (const schedule of schedules) {
      const card = schedule.billing_card;
      if (!card || !card.is_active) continue;

      // 이 사용자의 미납 리포트 조회 (awaiting_payment 또는 overdue)
      const { data: unpaidReports } = await serviceClient
        .from('monthly_reports')
        .select('*')
        .eq('pt_user_id', schedule.pt_user_id)
        .in('fee_payment_status', ['awaiting_payment', 'overdue'])
        .order('year_month', { ascending: true });

      if (!unpaidReports || unpaidReports.length === 0) continue;

      // profile_id 조회 (알림용)
      const { data: ptUser } = await serviceClient
        .from('pt_users')
        .select('profile_id')
        .eq('id', schedule.pt_user_id)
        .single();

      for (const report of unpaidReports) {
        processed++;

        // 금액 계산
        const baseAmount = report.total_with_vat || 0;
        if (baseAmount <= 0) continue;

        let penaltyAmount = 0;
        if (report.fee_payment_deadline) {
          const dday = getFeePaymentDDay(report.fee_payment_deadline);
          if (dday < 0) {
            const penalty = calculateFeePenalty(baseAmount, Math.abs(dday));
            penaltyAmount = penalty.totalPenalty;
          }
        }

        const totalAmount = baseAmount + penaltyAmount;
        const orderId = generateOrderId(report.year_month, schedule.pt_user_id);
        const orderName = `메가로드 수수료 ${report.year_month} (자동)`;

        // 트랜잭션 생성
        const { data: tx } = await serviceClient
          .from('payment_transactions')
          .insert({
            pt_user_id: schedule.pt_user_id,
            monthly_report_id: report.id,
            billing_card_id: card.id,
            toss_order_id: orderId,
            amount: baseAmount,
            penalty_amount: penaltyAmount,
            total_amount: totalAmount,
            status: 'pending',
            payment_method: 'card',
            is_auto_payment: true,
          })
          .select()
          .single();

        if (!tx) continue;

        try {
          const result = await TossPaymentsAPI.payWithBillingKey(
            card.billing_key,
            card.customer_key,
            totalAmount,
            orderId,
            orderName,
          );

          // 성공 — 트랜잭션 기록
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

          await serviceClient
            .from('billing_cards')
            .update({ last_used_at: new Date().toISOString(), failed_count: 0 })
            .eq('id', card.id);

          await serviceClient
            .from('payment_schedules')
            .update({
              total_success_count: (schedule.total_success_count || 0) + 1,
              last_charged_at: new Date().toISOString(),
            })
            .eq('id', schedule.id);

          // 정산 자동 확정 (confirmed + 매출기록 + 세금계산서 + 트레이너 보너스)
          await completeSettlement(serviceClient, report);

          if (ptUser) {
            await createNotification(serviceClient, {
              userId: ptUser.profile_id,
              type: 'fee_payment',
              title: '자동결제 및 정산 완료',
              message: `${report.year_month} 수수료 ${totalAmount.toLocaleString()}원이 자동 결제되었습니다. 정산이 자동 확정되었습니다.`,
              link: '/my/report',
            });
          }

          succeeded++;
        } catch (payErr) {
          // 실패
          const errObj = payErr as { code?: string; message?: string; raw?: unknown };

          await serviceClient
            .from('payment_transactions')
            .update({
              status: 'failed',
              failure_code: errObj.code || 'UNKNOWN',
              failure_message: errObj.message || '자동결제 실패',
              raw_response: (errObj.raw as Record<string, unknown>) || null,
              failed_at: new Date().toISOString(),
            })
            .eq('id', tx.id);

          await serviceClient
            .from('billing_cards')
            .update({ failed_count: (card.failed_count || 0) + 1 })
            .eq('id', card.id);

          await serviceClient
            .from('payment_schedules')
            .update({
              total_failed_count: (schedule.total_failed_count || 0) + 1,
            })
            .eq('id', schedule.id);

          if (ptUser) {
            await createNotification(serviceClient, {
              userId: ptUser.profile_id,
              type: 'fee_payment',
              title: '자동결제 실패',
              message: `${report.year_month} 수수료 자동결제가 실패했습니다. 사유: ${errObj.message || '알 수 없는 오류'}. 설정에서 카드를 확인해주세요.`,
              link: '/my/settings',
            });
          }

          failed++;
        }
      }
    }

    return NextResponse.json({ success: true, processed, succeeded, failed });
  } catch (err) {
    console.error('cron/auto-billing error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
