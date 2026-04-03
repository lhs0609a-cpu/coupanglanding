// ============================================================
// 설득형 콘텐츠 엔진 v3 — 조합형(Compositional) 생성
//
// v2: 14개 대분류 고정 템플릿 → 동일 문장 반복
// v3: 원자적 문장 조각(fragment) 조합 → 수조 개 고유 출력
//
// 5-Layer 아키텍처:
//   L1: 원자적 조각 (persuasion-fragments.json)
//   L2: 중분류 변수풀 (~50개, story-templates.json 확장)
//   L3: 상품명 파서 (product-name-parser → 변수 오버라이드)
//   L4: SEO 키워드 위빙 (변수풀 주입 + 인라인 삽입)
//   L5: 셀러 시드 차별화 (모든 축에 seeded-random 적용)
//
// 공개 API 불변:
//   generatePersuasionContent(), seoEnrichBlocks(),
//   contentBlocksToParagraphs(), generatePersuasionBatch()
// ============================================================

import { createSeededRandom, stringToSeed } from './seeded-random';
import {
  composeAllBlocks,
  composeBlock,
  resolveVariables,
  mergeVariables,
  enrichVariablesWithSeo,
  getFrameworks,
  resolveCategoryFrameworks,
  getContentProfile,
} from './fragment-composer';
import type { ContentBlock, ContentBlockType } from './fragment-composer';
import { parseProductName, tokensToVariableOverrides } from './product-name-parser';

// ─── 타입 re-export (원본은 fragment-composer.ts) ────────────

export type { ContentBlockType, ContentBlock };

export interface PersuasionResult {
  framework: string;         // 사용된 프레임워크 ID
  frameworkName: string;     // 프레임워크 표시 이름
  blocks: ContentBlock[];    // 생성된 블록 배열
  totalCharCount: number;    // SEO 길이 검증 (순수 텍스트 기준)
}

// ─── 상수 ────────────────────────────────────────────────────

const MIN_CHARS = 2500;
const MAX_CHARS = 4000;
const TRUNCATE_LIMIT = 300;

// ─── 블록 텍스트 길이 계산 ──────────────────────────────────

function getBlockCharCount(block: ContentBlock): number {
  let count = block.content.length;
  if (block.subContent) count += block.subContent.length;
  if (block.items) count += block.items.join('').length;
  if (block.emphasis) count += block.emphasis.length;
  return count;
}

// ─── SEO 키워드 본문 삽입 (안전망 — 인라인 위빙 실패 시) ────

/**
 * 생성된 블록에 SEO 키워드를 자연스럽게 삽입한다.
 * v3에서는 인라인 위빙이 1차 전략이며, 이 함수는 안전망으로 작동.
 *
 * - hook: 문장 끝에 SEO 키워드 1개 삽입
 * - benefits_grid: 마지막 아이템으로 SEO 키워드 1개 추가
 * - cta: subContent에 SEO 키워드 포함 문구 생성
 */
export function seoEnrichBlocks(blocks: ContentBlock[], seoKeywords: string[]): ContentBlock[] {
  if (!seoKeywords || seoKeywords.length === 0) return blocks;

  // SEO 키워드가 이미 블록 텍스트에 포함되어 있는지 확인
  const allText = blocks.map(b => {
    let t = b.content;
    if (b.subContent) t += b.subContent;
    if (b.items) t += b.items.join('');
    if (b.emphasis) t += b.emphasis;
    return t;
  }).join('');

  const includedCount = seoKeywords.filter(kw => allText.includes(kw)).length;

  // 이미 2개 이상 포함되어 있으면 안전망 스킵
  if (includedCount >= 2) return blocks;

  let kwIdx = 0;
  const nextKw = (): string => {
    const kw = seoKeywords[kwIdx % seoKeywords.length];
    kwIdx++;
    return kw;
  };

  return blocks.map(block => {
    const enriched = { ...block };

    switch (block.type) {
      case 'hook': {
        const kw = nextKw();
        if (enriched.content.includes(kw)) break;
        const content = enriched.content;
        const lastPunc = content.search(/[.?!。]$/);
        if (lastPunc >= 0) {
          enriched.content = content.slice(0, lastPunc) + ' ' + kw + content.slice(lastPunc);
        } else {
          enriched.content = content + ' ' + kw;
        }
        break;
      }

      case 'benefits_grid': {
        const kw = nextKw();
        if (enriched.items) {
          if (enriched.items.some(item => item.includes(kw))) break;
          if (enriched.items.length >= 3) {
            enriched.items = [...enriched.items.slice(0, 2), kw];
          } else {
            enriched.items = [...enriched.items, kw];
          }
        }
        break;
      }

      case 'cta': {
        const kw = nextKw();
        if (enriched.content.includes(kw)) break;
        enriched.subContent = kw;
        break;
      }

      default:
        break;
    }

    return enriched;
  });
}

// ─── 공개 API ────────────────────────────────────────────────

/**
 * 설득형 콘텐츠 블록 배열 생성 (v3 — 조합형)
 *
 * @param productName 상품명 (짧은 형태)
 * @param categoryPath 쿠팡 카테고리 경로
 * @param sellerSeed 셀러 고유 시드
 * @param productIndex 상품 인덱스
 * @param seoKeywords SEO 키워드 배열 (optional, 있으면 본문에 자연 삽입)
 * @param categoryCode 쿠팡 카테고리 코드 (optional, CPG 프로필 매핑용)
 */
export function generatePersuasionContent(
  productName: string,
  categoryPath: string,
  sellerSeed: string,
  productIndex: number,
  seoKeywords?: string[],
  categoryCode?: string,
): PersuasionResult {
  // 시드 기반 RNG
  const seed = stringToSeed(`${sellerSeed}::persuasion::${productIndex}::${productName}`);
  const rng = createSeededRandom(seed);

  // 이름 정리
  const cleanName = productName
    .replace(/[\[\(【][^\]\)】]*[\]\)】]/g, '')
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
    .split(/\s+/).filter(w => w.length >= 2).slice(0, 3).join(' ');

  // ── Layer 3: 상품명 파싱 → 변수 오버라이드 ──
  const tokens = parseProductName(productName, categoryPath, '');
  const productOverrides = tokensToVariableOverrides(tokens);

  // ── CPG 프로필 조회 → forbiddenTerms 추출 ──
  const profile = getContentProfile(categoryPath, categoryCode);

  // ── Layer 2: 카테고리 변수풀 해석 (CPG 격리 or 레거시) ──
  const categoryVars = resolveVariables(categoryPath, categoryCode);

  // ── Layer 3+2: 변수 병합 (상품 토큰 우선 + forbiddenTerms 필터) ──
  let vars = mergeVariables(categoryVars, productOverrides, profile?.forbiddenTerms);

  // ── Layer 4: SEO 키워드 → 변수풀 보강 ──
  if (seoKeywords && seoKeywords.length > 0) {
    vars = enrichVariablesWithSeo(vars, seoKeywords, rng);
  }

  // ── Layer 5: 프레임워크 선택 (시드 랜덤, 계층적 매칭) ──
  const allowedFrameworks = resolveCategoryFrameworks(categoryPath);
  const frameworkId = allowedFrameworks[Math.floor(rng() * allowedFrameworks.length)];
  const frameworks = getFrameworks();
  const framework = frameworks[frameworkId] || frameworks['AIDA'];
  const actualFrameworkId = frameworks[frameworkId] ? frameworkId : 'AIDA';

  // ── Layer 1: 블록 시퀀스 조합 ──
  const blocks = composeAllBlocks(
    framework,
    categoryPath,
    vars,
    cleanName,
    seoKeywords || [],
    rng,
  );

  // ── Layer 4: SEO 안전망 (인라인 위빙 실패 시) ──
  const enrichedBlocks = seoKeywords && seoKeywords.length > 0
    ? seoEnrichBlocks(blocks, seoKeywords)
    : blocks;

  // ── 글자수 검증 (600~1200자 타겟) ──
  let totalChars = enrichedBlocks.reduce((sum, b) => sum + getBlockCharCount(b), 0);

  // 글자수 < MIN_CHARS이면 블록 추가 (최대 5회 반복)
  const paddingTypes: ContentBlockType[] = [
    'feature_detail', 'solution', 'social_proof', 'usage_guide',
    'feature_detail', 'solution', 'social_proof', 'usage_guide',
    'feature_detail', 'solution', 'feature_detail', 'social_proof',
  ];
  let padIdx = 0;
  while (totalChars < MIN_CHARS && padIdx < paddingTypes.length) {
    const extraBlock = composeBlock(
      paddingTypes[padIdx],
      categoryPath,
      vars,
      cleanName,
      seoKeywords || [],
      rng,
    );
    // cta 앞에 삽입
    const ctaIdx = enrichedBlocks.findIndex(b => b.type === 'cta');
    if (ctaIdx >= 0) {
      enrichedBlocks.splice(ctaIdx, 0, extraBlock);
    } else {
      enrichedBlocks.push(extraBlock);
    }
    totalChars += getBlockCharCount(extraBlock);
    padIdx++;
  }

  // 글자수 > MAX_CHARS이면 가장 긴 non-hook/non-cta 블록 축약
  if (totalChars > MAX_CHARS) {
    let longestIdx = -1;
    let longestLen = 0;
    for (let i = 0; i < enrichedBlocks.length; i++) {
      if (enrichedBlocks[i].type === 'hook' || enrichedBlocks[i].type === 'cta') continue;
      const len = getBlockCharCount(enrichedBlocks[i]);
      if (len > longestLen) {
        longestLen = len;
        longestIdx = i;
      }
    }
    if (longestIdx >= 0) {
      const b = enrichedBlocks[longestIdx];
      if (b.content.length > TRUNCATE_LIMIT) {
        b.content = b.content.slice(0, TRUNCATE_LIMIT) + '...';
      }
      if (b.items && b.items.length > 7) {
        b.items = b.items.slice(0, 7);
      }
      totalChars = enrichedBlocks.reduce((sum, bl) => sum + getBlockCharCount(bl), 0);
    }
  }

  // ── 키워드 밀도 검증 — 모든 SEO 키워드 최소 1회 포함 보장 ──
  if (seoKeywords && seoKeywords.length > 0) {
    const allText = enrichedBlocks.map(b => {
      let t = b.content;
      if (b.subContent) t += ' ' + b.subContent;
      if (b.items) t += ' ' + b.items.join(' ');
      if (b.emphasis) t += ' ' + b.emphasis;
      return t;
    }).join(' ');

    const missingKws = seoKeywords.filter(kw => !allText.includes(kw));
    if (missingKws.length > 0) {
      // feature_detail / solution 블록에 강제 삽입
      const insertableBlocks = enrichedBlocks.filter(
        b => b.type === 'feature_detail' || b.type === 'solution',
      );
      for (let mi = 0; mi < missingKws.length; mi++) {
        const target = insertableBlocks[mi % insertableBlocks.length];
        if (target) {
          target.content = target.content.replace(/([.?!。])$/, ` ${missingKws[mi]}$1`);
          if (!target.content.endsWith(missingKws[mi]) && !target.content.includes(missingKws[mi])) {
            target.content += ' ' + missingKws[mi];
          }
        }
      }
      totalChars = enrichedBlocks.reduce((sum, bl) => sum + getBlockCharCount(bl), 0);
    }
  }

  return {
    framework: actualFrameworkId,
    frameworkName: framework.name,
    blocks: enrichedBlocks,
    totalCharCount: totalChars,
  };
}

/**
 * 설득형 콘텐츠를 레거시 paragraphs 형식으로 변환
 * (기존 StoryResult와 하위 호환)
 */
export function contentBlocksToParagraphs(blocks: ContentBlock[]): string[] {
  return blocks.map(block => {
    const parts: string[] = [block.content];

    if (block.subContent) {
      parts.push(block.subContent);
    }

    if (block.items && block.items.length > 0) {
      parts.push(block.items.join(' | '));
    }

    if (block.emphasis) {
      parts.push(block.emphasis);
    }

    return parts.join(' ');
  });
}

/**
 * 배치 설득형 콘텐츠 생성
 */
export function generatePersuasionBatch(
  products: { name: string; categoryPath: string; categoryCode?: string }[],
  sellerSeed: string,
): PersuasionResult[] {
  return products.map((p, i) =>
    generatePersuasionContent(p.name, p.categoryPath, sellerSeed, i, undefined, p.categoryCode),
  );
}
