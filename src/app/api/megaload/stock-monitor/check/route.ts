import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { processMonitorBatch, type MonitorRecord } from '@/lib/megaload/services/stock-monitor-engine';

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
    const { data: mu } = await serviceClient.from('megaload_users').select('id').eq('user_id', user.id).single();
    if (!mu) return NextResponse.json({ error: '메가로드 계정이 필요합니다.' }, { status: 403 });
    const shUserId = (mu as Record<string, unknown>).id as string;

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
      .select('id, megaload_user_id, product_id, coupang_product_id, source_url, source_status, coupang_status, option_statuses, consecutive_errors, consecutive_unknowns, registered_option_name')
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
