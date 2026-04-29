/**
 * 결제 관련 전역 상수
 *
 * 청구일은 전체 PT 유저 공통으로 매월 3일 고정.
 * 변경하려면 이 파일만 수정하면 cron, UI, 안내문구 전체에 자동 반영됨.
 */

export const BILLING_DAY = 3;

export const PAYMENT_LOCK_LEVELS = {
  NORMAL: 0,
  PARTIAL_WRITE_BLOCK: 1,
  FULL_WRITE_BLOCK: 2,
  FULL_LOCKDOWN: 3,
} as const;

export type PaymentLockLevel =
  (typeof PAYMENT_LOCK_LEVELS)[keyof typeof PAYMENT_LOCK_LEVELS];

/**
 * 결제 자동 재시도 정책: D+0(최초) → D+1 → D+2 → D+3 (24h 간격, 최대 3회).
 * 재시도가 모두 끝난 후(또는 즉시 실패 코드)에만 payment_overdue_since 가 마킹된다.
 */
export const MAX_PAYMENT_RETRY_COUNT = 3;
export const PAYMENT_RETRY_INTERVAL_HOURS = 24;

/**
 * retryInProgress 유예 최대 일수.
 * 재시도 진행 플래그가 어떤 이유로든(DB 오류/코드 버그) 해제되지 않고 남더라도
 * 이 기간을 넘어서면 락 계산이 정상 적용되어 "영구 유예" 를 막는다.
 */
export const MAX_RETRY_GRACE_DAYS = 4;

/**
 * KST(UTC+9) 기준 날짜/시각을 얻기 위한 헬퍼.
 * Vercel 크론은 UTC 로 돌고 서버 타임존도 UTC 이므로, 한국 날짜 판정을 위해
 * 반드시 이 헬퍼로 getUTCDate/getUTCFullYear 를 써야 한다.
 */
export function kstNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

/** KST 기준 '오늘' 일(day of month) */
export function kstDay(now: Date = new Date()): number {
  return kstNow(now).getUTCDate();
}

/** KST 기준 'YYYY-MM-DD' */
export function kstDateStr(now: Date = new Date()): string {
  return kstNow(now).toISOString().slice(0, 10);
}

/** KST 기준 'YYYY-MM' */
export function kstMonthStr(now: Date = new Date()): string {
  return kstNow(now).toISOString().slice(0, 7);
}

/**
 * 결제 실패일(payment_overdue_since)로부터의 경과일에 따른 락 레벨 산출.
 * - D+0: 정상 (0)
 * - D+1 ~ D+2: 1단계 부분 쓰기 차단 — 신규 상품 등록/일괄 처리 차단, 그 외 조회/일반 쓰기 허용
 * - D+3 ~ D+6: 2단계 전체 쓰기 차단 — 모든 POST/PUT/DELETE 차단, 조회만 허용
 * - D+7 이상: 3단계 완전 봉쇄 — 결제 페이지(`/my/settings`)만 접근 가능
 *
 * retryInProgress=true 인 동안에는 강제로 0(정상) 반환 — 재시도 기간 락 유예.
 * 단, overdueSince 로부터 MAX_RETRY_GRACE_DAYS 를 넘어서면 유예를 무시하고 계산한다
 * (플래그가 오류로 남는 좀비 상태 방지).
 */
export function calculateLockLevel(
  overdueSince: Date | string | null,
  now: Date = new Date(),
  options?: { retryInProgress?: boolean },
): PaymentLockLevel {
  if (!overdueSince) return PAYMENT_LOCK_LEVELS.NORMAL;
  const since = typeof overdueSince === 'string' ? new Date(overdueSince) : overdueSince;
  const days = Math.floor((now.getTime() - since.getTime()) / (1000 * 60 * 60 * 24));

  // 재시도 유예는 MAX_RETRY_GRACE_DAYS 까지만 인정
  if (options?.retryInProgress && days <= MAX_RETRY_GRACE_DAYS) {
    return PAYMENT_LOCK_LEVELS.NORMAL;
  }

  if (days >= 7) return PAYMENT_LOCK_LEVELS.FULL_LOCKDOWN;
  if (days >= 3) return PAYMENT_LOCK_LEVELS.FULL_WRITE_BLOCK;
  if (days >= 1) return PAYMENT_LOCK_LEVELS.PARTIAL_WRITE_BLOCK;
  return PAYMENT_LOCK_LEVELS.NORMAL;
}
