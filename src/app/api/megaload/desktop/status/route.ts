import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

export const maxDuration = 30;

/**
 * GET /api/megaload/desktop/status
 * 웹에서 사용자가 자신의 데스크탑 앱 연결 상태 진단.
 *
 * 응답:
 *   - tokenIssued: 토큰 발급된 적 있는지
 *   - heartbeat: 마지막 ping 시각
 *   - monitorsTotal: 사용자 모니터 수
 *   - monitorsCheckedRecently: 최근 1시간 내 데스크탑 체크 받은 모니터 수
 *   - monitorsPending: 처리 대기 모니터 수 (미확인/오류)
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);

    const { data: shUser } = await serviceClient
      .from('megaload_users')
      .select('desktop_app_token, desktop_app_token_issued_at, desktop_app_last_heartbeat')
      .eq('id', shUserId)
      .single();

    const u = (shUser ?? {}) as {
      desktop_app_token?: string;
      desktop_app_token_issued_at?: string;
      desktop_app_last_heartbeat?: string;
    };

    const now = Date.now();
    const heartbeatMs = u.desktop_app_last_heartbeat
      ? new Date(u.desktop_app_last_heartbeat).getTime()
      : 0;
    const heartbeatAgeMin = heartbeatMs ? Math.floor((now - heartbeatMs) / 60_000) : -1;

    // 최근 1시간 데스크탑 체크 수
    const oneHourAgo = new Date(now - 60 * 60_000).toISOString();
    const { count: recentChecks } = await serviceClient
      .from('sh_stock_monitor_logs')
      .select('*', { count: 'exact', head: true })
      .eq('megaload_user_id', shUserId)
      .eq('event_type', 'desktop_check')
      .gte('created_at', oneHourAgo);

    // 전체 모니터 수
    const { count: totalMonitors } = await serviceClient
      .from('sh_stock_monitors')
      .select('*', { count: 'exact', head: true })
      .eq('megaload_user_id', shUserId)
      .eq('is_active', true);

    // 처리 대기 모니터 수
    const { count: pendingMonitors } = await serviceClient
      .from('sh_stock_monitors')
      .select('*', { count: 'exact', head: true })
      .eq('megaload_user_id', shUserId)
      .eq('is_active', true)
      .or('source_status.in.(미확인,확인불가,오류,unknown,error),consecutive_errors.gte.1');

    const isAlive = heartbeatAgeMin >= 0 && heartbeatAgeMin < 30;

    return NextResponse.json({
      isAlive,
      tokenIssued: !!u.desktop_app_token,
      tokenIssuedAt: u.desktop_app_token_issued_at || null,
      lastHeartbeatAt: u.desktop_app_last_heartbeat || null,
      heartbeatAgeMin,
      monitorsTotal: totalMonitors || 0,
      monitorsPending: pendingMonitors || 0,
      monitorsCheckedRecently: recentChecks || 0,
      diagnosis: !u.desktop_app_token
        ? '토큰이 발급되지 않았습니다. 인증코드 발급 버튼을 눌러주세요.'
        : heartbeatAgeMin < 0
          ? '데스크탑 앱이 한 번도 서버에 접속한 적 없습니다. 앱이 설치되어 실행 중인지 확인하세요.'
          : heartbeatAgeMin > 30
            ? `데스크탑 앱이 ${heartbeatAgeMin}분 전에 마지막 접속. 앱이 종료되었을 수 있습니다.`
            : (recentChecks || 0) === 0
              ? '데스크탑 앱은 서버에 접속 중이지만, 아직 모니터 처리 결과가 도착하지 않았습니다. 다음 cron tick (5분 이내)에 처리됩니다.'
              : `정상 동작 중. 최근 1시간 동안 ${recentChecks}건 처리됨.`,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
