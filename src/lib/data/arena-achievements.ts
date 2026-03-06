export interface Achievement {
  key: string;
  category: 'listing' | 'revenue' | 'streak' | 'milestone';
  title: string;
  description: string;
  emoji: string;
  condition: string;  // Human-readable condition
  isSecret: boolean;  // Hidden until unlocked
}

export const ACHIEVEMENT_CATEGORIES = [
  { value: 'listing', label: '상품 등록', color: 'bg-blue-100 text-blue-700', emoji: '📦' },
  { value: 'revenue', label: '매출', color: 'bg-green-100 text-green-700', emoji: '💰' },
  { value: 'streak', label: '연속 활동', color: 'bg-orange-100 text-orange-700', emoji: '🔥' },
  { value: 'milestone', label: '마일스톤', color: 'bg-purple-100 text-purple-700', emoji: '🏅' },
] as const;

export const ACHIEVEMENTS: Achievement[] = [
  // 등록 카테고리 (6개)
  {
    key: 'first_listing',
    category: 'listing',
    title: '첫 발걸음',
    description: '첫 상품을 등록했습니다',
    emoji: '👶',
    condition: '상품 1개 등록',
    isSecret: false,
  },
  {
    key: 'listings_10',
    category: 'listing',
    title: '본격 셀러',
    description: '상품 10개를 등록했습니다',
    emoji: '📦',
    condition: '누적 상품 10개 등록',
    isSecret: false,
  },
  {
    key: 'listings_50',
    category: 'listing',
    title: '상품 컬렉터',
    description: '상품 50개를 등록했습니다',
    emoji: '🗃️',
    condition: '누적 상품 50개 등록',
    isSecret: false,
  },
  {
    key: 'listings_100',
    category: 'listing',
    title: '등록의 달인',
    description: '상품 100개를 등록했습니다',
    emoji: '🏭',
    condition: '누적 상품 100개 등록',
    isSecret: false,
  },
  {
    key: 'listings_500',
    category: 'listing',
    title: '상품 제국',
    description: '상품 500개를 등록했습니다',
    emoji: '🏰',
    condition: '누적 상품 500개 등록',
    isSecret: false,
  },
  {
    key: 'daily_10',
    category: 'listing',
    title: '오늘의 등록왕',
    description: '하루에 10개 이상 상품을 등록했습니다',
    emoji: '⚡',
    condition: '하루 10개 이상 등록',
    isSecret: false,
  },
  // 매출 카테고리 (4개)
  {
    key: 'first_revenue',
    category: 'revenue',
    title: '첫 매출',
    description: '첫 매출이 발생했습니다',
    emoji: '💵',
    condition: '매출 발생',
    isSecret: false,
  },
  {
    key: 'revenue_1m',
    category: 'revenue',
    title: '100만 셀러',
    description: '월 매출 100만원을 돌파했습니다',
    emoji: '💰',
    condition: '월 매출 100만원 달성',
    isSecret: false,
  },
  {
    key: 'revenue_5m',
    category: 'revenue',
    title: '500만 셀러',
    description: '월 매출 500만원을 돌파했습니다',
    emoji: '💎',
    condition: '월 매출 500만원 달성',
    isSecret: false,
  },
  {
    key: 'revenue_10m',
    category: 'revenue',
    title: '천만 셀러',
    description: '월 매출 1,000만원을 돌파했습니다',
    emoji: '👑',
    condition: '월 매출 1,000만원 달성',
    isSecret: false,
  },
  // 연속 활동 카테고리 (4개)
  {
    key: 'streak_3',
    category: 'streak',
    title: '시작이 반',
    description: '3일 연속 활동했습니다',
    emoji: '🔥',
    condition: '3일 연속 활동',
    isSecret: false,
  },
  {
    key: 'streak_7',
    category: 'streak',
    title: '일주일 전사',
    description: '7일 연속 활동했습니다',
    emoji: '🔥',
    condition: '7일 연속 활동',
    isSecret: false,
  },
  {
    key: 'streak_14',
    category: 'streak',
    title: '2주 챔피언',
    description: '14일 연속 활동했습니다',
    emoji: '💪',
    condition: '14일 연속 활동',
    isSecret: false,
  },
  {
    key: 'streak_30',
    category: 'streak',
    title: '한 달의 기적',
    description: '30일 연속 활동했습니다',
    emoji: '🏆',
    condition: '30일 연속 활동',
    isSecret: false,
  },
  // 마일스톤 카테고리 (2개, secret)
  {
    key: 'weekly_top3',
    category: 'milestone',
    title: '주간 TOP 3',
    description: '주간 랭킹 TOP 3에 진입했습니다',
    emoji: '🥇',
    condition: '주간 랭킹 3위 이내',
    isSecret: true,
  },
  {
    key: 'level_5',
    category: 'milestone',
    title: '프로의 영역',
    description: '아레나 레벨 5를 달성했습니다',
    emoji: '💎',
    condition: '레벨 5 달성',
    isSecret: true,
  },
];

/** 키로 업적 찾기 */
export function getAchievement(key: string): Achievement | undefined {
  return ACHIEVEMENTS.find(a => a.key === key);
}
