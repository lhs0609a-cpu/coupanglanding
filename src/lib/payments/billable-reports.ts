/**
 * net-driven rolling 청구 리포트 생성 — 단일 출처.
 *
 * cron(monthly-report-auto-create) · 관리자 즉시결제(charge-now/execute-billing-now/trigger-billing)
 * 이 모두 이 함수를 호출해 "청구 안 된 과거월 중 정산 net>0 인 달"의 monthly_reports 를 생성한다.
 * 생성만 담당하고 실제 카드 청구는 호출부(auto-billing / charge 루프)가 awaiting_payment 리포트를 처리.
 *
 * 원칙:
 *  - 청구 근거 = 정산 확정 net(api_revenue_snapshots.total_sales) 만. 주문액은 절대 미사용(과다청구 방지).
 *  - net<=0(정산 미확정/무매출) 달은 리포트 생성 안 함 → 다음 사이클에 net 확정되면 자동으로 주워짐.
 *  - 등록월 유예는 후보월 시작이 등록 다음 달이라 자동 반영.
 *  - (pt_user_id, year_month) UNIQUE 라 중복 생성 시 안전하게 skip.
 */
import { buildCostBreakdown, calculateDeposit } from '@/lib/calculations/deposit';
import { calculateVatOnTop } from '@/lib/calculations/vat';
import { getBillableCandidateMonths, getCurrentCycleDeadlineISO } from './billing-cycle';
import type { createServiceClient } from '@/lib/supabase/server';

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export interface PtUserForBilling {
  id: string;
  created_at: string;
  share_percentage?: number | null;
}

export interface EnsureReportsResult {
  created: string[];         // 새로 생성된 청구 리포트 year_month
  skippedExisting: string[]; // 이미 리포트 있던 달
  skippedNoNet: string[];    // net<=0(미확정/무매출) 또는 청구액 0 → 청구 대상 아님
}

export async function ensureBillableReports(
  serviceClient: ServiceClient,
  ptUser: PtUserForBilling,
  now: Date = new Date(),
): Promise<EnsureReportsResult> {
  const result: EnsureReportsResult = { created: [], skippedExisting: [], skippedNoNet: [] };
  if (!ptUser.created_at) return result;

  const candidates = getBillableCandidateMonths(ptUser.created_at, now);
  if (candidates.length === 0) return result;

  const sharePct = ptUser.share_percentage ?? 30;
  const deadlineIso = getCurrentCycleDeadlineISO(now);
  const nowIso = now.toISOString();

  for (const ym of candidates) {
    // 이미 리포트 있으면 skip (paid/awaiting/overdue 등 모든 상태 — 재생성/중복청구 방지)
    const { data: existing } = await serviceClient
      .from('monthly_reports')
      .select('id')
      .eq('pt_user_id', ptUser.id)
      .eq('year_month', ym)
      .maybeSingle();
    if (existing) { result.skippedExisting.push(ym); continue; }

    // 정산 net 만 청구 근거로 사용
    const { data: snap } = await serviceClient
      .from('api_revenue_snapshots')
      .select('total_sales, total_commission, total_shipping, total_returns, total_settlement, total_sales_orders')
      .eq('pt_user_id', ptUser.id)
      .eq('year_month', ym)
      .maybeSingle();

    const net = snap ? Number(snap.total_sales) || 0 : 0;
    if (net <= 0) { result.skippedNoNet.push(ym); continue; }

    const costs = buildCostBreakdown(net, 0); // 광고비 0 가정(PT생이 후속 입력 시 재계산)
    const depositAmount = calculateDeposit(net, costs, sharePct);
    const vatCalc = calculateVatOnTop(depositAmount);
    const nothingToBill = vatCalc.totalWithVat <= 0; // 수수료율 0%/순이익≤0 → 청구액 0

    const { error: insErr } = await serviceClient
      .from('monthly_reports')
      .insert({
        pt_user_id: ptUser.id,
        year_month: ym,
        reported_revenue: net,
        calculated_deposit: depositAmount,
        payment_status: 'reviewed',
        admin_deposit_amount: depositAmount,
        reviewed_at: nowIso,
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
        // input_source 는 페이로드에서 제외 — DB default 사용(CHECK 제약 회피)
        // 청구액 0이면 즉시 paid 로 종결(0원인데 락/연체 걸리는 버그 차단)
        fee_payment_status: nothingToBill ? 'paid' : 'awaiting_payment',
        fee_payment_deadline: nothingToBill ? null : deadlineIso,
        fee_paid_at: nothingToBill ? nowIso : null,
        fee_surcharge_amount: 0,
        fee_interest_amount: 0,
      });

    if (insErr) {
      // (pt_user_id, year_month) UNIQUE 위반은 race → skip
      if (/duplicate key|unique/i.test(insErr.message)) {
        result.skippedExisting.push(ym);
      } else {
        throw insErr; // 그 외 오류는 호출부가 로깅/집계
      }
      continue;
    }

    if (nothingToBill) result.skippedNoNet.push(ym);
    else result.created.push(ym);
  }

  return result;
}
