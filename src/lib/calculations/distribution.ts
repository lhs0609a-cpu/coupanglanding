import type { Partner, RevenueEntry, ExpenseEntry, PartnerDistribution } from '@/lib/supabase/types';
import { estimateAnnualTax } from './tax';

interface DistributionInput {
  partners: Partner[];
  revenues: RevenueEntry[];
  expenses: ExpenseEntry[];
}

interface DistributionResult {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  distributions: PartnerDistribution[];
}

/**
 * 수익 분배 계산
 *
 * 순이익 = 총수익 - 총비용
 * 파트너X 수익배분 = 순이익 × (비율X / 비율합계)
 * 파트너X 비용정산 = 실제지불액 - (총비용 × 비율X / 비율합계)
 * 파트너X 최종금액 = 수익배분 + 비용정산
 */
export function calculateDistribution(input: DistributionInput): DistributionResult {
  const { partners, revenues, expenses } = input;

  const totalRevenue = revenues.reduce((sum, r) => sum + r.amount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalRevenue - totalExpenses;

  const totalRatio = partners.reduce((sum, p) => sum + p.share_ratio, 0);

  // 파트너별 실제 지불한 비용 합계
  const expenseByPartner = new Map<string, number>();
  for (const expense of expenses) {
    if (expense.paid_by_partner_id) {
      const current = expenseByPartner.get(expense.paid_by_partner_id) || 0;
      expenseByPartner.set(expense.paid_by_partner_id, current + expense.amount);
    }
  }

  const distributions: PartnerDistribution[] = partners.map((partner) => {
    const ratioFraction = partner.share_ratio / totalRatio;

    // 수익 배분
    const revenueShare = Math.floor(netProfit * ratioFraction);

    // 비용 정산: 실제 지불 - 의무분
    const expensePaid = expenseByPartner.get(partner.id) || 0;
    const expenseObligation = Math.floor(totalExpenses * ratioFraction);
    const expenseSettlement = expensePaid - expenseObligation;

    // 최종 금액
    const finalAmount = revenueShare + expenseSettlement;

    // 연간 예상 세금
    const { totalTax } = estimateAnnualTax(finalAmount);

    return {
      partner_id: partner.id,
      partner_name: partner.display_name,
      share_ratio: partner.share_ratio,
      revenue_share: revenueShare,
      expense_paid: expensePaid,
      expense_obligation: expenseObligation,
      expense_settlement: expenseSettlement,
      final_amount: finalAmount,
      estimated_tax: totalTax,
      after_tax: finalAmount * 12 - totalTax, // 연간 세후
    };
  });

  return { totalRevenue, totalExpenses, netProfit, distributions };
}
