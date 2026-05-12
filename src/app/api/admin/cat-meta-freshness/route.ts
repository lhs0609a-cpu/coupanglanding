import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import type { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * 쿠팡 카테고리 메타 신선도 검사
 *
 * 목적: 우리 캐시 (src/lib/megaload/data/coupang-cat-details.json)가
 *       쿠팡 라이브 API 응답과 일치하는지 stratified sampling으로 확인.
 *
 * 비교 대상:
 *   - 캐시 `b` (구매옵션, required) ↔ live attributes where exposed='EXPOSED'
 *   - 캐시 `s` (검색속성) ↔ live attributes where exposed='NONE'
 *
 * 비교 차원: 항목명 / required / 단위(basicUnit) / ENUM 선택지 수
 */

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return null;
  return user;
}

interface CachedBuyOpt { n: string; r?: boolean; u?: string }
interface CachedCategory { p: string; b?: CachedBuyOpt[]; s?: CachedBuyOpt[] }

interface LiveAttribute {
  attributeTypeName: string;
  required: boolean;
  dataType: string;
  basicUnit?: string;
  exposed?: string;
  attributeValues?: { attributeValueName: string }[];
}

interface Diff {
  category_code: string;
  path: string;
  status: 'match' | 'drift' | 'missing_cache_b' | 'missing_cache_s' | 'live_fail';
  errors: string[];
  cached_buy_count?: number;
  live_exposed_count?: number;
  cached_search_count?: number;
  live_none_count?: number;
}

const SLEEP = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function pickStratifiedSample(
  data: Record<string, CachedCategory>,
  sampleSize: number
): Array<{ code: string; cat: CachedCategory }> {
  const entries = Object.entries(data);
  // 최상위 도메인별 그룹핑
  const byDomain = new Map<string, Array<{ code: string; cat: CachedCategory }>>();
  for (const [code, cat] of entries) {
    const domain = (cat.p || '').split('>')[0] || 'unknown';
    const arr = byDomain.get(domain) || [];
    arr.push({ code, cat });
    byDomain.set(domain, arr);
  }
  const domains = Array.from(byDomain.keys());
  const perDomain = Math.max(1, Math.floor(sampleSize / domains.length));

  const picked: Array<{ code: string; cat: CachedCategory }> = [];
  for (const d of domains) {
    const list = byDomain.get(d)!;
    // 시드 없이 단순 랜덤 (또는 deterministic하려면 시드 도입)
    for (let i = 0; i < perDomain && i < list.length; i++) {
      const idx = Math.floor(Math.random() * list.length);
      picked.push(list[idx]);
    }
  }
  return picked.slice(0, sampleSize);
}

function diffOptionList(
  label: 'buyOpt' | 'search',
  cached: CachedBuyOpt[],
  live: LiveAttribute[]
): string[] {
  const errors: string[] = [];
  const cachedByName = new Map(cached.map((c) => [c.n, c]));
  const liveByName = new Map(live.map((l) => [l.attributeTypeName, l]));

  // cached에는 있는데 live에는 없음 → 쿠팡이 제거함
  for (const [name] of cachedByName) {
    if (!liveByName.has(name)) {
      errors.push(`[${label}] 캐시에 있는 "${name}" 가 live에 없음 (쿠팡이 제거 가능성)`);
    }
  }
  // live에는 있는데 cached에는 없음 → 쿠팡이 추가함 (우리가 못 따라잡음)
  for (const [name] of liveByName) {
    if (!cachedByName.has(name)) {
      errors.push(`[${label}] live에 있는 "${name}" 가 캐시에 없음 (쿠팡 신규 항목)`);
    }
  }
  // required 변경
  for (const [name, c] of cachedByName) {
    const l = liveByName.get(name);
    if (!l) continue;
    const cachedRequired = !!c.r;
    const liveRequired = !!l.required;
    if (cachedRequired !== liveRequired) {
      errors.push(`[${label}] "${name}" required 변경: cached=${cachedRequired} live=${liveRequired}`);
    }
  }
  // unit 변경 (있는 경우만)
  for (const [name, c] of cachedByName) {
    const l = liveByName.get(name);
    if (!l) continue;
    if (c.u && l.basicUnit && c.u !== l.basicUnit) {
      errors.push(`[${label}] "${name}" 단위 변경: cached=${c.u} live=${l.basicUnit}`);
    }
  }
  return errors;
}

/**
 * POST /api/admin/cat-meta-freshness
 * Body: { sample?: number, throttleMs?: number }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const adminUser = await requireAdmin(supabase);
  if (!adminUser) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    sample?: number;
    throttleMs?: number;
  };
  const sampleSize = Math.min(Math.max(body.sample || 50, 5), 300);
  const throttleMs = Math.max(body.throttleMs || 250, 100);

  const serviceClient = await createServiceClient();
  let shUserId: string;
  try {
    shUserId = await ensureMegaloadUser(supabase, serviceClient, adminUser.id);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Megaload 계정 없음' },
      { status: 404 }
    );
  }

  // 캐시 로드
  let cache: Record<string, CachedCategory>;
  try {
    const path = join(process.cwd(), 'src/lib/megaload/data/coupang-cat-details.json');
    cache = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    return NextResponse.json(
      { error: `캐시 로드 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }

  // 어댑터 인증
  let adapter: CoupangAdapter;
  try {
    adapter = (await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang')) as CoupangAdapter;
  } catch (err) {
    return NextResponse.json(
      { error: `쿠팡 인증 실패: ${err instanceof Error ? err.message : String(err)}` },
      { status: 401 }
    );
  }

  // 샘플링
  const sample = pickStratifiedSample(cache, sampleSize);
  const diffs: Diff[] = [];
  const summary = {
    sampled: sample.length,
    matched: 0,
    drifted: 0,
    live_failed: 0,
    total_error_count: 0,
    domains: new Set<string>(),
  };

  for (const { code, cat } of sample) {
    const domain = (cat.p || '').split('>')[0] || 'unknown';
    summary.domains.add(domain);

    let liveAttrs: LiveAttribute[];
    try {
      const result = await adapter.getCategoryAttributes(code);
      liveAttrs = result.items as LiveAttribute[];
    } catch (err) {
      diffs.push({
        category_code: code,
        path: cat.p,
        status: 'live_fail',
        errors: [`live API 실패: ${err instanceof Error ? err.message : String(err)}`],
      });
      summary.live_failed++;
      await SLEEP(throttleMs);
      continue;
    }

    const liveExposed = liveAttrs.filter((a) => a.exposed === 'EXPOSED' || a.exposed === undefined);
    const liveNone = liveAttrs.filter((a) => a.exposed === 'NONE');

    const errors: string[] = [];
    errors.push(...diffOptionList('buyOpt', cat.b || [], liveExposed));
    errors.push(...diffOptionList('search', cat.s || [], liveNone));

    const status: Diff['status'] = errors.length === 0 ? 'match' : 'drift';
    diffs.push({
      category_code: code,
      path: cat.p,
      status,
      errors,
      cached_buy_count: (cat.b || []).length,
      live_exposed_count: liveExposed.length,
      cached_search_count: (cat.s || []).length,
      live_none_count: liveNone.length,
    });

    if (status === 'match') summary.matched++;
    else summary.drifted++;
    summary.total_error_count += errors.length;

    await SLEEP(throttleMs);
  }

  // 도메인별 통계
  const byDomain: Record<string, { sampled: number; drifted: number }> = {};
  for (const d of diffs) {
    const dom = (d.path || '').split('>')[0] || 'unknown';
    byDomain[dom] = byDomain[dom] || { sampled: 0, drifted: 0 };
    byDomain[dom].sampled++;
    if (d.status === 'drift') byDomain[dom].drifted++;
  }

  return NextResponse.json({
    ok: true,
    summary: {
      sampled: summary.sampled,
      matched: summary.matched,
      drifted: summary.drifted,
      live_failed: summary.live_failed,
      total_error_count: summary.total_error_count,
      drift_rate: summary.sampled > 0
        ? `${((summary.drifted / summary.sampled) * 100).toFixed(1)}%`
        : '0%',
      domain_count: summary.domains.size,
    },
    by_domain: byDomain,
    drifts: diffs.filter((d) => d.status !== 'match'),
    matches_sample: diffs.filter((d) => d.status === 'match').slice(0, 5),
  });
}
