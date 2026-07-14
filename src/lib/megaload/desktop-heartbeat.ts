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

export async function touchTokenWorkerHeartbeat(
  serviceClient: SupabaseClient,
  megaloadUserId: string,
  hostname: string | null = null,
): Promise<void> {
  try {
    await serviceClient
      .from('megaload_worker_heartbeats')
      .upsert(
        {
          megaload_user_id: megaloadUserId,
          worker_id: TOKEN_WORKER_ID,
          hostname,
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'megaload_user_id,worker_id' },
      );
  } catch {
    /* best-effort — 하트비트 실패가 모니터링/결과 전송을 막지 않도록 무음 처리 */
  }
}
