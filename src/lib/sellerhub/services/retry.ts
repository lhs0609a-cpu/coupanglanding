// ============================================================
// Exponential Backoff Retry 유틸리티
// ============================================================

export interface RetryOptions {
  maxRetries?: number;      // 최대 재시도 횟수 (기본 3)
  initialDelayMs?: number;  // 초기 지연 (기본 500ms)
  maxDelayMs?: number;      // 최대 지연 (기본 5000ms)
  backoffFactor?: number;   // 지연 배수 (기본 2)
  retryableErrors?: string[]; // 재시도할 에러 메시지 패턴
}

/**
 * Exponential backoff으로 비동기 함수를 재시도한다.
 * 네트워크 일시 장애, Rate Limit 등에 대응.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 500,
    maxDelayMs = 5000,
    backoffFactor = 2,
    retryableErrors,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // 마지막 시도면 에러 throw
      if (attempt === maxRetries) break;

      // retryableErrors가 지정되어 있으면 매칭되는 에러만 재시도
      if (retryableErrors && retryableErrors.length > 0) {
        const msg = lastError.message.toLowerCase();
        const isRetryable = retryableErrors.some((pattern) =>
          msg.includes(pattern.toLowerCase()),
        );
        if (!isRetryable) break;
      }

      // 지연 (exponential backoff + jitter)
      const baseDelay = Math.min(
        initialDelayMs * Math.pow(backoffFactor, attempt),
        maxDelayMs,
      );
      const jitter = baseDelay * 0.2 * Math.random();
      await new Promise((r) => setTimeout(r, baseDelay + jitter));
    }
  }

  throw lastError!;
}
