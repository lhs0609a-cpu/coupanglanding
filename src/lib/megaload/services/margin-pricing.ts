// ============================================================
// 가격대별 마진율 자동 계산 유틸리티
// ============================================================

export interface PriceBracket {
  minPrice: number;   // 이상
  maxPrice: number;   // 미만
  marginRate: number; // % (예: 25 → 25%)
}

/** 기본 가격 구간 (사용자가 UI에서 수정 가능) */
export const DEFAULT_BRACKETS: PriceBracket[] = [
  { minPrice: 100,     maxPrice: 5000,      marginRate: 450 },
  { minPrice: 5001,    maxPrice: 10000,     marginRate: 240 },
  { minPrice: 10001,   maxPrice: 20000,     marginRate: 160 },
  { minPrice: 20001,   maxPrice: 30000,     marginRate: 115 },
  { minPrice: 30001,   maxPrice: 50000,     marginRate: 100 },
  { minPrice: 50001,   maxPrice: 80000,     marginRate: 90 },
  { minPrice: 80001,   maxPrice: 150000,    marginRate: 80 },
  { minPrice: 150001,  maxPrice: 200000,    marginRate: 60 },
  { minPrice: 200001,  maxPrice: 300000,    marginRate: 55 },
  { minPrice: 300001,  maxPrice: 9999999,   marginRate: 70 },
];

/**
 * 원가에 해당하는 마진율 구간을 찾아 판매가를 계산한다.
 * - 100원 단위 올림 적용
 * - 매칭되는 구간이 없으면 기본 마진율 25% 적용
 */
export function calculateSellingPrice(
  sourcePrice: number,
  brackets: PriceBracket[] = DEFAULT_BRACKETS,
): number {
  const bracket = brackets.find(
    (b) => sourcePrice >= b.minPrice && sourcePrice < b.maxPrice,
  );
  const marginRate = bracket ? bracket.marginRate : 25;
  const raw = sourcePrice * (1 + marginRate / 100);
  // 100원 단위 올림
  return Math.ceil(raw / 100) * 100;
}

/**
 * 마진율(%)을 반환
 */
export function getMarginRate(
  sourcePrice: number,
  brackets: PriceBracket[] = DEFAULT_BRACKETS,
): number {
  const bracket = brackets.find(
    (b) => sourcePrice >= b.minPrice && sourcePrice < b.maxPrice,
  );
  return bracket ? bracket.marginRate : 25;
}
