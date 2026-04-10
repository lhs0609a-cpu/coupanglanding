// ============================================================
// 상품 차별화 시스템 — 설정 타입 + 오케스트레이션
//
// 셀러별 고유 브랜드, 바코드, 상품명, 상세페이지로 차별화.
// ============================================================

import { createSeededRandom, stringToSeed } from './seeded-random';

/** 상품 차별화 설정 */
export interface PreventionConfig {
  enabled: boolean;
  imageOrderShuffle: boolean;      // P0: 대표이미지 순서 셔플
  mandatoryAiNames: boolean;       // P2: AI 상품명 필수화
  detailPageVariation: boolean;    // P3: 상세페이지 레이아웃 변형
  sellerBrand: string;             // 셀러 고유 브랜드
  autoBarcodeGeneration: boolean;  // EAN-13 자동 생성
}

/** 기본 설정 (전부 활성) */
export const DEFAULT_PREVENTION_CONFIG: PreventionConfig = {
  enabled: true,
  imageOrderShuffle: true,
  mandatoryAiNames: true,
  detailPageVariation: true,
  sellerBrand: '',
  autoBarcodeGeneration: true,
};

/** 비활성 설정 */
export const DISABLED_PREVENTION_CONFIG: PreventionConfig = {
  enabled: false,
  imageOrderShuffle: false,
  mandatoryAiNames: false,
  detailPageVariation: false,
  sellerBrand: '',
  autoBarcodeGeneration: false,
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
 * 활성화된 차별화 전략 수 (UI 표시용, 최대 5)
 */
export function getPreventionLevel(config: PreventionConfig): number {
  if (!config.enabled) return 0;
  let level = 0;
  if (config.imageOrderShuffle) level++;
  if (config.mandatoryAiNames) level++;
  if (config.detailPageVariation) level++;
  if (config.sellerBrand) level++;
  if (config.autoBarcodeGeneration) level++;
  return level;
}
