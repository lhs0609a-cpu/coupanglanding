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
