/**
 * Competition Score Utility
 * ItemScout-style competition analysis based on product_count / search_count ratio
 */

export type CompetitionLevel = 'very_good' | 'good' | 'normal' | 'bad' | 'very_bad';

export interface CompetitionResult {
  ratio: number;
  level: CompetitionLevel;
  label: string;
  bgColor: string;
  textColor: string;
}

const LEVELS: { max: number; level: CompetitionLevel; label: string; bgColor: string; textColor: string }[] = [
  { max: 3,    level: 'very_good', label: '아주좋음', bgColor: 'bg-emerald-100', textColor: 'text-emerald-700' },
  { max: 7,    level: 'good',      label: '좋음',     bgColor: 'bg-teal-100',    textColor: 'text-teal-700' },
  { max: 15,   level: 'normal',    label: '보통',     bgColor: 'bg-yellow-100',  textColor: 'text-yellow-700' },
  { max: 100,  level: 'bad',       label: '나쁨',     bgColor: 'bg-orange-100',  textColor: 'text-orange-700' },
  { max: Infinity, level: 'very_bad', label: '아주나쁨', bgColor: 'bg-red-100', textColor: 'text-red-700' },
];

/**
 * Calculate competition ratio and level from product count and search count
 */
export function getCompetitionScore(productCount: number, searchCount: number): CompetitionResult {
  if (searchCount <= 0) {
    return { ratio: 0, level: 'normal', label: '보통', bgColor: 'bg-yellow-100', textColor: 'text-yellow-700' };
  }

  const ratio = Math.round((productCount / searchCount) * 100) / 100;

  for (const l of LEVELS) {
    if (ratio < l.max) {
      return { ratio, level: l.level, label: l.label, bgColor: l.bgColor, textColor: l.textColor };
    }
  }

  const last = LEVELS[LEVELS.length - 1];
  return { ratio, level: last.level, label: last.label, bgColor: last.bgColor, textColor: last.textColor };
}

/**
 * Format large numbers for display (e.g., 1,234,567 → 123.4만)
 */
export function formatProductCount(count: number): string {
  if (count >= 10000000) {
    return `${(count / 10000000).toFixed(0)}천만`;
  }
  if (count >= 10000) {
    const man = count / 10000;
    return man >= 100 ? `${Math.round(man).toLocaleString()}만` : `${man.toFixed(1)}만`;
  }
  return count.toLocaleString();
}
