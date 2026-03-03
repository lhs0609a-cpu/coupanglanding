import type { OnboardingStep, OnboardingStepDefinition } from '@/lib/supabase/types';

export type ComputedStepStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'completed';

export interface ComputedStep {
  definition: OnboardingStepDefinition;
  dbRow: OnboardingStep | null;
  status: ComputedStepStatus;
}

export function computeStepStates(
  definitions: OnboardingStepDefinition[],
  dbRows: OnboardingStep[],
  hasSignedContract: boolean,
  hasMonthlyReport: boolean,
): ComputedStep[] {
  const rowMap = new Map<string, OnboardingStep>();
  dbRows.forEach((row) => rowMap.set(row.step_key, row));

  return definitions.map((def) => {
    // 자동 연동 단계
    if (def.verificationType === 'auto_linked') {
      if (def.autoLinkSource === 'contract') {
        return {
          definition: def,
          dbRow: null,
          status: hasSignedContract ? 'completed' : 'pending',
        };
      }
      if (def.autoLinkSource === 'monthly_report') {
        return {
          definition: def,
          dbRow: null,
          status: hasMonthlyReport ? 'completed' : 'pending',
        };
      }
    }

    const row = rowMap.get(def.key);
    if (!row) {
      return { definition: def, dbRow: null, status: 'pending' as ComputedStepStatus };
    }

    // approved -> completed로 표시
    const status: ComputedStepStatus = row.status === 'approved' ? 'completed' : row.status;
    return { definition: def, dbRow: row, status };
  });
}

export function countCompleted(steps: ComputedStep[]): number {
  return steps.filter((s) => s.status === 'completed').length;
}
