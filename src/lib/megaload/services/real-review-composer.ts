// ============================================================
// 리얼 후기 조합형 생성 엔진
//
// 5개 프레임 × 13+개 대분류 × 문장 조각 조합 → 4,000+ 소분류 자동 커버
//
// 기존 full-review-templates.json의 고정 템플릿 대신,
// fragment-composer 패턴을 적용한 조합형 시스템.
//
// 출력: 5~7개 문단의 리얼 후기 텍스트 (한 사람이 쓴 것처럼)
// ============================================================

import { createSeededRandom, stringToSeed } from './seeded-random';
import reviewFrameData from '../data/real-review-frames.json';
import storyData from '../data/story-templates.json';

// ─── 타입 ────────────────────────────────────────────────────

interface FragmentPool {
  openers: string[];
  values: string[];
  closers: string[];
}

interface ReviewFrame {
  name: string;
  description: string;
  structure: string[];
}

type FrameId = 'CONCLUSION_FIRST' | 'COMPARISON' | 'DAILY_LIFE' | 'GIFT_STORY' | 'REPURCHASE';

// ─── 데이터 로드 ─────────────────────────────────────────────

const FRAMES: Record<string, ReviewFrame> = reviewFrameData.frames as Record<string, ReviewFrame>;
const FRAGMENTS: Record<string, Record<string, FragmentPool>> = reviewFrameData.fragments as Record<string, Record<string, FragmentPool>>;
const CATEGORY_ALIASES: Record<string, string> = reviewFrameData.categoryAliases as Record<string, string>;
const VARIABLES: Record<string, Record<string, string[]>> = storyData.variables as Record<string, Record<string, string[]>>;

// ─── 카테고리 매핑 ───────────────────────────────────────────

function getReviewCategoryKey(categoryPath: string): string {
  const top = categoryPath.split('>')[0]?.trim() || '';

  if (top.includes('뷰티') || top.includes('화장품')) return '뷰티';
  if (top.includes('식품') || top.includes('건강식품')) return '식품';
  if (top.includes('생활') || categoryPath.includes('세제') || categoryPath.includes('욕실') || categoryPath.includes('수납')) return '생활용품';
  if (top.includes('가전') || top.includes('디지털')) return '가전/디지털';
  if (top.includes('패션') || top.includes('의류')) return '패션의류잡화';
  if (top.includes('가구') || top.includes('홈데코')) return '가구/홈데코';
  if (top.includes('출산') || top.includes('유아')) return '출산/유아동';
  if (top.includes('스포츠') || top.includes('레져')) return '스포츠/레져';
  if (top.includes('반려') || top.includes('애완')) return '반려/애완용품';
  if (top.includes('주방')) return '주방용품';
  if (top.includes('문구') || top.includes('사무')) return '문구/오피스';
  if (top.includes('완구') || top.includes('취미')) return '완구/취미';
  if (top.includes('자동차')) return '자동차용품';

  return 'DEFAULT';
}

function resolveFragmentCategory(catKey: string): string {
  // 직접 프래그먼트가 있으면 사용
  if (FRAGMENTS[catKey]) return catKey;
  // 별칭 확인
  if (CATEGORY_ALIASES[catKey]) return CATEGORY_ALIASES[catKey];
  return 'DEFAULT';
}

// ─── 변수 치환 ───────────────────────────────────────────────

/** 한글 받침 여부 판별 */
function hasFinalConsonant(char: string): boolean {
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return false;
  return (code - 0xAC00) % 28 !== 0;
}

/** 한국어 조사 자동 처리 — "효과1이/가", "효과1은/는", "효과1을/를" */
function fixKoreanParticles(text: string): string {
  return text
    .replace(/([\uAC00-\uD7A3])(이|가)(\s)/g, (_, prev, _p, sp) =>
      prev + (hasFinalConsonant(prev) ? '이' : '가') + sp)
    .replace(/([\uAC00-\uD7A3])(은|는)(\s)/g, (_, prev, _p, sp) =>
      prev + (hasFinalConsonant(prev) ? '은' : '는') + sp)
    .replace(/([\uAC00-\uD7A3])(을|를)(\s)/g, (_, prev, _p, sp) =>
      prev + (hasFinalConsonant(prev) ? '을' : '를') + sp)
    .replace(/([\uAC00-\uD7A3])(으로|로)(\s)/g, (_, prev, _p, sp) =>
      prev + (hasFinalConsonant(prev) ? '으로' : '로') + sp);
}

function fillVariables(
  text: string,
  vars: Record<string, string[]>,
  productName: string,
  rng: () => number,
): string {
  let result = text.replace(/\{product\}/g, productName);

  result = result.replace(/\{([^}]+)\}/g, (match, key) => {
    const pool = vars[key];
    if (pool && pool.length > 0) {
      return pool[Math.floor(rng() * pool.length)];
    }
    return match;
  });

  // 한국어 조사 자동 보정
  result = fixKoreanParticles(result);

  return result;
}

// ─── 프레임 선택 (카테고리별 가중치) ─────────────────────────

const CATEGORY_FRAME_WEIGHTS: Record<string, FrameId[]> = {
  '뷰티': ['CONCLUSION_FIRST', 'COMPARISON', 'DAILY_LIFE', 'GIFT_STORY', 'REPURCHASE'],
  '식품': ['CONCLUSION_FIRST', 'REPURCHASE', 'GIFT_STORY', 'DAILY_LIFE', 'COMPARISON'],
  '생활용품': ['DAILY_LIFE', 'REPURCHASE', 'CONCLUSION_FIRST', 'GIFT_STORY', 'COMPARISON'],
  '가전/디지털': ['COMPARISON', 'CONCLUSION_FIRST', 'DAILY_LIFE', 'REPURCHASE', 'GIFT_STORY'],
  '패션의류잡화': ['DAILY_LIFE', 'CONCLUSION_FIRST', 'COMPARISON', 'GIFT_STORY', 'REPURCHASE'],
  '가구/홈데코': ['COMPARISON', 'DAILY_LIFE', 'CONCLUSION_FIRST', 'GIFT_STORY', 'REPURCHASE'],
  '출산/유아동': ['GIFT_STORY', 'DAILY_LIFE', 'CONCLUSION_FIRST', 'REPURCHASE', 'COMPARISON'],
  '스포츠/레져': ['DAILY_LIFE', 'COMPARISON', 'CONCLUSION_FIRST', 'REPURCHASE', 'GIFT_STORY'],
  '반려/애완용품': ['DAILY_LIFE', 'GIFT_STORY', 'REPURCHASE', 'CONCLUSION_FIRST', 'COMPARISON'],
  '주방용품': ['DAILY_LIFE', 'COMPARISON', 'REPURCHASE', 'CONCLUSION_FIRST', 'GIFT_STORY'],
  '문구/오피스': ['DAILY_LIFE', 'CONCLUSION_FIRST', 'GIFT_STORY', 'COMPARISON', 'REPURCHASE'],
  '완구/취미': ['GIFT_STORY', 'DAILY_LIFE', 'CONCLUSION_FIRST', 'COMPARISON', 'REPURCHASE'],
  '자동차용품': ['COMPARISON', 'CONCLUSION_FIRST', 'DAILY_LIFE', 'REPURCHASE', 'GIFT_STORY'],
  'DEFAULT': ['CONCLUSION_FIRST', 'DAILY_LIFE', 'COMPARISON', 'REPURCHASE', 'GIFT_STORY'],
};

function selectFrame(catKey: string, rng: () => number): FrameId {
  const weights = CATEGORY_FRAME_WEIGHTS[catKey] || CATEGORY_FRAME_WEIGHTS['DEFAULT'];
  return weights[Math.floor(rng() * weights.length)];
}

// ─── SEO 글자수 상수 ────────────────────────────────────────

const REVIEW_MIN_CHARS = 400;   // 리뷰 텍스트 최소 (설득형 블록과 합쳐 800+ 목표)
const REVIEW_TARGET_CHARS = 600; // 리뷰 텍스트 목표

// ─── 보조 섹션 (글자수 부족 시 추가 생성용) ─────────────────

const PADDING_SECTIONS: string[] = ['experience', 'detail', 'daily_routine', 'motivation'];

// ─── 문장 조각 조합 ─────────────────────────────────────────

function composeFragment(
  pool: FragmentPool,
  rng: () => number,
): string {
  const opener = pool.openers[Math.floor(rng() * pool.openers.length)] || '';
  const value = pool.values[Math.floor(rng() * pool.values.length)] || '';
  const closer = pool.closers[Math.floor(rng() * pool.closers.length)] || '';

  const parts = [opener, value, closer].filter(p => p.length > 0);
  return parts.join(' ');
}

/** 같은 풀에서 다른 조합의 문장을 추가로 뽑는다 */
function composeExtraFragment(
  pool: FragmentPool,
  rng: () => number,
): string {
  // 다른 value를 뽑아서 variation 확보
  const value = pool.values[Math.floor(rng() * pool.values.length)] || '';
  const closer = pool.closers[Math.floor(rng() * pool.closers.length)] || '';
  const parts = [value, closer].filter(p => p.length > 0);
  return parts.join(' ');
}

// ─── 공개 API ────────────────────────────────────────────────

export interface RealReviewResult {
  paragraphs: string[];    // 5~7개 문단 (한 사람이 쓴 리얼 후기)
  frameId: string;         // 사용된 프레임 ID
  frameName: string;       // 프레임 표시 이름
}

/**
 * 리얼 후기 생성
 *
 * 하나의 완성된 후기를 5~7개 문단으로 생성.
 * 프레임(두괄식/비교형/일상형/선물형/재구매형) × 카테고리별 문장 조각 조합.
 */
export function generateRealReview(
  productName: string,
  categoryPath: string,
  sellerSeed: string,
  productIndex: number,
): RealReviewResult {
  const catKey = getReviewCategoryKey(categoryPath);
  const fragCatKey = resolveFragmentCategory(catKey);

  // 변수 풀
  const storyVarKey = catKey === 'DEFAULT' ? 'DEFAULT' :
    catKey.includes('뷰티') ? '뷰티' :
    catKey.includes('식품') ? '식품' :
    catKey.includes('생활') ? '생활용품' :
    catKey.includes('가전') ? '가전/디지털' :
    catKey.includes('패션') ? '패션의류잡화' :
    catKey.includes('가구') ? '가구/홈데코' :
    catKey.includes('출산') ? '출산/유아동' :
    catKey.includes('스포츠') ? '스포츠/레져' :
    catKey.includes('반려') ? '반려/애완용품' :
    catKey.includes('주방') ? '주방용품' :
    catKey.includes('문구') ? '문구/오피스' :
    catKey.includes('완구') ? '완구/취미' :
    catKey.includes('자동차') ? '자동차용품' :
    'DEFAULT';

  const vars = VARIABLES[storyVarKey] || VARIABLES['DEFAULT'];

  // 시드 기반 RNG
  const seed = stringToSeed(`${sellerSeed}::realreview::${productIndex}::${productName}`);
  const rng = createSeededRandom(seed);

  // 상품명 정리
  const cleanName = productName
    .replace(/[\[\(【][^\]\)】]*[\]\)】]/g, '')
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
    .split(/\s+/).filter(w => w.length >= 2).slice(0, 3).join(' ');

  // 프레임 선택
  const frameId = selectFrame(catKey, rng);
  const frame = FRAMES[frameId];
  const fragments = FRAGMENTS[fragCatKey] || FRAGMENTS['DEFAULT'];

  // 프레임 구조에 따라 문단 조합
  const paragraphs: string[] = [];

  for (const section of frame.structure) {
    const pool = fragments[section];
    if (!pool) continue;

    const raw = composeFragment(pool, rng);
    const filled = fillVariables(raw, vars, cleanName, rng);

    if (filled.trim().length > 5) {
      paragraphs.push(filled.trim());
    }

    // experience, detail 같은 핵심 섹션은 추가 문장으로 문단 보강
    if ((section === 'experience' || section === 'detail' || section === 'backstory') && pool.values.length > 2) {
      const extra = composeExtraFragment(pool, rng);
      const filledExtra = fillVariables(extra, vars, cleanName, rng);
      if (filledExtra.trim().length > 5) {
        // 이전 문단에 이어붙이기 (한 사람이 쓴 것처럼)
        const lastIdx = paragraphs.length - 1;
        if (lastIdx >= 0) {
          paragraphs[lastIdx] += ' ' + filledExtra.trim();
        }
      }
    }
  }

  // 글자수 보장: REVIEW_MIN_CHARS 미만이면 보조 섹션 추가
  let totalChars = paragraphs.join('').length;
  let padIdx = 0;

  while (totalChars < REVIEW_MIN_CHARS && padIdx < PADDING_SECTIONS.length) {
    const section = PADDING_SECTIONS[padIdx];
    const pool = fragments[section];
    padIdx++;

    if (!pool) continue;

    const raw = composeFragment(pool, rng);
    const filled = fillVariables(raw, vars, cleanName, rng);

    if (filled.trim().length > 5) {
      // verdict 바로 앞에 삽입
      const verdictIdx = paragraphs.length - 1;
      if (verdictIdx >= 0) {
        paragraphs.splice(verdictIdx, 0, filled.trim());
      } else {
        paragraphs.push(filled.trim());
      }
      totalChars += filled.trim().length;
    }
  }

  return {
    paragraphs,
    frameId,
    frameName: frame.name,
  };
}

/**
 * 리얼 후기 배치 생성
 */
export function generateRealReviewBatch(
  products: { name: string; categoryPath: string }[],
  sellerSeed: string,
): RealReviewResult[] {
  return products.map((p, i) => generateRealReview(p.name, p.categoryPath, sellerSeed, i));
}

/**
 * 리얼 후기를 이미지 캡션용 짧은 텍스트로 변환
 * (리뷰 이미지 아래에 표시할 1~2문장)
 */
export function reviewToCaption(review: RealReviewResult): string[] {
  // 가장 임팩트 있는 문단 2~3개 선택 (첫 문단 + 마지막 문단 + 중간 하나)
  const paras = review.paragraphs;
  if (paras.length <= 2) return paras;

  const mid = Math.floor(paras.length / 2);
  return [paras[0], paras[mid], paras[paras.length - 1]];
}
