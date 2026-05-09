// ============================================================
// v2 풀 리졸버 — 실데이터(네이버 자동완성 + 검색광고) 기반
//
// seo-keyword-pools-v2.json은 16,259 카테고리에 대해 네이버 자동완성/검색량
// 실데이터에서 추출한 검색 매칭 키워드 모음.
//
// 데이터 품질이 충분한 카테고리에 한해 v2 풀 사용,
// 그 외에는 기존 v1 풀(seo-keyword-pools.json)로 fallback.
//
// 데이터 품질 기준 (modifier ≥2 OR monthlyVolume>0 OR topRelated≥1):
//   - 풍부:   3,462개 (21.3%) — modifier ≥3 + 검색량 데이터
//   - 최소:   4,919개 (30.3%) — modifier ≥2
//   - 부족:   7,878개 (48.5%) — fallback to v1
// ============================================================

import v2Data from '../data/seo-keyword-pools-v2.json';

export interface V2Pool {
  leafBase: string;
  modifiers: string[];
  longTail: string[];
  synonyms: string[];
  banned: string[];
  monthlyVolume: number;
  topRelated: { kw: string; vol: number; comp: string }[];
  hasVolumeData: boolean;
  lengthMin: number;
  lengthMax: number;
}

const POOL_DATA = v2Data as unknown as Record<string, V2Pool>;

/**
 * 카테고리 path → v2 풀 (데이터 품질 충분한 경우만).
 * 데이터 부족 시 null 반환 → 호출자가 v1 fallback.
 */
export function getV2Pool(categoryPath: string): V2Pool | null {
  const v = POOL_DATA[categoryPath];
  if (!v) return null;
  // 데이터 품질 검사
  const hasModifiers = (v.modifiers?.length || 0) >= 2;
  const hasVolume = (v.monthlyVolume || 0) > 0;
  const hasRelated = (v.topRelated?.length || 0) > 0;
  if (!hasModifiers && !hasVolume && !hasRelated) return null;
  return v;
}

/**
 * v2 풀을 v1 CategoryPool 형식으로 변환 (display-name-generator 호환).
 *
 * - features: modifiers (실데이터 형용사/속성)
 * - generic:  longTail + topRelated.kw (검색 매칭 토큰)
 * - ingredients: 비움 (v2는 성분 분리 안 함)
 *
 * 호출자는 기존 풀 사용처에 그대로 drop-in 가능.
 */
export function v2ToV1Pool(v2: V2Pool): {
  generic: string[];
  ingredients: string[];
  features: string[];
} {
  const longTailKws = (v2.longTail || []).map(s => s);
  const relatedKws = (v2.topRelated || []).map(r => r.kw);
  // longTail 우선, 그 다음 topRelated. 중복 제거
  const generic: string[] = [];
  const seen = new Set<string>();
  for (const kw of [...longTailKws, ...relatedKws]) {
    const lower = kw.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    generic.push(kw);
    if (generic.length >= 8) break;
  }

  return {
    generic,
    ingredients: [], // v2는 성분 분리 안 함
    features: (v2.modifiers || []).slice(0, 10),
  };
}

/**
 * 카테고리 path → v2 데이터 풍부도.
 *  - 'rich': modifier ≥3 + 검색량 데이터 (풍부)
 *  - 'minimal': modifier ≥2 (최소 사용 가능)
 *  - 'fallback': 데이터 부족 → v1 사용 권장
 */
export function getDataQuality(categoryPath: string): 'rich' | 'minimal' | 'fallback' {
  const v = POOL_DATA[categoryPath];
  if (!v) return 'fallback';
  const modCount = v.modifiers?.length || 0;
  const hasVolume = (v.monthlyVolume || 0) > 0 || (v.topRelated?.length || 0) > 0;
  if (modCount >= 3 && hasVolume) return 'rich';
  if (modCount >= 2) return 'minimal';
  return 'fallback';
}
