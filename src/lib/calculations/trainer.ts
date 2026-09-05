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

// ─── 추천 커미션 정책 상수 ───────────────────────────────
// 지급 기준은 순이익 × bonus_percentage(기본 5%)로 유지하고,
// "언제까지"만 아래 정책으로 제한한다. (월 상한은 두지 않음 — 번 만큼 지급)

/** 추천 커미션 지급 기간(개월). 첫 보너스가 나간 달부터 이 개월 수까지만 지급. */
export const TRAINER_BONUS_MONTHS = 12;

/**
 * 'YYYY-MM' 에 개월 수를 더한 'YYYY-MM'.
 * Date 객체의 말일(31일→2월) 롤오버 문제를 피하려고 순수 정수 연산으로 계산.
 */
export function addMonths(yearMonth: string, months: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return yearMonth;
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** 첫 지급 월 기준 마지막 지급 가능 월(포함). 12개월이면 first+11. */
export function bonusUntilYearMonth(firstYearMonth: string): string {
  return addMonths(firstYearMonth, TRAINER_BONUS_MONTHS - 1);
}

/**
 * 지급 기간 만료 여부.
 * untilYearMonth 가 없으면(=아직 첫 지급 전) 만료 아님.
 * 'YYYY-MM' 은 제로패딩이라 문자열 비교로 대소 판정이 정확하다.
 */
export function isBonusExpired(reportYearMonth: string, untilYearMonth: string | null | undefined): boolean {
  if (!untilYearMonth) return false;
  return reportYearMonth > untilYearMonth;
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
