// 왕초보 셀러 시작 로드맵 진행률 (LocalStorage)

const STORAGE_KEY = 'start-roadmap-progress';

export interface StartProgress {
  checkedItems: Record<string, boolean>;
  skippedSteps: string[];
  completedAt?: string;
  updatedAt: number;
}

function defaultProgress(): StartProgress {
  return {
    checkedItems: {},
    skippedSteps: [],
    updatedAt: Date.now(),
  };
}

export function getStartProgress(): StartProgress {
  if (typeof window === 'undefined') return defaultProgress();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress();
    return JSON.parse(raw) as StartProgress;
  } catch {
    return defaultProgress();
  }
}

export function saveStartProgress(progress: StartProgress): void {
  if (typeof window === 'undefined') return;
  try {
    progress.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // quota exceeded 등 무시
  }
}

export function toggleCheck(subStepId: string): StartProgress {
  const progress = getStartProgress();
  progress.checkedItems[subStepId] = !progress.checkedItems[subStepId];
  saveStartProgress(progress);
  return progress;
}

export function skipStep(stepId: string, subStepIds: string[]): StartProgress {
  const progress = getStartProgress();
  if (!progress.skippedSteps.includes(stepId)) {
    progress.skippedSteps.push(stepId);
  }
  // 해당 스텝의 모든 서브스텝을 체크 처리
  subStepIds.forEach((id) => {
    progress.checkedItems[id] = true;
  });
  saveStartProgress(progress);
  return progress;
}

export function isStepCompleted(
  subStepIds: string[],
  progress: StartProgress
): boolean {
  return subStepIds.every((id) => progress.checkedItems[id] === true);
}

export function getCompletedStepCount(
  allStepSubIds: string[][],
  progress: StartProgress
): number {
  return allStepSubIds.filter((ids) => isStepCompleted(ids, progress)).length;
}

export function markCompleted(progress: StartProgress): StartProgress {
  progress.completedAt = new Date().toISOString();
  saveStartProgress(progress);
  return progress;
}
