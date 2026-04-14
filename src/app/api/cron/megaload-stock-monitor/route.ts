import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { processMonitorBatch, type MonitorRecord } from '@/lib/megaload/services/stock-monitor-engine';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';

export const maxDuration = 300; // 5분 타임아웃

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * GET /api/cron/megaload-stock-monitor
 * 30분마다 실행 — 품절 모니터링 배치 처리 + 가격 자동 백필
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceClient();

  // ── Phase 1: 가격 미조회 모니터 자동 백필 (our_price_last IS NULL) ──
  let priceBackfilled = 0;
  try {
    // 가격 미조회 모니터를 사용자별로 그룹
    const { data: needPrice } = await supabase
      .from('sh_stock_monitors')
      .select('id, megaload_user_id, coupang_product_id, coupang_status')
      .is('our_price_last', null)
      .not('coupang_product_id', 'eq', '')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(30); // 크론 1회당 30개씩

    if (needPrice && needPrice.length > 0) {
      // 사용자별 어댑터 캐시
      const adapterCache = new Map<string, CoupangAdapter>();
      const now = new Date().toISOString();

      for (const m of needPrice as { id: string; megaload_user_id: string; coupang_product_id: string; coupang_status: string }[]) {
        try {
          let adapter = adapterCache.get(m.megaload_user_id);
          if (!adapter) {
            adapter = await getAuthenticatedAdapter(supabase, m.megaload_user_id, 'coupang') as CoupangAdapter;
            adapterCache.set(m.megaload_user_id, adapter);
          }

          const detail = await adapter.getProductDetail(m.coupang_product_id);
          if (detail) {
            const price = detail.items?.[0]?.salePrice ?? null;
            const status: 'active' | 'suspended' = detail.statusName === 'APPROVE' ? 'active' : 'suspended';
            const updates: Record<string, unknown> = { updated_at: now, last_checked_at: now };
            if (price != null && price > 0) updates.our_price_last = price;
            if (status !== m.coupang_status) updates.coupang_status = status;
            await supabase.from('sh_stock_monitors').update(updates).eq('id', m.id);
            priceBackfilled++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : '';
          if (msg.includes('429')) {
            console.log('[stock-monitor-cron] 429 rate limit during price backfill, stopping');
            break;
          }
        }
        await sleep(1000); // 1초 딜레이 (429 방지)
      }
    }
  } catch (err) {
    console.error('[stock-monitor-cron] Price backfill error:', err);
  }

  // ── Phase 2: 정기 품절 모니터링 (기존 로직) ──
  const { data: monitors, error: queryErr } = await supabase
    .from('sh_stock_monitors')
    .select('id, megaload_user_id, product_id, coupang_product_id, source_url, source_status, coupang_status, option_statuses, consecutive_errors, consecutive_unknowns, registered_option_name, price_follow_rule, source_price_last, our_price_last, price_last_updated_at, price_last_applied_at, pending_price_change')
    .eq('is_active', true)
    .lt('consecutive_errors', 10)
    .not('source_url', 'eq', '') // source_url이 있는 것만 (품절 체크 가능한 것)
    .or(`last_checked_at.is.null,last_checked_at.lt.${new Date(Date.now() - 30 * 60 * 1000).toISOString()}`)
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(20); // 429 방지: 50 → 20 (순차 4초 딜레이, 20개 × 4초 = ~80초)

  if (queryErr) {
    console.error('[stock-monitor-cron] Query error:', queryErr);
    return NextResponse.json({ error: queryErr.message, priceBackfilled }, { status: 500 });
  }

  if (!monitors || monitors.length === 0) {
    return NextResponse.json({ message: '체크 대상 없음', checked: 0, priceBackfilled });
  }

  const typedMonitors: MonitorRecord[] = monitors.map(m => ({
    id: m.id as string,
    megaload_user_id: m.megaload_user_id as string,
    product_id: m.product_id as string,
    coupang_product_id: m.coupang_product_id as string,
    source_url: m.source_url as string,
    source_status: (m.source_status as MonitorRecord['source_status']) || 'unknown',
    coupang_status: (m.coupang_status as MonitorRecord['coupang_status']) || 'active',
    option_statuses: (m.option_statuses as MonitorRecord['option_statuses']) || [],
    consecutive_errors: (m.consecutive_errors as number) || 0,
    consecutive_unknowns: (m.consecutive_unknowns as number) || 0,
    registered_option_name: (m.registered_option_name as string) || null,
    price_follow_rule: (m.price_follow_rule as MonitorRecord['price_follow_rule']) || null,
    source_price_last: (m.source_price_last as number | null) ?? null,
    our_price_last: (m.our_price_last as number | null) ?? null,
    price_last_updated_at: (m.price_last_updated_at as string | null) ?? null,
    price_last_applied_at: (m.price_last_applied_at as string | null) ?? null,
    pending_price_change: (m.pending_price_change as MonitorRecord['pending_price_change']) || null,
  }));

  const results = await processMonitorBatch(typedMonitors, supabase);

  const rateLimited = results.filter(r => r.error?.includes('429')).length;

  const stats = {
    total: results.length,
    checked: results.filter(r => r.checked).length,
    changed: results.filter(r => r.changed).length,
    errors: results.filter(r => r.error).length,
    rateLimited,
    actions: results.filter(r => r.action).map(r => r.action),
    priceBackfilled,
  };

  console.log(`[stock-monitor-cron] 완료: ${stats.checked}/${stats.total} 체크, ${stats.changed} 변경, ${stats.errors} 에러 (429: ${rateLimited}), ${priceBackfilled} 가격백필`);

  return NextResponse.json({
    message: '품절 모니터링 완료',
    ...stats,
  });
}
