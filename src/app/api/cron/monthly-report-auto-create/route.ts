import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { kstDay, kstMonthStr } from '@/lib/payments/billing-constants';
import { buildCostBreakdown, calculateDeposit, calculateNetProfit, totalCosts } from '@/lib/calculations/deposit';
import { calculateVatOnTop } from '@/lib/calculations/vat';
import { createNotification } from '@/lib/utils/notifications';

/**
 * GET /api/cron/monthly-report-auto-create
 * vercel.json 스케줄: "0 18 * * *" 매일 UTC 18:00 = KST 03:00.
 * KST 기준 오늘이 1일일 때만 실제 작업 수행, 그 외는 no-op.
 *
 * 동작:
 *  1) 모든 활성 PT 사용자 순회 (signed 계약, is_test_account=false)
 *  2) 직전 달(KST yearMonth - 1) 의 monthly_reports row 가 이미 있으면 skip
 *  3) api_revenue_snapshots 에 그 달 데이터가 있으면 row 자동 생성:
 *     - reported_revenue = total_sales
 *     - costs = 기본 cost rate (사용자가 후속 수정 가능)
 *     - fee_payment_status = 'awaiting_review' (사용자 확정 전)
 *     - fee_payment_deadline = 익월 3일
 *     - input_source = 'api_auto'
 *  4) 데이터 없으면 row 생성 안 함 + 별도 알림 (사용자 직접 보고 안내)
 *  5) 사용자에게 "검토 + 확정" 알림 발송
 *
 * 안전:
 *  - monthly_reports (pt_user_id, year_month) UNIQUE 가 있어 중복 insert 시 skip
 *  - awaiting_review 상태는 auto-billing cron 청구 대상 아님 (사용자 확정 후에만 청구)
 */

function previousYearMonth(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth(); // 0-indexed, 직전 달은 m-1
  // m=0 (Jan) 이면 직전은 (y-1, 12)
  const prevMonth = m === 0 ? 12 : m;
  const prevYear = m === 0 ? y - 1 : y;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

function feePaymentDeadlineISO(targetYearMonth: string): string {
  const [y, m] = targetYearMonth.split('-').map(Number);
  // targetYearMonth='2026-04' → 익월(2026-05) 3일 23:59:59 KST
  // KST → UTC 변환: KST 23:59:59 = UTC 14:59:59
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const utc = new Date(Date.UTC(nextYear, nextMonth - 1, 3, 14, 59, 59));
  return utc.toISOString();
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = await createServiceClient();
  const now = new Date();
  const todayDay = kstDay(now);
  const currentMonth = kstMonthStr(now);
  const targetMonth = previousYearMonth(now);

  // KST 기준 매월 1일에만 실행
  if (todayDay !== 1) {
    return NextResponse.json({
      success: true,
      message: `오늘은 자동 생성일이 아님 (KST ${todayDay}일, 실행일=1일)`,
      processed: 0,
      currentMonth,
    });
  }

  // 활성 PT 사용자 (signed 계약, is_test_account=false)
  const { data: ptUsers } = await serviceClient
    .from('pt_users')
    .select(`id, profile_id, contracts!inner(status)`)
    .eq('contracts.status', 'signed')
    .eq('is_test_account', false);

  if (!ptUsers || ptUsers.length === 0) {
    return NextResponse.json({ success: true, message: '대상 PT 유저 없음', processed: 0, targetMonth });
  }

  let created = 0;
  let skippedExisting = 0;
  let skippedNoRevenue = 0;
  let errored = 0;

  for (const ptUser of ptUsers) {
    try {
      // 직전 달 보고서 이미 있으면 skip
      const { data: existing } = await serviceClient
        .from('monthly_reports')
        .select('id')
        .eq('pt_user_id', ptUser.id)
        .eq('year_month', targetMonth)
        .maybeSingle();
      if (existing) {
        skippedExisting++;
        continue;
      }

      // 쿠팡 API 자동 sync 데이터 조회
      const { data: snapshot } = await serviceClient
        .from('api_revenue_snapshots')
        .select('total_sales, total_commission, total_shipping, total_returns, total_settlement')
        .eq('pt_user_id', ptUser.id)
        .eq('year_month', targetMonth)
        .maybeSingle();

      if (!snapshot || !snapshot.total_sales || snapshot.total_sales <= 0) {
        // 매출 데이터 없음 — 사용자 직접 보고 안내 알림
        skippedNoRevenue++;
        await createNotification(serviceClient, {
          userId: ptUser.profile_id,
          type: 'fee_payment',
          title: `${targetMonth} 매출 데이터 없음 — 직접 보고 필요`,
          message: `${targetMonth} 쿠팡 API 매출 데이터가 비어있어 자동 보고서를 생성하지 못했습니다. /my/report 에서 직접 보고해주세요.`,
          link: '/my/report',
        });
        continue;
      }

      // 비용 계산 — 기본 rate (사용자가 후속 수정 가능)
      const revenue = Number(snapshot.total_sales);
      const costs = buildCostBreakdown(revenue, 0); // 광고비는 사용자가 추가 입력
      const netProfit = calculateNetProfit(revenue, costs);
      const depositAmount = calculateDeposit(revenue, costs, 30); // 기본 30%
      const vatCalc = calculateVatOnTop(depositAmount);

      // monthly_reports row 자동 생성
      const { error: insertErr } = await serviceClient
        .from('monthly_reports')
        .insert({
          pt_user_id: ptUser.id,
          year_month: targetMonth,
          reported_revenue: revenue,
          calculated_deposit: depositAmount,
          payment_status: 'submitted',
          cost_product: costs.cost_product,
          cost_commission: costs.cost_commission,
          cost_advertising: costs.cost_advertising,
          cost_returns: costs.cost_returns,
          cost_shipping: costs.cost_shipping,
          cost_tax: costs.cost_tax,
          api_verified: true,
          api_settlement_data: snapshot,
          supply_amount: vatCalc.supplyAmount,
          vat_amount: vatCalc.vatAmount,
          total_with_vat: vatCalc.totalWithVat,
          input_source: 'api_auto',
          // 핵심: 사용자 확정 전이라 청구 대상 아님
          fee_payment_status: 'awaiting_review',
          fee_payment_deadline: feePaymentDeadlineISO(targetMonth),
          fee_surcharge_amount: 0,
          fee_interest_amount: 0,
        });

      if (insertErr) {
        // (pt_user_id, year_month) UNIQUE 위반은 race로 가능 — skip 처리
        if (/duplicate key|unique/i.test(insertErr.message)) {
          skippedExisting++;
        } else {
          errored++;
          console.error(`[monthly-report-auto-create] ${ptUser.id} insert 실패:`, insertErr.message);
        }
        continue;
      }

      created++;

      // 사용자에게 검토 알림
      await createNotification(serviceClient, {
        userId: ptUser.profile_id,
        type: 'fee_payment',
        title: `${targetMonth} 매출 보고서 자동 생성 — 검토 필요`,
        message: `${targetMonth} 매출(${revenue.toLocaleString()}원) 기반 보고서가 자동 생성되었습니다. /my/report 에서 비용 항목을 검토하고 "확정" 버튼을 눌러주세요. 매월 3일까지 미확정 시 단계적 서비스 락이 시작됩니다.`,
        link: '/my/report',
      });
    } catch (err) {
      errored++;
      console.error(`[monthly-report-auto-create] ${ptUser.id} 처리 중 예외:`, err);
    }
  }

  return NextResponse.json({
    success: true,
    targetMonth,
    totalUsers: ptUsers.length,
    created,
    skippedExisting,
    skippedNoRevenue,
    errored,
  });
}
