import type { OnboardingStep, OnboardingStepDefinition } from '@/lib/supabase/types';

export type ComputedStepStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'completed';

export interface ComputedStep {
  definition: OnboardingStepDefinition;
  dbRow: OnboardingStep | null;
  status: ComputedStepStatus;
  isLocked: boolean;
}

export function computeStepStates(
  definitions: OnboardingStepDefinition[],
  dbRows: OnboardingStep[],
  hasSignedContract: boolean,
  hasMonthlyReport: boolean,
): ComputedStep[] {
  const rowMap = new Map<string, OnboardingStep>();
  dbRows.forEach((row) => rowMap.set(row.step_key, row));

  let allPreviousCompleted = true;

  return definitions.map((def) => {
    const isLocked = !allPreviousCompleted;

    // 자동 연동 단계
    if (def.verificationType === 'auto_linked') {
      if (def.autoLinkSource === 'contract') {
        const status: ComputedStepStatus = hasSignedContract ? 'completed' : 'pending';
        if (status !== 'completed') allPreviousCompleted = false;
        return { definition: def, dbRow: null, status, isLocked };
      }
      if (def.autoLinkSource === 'monthly_report') {
        const status: ComputedStepStatus = hasMonthlyReport ? 'completed' : 'pending';
        if (status !== 'completed') allPreviousCompleted = false;
        return { definition: def, dbRow: null, status, isLocked };
      }
    }

    const row = rowMap.get(def.key);
    if (!row) {
      allPreviousCompleted = false;
      return { definition: def, dbRow: null, status: 'pending' as ComputedStepStatus, isLocked };
    }

    // approved -> completed로 표시
    const status: ComputedStepStatus = row.status === 'approved' ? 'completed' : row.status;
    if (status !== 'completed') allPreviousCompleted = false;
    return { definition: def, dbRow: row, status, isLocked };
  });
}

export function countCompleted(steps: ComputedStep[]): number {
  return steps.filter((s) => s.status === 'completed').length;
}
