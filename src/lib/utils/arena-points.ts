// 포인트 계산 규칙
export const LISTING_POINTS = {
  perListing: 5,
  bonus3: 10,   // 하루 3개 이상 보너스
  bonus5: 20,   // 하루 5개 이상 보너스
  bonus10: 50,  // 하루 10개 이상 보너스
};

export const REVENUE_POINTS = {
  per100k: 10,  // 매출 10만원당
};

export const STREAK_POINTS = {
  days3: 15,
  days7: 50,
  days14: 100,
  days30: 300,
};

// 레벨 시스템
export interface ArenaLevel {
  level: number;
  minPoints: number;
  label: string;
  emoji: string;
  color: string;
}

export const ARENA_LEVELS: ArenaLevel[] = [
  { level: 1, minPoints: 0, label: '루키 셀러', emoji: '🌱', color: 'bg-green-100 text-green-700' },
  { level: 2, minPoints: 100, label: '도전 셀러', emoji: '🌿', color: 'bg-emerald-100 text-emerald-700' },
  { level: 3, minPoints: 300, label: '성장 셀러', emoji: '🌳', color: 'bg-teal-100 text-teal-700' },
  { level: 4, minPoints: 600, label: '실력 셀러', emoji: '⭐', color: 'bg-yellow-100 text-yellow-700' },
  { level: 5, minPoints: 1000, label: '프로 셀러', emoji: '💎', color: 'bg-blue-100 text-blue-700' },
  { level: 6, minPoints: 1500, label: '마스터 셀러', emoji: '👑', color: 'bg-purple-100 text-purple-700' },
  { level: 7, minPoints: 2500, label: '레전드 셀러', emoji: '🏆', color: 'bg-red-100 text-red-700' },
];

/** 일일 활동에 대한 포인트 계산 */
export function calculateDailyPoints(listingsCount: number, revenueAmount: number): {
  points_listings: number;
  points_revenue: number;
  points_total: number;
  breakdown: string[];
} {
  let points_listings = 0;
  const breakdown: string[] = [];

  // 상품 등록 포인트
  if (listingsCount > 0) {
    const base = listingsCount * LISTING_POINTS.perListing;
    points_listings += base;
    breakdown.push(`상품 등록 ${listingsCount}개: +${base}P`);

    if (listingsCount >= 10) {
      points_listings += LISTING_POINTS.bonus10;
      breakdown.push(`10개 이상 보너스: +${LISTING_POINTS.bonus10}P`);
    } else if (listingsCount >= 5) {
      points_listings += LISTING_POINTS.bonus5;
      breakdown.push(`5개 이상 보너스: +${LISTING_POINTS.bonus5}P`);
    } else if (listingsCount >= 3) {
      points_listings += LISTING_POINTS.bonus3;
      breakdown.push(`3개 이상 보너스: +${LISTING_POINTS.bonus3}P`);
    }
  }

  // 매출 포인트
  const points_revenue = Math.floor(revenueAmount / 100000) * REVENUE_POINTS.per100k;
  if (points_revenue > 0) {
    breakdown.push(`매출 ${(revenueAmount / 10000).toFixed(0)}만원: +${points_revenue}P`);
  }

  return {
    points_listings,
    points_revenue,
    points_total: points_listings + points_revenue,
    breakdown,
  };
}

/** 연속 활동 보너스 포인트 계산 */
export function calculateStreakBonus(streakDays: number): { bonus: number; milestone: string | null } {
  if (streakDays >= 30) return { bonus: STREAK_POINTS.days30, milestone: '30일 연속 활동!' };
  if (streakDays >= 14) return { bonus: STREAK_POINTS.days14, milestone: '14일 연속 활동!' };
  if (streakDays >= 7) return { bonus: STREAK_POINTS.days7, milestone: '7일 연속 활동!' };
  if (streakDays >= 3) return { bonus: STREAK_POINTS.days3, milestone: '3일 연속 활동!' };
  return { bonus: 0, milestone: null };
}

/** 포인트에 따른 현재 레벨 계산 */
export function getArenaLevel(totalPoints: number): ArenaLevel {
  for (let i = ARENA_LEVELS.length - 1; i >= 0; i--) {
    if (totalPoints >= ARENA_LEVELS[i].minPoints) {
      return ARENA_LEVELS[i];
    }
  }
  return ARENA_LEVELS[0];
}

/** 다음 레벨까지 진행률 */
export function getLevelProgress(totalPoints: number): { current: ArenaLevel; next: ArenaLevel | null; progress: number; pointsNeeded: number } {
  const current = getArenaLevel(totalPoints);
  const nextIndex = ARENA_LEVELS.findIndex(l => l.level === current.level) + 1;
  const next = nextIndex < ARENA_LEVELS.length ? ARENA_LEVELS[nextIndex] : null;

  if (!next) return { current, next: null, progress: 100, pointsNeeded: 0 };

  const range = next.minPoints - current.minPoints;
  const progress = Math.min(100, Math.round(((totalPoints - current.minPoints) / range) * 100));
  const pointsNeeded = next.minPoints - totalPoints;

  return { current, next, progress, pointsNeeded };
}
