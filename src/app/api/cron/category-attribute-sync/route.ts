import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import type { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { getAttributesWithCacheBatch } from '@/lib/megaload/services/attribute-cache';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// 한 번에 라이브 호출할 카테고리 수 (쿠팡 rate limit 고려해 보수적으로).
//   350 × (concurrency 2, delay 500ms) ≈ 160초 → maxDuration 300 안. 429 false-empty 최소화.
const MAX_PER_RUN = 350;

/**
 * GET /api/cron/category-attribute-sync  ("1.6만 정확히 맞추기" 백필)
 *
 * 전체 1.6만 카테고리의 필수옵션/속성을 쿠팡 라이브 API(getCategoryAttributes)로
 * 미리 다 조회해 coupang_attribute_cache(전 사용자 공유)에 적재한다.
 * → 등록 시 카테고리가 무엇이든 "쿠팡이 요구하는 필수옵션"을 라이브 검증된 값으로 보유.
 *
 * 재개형: 매 런에서 아직 캐시 안 된 카테고리만 MAX_PER_RUN 개 처리. 전부 끝나면 idle.
 * 라이브 호출 실패(429 등)는 캐시 안 됨(getAttributesWithCache가 throw 시 미저장) → 다음 런 재시도.
 */
export async function GET(request: Request) {
  const tickStart = Date.now();
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sc = await createServiceClient();
  try {
    // 1) 전체 카테고리 코드 (번들 cat-details)
    const raw = readFileSync(join(process.cwd(), 'src/lib/megaload/data/coupang-cat-details.json'), 'utf8');
    const allCodes = Object.keys(JSON.parse(raw) as Record<string, unknown>);

    // 2) 이미 캐시된 코드 수집 (페이지네이션 — 최대 1.6만 row)
    const cached = new Set<string>();
    let offset = 0;
    for (;;) {
      const { data } = await sc
        .from('coupang_attribute_cache')
        .select('category_code')
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      for (const r of data) cached.add((r as { category_code: string }).category_code);
      if (data.length < 1000) break;
      offset += 1000;
    }

    const uncached = allCodes.filter((c) => !cached.has(c));
    if (uncached.length === 0) {
      return NextResponse.json({ done: true, total: allCodes.length, cached: cached.size, remaining: 0 });
    }

    // 3) 연결된 쿠팡 셀러 1명의 creds 로 어댑터 (카테고리 메타는 전 사용자 공유 자산)
    const { data: cred } = await sc
      .from('channel_credentials')
      .select('megaload_user_id')
      .eq('channel', 'coupang')
      .eq('is_connected', true)
      .limit(1)
      .maybeSingle();
    if (!cred) {
      return NextResponse.json({ skipped: true, reason: '연결된 쿠팡 셀러 없음 — 속성 동기화 불가', remaining: uncached.length });
    }
    const adapter = await getAuthenticatedAdapter(
      sc,
      (cred as { megaload_user_id: string }).megaload_user_id,
      'coupang',
    ) as CoupangAdapter;

    // 4) 이번 런 배치 처리 (라이브 조회 + 캐시 upsert)
    const batch = uncached.slice(0, MAX_PER_RUN);
    await getAttributesWithCacheBatch(sc, adapter, batch, { concurrency: 2, delayMs: 500 });

    // 처리 후 실제 캐시된 수 재확인(429 등으로 일부 미저장될 수 있음)
    const { count: cachedNow } = await sc
      .from('coupang_attribute_cache')
      .select('category_code', { count: 'exact', head: true });

    return NextResponse.json({
      done: false,
      total: allCodes.length,
      cachedBefore: cached.size,
      cachedNow: cachedNow ?? null,
      processedThisRun: batch.length,
      remaining: allCodes.length - (cachedNow ?? cached.size),
      elapsedMs: Date.now() - tickStart,
    });
  } catch (err) {
    console.error('[category-attribute-sync] error:', err);
    void logSystemError({ source: 'cron/category-attribute-sync', error: err }).catch(() => {});
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
