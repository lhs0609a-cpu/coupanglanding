export const EXPENSE_CATEGORIES = [
  { value: 'server', label: '서버비' },
  { value: 'ai_usage', label: 'AI 사용비' },
  { value: 'fixed', label: '고정비' },
  { value: 'tax', label: '세금' },
  { value: 'marketing', label: '마케팅' },
  { value: 'other', label: '기타' },
] as const;

export const REVENUE_SOURCES = [
  { value: 'pt', label: 'PT 코칭' },
  { value: 'program', label: '프로그램' },
  { value: 'other', label: '기타' },
] as const;

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: '대기중',
  submitted: '제출됨',
  reviewed: '송금대기중',
  deposited: '송금완료',
  confirmed: '정산완료',
  rejected: '거절됨',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-700',
  reviewed: 'bg-purple-100 text-purple-700',
  deposited: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export const PAYMENT_FLOW_STEPS = [
  { key: 'submitted', label: '매출 제출' },
  { key: 'reviewed', label: '송금 대기' },
  { key: 'deposited', label: '송금 완료' },
  { key: 'confirmed', label: '정산 완료' },
] as const;

export const PT_STATUS_LABELS: Record<string, string> = {
  active: '활성',
  paused: '일시정지',
  terminated: '종료',
};

export const PT_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  terminated: 'bg-red-100 text-red-700',
};

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  new: '신규',
  contacted: '연락완료',
  consulting: '상담중',
  converted: '전환',
  rejected: '거절',
};

export const APPLICATION_STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-yellow-100 text-yellow-700',
  consulting: 'bg-purple-100 text-purple-700',
  converted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  draft: '초안',
  sent: '발송됨',
  signed: '서명완료',
  expired: '만료',
  terminated: '해지',
};

export const CONTRACT_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  signed: 'bg-green-100 text-green-700',
  expired: 'bg-yellow-100 text-yellow-700',
  terminated: 'bg-red-100 text-red-700',
};

// 계약 모드 (2자/3자)
export const CONTRACT_MODE_LABELS: Record<string, string> = {
  single: '2자 계약',
  triple: '3자 계약',
};

export const CONTRACT_MODE_COLORS: Record<string, string> = {
  single: 'bg-gray-100 text-gray-700',
  triple: 'bg-purple-100 text-purple-700',
};

export const BUSINESS_RELATIONS = [
  '본인',
  '가족(배우자)',
  '가족(부모)',
  '가족(형제)',
  '지인',
  '기타',
] as const;

export const WITHDRAWAL_STATUS_LABELS: Record<string, string> = {
  pending: '탈퇴 심사중',
  approved: '탈퇴 승인',
  rejected: '탈퇴 반려',
};

export const WITHDRAWAL_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700',
  approved: 'bg-red-100 text-red-700',
  rejected: 'bg-gray-100 text-gray-600',
};

// 온보딩 단계 정의
import type { OnboardingStepDefinition } from '@/lib/supabase/types';

export const ONBOARDING_STEPS: OnboardingStepDefinition[] = [
  {
    key: 'legal_education',
    order: 1,
    label: '리셀 합법성 교육',
    description: '리셀(재판매)이 합법임을 이해하고 퀴즈를 통과해주세요.',
    verificationType: 'quiz',
  },
  {
    key: 'margin_education',
    order: 2,
    label: '마진 계산 교육',
    description: '마진 계산 방법을 이해하고 퀴즈를 통과해주세요.',
    verificationType: 'quiz',
  },
  {
    key: 'business_registration',
    order: 3,
    label: '사업자등록',
    description: '사업자등록증 사본을 업로드해주세요.',
    verificationType: 'evidence_upload',
  },
  {
    key: 'online_sales_report',
    order: 4,
    label: '통신판매업 신고',
    description: '통신판매업 신고증 사본을 업로드해주세요.',
    verificationType: 'evidence_upload',
  },
  {
    key: 'coupang_seller_signup',
    order: 5,
    label: '쿠팡 입점 회원가입',
    description: '쿠팡 셀러 가입 완료 화면 캡처를 업로드해주세요.',
    verificationType: 'evidence_upload',
  },
  {
    key: 'coupang_wing_integration',
    order: 6,
    label: '쿠팡 Wing 연동',
    description: '쿠팡 Wing 연동 완료 화면 캡처를 업로드해주세요.',
    verificationType: 'evidence_upload',
  },
  {
    key: 'first_product_listing',
    order: 7,
    label: '첫 상품 등록',
    description: '첫 상품 등록 완료 화면 캡처를 업로드해주세요.',
    verificationType: 'evidence_upload',
  },
  {
    key: 'penalty_prevention',
    order: 8,
    label: '쿠팡 페널티 방지',
    description: '쿠팡 페널티를 예방하는 방법을 이해하고 퀴즈를 통과해주세요.',
    verificationType: 'quiz',
  },
  {
    key: 'cs_returns_education',
    order: 9,
    label: 'CS/반품 대응',
    description: '고객 서비스와 반품 대응 방법을 이해하고 퀴즈를 통과해주세요.',
    verificationType: 'quiz',
  },
  {
    key: 'essential_tips',
    order: 10,
    label: '셀러 핵심 노하우',
    description: '성공적인 쿠팡 셀러를 위한 핵심 노하우를 배우고 퀴즈를 통과해주세요.',
    verificationType: 'quiz',
  },
  {
    key: 'contract_signing',
    order: 11,
    label: '계약서 서명',
    description: '계약서 서명을 완료해주세요.',
    verificationType: 'auto_linked',
    autoLinkSource: 'contract',
  },
  {
    key: 'first_revenue_report',
    order: 12,
    label: '첫 매출 정산',
    description: '첫 매출 정산을 제출해주세요.',
    verificationType: 'auto_linked',
    autoLinkSource: 'monthly_report',
  },
];

export const ONBOARDING_STATUS_LABELS: Record<string, string> = {
  pending: '미완료',
  submitted: '검토 대기',
  approved: '승인됨',
  rejected: '반려됨',
  completed: '완료',
};

export const ONBOARDING_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-500',
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-700',
};

export const DEFAULT_SHARE_PERCENTAGE = 30;
export const DEFAULT_DISTRIBUTION_RATIO = [5, 3, 2]; // 메인:서브1:서브2

// 순수익 계산용 비용 항목
export const COST_CATEGORIES = [
  { key: 'cost_product', label: '상품원가', description: '상품 매입/제조 원가' },
  { key: 'cost_commission', label: '쿠팡 수수료', description: '쿠팡 판매수수료' },
  { key: 'cost_advertising', label: '광고비', description: 'CPC/쿠팡 광고비' },
  { key: 'cost_returns', label: '반품/환불비', description: '반품·환불 관련 비용' },
  { key: 'cost_shipping', label: '배송비', description: '배송 관련 비용' },
  { key: 'cost_tax', label: '세금', description: '부가세 등' },
] as const;

export type CostKey = typeof COST_CATEGORIES[number]['key'];

// 자동 비용 비율 (매출 대비 %)
export const DEFAULT_COST_RATES: Record<string, { rate: number; label: string }> = {
  cost_product: { rate: 0.40, label: '상품원가 (매출×40%)' },
  cost_commission: { rate: 0.10, label: '쿠팡 수수료 (매출×10%)' },
  cost_returns: { rate: 0.03, label: '반품/환불비 (매출×3%)' },
  cost_shipping: { rate: 0.05, label: '배송비 (매출×5%)' },
  cost_tax: { rate: 0.10, label: '세금 (매출×10%)' },
};

export const AUTO_COST_KEYS: CostKey[] = [
  'cost_product',
  'cost_commission',
  'cost_returns',
  'cost_shipping',
  'cost_tax',
];

export const MANUAL_COST_KEY: CostKey = 'cost_advertising';

// 정산 상태 라벨
export const SETTLEMENT_STATUS_LABELS: Record<string, string> = {
  not_eligible: '정산 대상 아님',
  pending: '미제출',
  submitted: '처리 중',
  completed: '정산 완료',
  overdue: '지연',
};

// 정산 상태 색상
export const SETTLEMENT_STATUS_COLORS: Record<string, string> = {
  not_eligible: 'bg-gray-100 text-gray-500',
  pending: 'bg-blue-100 text-blue-700',
  submitted: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
};

// 트레이너 상태
export const TRAINER_STATUS_LABELS: Record<string, string> = {
  pending: '승인 대기',
  approved: '활성',
  revoked: '취소',
};

export const TRAINER_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  revoked: 'bg-red-100 text-red-700',
};

export const TRAINER_EARNING_STATUS_LABELS: Record<string, string> = {
  pending: '정산 대기',
  requested: '입금요청',
  deposited: '입금완료',
  confirmed: '입금확인완료',
  paid: '입금확인완료', // 레거시 호환
};

export const TRAINER_EARNING_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  requested: 'bg-yellow-100 text-yellow-700',
  deposited: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  paid: 'bg-green-100 text-green-700', // 레거시 호환
};

export const DEFAULT_TRAINER_BONUS_PERCENTAGE = 5;

// 쿠팡 API 연동 상태
export const API_STATUS_LABELS: Record<string, string> = {
  connected: 'API 연동됨',
  not_connected: '미연동',
  expiring_soon: '만료 임박',
  expired: '만료됨',
};

export const API_STATUS_COLORS: Record<string, string> = {
  connected: 'bg-green-100 text-green-700',
  not_connected: 'bg-gray-100 text-gray-500',
  expiring_soon: 'bg-yellow-100 text-yellow-700',
  expired: 'bg-red-100 text-red-700',
};

// 트렌드 키워드
export const TREND_CATEGORIES = [
  '패션의류', '패션잡화', '화장품/미용', '디지털/가전',
  '가구/인테리어', '출산/육아', '식품', '스포츠/레저',
  '생활/건강', '여가/생활편의', '기타',
] as const;

// 진입 난이도
export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: '쉬움',
  medium: '보통',
  hard: '어려움',
};

export const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  hard: 'bg-red-100 text-red-700',
};

// 시즌성 라벨
export const SEASONALITY_LABELS = [
  '연중', '봄', '여름', '가을', '겨울', '봄/여름', '가을/겨울', '명절/시즌',
] as const;

export const TREND_SCORE_COLORS: Record<string, string> = {
  hot: 'text-red-600',
  rising: 'text-orange-500',
  normal: 'text-gray-500',
};

// 긴급 대응 - 인시던트
export const INCIDENT_TYPE_LABELS: Record<string, string> = {
  brand_complaint: '브랜드 클레임',
  account_penalty: '계정 페널티',
};

export const INCIDENT_SUBTYPE_LABELS: Record<string, string> = {
  trademark: '상표권 침해',
  copyright: '저작권 침해',
  authentic_cert: '정품 인증 요구',
  parallel_import: '병행수입 제한',
  price_policy: '가격 정책 위반',
  delivery_delay: '배송 지연',
  cs_nonresponse: 'CS 미응답',
  false_advertising: '허위/과장 광고',
  product_info_mismatch: '상품 정보 불일치',
  temp_suspension: '계정 일시 정지',
  permanent_suspension: '계정 영구 정지',
};

export const INCIDENT_SEVERITY_LABELS: Record<string, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
  critical: '긴급',
};

export const INCIDENT_SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export const INCIDENT_STATUS_LABELS: Record<string, string> = {
  reported: '신고됨',
  in_progress: '처리 중',
  resolved: '해결됨',
  escalated: '에스컬레이션',
  closed: '종료',
};

export const INCIDENT_STATUS_COLORS: Record<string, string> = {
  reported: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
  escalated: 'bg-red-100 text-red-700',
  closed: 'bg-gray-100 text-gray-500',
};

// 긴급 대응 - 블랙리스트
export const BLACKLIST_RISK_LABELS: Record<string, string> = {
  low: '낮음',
  warning: '주의',
  high: '높음',
  critical: '매우 높음',
};

export const BLACKLIST_RISK_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  warning: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export const COMPLAINT_TYPE_LABELS: Record<string, string> = {
  trademark: '상표권',
  copyright: '저작권',
  authentic_cert: '정품인증',
  parallel_import: '병행수입',
  price_policy: '가격정책',
  other: '기타',
};

export const COMPLAINT_TYPE_COLORS: Record<string, string> = {
  trademark: 'bg-red-100 text-red-700',
  copyright: 'bg-purple-100 text-purple-700',
  authentic_cert: 'bg-blue-100 text-blue-700',
  parallel_import: 'bg-orange-100 text-orange-700',
  price_policy: 'bg-yellow-100 text-yellow-700',
  other: 'bg-gray-100 text-gray-700',
};

// 계약위반 관리
export const VIOLATION_CATEGORY_LABELS: Record<string, string> = {
  settlement: '정산 위반',
  access_rights: '접근권한 위반',
  confidentiality: '기밀유출',
  operation: '운영 위반',
  other: '기타',
};

export const VIOLATION_TYPE_LABELS: Record<string, string> = {
  non_payment_3months: '3개월 이상 미정산',
  false_revenue_report: '매출 허위/미제출',
  access_sharing: '접근권한 양도/공유',
  credential_update_delay: '계정정보 미갱신',
  confidentiality_breach: '기밀정보 유출',
  competing_service: '경쟁서비스 이용',
  product_deactivation_fail: '상품 미비활성화',
  blacklist_brand_sale: '블랙리스트 브랜드 판매',
  seller_account_terminated: '셀러 계정 해지',
  other: '기타',
};

export const VIOLATION_STATUS_LABELS: Record<string, string> = {
  reported: '접수됨',
  investigating: '조사 중',
  dismissed: '무혐의',
  action_taken: '조치 완료',
  resolved: '시정 완료',
  escalated: '단계 격상',
  terminated: '계약해지',
};

export const VIOLATION_STATUS_COLORS: Record<string, string> = {
  reported: 'bg-blue-100 text-blue-700',
  investigating: 'bg-yellow-100 text-yellow-700',
  dismissed: 'bg-gray-100 text-gray-500',
  action_taken: 'bg-orange-100 text-orange-700',
  resolved: 'bg-green-100 text-green-700',
  escalated: 'bg-red-100 text-red-700',
  terminated: 'bg-red-200 text-red-800',
};

export const VIOLATION_ACTION_LABELS: Record<string, string> = {
  notice: '주의',
  warning: '경고',
  corrective: '시정명령',
  termination: '계약해지',
};

export const VIOLATION_ACTION_COLORS: Record<string, string> = {
  notice: 'bg-blue-100 text-blue-700',
  warning: 'bg-yellow-100 text-yellow-700',
  corrective: 'bg-orange-100 text-orange-700',
  termination: 'bg-red-100 text-red-700',
};

export const VIOLATION_CATEGORY_COLORS: Record<string, string> = {
  settlement: 'bg-purple-100 text-purple-700',
  access_rights: 'bg-red-100 text-red-700',
  confidentiality: 'bg-orange-100 text-orange-700',
  operation: 'bg-yellow-100 text-yellow-700',
  other: 'bg-gray-100 text-gray-700',
};

// 위반 유형별 기본 심각도 (즉시해지 사유 판별)
export const IMMEDIATE_TERMINATION_TYPES = [
  'non_payment_3months',
  'access_sharing',
  'confidentiality_breach',
  'seller_account_terminated',
];

// 위반 유형별 관련 계약 조항
export const VIOLATION_CONTRACT_ARTICLES: Record<string, string> = {
  non_payment_3months: '제10조 (계약 해지)',
  false_revenue_report: '제8조 (정산)',
  access_sharing: '제4조 (프로그램 접근권한)',
  credential_update_delay: '제3조 (계정정보 관리)',
  confidentiality_breach: '제13조, 제14조 (기밀유지)',
  competing_service: '제14조 (영업비밀 보호)',
  product_deactivation_fail: '제11조 (계약 종료 후 의무)',
  blacklist_brand_sale: '내부 규정',
  seller_account_terminated: '제10조 (계약 해지)',
  other: '-',
};

// 위험도 점수 계산
export function calculateRiskScore(summary: {
  notice_count: number;
  warning_count: number;
  corrective_count: number;
  active_violations: number;
}): number {
  const score = (summary.notice_count * 5) + (summary.warning_count * 15) + (summary.corrective_count * 30) + (summary.active_violations * 10);
  return Math.min(score, 100);
}

export const RISK_SCORE_LABELS: Record<string, { label: string; color: string }> = {
  good: { label: '양호', color: 'text-green-600' },
  caution: { label: '주의', color: 'text-yellow-600' },
  danger: { label: '위험', color: 'text-orange-600' },
  critical: { label: '심각', color: 'text-red-600' },
};

export function getRiskLevel(score: number): 'good' | 'caution' | 'danger' | 'critical' {
  if (score <= 20) return 'good';
  if (score <= 40) return 'caution';
  if (score <= 70) return 'danger';
  return 'critical';
}

// 세금계산서 상태
export const TAX_INVOICE_STATUS_LABELS: Record<string, string> = {
  issued: '발행됨',
  confirmed: '확인됨',
  cancelled: '취소됨',
};

export const TAX_INVOICE_STATUS_COLORS: Record<string, string> = {
  issued: 'bg-green-100 text-green-700',
  confirmed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
};

// 수동 입력 요청 상태
export const MANUAL_INPUT_REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: '승인 대기',
  approved: '승인됨',
  rejected: '거절됨',
};

export const MANUAL_INPUT_REQUEST_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

// 페널티 트래커
export const PENALTY_CATEGORY_LABELS: Record<string, string> = {
  delivery_delay: '배송지연',
  cs_nonresponse: 'CS 미응답',
  return_rate_excess: '반품률 초과',
  product_info_mismatch: '상품정보 불일치',
  false_advertising: '허위과장광고',
};

export const PENALTY_CATEGORY_COLORS: Record<string, string> = {
  delivery_delay: 'bg-blue-100 text-blue-700',
  cs_nonresponse: 'bg-orange-100 text-orange-700',
  return_rate_excess: 'bg-red-100 text-red-700',
  product_info_mismatch: 'bg-yellow-100 text-yellow-700',
  false_advertising: 'bg-purple-100 text-purple-700',
};

export const PENALTY_DEFAULT_SCORES: Record<string, number> = {
  delivery_delay: 10,
  cs_nonresponse: 15,
  return_rate_excess: 20,
  product_info_mismatch: 15,
  false_advertising: 25,
};

export const PENALTY_RISK_LABELS: Record<string, { label: string; color: string }> = {
  safe: { label: '안전', color: 'text-green-600' },
  caution: { label: '주의', color: 'text-yellow-600' },
  warning: { label: '경고', color: 'text-orange-600' },
  danger: { label: '위험', color: 'text-red-600' },
};

// 수수료 납부 상태
export const FEE_PAYMENT_STATUS_LABELS: Record<string, string> = {
  not_applicable: '해당없음',
  awaiting_payment: '납부 대기',
  paid: '납부 완료',
  overdue: '연체',
  suspended: '접근 정지',
};

export const FEE_PAYMENT_STATUS_COLORS: Record<string, string> = {
  not_applicable: 'bg-gray-100 text-gray-500',
  awaiting_payment: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  suspended: 'bg-red-200 text-red-800',
};

// 셀러 아레나 챌린지 타입
export const CHALLENGE_TYPE_LABELS: Record<string, string> = {
  weekly: '주간',
  monthly: '월간',
  special: '특별',
};

export const CHALLENGE_METRIC_LABELS: Record<string, string> = {
  listings: '상품 등록',
  revenue: '매출',
  streak: '연속 활동',
  points: '포인트',
};

// 고객센터 - 공지사항 카테고리
export const NOTICE_CATEGORY_LABELS: Record<string, string> = {
  system: '시스템',
  policy: '정책',
  promotion: '프로모션',
  education: '교육',
  emergency: '긴급',
};

export const NOTICE_CATEGORY_COLORS: Record<string, string> = {
  system: 'bg-blue-100 text-blue-700',
  policy: 'bg-purple-100 text-purple-700',
  promotion: 'bg-green-100 text-green-700',
  education: 'bg-yellow-100 text-yellow-700',
  emergency: 'bg-red-100 text-red-700',
};

// 고객센터 - 문의 카테고리
export const TICKET_CATEGORY_LABELS: Record<string, string> = {
  settlement: '정산',
  contract: '계약',
  coupang_api: '쿠팡 API',
  tax_invoice: '세금계산서',
  system_error: '시스템 오류',
  other: '기타',
};

export const TICKET_CATEGORY_COLORS: Record<string, string> = {
  settlement: 'bg-purple-100 text-purple-700',
  contract: 'bg-blue-100 text-blue-700',
  coupang_api: 'bg-orange-100 text-orange-700',
  tax_invoice: 'bg-green-100 text-green-700',
  system_error: 'bg-red-100 text-red-700',
  other: 'bg-gray-100 text-gray-700',
};

// 고객센터 - 문의 상태
export const TICKET_STATUS_LABELS: Record<string, string> = {
  pending: '대기중',
  in_progress: '처리중',
  resolved: '완료',
  closed: '종료',
};

export const TICKET_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
};

// 고객센터 - 문의 우선도
export const TICKET_PRIORITY_LABELS: Record<string, string> = {
  low: '낮음',
  normal: '보통',
  high: '높음',
};

export const TICKET_PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  normal: 'bg-blue-100 text-blue-700',
  high: 'bg-red-100 text-red-700',
};

// 고객센터 - FAQ 카테고리
export const FAQ_CATEGORY_LABELS: Record<string, string> = {
  signup: '가입/시작',
  settlement: '정산',
  commission: '수수료',
  coupang_api: '쿠팡 API',
  tax_invoice: '세금계산서',
  penalty: '페널티',
  other: '기타',
};

export const FAQ_CATEGORY_COLORS: Record<string, string> = {
  signup: 'bg-blue-100 text-blue-700',
  settlement: 'bg-purple-100 text-purple-700',
  commission: 'bg-orange-100 text-orange-700',
  coupang_api: 'bg-green-100 text-green-700',
  tax_invoice: 'bg-teal-100 text-teal-700',
  penalty: 'bg-red-100 text-red-700',
  other: 'bg-gray-100 text-gray-700',
};

// 파트너 스크리닝
export const SCREENING_STATUS_LABELS: Record<string, string> = {
  pending: '대기중',
  completed: '완료',
  expired: '만료',
};

export const SCREENING_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  expired: 'bg-gray-100 text-gray-500',
};

export const SCREENING_GRADE_LABELS: Record<string, string> = {
  S: 'S등급',
  A: 'A등급',
  B: 'B등급',
  C: 'C등급',
  D: 'D등급',
};

export const SCREENING_GRADE_COLORS: Record<string, string> = {
  S: 'bg-purple-100 text-purple-700',
  A: 'bg-green-100 text-green-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-yellow-100 text-yellow-700',
  D: 'bg-red-100 text-red-700',
};

export const SCREENING_DECISION_LABELS: Record<string, string> = {
  approved: '승인',
  pending: '미결정',
  rejected: '거절',
  hold: '보류',
};

export const SCREENING_DECISION_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-700',
  pending: 'bg-gray-100 text-gray-500',
  rejected: 'bg-red-100 text-red-700',
  hold: 'bg-orange-100 text-orange-700',
};

export const SCREENING_CATEGORY_LABELS: Record<string, string> = {
  trust: '신뢰도',
  compliance: '지재권/컴플라이언스',
  community: '커뮤니티 적합성',
  desperation: '절실함',
  readiness: '준비도',
  coachability: '학습 태도',
  vision: '비전',
};

// 트레이너 코칭 메시지 템플릿
export const TRAINER_MESSAGE_TEMPLATES = [
  { key: 'edu_encourage', label: '교육 독려', message: '교육 진행 중이시죠? 막히는 부분 있으면 연락주세요!' },
  { key: 'edu_evidence_retry', label: '증빙 재제출 안내', message: '증빙이 반려됐어요. 다시 올려주세요!' },
  { key: 'report_remind', label: '매출보고 독려', message: '이번 달 매출 보고 기한이 다가오고 있어요!' },
  { key: 'fee_remind', label: '수수료 납부', message: '수수료 납부 기한 확인해주세요!' },
  { key: 'praise', label: '칭찬', message: '교육 잘 진행하고 계시네요! 화이팅!' },
  { key: 'first_sale', label: '첫 매출 축하', message: '첫 매출 축하드려요! 이제 시작입니다!' },
] as const;

// 종합소득세 구간 (2024년 기준)
export const TAX_BRACKETS = [
  { limit: 14_000_000, rate: 0.06, deduction: 0 },
  { limit: 50_000_000, rate: 0.15, deduction: 1_260_000 },
  { limit: 88_000_000, rate: 0.24, deduction: 5_760_000 },
  { limit: 150_000_000, rate: 0.35, deduction: 15_440_000 },
  { limit: 300_000_000, rate: 0.38, deduction: 19_940_000 },
  { limit: 500_000_000, rate: 0.40, deduction: 25_940_000 },
  { limit: 1_000_000_000, rate: 0.42, deduction: 35_940_000 },
  { limit: Infinity, rate: 0.45, deduction: 65_940_000 },
];
