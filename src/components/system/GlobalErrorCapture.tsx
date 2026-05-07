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

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
