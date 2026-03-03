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
  confirmed: '확인됨',
  rejected: '거절됨',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

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

// 온보딩 단계 정의
import type { OnboardingStepDefinition } from '@/lib/supabase/types';

export const ONBOARDING_STEPS: OnboardingStepDefinition[] = [
  {
    key: 'orientation_video',
    order: 1,
    label: '오리엔테이션 영상 시청',
    description: '쿠팡 셀러 활동에 대한 기본 안내 영상을 시청해주세요.',
    verificationType: 'self_check',
  },
  {
    key: 'business_registration',
    order: 2,
    label: '사업자등록',
    description: '사업자등록증 사본을 업로드해주세요.',
    verificationType: 'evidence_upload',
  },
  {
    key: 'online_sales_report',
    order: 3,
    label: '통신판매업 신고',
    description: '통신판매업 신고증 사본을 업로드해주세요.',
    verificationType: 'evidence_upload',
  },
  {
    key: 'coupang_seller_signup',
    order: 4,
    label: '쿠팡 입점 회원가입',
    description: '쿠팡 셀러 가입 완료 화면 캡처를 업로드해주세요.',
    verificationType: 'evidence_upload',
  },
  {
    key: 'coupang_wing_integration',
    order: 5,
    label: '쿠팡 Wing 연동',
    description: '쿠팡 Wing 연동 완료 화면 캡처를 업로드해주세요.',
    verificationType: 'evidence_upload',
  },
  {
    key: 'first_product_listing',
    order: 6,
    label: '첫 상품 등록',
    description: '첫 상품 등록 완료 화면 캡처를 업로드해주세요.',
    verificationType: 'evidence_upload',
  },
  {
    key: 'contract_signing',
    order: 7,
    label: '계약서 서명',
    description: '계약서 서명을 완료해주세요.',
    verificationType: 'auto_linked',
    autoLinkSource: 'contract',
  },
  {
    key: 'first_revenue_report',
    order: 8,
    label: '첫 매출 보고',
    description: '첫 매출 보고를 제출해주세요.',
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
