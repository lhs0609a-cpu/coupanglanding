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

/**
 * Calculate CTR (Click-Through Rate) from clicks and searches
 */
export function calculateCTR(clicks: number, search: number): number {
  if (search <= 0) return 0;
  return Math.round((clicks / search) * 10000) / 100; // e.g., 3.45%
}

/**
 * Shopping conversion: supply/demand judgment based on product count vs search count
 */
export type ConversionLevel = '공급부족' | '적정' | '공급과잉';

export interface ConversionResult {
  level: ConversionLevel;
  label: string;
  color: string;
  bgColor: string;
  ratio: number;
}

export function calculateShoppingConversion(productCount: number, search: number): ConversionResult {
  if (search <= 0) {
    return { level: '적정', label: '적정', color: 'text-yellow-700', bgColor: 'bg-yellow-100', ratio: 0 };
  }
  const ratio = productCount / search;

  if (ratio < 1) {
    return { level: '공급부족', label: '공급부족 (블루오션)', color: 'text-emerald-700', bgColor: 'bg-emerald-100', ratio: Math.round(ratio * 100) / 100 };
  }
  if (ratio < 10) {
    return { level: '적정', label: '적정 공급', color: 'text-yellow-700', bgColor: 'bg-yellow-100', ratio: Math.round(ratio * 100) / 100 };
  }
  return { level: '공급과잉', label: '공급과잉 (레드오션)', color: 'text-red-700', bgColor: 'bg-red-100', ratio: Math.round(ratio * 100) / 100 };
}

/**
 * Keyword quality score: 0–100
 */
export type QualityLevel = 'S' | 'A' | 'B' | 'C' | 'D';

export interface QualityResult {
  score: number;
  level: QualityLevel;
  label: string;
  color: string;
}

export function calculateKeywordQuality(
  search: number,
  competitionLevel: CompetitionLevel,
  ctr: number
): QualityResult {
  // Search volume score (0–40)
  let searchScore = 0;
  if (search >= 50000) searchScore = 40;
  else if (search >= 10000) searchScore = 32;
  else if (search >= 3000) searchScore = 24;
  else if (search >= 500) searchScore = 16;
  else searchScore = 8;

  // Competition score (0–35)
  const compScoreMap: Record<CompetitionLevel, number> = {
    very_good: 35,
    good: 28,
    normal: 18,
    bad: 10,
    very_bad: 4,
  };
  const compScore = compScoreMap[competitionLevel];

  // CTR score (0–25)
  let ctrScore = 0;
  if (ctr >= 10) ctrScore = 25;
  else if (ctr >= 5) ctrScore = 20;
  else if (ctr >= 2) ctrScore = 14;
  else if (ctr >= 1) ctrScore = 8;
  else ctrScore = 3;

  const total = Math.min(100, searchScore + compScore + ctrScore);

  let level: QualityLevel, label: string, color: string;
  if (total >= 85) { level = 'S'; label = '최상급'; color = 'text-emerald-600'; }
  else if (total >= 70) { level = 'A'; label = '우수'; color = 'text-blue-600'; }
  else if (total >= 50) { level = 'B'; label = '보통'; color = 'text-yellow-600'; }
  else if (total >= 30) { level = 'C'; label = '낮음'; color = 'text-orange-600'; }
  else { level = 'D'; label = '매우 낮음'; color = 'text-red-600'; }

  return { score: total, level, label, color };
}

/**
 * Generate auto-insight text for the keyword
 */
export function generateKeywordInsight(
  search: number,
  ctr: number,
  competitionLevel: CompetitionLevel,
  pcRatio: number, // 0–100 (percentage of PC searches)
  qualityLevel: QualityLevel
): string {
  const parts: string[] = [];

  // Search volume insight
  if (search >= 50000) parts.push('월간 검색량이 매우 높은 대형 키워드입니다.');
  else if (search >= 10000) parts.push('검색량이 충분한 중대형 키워드입니다.');
  else if (search >= 3000) parts.push('안정적인 검색 수요가 있는 키워드입니다.');
  else parts.push('틈새시장 공략에 적합한 소형 키워드입니다.');

  // PC/Mobile insight
  if (pcRatio > 40) parts.push('PC 검색 비중이 높아 상세페이지 최적화가 중요합니다.');
  else if (pcRatio < 15) parts.push('모바일 중심 키워드로 썸네일과 간결한 제목이 핵심입니다.');

  // CTR insight
  if (ctr >= 5) parts.push('클릭률이 우수하여 구매 전환 가능성이 높습니다.');
  else if (ctr < 2) parts.push('클릭률이 낮으므로 매력적인 썸네일/제목 전략이 필요합니다.');

  // Competition insight
  if (competitionLevel === 'very_good' || competitionLevel === 'good') {
    parts.push('경쟁 강도가 낮아 진입 기회가 좋습니다.');
  } else if (competitionLevel === 'bad' || competitionLevel === 'very_bad') {
    parts.push('경쟁이 치열하므로 차별화 전략이 필수적입니다.');
  }

  // Quality summary
  if (qualityLevel === 'S' || qualityLevel === 'A') {
    parts.push('전체적으로 공략 가치가 높은 키워드입니다. 적극 추천!');
  } else if (qualityLevel === 'D') {
    parts.push('종합 점수가 낮아 다른 키워드를 우선 검토하세요.');
  }

  return parts.join(' ');
}
