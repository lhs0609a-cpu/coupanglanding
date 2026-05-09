// ============================================================
// Tier 3: 카테고리 alias 자동 학습 (megaload_category_aliases)
// ============================================================
// 사용자가 수동 매칭하거나 LLM 이 confirm 한 결과를 키워드 → 카테고리로 누적 저장.
// 다음에 동일/유사 상품명이 들어오면 Tier 0 직전에 즉시 매칭되어 비용/지연 0.
//
// 키워드 정규화: lowercase + 공백 제거 + 노이즈/단위/숫자 제거
// hits ≥ 2 인 alias 만 신뢰 (1회 입력은 사용자 오류일 수 있음)
// ============================================================

import { createServiceClient } from '@/lib/supabase/server';
import type { CategoryMatchResult } from './category-matcher';

interface AliasRow {
  product_keyword: string;
  category_code: string;
  category_path: string | null;
  hits: number;
  source: string;
}

let _aliasCache: Map<string, AliasRow> | null = null;
let _aliasCacheLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

/**
 * alias 캐시 로드 — 5분 TTL.
 * 어드민 대량 등록 시 매번 DB 조회 방지.
 */
async function loadAliasCache(): Promise<Map<string, AliasRow>> {
  if (_aliasCache && Date.now() - _aliasCacheLoadedAt < CACHE_TTL_MS) {
    return _aliasCache;
  }
  try {
    const sb = await createServiceClient();
    const { data, error } = await sb
      .from('megaload_category_aliases')
      .select('product_keyword, category_code, category_path, hits, source')
      .gte('hits', 2);
    if (error) {
      console.warn('[category-alias-store] cache load error:', error.message);
      return new Map();
    }
    const map = new Map<string, AliasRow>();
    for (const r of (data || []) as AliasRow[]) {
      map.set(r.product_keyword, r);
    }
    _aliasCache = map;
    _aliasCacheLoadedAt = Date.now();
    return map;
  } catch (err) {
    console.warn('[category-alias-store] cache load failed:', err instanceof Error ? err.message : err);
    return new Map();
  }
}

/**
 * 상품명 → alias lookup key 정규화.
 * - 소문자
 * - 한글/영문/숫자 외 제거
 * - 단위/숫자 제거 ("100g 폼클렌저" → "폼클렌저")
 * - 공백 제거
 */
export function normalizeAliasKey(productName: string): string {
  return productName
    .toLowerCase()
    .replace(/\d+(ml|g|kg|mg|l|ea|cm|mm|m|oz|lb|개|정|병|통|매|팩|입|봉|포|장|알)?/gi, '')
    .replace(/[^\w가-힣]/g, '')
    .trim();
}

/**
 * 매칭 시도 — alias 캐시에서 즉시 hit 검사.
 * 정확 일치 우선, 없으면 substring 포함 (가장 긴 키 우선).
 */
export async function matchByAlias(productName: string): Promise<CategoryMatchResult | null> {
  const key = normalizeAliasKey(productName);
  if (!key || key.length < 3) return null;

  const cache = await loadAliasCache();
  if (cache.size === 0) return null;

  // 1) 정확 일치
  const exact = cache.get(key);
  if (exact) {
    return {
      categoryCode: exact.category_code,
      categoryName: exact.category_path?.split('>').pop() || '',
      categoryPath: exact.category_path || '',
      confidence: 0.95,
      source: 'local_db',
    };
  }

  // 2) substring 매칭 — 가장 긴 키가 product 안에 포함되면 채택
  // false positive 방지: alias 키 길이 ≥ 4 만 substring 검사
  let bestKey: string | null = null;
  let bestLen = 0;
  for (const aliasKey of cache.keys()) {
    if (aliasKey.length < 4) continue;
    if (aliasKey.length <= bestLen) continue;
    if (key.includes(aliasKey)) {
      bestKey = aliasKey;
      bestLen = aliasKey.length;
    }
  }
  if (bestKey) {
    const row = cache.get(bestKey)!;
    return {
      categoryCode: row.category_code,
      categoryName: row.category_path?.split('>').pop() || '',
      categoryPath: row.category_path || '',
      confidence: 0.85,
      source: 'local_db',
    };
  }

  return null;
}

/**
 * alias 등록/카운트 증가.
 * - source 'manual' : 사용자가 UI 에서 수동 매칭
 * - source 'llm_confirmed' : LLM rerank 결과 (자동)
 * - source 'embedding_high_conf' : 임베딩 ≥ 0.9 자동 매칭
 */
export async function recordAlias(
  productName: string,
  categoryCode: string,
  categoryPath: string,
  source: 'manual' | 'llm_confirmed' | 'embedding_high_conf',
): Promise<void> {
  const key = normalizeAliasKey(productName);
  if (!key || key.length < 3) return;
  if (!categoryCode) return;

  try {
    const sb = await createServiceClient();
    // upsert + hits 증가 (중복 시 hits++ 만)
    const { data: existing } = await sb
      .from('megaload_category_aliases')
      .select('hits')
      .eq('product_keyword', key)
      .single();

    if (existing) {
      await sb
        .from('megaload_category_aliases')
        .update({
          hits: (existing as { hits: number }).hits + 1,
          category_code: categoryCode,
          category_path: categoryPath,
          source,
          updated_at: new Date().toISOString(),
        })
        .eq('product_keyword', key);
    } else {
      await sb.from('megaload_category_aliases').insert({
        product_keyword: key,
        category_code: categoryCode,
        category_path: categoryPath,
        hits: 1,
        source,
      });
    }
    // 캐시 무효화 (다음 조회 시 재로드)
    _aliasCache = null;
  } catch (err) {
    console.warn('[category-alias-store] record error:', err instanceof Error ? err.message : err);
  }
}
