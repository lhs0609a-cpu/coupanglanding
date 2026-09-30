/**
 * /start 화면 목업 — 단계 id → 화면들.
 *
 * 26단계 **전부** 채워져 있다. 하나라도 비면 그 단계에서 사람이 멈춘다.
 * (검증: `node scripts/check-start-mockups.mjs` — 빈 단계와 잘못된 pin 을 잡는다)
 */

import type { MockupScreen } from './types';
import type { StepHowto } from '../academy/types';
import { ACT12_MOCKUPS } from './screens-act12';
import { ACT34_MOCKUPS } from './screens-act34';
import { getReviewedMockups } from './reviewed-screens';

export type {
  MockupScreen,
  MockupDrawnScreen,
  MockupShotScreen,
  MockupHotspot,
  MockupBlock,
  Tone,
  Cell,
} from './types';
// 값(함수)이라 `export type` 로 내보내면 런타임에 사라진다.
export { isShot } from './types';

export const STEP_MOCKUPS: Record<string, MockupScreen[]> = {
  ...ACT12_MOCKUPS,
  ...ACT34_MOCKUPS,
};

export function getStepMockups(stepId: string, howto?: StepHowto[]): MockupScreen[] {
  return (howto ? getReviewedMockups(stepId, howto) : undefined) ?? STEP_MOCKUPS[stepId] ?? [];
}
