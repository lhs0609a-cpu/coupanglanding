// 파트너 스크리닝 채점 로직 — 순수 함수

import {
  SCREENING_QUESTIONS,
  SCREENING_CATEGORIES,
  SCORING_CONFIG,
  type ScreeningCategoryId,
  type ScreeningFlag,
  type FlagSeverity,
} from '@/lib/data/screening-questions';

// ─── 결과 타입 ───

export interface CategoryScore {
  category: ScreeningCategoryId;
  label: string;
  rawScore: number;      // 3문항 합 (3~15)
  weightedScore: number;  // rawScore × weight
  maxWeighted: number;    // 15 × weight
  percentage: number;     // 0~100
}

export interface ConsistencyWarning {
  questionIds: [string, string];
  message: string;
}

export interface ScoringResult {
  totalScore: number;           // 0~100
  grade: string;                // S/A/B/C/D
  categoryScores: CategoryScore[];
  redFlags: ScreeningFlag[];
  yellowFlags: ScreeningFlag[];
  greenFlags: ScreeningFlag[];
  consistencyWarnings: ConsistencyWarning[];
  knockedOut: boolean;
  knockoutReasons: string[];
  timeFlag: ScreeningFlag | null;
}

export interface AnswerMap {
  [questionId: string]: string; // questionId → optionId
}

// ─── 메인 함수 ───

export function calculateScreeningScore(
  answers: AnswerMap,
  timeSpentSeconds: number
): ScoringResult {
  const categoryScores = calculateCategoryScores(answers);
  const flags = collectFlags(answers);
  const consistencyWarnings = checkConsistency(answers);
  const { knockedOut, knockoutReasons } = checkKnockoutRules(
    categoryScores,
    flags.redFlags,
    flags.greenFlags
  );
  const totalScore = calculateTotalScore(categoryScores);
  const grade = calculateGrade(totalScore, knockedOut);
  const timeFlag = checkTimeFlag(timeSpentSeconds);

  return {
    totalScore: Math.round(totalScore * 10) / 10,
    grade,
    categoryScores,
    ...flags,
    consistencyWarnings,
    knockedOut,
    knockoutReasons,
    timeFlag,
  };
}

// ─── 카테고리별 점수 ───

function calculateCategoryScores(answers: AnswerMap): CategoryScore[] {
  return SCREENING_CATEGORIES.map((cat) => {
    const questions = SCREENING_QUESTIONS.filter((q) => q.category === cat.id);
    let rawScore = 0;

    for (const q of questions) {
      const selectedOptionId = answers[q.id];
      const option = q.options.find((o) => o.id === selectedOptionId);
      rawScore += option ? option.score : 0;
    }

    const weightedScore = rawScore * cat.weight;
    const maxWeighted = 15 * cat.weight;
    const percentage = maxWeighted > 0 ? (weightedScore / maxWeighted) * 100 : 0;

    return {
      category: cat.id,
      label: cat.label,
      rawScore,
      weightedScore: Math.round(weightedScore * 10) / 10,
      maxWeighted,
      percentage: Math.round(percentage * 10) / 10,
    };
  });
}

// ─── 플래그 수집 ───

function collectFlags(answers: AnswerMap) {
  const redFlags: ScreeningFlag[] = [];
  const yellowFlags: ScreeningFlag[] = [];
  const greenFlags: ScreeningFlag[] = [];

  for (const q of SCREENING_QUESTIONS) {
    const selectedOptionId = answers[q.id];
    const option = q.options.find((o) => o.id === selectedOptionId);
    if (!option?.flags) continue;

    for (const flag of option.flags) {
      if (flag.type === 'red') redFlags.push(flag);
      else if (flag.type === 'yellow') yellowFlags.push(flag);
      else greenFlags.push(flag);
    }
  }

  return { redFlags, yellowFlags, greenFlags };
}

// ─── 녹아웃 룰 ───

function checkKnockoutRules(
  categoryScores: CategoryScore[],
  redFlags: ScreeningFlag[],
  _greenFlags: ScreeningFlag[]
) {
  const reasons: string[] = [];
  const { knockoutRules } = SCORING_CONFIG;

  // CRITICAL 플래그 체크
  const criticalCount = redFlags.filter((f) => f.severity === 'CRITICAL').length;
  if (criticalCount >= knockoutRules.criticalFlagLimit) {
    reasons.push(`치명적 위험 신호 ${criticalCount}개 감지`);
  }

  // RED 플래그 총 개수 체크
  if (redFlags.length >= knockoutRules.redFlagLimit) {
    reasons.push(`위험 플래그 ${redFlags.length}개 (기준: ${knockoutRules.redFlagLimit}개)`);
  }

  // trust 카테고리 최소 점수 체크
  const trustScore = categoryScores.find((c) => c.category === 'trust');
  if (trustScore && trustScore.weightedScore <= knockoutRules.trustMinScore) {
    reasons.push(`신뢰도 가중 점수 ${trustScore.weightedScore}점 (최소: ${knockoutRules.trustMinScore}점)`);
  }

  return {
    knockedOut: reasons.length > 0,
    knockoutReasons: reasons,
  };
}

// ─── 일관성 체크 ───

function checkConsistency(answers: AnswerMap): ConsistencyWarning[] {
  const warnings: ConsistencyWarning[] = [];

  // trust_1 (매출 보고) vs community_2 (동료 돕기) — 솔직 but 이기적
  const trust1 = getAnswerScore(answers, 'trust_1');
  const community2 = getAnswerScore(answers, 'community_2');
  if (trust1 >= 4 && community2 <= 2) {
    warnings.push({
      questionIds: ['trust_1', 'community_2'],
      message: '매출 보고는 솔직하겠다고 했으나, 동료 돕기에는 소극적 — 자기 중심적 신뢰일 수 있음',
    });
  }

  // compliance_1 (이미지 저작권) vs compliance_3 (리뷰 조작) — 모순
  const comp1 = getAnswerScore(answers, 'compliance_1');
  const comp3 = getAnswerScore(answers, 'compliance_3');
  if (comp1 >= 4 && comp3 <= 2) {
    warnings.push({
      questionIds: ['compliance_1', 'compliance_3'],
      message: '저작권은 존중하나 리뷰 조작엔 관대 — 컴플라이언스 인식이 선택적',
    });
  }

  // desperation_1 (초기 투자) vs desperation_3 (3개월 수익 없음) — 모순
  const desp1 = getAnswerScore(answers, 'desperation_1');
  const desp3 = getAnswerScore(answers, 'desperation_3');
  if (desp1 >= 4 && desp3 <= 2) {
    warnings.push({
      questionIds: ['desperation_1', 'desperation_3'],
      message: '초기 투자는 준비되었다고 하나, 3개월 무수익에 대한 각오가 부족',
    });
  }

  // coachability_1 (피드백 수용) vs coachability_3 (실패 후 태도)
  const coach1 = getAnswerScore(answers, 'coachability_1');
  const coach3 = getAnswerScore(answers, 'coachability_3');
  if (coach1 >= 4 && coach3 <= 2) {
    warnings.push({
      questionIds: ['coachability_1', 'coachability_3'],
      message: '피드백은 수용하겠다고 했으나 실패 시 쉽게 포기/책임 전가 — 말과 행동 불일치 가능',
    });
  }

  return warnings;
}

function getAnswerScore(answers: AnswerMap, questionId: string): number {
  const question = SCREENING_QUESTIONS.find((q) => q.id === questionId);
  if (!question) return 0;
  const option = question.options.find((o) => o.id === answers[questionId]);
  return option?.score ?? 0;
}

// ─── 총점 계산 ───

function calculateTotalScore(categoryScores: CategoryScore[]): number {
  const totalWeighted = categoryScores.reduce((sum, c) => sum + c.weightedScore, 0);
  return (totalWeighted / SCORING_CONFIG.maxRawScore) * 100;
}

// ─── 등급 결정 ───

function calculateGrade(totalScore: number, knockedOut: boolean): string {
  if (knockedOut) return 'D';

  for (const threshold of SCORING_CONFIG.gradeThresholds) {
    if (totalScore >= threshold.min) {
      return threshold.grade;
    }
  }
  return 'D';
}

// ─── 응시 시간 체크 ───

function checkTimeFlag(timeSpentSeconds: number): ScreeningFlag | null {
  if (timeSpentSeconds < SCORING_CONFIG.minTimeSeconds) {
    return {
      type: 'red',
      severity: 'WARNING' as FlagSeverity,
      label: '무성의 응시',
      description: `응시 시간 ${timeSpentSeconds}초 (최소 ${SCORING_CONFIG.minTimeSeconds}초 미만)`,
    };
  }
  return null;
}
