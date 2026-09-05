import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST /api/megaload/stock-monitor/reconcile-coupang
 * 실측 기반 라벨 교정 — coupang_status 를 쿠팡 실제 판매상태(onSale/재고)에 맞춘다.
 *
 * ⚠️ 순수 "라벨 교정"이다. 쿠팡에 stop/resume 같은 쓰기 호출을 하지 않는다.
 *    우리 대시보드의 "쿠팡 상태"가 실제와 어긋난(대부분 "중지됨"인데 실제로는 판매중) 것을
 *    inventories API 실측으로 바로잡을 뿐. 판매 on/off 자체는 엔진 토글 로직이 담당.
 *
 * body:
 *   - scope : 'suspended'(기본, stale 백로그 우선) | 'all'
 *   - cursor: 이전 배치 마지막 id (페이지네이션)
 *   - limit : 배치 크기 (기본 25, 최대 50)
 *
 * 반환: scanned / corrected / details / cursor / done
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : '메가로드 계정이 필요합니다.' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const scope = body.scope === 'all' ? 'all' : 'suspended';
    const cursor = typeof body.cursor === 'string' ? body.cursor : undefined;
    const limit = Math.min(50, Math.max(1, Number(body.limit) || 25));

    let adapter: CoupangAdapter;
    try {
      adapter = (await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang')) as CoupangAdapter;
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'API 인증 실패' }, { status: 400 });
    }

    let query = serviceClient
      .from('sh_stock_monitors')
      .select('id, coupang_product_id, coupang_status, source_status')
      .eq('megaload_user_id', shUserId)
      .eq('is_active', true)
      .not('coupang_product_id', 'is', null)
      .not('coupang_product_id', 'eq', '')
      .order('id', { ascending: true })
      .limit(limit);
    if (scope === 'suspended') query = query.eq('coupang_status', 'suspended');
    if (cursor) query = query.gt('id', cursor);

    const { data: rows, error: qErr } = await query;
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

    const monitors = (rows || []) as { id: string; coupang_product_id: string; coupang_status: string; source_status: string }[];
    if (monitors.length === 0) {
      return NextResponse.json({ scanned: 0, corrected: 0, details: [], done: true });
    }

    const now = new Date().toISOString();
    let scanned = 0;
    let corrected = 0;
    let rateLimited = false;
    const details: { pid: string; from: string; to: string }[] = [];

    // 2개씩 동시 + 500ms 딜레이 (429 방지) — fetch-prices 와 동일 리듬
    for (let i = 0; i < monitors.length; i += 2) {
      const pair = monitors.slice(i, i + 2);
      const results = await Promise.allSettled(
        pair.map(async (m) => {
          const truth = await adapter.getCoupangSaleTruth(m.coupang_product_id);
          if (!truth) return { m, skipped: true };
          const desired: 'active' | 'suspended' = truth.sellable ? 'active' : 'suspended';
          if (desired !== m.coupang_status) {
            await serviceClient
              .from('sh_stock_monitors')
              .update({ coupang_status: desired, last_checked_at: now, updated_at: now })
              .eq('id', m.id);
            // 로그는 best-effort — event_type CHECK 제약 미적용 환경에서도 교정 자체는 성공시킨다.
            await serviceClient.from('sh_stock_monitor_logs').insert({
              monitor_id: m.id,
              megaload_user_id: shUserId,
              event_type: 'coupang_reconcile',
              notes: `실측 교정: ${m.coupang_status}→${desired} (statusName=${truth.statusName}, 재고=${truth.firstStock ?? '-'})`,
            }).then(({ error }) => { if (error) console.warn('[reconcile] log insert skipped:', error.message); });
            return { m, changed: true, from: m.coupang_status, to: desired };
          }
          return { m, changed: false };
        }),
      );

      for (const r of results) {
        if (r.status === 'rejected') {
          if (r.reason instanceof Error && r.reason.message.includes('429')) { rateLimited = true; break; }
          continue;
        }
        scanned++;
        if (r.value.changed) {
          corrected++;
          details.push({ pid: r.value.m.coupang_product_id, from: r.value.from!, to: r.value.to! });
        }
      }
      if (rateLimited) break;
      await sleep(500);
    }

    return NextResponse.json({
      scanned,
      corrected,
      details,
      cursor: monitors[monitors.length - 1]?.id,
      done: monitors.length < limit,
      rateLimited,
    });
  } catch (err) {
    void logSystemError({ source: 'megaload/stock-monitor/reconcile-coupang', error: err }).catch(() => {});
    return NextResponse.json({ error: err instanceof Error ? err.message : '서버 오류' }, { status: 500 });
  }
}
