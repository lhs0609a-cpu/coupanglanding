import { calculateNetProfit } from './deposit';
import type { CostBreakdown } from './deposit';

/**
 * 트레이너 보너스 계산
 * 순이익 × bonusPercentage%
 * 순이익이 0 이하이면 보너스 0
 */
export function calculateTrainerBonus(
  revenue: number,
  costs: CostBreakdown,
  bonusPercentage: number = 5,
): { netProfit: number; bonusAmount: number } {
  const netProfit = calculateNetProfit(revenue, costs);
  if (netProfit <= 0) {
    return { netProfit, bonusAmount: 0 };
  }
  const bonusAmount = Math.floor(netProfit * bonusPercentage / 100);
  return { netProfit, bonusAmount };
}

/**
 * 추천 코드 생성: TR-XXXXXX (대문자 영숫자 6자리)
 */
export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'TR-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
