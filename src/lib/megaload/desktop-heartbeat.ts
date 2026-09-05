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
  /**
   * 도우미 PC 의 네이버 로그인 상태(참/거짓만 — 계정 정보는 오지 않는다).
   * 이게 없으면 서버는 누가 로그인했는지 알 수 없어서, 안내를 보낼 대상조차 고를 수 없다.
   * 못 받았으면 컬럼을 건드리지 않는다 — 구버전 도우미가 기존 값을 지우면 안 된다.
   */
  naver: NaverStateInput | null = null,
): Promise<void> {
  try {
    const ep = parseLocalEndpoint(localEndpoint);
    const nv = parseNaverState(naver);
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
          ...(nv ? {
            naver_logged_in: nv.loggedIn,
            naver_persistent: nv.persistent,
            naver_credential: nv.credential,
            naver_checked_at: new Date().toISOString(),
          } : {}),
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

/**
 * 네이버 로그인 상태 — 참/거짓 세 개뿐이다.
 * ★ 아이디도 비밀번호도 여기 없다. 서버는 "로그인됐는가"만 알면 되고, 그 이상은 알 이유가 없다.
 */
export interface NaverStateInput {
  loggedIn?: unknown;
  persistent?: unknown;
  credential?: unknown;
}

const asBool = (v: unknown): boolean | null => {
  if (v === true || v === '1' || v === 'true') return true;
  if (v === false || v === '0' || v === 'false') return false;
  return null;
};

/**
 * 셋 중 하나라도 제대로 오면 그 값을 쓴다. 하나도 없으면 null → 컬럼을 건드리지 않는다.
 * (구버전 도우미는 이 값을 안 보내므로, 그때 기존 값을 지워 버리면 화면이 거짓말을 한다)
 */
export function parseNaverState(input: NaverStateInput | null | undefined) {
  if (!input) return null;
  const loggedIn = asBool(input.loggedIn);
  if (loggedIn === null) return null;              // 로그인 여부가 없으면 의미가 없다
  return {
    loggedIn,
    persistent: asBool(input.persistent),
    credential: asBool(input.credential),
  };
}

/** 쿼리스트링(?nv=&nvp=&nvc=)에서 네이버 상태를 뽑는다. 없으면 null. */
export function naverStateFromQuery(url: URL): NaverStateInput | null {
  const nv = url.searchParams.get('nv');
  if (nv === null) return null;
  return {
    loggedIn: nv,
    persistent: url.searchParams.get('nvp'),
    credential: url.searchParams.get('nvc'),
  };
}
