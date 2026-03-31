// ============================================================
// 상품명 파서 — 토큰 분류 → 변수 오버라이드 매핑
//
// display-name-generator의 classifyTokens() 재활용.
// 상품명에서 추출한 성분/기능/타입을 설득형 콘텐츠의
// 변수풀에 prepend하여 상품별 맞춤 콘텐츠 생성.
// ============================================================

import { classifyTokens, type ClassifiedTokens } from './display-name-generator';

// ─── 타입 ────────────────────────────────────────────────

export interface ParsedProductTokens {
  type: string[];
  ingredients: string[];
  features: string[];
  origin: string[];
  specs: string[];
  descriptors: string[];
}

// ─── 공개 API ────────────────────────────────────────────

/**
 * 상품명에서 토큰을 추출·분류한다.
 * classifyTokens()의 래퍼 — 인터페이스 안정화 목적.
 */
export function parseProductName(
  name: string,
  categoryPath: string,
  brand: string,
): ParsedProductTokens {
  const classified: ClassifiedTokens = classifyTokens(name, categoryPath, brand);
  return {
    type: classified.type,
    ingredients: classified.ingredients,
    features: classified.features,
    origin: classified.origin,
    specs: classified.specs,
    descriptors: classified.descriptors,
  };
}

/**
 * 파싱된 토큰을 변수 오버라이드 맵으로 변환.
 *
 * 변수풀 병합 시 "prepend" 전략:
 * - 상품 토큰이 배열 앞에 위치 → 높은 확률로 선택됨
 * - 카테고리 기본 풀이 뒤에 유지 → 폴백 보장
 */
export function tokensToVariableOverrides(
  tokens: ParsedProductTokens,
): Record<string, string[]> {
  const overrides: Record<string, string[]> = {};

  // 성분 → {성분}, {성분2}
  if (tokens.ingredients.length > 0) {
    overrides['성분'] = [tokens.ingredients[0]];
    if (tokens.ingredients.length > 1) {
      overrides['성분2'] = [tokens.ingredients[1]];
    }
  }

  // 기능/특징 → {효과1}, {효과2}
  if (tokens.features.length > 0) {
    overrides['효과1'] = [tokens.features[0]];
    if (tokens.features.length > 1) {
      overrides['효과2'] = [tokens.features[1]];
    }
  }

  // 상품 유형 → {카테고리}
  if (tokens.type.length > 0) {
    overrides['카테고리'] = tokens.type.slice(0, 2);
  }

  // 스펙 → {용량}
  if (tokens.specs.length > 0) {
    overrides['용량'] = [tokens.specs[0]];
  }

  // 원산지 → {원산지} (템플릿에서 사용 가능)
  if (tokens.origin.length > 0) {
    overrides['원산지'] = tokens.origin.slice(0, 2);
  }

  return overrides;
}
