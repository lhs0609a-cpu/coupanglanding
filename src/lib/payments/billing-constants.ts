/**
 * 결제 관련 전역 상수
 *
 * 청구일은 전체 PT 유저 공통으로 매월 5일 고정.
 * 변경하려면 이 파일만 수정하면 cron, UI, 안내문구 전체에 자동 반영됨.
 */

export const BILLING_DAY = 5;

export const PAYMENT_LOCK_LEVELS = {
  NORMAL: 0,
  PARTIAL_WRITE_BLOCK: 1,
  FULL_WRITE_BLOCK: 2,
  FULL_LOCKDOWN: 3,
} as const;

export type PaymentLockLevel =
  (typeof PAYMENT_LOCK_LEVELS)[keyof typeof PAYMENT_LOCK_LEVELS];

/**
 * 결제 실패일(payment_overdue_since)로부터의 경과일에 따른 락 레벨 산출.
 * - D+0: 정상 (0)
 * - D+1 ~ D+2: 1단계 부분 쓰기 차단 — 신규 상품 등록/일괄 처리 차단, 그 외 조회/일반 쓰기 허용
 * - D+3 ~ D+6: 2단계 전체 쓰기 차단 — 모든 POST/PUT/DELETE 차단, 조회만 허용
 * - D+7 이상: 3단계 완전 봉쇄 — 결제 페이지(`/my/settings`)만 접근 가능
 */
export function calculateLockLevel(
  overdueSince: Date | string | null,
  now: Date = new Date(),
): PaymentLockLevel {
  if (!overdueSince) return PAYMENT_LOCK_LEVELS.NORMAL;
  const since = typeof overdueSince === 'string' ? new Date(overdueSince) : overdueSince;
  const days = Math.floor((now.getTime() - since.getTime()) / (1000 * 60 * 60 * 24));
  if (days >= 7) return PAYMENT_LOCK_LEVELS.FULL_LOCKDOWN;
  if (days >= 3) return PAYMENT_LOCK_LEVELS.FULL_WRITE_BLOCK;
  if (days >= 1) return PAYMENT_LOCK_LEVELS.PARTIAL_WRITE_BLOCK;
  return PAYMENT_LOCK_LEVELS.NORMAL;
}
