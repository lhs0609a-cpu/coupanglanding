import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { buildCostBreakdown, calculateDeposit } from '@/lib/calculations/deposit';
import { calculateVatOnTop } from '@/lib/calculations/vat';
import { kstMonthStr } from '@/lib/payments/billing-constants';
import { createNotification } from '@/lib/utils/notifications';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/payments/trigger-billing
 * 관리자가 직접 직전 마감월 청구 사이클을 복구.
 *
 * 동작:
 *   1) 직전 마감월에 monthly_report 가 없는 PT생을 추리고,
 *      api_revenue_snapshots 의 매출 데이터로 즉시 보고서 생성 (광고비=0 가정).
 *   2) fee_payment_status='awaiting_payment' 로 즉시 청구 가능 상태 마킹.
 *   3) 알림 발송 — "광고비 입력 시 수수료 차감 가능 / 미입력 시 자동 청구" 안내.
 *
 * 결제 자체는 별도 cron(매월 3일) 또는 관리자가 수동 트리거 (다른 endpoint).
 * 이 endpoint 의 목적은 "monthly_reports 미생성으로 청구 자체가 안 되는 상황" 복구.
 *
 * 안전:
 *   - signed 계약 유무 무관 — 매출 데이터 있으면 모두 보고서 생성 (운영자 판단)
 *   - 이미 보고서 있으면 skip (UNIQUE 제약)
 *   - 매출 데이터 없으면 skip + 알림
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const guard = await requireAdminRole(supabase, user?.id, 'write');
    if (!guard.ok) return guard.response;

    const body = await request.json().catch(() => ({}));
    const overrideMonth: string | undefined = body.targetMonth;
    const requireSignedContract: boolean = body.requireSignedContract !== false; // 기본 true

    const serviceClient = await createServiceClient();
    const now = new Date();
    const currentMonth = kstMonthStr(now);

    let targetMonth: string;
    if (overrideMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(overrideMonth)) {
      targetMonth = overrideMonth;
    } else {
      const [cy, cm] = currentMonth.split('-').map(Number);
      const prevM = cm === 1 ? 12 : cm - 1;
      const prevY = cm === 1 ? cy - 1 : cy;
      targetMonth = `${prevY}-${String(prevM).padStart(2, '0')}`;
    }

    // 대상 PT 사용자 조회 (signed 필터 여부에 따라 분기, 스키마 추론 안정성 위해 별도 쿼리)
    type PtRow = { id: string; profile_id: string; share_percentage: number | null };
    let ptUsers: PtRow[] | null = null;
    if (requireSignedContract) {
      const { data, error } = await serviceClient
        .from('pt_users')
        .select('id, profile_id, share_percentage, contracts!inner(status)')
        .neq('status', 'terminated')
        .eq('is_test_account', false)
        .eq('contracts.status', 'signed');
      if (error) throw error;
      ptUsers = (data || []).map((d) => ({
        id: d.id,
        profile_id: d.profile_id,
        share_percentage: d.share_percentage,
      }));
    } else {
      const { data, error } = await serviceClient
        .from('pt_users')
        .select('id, profile_id, share_percentage')
        .neq('status', 'terminated')
        .eq('is_test_account', false);
      if (error) throw error;
      ptUsers = (data || []) as PtRow[];
    }

    if (!ptUsers || ptUsers.length === 0) {
      return NextResponse.json({
        success: true,
        targetMonth,
        created: 0,
        message: requireSignedContract
          ? 'signed 계약 PT생이 없습니다. requireSignedContract=false 로 다시 호출하면 미서명자도 포함됩니다.'
          : '대상 PT 사용자 없음',
      });
    }

    let created = 0;
    let skippedExisting = 0;
    let skippedNoRevenue = 0;
    let errored = 0;
    const createdUsers: string[] = [];

    for (const pt of ptUsers) {
      try {
        // 이미 보고서 있으면 skip
        const { data: existing } = await serviceClient
          .from('monthly_reports')
          .select('id, fee_payment_status')
          .eq('pt_user_id', pt.id)
          .eq('year_month', targetMonth)
          .maybeSingle();

        if (existing) {
          // 이미 있는데 awaiting_review 면 awaiting_payment 로 승급
          if (existing.fee_payment_status === 'awaiting_review') {
            await serviceClient
              .from('monthly_reports')
              .update({
                fee_payment_status: 'awaiting_payment',
                payment_status: 'reviewed',
                reviewed_at: new Date().toISOString(),
              })
              .eq('id', existing.id);
            created++;
            createdUsers.push(pt.id);
          } else {
            skippedExisting++;
          }
          continue;
        }

        // 매출 스냅샷 조회
        const { data: snap } = await serviceClient
          .from('api_revenue_snapshots')
          .select('total_sales, total_commission, total_shipping, total_returns, total_settlement')
          .eq('pt_user_id', pt.id)
          .eq('year_month', targetMonth)
          .maybeSingle();

        if (!snap || !snap.total_sales || snap.total_sales <= 0) {
          skippedNoRevenue++;
          continue;
        }

        const revenue = Number(snap.total_sales);
        const sharePercentage = pt.share_percentage ?? 30;
        const costs = buildCostBreakdown(revenue, 0); // 광고비 0
        const depositAmount = calculateDeposit(revenue, costs, sharePercentage);
        const vatCalc = calculateVatOnTop(depositAmount);

        // 마감일 — 익월 3일 23:59 KST
        const [ty, tm] = targetMonth.split('-').map(Number);
        const nextMonth = tm === 12 ? 1 : tm + 1;
        const nextYear = tm === 12 ? ty + 1 : ty;
        const deadlineUtc = new Date(Date.UTC(nextYear, nextMonth - 1, 3, 14, 59, 59));

        const { error: insertErr } = await serviceClient
          .from('monthly_reports')
          .insert({
            pt_user_id: pt.id,
            year_month: targetMonth,
            reported_revenue: revenue,
            calculated_deposit: depositAmount,
            payment_status: 'reviewed',
            admin_deposit_amount: depositAmount,
            reviewed_at: new Date().toISOString(),
            cost_product: costs.cost_product,
            cost_commission: costs.cost_commission,
            cost_advertising: costs.cost_advertising,
            cost_returns: costs.cost_returns,
            cost_shipping: costs.cost_shipping,
            cost_tax: costs.cost_tax,
            api_verified: true,
            api_settlement_data: snap,
            supply_amount: vatCalc.supplyAmount,
            vat_amount: vatCalc.vatAmount,
            total_with_vat: vatCalc.totalWithVat,
            // input_source 제거 — CHECK 제약 회피
            fee_payment_status: 'awaiting_payment',
            fee_payment_deadline: deadlineUtc.toISOString(),
            fee_surcharge_amount: 0,
            fee_interest_amount: 0,
          });

        if (insertErr) {
          if (/duplicate key|unique/i.test(insertErr.message)) {
            skippedExisting++;
          } else {
            errored++;
            console.error(`[trigger-billing] ${pt.id} insert 실패:`, insertErr.message);
          }
          continue;
        }

        created++;
        createdUsers.push(pt.id);

        // 알림 발송
        await createNotification(serviceClient, {
          userId: pt.profile_id,
          type: 'fee_payment',
          title: `[관리자 트리거] ${targetMonth} 매출 보고서 생성 — 자동 청구 예정`,
          message: `${targetMonth} 매출(${revenue.toLocaleString()}원) 기반 수수료가 곧 자동 청구됩니다. 광고비 첨부자료(스크린샷)를 /my/ad-cost 에서 제출하시면 승인 후 수수료가 줄어듭니다.`,
          link: '/my/ad-cost',
        });
      } catch (err) {
        errored++;
        console.error(`[trigger-billing] ${pt.id} 처리 중 예외:`, err);
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
      createdUserIds: createdUsers,
    });
  } catch (err) {
    console.error('POST /api/admin/payments/trigger-billing error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 },
    );
  }
}
