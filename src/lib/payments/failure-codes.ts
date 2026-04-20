/**
 * 토스페이먼츠 결제 실패 코드 분류
 *
 * Non-retryable: 카드/빌링키 자체 문제 → 재시도해도 계속 실패. 즉시 최종 실패로 처리.
 * Retryable    : 일시적/잔액/한도/통신 문제 → 24h 후 자동 재시도 의미 있음.
 *
 * 분류 원칙:
 *   1) 카드/빌링키 무효, 카드사 영구 거절 → Non-retryable
 *   2) 잔액/한도/타임아웃/시스템 오류 → Retryable
 *   3) 모르는 코드 → Non-retryable 로 안전하게 간주(무한 재시도 방지).
 *      과거엔 Retryable 로 뒀으나, D+3까지 락이 유예되는 동안 서비스가 무료로 제공되는
 *      보안 허점이 있어 정책을 역전함. 관리자가 대시보드에서 수동 재시도 가능.
 */

export const NON_RETRYABLE_CODES = new Set<string>([
  // 카드 자체 무효/정지/분실/만료
  'INVALID_CARD',
  'INVALID_CARD_NUMBER',
  'INVALID_CARD_EXPIRATION',
  'INVALID_CARD_IDENTITY',
  'INVALID_CARD_INSTALLMENT_PLAN',
  'INVALID_STOPPED_CARD',
  'STOPPED_CARD',
  'LOST_CARD',
  'EXPIRED_CARD',
  'BLOCKED_CARD',

  // 카드사가 영구 거절
  'REJECT_CARD_COMPANY',
  'FORBIDDEN_CARD_COMPANY',
  'NOT_REGISTERED_CARD',
  'NOT_SUPPORTED_CARD_TYPE',
  'REJECT_ACCOUNT_PAYMENT',
  'REJECT_CARD_PAYMENT',
  'CARD_AUTH_FAILED',
  'RESTRICTED_TRANSFER_ACCOUNT',

  // 빌링키 자체가 무효 (재발급 필요)
  'INVALID_BILLING_KEY',
  'NOT_FOUND_BILLING_KEY',
  'EXPIRED_BILLING_KEY',
  'UNAUTHORIZED_KEY',

  // 한도 초과 — 월/영구 초과는 재시도해도 동일
  'EXCEED_MAX_MONTHLY_PAYMENT_AMOUNT',
  'EXCEED_MAX_PAYMENT_AMOUNT',

  // 사용자가 취소/abort 한 결제 → 자동 재시도는 오히려 이상 행동
  'PAY_PROCESS_CANCELED',
  'PAY_PROCESS_ABORTED',
]);

/**
 * Retryable 로 확정된 코드 (명시 allow-list).
 * 여기에 없으면 모두 Non-retryable 로 간주된다.
 */
export const RETRYABLE_CODES = new Set<string>([
  'NOT_ENOUGH_BALANCE',
  'EXCEED_MAX_DAILY_PAYMENT_AMOUNT',
  'EXCEED_MAX_ONE_DAY_AMOUNT',
  'EXCEED_MAX_AUTH_COUNT',
  'EXCEED_MAX_CARD_INSTALLMENT_PLAN',
  'CARD_PROCESSING_ERROR',
  'PROVIDER_ERROR',
  'FAILED_INTERNAL_SYSTEM_PROCESSING',
  'FAILED_PAYMENT_INTERNAL_SYSTEM_ERROR',
  'FAILED_CARD_COMPANY_INTERNAL_PROCESSING',
  'COMMON_ERROR',
]);

/**
 * 빌링키 자체가 무효/만료 — 재시도 루프가 무의미.
 * 감지 시 카드를 즉시 비활성화하고 사용자에게 "카드 재등록 필요" 알림.
 */
export const BILLING_KEY_INVALID_CODES = new Set<string>([
  'INVALID_BILLING_KEY',
  'NOT_FOUND_BILLING_KEY',
  'EXPIRED_BILLING_KEY',
  'UNAUTHORIZED_KEY',
]);

export function isBillingKeyInvalid(code?: string | null): boolean {
  if (!code) return false;
  return BILLING_KEY_INVALID_CODES.has(code);
}

/**
 * 결제 상태가 DONE 이 아닐 때 (토스 client 에서 NOT_DONE_* 로 throw) 는
 * 일시적 상태(READY 등) 일 수 있으므로 재시도 가능으로 본다.
 */
export function isRetryable(code?: string | null): boolean {
  if (!code) return true; // 네트워크/타임아웃류 — 재시도 가능
  if (code.startsWith('NOT_DONE_')) return true;
  if (NON_RETRYABLE_CODES.has(code)) return false;
  if (RETRYABLE_CODES.has(code)) return true;
  // 모르는 코드: 안전하게 non-retryable. 관리자가 수동 재시도 가능.
  return false;
}

/**
 * 사용자에게 보여줄 실패 사유 한국어 라벨.
 * 알 수 없는 코드는 원본 메시지를 그대로 노출.
 */
export const FAILURE_LABELS: Record<string, string> = {
  INVALID_CARD: '유효하지 않은 카드',
  INVALID_CARD_NUMBER: '카드번호 오류',
  INVALID_CARD_EXPIRATION: '카드 유효기간 오류',
  INVALID_CARD_IDENTITY: '카드 본인확인 실패',
  INVALID_STOPPED_CARD: '정지된 카드',
  STOPPED_CARD: '정지된 카드',
  LOST_CARD: '분실/도난 카드',
  EXPIRED_CARD: '만료된 카드',
  BLOCKED_CARD: '차단된 카드',
  REJECT_CARD_COMPANY: '카드사 승인 거절',
  REJECT_CARD_PAYMENT: '카드 결제 거절',
  REJECT_ACCOUNT_PAYMENT: '계좌 결제 거절',
  FORBIDDEN_CARD_COMPANY: '결제 불가 카드사',
  NOT_REGISTERED_CARD: '미등록 카드',
  NOT_SUPPORTED_CARD_TYPE: '지원하지 않는 카드 유형',
  CARD_AUTH_FAILED: '카드 인증 실패',
  RESTRICTED_TRANSFER_ACCOUNT: '이체 제한 계좌',
  INVALID_BILLING_KEY: '빌링키 무효 (재등록 필요)',
  NOT_FOUND_BILLING_KEY: '빌링키 없음 (재등록 필요)',
  EXPIRED_BILLING_KEY: '빌링키 만료 (재등록 필요)',
  UNAUTHORIZED_KEY: '인증 키 오류',
  NOT_ENOUGH_BALANCE: '잔액 부족',
  EXCEED_MAX_DAILY_PAYMENT_AMOUNT: '일일 결제 한도 초과',
  EXCEED_MAX_ONE_DAY_AMOUNT: '일 한도 초과',
  EXCEED_MAX_MONTHLY_PAYMENT_AMOUNT: '월 결제 한도 초과',
  EXCEED_MAX_PAYMENT_AMOUNT: '결제 한도 초과',
  EXCEED_MAX_AUTH_COUNT: '인증 횟수 초과',
  EXCEED_MAX_CARD_INSTALLMENT_PLAN: '할부 한도 초과',
  CARD_PROCESSING_ERROR: '카드사 처리 오류 (일시)',
  PROVIDER_ERROR: '결제 대행사 오류 (일시)',
  FAILED_INTERNAL_SYSTEM_PROCESSING: '결제 시스템 일시 오류',
  FAILED_PAYMENT_INTERNAL_SYSTEM_ERROR: '결제 시스템 일시 오류',
  FAILED_CARD_COMPANY_INTERNAL_PROCESSING: '카드사 시스템 일시 오류',
  PAY_PROCESS_CANCELED: '사용자 결제 취소',
  PAY_PROCESS_ABORTED: '결제 중단',
  COMMON_ERROR: '일시적 오류',
};

export function failureLabel(code?: string | null, fallback?: string | null): string {
  if (code) {
    if (FAILURE_LABELS[code]) return FAILURE_LABELS[code];
    if (code.startsWith('NOT_DONE_')) return '결제 미완료 상태 — 다시 시도 필요';
  }
  return fallback || code || '알 수 없는 오류';
}
