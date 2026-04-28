// ============================================================
// 쿠팡 상품정보제공고시 카테고리 응답 캐시 (Supabase 영속 캐시)
//
// 흐름:
//   1. 캐시 조회 (Supabase coupang_notice_category_cache)
//   2. 캐시 미스 → 라이브 API 호출 (CoupangAdapter.getNoticeCategoryFields)
//   3. 응답을 캐시에 저장 (다음 호출은 캐시로 처리)
//
// 안전장치:
//   - 캐시 조회/저장 실패해도 동작 유지 (라이브 API 결과 반환)
//   - is_empty=true는 "쿠팡이 빈 배열 반환"을 캐시 (재호출 방지)
//   - 카테고리는 전체 사용자 공유 자산이므로 user-agnostic
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NoticeCategoryMeta } from './notice-field-filler';
import type { CoupangAdapter } from '../adapters/coupang.adapter';

interface CacheRow {
  category_code: string;
  notice_categories: NoticeCategoryMeta[];
  is_empty: boolean;
  cached_at: string;
  updated_at: string;
}

/**
 * 카테고리 코드의 noticeMeta를 캐시 우선으로 조회.
 * 캐시 미스 시 라이브 API 호출 → 결과 캐시 저장 → 반환.
 */
export async function getNoticeCategoryWithCache(
  serviceClient: SupabaseClient,
  adapter: CoupangAdapter,
  categoryCode: string,
): Promise<NoticeCategoryMeta[]> {
  // 1) 캐시 조회
  try {
    const { data, error } = await serviceClient
      .from('coupang_notice_category_cache')
      .select('notice_categories, is_empty')
      .eq('category_code', categoryCode)
      .maybeSingle();

    if (!error && data) {
      const row = data as Pick<CacheRow, 'notice_categories' | 'is_empty'>;
      if (row.is_empty) {
        return [];
      }
      if (Array.isArray(row.notice_categories)) {
        return row.notice_categories;
      }
    }
  } catch (e) {
    console.warn(`[notice-cache] 조회 실패 (live API 폴백): code=${categoryCode}`, e instanceof Error ? e.message : e);
  }

  // 2) 캐시 미스 → 라이브 API
  let noticeMeta: NoticeCategoryMeta[] = [];
  try {
    const result = await adapter.getNoticeCategoryFields(categoryCode);
    noticeMeta = result.items.map((item) => ({
      noticeCategoryName: item.noticeCategoryName,
      fields: item.noticeCategoryDetailNames.map((d) => ({
        name: d.name,
        required: d.required,
      })),
    }));
  } catch (e) {
    console.warn(`[notice-cache] live API 실패: code=${categoryCode}`, e instanceof Error ? e.message : e);
    return [];
  }

  // 3) 캐시 저장 (실패해도 결과는 반환)
  try {
    await serviceClient
      .from('coupang_notice_category_cache')
      .upsert({
        category_code: categoryCode,
        notice_categories: noticeMeta,
        is_empty: noticeMeta.length === 0,
        source: 'live_api',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'category_code' });
  } catch (e) {
    console.warn(`[notice-cache] 저장 실패 (무시): code=${categoryCode}`, e instanceof Error ? e.message : e);
  }

  return noticeMeta;
}

/**
 * 여러 카테고리 코드를 병렬로 캐시 조회 + 라이브 폴백.
 * init-job 등 배치 처리에서 사용.
 */
export async function getNoticeCategoriesWithCacheBatch(
  serviceClient: SupabaseClient,
  adapter: CoupangAdapter,
  categoryCodes: string[],
  options?: { concurrency?: number; delayMs?: number },
): Promise<Record<string, NoticeCategoryMeta[]>> {
  const concurrency = options?.concurrency ?? 5;
  const delayMs = options?.delayMs ?? 200;
  const result: Record<string, NoticeCategoryMeta[]> = {};

  // 1) 캐시 일괄 조회
  const uniqueCodes = [...new Set(categoryCodes)].filter(Boolean);
  if (uniqueCodes.length === 0) return result;

  const cachedSet = new Set<string>();
  try {
    const { data } = await serviceClient
      .from('coupang_notice_category_cache')
      .select('category_code, notice_categories, is_empty')
      .in('category_code', uniqueCodes);

    if (Array.isArray(data)) {
      for (const row of data as Pick<CacheRow, 'category_code' | 'notice_categories' | 'is_empty'>[]) {
        result[row.category_code] = row.is_empty ? [] : row.notice_categories;
        cachedSet.add(row.category_code);
      }
    }
  } catch (e) {
    console.warn('[notice-cache] 배치 조회 실패 (전부 live API)', e instanceof Error ? e.message : e);
  }

  // 2) 캐시 미스만 라이브 호출
  const missingCodes = uniqueCodes.filter((c) => !cachedSet.has(c));
  if (missingCodes.length === 0) return result;

  console.log(`[notice-cache] 배치: ${uniqueCodes.length}개 중 ${cachedSet.size}개 캐시 hit, ${missingCodes.length}개 라이브 조회`);

  for (let i = 0; i < missingCodes.length; i += concurrency) {
    const chunk = missingCodes.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(
      chunk.map(async (code) => {
        const meta = await getNoticeCategoryWithCache(serviceClient, adapter, code);
        return { code, meta };
      }),
    );
    for (const r of chunkResults) {
      if (r.status === 'fulfilled') {
        result[r.value.code] = r.value.meta;
      }
    }
    if (i + concurrency < missingCodes.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return result;
}
