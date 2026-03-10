/**
 * 프로모션 (쿠폰 자동 적용) 상수
 */

// ── 제한값 ──────────────────────────────────────────────
export const INSTANT_COUPON_MAX_ITEMS = 10_000; // 즉시할인 쿠폰 1개당 최대 적용 상품
export const DOWNLOAD_COUPON_MAX_ITEMS = 100;   // 다운로드 쿠폰 1개당 최대 적용 상품

// ── 타이밍 ──────────────────────────────────────────────
export const POLLING_INTERVAL_MS = 5_000;    // 진행 상황 폴링 간격
export const STATS_REFRESH_MS = 3_000;       // 통계 갱신 간격
export const DEFAULT_DURATION_DAYS = 30;     // 기본 쿠폰 유효기간
export const BATCH_SIZE = 15;                // 배치당 처리 상품 수

// ── 추적 상태 라벨/색상 ─────────────────────────────────
export const TRACKING_STATUS_LABELS: Record<string, string> = {
  pending: '대기',
  processing: '처리중',
  completed: '완료',
  failed: '실패',
  skipped: '건너뜀',
};

export const TRACKING_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  skipped: 'bg-yellow-100 text-yellow-700',
};

// ── 일괄 적용 상태 라벨 ─────────────────────────────────
export const BULK_STATUS_LABELS: Record<string, string> = {
  collecting: '상품 수집 중',
  applying: '쿠폰 적용 중',
  completed: '완료',
  failed: '실패',
  cancelled: '취소됨',
};

// ── 설정 가이드 4단계 ───────────────────────────────────
export const SETUP_GUIDE_STEPS = [
  {
    step: 1,
    title: 'API 연동',
    description: 'WING에서 Open API Access Key/Secret Key를 발급받고 계정 설정에서 등록하세요.',
  },
  {
    step: 2,
    title: '계약서 선택',
    description: '쿠폰을 적용할 계약서(Contract)를 선택하세요.',
  },
  {
    step: 3,
    title: '쿠폰 설정',
    description: '즉시할인 / 다운로드 쿠폰 유형별 설정을 완료하세요.',
  },
  {
    step: 4,
    title: '적용 시작',
    description: '설정을 저장하면 전체 상품에 쿠폰이 일괄 적용됩니다.',
  },
];

// ── 할인 타입 라벨 ──────────────────────────────────────
export const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  RATE: '정률 (%)',
  FIXED: '정액 (원)',
};
