import { ONBOARDING_STEPS } from '@/lib/utils/constants';
import type { ComputedStep } from '@/components/onboarding/onboarding-utils';

export interface ModuleCategory {
  id: string;
  title: string;
  description: string;
  stepKeys: string[];
}

export const MODULE_CATEGORIES: ModuleCategory[] = [
  {
    id: 'basics',
    title: '기초 교육',
    description: '리셀 사업의 기초를 다져요',
    stepKeys: ['legal_education', 'margin_education'],
  },
  {
    id: 'business_setup',
    title: '사업자 준비',
    description: '사업자 등록부터 쿠팡 입점까지',
    stepKeys: [
      'business_registration',
      'online_sales_report',
      'coupang_seller_signup',
      'coupang_wing_integration',
      'first_product_listing',
    ],
  },
  {
    id: 'seller_activity',
    title: '셀러 활동',
    description: '실전 셀러 노하우와 첫 수익까지',
    stepKeys: [
      'penalty_prevention',
      'cs_returns_education',
      'essential_tips',
      'contract_signing',
      'first_revenue_report',
    ],
  },
];

export const LEVEL_LABELS: Record<number, string> = {
  0: '입문자',
  1: '법률 이해 완료',
  2: '마진 계산 완료',
  3: '사업자 등록 완료',
  4: '신고 완료',
  5: '쿠팡 셀러',
  6: 'Wing 마스터',
  7: '첫 상품 등록',
  8: '페널티 방지 완료',
  9: 'CS/반품 마스터',
  10: '노하우 습득 완료',
  11: '계약 완료',
  12: '쿠팡 셀러 마스터',
};

export function getNextIncompleteStep(steps: ComputedStep[]): ComputedStep | null {
  return steps.find((s) => s.status !== 'completed' && !s.isLocked) ?? null;
}

export function getStepByKey(steps: ComputedStep[], key: string): ComputedStep | undefined {
  return steps.find((s) => s.definition.key === key);
}

export function getCategoryForStep(stepKey: string): ModuleCategory | undefined {
  return MODULE_CATEGORIES.find((cat) => cat.stepKeys.includes(stepKey));
}

export function getModuleOrder(stepKey: string): number {
  const step = ONBOARDING_STEPS.find((s) => s.key === stepKey);
  return step?.order ?? 0;
}
