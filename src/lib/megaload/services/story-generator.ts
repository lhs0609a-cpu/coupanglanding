// ============================================================
// 상품 스토리/후기 랜덤 템플릿 생성기
//
// AI 없이 즉시 생성. 카테고리별 템플릿 × 변수 × 톤 조합.
// 같은 상품이라도 셀러마다 다른 스토리.
// 상세설명 HTML에 이미지↔텍스트 교차 구조로 삽입.
// ============================================================

import { createSeededRandom, stringToSeed } from './seeded-random';
import storyData from '../data/story-templates.json';
import fullReviewData from '../data/full-review-templates.json';
import { generateRealReview, reviewToCaption } from './real-review-composer';
import type { RealReviewResult } from './real-review-composer';
import { extractContextOverrides } from './product-name-parser';
import { sanitizeHealthText } from './health-sanitizer';
import {
  normalizeRepeatedTokens,
  isSuspiciousFragment,
  applyFoodVerbReplacements,
  isFoodCategory,
} from './fragment-composer';
export { sanitizeHealthText } from './health-sanitizer';

// 한 페이지 내 단일고정 변수 — 여러 슬롯이 다른 값을 뽑으면 모순 (샐러드용+아이간식+다이어트 동시 노출 방지)
const SINGLE_PICK_VAR_KEYS = new Set([
  '추천대상', '용도', '페르소나', '품종', '시즌', '상황', '대상',
  '사용방법', '복용방법', '섭취방법', '메인효과',
  // 식감/맛 — 한 상품에 여러 식감 동시 주장(고소한+시원한+부담없는) 모순 방지
  '식감', '맛', '향',
  // 원산지 — 상품명이 태국망고인데 fragment가 "국내산" 주장하는 모순 방지
  '원산지',
]);
function _stableHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) + h) + s.charCodeAt(i); h = h | 0; }
  return Math.abs(h);
}
function lockSinglePickVars(vars: Record<string, string[]>, productName: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const k of Object.keys(vars)) {
    const arr = vars[k];
    if (Array.isArray(arr) && arr.length > 1 && SINGLE_PICK_VAR_KEYS.has(k)) {
      out[k] = [arr[_stableHash(productName + '|' + k) % arr.length]];
    } else {
      out[k] = Array.isArray(arr) ? arr : arr;
    }
  }
  return out;
}

// ─── 타입 ────────────────────────────────────────────────────

interface StoryTemplate {
  type: 'review' | 'qa' | 'info' | 'compare' | 'story';
  text: string;
}

interface Tone {
  id: string;
  name: string;
  prefix: string;
  suffix: string;
  style: string;
}

// ─── 데이터 로드 ─────────────────────────────────────────────

const TONES: Tone[] = storyData.tones as Tone[];
const TEMPLATES: Record<string, StoryTemplate[]> = storyData.templates as Record<string, StoryTemplate[]>;
const VARIABLES: Record<string, Record<string, string[]>> = storyData.variables as Record<string, Record<string, string[]>>;

// ─── 카테고리 매핑 ───────────────────────────────────────────

function getCategoryKey(categoryPath: string): string {
  // ">" 와 공백 구분 모두 지원 (쿠팡 cat-index.json 은 공백, 시스템 내부는 ">")
  const top = (categoryPath.split(/[>\s]/)[0] || '').trim();
  const full = categoryPath.toLowerCase();

  if (top.includes('뷰티') || top.includes('화장품')) return '뷰티';
  if (top.includes('식품') || top.includes('건강식품')) return '식품';
  if (top.includes('생활') || full.includes('세제') || full.includes('욕실') || full.includes('수납')) return '생활용품';
  if (top.includes('가전') || top.includes('디지털') || full.includes('컴퓨터') || full.includes('영상')) return '가전/디지털';
  if (top.includes('패션') || top.includes('의류') || top.includes('잡화') || full.includes('신발') || full.includes('가방')) return '패션의류잡화';
  if (top.includes('가구') || top.includes('홈데코') || full.includes('침대') || full.includes('소파') || full.includes('인테리어')) return '가구/홈데코';
  if (top.includes('출산') || top.includes('유아') || full.includes('기저귀') || full.includes('분유')) return '출산/유아동';
  if (top.includes('스포츠') || top.includes('레져') || full.includes('헬스') || full.includes('골프') || full.includes('캠핑')) return '스포츠/레져';
  if (top.includes('반려') || top.includes('애완') || full.includes('사료') || full.includes('고양이') || full.includes('강아지')) return '반려/애완용품';
  if (top.includes('주방') || full.includes('프라이팬') || full.includes('냄비') || full.includes('식기')) return '주방용품';
  if (top.includes('문구') || top.includes('사무') || full.includes('필기') || full.includes('노트')) return '문구/오피스';
  if (top.includes('완구') || top.includes('취미') || full.includes('퍼즐') || full.includes('보드게임')) return '완구/취미';
  if (top.includes('자동차') || full.includes('블랙박스') || full.includes('세차')) return '자동차용품';
  if (top.includes('도서') || top.includes('음반') || top.includes('DVD')) return '문구/오피스';

  // 나머지는 DEFAULT
  for (const key of Object.keys(TEMPLATES)) {
    if (key !== 'DEFAULT' && top.includes(key.split('/')[0])) return key;
  }
  return 'DEFAULT';
}

// ─── 변수 치환 ───────────────────────────────────────────────

// 공통 변수 기본값 (프로필에 없을 때 폴백)
const COMMON_VAR_FALLBACKS: Record<string, string[]> = {
  '용량': ['1000mg', '500mg', '고함량', '2000IU', '600mg', '300mg'],
  '횟수': ['2', '3', '4', '5', '6', '7'],
  '기간': ['매일', '꾸준히', '3개월 이상', '장기복용'],
  '인증': ['식약처인증', '건강기능식품', 'GMP인증', 'HACCP'],
  '성분2': ['엄선원료', '표준화추출물', '고농축'],
  '효과2': ['활력개선', '컨디션유지', '건강관리'],
  '사용감': ['만족스러운', '편안해진', '컨디션이 좋아진'],
};

/**
 * 상품명 변형 풀 생성 — SEO 스터핑 방지용.
 * 풀네임 / 단축형 / 대명사를 가중치 분포로 섞어 자연스러운 본문 생성.
 */
function _buildProductRefs(productName: string): string[] {
  const refs: string[] = [productName];
  const tokens = productName.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const short2 = tokens.slice(0, 2).join(' ');
    if (short2.length >= 4 && short2 !== productName) refs.push(short2);
  }
  if (tokens.length >= 3) {
    const short3 = tokens.slice(0, 3).join(' ');
    if (short3.length >= 6 && !refs.includes(short3)) refs.push(short3);
  }
  refs.push('이 제품');
  refs.push('이 상품');
  return refs;
}

function _pickProductRef(refs: string[], rng: () => number): string {
  if (refs.length === 1) return refs[0];
  const weights = refs.length === 2 ? [0.5, 0.5]
    : refs.length === 3 ? [0.45, 0.3, 0.25]
    : refs.length === 4 ? [0.4, 0.25, 0.2, 0.15]
    : [0.35, 0.25, 0.15, 0.15, 0.10];
  const r = rng();
  let cum = 0;
  for (let i = 0; i < refs.length; i++) {
    cum += weights[i] || 0;
    if (r < cum) return refs[i];
  }
  return refs[0];
}

/** 카테고리 path 의 leaf 노드를 명사로 추출 (real-review-composer 와 동일 로직) */
function _extractCategoryNoun(categoryPath?: string, fallbackPool?: string[]): string {
  if (categoryPath) {
    const leaf = categoryPath.split('>').pop()?.trim();
    if (leaf && leaf.length >= 2) {
      const sanitized = leaf
        .replace(/^(여성|남성|키즈|아동|유아|어른|성인)/, '')
        .replace(/^용\s*/, '')
        .trim();
      if (sanitized.length >= 2) return sanitized;
    }
  }
  if (fallbackPool && fallbackPool.length > 0) return fallbackPool[0];
  return '제품';
}

/** 본문 1개 안에서 시간/단위 변수를 락 — 1주/3주/6주/한 달/3개월 동시 등장 차단 */
const _TIME_LOCK_VAR_KEYS = new Set(['기간', '시간', '주', '개월', '일', '주기', '횟수']);

function fillTemplate(
  template: string,
  vars: Record<string, string[]>,
  productName: string,
  rng: () => number,
  categoryPath?: string,
): string {
  let result = template;

  // {product} → 변형 풀에서 가중치 픽 (SEO 스터핑 방지)
  const productRefs = _buildProductRefs(productName);
  result = result.replace(/\{product\}/g, () => _pickProductRef(productRefs, rng));

  // 본문 1개 안에서 시간/주기 일관성 락
  const localLock: Record<string, string> = {};
  const categoryNoun = categoryPath ? _extractCategoryNoun(categoryPath, vars['카테고리']) : undefined;

  // {변수명} → 풀에서 랜덤 선택
  result = result.replace(/\{([^}]+)\}/g, (match, key) => {
    // {카테고리} 는 실제 상품 카테고리 leaf 우선 (다른 카테고리 무작위 혼합 차단)
    if (key === '카테고리' && categoryNoun) return categoryNoun;

    if (_TIME_LOCK_VAR_KEYS.has(key) && localLock[key]) return localLock[key];

    const pool = vars[key];
    if (pool && pool.length > 0) {
      const picked = pool[Math.floor(rng() * pool.length)];
      if (_TIME_LOCK_VAR_KEYS.has(key)) localLock[key] = picked;
      return picked;
    }
    // 유사 키 폴백 (효과2→효과1, 성분2→성분)
    const baseKey = key.replace(/\d+$/, '');
    const baseFallback = vars[baseKey] || vars[baseKey + '1'];
    if (baseFallback && baseFallback.length > 0) {
      const picked = baseFallback[Math.floor(rng() * baseFallback.length)];
      if (_TIME_LOCK_VAR_KEYS.has(key)) localLock[key] = picked;
      return picked;
    }
    // 공통 변수 폴백 (용량, 횟수, 기간 등)
    const common = COMMON_VAR_FALLBACKS[key];
    if (common && common.length > 0) {
      const picked = common[Math.floor(rng() * common.length)];
      if (_TIME_LOCK_VAR_KEYS.has(key)) localLock[key] = picked;
      return picked;
    }
    return ''; // 매칭 안 되면 제거
  });

  return result;
}

// ─── 톤 적용 ─────────────────────────────────────────────────

function applyTone(text: string, tone: Tone): string {
  let result = text;

  // prefix 추가
  if (tone.prefix) result = tone.prefix + ' ' + result;

  // suffix 추가 (마지막 문장에)
  if (tone.suffix) {
    const lastDot = result.lastIndexOf('.');
    if (lastDot >= 0) {
      result = result.slice(0, lastDot + 1) + ' ' + tone.suffix;
    } else {
      result += ' ' + tone.suffix;
    }
  }

  return result;
}

// ─── 공개 API ────────────────────────────────────────────────

export interface StoryResult {
  paragraphs: string[];     // 3~5개 스토리 문단 (이미지 사이에 삽입)
  reviewTexts: string[];    // 2~3개 짧은 후기 (리뷰 이미지 캡션)
  tone: string;             // 사용된 톤
  realReview?: RealReviewResult;  // 리얼 후기 (V3)
}

/**
 * 상품 스토리/후기 생성
 *
 * @param productName 상품명 (짧은 형태)
 * @param categoryPath 쿠팡 카테고리 경로
 * @param sellerSeed 셀러 고유 시드
 * @param productIndex 상품 인덱스
 */
// ─── 완성형 후기 템플릿 (소분류별) ───────────────────────────

const FULL_REVIEWS: Record<string, string[]> = fullReviewData as unknown as Record<string, string[]>;

/**
 * 카테고리 경로에서 가장 구체적인 후기 템플릿 풀을 찾는다.
 * 소분류 → 중분류 → 대분류 → DEFAULT 순서로 폴백.
 */
function findBestReviewPool(categoryPath: string): string[] {
  // prefix 정확 일치만 유효. 깊은 매칭 → 얕은 매칭 → DEFAULT 순서로 폴백.
  //   이전 구현 문제:
  //     L175 "key.includes(parts.slice(0,3))" 가 "뷰티>스킨>크림"을 prefix로 가진
  //     "뷰티>스킨>크림>넥크림"을 페이스 스크럽 같은 다른 하위 카테고리에 잘못 적용.
  //     L182 "첫 번째 top prefix"도 "식품>건강식품>비타민"이 신선식품 카테고리에 섞임.
  if (FULL_REVIEWS[categoryPath]?.length > 0) return FULL_REVIEWS[categoryPath];

  const parts = categoryPath.split('>').map(s => s.trim());
  for (let len = parts.length; len >= 1; len--) {
    const key = parts.slice(0, len).join('>');
    if (FULL_REVIEWS[key]?.length > 0) return FULL_REVIEWS[key];
  }

  return FULL_REVIEWS['DEFAULT'] || [];
}

export function generateStory(
  productName: string,
  categoryPath: string,
  sellerSeed: string,
  productIndex: number,
): StoryResult {
  const seed = stringToSeed(`${sellerSeed}::story::${productIndex}::${productName}`);
  const rng = createSeededRandom(seed);
  const tone = TONES[Math.floor(rng() * TONES.length)];

  // V3 리얼 후기를 메인 콘텐츠로 사용 (마케팅 카피 대신 진짜 후기)
  const realReview = generateRealReview(productName, categoryPath, sellerSeed, productIndex);
  const paragraphs = realReview.paragraphs;
  const reviewTexts = reviewToCaption(realReview);

  return { paragraphs, reviewTexts, tone: tone.name, realReview };
}

/**
 * 배치 스토리 생성
 */
export function generateStoryBatch(
  products: { name: string; categoryPath: string }[],
  sellerSeed: string,
): StoryResult[] {
  return products.map((p, i) => generateStory(p.name, p.categoryPath, sellerSeed, i));
}

// ─── 설득 문단 → 1인칭 후기 톤 리라이트 ─────────────────────

/** 3인칭 마케팅 카피 → 1인칭 후기 톤 변환 */
function rewritePersuasionAsReview(
  persuasionParagraphs: string[],
  rng: () => number,
): string[] {
  const VOICE_BRIDGES = [
    '참고로 더 알아봤는데,',
    '아 그리고 추가로,',
    '한 가지 더 말하면,',
    '찾아보니까,',
    '더 찾아본 결과,',
  ];

  // 마케팅 → 후기 톤 치환 패턴
  const REWRITES: [RegExp, string][] = [
    [/지금 확인하세요[.!]?/g, ''],
    [/지금 바로 경험해보세요[.!]?/g, ''],
    [/경험해보세요[.!]?/g, '써보면 알아요.'],
    [/만나보세요[.!]?/g, '한번 써보세요.'],
    [/시작하세요[.!]?/g, '저도 그래서 시작했어요.'],
    [/확인해보세요[.!]?/g, '한번 확인해보시면 알 거예요.'],
    [/추천드립니다[.!]?/g, '추천해요 진심으로.'],
    [/선택하세요[.!]?/g, '저는 이걸로 정착했어요.'],
    [/비밀은 여기에 있습니다[.!]?/g, '비밀이 있더라고요.'],
    [/답을 찾았습니다[.!]?/g, '답을 찾은 것 같아요.'],
    [/신경 쓰이시나요\??/g, '신경 쓰였거든요.'],
    [/놓치지 마세요[.!]?/g, '놓치면 아까워요.'],
  ];

  return persuasionParagraphs.map((p, i) => {
    let rewritten = p;

    for (const [pattern, replacement] of REWRITES) {
      rewritten = rewritten.replace(pattern, replacement);
    }

    // 첫 설득 문단에 보이스 브릿지 prepend
    if (i === 0) {
      const bridge = VOICE_BRIDGES[Math.floor(rng() * VOICE_BRIDGES.length)];
      rewritten = bridge + ' ' + rewritten;
    }

    return rewritten.trim();
  }).filter(p => p.length > 5);
}

// ─── V2: 설득형 콘텐츠 생성 ─────────────────────────────────

import { generatePersuasionContent, contentBlocksToParagraphs } from './persuasion-engine';
import type { ContentBlock, PersuasionResult, ProductContext } from './persuasion-engine';
import { resolveSeoCategoryPool, getUniversalModifiers } from './seo-keyword-resolver';

export interface StoryResultV2 extends StoryResult {
  contentBlocks: ContentBlock[];   // 설득형 블록 배열
  framework: string;               // 사용된 프레임워크
  frameworkName: string;            // 프레임워크 표시 이름
  totalCharCount: number;           // SEO 길이 검증
}

/**
 * V2 → V3 리얼 후기 스토리 생성
 *
 * 마케팅 카피(설득형 블록) 대신 리얼 후기 문단을 메인 콘텐츠로 사용.
 * contentBlocks를 비워서 상세페이지가 블로그 스타일(이미지-텍스트 교차)로 렌더링됨.
 * 진짜 사람이 쓴 것 같은 구매 후기가 상세페이지 본문이 됨.
 */
export function generateStoryV2(
  productName: string,
  categoryPath: string,
  sellerSeed: string,
  productIndex: number,
  productContext?: ProductContext,
  categoryCode?: string,
): StoryResultV2 {
  // V3 리얼 후기 생성 (조합형 프레임 시스템) — 메인 콘텐츠
  const realReview = generateRealReview(productName, categoryPath, sellerSeed, productIndex, categoryCode, productContext);

  // 리얼 후기 문단을 메인 paragraphs로 사용
  const reviewParagraphs = realReview.paragraphs;

  // 리뷰 텍스트: 리얼 후기에서 임팩트 문단 추출 (이미지 캡션용)
  const reviewTexts = reviewToCaption(realReview);

  const seed = stringToSeed(`${sellerSeed}::story::${productIndex}::${productName}`);
  const rng = createSeededRandom(seed);
  const tone = TONES[Math.floor(rng() * TONES.length)];

  // ── 설득 엔진 재활성화: SEO 텍스트 강화 ──
  const seoPool = resolveSeoCategoryPool(categoryPath);
  const seoKeywords = [
    ...(seoPool.features || []).slice(0, 2),
    ...(seoPool.generic || []).slice(0, 1),
  ];
  const persuasion = generatePersuasionContent(
    productName, categoryPath, sellerSeed, productIndex, seoKeywords,
    categoryCode, productContext,
  );
  const persuasionParagraphs = contentBlocksToParagraphs(persuasion.blocks, categoryPath);

  // 리얼후기 문단 + 설득 문단 합산 (설득 문단은 1인칭 후기 톤으로 리라이트)
  const rewrittenPersuasion = rewritePersuasionAsReview(persuasionParagraphs, rng);
  let paragraphs = [...reviewParagraphs, ...rewrittenPersuasion];

  // ── 후처리 안전망: 건강식품 성분 불일치 문장 제거 (공유 함수 사용) ──
  paragraphs = paragraphs
    .map(p => sanitizeHealthText(p, categoryPath, productName))
    .filter(p => p.length > 5);

  // ── 비식품 카테고리 후처리: 식품/건강식품 전용 용어 제거 ──
  //   자동차/가전/가구/문구 등에서 "복용/섭취/공복/1일 섭취량" 같은 문장 제거
  {
    const isFoodOrHealth =
      categoryPath.includes('식품') ||
      categoryPath.includes('건강식품') ||
      categoryPath.includes('뷰티') ||
      categoryPath.includes('화장품');
    if (!isFoodOrHealth) {
      const FOOD_TERM_RE = /복용|섭취|공복|식후\s*\d|1일\s*권장량|1일\s*섭취량|건강기능식품|영양제|캡슐|정제|1정|1포/;
      paragraphs = paragraphs.map(p => {
        const sentences = p.split(/(?<=[.!?。요])\s+/);
        const filtered = sentences.filter(s => !FOOD_TERM_RE.test(s));
        return filtered.join(' ').trim();
      }).filter(p => p.length > 5);
    }
  }

  // ── 문단 중복 제거 (정규화 키 기준) ──
  //   realReview + persuasion 합산 후 시드 충돌로 유사 문단이 생길 수 있어
  //   중복 문장을 버린다. 꼬리에 부착된 SEO 키워드(고함량/천연/건강기능식품 등)나
  //   문장부호만 다른 문단도 중복으로 감지되도록 정규화한다.
  //
  //   또한 문단 내부에 동일 문장이 여러 번 반복되는 경우에도 문장 단위로 dedup 한다.
  {
    const SEO_TAIL_RE = /\s*(고함량|천연|건강기능식품|정품|프리미엄|GMP인증|식약처인증|무첨가|국산원료|저온추출)[.!?。]*\s*$/;
    const normalizeKey = (s: string): string =>
      s.trim()
        .replace(/\s+/g, ' ')
        .replace(SEO_TAIL_RE, '')
        .replace(/[.!?。,\s]+$/g, '')
        .toLowerCase();

    const seenKeys = new Set<string>();
    const deduped: string[] = [];
    for (const p of paragraphs) {
      const normalized = p.trim().replace(/\s+/g, ' ');
      if (normalized.length < 10) continue;

      // 문단 내 문장 단위 dedup (동일 문장이 반복되는 경우 방지)
      const sentences = normalized.split(/(?<=[.!?。요])\s+/);
      const innerSeen = new Set<string>();
      const uniqueSentences: string[] = [];
      for (const sent of sentences) {
        const sk = normalizeKey(sent);
        if (!sk || innerSeen.has(sk)) continue;
        innerSeen.add(sk);
        uniqueSentences.push(sent);
      }
      const innerDeduped = uniqueSentences.join(' ').trim();
      if (innerDeduped.length < 10) continue;

      const key = normalizeKey(innerDeduped);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      deduped.push(innerDeduped);
    }
    paragraphs = deduped;
  }

  // ── 통합 후처리: 토큰 중복 + 미치환 변수 reject + 식품 동사 차환 ──
  // (composer 외 경로(realReview/persuasionEngine)에서 흘러든 fragment도 정리)
  {
    const isFood = isFoodCategory(categoryPath);
    const cleanSentence = (s: string): string => {
      let out = isFood ? applyFoodVerbReplacements(s) : s;
      out = normalizeRepeatedTokens(out);
      return out;
    };

    const sanitizeParas = (paras: string[]): string[] => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const p of paras) {
        const sentences = p.split(/(?<=[\.!?。요])\s+/).map(s => s.trim()).filter(Boolean);
        const kept: string[] = [];
        for (const s of sentences) {
          const cleaned = cleanSentence(s);
          if (!cleaned) continue;
          if (isSuspiciousFragment(cleaned)) continue; // 향 수치 / 검색 비용 / placeholder
          const key = cleaned.replace(/[\s\.,!?。]+/g, '');
          if (seen.has(key)) continue; // cross-paragraph 중복 차단
          seen.add(key);
          kept.push(cleaned);
        }
        const joined = kept.join(' ').trim();
        if (joined.length >= 5) out.push(joined);
      }
      return out;
    };

    paragraphs = sanitizeParas(paragraphs);
  }

  // reviewTexts 도 동일 후처리
  const cleanedReviewTexts = (() => {
    const isFood = isFoodCategory(categoryPath);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of reviewTexts) {
      let s = isFood ? applyFoodVerbReplacements(t) : t;
      s = normalizeRepeatedTokens(s);
      if (!s || isSuspiciousFragment(s)) continue;
      const key = s.replace(/[\s\.,!?。]+/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out;
  })();

  // 총 글자수 계산 (SEO 검증용)
  const totalCharCount = paragraphs.join('').length;

  return {
    paragraphs,
    reviewTexts: cleanedReviewTexts,
    tone: tone.name,
    realReview,
    contentBlocks: [],    // 비움 → 블로그 스타일 레이아웃 유지
    framework: realReview.frameId,
    frameworkName: realReview.frameName,
    totalCharCount,
  };
}

// ─── 상세설명 HTML 조합 ──────────────────────────────────────

/**
 * 스토리 텍스트 + 이미지를 교차 배치한 상세설명 HTML 생성
 *
 * 구조: 스토리1 → 이미지1 → 스토리2 → 이미지2 → ... → 상품정보고시 이미지
 */
export function buildStoryDetailHtml(params: {
  paragraphs: string[];
  detailImageUrls: string[];
  infoImageUrls?: string[];
  reviewTexts?: string[];
  reviewImageUrls?: string[];
  productName: string;
  brand?: string;
}): string {
  const { paragraphs, detailImageUrls, infoImageUrls, reviewTexts, reviewImageUrls, productName, brand } = params;

  const sections: string[] = [];

  // 헤더 — 텍스트만, 장식 제로
  sections.push(`
    <div style="text-align:center;padding:30px 20px 20px;">
      <h2 style="font-size:24px;font-weight:700;color:#222;margin:0 0 8px 0;word-break:keep-all;">${escapeHtml(productName)}</h2>
      ${brand ? `<p style="font-size:14px;color:#888;margin:0;">${escapeHtml(brand)}</p>` : ''}
    </div>
  `);

  // 스토리↔이미지 교차
  const maxBlocks = Math.max(paragraphs.length, detailImageUrls.length);
  for (let i = 0; i < maxBlocks; i++) {
    // 텍스트 블록 — 리얼 후기 스타일
    if (i < paragraphs.length) {
      const p = paragraphs[i];
      // Q&A 형식 처리 — 장식 제거, 텍스트만
      if (p.includes('Q.') && p.includes('A.')) {
        const [q, a] = p.split(/\nA\.\s*/);
        sections.push(`
          <div style="padding:20px 20px;margin:16px 0;">
            <p style="font-size:21px;font-weight:bold;color:#222;margin:0 0 12px 0;word-break:keep-all;">${escapeHtml(q.replace(/^Q\.\s*/, 'Q. '))}</p>
            <p style="font-size:21px;color:#222;line-height:2.2;margin:0;word-break:keep-all;">A. ${escapeHtml(a || '')}</p>
          </div>
        `);
      } else {
        sections.push(`
          <div style="padding:20px;margin:16px 0;">
            <p style="font-size:21px;color:#222;line-height:2.2;margin:0;word-break:keep-all;">
              ${escapeHtml(p)}
            </p>
          </div>
        `);
      }
    }

    // 이미지 블록 — 장식 제거
    if (i < detailImageUrls.length) {
      sections.push(`
        <div style="margin:8px 0;">
          <img src="${escapeHtml(detailImageUrls[i])}" style="width:100%;display:block;" alt="${escapeHtml(productName)}" />
        </div>
      `);
    }
  }

  // 리뷰 섹션 — 리얼 후기 스타일: 이미지+텍스트만, 장식 제로
  if (reviewTexts && reviewTexts.length > 0 && reviewImageUrls && reviewImageUrls.length > 0) {
    for (let i = 0; i < Math.min(reviewTexts.length, reviewImageUrls.length); i++) {
      sections.push(`
        <div style="margin:0;">
          <img src="${escapeHtml(reviewImageUrls[i])}" style="width:100%;display:block;" alt="${escapeHtml(productName)} 리뷰 ${i + 1}" />
        </div>
        <div style="padding:20px 20px 32px;line-height:2.2;font-size:21px;color:#222;word-break:keep-all;">
          ${escapeHtml(reviewTexts[i])}
        </div>
      `);
    }
  }

  // 상품정보고시 이미지 (마지막)
  if (infoImageUrls && infoImageUrls.length > 0) {
    sections.push(`<div style="margin:40px 0;"></div>`);
    sections.push(`
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:16px;font-weight:bold;color:#555;">상품정보제공고시</div>
      </div>
    `);
    for (const url of infoImageUrls) {
      sections.push(`<img src="${escapeHtml(url)}" style="width:100%;display:block;margin-bottom:4px;" alt="상품정보" />`);
    }
  }

  return `<div style="max-width:860px;margin:0 auto;font-family:'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',sans-serif;color:#222;background:#fff;">${sections.join('')}</div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── FAQ 자동 생성 ──────────────────────────────────────────

export interface FaqItem {
  question: string;
  answer: string;
}

/** 카테고리별 FAQ 템플릿 */
const FAQ_TEMPLATES: Record<string, { q: string; a: string }[]> = {
  '뷰티': [
    { q: '{product} 민감한 피부에도 사용할 수 있나요?', a: '네, {성분} 성분으로 {추천대상}도 안심하고 사용하실 수 있습니다. {인증} 완료된 제품입니다.' },
    { q: '{product} 효과는 얼마나 지속되나요?', a: '{사용법}하시면 {효과1} 효과가 {지속시간} 지속됩니다. 꾸준히 {기간} 사용하시면 {효과2} 효과도 기대할 수 있어요.' },
    { q: '{product} 사용 순서가 어떻게 되나요?', a: '세안 후 토너 → 세럼 → {product} 순서로 {사용법}하시면 {효과1} 효과를 극대화할 수 있습니다.' },
    { q: '{product} 남녀 모두 사용 가능한가요?', a: '네! 성별 무관하게 {효과1} 효과를 볼 수 있습니다. {추천대상} 분들께 특히 추천드려요.' },
    { q: '{product} 개봉 후 유통기한은 어떻게 되나요?', a: '개봉 후 12개월 이내 사용을 권장합니다. 직사광선을 피해 서늘한 곳에 보관해주세요.' },
    { q: '{product} 보관 방법이 따로 있나요?', a: '서늘하고 건조한 곳에 보관하시고, 직사광선과 고온을 피해주세요. 냉장 보관은 필요하지 않습니다.' },
    { q: '{product} 다른 화장품과 함께 사용해도 되나요?', a: '네, 대부분의 기초 화장품과 함께 사용 가능합니다. {성분} 성분이 다른 제품과 상호작용 없이 {효과1} 효과를 발휘합니다.' },
    { q: '{product} 피부 타입에 상관없이 사용 가능한가요?', a: '건성, 지성, 복합성 등 모든 피부 타입에 사용 가능합니다. {추천대상} 분들께 특히 좋은 결과를 보여줍니다.' },
    { q: '{product} 선물용으로 괜찮을까요?', a: '네! 깔끔한 패키지에 담겨 있어 선물용으로도 인기가 많습니다. {추천대상}에게 센스 있는 선물이 됩니다.' },
  ],
  '식품': [
    { q: '{product} 하루에 얼마나 섭취하나요?', a: '{사용법}하시면 됩니다. {성분} {용량} 함유로 하루 권장량을 충족합니다.' },
    { q: '{product} 부작용은 없나요?', a: '{인증} 인증을 받은 안전한 제품입니다. {추천대상}도 안심하고 드실 수 있어요.' },
    { q: '{product} 공복에 먹어도 되나요?', a: '네, 대부분 공복 섭취 가능합니다. 위가 약하신 분은 식후 섭취를 권장드려요.' },
    { q: '{product} 효과는 언제부터 느낄 수 있나요?', a: '개인차가 있지만 {기간} 꾸준히 섭취하시면 {효과1} 변화를 체감하실 수 있습니다.' },
    { q: '{product} 다른 영양제와 함께 먹어도 되나요?', a: '네, 대부분의 영양제와 함께 섭취 가능합니다. 단, 전문가 상담을 권장드립니다.' },
    { q: '{product} 보관 방법은 어떻게 되나요?', a: '직사광선을 피해 서늘하고 건조한 곳에 보관해주세요. 개봉 후에는 밀봉하여 보관하시면 됩니다.' },
    { q: '{product} 유통기한이 지나면 어떻게 하나요?', a: '유통기한이 지난 제품은 섭취를 권장하지 않습니다. 제품 포장에 표기된 소비기한을 확인해주세요.' },
    { q: '{product} 체질에 따라 안 맞을 수도 있나요?', a: '특이 체질이시거나 알레르기가 있으신 분은 성분표를 확인 후 섭취해주세요. 섭취 전 전문가 상담을 권장드립니다.' },
    { q: '{product} 선물로 적합한가요?', a: '네! 건강을 생각하는 {추천대상}에게 실용적인 선물로 인기가 많습니다.' },
  ],
  '생활용품': [
    { q: '{product} 아이가 있는 가정에서도 안전한가요?', a: '네, {인증} 인증 제품으로 {추천대상}에서도 안전하게 사용하실 수 있습니다.' },
    { q: '{product} 사용량은 어떻게 되나요?', a: '{사용법}하시면 됩니다. 대용량이라 경제적으로 오래 쓰실 수 있어요.' },
    { q: '{product} 다른 세제와 섞어 써도 되나요?', a: '단독 사용을 권장드리며, {성분} 성분으로 단독으로도 충분한 {효과1}을 발휘합니다.' },
    { q: '{product} 환경에 안전한 제품인가요?', a: '네, {성분} 기반으로 생분해성이 높아 환경 부담이 적은 제품입니다.' },
    { q: '{product} 보관 시 주의사항이 있나요?', a: '어린이 손이 닿지 않는 서늘한 곳에 보관해주세요. 직사광선을 피하면 오래 보관 가능합니다.' },
    { q: '{product} 반려동물이 있는 집에서도 쓸 수 있나요?', a: '네, {성분} 성분 기반으로 반려동물이 있는 가정에서도 안전하게 사용하실 수 있습니다.' },
    { q: '{product} 유통기한은 어떻게 되나요?', a: '제조일로부터 2~3년이며, 제품 포장에 표기된 유통기한을 확인해주세요.' },
    { q: '{product} 선물용으로 괜찮을까요?', a: '실용적인 선물로 인기가 많습니다. {추천대상}에게 특히 추천드려요.' },
  ],
  '가전/디지털': [
    { q: '{product} A/S는 어떻게 되나요?', a: '구매일로부터 1년간 무상 A/S를 제공합니다. 고객센터로 문의해주세요.' },
    { q: '{product} 전기세 많이 나오나요?', a: '{인증} 제품으로 에너지 효율이 우수합니다. 월 전기세 부담이 적어요.' },
    { q: '{product} 소음은 어떤가요?', a: '{효과1} 기술로 소음을 최소화했습니다. 취침 중에도 편안하게 사용할 수 있어요.' },
    { q: '{product} 설치가 어렵지 않나요?', a: '간편한 셀프 설치가 가능합니다. 상세 설치 가이드도 함께 제공됩니다.' },
    { q: '{product} 다른 제품과 호환이 되나요?', a: '범용 호환 설계로 대부분의 기기와 함께 사용하실 수 있습니다. 상세 스펙을 확인해주세요.' },
    { q: '{product} 보증 기간은 어떻게 되나요?', a: '기본 1년 무상 보증이며, 부품별 보증 기간은 제품 설명서를 참고해주세요.' },
    { q: '{product} 선물용으로 적합한가요?', a: '네! 실용적이고 고급스러운 패키지로 {추천대상}에게 센스 있는 선물이 됩니다.' },
    { q: '{product} 소비전력은 어떻게 되나요?', a: '{인증} 등급으로 소비전력이 낮아 경제적입니다. 월 전기요금 부담이 적습니다.' },
  ],
  '패션의류잡화': [
    { q: '{product} 세탁 방법은 어떻게 되나요?', a: '세탁기 사용 가능하며, 찬물 세탁을 권장합니다. 형태 유지가 잘 되는 소재입니다.' },
    { q: '{product} 사이즈가 정사이즈인가요?', a: '정사이즈 제작이며, 상세 사이즈표를 참고해주세요. 체형에 따라 한 사이즈 업도 추천드려요.' },
    { q: '{product} 색상이 사진과 동일한가요?', a: '실물과 최대한 동일하게 촬영했습니다. 모니터 환경에 따라 약간의 차이가 있을 수 있어요.' },
    { q: '{product} 보관 방법은 어떻게 되나요?', a: '옷걸이에 걸어 보관하시거나 접어서 서늘한 곳에 보관해주세요. 습기를 피하면 오래 입으실 수 있습니다.' },
    { q: '{product} 다른 아이템과 코디하기 좋은가요?', a: '네! 다양한 아이템과 매치하기 좋은 디자인으로, 데일리룩부터 오피스룩까지 활용도가 높습니다.' },
    { q: '{product} 선물용으로 괜찮을까요?', a: '깔끔한 패키지에 담겨 있어 {추천대상}에게 선물하기 좋습니다. 감각적인 디자인이 인기예요.' },
    { q: '{product} 여러 번 세탁해도 변형이 없나요?', a: '네, {성분} 소재로 세탁 후에도 형태와 색상 유지력이 뛰어납니다.' },
  ],
  '가구/홈데코': [
    { q: '{product} 조립이 어렵지 않나요?', a: '상세 조립 설명서와 필요 공구가 모두 포함되어 있어 초보자도 쉽게 조립할 수 있습니다.' },
    { q: '{product} 배송 시 엘리베이터 없어도 되나요?', a: '택배 배송 기준이며, 설치 배송 시 추가 비용이 발생할 수 있습니다.' },
    { q: '{product} 내구성은 어떤가요?', a: '{성분} 소재로 {효과1}이 뛰어납니다. 일반 사용 시 수년간 튼튼하게 사용하실 수 있어요.' },
    { q: '{product} 색상이 사진과 동일한가요?', a: '실물과 최대한 동일하게 촬영했습니다. 모니터 환경에 따라 약간의 차이가 있을 수 있어요.' },
    { q: '{product} 관리 방법은 어떻게 되나요?', a: '마른 천으로 가볍게 닦아주시면 됩니다. 물걸레 사용 시 즉시 건조시켜주세요.' },
    { q: '{product} 선물용으로 괜찮을까요?', a: '집들이 선물이나 이사 선물로 인기가 많습니다. {추천대상}에게 실용적인 선물이 됩니다.' },
    { q: '{product} 다른 가구와 잘 어울리나요?', a: '모던한 디자인으로 다양한 인테리어 스타일과 자연스럽게 매칭됩니다.' },
  ],
  '출산/유아동': [
    { q: '{product} 신생아도 사용할 수 있나요?', a: '{인증} 인증 제품으로 {추천대상}부터 안전하게 사용할 수 있습니다.' },
    { q: '{product} 유해 성분은 없나요?', a: '무형광, 무파라벤, 무프탈레이트 제품이며, {인증} 테스트를 완료했습니다.' },
    { q: '{product} 사용 기간은 어떻게 되나요?', a: '{추천대상} 기준으로 적합하며, 성장 단계에 맞춰 다음 단계 제품으로 전환하시면 됩니다.' },
    { q: '{product} 보관 방법이 따로 있나요?', a: '직사광선과 고온을 피해 서늘한 곳에 보관해주세요. 개봉 후에는 밀봉 보관을 권장합니다.' },
    { q: '{product} 선물용으로 적합한가요?', a: '네! 출산 축하 선물이나 돌잔치 선물로 인기가 많습니다. {추천대상} 아이에게 실용적인 선물이에요.' },
    { q: '{product} 세탁 방법은 어떻게 되나요?', a: '순한 세제로 손세탁을 권장합니다. 세탁기 사용 시 세탁망에 넣어 약하게 세탁해주세요.' },
    { q: '{product} 피부 자극 테스트를 했나요?', a: '네, {인증} 피부 자극 테스트를 완료한 제품입니다. 민감한 아이 피부에도 안심하고 사용하세요.' },
  ],
  '스포츠/레져': [
    { q: '{product} 초보자도 사용할 수 있나요?', a: '네, {추천대상}를 위한 제품으로 초보자도 쉽게 사용할 수 있습니다.' },
    { q: '{product} 야외에서 사용 가능한가요?', a: '네, 실내외 모두 사용 가능합니다. {효과1}이 우수하여 다양한 환경에서 활용할 수 있어요.' },
    { q: '{product} 보관 방법은 어떻게 되나요?', a: '직사광선을 피해 건조한 곳에 보관해주세요. 사용 후 깨끗이 닦아 보관하시면 오래 쓸 수 있습니다.' },
    { q: '{product} 선물용으로 적합한가요?', a: '운동을 좋아하는 {추천대상}에게 실용적인 선물이 됩니다. 깔끔한 포장도 가능해요.' },
    { q: '{product} 다른 장비와 함께 사용해도 되나요?', a: '네, 다양한 운동 장비와 함께 활용 가능합니다. {효과1} 성능이 더욱 향상됩니다.' },
    { q: '{product} 사이즈 선택은 어떻게 하나요?', a: '상세 사이즈 가이드를 참고해주세요. 체형과 용도에 맞는 사이즈 선택이 중요합니다.' },
    { q: '{product} 세탁 방법은 어떻게 되나요?', a: '찬물 손세탁을 권장합니다. {성분} 소재 특성상 건조기 사용은 피해주세요.' },
  ],
  '반려/애완용품': [
    { q: '{product} 우리 강아지/고양이에게 맞을까요?', a: '{추천대상}에게 적합한 제품으로, {성분} 원료를 사용하여 안전합니다.' },
    { q: '{product} 알레르기가 있는 아이도 먹을 수 있나요?', a: '주요 알레르기 유발 원료를 배제했습니다. 성분표를 확인 후 급여해주세요.' },
    { q: '{product} 급여량은 어떻게 되나요?', a: '체중별 급여량 가이드가 포장에 표기되어 있습니다. {사용법}하시면 됩니다.' },
    { q: '{product} 보관 방법은 어떻게 되나요?', a: '개봉 후 밀봉하여 서늘하고 건조한 곳에 보관해주세요. 직사광선을 피하면 신선도가 유지됩니다.' },
    { q: '{product} 다른 제품과 함께 급여해도 되나요?', a: '네, 기존 식단과 병행 급여 가능합니다. 처음에는 소량씩 섞어 급여하시는 것을 권장합니다.' },
    { q: '{product} 유통기한은 어떻게 되나요?', a: '제조일로부터 {기간}이며, 개봉 후에는 빠른 시일 내 급여를 권장합니다.' },
    { q: '{product} 선물로 괜찮을까요?', a: '반려동물을 키우는 분들에게 실용적인 선물로 인기가 많습니다. {추천대상}에게 추천드려요.' },
  ],
  '주방용품': [
    { q: '{product} 식기세척기 사용이 가능한가요?', a: '네, 식기세척기 사용이 가능합니다. 다만 코팅 제품은 손세척을 권장드려요.' },
    { q: '{product} 인덕션에서 사용 가능한가요?', a: '모든 열원(가스, 인덕션, 하이라이트, 전기레인지)에 사용 가능합니다.' },
    { q: '{product} 코팅이 벗겨지지 않나요?', a: '{성분} 코팅으로 {효과1}이 뛰어납니다. 나무/실리콘 도구 사용 시 더 오래 유지됩니다.' },
    { q: '{product} 보관 방법은 어떻게 되나요?', a: '사용 후 깨끗이 세척하여 건조시킨 후 보관해주세요. 코팅 제품은 겹쳐 보관 시 천을 끼워주세요.' },
    { q: '{product} 선물용으로 적합한가요?', a: '집들이 선물이나 결혼 선물로 인기가 많습니다. {추천대상}에게 실용적인 선물이에요.' },
    { q: '{product} 처음 사용 전 세척이 필요한가요?', a: '네, 첫 사용 전 중성 세제로 가볍게 세척 후 사용하시면 됩니다.' },
    { q: '{product} 유해 물질은 없나요?', a: '{인증} 인증 제품으로 유해 물질 걱정 없이 안전하게 사용하실 수 있습니다.' },
  ],
  'DEFAULT': [
    { q: '{product} 품질은 어떤가요?', a: '{인증} 인증을 받은 고품질 제품으로 {효과1}이 우수합니다.' },
    { q: '{product} 교환/반품이 가능한가요?', a: '수령 후 7일 이내 교환/반품이 가능합니다. 상세 정책은 판매자 정보를 확인해주세요.' },
    { q: '{product} 배송은 얼마나 걸리나요?', a: '주문 후 1-3일 이내 출고됩니다. 로켓배송 상품은 당일/익일 수령 가능합니다.' },
    { q: '{product} 선물용으로 적합한가요?', a: '네! 깔끔한 포장으로 {추천대상}에게 선물하기 좋습니다.' },
    { q: '{product} 보관 방법은 어떻게 되나요?', a: '직사광선과 고온다습한 곳을 피해 보관해주세요. 제품 포장의 보관 방법을 참고하시면 됩니다.' },
    { q: '{product} 유통기한은 어떻게 되나요?', a: '제품 포장에 표기된 유통기한을 확인해주세요. 적절한 보관 시 오래 사용 가능합니다.' },
    { q: '{product} 다른 제품과 함께 사용해도 되나요?', a: '네, 대부분의 경우 다른 제품과 병용 가능합니다. 상세 사용법은 제품 설명을 참고해주세요.' },
    { q: '{product} A/S 정책은 어떻게 되나요?', a: '제품에 하자가 있는 경우 교환/환불이 가능합니다. 고객센터로 문의해주세요.' },
  ],
};

/**
 * 카테고리별 FAQ 항목 생성
 *
 * @param productName 상품명
 * @param categoryPath 카테고리 경로
 * @param sellerSeed 셀러 시드
 * @param productIndex 상품 인덱스
 * @param count FAQ 개수 (기본 3~5개)
 */
export function generateFaqItems(
  productName: string,
  categoryPath: string,
  sellerSeed: string,
  productIndex: number,
  count: number = 6,
): FaqItem[] {
  const catKey = getCategoryKey(categoryPath);
  let vars = { ...(VARIABLES[catKey] || VARIABLES['DEFAULT']) };
  // 배열 키도 깊은 복사 (원본 VARIABLES 오염 방지)
  for (const k of Object.keys(vars)) {
    if (Array.isArray(vars[k])) vars[k] = [...vars[k]];
  }

  const seed = stringToSeed(`${sellerSeed}::faq::${productIndex}::${productName}`);
  const rng = createSeededRandom(seed);

  // ── 건강식품 성분별 변수 오버라이드 ──
  // 상품명 + 카테고리 경로 모두 검사하여 상품과 무관한 성분 언급 방지
  const pn = (productName + ' ' + categoryPath).toLowerCase();
  if (catKey === '식품') {
    if (/코엔자임|coq10|코큐텐|유비퀴놀/.test(pn)) {
      vars['성분'] = ['코엔자임Q10','유비퀴놀'];
      vars['효과1'] = ['항산화','심장건강','에너지생성','세포보호','피로회복'];
    } else if (/비오틴|바이오틴/.test(pn)) {
      vars['성분'] = ['비오틴','판토텐산'];
      vars['효과1'] = ['모발건강','피부건강','손톱건강','두피건강','모발영양'];
    } else if (/루테인|지아잔틴/.test(pn)) {
      vars['성분'] = ['루테인','지아잔틴'];
      vars['효과1'] = ['눈건강','시력보호','눈피로','안구건조','황반건강'];
    } else if (/콘드로이친|글루코사민|관절|상어연골|보스웰리아|msm/.test(pn)) {
      vars['성분'] = ['콘드로이친','글루코사민','MSM','보스웰리아'];
      vars['효과1'] = ['관절건강','연골보호','관절유연성','뼈건강','관절영양'];
    } else if (/밀크씨슬|밀크시슬|실리마린/.test(pn)) {
      vars['성분'] = ['밀크씨슬','실리마린'];
      vars['효과1'] = ['간건강','간보호','피로회복','간기능개선','독소배출'];
    } else if (/유산균|프로바이오|락토|비피더스/.test(pn)) {
      vars['성분'] = ['유산균','프로바이오틱스','프리바이오틱스'];
      vars['효과1'] = ['장건강','소화흡수','장내환경','배변활동','장면역력'];
    } else if (/오메가|크릴|epa|dha/.test(pn)) {
      vars['성분'] = ['오메가3','EPA','DHA','크릴오일'];
      vars['효과1'] = ['혈관건강','혈행개선','중성지방감소','심혈관건강','혈압관리'];
    } else if (/홍삼|인삼|진세노사이드/.test(pn)) {
      vars['성분'] = ['홍삼','진세노사이드','인삼사포닌'];
      vars['효과1'] = ['면역력','피로회복','활력','체력','항산화'];
    } else if (/콜라겐|히알루론/.test(pn)) {
      vars['성분'] = ['콜라겐','히알루론산','엘라스틴'];
      vars['효과1'] = ['피부탄력','피부보습','주름개선','피부건강','피부광채'];
    } else if (/마그네슘/.test(pn)) {
      vars['성분'] = ['마그네슘'];
    } else if (/칼슘/.test(pn)) {
      vars['성분'] = ['칼슘'];
    } else if (/프로폴리스/.test(pn)) {
      vars['성분'] = ['프로폴리스'];
      vars['효과1'] = ['면역력','구강건강','항균','활력'];
    } else if (/쏘팔메토/.test(pn)) {
      vars['성분'] = ['쏘팔메토'];
    } else if (/가르시니아|다이어트|cla|카테킨|키토산/.test(pn)) {
      vars['성분'] = ['가르시니아','HCA','CLA','카테킨'];
    } else if (/프로틴|단백질|wpc|wpi|bcaa|크레아틴|게이너|카제인/.test(pn)) {
      vars['성분'] = ['프로틴','단백질','WPC','BCAA','크레아틴'];
    } else if (/스피루리나/.test(pn)) {
      vars['성분'] = ['스피루리나'];
    } else if (/클로렐라/.test(pn)) {
      vars['성분'] = ['클로렐라'];
    } else if (/흑마늘|마늘/.test(pn)) {
      vars['성분'] = ['흑마늘','마늘'];
    } else if (/mct|중쇄지방/.test(pn)) {
      vars['성분'] = ['MCT오일','중쇄지방산','코코넛오일','C8카프릴산'];
      vars['효과1'] = ['에너지','체지방관리','대사촉진','포만감','흡수율'];
    }
  }

  // ── 단일고정 변수 잠금: 추천대상/품종/용도 등은 상품당 1개만 사용 ──
  // 같은 페이지에서 "샐러드용/아이간식/다이어트" 동시 노출 방지
  vars = lockSinglePickVars(vars, productName);

  // ── cleanName: "브랜드 상품코드" 형태면 카테고리 리프명 사용 ──
  let cleanName = productName
    .replace(/[\[\(【][^\]\)】]*[\]\)】]/g, '')
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
    .split(/\s+/).filter(w => w.length >= 2).slice(0, 3).join(' ');

  // 숫자 6자리 이상이면 상품코드로 간주 → 카테고리 리프명으로 대체
  if (/\d{6,}/.test(cleanName)) {
    const leafName = categoryPath.split('>').pop()?.trim();
    if (leafName && leafName.length >= 2) {
      cleanName = leafName;
    }
  }

  const faqPool = FAQ_TEMPLATES[catKey] || FAQ_TEMPLATES['DEFAULT'];
  const shuffled = [...faqPool].sort(() => rng() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  return selected.map(({ q, a }) => ({
    question: sanitizeHealthText(fillTemplate(q, vars, cleanName, rng, categoryPath), categoryPath, productName),
    answer: sanitizeHealthText(fillTemplate(a, vars, cleanName, rng, categoryPath), categoryPath, productName),
  }));
}

// ─── SEO 키워드 배지 추출 ────────────────────────────────────

/**
 * 상품명 + 카테고리에서 SEO 키워드 배지 3~6개를 추출한다.
 * seo-keyword-pools.json의 카테고리별 풀에서 features/generic/ingredients를 사용.
 * 상세페이지 히어로 섹션 배지 + 본문 SEO 삽입에 사용됨.
 */
export function extractSeoKeywords(
  productName: string,
  categoryPath: string,
  sellerSeed: string,
  productIndex: number,
): string[] {
  const seed = stringToSeed(`${sellerSeed}::seo::${productIndex}::${productName}`);
  const rng = createSeededRandom(seed);

  const seoPool = resolveSeoCategoryPool(categoryPath);
  const universalMods = getUniversalModifiers();

  const keywords: string[] = [];

  // 1. 소분류명 추가
  const catParts = categoryPath.split('>').map(p => p.trim()).filter(p => p.length > 0);
  if (catParts.length > 0) {
    keywords.push(catParts[catParts.length - 1]);
  }

  // 2. features에서 2개
  if (seoPool.features.length > 0) {
    const shuffled = [...seoPool.features].sort(() => rng() - 0.5);
    keywords.push(shuffled[0]);
    if (shuffled.length > 1) keywords.push(shuffled[1]);
  }

  // 3. generic에서 1개
  if (seoPool.generic.length > 0) {
    keywords.push(seoPool.generic[Math.floor(rng() * seoPool.generic.length)]);
  }

  // 4. universalModifiers에서 1개
  if (universalMods.length > 0) {
    keywords.push(universalMods[Math.floor(rng() * universalMods.length)]);
  }

  // 5. ingredients에서 1개 (있으면)
  if (seoPool.ingredients.length > 0) {
    keywords.push(seoPool.ingredients[Math.floor(rng() * seoPool.ingredients.length)]);
  }

  // 중복 제거 후 3~6개 반환
  const unique = [...new Set(keywords)];
  return unique.slice(0, 6);
}

// ─── SEO 마무리 문구 생성 ────────────────────────────────────

/** 카테고리별 마무리 문구 템플릿 */
const CLOSING_TEMPLATES: Record<string, string[]> = {
  '뷰티': [
    '{product}로 매일 달라지는 피부를 경험해보세요. {효과1}과 {효과2}를 한 번에 관리하는 스마트한 선택, 지금 바로 시작하세요.',
    '아름다운 피부의 시작, {product}. {추천대상} 분들이 선택한 데일리 {카테고리} 루틴으로 {효과1} 효과를 직접 느껴보세요.',
    '피부 고민 끝! {product}의 {성분} 성분이 {효과1}부터 {효과2}까지 집중 케어합니다. 꾸준히 사용할수록 더 빛나는 피부를 만나보세요.',
  ],
  '식품': [
    '건강한 하루의 시작, {product}. {성분} 함유로 {효과1}을 과학적으로 관리하세요. {추천대상}에게 특히 추천드립니다.',
    '{product}과 함께 건강한 내일을 준비하세요. {효과1}은 물론 {효과2}까지, 온 가족의 건강을 위한 현명한 선택입니다.',
    '매일 꾸준히, {product}으로 {효과1} 관리를 시작하세요. {인증} 인증 제품으로 안심하고 섭취할 수 있습니다.',
  ],
  '생활용품': [
    '깨끗한 생활의 시작, {product}. 강력한 {효과1}으로 우리 가정을 깨끗하고 위생적으로 관리하세요.',
    '{product} 하나로 {효과1}부터 {효과2}까지! {추천대상}에서도 안전하게 사용할 수 있는 {인증} 인증 제품입니다.',
  ],
  '가전/디지털': [
    '스마트한 라이프의 시작, {product}. {효과1}이 뛰어난 프리미엄 가전으로 생활의 질을 높여보세요.',
    '{product}와 함께하는 편리한 일상. {효과1} 기술로 더 쾌적하고 스마트한 생활을 경험하세요.',
  ],
  '패션의류잡화': [
    '매일 입고 싶은 {product}. {효과1}이 뛰어나 사계절 코디에 활용하기 좋습니다. 지금 트렌디한 스타일을 완성해보세요.',
    '{product}으로 완성하는 데일리 스타일. {효과1}과 {효과2}를 모두 갖춘 합리적인 선택입니다.',
  ],
  '가구/홈데코': [
    '우리 집을 특별하게, {product}. {효과1}이 뛰어나 어떤 공간에도 잘 어울립니다. 나만의 인테리어를 완성해보세요.',
    '{product}으로 만드는 편안한 공간. {효과1}과 실용성을 모두 갖춘 가구로 일상의 만족도를 높여보세요.',
  ],
  '출산/유아동': [
    '우리 아이를 위한 안전한 선택, {product}. {인증} 인증으로 안심하고 사용하세요. {추천대상}에게 딱 맞는 제품입니다.',
    '아이의 건강한 성장을 위한 {product}. {효과1}이 뛰어나고 {성분} 소재로 안전합니다.',
  ],
  '스포츠/레져': [
    '운동이 즐거워지는 {product}. {효과1}이 뛰어나 {추천대상}에게 딱 맞는 스포츠 용품입니다. 지금 시작하세요!',
    '{product}와 함께라면 운동 효과 UP! {효과1}과 {효과2}를 동시에 경험해보세요.',
  ],
  '반려/애완용품': [
    '우리 아이를 위한 프리미엄 선택, {product}. {성분} 원료로 {효과1}을 책임집니다. {추천대상}에게 추천드려요.',
    '{product}으로 반려동물의 건강을 챙겨주세요. {효과1}과 {효과2}를 한 번에 관리할 수 있습니다.',
  ],
  '주방용품': [
    '요리가 즐거워지는 {product}. {효과1}이 뛰어나 매일 사용해도 든든합니다. {추천대상}에게 특히 추천!',
    '{product}으로 주방을 업그레이드하세요. {성분} 소재로 {효과1}과 안전성을 모두 갖추었습니다.',
  ],
  'DEFAULT': [
    '{product}을 지금 만나보세요. {효과1}이 뛰어나 {추천대상}에게 딱 맞는 제품입니다. 후회 없는 선택이 될 거예요.',
    '믿고 선택하는 {product}. {효과1}은 물론 {효과2}까지, 가성비와 품질 모두 만족하실 수 있습니다.',
    '지금 바로 {product}을 경험해보세요. 이미 많은 분들이 선택한 {효과1} 제품, 여러분도 만족하실 거예요.',
  ],
};

/**
 * SEO 마무리 문구 생성
 * 상세페이지 하단에 키워드를 자연스럽게 포함한 구매 유도 문구.
 */
export function generateClosingText(
  productName: string,
  categoryPath: string,
  sellerSeed: string,
  productIndex: number,
): string {
  const catKey = getCategoryKey(categoryPath);
  const vars = lockSinglePickVars(VARIABLES[catKey] || VARIABLES['DEFAULT'], productName);
  const seed = stringToSeed(`${sellerSeed}::closing::${productIndex}::${productName}`);
  const rng = createSeededRandom(seed);

  let cleanName = productName
    .replace(/[\[\(【][^\]\)】]*[\]\)】]/g, '')
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
    .split(/\s+/).filter(w => w.length >= 2).slice(0, 3).join(' ');

  // 숫자 6자리 이상이면 상품코드로 간주 → 카테고리 리프명으로 대체
  if (/\d{6,}/.test(cleanName)) {
    const leafName = categoryPath.split('>').pop()?.trim();
    if (leafName && leafName.length >= 2) {
      cleanName = leafName;
    }
  }

  const pool = CLOSING_TEMPLATES[catKey] || CLOSING_TEMPLATES['DEFAULT'];
  const template = pool[Math.floor(rng() * pool.length)];
  return sanitizeHealthText(fillTemplate(template, vars, cleanName, rng, categoryPath), categoryPath, productName);
}
