/**
 * PT 사용자 입금액 계산
 * @param reportedRevenue 보고된 매출 (원)
 * @param sharePercentage 수수료율 (기본 30%)
 * @returns 입금해야 할 금액
 */
export function calculateDeposit(reportedRevenue: number, sharePercentage: number = 30): number {
  return Math.floor(reportedRevenue * sharePercentage / 100);
}
