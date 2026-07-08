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
    const desktopAgeMin = heartbeatMs ? Math.floor((now - heartbeatMs) / 60_000) : -1;

    // 같은 도우미 앱의 GPU/이미지 워커 하트비트 — worker_heartbeat() RPC로 30초마다 갱신된다.
    // 사이드바(90초)가 보는 신호와 동일 소스. 품절모니터가 결과 제출을 뜸하게 해도,
    // 이 신호가 신선하면 앱은 확실히 켜져 있다 → 두 지표(사이드바/배너)를 이 값으로 통일한다.
    const { data: hbRows } = await serviceClient
      .from('megaload_worker_heartbeats')
      .select('last_seen')
      .eq('megaload_user_id', shUserId)
      .order('last_seen', { ascending: false })
      .limit(1);
    const workerHbMs = hbRows && hbRows.length > 0
      ? new Date((hbRows[0] as { last_seen: string }).last_seen).getTime()
      : 0;
    const workerHbAgeMin = workerHbMs ? Math.floor((now - workerHbMs) / 60_000) : -1;

    // 두 신호 중 더 최근 것 = 앱의 실제 마지막 생존시각.
    const effectiveHbMs = Math.max(heartbeatMs, workerHbMs);
    const heartbeatAgeMin = effectiveHbMs ? Math.floor((now - effectiveHbMs) / 60_000) : -1;

    // 최근 1시간 동안 실제로 체크된 모니터 수.
    // ⚠️ 과거엔 sh_stock_monitor_logs(event_type='desktop_check') 행을 셌으나,
    //    그 로그는 results 라우트에서 "상태가 바뀌고 + 에러가 아닐 때"만 기록된다.
    //    → 상태가 안정적이거나(대부분) 에러(네이버 속도제한)면 0건이 되어,
    //      데스크탑이 정상 동작 중인데도 "동작하지 않음" 오진(false alarm)이 발생했다.
    //    실제 체크 신호는 results 라우트가 매 결과마다 갱신하는 last_checked_at 이다.
    const oneHourAgo = new Date(now - 60 * 60_000).toISOString();
    const { count: recentChecks } = await serviceClient
      .from('sh_stock_monitors')
      .select('*', { count: 'exact', head: true })
      .eq('megaload_user_id', shUserId)
      .eq('is_active', true)
      .gte('last_checked_at', oneHourAgo);

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

    // 앱 생존 판정 — 두 서브시스템 중 하나라도 신선하면 앱은 켜져 있다.
    //  · 워커 하트비트: 30초 주기라 강한 신호 → 5분(10틱 유실 허용)
    //  · 데스크탑(품절모니터) 하트비트: 결과 제출 기반이라 관대하게 30분
    const WORKER_ALIVE_MIN = 5;
    const DESKTOP_ALIVE_MIN = 30;
    const desktopAlive = desktopAgeMin >= 0 && desktopAgeMin < DESKTOP_ALIVE_MIN;
    const workerAlive = workerHbAgeMin >= 0 && workerHbAgeMin < WORKER_ALIVE_MIN;
    const isAlive = desktopAlive || workerAlive;

    return NextResponse.json({
      isAlive,
      tokenIssued: !!u.desktop_app_token,
      tokenIssuedAt: u.desktop_app_token_issued_at || null,
      lastHeartbeatAt: effectiveHbMs ? new Date(effectiveHbMs).toISOString() : null,
      heartbeatAgeMin,
      workerHeartbeatAgeMin: workerHbAgeMin,
      desktopHeartbeatAgeMin: desktopAgeMin,
      monitorsTotal: totalMonitors || 0,
      monitorsPending: pendingMonitors || 0,
      monitorsCheckedRecently: recentChecks || 0,
      diagnosis: !u.desktop_app_token
        ? '토큰이 발급되지 않았습니다. 인증코드 발급 버튼을 눌러주세요.'
        : !isAlive
          ? heartbeatAgeMin < 0
            ? '데스크탑 앱이 한 번도 서버에 접속한 적 없습니다. 앱이 설치되어 실행 중인지 확인하세요.'
            : `데스크탑 앱이 ${heartbeatAgeMin}분 전에 마지막 접속. 앱이 종료되었을 수 있습니다.`
          : workerAlive && !desktopAlive
            ? '도우미 앱은 켜져 있으나(워커 신호 확인), 품절모니터 결과 제출은 아직입니다. 다음 cron tick(5분 이내)에 처리됩니다.'
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
