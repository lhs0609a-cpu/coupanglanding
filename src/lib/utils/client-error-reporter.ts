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
const DEDUP_WINDOW_MS = 5 * 60_000; // 60s → 5분 (보고 폭주 차단, Vercel cost 폭증 방지)

// URL kill-switch — 특정 source 가 짧은 시간에 3회 넘게 보고되면 30분 보고 정지.
// 한 라우트가 모든 사용자에 timeout cascade 일으킬 때 사용자 N명 × 5분 보고가
// N × 6회 보고되는 폭증을 차단.
const _killSwitch = new Map<string, { count: number; windowStart: number; until: number }>();
const KILL_THRESHOLD = 3;
const KILL_WINDOW_MS = 60_000;
const KILL_DURATION_MS = 30 * 60_000;

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

    // kill-switch — 같은 source 가 1분 내 3회 넘으면 30분 정지
    const ks = _killSwitch.get(params.source);
    if (ks && now < ks.until) return; // 정지 중
    if (!ks || now - ks.windowStart > KILL_WINDOW_MS) {
      _killSwitch.set(params.source, { count: 1, windowStart: now, until: 0 });
    } else {
      ks.count += 1;
      if (ks.count > KILL_THRESHOLD) {
        ks.until = now + KILL_DURATION_MS;
        return;
      }
    }

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
