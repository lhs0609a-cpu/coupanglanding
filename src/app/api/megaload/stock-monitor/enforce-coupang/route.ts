import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DRY_RUN = process.env.SALE_TOGGLE_DRY_RUN === '1';
const KILLSWITCH = process.env.SALE_TOGGLE_KILLSWITCH === '1';

/**
 * POST /api/megaload/stock-monitor/enforce-coupang
 * 오버셀 근본 해소 — 도우미가 확정한 원본 상태(source_status)를 쿠팡에 실제로 강제 반영한다.
 *
 * 왜 필요한가:
 *   기존 cron 은 서버가 네이버를 *재크롤*해 그 결과로만 토글했다. 그런데 서버 IP 는 네이버에
 *   자주 차단(429/403)돼 'error' 조기리턴 → 도우미가 이미 알아낸 품절/삭제가 쿠팡에 전파 안 됨.
 *   게다가 cron reconcile 쿼리엔 'removed & active' 가 빠져 있어 삭제 상품이 방치됐다(오버셀).
 *
 * 이 엔드포인트는 네이버 재크롤 없이:
 *   1) source_status ∈ (removed, sold_out) & coupang_status=active  → 쿠팡 실측(onSale) 확인 후 실제 판매중이면 **중지**
 *   2) source_status = in_stock          & coupang_status=suspended → 쿠팡 실측 확인 후 실제 중지면 **재개**
 *   확정 불일치(도우미 상태 ↔ 쿠팡 실측)에만 작동해 오판을 최소화한다.
 *
 * body: { scope?: 'oversell'|'restock'|'both'(기본), cursor?, limit?(기본 20, 최대 40) }
 * 반환: scanned / suspended / resumed / details / cursor / done
 */
export async function POST(request: Request) {
  try {
    if (KILLSWITCH) return NextResponse.json({ error: 'SALE_TOGGLE_KILLSWITCH 활성 — 토글 전면 중단 상태' }, { status: 423 });

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
    const scope = body.scope === 'oversell' || body.scope === 'restock' ? body.scope : 'both';
    const cursor = typeof body.cursor === 'string' ? body.cursor : undefined;
    const limit = Math.min(40, Math.max(1, Number(body.limit) || 20));

    let adapter: CoupangAdapter;
    try {
      adapter = (await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang')) as CoupangAdapter;
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'API 인증 실패' }, { status: 400 });
    }

    // 대상 선택 — 확정 불일치 후보. 오버셀(원본 품절/삭제인데 쿠팡 active) 우선.
    let query = serviceClient
      .from('sh_stock_monitors')
      .select('id, coupang_product_id, source_status, coupang_status')
      .eq('megaload_user_id', shUserId)
      .eq('is_active', true)
      .not('coupang_product_id', 'is', null)
      .not('coupang_product_id', 'eq', '')
      .order('id', { ascending: true })
      .limit(limit);

    if (scope === 'oversell') {
      query = query.in('source_status', ['removed', 'sold_out']).eq('coupang_status', 'active');
    } else if (scope === 'restock') {
      query = query.eq('source_status', 'in_stock').eq('coupang_status', 'suspended');
    } else {
      query = query.or(
        [
          'and(source_status.eq.removed,coupang_status.eq.active)',
          'and(source_status.eq.sold_out,coupang_status.eq.active)',
          'and(source_status.eq.in_stock,coupang_status.eq.suspended)',
        ].join(','),
      );
    }
    if (cursor) query = query.gt('id', cursor);

    const { data: rows, error: qErr } = await query;
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

    const monitors = (rows || []) as { id: string; coupang_product_id: string; source_status: string; coupang_status: string }[];
    if (monitors.length === 0) {
      return NextResponse.json({ scanned: 0, suspended: 0, resumed: 0, details: [], done: true });
    }

    const now = new Date().toISOString();
    let scanned = 0, suspended = 0, resumed = 0, rateLimited = false;
    const details: { pid: string; action: string; note: string }[] = [];

    for (const m of monitors) {
      try {
        // 쿠팡 실측 — 확정 불일치일 때만 작동
        const truth = await adapter.getCoupangSaleTruth(m.coupang_product_id);
        if (!truth) { scanned++; continue; }

        const wantSuspend = ['removed', 'sold_out'].includes(m.source_status) && truth.sellable;
        const wantResume = m.source_status === 'in_stock' && !truth.sellable && truth.statusName === '승인완료';

        if (wantSuspend) {
          if (DRY_RUN) {
            details.push({ pid: m.coupang_product_id, action: 'suspend_dryrun', note: `원본=${m.source_status}, 쿠팡 판매중` });
          } else {
            await adapter.suspendProduct(m.coupang_product_id);
            await serviceClient.from('sh_stock_monitors')
              .update({ coupang_status: 'suspended', last_action_at: now, last_checked_at: now, updated_at: now })
              .eq('id', m.id);
            await serviceClient.from('sh_stock_monitor_logs').insert({
              monitor_id: m.id, megaload_user_id: shUserId, event_type: 'coupang_suspended',
              source_status_before: m.source_status, source_status_after: m.source_status,
              notes: `enforce: 원본 ${m.source_status} 확정 → 쿠팡 중지(오버셀 차단)`,
            }).then(({ error }) => { if (error) console.warn('[enforce] log skip:', error.message); });
            suspended++;
            details.push({ pid: m.coupang_product_id, action: 'suspended', note: `원본 ${m.source_status}` });
          }
        } else if (wantResume) {
          if (DRY_RUN) {
            details.push({ pid: m.coupang_product_id, action: 'resume_dryrun', note: '원본 판매중, 쿠팡 중지' });
          } else {
            await adapter.resumeProduct(m.coupang_product_id);
            await serviceClient.from('sh_stock_monitors')
              .update({ coupang_status: 'active', last_action_at: now, last_checked_at: now, updated_at: now })
              .eq('id', m.id);
            await serviceClient.from('sh_stock_monitor_logs').insert({
              monitor_id: m.id, megaload_user_id: shUserId, event_type: 'coupang_resumed',
              source_status_before: m.source_status, source_status_after: m.source_status,
              notes: 'enforce: 원본 판매중 확정 → 쿠팡 재개',
            }).then(({ error }) => { if (error) console.warn('[enforce] log skip:', error.message); });
            resumed++;
            details.push({ pid: m.coupang_product_id, action: 'resumed', note: '원본 in_stock' });
          }
        }
        scanned++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'fail';
        if (msg.includes('429')) { rateLimited = true; break; }
        details.push({ pid: m.coupang_product_id, action: 'error', note: msg.slice(0, 120) });
        scanned++;
      }
      await sleep(400);
    }

    return NextResponse.json({
      scanned, suspended, resumed, details,
      dryRun: DRY_RUN,
      cursor: monitors[monitors.length - 1]?.id,
      done: monitors.length < limit,
      rateLimited,
    });
  } catch (err) {
    void logSystemError({ source: 'megaload/stock-monitor/enforce-coupang', error: err }).catch(() => {});
    return NextResponse.json({ error: err instanceof Error ? err.message : '서버 오류' }, { status: 500 });
  }
}
