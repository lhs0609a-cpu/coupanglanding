import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { processMonitorBatch, type MonitorRecord } from '@/lib/megaload/services/stock-monitor-engine';

export const maxDuration = 300; // 5분 타임아웃

/**
 * GET /api/cron/megaload-stock-monitor
 * 30분마다 실행 — 품절 모니터링 배치 처리
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceClient();

  // 체크 대상 조회: is_active AND consecutive_errors < 10 AND 체크 주기 경과
  const { data: monitors, error: queryErr } = await supabase
    .from('sh_stock_monitors')
    .select('id, megaload_user_id, product_id, coupang_product_id, source_url, source_status, coupang_status, option_statuses, consecutive_errors, consecutive_unknowns, registered_option_name, price_follow_rule, source_price_last, our_price_last, price_last_updated_at, price_last_applied_at, pending_price_change')
    .eq('is_active', true)
    .lt('consecutive_errors', 10)
    .neq('source_url', '')
    .or(`last_checked_at.is.null,last_checked_at.lt.${new Date(Date.now() - 30 * 60 * 1000).toISOString()}`)
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(100);

  if (queryErr) {
    console.error('[stock-monitor-cron] Query error:', queryErr);
    return NextResponse.json({ error: queryErr.message }, { status: 500 });
  }

  if (!monitors || monitors.length === 0) {
    return NextResponse.json({ message: '체크 대상 없음', checked: 0 });
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

  // 통계 집계
  const stats = {
    total: results.length,
    checked: results.filter(r => r.checked).length,
    changed: results.filter(r => r.changed).length,
    errors: results.filter(r => r.error).length,
    actions: results.filter(r => r.action).map(r => r.action),
  };

  console.log(`[stock-monitor-cron] 완료: ${stats.checked}/${stats.total} 체크, ${stats.changed} 변경, ${stats.errors} 에러`);

  return NextResponse.json({
    message: '품절 모니터링 완료',
    ...stats,
  });
}
