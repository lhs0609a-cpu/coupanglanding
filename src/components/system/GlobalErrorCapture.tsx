'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/utils/client-error-reporter';

/**
 * 클라이언트 사이드 unhandled 에러 + Promise rejection 글로벌 캡처.
 *
 * 잡는 것:
 * - window.onerror — synchronous JS 에러 (e.g. ReferenceError, TypeError)
 * - unhandledrejection — async promise 가 catch 안 되어 dropped
 *
 * 못 잡는 것 (다른 메커니즘):
 * - React render 에러 → ErrorBoundary 가 잡음 (별도)
 * - Network 에러 (fetch 실패) → fetch 호출자가 catch 해야 함 (fetchJson 헬퍼에서 자동 보고)
 *
 * SSR-safe — 마운트는 useEffect 안에서.
 */
export default function GlobalErrorCapture() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 페이지 언로드/숨김 중에는 in-flight fetch 가 흔히 abort 됨(navigation/탭닫기).
    //  이때의 실패는 서버 문제가 아니므로 보고 제외.
    let pageUnloading = false;
    const markUnload = () => { pageUnloading = true; };

    const onError = (event: ErrorEvent) => {
      const message = event.error instanceof Error
        ? `${event.error.name}: ${event.error.message}`
        : event.message || 'unknown error';
      const stack = event.error instanceof Error ? event.error.stack : undefined;

      reportClientError({
        source: `client/window.onerror`,
        message,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: stack?.split('\n').slice(0, 8).join('\n'),
        },
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error
        ? `${reason.name}: ${reason.message}`
        : typeof reason === 'string'
          ? reason
          : (() => { try { return JSON.stringify(reason); } catch { return String(reason); } })();
      const stack = reason instanceof Error ? reason.stack : undefined;

      reportClientError({
        source: `client/unhandledrejection`,
        message: message.slice(0, 1000),
        context: {
          stack: stack?.split('\n').slice(0, 8).join('\n'),
        },
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('pagehide', markUnload);
    window.addEventListener('beforeunload', markUnload);

    // window.fetch 인터셉트 — raw fetch 의 timeout/5xx/network 실패 자동 보고
    // 호출자에게 결과/에러는 그대로 전파, 보고는 silent.
    const originalFetch = window.fetch.bind(window);
    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
      // 자기 자신 보고 endpoint 는 무한 루프 방지
      const isSelfReport = url.includes('/api/admin/system-logs/client-report');

      try {
        const res = await originalFetch(input, init);
        if (!isSelfReport && res.status >= 500) {
          reportClientError({
            source: 'window.fetch/5xx',
            level: 'error',
            message: `[${res.status}] ${url.slice(0, 200)}`,
            context: { url, status: res.status, method: init?.method || 'GET' },
          });
        }
        return res;
      } catch (err) {
        if (!isSelfReport) {
          const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
          const isAbort = err instanceof DOMException && err.name === 'AbortError';
          // RSC prefetch (Next.js Link hover) — 사용자가 페이지 떠나면 흔히 cancel.
          const isRscPrefetch = url.includes('_rsc=');
          // "Failed to fetch"/"NetworkError"/"Load failed" = 응답 받기 전 네트워크 단절/취소.
          //   페이지 이동·탭 닫기·절전·일시 와이파이 끊김이 대부분이라 서버 actionable 아님.
          //   (브라우저가 navigation abort 를 AbortError 대신 TypeError 로 던지는 케이스 포함)
          const msg = err instanceof Error ? err.message : '';
          const isBareNetwork = err instanceof TypeError
            && /failed to fetch|networkerror|load failed|network request failed/i.test(msg);
          if (isTimeout) {
            // timeout 만 보고(실제 느린 엔드포인트 신호) — warn
            reportClientError({
              source: 'window.fetch/timeout',
              level: 'warn',
              message: `${(err as Error).name}: ${(err as Error).message} — ${url.slice(0, 200)}`,
              context: { url, method: init?.method || 'GET' },
            });
          } else if (!isAbort && !isRscPrefetch && !isBareNetwork && !pageUnloading) {
            // 진짜 예외적 네트워크 실패만 error 로 (대부분의 노이즈는 위에서 걸러짐)
            reportClientError({
              source: 'window.fetch/network',
              level: 'error',
              message: err instanceof Error
                ? `${err.name}: ${err.message} — ${url.slice(0, 200)}`
                : `unknown error — ${url.slice(0, 200)}`,
              context: { url, method: init?.method || 'GET' },
            });
          }
        }
        throw err;
      }
    };
    window.fetch = wrappedFetch;

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('pagehide', markUnload);
      window.removeEventListener('beforeunload', markUnload);
      // 다른 컴포넌트가 fetch 를 또 wrap 했을 수 있으니 ===로 검사
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    };
  }, []);

  return null;
}
