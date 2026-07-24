import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 토큰(64자 인증코드) 방식 도우미의 생존신호를 세션 방식과 같은 테이블에 기록한다.
 * ---------------------------------------------------------------------------
 * 배경: 좌측 상단 "도우미 연결됨" 배지(DesktopStatusIndicator → /thumbnail-jobs/worker-status)는
 *   오직 `megaload_worker_heartbeats` 테이블만 읽는데, 이 테이블은 OAuth 로그인 세션이 있을 때만
 *   도는 셸 하트비트(worker_heartbeat RPC)만 채운다. 인증코드만 붙여넣어 연결한 사용자는
 *   모니터링(품절 확인)이 실제로 돌아 서버에 결과를 보내는데도 이 테이블엔 아무것도 안 남아
 *   배지가 "미연결"로 오탐됐다.
 *
 * → 데스크탑 토큰 엔드포인트가 호출될 때마다(매 틱 /monitors, 결과 전송 /results 등) 같은 테이블에
 *   upsert 해서, 토큰 방식 연결도 "연결됨"으로 정확히 반영되게 한다.
 *
 * worker_id 는 세션 셸 하트비트('<hostname>-app')와 겹치지 않도록 'desktop-monitor' 로 고정.
 * (online 판정은 최근 90초 내 '아무 행이나 있으면 참'이라 별도 행이어도 문제없음.)
 * 실패해도 원래 요청 흐름을 막지 않는다(best-effort) — 하트비트는 부가 신호일 뿐.
 */
const TOKEN_WORKER_ID = 'desktop-monitor';

/** 앱의 로컬 서버(pair-server) 주소 — 웹 올인원이 생성결과·이미지를 직독하는 통로. */
export interface LocalEndpointInput {
  port?: unknown;
  nonce?: unknown;
}

/**
 * 앱이 알려온 {port,nonce} 를 검증한다. 형태가 틀리면 null(=기존 값 유지).
 * 포트는 사용자 PC의 loopback 포트라 범위만 본다.
 */
export function parseLocalEndpoint(input: LocalEndpointInput | null | undefined) {
  const port = typeof input?.port === 'string' ? Number(input.port) : input?.port;
  const nonce = input?.nonce;
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (typeof nonce !== 'string' || nonce.length < 8 || nonce.length > 128) return null;
  return { port, nonce };
}

export async function touchTokenWorkerHeartbeat(
  serviceClient: SupabaseClient,
  megaloadUserId: string,
  hostname: string | null = null,
  /**
   * 로컬 서버 주소. 세션(OAuth) 하트비트가 이미 싣고 있지만, 그 세션이 만료·폐기되면
   * 조용히 멈춰서 웹이 주소를 영영 못 찾는다(실측: 세션 사망 후 10시간 동안 올인원 폴더 선택 불가).
   * 토큰 인증은 만료가 없어 그 상황에서도 살아있으므로, 같은 주소를 이쪽으로도 받아 둔다.
   */
  localEndpoint: LocalEndpointInput | null = null,
): Promise<void> {
  try {
    const ep = parseLocalEndpoint(localEndpoint);
    await serviceClient
      .from('megaload_worker_heartbeats')
      .upsert(
        {
          megaload_user_id: megaloadUserId,
          worker_id: TOKEN_WORKER_ID,
          hostname,
          last_seen: new Date().toISOString(),
          // 못 받았으면 컬럼을 건드리지 않는다 — 이전에 알던 주소를 NULL 로 지우지 않기 위함.
          ...(ep ? { local_endpoint: ep } : {}),
        },
        { onConflict: 'megaload_user_id,worker_id' },
      );
  } catch {
    /* best-effort — 하트비트 실패가 모니터링/결과 전송을 막지 않도록 무음 처리 */
  }
}

/** 쿼리스트링(?port=&nonce=)에서 로컬 서버 주소를 뽑는다. 없으면 null. */
export function localEndpointFromQuery(url: URL): LocalEndpointInput | null {
  const port = url.searchParams.get('lport');
  const nonce = url.searchParams.get('lnonce');
  return port && nonce ? { port, nonce } : null;
}
