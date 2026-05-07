// ============================================================
// 글로벌 fetch wrapper — timeout / abort / 에러 정규화
//
// 사용:
//   import { fetchJson } from '@/lib/utils/fetch-with-timeout';
//
//   const data = await fetchJson<MyType>('/api/foo');
//   const data = await fetchJson('/api/foo', { method: 'POST', body: JSON.stringify(...) }, { timeoutMs: 60000 });
//
// 처리:
//   1. AbortSignal.timeout(N) 자동 적용 (기본 30초)
//   2. !response.ok → throw FetchError (status + body)
//   3. JSON 파싱 자동
//   4. AbortError → "요청 시간 초과" 메시지로 정규화
//
// 273개 silent fetch 가 hang 시 finally 도달 못해 loading 영구되는 근본 문제 해결.
// ============================================================

const DEFAULT_TIMEOUT_MS = 30_000;

export interface FetchOptions {
  timeoutMs?: number;          // 기본 30초
  retries?: number;            // 기본 0 (재시도 안 함)
  retryDelayMs?: number;       // 재시도 사이 대기 (기본 500ms)
}

export class FetchError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'FetchError';
    this.status = status;
    this.body = body;
  }
}

export class FetchTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`요청 시간 초과 (${timeoutMs / 1000}초)`);
    this.name = 'FetchTimeoutError';
  }
}

/**
 * timeout + JSON 자동 파싱 + 에러 정규화.
 * Returns parsed JSON. Throws FetchError | FetchTimeoutError on failure.
 */
export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit = {},
  opts: FetchOptions = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = opts.retries ?? 0;
  const retryDelayMs = opts.retryDelayMs ?? 500;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          ...init,
          signal: init.signal ?? controller.signal,
        });
        clearTimeout(timer);

        const contentType = res.headers.get('content-type') || '';
        let body: unknown = null;
        if (contentType.includes('application/json')) {
          body = await res.json().catch(() => null);
        } else {
          body = await res.text().catch(() => null);
        }

        if (!res.ok) {
          const msg = (body && typeof body === 'object' && 'error' in body)
            ? String((body as { error: unknown }).error)
            : `HTTP ${res.status}`;
          throw new FetchError(msg, res.status, body);
        }

        return body as T;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastErr = err;
      // AbortError → timeout
      if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, retryDelayMs * (attempt + 1)));
          continue;
        }
        throw new FetchTimeoutError(timeoutMs);
      }
      // FetchError 5xx → retry candidate
      if (err instanceof FetchError && err.status >= 500 && attempt < retries) {
        await new Promise(r => setTimeout(r, retryDelayMs * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * timeout + 응답을 사용자에게 보여줄 단일 문자열 에러로 변환.
 * UI에 setError(msg) 형태로 바로 쓰기 좋음.
 */
export async function fetchJsonSafe<T = unknown>(
  url: string,
  init: RequestInit = {},
  opts: FetchOptions = {},
): Promise<{ data: T; error: null } | { data: null; error: string }> {
  try {
    const data = await fetchJson<T>(url, init, opts);
    return { data, error: null };
  } catch (err) {
    if (err instanceof FetchTimeoutError) return { data: null, error: err.message };
    if (err instanceof FetchError) return { data: null, error: err.message };
    return { data: null, error: err instanceof Error ? err.message : '요청 실패' };
  }
}
