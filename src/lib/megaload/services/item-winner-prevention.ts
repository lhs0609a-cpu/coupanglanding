// ============================================================
// 아이템위너 방지 시스템 — 설정 타입 + 오케스트레이션
//
// 쿠팡이 같은 상품으로 인식하여 아이템위너로 묶는 것을 방지.
// 셀러마다 대표이미지 순서/변형, 상품명, 상세페이지를 다르게 한다.
// ============================================================

import { createSeededRandom, stringToSeed } from './seeded-random';

/** 이미지 변형 강도 */
export type VariationIntensity = 'low' | 'mid' | 'high';

/** 아이템위너 방지 설정 */
export interface PreventionConfig {
  enabled: boolean;
  imageOrderShuffle: boolean;   // P0: 대표이미지 순서 셔플
  imageVariation: boolean;      // P1: 서버사이드 이미지 미세 변형
  mandatoryAiNames: boolean;    // P2: AI 상품명 필수화
  detailPageVariation: boolean; // P3: 상세페이지 레이아웃 변형
  variationIntensity: VariationIntensity; // 이미지 변형 강도
}

/** 기본 설정 (전부 활성) */
export const DEFAULT_PREVENTION_CONFIG: PreventionConfig = {
  enabled: true,
  imageOrderShuffle: true,
  imageVariation: true,
  mandatoryAiNames: true,
  detailPageVariation: true,
  variationIntensity: 'mid',
};

/** 비활성 설정 */
export const DISABLED_PREVENTION_CONFIG: PreventionConfig = {
  enabled: false,
  imageOrderShuffle: false,
  imageVariation: false,
  mandatoryAiNames: false,
  detailPageVariation: false,
  variationIntensity: 'mid',
};

/**
 * 셀러 시드 기반 Fisher-Yates 셔플
 * 동일 시드 → 동일 결과 (결정적)
 */
export function shuffleWithSeed<T>(arr: T[], seed: string): T[] {
  if (arr.length <= 1) return [...arr];

  const result = [...arr];
  const rng = createSeededRandom(stringToSeed(seed));

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

/**
 * 셀러 시드 기반으로 N개 중 하나를 결정적으로 선택
 */
export function selectWithSeed<T>(items: T[], seed: string): T {
  const rng = createSeededRandom(stringToSeed(seed));
  const idx = Math.floor(rng() * items.length);
  return items[idx];
}

/**
 * 활성화된 방지 전략 수 (UI 표시용)
 */
export function getPreventionLevel(config: PreventionConfig): number {
  if (!config.enabled) return 0;
  let level = 0;
  if (config.imageOrderShuffle) level++;
  if (config.imageVariation) level++;
  if (config.mandatoryAiNames) level++;
  if (config.detailPageVariation) level++;
  return level;
}
