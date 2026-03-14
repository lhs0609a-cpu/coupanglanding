/**
 * 광고 아카데미 진행률 관리 (localStorage 기반)
 * 패턴: tutorial-progress.ts 미러링
 */

const STORAGE_KEY = 'ad_academy_progress';

export interface StageProgress {
  cleared: boolean;
  stars: number;
  quizScore: number;
  bonusTipsFound: string[];
  clearedAt: string;
  pointsEarned: number;
}

export interface AcademyProgress {
  stages: Record<string, StageProgress>;
}

function getProgress(): AcademyProgress {
  if (typeof window === 'undefined') return { stages: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { stages: {} };
  } catch {
    return { stages: {} };
  }
}

function saveProgress(progress: AcademyProgress): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function getStageProgress(stageId: string): StageProgress | null {
  const progress = getProgress();
  return progress.stages[stageId] || null;
}

export function isStageCleared(stageId: string): boolean {
  const stage = getStageProgress(stageId);
  return stage?.cleared ?? false;
}

export function isStageUnlocked(stageId: string, allStageIds: string[]): boolean {
  const idx = allStageIds.indexOf(stageId);
  if (idx <= 0) return true; // First stage always unlocked
  return isStageCleared(allStageIds[idx - 1]);
}

export function saveStageResult(
  stageId: string,
  stars: number,
  quizScore: number,
  bonusTipsFound: string[],
  pointsEarned: number
): void {
  const progress = getProgress();
  const existing = progress.stages[stageId];

  // Keep best result
  if (existing && existing.stars >= stars) {
    // Update bonus tips if new ones found
    const allTips = [...new Set([...existing.bonusTipsFound, ...bonusTipsFound])];
    progress.stages[stageId] = { ...existing, bonusTipsFound: allTips };
  } else {
    progress.stages[stageId] = {
      cleared: true,
      stars,
      quizScore,
      bonusTipsFound: existing
        ? [...new Set([...existing.bonusTipsFound, ...bonusTipsFound])]
        : bonusTipsFound,
      clearedAt: new Date().toISOString(),
      pointsEarned,
    };
  }

  saveProgress(progress);
}

export function getTotalStars(stageIds: string[]): number {
  const progress = getProgress();
  return stageIds.reduce((sum, id) => sum + (progress.stages[id]?.stars || 0), 0);
}

export function getClearedCount(stageIds: string[]): number {
  const progress = getProgress();
  return stageIds.filter(id => progress.stages[id]?.cleared).length;
}

export function isAllCleared(stageIds: string[]): boolean {
  return getClearedCount(stageIds) === stageIds.length;
}

export function isAllPerfect(stageIds: string[]): boolean {
  const progress = getProgress();
  return stageIds.every(id => progress.stages[id]?.stars === 3);
}

export function getAllBonusTips(stageIds: string[]): string[] {
  const progress = getProgress();
  const tips: string[] = [];
  for (const id of stageIds) {
    const stage = progress.stages[id];
    if (stage) tips.push(...stage.bonusTipsFound);
  }
  return tips;
}

export function getAcademyOverview(stageIds: string[]) {
  return {
    totalStages: stageIds.length,
    clearedCount: getClearedCount(stageIds),
    totalStars: getTotalStars(stageIds),
    maxStars: stageIds.length * 3,
    completionPercent: Math.round((getClearedCount(stageIds) / stageIds.length) * 100),
    isAllCleared: isAllCleared(stageIds),
    isAllPerfect: isAllPerfect(stageIds),
  };
}
