// ============================================================
// 카테고리 속성 마스터 리졸버
//
// category-attribute-master.json은 카테고리 그룹 단위 표준 속성을 보유한다.
// path "패션의류잡화>여성패션>여성화>단화/플랫>여성플랫슈즈" 같은 깊은
// leaf를 받으면 가장 매칭되는 그룹의 속성을 반환한다.
//
// 매칭 우선순위: 정확 path → 가장 긴 prefix → L1만
//
// 용도:
//   1. display-name-generator의 패딩 단계에서 다양한 속성 토큰 주입
//      → 셀러간 다양성 확보
//   2. 외국도서/영문 카테고리에 한글 supplements 강제 주입
//      → 한국 검색 매칭률 향상
// ============================================================

import master from '../data/category-attribute-master.json';

export interface CategoryAttributes {
  audience?: string[];
  function?: string[];
  material?: string[];
  occasion?: string[];
  season?: string[];
  level?: string[];
  supplements?: string[];
}

const POOL: Record<string, CategoryAttributes> = master as unknown as Record<string, CategoryAttributes>;
const POOL_KEYS = Object.keys(POOL).filter(k => !k.startsWith('_')).sort((a, b) => b.length - a.length);

/**
 * 카테고리 path → 가장 매칭되는 속성 그룹 반환.
 * - 정확 매칭 우선
 * - 그 다음 가장 긴 prefix 매칭
 * - 마지막 L1 fallback
 */
export function resolveCategoryAttributes(categoryPath: string): CategoryAttributes {
  if (POOL[categoryPath]) return POOL[categoryPath];

  // 가장 긴 prefix 매칭
  const segs = categoryPath.split('>').map(s => s.trim());
  for (const key of POOL_KEYS) {
    const keySegs = key.split('>').map(s => s.trim());
    if (keySegs.length > segs.length) continue;
    let isPrefix = true;
    for (let i = 0; i < keySegs.length; i++) {
      if (segs[i] !== keySegs[i]) { isPrefix = false; break; }
    }
    if (isPrefix) return POOL[key];
  }

  // L1 fallback
  const l1 = segs[0];
  if (POOL[l1]) return POOL[l1];

  return {};
}

/**
 * 모든 속성 토큰을 합친 평탄화 배열.
 */
export function flattenAttributes(attrs: CategoryAttributes): string[] {
  const all: string[] = [];
  if (attrs.audience) all.push(...attrs.audience);
  if (attrs.function) all.push(...attrs.function);
  if (attrs.material) all.push(...attrs.material);
  if (attrs.occasion) all.push(...attrs.occasion);
  if (attrs.season) all.push(...attrs.season);
  if (attrs.level) all.push(...attrs.level);
  if (attrs.supplements) all.push(...attrs.supplements);
  return all;
}

/**
 * 카테고리에 영문 leaf만 있는 경우(외국도서 등) 한글 supplements 우선 반환.
 */
export function getKoreanSupplements(categoryPath: string): string[] {
  const attrs = resolveCategoryAttributes(categoryPath);
  return attrs.supplements || [];
}

/**
 * 카테고리 path가 영문 위주인지 판정.
 * - leaf의 한글 비율 < 30% 이면 영문 카테고리로 간주
 */
export function isEnglishOnlyCategory(categoryPath: string): boolean {
  const segs = categoryPath.split('>').map(s => s.trim());
  const leaf = segs[segs.length - 1] || '';
  if (!leaf) return false;
  let hangul = 0;
  let alpha = 0;
  for (const ch of leaf) {
    if (ch >= '가' && ch <= '힯') hangul++;
    else if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) alpha++;
  }
  if (hangul + alpha === 0) return false;
  return hangul / (hangul + alpha) < 0.3;
}
