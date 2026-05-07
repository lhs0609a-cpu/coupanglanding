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
          // AbortError 는 의도적인 cancel 이 많음 (페이지 이동 등) — 보고 안 함
          if (!isAbort) {
            reportClientError({
              source: isTimeout ? 'window.fetch/timeout' : 'window.fetch/network',
              level: isTimeout ? 'warn' : 'error',
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
      // 다른 컴포넌트가 fetch 를 또 wrap 했을 수 있으니 ===로 검사
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    };
  }, []);

  return null;
}
