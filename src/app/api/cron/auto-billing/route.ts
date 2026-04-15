import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { TossPaymentsAPI, generateOrderId } from '@/lib/payments/toss-client';
import { calculateFeePenalty, getFeePaymentDDay } from '@/lib/utils/fee-penalty';
import { createNotification } from '@/lib/utils/notifications';
import { completeSettlement } from '@/lib/payments/complete-settlement';
import { BILLING_DAY } from '@/lib/payments/billing-constants';

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * GET /api/cron/auto-billing
 * 매일 03:00 KST 실행. 오늘이 BILLING_DAY(매월 5일)일 때만 동작.
 *
 * 동작:
 *   1) 모든 PT 유저 순회
 *   2) 활성 카드 없음 → payment_overdue_since 마킹 + 알림
 *   3) 활성 카드 있음 → 미납 monthly_reports 결제 시도
 *      - 성공: 트랜잭션 기록 + completeSettlement + payment_overdue_since 클리어
 *      - 실패: 트랜잭션 기록 + payment_overdue_since 마킹 (없을 때만)
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
    const todayDateStr = today.toISOString().slice(0, 10);

    if (todayDay !== BILLING_DAY) {
      return NextResponse.json({
        success: true,
        message: `오늘은 청구일이 아님 (오늘=${todayDay}일, 청구일=${BILLING_DAY}일)`,
        processed: 0,
      });
    }

    // signed 계약이 있는 PT 유저만 대상 (terminated/draft 제외)
    const { data: ptUsers } = await serviceClient
      .from('pt_users')
      .select(`
        id,
        profile_id,
        first_billing_grace_until,
        contracts!inner(status)
      `)
      .eq('contracts.status', 'signed');

    if (!ptUsers || ptUsers.length === 0) {
      return NextResponse.json({ success: true, message: '대상 PT 유저 없음', processed: 0 });
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let overdueMarked = 0;
    let graceSkipped = 0;

    for (const ptUser of ptUsers) {
      // grace 기간 중이면 skip (락 마킹도 하지 않음)
      if (ptUser.first_billing_grace_until && todayDateStr < ptUser.first_billing_grace_until) {
        graceSkipped++;
        continue;
      }

      const result = await processPtUser(serviceClient, ptUser, todayDateStr);
      processed += result.processed;
      succeeded += result.succeeded;
      failed += result.failed;
      if (result.markedOverdue) overdueMarked++;
    }

    return NextResponse.json({
      success: true,
      processed,
      succeeded,
      failed,
      overdueMarked,
      graceSkipped,
    });
  } catch (err) {
    console.error('cron/auto-billing error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

async function processPtUser(
  serviceClient: ServiceClient,
  ptUser: { id: string; profile_id: string },
  todayDateStr: string,
): Promise<{ processed: number; succeeded: number; failed: number; markedOverdue: boolean }> {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let markedOverdue = false;

  // 활성 + primary 카드 1장 조회
  const { data: card } = await serviceClient
    .from('billing_cards')
    .select('*')
    .eq('pt_user_id', ptUser.id)
    .eq('is_active', true)
    .eq('is_primary', true)
    .maybeSingle();

  // 카드 없음 → overdue 마킹 후 종료
  if (!card) {
    const marked = await markOverdue(serviceClient, ptUser.id, todayDateStr);
    if (marked) {
      markedOverdue = true;
      await notifyMissingCard(serviceClient, ptUser.profile_id);
    }
    return { processed, succeeded, failed, markedOverdue };
  }

  // 미납 리포트 조회
  const { data: unpaidReports } = await serviceClient
    .from('monthly_reports')
    .select('*')
    .eq('pt_user_id', ptUser.id)
    .in('fee_payment_status', ['awaiting_payment', 'overdue'])
    .order('year_month', { ascending: true });

  if (!unpaidReports || unpaidReports.length === 0) {
    // Q3=엄격: 대상 월이 있는데 보고도 안 했으면 overdue 마킹
    // "대상 월 있음"의 기준은 paid 리포트가 하나라도 있는가(이전엔 보고했었음) OR
    // 해당 pt_user의 grace 만료 후 한 달 이상 지났는가.
    const { count: totalReportCount } = await serviceClient
      .from('monthly_reports')
      .select('id', { count: 'exact', head: true })
      .eq('pt_user_id', ptUser.id);

    const hasEverReported = (totalReportCount ?? 0) > 0;

    if (hasEverReported) {
      // 과거엔 보고했는데 이번 청구일에 미납 리포트 0건 = 모두 결제 완료 상태. 정상.
      await clearOverdue(serviceClient, ptUser.id);
    } else {
      // 한 번도 보고 안 함 + grace도 지남 → 엄격 처리 (락 마킹)
      const marked = await markOverdue(serviceClient, ptUser.id, todayDateStr);
      if (marked) {
        markedOverdue = true;
        await notifyMissingReports(serviceClient, ptUser.profile_id);
      }
    }
    return { processed, succeeded, failed, markedOverdue };
  }

  // 스케줄 한 번만 조회 (counter 갱신용)
  const { data: schedule } = await serviceClient
    .from('payment_schedules')
    .select('id, total_success_count, total_failed_count')
    .eq('pt_user_id', ptUser.id)
    .maybeSingle();

  let allSucceeded = true;

  for (const report of unpaidReports) {
    processed++;

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
    const orderId = generateOrderId(report.year_month, ptUser.id);
    const orderName = `메가로드 수수료 ${report.year_month} (자동)`;

    const { data: tx } = await serviceClient
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

      if (schedule?.id) {
        await serviceClient
          .from('payment_schedules')
          .update({
            total_success_count: (schedule.total_success_count || 0) + 1,
            last_charged_at: new Date().toISOString(),
          })
          .eq('id', schedule.id);
      }

      await completeSettlement(serviceClient, report);

      await createNotification(serviceClient, {
        userId: ptUser.profile_id,
        type: 'fee_payment',
        title: '자동결제 및 정산 완료',
        message: `${report.year_month} 수수료 ${totalAmount.toLocaleString()}원이 자동 결제되었습니다. 정산이 자동 확정되었습니다.`,
        link: '/my/report',
      });

      succeeded++;
    } catch (payErr) {
      allSucceeded = false;
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

      if (schedule?.id) {
        await serviceClient
          .from('payment_schedules')
          .update({
            total_failed_count: (schedule.total_failed_count || 0) + 1,
          })
          .eq('id', schedule.id);
      }

      await createNotification(serviceClient, {
        userId: ptUser.profile_id,
        type: 'fee_payment',
        title: '자동결제 실패',
        message: `${report.year_month} 수수료 자동결제가 실패했습니다. 사유: ${errObj.message || '알 수 없는 오류'}. 설정에서 카드를 확인해주세요.`,
        link: '/my/settings',
      });

      failed++;
    }
  }

  // 모든 리포트가 성공했으면 overdue 클리어, 하나라도 실패했으면 overdue 마킹
  if (allSucceeded && processed > 0) {
    await clearOverdue(serviceClient, ptUser.id);
  } else if (!allSucceeded) {
    const marked = await markOverdue(serviceClient, ptUser.id, todayDateStr);
    if (marked) markedOverdue = true;
  }

  return { processed, succeeded, failed, markedOverdue };
}

/**
 * payment_overdue_since가 비어있을 때만 오늘로 세팅.
 * 이미 연체 중이면 기존 날짜를 보존(락 단계 카운트가 리셋되지 않도록).
 * 새로 마킹했으면 true.
 */
async function markOverdue(
  serviceClient: ServiceClient,
  ptUserId: string,
  todayDateStr: string,
): Promise<boolean> {
  const { data } = await serviceClient
    .from('pt_users')
    .update({ payment_overdue_since: todayDateStr })
    .eq('id', ptUserId)
    .is('payment_overdue_since', null)
    .select('id');
  return !!data && data.length > 0;
}

async function clearOverdue(serviceClient: ServiceClient, ptUserId: string) {
  await serviceClient
    .from('pt_users')
    .update({ payment_overdue_since: null, payment_lock_level: 0 })
    .eq('id', ptUserId);
}

async function notifyMissingCard(serviceClient: ServiceClient, profileId: string) {
  await createNotification(serviceClient, {
    userId: profileId,
    type: 'fee_payment',
    title: '결제 카드 미등록',
    message: '청구일이 도래했지만 등록된 결제 카드가 없습니다. 단계적 서비스 제한이 시작됩니다. 즉시 카드를 등록해주세요.',
    link: '/my/settings',
  });
}

async function notifyMissingReports(serviceClient: ServiceClient, profileId: string) {
  await createNotification(serviceClient, {
    userId: profileId,
    type: 'fee_payment',
    title: '매출 보고 누락',
    message: '정산 대상 월인데 매출 보고가 한 번도 제출되지 않았습니다. 단계적 서비스 제한이 시작됩니다. 즉시 매출을 보고해주세요.',
    link: '/my/report',
  });
}
