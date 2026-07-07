import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;

/**
 * GET /api/megaload/stock-monitor/logs?monitorId=...&limit=...
 * 단일 모니터의 변경 이력(가격 변동 · 품절/재입고 · 쿠팡 중지/재개)을 시계열로 반환.
 * 품절동기화 화면의 상품별 이력 토글에서 on-demand 로 호출한다.
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const monitorId = searchParams.get('monitorId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 300);

    if (!monitorId) {
      return NextResponse.json({ error: 'monitorId가 필요합니다.' }, { status: 400 });
    }

    // 소유권 확인 — 남의 모니터 이력 조회 차단
    const { data: monitor } = await serviceClient
      .from('sh_stock_monitors')
      .select('id')
      .eq('id', monitorId)
      .eq('megaload_user_id', shUserId)
      .maybeSingle();

    if (!monitor) {
      return NextResponse.json({ error: '해당 모니터를 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: logs, error } = await serviceClient
      .from('sh_stock_monitor_logs')
      .select(`
        id, event_type,
        source_status_before, source_status_after,
        coupang_status_before, coupang_status_after,
        source_price_before, source_price_after,
        our_price_before, our_price_after,
        option_name, action_taken, action_success, error_message,
        price_skip_reason, created_at
      `)
      .eq('monitor_id', monitorId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ logs: logs || [] });
  } catch (err) {
    console.error('stock-monitor logs GET error:', err);
    void logSystemError({ source: 'megaload/stock-monitor/logs', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
