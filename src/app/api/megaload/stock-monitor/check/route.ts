import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { processMonitorBatch, type MonitorRecord } from '@/lib/megaload/services/stock-monitor-engine';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

/**
 * POST /api/megaload/stock-monitor/check
 * 특정 모니터 수동 즉시 체크
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '메가로드 계정이 필요합니다.';
      return NextResponse.json({ error: msg }, { status: 403 });
    }

    const body = await request.json();
    const { monitorIds } = body as { monitorIds: string[] };

    if (!monitorIds || !Array.isArray(monitorIds) || monitorIds.length === 0) {
      return NextResponse.json({ error: 'monitorIds 배열이 필요합니다.' }, { status: 400 });
    }

    if (monitorIds.length > 20) {
      return NextResponse.json({ error: '한 번에 최대 20개까지 체크 가능합니다.' }, { status: 400 });
    }

    // 모니터 조회
    const { data: monitors, error: queryErr } = await serviceClient
      .from('sh_stock_monitors')
      .select('id, megaload_user_id, product_id, coupang_product_id, source_url, source_status, coupang_status, option_statuses, consecutive_errors, consecutive_unknowns, registered_option_name, price_follow_rule, source_price_last, our_price_last, price_last_updated_at, price_last_applied_at, pending_price_change')
      .in('id', monitorIds)
      .eq('megaload_user_id', shUserId);

    if (queryErr) return NextResponse.json({ error: queryErr.message }, { status: 500 });
    if (!monitors || monitors.length === 0) {
      return NextResponse.json({ error: '해당 모니터를 찾을 수 없습니다.' }, { status: 404 });
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

    const results = await processMonitorBatch(typedMonitors, serviceClient);

    return NextResponse.json({
      results,
      checked: results.filter(r => r.checked).length,
      changed: results.filter(r => r.changed).length,
    });

  } catch (err) {
    console.error('stock-monitor check error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
