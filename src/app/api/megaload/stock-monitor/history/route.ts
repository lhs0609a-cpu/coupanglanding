import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;

/**
 * GET /api/megaload/stock-monitor/history?monitorId=xxx
 * 단일 모니터(상품)의 전체 이력 타임라인.
 *  - 현재 상태/가격/체크시각 요약(monitor)
 *  - 시간순 변경 이력(logs): 품절/재판매/삭제·쿠팡 중지/재개·원본가/판매가 변동·오류
 *
 * 이력은 sh_stock_monitor_logs 에 "변화가 있을 때만" 기록되므로 그 자체가 changelog다.
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
    if (!monitorId) {
      return NextResponse.json({ error: 'monitorId 파라미터가 필요합니다.' }, { status: 400 });
    }

    // 소유권 검증 겸 현재 상태 요약 조회
    const { data: monitor, error: monErr } = await serviceClient
      .from('sh_stock_monitors')
      .select(`
        id, product_id, coupang_product_id, source_url,
        source_status, coupang_status, is_active,
        last_checked_at, last_changed_at, last_action_at,
        source_price_last, our_price_last,
        price_last_updated_at, price_last_applied_at
      `)
      .eq('id', monitorId)
      .eq('megaload_user_id', shUserId)
      .single();

    if (monErr || !monitor) {
      return NextResponse.json({ error: '모니터를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 이력 — 최신순, 최대 200건.
    const { data: logs, error: logErr } = await serviceClient
      .from('sh_stock_monitor_logs')
      .select(`
        id, event_type,
        source_status_before, source_status_after,
        coupang_status_before, coupang_status_after,
        source_price_before, source_price_after,
        our_price_before, our_price_after,
        option_name, action_taken, action_success,
        price_skip_reason, error_message, notes, created_at
      `)
      .eq('monitor_id', monitorId)
      .eq('megaload_user_id', shUserId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (logErr) {
      return NextResponse.json({ error: logErr.message }, { status: 500 });
    }

    return NextResponse.json({ monitor, logs: logs || [] });
  } catch (err) {
    console.error('stock-monitor history GET error:', err);
    void logSystemError({ source: 'megaload/stock-monitor/history', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
