/**
 * Next.js instrumentation hook — 서버 부팅 시 1회 실행.
 *
 * 목적: undici 전역 dispatcher 에 keep-alive 설정.
 *   - 매 fetch 가 새 TCP/TLS 연결을 만들면 핸드셰이크에 100~300ms 소요.
 *   - 같은 호스트(쿠팡 프록시, Supabase 등) 반복 호출 시 연결 재사용으로 절감.
 *   - cron/배치 register 등 동일 호스트에 수십 회 fetch 하는 경로에서 누적 효과 큼.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  try {
    // undici 는 Node 18+ 에 내장된 fetch 구현체. devDependency 로 명시 안 했으므로
    // 타입 우회 후 동적 import. 실패 시 fetch 는 기본 dispatcher 로 동작 (no-op).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const undici = await import('undici' as string).catch(() => null) as any;
    if (!undici?.Agent || !undici?.setGlobalDispatcher) {
      console.warn('[instrumentation] undici 모듈 미감지 — 기본 fetch dispatcher 사용');
      return;
    }
    undici.setGlobalDispatcher(
      new undici.Agent({
        keepAliveTimeout: 60_000,        // idle 연결 60s 까지 유지
        keepAliveMaxTimeout: 600_000,    // 단일 연결 최대 10분
        connections: 256,                // host 당 동시 연결 풀
        pipelining: 1,                   // 안전 우선 (HTTP/1.1 pipelining off)
      }),
    );
    console.log('[instrumentation] undici keep-alive agent 활성화');
  } catch (err) {
    // Edge runtime / undici 부재 환경에서는 무시
    console.warn('[instrumentation] undici 설정 실패 (무시 가능):', err instanceof Error ? err.message : err);
  }
}
