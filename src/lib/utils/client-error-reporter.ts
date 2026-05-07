/**
 * 클라이언트 사이드 에러를 system_logs 에 보고하는 헬퍼.
 *
 * 사용:
 *   reportClientError({ source: 'my/contract', message: '서명 timeout', context: {...} })
 *
 * 자동:
 *   - 페이지 path / user-agent 첨부
 *   - silently fails — 보고 자체가 사용자 흐름을 끊으면 안 됨
 *   - 메모리 dedup: 60초 내 동일 (source + message) 은 다시 안 보냄
 */

const recentReports = new Map<string, number>();
const DEDUP_WINDOW_MS = 60_000;

export interface ClientReportParams {
  source: string;
  message: string;
  level?: 'error' | 'warn' | 'info';
  category?: string;
  context?: Record<string, unknown>;
}

export async function reportClientError(params: ClientReportParams): Promise<void> {
  if (typeof window === 'undefined') return; // SSR 가드
  try {
    const dedupKey = `${params.source}::${params.message.slice(0, 200)}`;
    const now = Date.now();
    const last = recentReports.get(dedupKey);
    if (last && now - last < DEDUP_WINDOW_MS) return;
    recentReports.set(dedupKey, now);

    // 메모리 누수 방지
    if (recentReports.size > 200) {
      const cutoff = now - DEDUP_WINDOW_MS;
      for (const [k, t] of recentReports.entries()) {
        if (t < cutoff) recentReports.delete(k);
      }
    }

    await fetch('/api/admin/system-logs/client-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: params.level || 'error',
        source: params.source,
        message: params.message,
        category: params.category,
        path: window.location.pathname + window.location.search,
        context: params.context,
      }),
      // 보고 자체에 timeout — 보고 실패가 사용자 사이드 동작 막으면 안 됨
      signal: AbortSignal.timeout(5_000),
      // 페이지 unload 중에도 가능하게
      keepalive: true,
    });
  } catch {
    // 보고 실패는 silent
  }
}
