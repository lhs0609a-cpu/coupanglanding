// localStorage 기반 튜토리얼 진행상황 관리

const STORAGE_KEY_PREFIX = 'guide-tutorial-';
const MODE_KEY = 'guide-preferred-mode';

export type GuideMode = 'tutorial' | 'read';

export interface TutorialState {
  completedSteps: number[];
  lastStepIndex: number;
  updatedAt: number;
}

export function getGuideTutorialState(articleId: string): TutorialState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${articleId}`);
    if (!raw) return null;
    return JSON.parse(raw) as TutorialState;
  } catch {
    return null;
  }
}

export function saveTutorialState(articleId: string, state: TutorialState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${articleId}`,
      JSON.stringify({ ...state, updatedAt: Date.now() }),
    );
  } catch {
    // storage full — ignore
  }
}

export function markStepCompleted(articleId: string, stepIndex: number): TutorialState {
  const prev = getGuideTutorialState(articleId);
  const completedSteps = prev ? [...new Set([...prev.completedSteps, stepIndex])] : [stepIndex];
  const state: TutorialState = {
    completedSteps,
    lastStepIndex: stepIndex,
    updatedAt: Date.now(),
  };
  saveTutorialState(articleId, state);
  return state;
}

export function getPreferredMode(): GuideMode {
  if (typeof window === 'undefined') return 'tutorial';
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'read' ? 'read' : 'tutorial';
  } catch {
    return 'tutorial';
  }
}

export function setPreferredMode(mode: GuideMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // ignore
  }
}

export function getEncouragementMessage(
  currentStep: number,
  totalSteps: number,
): string | null {
  if (currentStep === 0) return '좋은 시작이에요! 👋';
  const ratio = currentStep / totalSteps;
  if (ratio >= 0.9) return '거의 다 됐어요! 🔥';
  if (ratio >= 0.45 && ratio <= 0.55) return '절반 왔어요! 💪';
  return null;
}
