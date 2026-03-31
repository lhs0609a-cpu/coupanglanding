// ============================================================
// 조합형 문장 생성 엔진 (Fragment Composer)
//
// 원자적 문장 조각(openers × values × closers)을 시드 랜덤으로
// 조합하여 ContentBlock[]을 생성한다.
//
// 5-Layer 아키텍처:
//   L1: 원자적 조각 (persuasion-fragments.json)
//   L2: 중분류 변수풀 (story-templates.json 확장)
//   L3: 상품명 파서 (product-name-parser)
//   L4: SEO 키워드 위빙 (seo-keyword-resolver)
//   L5: 셀러 시드 차별화 (seeded-random)
// ============================================================

import fragmentData from '../data/persuasion-fragments.json';
import storyData from '../data/story-templates.json';

// ─── 타입 (여기가 원본 — persuasion-engine에서 re-export) ──

export type ContentBlockType =
  | 'hook'
  | 'problem'
  | 'agitation'
  | 'solution'
  | 'benefits_grid'
  | 'social_proof'
  | 'comparison'
  | 'feature_detail'
  | 'usage_guide'
  | 'urgency'
  | 'cta';

export interface ContentBlock {
  type: ContentBlockType;
  content: string;
  subContent?: string;
  items?: string[];
  emphasis?: string;
}

interface FragmentPool {
  openers: string[];
  values: string[];
  closers: string[];
  emphases?: string[];
  titles?: string[];
  item_pool?: string[];
}

interface FrameworkDef {
  name: string;
  blocks: string[];
}

// ─── 데이터 로드 ─────────────────────────────────────────

const FRAGMENTS: Record<string, Record<string, FragmentPool>> =
  (fragmentData as Record<string, unknown>).fragments as Record<string, Record<string, FragmentPool>>;

const FRAMEWORKS: Record<string, FrameworkDef> =
  (fragmentData as Record<string, unknown>).frameworks as Record<string, FrameworkDef>;

const CATEGORY_FRAMEWORKS: Record<string, string[]> =
  (fragmentData as Record<string, unknown>).categoryFrameworks as Record<string, string[]>;

const VARIABLES: Record<string, Record<string, string[]>> =
  storyData.variables as Record<string, Record<string, string[]>>;

// ─── Layer 2: 계층적 조각 풀 해석 ───────────────────────

/**
 * blockType × categoryPath → 가장 구체적인 FragmentPool 반환.
 * 소분류→중분류→대분류→DEFAULT 폴백.
 */
export function resolveFragments(
  blockType: string,
  categoryPath: string,
): FragmentPool {
  const blockFragments = FRAGMENTS[blockType];
  if (!blockFragments) {
    return { openers: [], values: [], closers: [] };
  }

  // 1. 정확 매칭
  if (blockFragments[categoryPath]) return blockFragments[categoryPath];

  // 2. 뒤에서부터 줄여가며 매칭
  const parts = categoryPath.split('>').map(p => p.trim());
  for (let len = parts.length - 1; len >= 1; len--) {
    const key = parts.slice(0, len).join('>');
    if (blockFragments[key]) return blockFragments[key];
  }

  // 3. 대분류 부분 매칭
  const top = parts[0];
  for (const key of Object.keys(blockFragments)) {
    if (key === top || key.startsWith(top + '>')) {
      return blockFragments[key];
    }
  }

  // 4. DEFAULT
  return blockFragments['DEFAULT'] || { openers: [], values: [], closers: [] };
}

// ─── Layer 2: 계층적 변수풀 해석 ────────────────────────

/**
 * categoryPath에서 가장 구체적인 변수풀을 반환.
 * 중분류→대분류→DEFAULT 폴백. 상위 변수를 하위가 오버라이드(prepend).
 */
export function resolveVariables(categoryPath: string): Record<string, string[]> {
  const parts = categoryPath.split('>').map(p => p.trim());

  // 대분류 키 추론 (getCategoryKey 로직 인라인)
  const topKey = inferTopCategory(parts[0] || '', categoryPath);

  // 기본 변수풀: DEFAULT → 대분류
  const base = { ...(VARIABLES['DEFAULT'] || {}) };
  const topVars = VARIABLES[topKey];
  if (topVars) {
    for (const [k, v] of Object.entries(topVars)) {
      base[k] = v;
    }
  }

  // 중분류 변수풀 오버라이드 (있으면 prepend)
  for (let len = 2; len <= parts.length; len++) {
    const subKey = parts.slice(0, len).join('>');
    const subVars = VARIABLES[subKey];
    if (subVars) {
      for (const [k, v] of Object.entries(subVars)) {
        if (base[k]) {
          // prepend: 중분류 값이 앞에, 대분류 값이 뒤에
          const merged = [...v];
          for (const existing of base[k]) {
            if (!merged.includes(existing)) merged.push(existing);
          }
          base[k] = merged;
        } else {
          base[k] = v;
        }
      }
    }
  }

  return base;
}

function inferTopCategory(top: string, full: string): string {
  const fl = full.toLowerCase();
  if (top.includes('뷰티') || top.includes('화장품')) return '뷰티';
  if (top.includes('식품') || top.includes('건강식품')) return '식품';
  if (top.includes('생활') || fl.includes('세제') || fl.includes('욕실') || fl.includes('수납')) return '생활용품';
  if (top.includes('가전') || top.includes('디지털') || fl.includes('컴퓨터') || fl.includes('영상')) return '가전/디지털';
  if (top.includes('패션') || top.includes('의류') || top.includes('잡화') || fl.includes('신발') || fl.includes('가방')) return '패션의류잡화';
  if (top.includes('가구') || top.includes('홈데코') || fl.includes('침대') || fl.includes('소파') || fl.includes('인테리어')) return '가구/홈데코';
  if (top.includes('출산') || top.includes('유아') || fl.includes('기저귀') || fl.includes('분유')) return '출산/유아동';
  if (top.includes('스포츠') || top.includes('레져') || fl.includes('헬스') || fl.includes('골프') || fl.includes('캠핑')) return '스포츠/레져';
  if (top.includes('반려') || top.includes('애완') || fl.includes('사료') || fl.includes('고양이') || fl.includes('강아지')) return '반려/애완용품';
  if (top.includes('주방') || fl.includes('프라이팬') || fl.includes('냄비') || fl.includes('식기')) return '주방용품';
  if (top.includes('문구') || top.includes('사무') || fl.includes('필기') || fl.includes('노트')) return '문구/오피스';
  if (top.includes('완구') || top.includes('취미') || fl.includes('퍼즐') || fl.includes('보드게임')) return '완구/취미';
  if (top.includes('자동차') || fl.includes('블랙박스') || fl.includes('세차')) return '자동차용품';
  return 'DEFAULT';
}

// ─── Layer 3: 상품 토큰 + 카테고리 변수 병합 ────────────

/**
 * 상품 토큰 오버라이드를 변수풀에 prepend 병합.
 * 상품 토큰이 높은 확률로 선택되되, 카테고리 풀도 폴백 유지.
 */
export function mergeVariables(
  categoryVars: Record<string, string[]>,
  productOverrides: Record<string, string[]>,
): Record<string, string[]> {
  const result = { ...categoryVars };
  for (const [key, overrideValues] of Object.entries(productOverrides)) {
    if (result[key]) {
      const merged = [...overrideValues];
      for (const existing of result[key]) {
        if (!merged.includes(existing)) merged.push(existing);
      }
      result[key] = merged;
    } else {
      result[key] = overrideValues;
    }
  }
  return result;
}

// ─── Layer 4: SEO 키워드 변수풀 보강 ────────────────────

/**
 * SEO 키워드를 변수풀에 주입한다.
 * - seoKeywords 중 짧은 키워드(≤6자) → 효과1/효과2 앞에 prepend
 * - 긴 키워드 → 카테고리 앞에 prepend
 */
export function enrichVariablesWithSeo(
  vars: Record<string, string[]>,
  seoKeywords: string[],
  rng: () => number,
): Record<string, string[]> {
  if (!seoKeywords || seoKeywords.length === 0) return vars;

  const result = { ...vars };
  for (const [key, val] of Object.entries(result)) {
    result[key] = [...val]; // 원본 불변 보장
  }

  const shortKws = seoKeywords.filter(k => k.length <= 6);
  const longKws = seoKeywords.filter(k => k.length > 6);

  // 효과1/효과2에 짧은 SEO 키워드 prepend
  if (shortKws.length > 0) {
    const picked = shortKws[Math.floor(rng() * shortKws.length)];
    if (result['효과1'] && !result['효과1'].includes(picked)) {
      result['효과1'] = [picked, ...result['효과1']];
    }
    if (shortKws.length > 1) {
      const picked2 = shortKws.filter(k => k !== picked)[0];
      if (picked2 && result['효과2'] && !result['효과2'].includes(picked2)) {
        result['효과2'] = [picked2, ...result['효과2']];
      }
    }
  }

  // 카테고리에 긴 SEO 키워드 prepend
  if (longKws.length > 0) {
    const picked = longKws[Math.floor(rng() * longKws.length)];
    if (result['카테고리'] && !result['카테고리'].includes(picked)) {
      result['카테고리'] = [picked, ...result['카테고리']];
    }
  }

  return result;
}

// ─── Layer 4: SEO 키워드 인라인 위빙 ────────────────────

/**
 * 40% 확률로 SEO 키워드를 문장에 자연스럽게 삽입한다.
 * hook/cta 블록에서는 삽입 확률 더 높음(60%).
 */
export function maybeSeoWeave(
  content: string,
  seoKeywords: string[],
  rng: () => number,
  blockType: string,
): string {
  if (!seoKeywords || seoKeywords.length === 0) return content;

  const threshold = (blockType === 'hook' || blockType === 'cta') ? 0.6 : 0.4;
  if (rng() > threshold) return content;

  const kw = seoKeywords[Math.floor(rng() * seoKeywords.length)];

  // 이미 포함되어 있으면 스킵
  if (content.includes(kw)) return content;

  // 마침표/물음표 앞에 삽입
  const punctIdx = content.search(/[.?!。]$/);
  if (punctIdx >= 0) {
    return content.slice(0, punctIdx) + ' ' + kw + content.slice(punctIdx);
  }

  // 문장 끝에 추가
  return content + ' ' + kw;
}

// ─── Layer 1: 변수 치환 ─────────────────────────────────

function fillTemplate(
  template: string,
  vars: Record<string, string[]>,
  productName: string,
  rng: () => number,
): string {
  let result = template;
  result = result.replace(/\{product\}/g, productName);
  result = result.replace(/\{([^}]+)\}/g, (match, key) => {
    const pool = vars[key];
    if (pool && pool.length > 0) {
      return pool[Math.floor(rng() * pool.length)];
    }
    // 미해결 변수는 빈 문자열로 제거 (문법 안전)
    return '';
  });
  return result;
}

// ─── Layer 1: 단일 블록 조합 ────────────────────────────

/**
 * 하나의 ContentBlock을 조각 조합으로 생성한다.
 */
export function composeBlock(
  blockType: ContentBlockType,
  categoryPath: string,
  vars: Record<string, string[]>,
  productName: string,
  seoKeywords: string[],
  rng: () => number,
): ContentBlock {
  // social_proof, usage_guide는 자체 조각풀 사용, 없으면 solution으로 폴백
  const effectiveType = blockType;
  const rawPool = resolveFragments(effectiveType, categoryPath);
  // 안전 기본값 보장
  const pool: FragmentPool = {
    openers: rawPool.openers || [],
    values: rawPool.values || [],
    closers: rawPool.closers || [],
    emphases: rawPool.emphases,
    titles: rawPool.titles,
    item_pool: rawPool.item_pool,
  };
  const hasPool = pool.openers.length > 0 || pool.values.length > 0;

  // 풀이 비어있으면 solution 풀로 폴백 (social_proof, usage_guide 등)
  const actualPool = hasPool ? pool : resolveFragments('solution', categoryPath);

  switch (blockType) {
    case 'hook':
    case 'solution':
    case 'social_proof':
    case 'usage_guide': {
      // 1차 문장
      const content = composeOneSentence(actualPool, vars, productName, seoKeywords, rng, blockType);
      // 2차 문장 (subContent) — 다른 조합으로 생성
      const subContent = composeOneSentence(actualPool, vars, productName, seoKeywords, rng, blockType);

      return { type: blockType, content, subContent: content !== subContent ? subContent : undefined };
    }

    case 'feature_detail': {
      const opener = pickRandom(actualPool.openers, rng);
      const value = pickRandom(actualPool.values, rng);
      const closer = pickRandom(actualPool.closers, rng);
      const emphasis = actualPool.emphases && actualPool.emphases.length > 0
        ? actualPool.emphases[Math.floor(rng() * actualPool.emphases.length)]
        : undefined;

      let rawContent = [opener, value, closer].filter(Boolean).join(' ');
      rawContent = fillTemplate(rawContent, vars, productName, rng);
      rawContent = maybeSeoWeave(rawContent, seoKeywords, rng, blockType);
      rawContent = cleanSpaces(rawContent);

      // subContent — 다른 조합
      const subContent = composeOneSentence(actualPool, vars, productName, seoKeywords, rng, blockType);

      const filledEmphasis = emphasis
        ? fillTemplate(emphasis, vars, productName, rng)
        : undefined;

      return {
        type: blockType,
        content: rawContent,
        subContent: rawContent !== subContent ? subContent : undefined,
        emphasis: filledEmphasis,
      };
    }

    case 'benefits_grid': {
      const title = actualPool.titles && actualPool.titles.length > 0
        ? actualPool.titles[Math.floor(rng() * actualPool.titles.length)]
        : '핵심 장점';

      // item_pool에서 5개 비중복 선택 (기존 3→5)
      const items = selectDistinct(actualPool.item_pool || [], 5, rng);
      const filledItems = items.map(item => {
        let filled = fillTemplate(item, vars, productName, rng);
        // {seo_keyword} 치환
        if (filled.includes('{seo_keyword}') && seoKeywords.length > 0) {
          filled = filled.replace(
            /\{seo_keyword\}/g,
            seoKeywords[Math.floor(rng() * seoKeywords.length)],
          );
        }
        return filled;
      });

      return { type: blockType, content: title, items: filledItems };
    }

    case 'cta': {
      const opener = pickRandom(actualPool.openers, rng);
      const closer = pickRandom(actualPool.closers, rng);

      let rawContent = [opener, closer].filter(Boolean).join(' ');
      rawContent = fillTemplate(rawContent, vars, productName, rng);
      rawContent = maybeSeoWeave(rawContent, seoKeywords, rng, blockType);
      rawContent = cleanSpaces(rawContent);

      // subContent 추가
      const sub = composeOneSentence(actualPool, vars, productName, seoKeywords, rng, blockType);

      return { type: blockType, content: rawContent, subContent: rawContent !== sub ? sub : undefined };
    }

    default: {
      // 미지원 블록타입은 hook 로직으로 폴백
      const fb = resolveFragments('hook', categoryPath);
      const content = composeOneSentence(fb, vars, productName, seoKeywords, rng, blockType);
      const subContent = composeOneSentence(fb, vars, productName, seoKeywords, rng, blockType);
      return { type: blockType, content, subContent: content !== subContent ? subContent : undefined };
    }
  }
}

/** 하나의 문장을 조각 풀에서 조합한다. */
function composeOneSentence(
  pool: FragmentPool,
  vars: Record<string, string[]>,
  productName: string,
  seoKeywords: string[],
  rng: () => number,
  blockType: string,
): string {
  const opener = pickRandom(pool.openers, rng);
  const value = pickRandom(pool.values, rng);
  const closer = pickRandom(pool.closers, rng);

  let raw = [opener, value, closer].filter(Boolean).join(' ');
  raw = fillTemplate(raw, vars, productName, rng);
  raw = maybeSeoWeave(raw, seoKeywords, rng, blockType);
  raw = cleanSpaces(raw);
  return raw;
}

/** 배열에서 랜덤 1개 선택 (빈 배열이면 '') */
function pickRandom(arr: string[], rng: () => number): string {
  if (!arr || arr.length === 0) return '';
  return arr[Math.floor(rng() * arr.length)];
}

// ─── 프레임워크 전체 블록 시퀀스 조합 ───────────────────

/**
 * 프레임워크의 블록 시퀀스를 조합하여 ContentBlock[] 반환.
 */
export function composeAllBlocks(
  framework: FrameworkDef,
  categoryPath: string,
  vars: Record<string, string[]>,
  productName: string,
  seoKeywords: string[],
  rng: () => number,
): ContentBlock[] {
  return framework.blocks.map(blockType =>
    composeBlock(
      blockType as ContentBlockType,
      categoryPath,
      vars,
      productName,
      seoKeywords,
      rng,
    ),
  );
}

// ─── 프레임워크 / 카테고리프레임워크 외부 노출 ──────────

export function getFrameworks(): Record<string, FrameworkDef> {
  return FRAMEWORKS;
}

export function getCategoryFrameworks(): Record<string, string[]> {
  return CATEGORY_FRAMEWORKS;
}

/**
 * categoryPath에서 가장 구체적인 프레임워크 배열 반환.
 * 소분류→중분류→대분류→DEFAULT 폴백.
 */
export function resolveCategoryFrameworks(categoryPath: string): string[] {
  // 정확 매칭
  if (CATEGORY_FRAMEWORKS[categoryPath]) return CATEGORY_FRAMEWORKS[categoryPath];

  // 뒤에서부터 줄여가며 매칭
  const parts = categoryPath.split('>').map(p => p.trim());
  for (let len = parts.length - 1; len >= 1; len--) {
    const key = parts.slice(0, len).join('>');
    if (CATEGORY_FRAMEWORKS[key]) return CATEGORY_FRAMEWORKS[key];
  }

  // 대분류 추론
  const topKey = inferTopCategory(parts[0] || '', categoryPath);
  if (CATEGORY_FRAMEWORKS[topKey]) return CATEGORY_FRAMEWORKS[topKey];

  return CATEGORY_FRAMEWORKS['DEFAULT'] || ['AIDA', 'PAS', 'LIFESTYLE'];
}

// ─── 유틸 ────────────────────────────────────────────────

/** 배열에서 비중복 n개 선택 (Fisher-Yates) */
function selectDistinct<T>(arr: T[], n: number, rng: () => number): T[] {
  if (arr.length <= n) return [...arr];
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

/** 연속 공백 정리, 앞뒤 공백 제거 */
function cleanSpaces(str: string): string {
  return str.replace(/\s{2,}/g, ' ').trim();
}
