// localStorage 기반 튜토리얼 진행률 관리

interface TutorialRecord {
  completed: boolean;
  completedAt: string;
  xpEarned: number;
}

const STORAGE_PREFIX = 'tutorial_';
const VISITED_PREFIX = 'tutorial_seen_';

function getKey(featureKey: string): string {
  return `${STORAGE_PREFIX}${featureKey}`;
}

function getVisitedKey(featureKey: string): string {
  return `${VISITED_PREFIX}${featureKey}`;
}

export function isTutorialCompleted(featureKey: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(getKey(featureKey));
    if (!raw) return false;
    const record: TutorialRecord = JSON.parse(raw);
    return record.completed;
  } catch {
    return false;
  }
}

export function completeTutorial(featureKey: string, xp: number): void {
  if (typeof window === 'undefined') return;
  const record: TutorialRecord = {
    completed: true,
    completedAt: new Date().toISOString(),
    xpEarned: xp,
  };
  localStorage.setItem(getKey(featureKey), JSON.stringify(record));
}

export function getTutorialRecord(featureKey: string): TutorialRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getKey(featureKey));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export interface TutorialProgress {
  totalTutorials: number;
  completedCount: number;
  totalXpEarned: number;
  completionPercent: number;
  records: Record<string, TutorialRecord | null>;
}

export function getTutorialProgress(featureKeys: string[]): TutorialProgress {
  let completedCount = 0;
  let totalXpEarned = 0;
  const records: Record<string, TutorialRecord | null> = {};

  for (const key of featureKeys) {
    const record = getTutorialRecord(key);
    records[key] = record;
    if (record?.completed) {
      completedCount++;
      totalXpEarned += record.xpEarned;
    }
  }

  return {
    totalTutorials: featureKeys.length,
    completedCount,
    totalXpEarned,
    completionPercent: featureKeys.length > 0
      ? Math.round((completedCount / featureKeys.length) * 100)
      : 0,
    records,
  };
}

export function isFirstVisit(featureKey: string): boolean {
  if (typeof window === 'undefined') return false;
  return !localStorage.getItem(getVisitedKey(featureKey));
}

export function markVisited(featureKey: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getVisitedKey(featureKey), 'true');
}

export function isWelcomeSeen(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('tutorial_welcome_seen');
}

export function markWelcomeSeen(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('tutorial_welcome_seen', 'true');
}
