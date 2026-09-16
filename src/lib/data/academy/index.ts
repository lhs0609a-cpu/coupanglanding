/**
 * 셀러 독학 아카데미 — 스텝 레지스트리
 *
 * 콘텐츠는 DB 가 아니라 코드다. 이 레포의 기존 관행(guides.ts, feature-tutorials.ts)을 따른다.
 * DB 에 넣으면 타입 검사·코드리뷰·git diff 를 전부 잃는다.
 */

import type { AcademyStep, AcademyStepPublic, AcademyAct } from './types';
import { ACT0_STEPS } from './act0-diagnose';
import { ACT1_STEPS } from './act1-open';
import { ACT2_STEPS } from './act2-register';
import { ACT3_STEPS } from './act3-orders';
import { ACT4_STEPS } from './act4-cs';
import { ACT5_STEPS } from './act5-growth';

export * from './types';
export * from './badges';

export const ACADEMY_STEPS: AcademyStep[] = [
  ...ACT0_STEPS, ...ACT1_STEPS, ...ACT2_STEPS, ...ACT3_STEPS, ...ACT4_STEPS, ...ACT5_STEPS,
].sort(
  (a, b) => a.act - b.act || a.order - b.order,
);

const BY_KEY = new Map(ACADEMY_STEPS.map((s) => [s.key, s]));

export function getStep(key: string): AcademyStep | undefined {
  return BY_KEY.get(key);
}

export function getActSteps(act: AcademyAct): AcademyStep[] {
  return ACADEMY_STEPS.filter((s) => s.act === act);
}

/**
 * 클라이언트로 내보낼 모양으로 변환.
 * ★ pass() 와 퀴즈 정답은 절대 나가지 않는다 — 나가면 판정이 무의미해진다.
 */
export function toPublic(step: AcademyStep): AcademyStepPublic {
  const { verify, ...rest } = step;
  if (verify.level === 1) {
    return { ...rest, verify: { level: 1, hint: verify.hint } };
  }
  if (verify.level === 2) {
    return verify.mode === 'number'
      ? { ...rest, verify: { level: 2, mode: 'number', hint: verify.hint, placeholder: verify.placeholder, note: verify.note } }
      : { ...rest, verify: { level: 2, mode: 'file', accept: verify.accept, hint: verify.hint, retentionDays: verify.retentionDays } };
  }
  return {
    ...rest,
    verify: {
      level: 3,
      checklist: verify.checklist,
      quiz: verify.quiz.map((q) => ({ q: q.q, choices: q.choices })),   // answer/why 제거
    },
  };
}

/** 스텝 통과 시 지급할 XP 합계 (레벨 계산용 분모) */
export const TOTAL_ACADEMY_XP = ACADEMY_STEPS.reduce((sum, s) => sum + s.xp, 0);
