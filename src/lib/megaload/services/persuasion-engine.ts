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
import { parseProductName, tokensToVariableOverrides, extractContextOverrides } from './product-name-parser';
import type { ProductContext } from './product-name-parser';
import { sanitizeHealthText } from './health-sanitizer';

// ─── 타입 re-export (원본은 fragment-composer.ts) ────────────

export type { ContentBlockType, ContentBlock, ProductContext };

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

  // 종결어미/조사 뒤 부자연 키워드 부착 방지 (fragment-composer의 maybeSeoWeave와 동일 가드)
  const UNNATURAL_TAIL = /(입니다|습니다|예요|에요|어요|아요|해요|되요|돼요|이죠|네요|군요|세요|죠|다|요)[.!?。]?$/;
  const PARTICLE_TAIL = /[은는이가을를과와도만에의로]\s*[.!?。]?$/;

  return blocks.map(block => {
    const enriched = { ...block };

    switch (block.type) {
      case 'hook': {
        const kw = nextKw();
        if (enriched.content.includes(kw)) break;
        const content = enriched.content;
        // ⚠️ 종결어미/조사로 끝나면 키워드 부착 시 "...입니다 국내산." 같이 부자연
        //    → 부착 자체를 건너뜀 (다음 키워드 사이클에서 다른 블록 시도)
        if (UNNATURAL_TAIL.test(content) || PARTICLE_TAIL.test(content)) {
          break;
        }
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
        // CTA의 subContent로만 사용 — 본문 끝 부착 X
        enriched.subContent = kw;
        break;
      }

      default:
        break;
    }

    return enriched;
  });
}

// ─── 건강식품 성분→효과 자동 추론 ─────────────────────────────

const HEALTH_EFFECT_MAP: Record<string, { 효과1: string[]; 효과2: string[]; 카테고리: string[] }> = {
  '비오틴':       { 효과1: ['모발건강','피부건강','손톱건강','두피건강'], 효과2: ['탈모예방','모발윤기','피부탄력'], 카테고리: ['비오틴','모발영양제'] },
  '오메가3':      { 효과1: ['혈관건강','혈행개선','중성지방감소'], 효과2: ['혈행촉진','심장건강','혈류개선'], 카테고리: ['오메가3','혈관건강'] },
  '루테인':       { 효과1: ['눈건강','시력보호','황반건강'], 효과2: ['눈피로회복','블루라이트차단'], 카테고리: ['루테인','눈영양제'] },
  '밀크씨슬':     { 효과1: ['간건강','간보호','간해독'], 효과2: ['숙취해소','피로회복'], 카테고리: ['밀크씨슬','간영양제'] },
  '유산균':       { 효과1: ['장건강','소화흡수','배변활동'], 효과2: ['쾌변','더부룩함해소'], 카테고리: ['유산균','프로바이오틱스'] },
  '프로바이오틱스': { 효과1: ['장건강','소화흡수','장내환경'], 효과2: ['유익균증식','소화력향상'], 카테고리: ['유산균','프로바이오틱스'] },
  '콜라겐':       { 효과1: ['피부탄력','피부보습','주름개선'], 효과2: ['피부윤기','보습력향상'], 카테고리: ['콜라겐','이너뷰티'] },
  '히알루론산':    { 효과1: ['피부보습','피부탄력','주름개선'], 효과2: ['보습력향상','피부결개선'], 카테고리: ['콜라겐','이너뷰티'] },
  '홍삼':         { 효과1: ['면역력','피로회복','활력'], 효과2: ['에너지충전','면역증진'], 카테고리: ['홍삼','면역영양제'] },
  '진세노사이드':  { 효과1: ['면역력','피로회복','활력'], 효과2: ['체력보강','면역강화'], 카테고리: ['홍삼','면역영양제'] },
  '글루코사민':    { 효과1: ['관절건강','연골보호','관절유연성'], 효과2: ['관절통완화','보행편안'], 카테고리: ['관절영양제','글루코사민'] },
  '콘드로이친':    { 효과1: ['관절건강','연골보호','뼈건강'], 효과2: ['연골강화','움직임개선'], 카테고리: ['관절영양제','글루코사민'] },
  '보스웰리아':    { 효과1: ['관절건강','관절유연성','연골보호'], 효과2: ['관절편안함','움직임개선'], 카테고리: ['관절영양제','보스웰리아'] },
  'MSM':          { 효과1: ['관절건강','연골보호','관절유연성'], 효과2: ['관절편안함','무릎건강'], 카테고리: ['관절영양제','MSM'] },
  '코엔자임':      { 효과1: ['항산화','심장건강','에너지생성'], 효과2: ['심장기능','세포활력'], 카테고리: ['코엔자임Q10','항산화영양제'] },
  '쏘팔메토':      { 효과1: ['전립선건강','배뇨기능','남성건강'], 효과2: ['전립선기능','배뇨편안'], 카테고리: ['쏘팔메토','남성영양제'] },
  '엽산':         { 효과1: ['태아건강','세포분열','임산부건강'], 효과2: ['태아발달','빈혈예방'], 카테고리: ['엽산','임산부영양제'] },
  '가르시니아':    { 효과1: ['체지방감소','식욕억제','대사촉진'], 효과2: ['체중관리','지방감소'], 카테고리: ['다이어트','체지방관리'] },
  '스피루리나':    { 효과1: ['영양균형','항산화','면역력'], 효과2: ['영양보충','해독력'], 카테고리: ['스피루리나','녹색영양'] },
  '클로렐라':      { 효과1: ['영양균형','항산화','디톡스'], 효과2: ['영양보충','면역강화'], 카테고리: ['클로렐라','녹색영양'] },
  '흑마늘':       { 효과1: ['면역력','항산화','피로회복'], 효과2: ['면역강화','활력개선'], 카테고리: ['흑마늘','면역영양제'] },
  '마그네슘':      { 효과1: ['근육이완','신경안정','수면개선'], 효과2: ['근육경련완화','스트레스완화'], 카테고리: ['마그네슘','미네랄'] },
  '칼슘':         { 효과1: ['뼈건강','골밀도','치아건강'], 효과2: ['뼈밀도유지','골다공증예방'], 카테고리: ['칼슘','미네랄'] },
  '철분':         { 효과1: ['빈혈예방','혈액생성','에너지대사'], 효과2: ['피로감소','활력증진'], 카테고리: ['철분','미네랄'] },
  '프로틴':       { 효과1: ['근력강화','근육회복','단백질보충'], 효과2: ['근육합성','운동효과'], 카테고리: ['프로틴','단백질보충제'] },
  'EPA':          { 효과1: ['혈관건강','혈행개선','중성지방감소'], 효과2: ['혈류개선','심장건강'], 카테고리: ['오메가3','혈관건강'] },
  'DHA':          { 효과1: ['혈관건강','두뇌건강','혈행개선'], 효과2: ['혈류개선','기억력향상'], 카테고리: ['오메가3','혈관건강'] },
  '크릴오일':      { 효과1: ['혈관건강','혈행개선','항산화'], 효과2: ['혈류개선','중성지방관리'], 카테고리: ['크릴오일','혈관건강'] },
};

function inferHealthEffects(ingredients: string[]): Record<string, string[]> {
  const effects1: string[] = [];
  const effects2: string[] = [];
  const categories: string[] = [];

  for (const ingredient of ingredients) {
    for (const [key, mapping] of Object.entries(HEALTH_EFFECT_MAP)) {
      if (ingredient.includes(key) || key.includes(ingredient)) {
        effects1.push(...mapping['효과1']);
        effects2.push(...mapping['효과2']);
        categories.push(...mapping['카테고리']);
        break;
      }
    }
  }

  return {
    '효과1': [...new Set(effects1)],
    '효과2': [...new Set(effects2)],
    '카테고리': [...new Set(categories)],
  };
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
  productContext?: ProductContext,
): PersuasionResult {
  // 시드 기반 RNG — 카테고리도 시드에 포함하여 같은 상품명이라도
  // 카테고리가 다르면 다른 텍스트가 생성되도록 한다.
  const seed = stringToSeed(`${sellerSeed}::persuasion::${productIndex}::${productName}::${categoryPath}::${categoryCode || ''}`);
  const rng = createSeededRandom(seed);

  // 이름 정리
  const cleanName = productName
    .replace(/[\[\(【][^\]\)】]*[\]\)】]/g, '')
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
    .split(/\s+/).filter(w => w.length >= 2).slice(0, 3).join(' ');

  // ── Layer 3: 상품명 파싱 → 변수 오버라이드 ──
  const tokens = parseProductName(productName, categoryPath, '');
  const productOverrides = tokensToVariableOverrides(tokens);

  // ── Layer 3.5: 상품 컨텍스트 → 변수 오버라이드 강화 ──
  let hasStrongContext = false;
  if (productContext) {
    const contextOverrides = extractContextOverrides(productContext, categoryPath);
    for (const [key, values] of Object.entries(contextOverrides)) {
      if (values.length > 0) {
        // 기존 파싱 결과 앞에 컨텍스트 값을 prepend (높은 선택 확률)
        const existing = productOverrides[key] || [];
        productOverrides[key] = [...values, ...existing.filter(v => !values.includes(v))];
      }
    }
    // 건강식품: 성분에서 효과 자동 추론 (비오틴→모발건강, 오메가3→혈관건강 등)
    if (categoryPath.includes('건강식품') && productOverrides['성분']?.length > 0) {
      const inferred = inferHealthEffects(productOverrides['성분']);
      if (inferred['효과1']?.length > 0 && !productOverrides['효과1']?.length) {
        productOverrides['효과1'] = inferred['효과1'];
      }
      if (inferred['효과2']?.length > 0 && !productOverrides['효과2']?.length) {
        productOverrides['효과2'] = inferred['효과2'];
      }
      if (inferred['카테고리']?.length > 0 && !productOverrides['카테고리']?.length) {
        productOverrides['카테고리'] = inferred['카테고리'];
      }
    }
    // 1개 이상 오버라이드 → 강한 컨텍스트 (카테고리 폴백 최소화)
    hasStrongContext = Object.keys(productOverrides).length >= 1;
  }

  // ── CPG 프로필 조회 → forbiddenTerms 추출 ──
  const profile = getContentProfile(categoryPath, categoryCode);

  // ── Layer 2: 카테고리 변수풀 해석 (CPG 격리 or 레거시) ──
  // productName 전달 — 건강식품 성분 cross-leak 방지 (비타민D 제품에 콜라겐/밀크씨슬 누수 차단)
  const categoryVars = resolveVariables(categoryPath, categoryCode, productName);

  // ── Layer 3+2: 변수 병합 (상품 토큰 우선 + forbiddenTerms 필터 + L1 안전망) ──
  let vars = mergeVariables(categoryVars, productOverrides, profile?.forbiddenTerms, hasStrongContext, categoryPath);

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

  // ── Layer 1: 블록 시퀀스 조합 (forbiddenTerms 전달 → 프래그먼트 필터) ──
  const blocks = composeAllBlocks(
    framework,
    categoryPath,
    vars,
    cleanName,
    seoKeywords || [],
    rng,
    profile?.forbiddenTerms,
  );

  // ── Layer 4: SEO 안전망 (인라인 위빙 실패 시) ──
  const enrichedBlocks = seoKeywords && seoKeywords.length > 0
    ? seoEnrichBlocks(blocks, seoKeywords)
    : blocks;

  // ── 글자수 검증 (600~1200자 타겟) ──
  let totalChars = enrichedBlocks.reduce((sum, b) => sum + getBlockCharCount(b), 0);

  // 글자수 < MIN_CHARS이면 블록 추가 (중복 텍스트 방지 — content 기준 dedup)
  // SEO 스터핑 방지: solution 비중 축소(상품명 {product} 다수 포함). feature_detail/usage_guide 위주.
  // ⚠️ Phase 9: 8 → 18로 확장 — 평균 1900자 → 2500+자 보장 (Coupang SEO 권장 충족)
  const paddingTypes: ContentBlockType[] = [
    'feature_detail', 'social_proof', 'usage_guide', 'comparison',
    'feature_detail', 'social_proof', 'usage_guide', 'feature_detail',
    'comparison', 'feature_detail', 'social_proof', 'usage_guide',
    'feature_detail', 'comparison', 'social_proof', 'usage_guide',
    'feature_detail', 'social_proof',
  ];
  const seenPadHeads = new Set<string>(
    enrichedBlocks.map(b => (b.content || '').trim().slice(0, 80)).filter(Boolean),
  );
  let padIdx = 0;
  while (totalChars < MIN_CHARS && padIdx < paddingTypes.length) {
    const extraBlock = composeBlock(
      paddingTypes[padIdx],
      categoryPath,
      vars,
      cleanName,
      seoKeywords || [],
      rng,
      profile?.forbiddenTerms,
    );
    padIdx++;
    const head = (extraBlock.content || '').trim().slice(0, 80);
    // 빈 블록 or 기존 블록과 선행 80자 동일 → 버림
    if (!head || seenPadHeads.has(head)) continue;
    seenPadHeads.add(head);
    // cta 앞에 삽입
    const ctaIdx = enrichedBlocks.findIndex(b => b.type === 'cta');
    if (ctaIdx >= 0) {
      enrichedBlocks.splice(ctaIdx, 0, extraBlock);
    } else {
      enrichedBlocks.push(extraBlock);
    }
    totalChars += getBlockCharCount(extraBlock);
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

  // ── 건강식품 교차 오염 후처리 ──
  if (categoryPath.includes('건강식품')) {
    for (const block of enrichedBlocks) {
      block.content = sanitizeHealthText(block.content, categoryPath, cleanName);
      if (block.subContent) block.subContent = sanitizeHealthText(block.subContent, categoryPath, cleanName);
      if (block.emphasis) block.emphasis = sanitizeHealthText(block.emphasis, categoryPath, cleanName);
      if (block.items) block.items = block.items.map(item => sanitizeHealthText(item, categoryPath, cleanName)).filter(Boolean);
    }
    totalChars = enrichedBlocks.reduce((sum, bl) => sum + getBlockCharCount(bl), 0);
  }

  // ── 블록 순서 정규화: hook 첫째, cta 마지막 (no_cta 5.9% 해결) ──
  // 패딩 삽입 후 cta가 중간에 끼는 경우 방지. 마지막 200자에 행동 유도 보장.
  const hookIdx2 = enrichedBlocks.findIndex(b => b.type === 'hook');
  const ctaIdx2 = enrichedBlocks.findIndex(b => b.type === 'cta');
  if (hookIdx2 > 0) {
    const [hookBlock] = enrichedBlocks.splice(hookIdx2, 1);
    enrichedBlocks.unshift(hookBlock);
  }
  if (ctaIdx2 >= 0 && ctaIdx2 !== enrichedBlocks.length - 1) {
    const newCtaIdx = enrichedBlocks.findIndex(b => b.type === 'cta');
    const [ctaBlock] = enrichedBlocks.splice(newCtaIdx, 1);
    enrichedBlocks.push(ctaBlock);
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
/**
 * 문장 단위 dedup 헬퍼 — 한 문단 내, 그리고 페이지 전역에서 동일 문장 반복 차단.
 *
 * audit 결과 73% 페이지에서 중복 문장 발견 (5085중 3733). 원인:
 *  - composeBlock의 subContent dedup이 정확 일치만 잡음
 *  - 하지만 SEO weave/var fill 후 문자열은 약간 다르지만 본질이 같은 경우 통과
 *  - 또 블록 간 dedup은 없어서 hook + social_proof가 같은 문장 사용 가능
 *
 * 해결: 정규화(SEO 키워드 제거, 상품명 변형 제거, 공백)된 문장으로 비교 후
 * 중복이면 제거. 페이지 전역 Set으로 블록 간에도 차단.
 */
function normalizeSentenceForDedup(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .toLowerCase()
    .slice(0, 80); // 긴 문장도 첫 80자로 비교
}

function deduplicateSentencesInText(text: string, globalSeen: Set<string>): string {
  if (!text) return '';
  // 종결 표현(., !, ?) 으로 분리. 따옴표 안의 마침표는 일단 split됨 (대부분 안전).
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept: string[] = [];
  for (const s of sentences) {
    const trimmed = s.trim();
    if (trimmed.length === 0) continue;
    // 짧은 문장(15자 이하)은 dedup 제외 — 헤더/CTA 같은 짧은 표현은 반복 허용
    if (trimmed.length <= 15) {
      kept.push(trimmed);
      continue;
    }
    const key = normalizeSentenceForDedup(trimmed);
    if (key.length === 0) {
      kept.push(trimmed);
      continue;
    }
    if (globalSeen.has(key)) continue; // 페이지 어딘가에 이미 등장 → skip
    globalSeen.add(key);
    kept.push(trimmed);
  }
  return kept.join(' ');
}

/**
 * 한 단어가 한 페이지 내 12회 이상 등장하면 일부를 동의어/대명사로 치환.
 * audit 결과 5085중 2528 페이지에서 단어 반복 발견 (49%).
 *
 * 주요 반복 단어: "엄선한", "재료부터", "본연의 풍미", "프로파일"
 * → 동일 문장 dedup으로 대부분 자동 해소되지만 보완 안전망.
 */
const COMMON_REPEAT_WORDS = new Set([
  '엄선한', '엄선', '재료부터', '본연의', '풍미', '프로파일',
  '준비했습니다', '말이', '인상적', '균형감',
]);
function dampenWordRepetition(text: string): string {
  if (!text) return text;
  const counts = new Map<string, number>();
  // 한글 2자+ 단어 카운트
  const words = text.match(/[가-힣]{2,}/g) || [];
  for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);

  // 12회 이상 반복인 단어 식별 (단, COMMON_REPEAT_WORDS는 더 일찍 차단 = 8회)
  let result = text;
  for (const [word, count] of counts.entries()) {
    const threshold = COMMON_REPEAT_WORDS.has(word) ? 8 : 12;
    if (count < threshold) continue;
    // 첫 N회만 남기고 나머지는 빈 문자열 치환 — 같은 문장 부분 표현이 잘려나갈 수 있어
    // 보수적으로 (count - threshold) 만큼만 제거.
    let keepRemaining = threshold - 1;
    let removed = 0;
    const re = new RegExp(`(^|[^가-힣a-zA-Z])(${word})(?=[^가-힣a-zA-Z]|$)`, 'g');
    result = result.replace(re, (full, pre, w) => {
      if (keepRemaining > 0) { keepRemaining--; return full; }
      removed++;
      return pre; // word 제거, prefix는 유지
    });
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}

export function contentBlocksToParagraphs(blocks: ContentBlock[]): string[] {
  // 페이지 전역 dedup Set — 블록 간 동일 문장도 차단
  const globalSeen = new Set<string>();

  const paragraphs = blocks.map(block => {
    const parts: string[] = [];

    if (block.content) parts.push(block.content);
    if (block.subContent) parts.push(block.subContent);
    if (block.items && block.items.length > 0) {
      parts.push(block.items.join(' | '));
    }
    if (block.emphasis) parts.push(block.emphasis);

    const joined = parts.join(' ');
    return deduplicateSentencesInText(joined, globalSeen);
  });

  // 페이지 전체 단어 반복 완화 — 12회+(common 단어 8회+) 등장 단어 중 초과분 제거
  // 한 문단 단위로 적용하면 카운트가 분산되어 효과 없으니 전체 텍스트로 카운트한 뒤
  // 각 문단별로 적용.
  const fullText = paragraphs.join(' ');
  const wordCounts = new Map<string, number>();
  for (const w of (fullText.match(/[가-힣]{2,}/g) || [])) {
    wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
  }
  // 어떤 단어도 임계 이상이면 전체 dampen 적용
  const needsDampen = [...wordCounts.entries()].some(([w, c]) =>
    c >= (COMMON_REPEAT_WORDS.has(w) ? 8 : 12),
  );
  if (!needsDampen) return paragraphs;
  return paragraphs.map(p => dampenWordRepetition(p));
}

/**
 * 배치 설득형 콘텐츠 생성
 */
export function generatePersuasionBatch(
  products: { name: string; categoryPath: string; categoryCode?: string; context?: ProductContext }[],
  sellerSeed: string,
): PersuasionResult[] {
  return products.map((p, i) =>
    generatePersuasionContent(p.name, p.categoryPath, sellerSeed, i, undefined, p.categoryCode, p.context),
  );
}
