// ============================================================
// SEO 키워드 풀 리졸버
//
// seo-keyword-pools.json에서 카테고리 경로 기반으로
// SEO 키워드 풀을 계층적 매칭(소분류→중분류→대분류→빈풀)하여 반환.
// ============================================================

import seoData from '../data/seo-keyword-pools.json';

// ─── 타입 ────────────────────────────────────────────────────

export interface SeoPool {
  generic: string[];
  ingredients: string[];
  features: string[];
}

interface SeoDataShape {
  universalModifiers: string[];
  categoryPools: Record<string, SeoPool>;
}

const data = seoData as unknown as SeoDataShape;

const EMPTY_POOL: SeoPool = { generic: [], ingredients: [], features: [] };

// ─── 카테고리 경로 → SEO 키워드 풀 매칭 ──────────────────────

/**
 * 카테고리 경로에서 가장 구체적인 SEO 풀을 찾는다.
 * 소분류 → 중분류 → 대분류 → 빈 풀 순서로 폴백.
 *
 * 예: "뷰티>스킨>크림>넥크림"
 *   1) exact "뷰티>스킨>크림>넥크림" ✓
 *   2) "뷰티>스킨>크림"
 *   3) "뷰티>스킨"
 *   4) "뷰티"
 *   5) EMPTY_POOL
 */
export function resolveSeoCategoryPool(categoryPath: string): SeoPool {
  const pools = data.categoryPools;

  // 1. 정확 매칭
  if (pools[categoryPath]) return pools[categoryPath];

  // 2. 뒤에서부터 줄여가며 매칭
  const parts = categoryPath.split('>').map(p => p.trim());
  for (let len = parts.length - 1; len >= 1; len--) {
    const key = parts.slice(0, len).join('>');
    if (pools[key]) return pools[key];
  }

  // 3. 대분류 부분 매칭 (첫 번째 세그먼트가 포함된 키 중 가장 짧은 것)
  const top = parts[0];
  let bestKey = '';
  let bestLen = Infinity;
  for (const key of Object.keys(pools)) {
    if (key.startsWith(top + '>') || key === top) {
      if (key.length < bestLen) {
        bestLen = key.length;
        bestKey = key;
      }
    }
  }
  if (bestKey) return pools[bestKey];

  return EMPTY_POOL;
}

// ─── 공통 수식어 ─────────────────────────────────────────────

/** 범용 SEO 수식어 (카테고리 무관, 상품 수식 키워드) */
export function getUniversalModifiers(): string[] {
  return data.universalModifiers || [];
}

/** 구매 전환 유도 수식어 (CTA, 구매의도 키워드) */
export function getConversionModifiers(): string[] {
  return [
    '추천', '인기', '베스트', '최저가', '할인', '무료배송',
    '당일발송', '빠른배송', '후기좋은', '만족도높은', '재구매율높은',
    '가성비', '품질보증',
  ];
}
