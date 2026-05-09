// ============================================================
// 모바일 40자 골든존 측정 시스템
//
// 쿠팡 모바일 검색결과/카테고리 리스트는 노출상품명을 약 40자에서
// 자른다. 이 영역에 [카테고리 leaf · 핵심 성분/특징 · 검색 매칭 키워드]가
// 충분히 들어가야 검색 노출과 클릭률이 동시에 보장된다.
//
// - 한글: 1자 = 1자
// - 영문/숫자/공백: 1자 = 1자 (쿠팡 truncation은 char 단위)
// - 더 정확한 시뮬레이션은 폰트 width 기반이지만, 일반적으로 40자 char count
//   기준이 충분히 보수적.
// ============================================================

const MOBILE_CUTOFF_CHARS = 40;

export interface GoldenZoneAudit {
  golden: string;              // 40자 안에 들어간 부분
  goldenLength: number;        // 실제 char 수
  goldenTokens: string[];      // 골든존 안의 토큰
  remainder: string;           // 40자 밖으로 잘린 나머지
  remainderTokens: string[];   // 잘린 토큰들
  truncated: boolean;          // 잘렸는지 여부

  // SEO 매칭 점수
  hasLeafToken: boolean;       // 카테고리 leaf 토큰 포함 여부 (가장 중요)
  matchedCategoryWords: string[]; // 카테고리 path 토큰 중 매칭된 것
  coreKeywordCount: number;    // 골든존 안 의미 토큰 수 (length>=2, 숫자 아님)
  score: number;               // 0~100 SEO 골든존 점수
}

/**
 * 노출상품명의 모바일 40자 골든존 분석.
 */
export function auditGoldenZone(
  displayName: string,
  categoryPath: string,
  maxChars: number = MOBILE_CUTOFF_CHARS,
): GoldenZoneAudit {
  const trimmed = displayName.trim();
  const truncated = trimmed.length > maxChars;
  const golden = truncated ? trimmed.slice(0, maxChars) : trimmed;
  const remainder = truncated ? trimmed.slice(maxChars) : '';

  // 토큰 분리: 공백·콤마 기준
  const goldenTokens = golden.split(/[\s,]+/).filter(Boolean);
  const remainderTokens = remainder.split(/[\s,]+/).filter(Boolean);

  // 카테고리 path 토큰 추출 (leaf + 부모 + 분할)
  const pathSegs = categoryPath.split('>').map(s => s.trim()).filter(Boolean);
  const leaf = pathSegs[pathSegs.length - 1] || '';
  const categoryWords = new Set<string>();
  for (let i = 0; i < pathSegs.length; i++) {
    const seg = pathSegs[i];
    if (seg.length >= 1) categoryWords.add(seg.toLowerCase());
    for (const part of seg.split(/[\/·\s\(\)\[\],+&\-_'']+/)) {
      const t = part.trim().toLowerCase();
      if (t.length >= 1 && !/^\d+$/.test(t)) categoryWords.add(t);
    }
  }

  // leaf 매칭 확인 (정확/include/split 매칭)
  const leafLower = leaf.toLowerCase();
  const leafSplits = leaf
    .split(/[\/·\s\(\)\[\],+&\-_'']+/)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length >= 1 && !/^\d+$/.test(s));
  const goldenLower = golden.toLowerCase();
  const hasLeafToken =
    goldenLower.includes(leafLower) ||
    leafSplits.some(s => s.length >= 2 && goldenLower.includes(s));

  // 매칭된 카테고리 토큰
  const matchedCategoryWords: string[] = [];
  for (const cw of categoryWords) {
    if (cw.length >= 2 && goldenLower.includes(cw)) {
      matchedCategoryWords.push(cw);
    }
  }

  // core keyword count: 의미 토큰 (>=2 chars, not pure number)
  const coreKeywordCount = goldenTokens.filter(
    t => t.length >= 2 && !/^\d+$/.test(t),
  ).length;

  // 점수: 100 만점
  //  - leaf 포함: 40
  //  - 카테고리 매칭 토큰 수 × 10 (max 30)
  //  - core keyword count: 적정 6~8개일 때 30, 그 외 가중 감소
  let score = 0;
  if (hasLeafToken) score += 40;
  score += Math.min(30, matchedCategoryWords.length * 10);
  if (coreKeywordCount >= 6 && coreKeywordCount <= 8) score += 30;
  else if (coreKeywordCount >= 4 && coreKeywordCount <= 10) score += 20;
  else if (coreKeywordCount >= 3) score += 10;

  return {
    golden,
    goldenLength: golden.length,
    goldenTokens,
    remainder,
    remainderTokens,
    truncated,
    hasLeafToken,
    matchedCategoryWords,
    coreKeywordCount,
    score,
  };
}

/**
 * 노출상품명 배열의 골든존 통계 — audit 스크립트용.
 */
export function aggregateGoldenZoneStats(
  items: { displayName: string; categoryPath: string }[],
): {
  total: number;
  withLeafInGolden: number;
  withLeafPercentage: number;
  avgScore: number;
  avgGoldenLength: number;
  avgCoreKeywords: number;
  truncatedCount: number;
  scoreDistribution: { excellent: number; good: number; fair: number; poor: number };
} {
  let total = 0;
  let withLeafInGolden = 0;
  let scoreSum = 0;
  let goldenLenSum = 0;
  let coreKwSum = 0;
  let truncatedCount = 0;
  const scoreDist = { excellent: 0, good: 0, fair: 0, poor: 0 };

  for (const item of items) {
    const a = auditGoldenZone(item.displayName, item.categoryPath);
    total++;
    if (a.hasLeafToken) withLeafInGolden++;
    scoreSum += a.score;
    goldenLenSum += a.goldenLength;
    coreKwSum += a.coreKeywordCount;
    if (a.truncated) truncatedCount++;
    if (a.score >= 80) scoreDist.excellent++;
    else if (a.score >= 60) scoreDist.good++;
    else if (a.score >= 40) scoreDist.fair++;
    else scoreDist.poor++;
  }

  return {
    total,
    withLeafInGolden,
    withLeafPercentage: total > 0 ? (withLeafInGolden / total) * 100 : 0,
    avgScore: total > 0 ? scoreSum / total : 0,
    avgGoldenLength: total > 0 ? goldenLenSum / total : 0,
    avgCoreKeywords: total > 0 ? coreKwSum / total : 0,
    truncatedCount,
    scoreDistribution: scoreDist,
  };
}
