import type { CostKey } from '@/lib/utils/constants';
import { DEFAULT_COST_RATES } from '@/lib/utils/constants';
import { calculateVatOnTop } from '@/lib/calculations/vat';
import type { VatCalculation } from '@/lib/calculations/vat';
import type { CostRateSettings } from '@/lib/utils/cost-settings';

export type CostBreakdown = Record<CostKey, number>;

export type CustomRates = Partial<CostRateSettings>;

export const EMPTY_COSTS: CostBreakdown = {
  cost_product: 0,
  cost_commission: 0,
  cost_advertising: 0,
  cost_returns: 0,
  cost_shipping: 0,
  cost_tax: 0,
};

function getRate(key: string, customRates?: CustomRates): number {
  if (customRates && key in customRates) {
    return (customRates as Record<string, number>)[key];
  }
  return DEFAULT_COST_RATES[key]?.rate ?? 0;
}

/** 매출 기반 5개 자동 비용 계산 */
export function calculateAutoCosts(revenue: number, customRates?: CustomRates): Omit<CostBreakdown, 'cost_advertising'> {
  return {
    cost_product: Math.round(revenue * getRate('cost_product', customRates)),
    cost_commission: Math.round(revenue * getRate('cost_commission', customRates)),
    cost_returns: Math.round(revenue * getRate('cost_returns', customRates)),
    cost_shipping: Math.round(revenue * getRate('cost_shipping', customRates)),
    cost_tax: Math.round(revenue * getRate('cost_tax', customRates)),
  };
}

/** 전체 CostBreakdown 생성 (자동 5개 + 광고비 수동) */
export function buildCostBreakdown(revenue: number, advertisingCost: number, customRates?: CustomRates): CostBreakdown {
  const autoCosts = calculateAutoCosts(revenue, customRates);
  return {
    ...autoCosts,
    cost_advertising: advertisingCost,
  };
}

/** 총 비용 합계 */
export function totalCosts(costs: CostBreakdown): number {
  return Object.values(costs).reduce((sum, v) => sum + v, 0);
}

/** 순수익 = 매출 - 비용합계 */
export function calculateNetProfit(revenue: number, costs: CostBreakdown): number {
  return revenue - totalCosts(costs);
}

/** 리포트에서 CostBreakdown 추출 */
export function getReportCosts(report: {
  cost_product?: number;
  cost_commission?: number;
  cost_advertising?: number;
  cost_returns?: number;
  cost_shipping?: number;
  cost_tax?: number;
}): CostBreakdown {
  return {
    cost_product: report.cost_product || 0,
    cost_commission: report.cost_commission || 0,
    cost_advertising: report.cost_advertising || 0,
    cost_returns: report.cost_returns || 0,
    cost_shipping: report.cost_shipping || 0,
    cost_tax: report.cost_tax || 0,
  };
}

/**
 * 송금액 = 순수익 × share%
 * 순수익 ≤ 0이면 송금액 0
 */
export function calculateDeposit(
  revenue: number,
  costs: CostBreakdown,
  sharePercentage: number = 30,
): number {
  const netProfit = calculateNetProfit(revenue, costs);
  if (netProfit <= 0) return 0;
  return Math.floor(netProfit * sharePercentage / 100);
}

/**
 * 송금액(공급가액) + VAT 계산
 * @returns VatCalculation (supplyAmount, vatAmount, totalWithVat)
 */
export function calculateDepositWithVat(
  revenue: number,
  costs: CostBreakdown,
  sharePercentage: number = 30,
): VatCalculation {
  const deposit = calculateDeposit(revenue, costs, sharePercentage);
  return calculateVatOnTop(deposit);
}
