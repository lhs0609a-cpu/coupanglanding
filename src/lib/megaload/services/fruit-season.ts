/**
 * 대리 등록 대상 과일 품목 판정 — 2026-09-28 사용자 확정.
 *
 * 왜 화이트리스트인가:
 *   블랙리스트(참외만 제외)로 두면 소싱이 늘어날 때마다 제철 아닌 품목이 조용히
 *   섞여 들어온다(실측: 9월 말 카탈로그의 멜론 45건 — 멜론은 6~9월로 끝물).
 *   올릴 품목을 명시하고, 모르는 품목은 올리지 않는 쪽이 안전하다.
 *
 * 값은 catalog_products.fruit_kind = 소싱 category_path 의 3번째 단계와 같다
 * ("신선식품 > 과일 > 키위/참다래" → "키위/참다래").
 */

/** 9~11월 제철 — 지금이 가장 잘 팔리는 품목. */
export const AUTUMN_FRUITS = ['사과', '포도', '무화과', '한라봉/감귤류', '석류', '키위/참다래'] as const;

/** 시설재배·수입이라 계절을 타지 않는 품목. */
export const YEAR_ROUND_FRUITS = ['토마토', '바나나', '오렌지', '파인애플', '아보카도', '레몬', '자몽'] as const;

/** 지금 올려도 되는 품목 전체. 여기 없는 품목은 등록하지 않는다. */
export const IN_SEASON_FRUITS: ReadonlySet<string> = new Set<string>([
  ...AUTUMN_FRUITS,
  ...YEAR_ROUND_FRUITS,
]);

/**
 * 이 품목을 지금 올려도 되는가.
 *
 * @param fruitKind  catalog_products.fruit_kind 또는 소싱 category_path 3단계.
 *                   비어 있으면 false — 품목을 모르면 시즌 판정도 못 한다.
 */
export function isInSeason(fruitKind: string | null | undefined): boolean {
  const k = String(fruitKind || '').trim();
  return k.length > 0 && IN_SEASON_FRUITS.has(k);
}

/** 소싱 category_path 에서 품목명을 뽑는다 ("신선식품 > 과일 > 사과" → "사과"). */
export function fruitKindFromCategoryPath(categoryPath: string | null | undefined): string {
  return String(categoryPath || '').split('>')[2]?.trim() || '';
}
