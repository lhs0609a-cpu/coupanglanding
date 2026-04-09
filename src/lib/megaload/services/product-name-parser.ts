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

/** 상품 컨텍스트 — 호출 측에서 보유한 추가 데이터 */
export interface ProductContext {
  description?: string;
  tags?: string[];
  brand?: string;
  noticeValues?: Record<string, string>;
  attributeValues?: Record<string, string>;
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

// ─── 성분/효과 패턴 (tags/description 분류용) ─────────────

const INGREDIENT_RE = /비타민|오메가|프로바이오|유산균|콜라겐|히알루론|루테인|글루코사민|보스웰리아|밀크씨슬|실리마린|홍삼|인삼|마그네슘|칼슘|아연|철분|셀레늄|코엔자임|크릴|EPA|DHA|프로폴리스|엽산|비오틴|판토텐|나이아신|가르시니아|쏘팔메토|스피루리나|클로렐라|흑마늘|MSM|진세노사이드|레티놀|세라마이드|나이아신아마이드|살리실|글리콜|스쿠알란|펩타이드|알로에|녹차|티트리|병풀|센텔라|시카|쌀|콩|석류|아르간|호호바|쉐어버터|카카오|코코넛/i;

const EFFECT_RE = /보습|미백|주름|탄력|항산화|면역|피로회복|혈행|관절|뼈건강|눈건강|장건강|간건강|피부건강|모발|두피|수면|스트레스|체지방|혈압|혈당|콜레스테롤|소화|배변|해독|에너지|활력|진정|재생|각질|모공|트러블|자외선|SPF|UV|방수|속건|항균|탈취|정전기|보온|냉감/i;

/**
 * ProductContext에서 변수 오버라이드를 추출한다.
 *
 * 우선순위: tags > attributeValues/noticeValues > description
 * 이름 파싱 결과(nameOverrides)보다 낮은 우선순위로 사용됨.
 */
export function extractContextOverrides(
  context: ProductContext,
  categoryPath: string,
): Record<string, string[]> {
  const overrides: Record<string, string[]> = {};

  const addIfMissing = (key: string, value: string) => {
    if (!overrides[key]) overrides[key] = [];
    if (!overrides[key].includes(value)) overrides[key].push(value);
  };

  // ── 1. tags → 성분/효과 분류 ──
  if (context.tags && context.tags.length > 0) {
    for (const tag of context.tags) {
      const t = tag.trim();
      if (!t) continue;
      if (INGREDIENT_RE.test(t)) {
        addIfMissing('성분', t);
      } else if (EFFECT_RE.test(t)) {
        addIfMissing('효과1', t);
      }
    }
  }

  // ── 2. noticeValues / attributeValues → 원산지, 성분, 인증 ──
  const mergedAttrs: Record<string, string> = {
    ...(context.noticeValues || {}),
    ...(context.attributeValues || {}),
  };
  for (const [key, val] of Object.entries(mergedAttrs)) {
    if (!val || val === '상세설명참조' || val === '해당없음') continue;
    const kl = key.toLowerCase();
    if (kl.includes('원산지') || kl.includes('제조국') || kl.includes('원산')) {
      addIfMissing('원산지', val);
    } else if (kl.includes('성분') || kl.includes('원료') || kl.includes('소재')) {
      // 긴 성분표는 무시 (50자 이상)
      if (val.length <= 50) addIfMissing('성분', val);
    } else if (kl.includes('인증') || kl.includes('KC') || kl.includes('허가')) {
      addIfMissing('인증', val);
    }
  }

  // ── 3. description → HTML 제거 후 classifyTokens로 폴백 ──
  if (context.description && Object.keys(overrides).length < 2) {
    const plainText = context.description
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500); // 과도한 길이 방지

    if (plainText.length >= 10) {
      const descTokens = classifyTokens(plainText, categoryPath, context.brand || '');
      if (descTokens.ingredients.length > 0 && !overrides['성분']) {
        overrides['성분'] = descTokens.ingredients.slice(0, 3);
      }
      if (descTokens.features.length > 0 && !overrides['효과1']) {
        overrides['효과1'] = descTokens.features.slice(0, 3);
      }
    }
  }

  return overrides;
}
