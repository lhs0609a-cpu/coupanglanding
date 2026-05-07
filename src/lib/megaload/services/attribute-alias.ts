// ============================================================
// 쿠팡 attribute alias 학습 헬퍼
//
// 우리 buyOption 이름("개당 중량") ↔ 쿠팡 라이브 attribute 이름("내용량(g)") 매핑을
// 카테고리별로 학습. 매칭 성공 시 upsert, 매칭 시도 시 lookup.
//
// 흐름:
//   1) product-builder 가 매칭 시 먼저 alias map 조회 (loadAliases)
//   2) alias 우선 적용 → 없으면 정확/정규화/단위 fallback
//   3) 단위 fallback 으로 매칭 성공한 경우 upsertAlias 로 학습
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AttributeAlias {
  buyOptionName: string;
  buyOptionUnit: string;
  attributeTypeName: string;
}

// 카테고리별 캐시 — 같은 요청 안에서 반복 조회 방지
const _aliasCache = new Map<string, AttributeAlias[]>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분
const _cacheTimestamps = new Map<string, number>();

export function clearAliasCache(): void {
  _aliasCache.clear();
  _cacheTimestamps.clear();
}

/**
 * 카테고리의 alias 목록 조회. 5분 메모리 캐시.
 * service-role 클라이언트 필요 (RLS).
 */
export async function loadAliases(
  client: SupabaseClient,
  categoryCode: string,
): Promise<AttributeAlias[]> {
  const now = Date.now();
  const cached = _aliasCache.get(categoryCode);
  const cachedAt = _cacheTimestamps.get(categoryCode) || 0;
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;

  try {
    const { data } = await client
      .from('coupang_attribute_alias')
      .select('buy_option_name, buy_option_unit, attribute_type_name')
      .eq('category_code', categoryCode);
    const list: AttributeAlias[] = (data || []).map((r: { buy_option_name: string; buy_option_unit: string; attribute_type_name: string }) => ({
      buyOptionName: r.buy_option_name,
      buyOptionUnit: r.buy_option_unit || '',
      attributeTypeName: r.attribute_type_name,
    }));
    _aliasCache.set(categoryCode, list);
    _cacheTimestamps.set(categoryCode, now);
    return list;
  } catch {
    // 테이블 없거나 RLS 에러 → 빈 배열 (silent fallback, 매칭 흐름은 정상)
    return [];
  }
}

/**
 * alias map 에서 buyOption 에 해당하는 실제 attribute 이름 찾기.
 * unit 이 일치하는 것 우선. 없으면 이름만 일치하는 것.
 */
export function findAlias(
  aliases: AttributeAlias[],
  buyOptionName: string,
  buyOptionUnit?: string,
): string | null {
  if (aliases.length === 0) return null;
  const unitNorm = (buyOptionUnit || '').toLowerCase();
  // 1순위: 이름 + 단위 정확 일치
  const exact = aliases.find(a =>
    a.buyOptionName === buyOptionName && a.buyOptionUnit.toLowerCase() === unitNorm,
  );
  if (exact) return exact.attributeTypeName;
  // 2순위: 이름만 일치 (단위 없는 케이스)
  const byName = aliases.find(a => a.buyOptionName === buyOptionName);
  if (byName) return byName.attributeTypeName;
  return null;
}

/**
 * 매칭 성공 시 alias 학습 — fire-and-forget (응답 안 기다림).
 */
export function upsertAlias(
  client: SupabaseClient,
  categoryCode: string,
  buyOptionName: string,
  buyOptionUnit: string,
  attributeTypeName: string,
  dataType?: string,
  basicUnit?: string,
): void {
  // 캐시 무효화 (다음 요청에서 새 alias 반영)
  _aliasCache.delete(categoryCode);
  _cacheTimestamps.delete(categoryCode);
  // 비동기 저장 — 본 요청 흐름 안 막음
  client.rpc('upsert_attribute_alias', {
    p_category_code: categoryCode,
    p_buy_option_name: buyOptionName,
    p_buy_option_unit: buyOptionUnit || '',
    p_attribute_type_name: attributeTypeName,
    p_data_type: dataType || null,
    p_basic_unit: basicUnit || null,
  }).then(
    () => null,
    (err: unknown) => {
      // 함수 없거나 RLS 실패 — silent (학습 실패는 매칭 자체 막지 않음)
      console.warn('[attribute-alias] upsert 실패:', err instanceof Error ? err.message : err);
    },
  );
}
