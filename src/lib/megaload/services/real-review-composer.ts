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

// ─── 상품 형태(ProductForm) 감지 ──────────────────────────────

type ProductForm =
  | 'fresh_food' | 'processed_food' | 'supplement_capsule'
  | 'supplement_liquid' | 'supplement_powder'
  | 'skincare' | 'haircare' | 'makeup' | 'bodycare'
  | 'baby_diaper' | 'baby_food' | 'baby_skincare'
  | 'electronics' | 'cookware' | 'fashion' | 'automotive' | 'default';

function detectProductForm(productName: string, categoryKey: string): ProductForm {
  const n = productName;

  // 출산/유아동 — 상품명으로 먼저 판별
  if (categoryKey === '출산/유아동') {
    if (/기저귀|팬티형|밴드형/.test(n)) return 'baby_diaper';
    if (/분유|이유식|유아식|퓨레|핑거푸드/.test(n)) return 'baby_food';
    if (/로션|크림|오일|바디워시|샴푸|물티슈/.test(n)) return 'baby_skincare';
    return 'baby_skincare'; // 출산/유아동 기본 = 스킨케어 계열
  }

  // 식품
  if (categoryKey === '식품') {
    if (/즙|쥬스|주스|음료|드링크|시럽|진액|원액|농축액|엑기스|액/.test(n)) return 'supplement_liquid';
    if (/캡슐|정제|알약|타블렛|소프트젤/.test(n)) return 'supplement_capsule';
    if (/분말|파우더|가루|환|스틱/.test(n)) return 'supplement_powder';
    if (/비타민|오메가|유산균|프로바이오|루테인|밀크씨슬|홍삼|글루코사민|영양제|콜라겐/.test(n)) return 'supplement_capsule';
    if (/과일|채소|한라봉|사과|배|딸기|토마토|감귤|블루베리|포도|수박|참외|복숭아|자두|체리|키위|망고|바나나|오렌지|레몬|자몽|귤/.test(n)) return 'fresh_food';
    if (/쌀|잡곡|정육|한우|돼지|닭|소고기|수산물|생선|새우|오징어|갈비|등심|안심|삼겹살/.test(n)) return 'fresh_food';
    if (/라면|통조림|냉동|즉석|과자|쿠키|빵|소스|장류|김치|반찬|밀키트/.test(n)) return 'processed_food';
    return 'processed_food'; // 기본 식품 = 가공식품(안전)
  }

  // 뷰티
  if (categoryKey === '뷰티') {
    if (/샴푸|린스|트리트먼트|헤어/.test(n)) return 'haircare';
    if (/립|틴트|파운데이션|마스카라|아이라이너|블러셔|팩트|쿠션/.test(n)) return 'makeup';
    if (/바디로션|바디워시|바디크림|핸드크림/.test(n)) return 'bodycare';
    return 'skincare';
  }

  // 기타 대분류
  if (categoryKey === '가전/디지털') return 'electronics';
  if (categoryKey === '주방용품') return 'cookware';
  if (categoryKey === '패션의류잡화') return 'fashion';
  if (categoryKey === '자동차용품') return 'automotive';

  return 'default';
}

// ─── form별 금지어 블록리스트 ────────────────────────────────

const FORM_BLOCKLIST: Partial<Record<ProductForm, RegExp>> = {
  fresh_food:         /섭취|\d정|\d포|캡슐|정제|알약|삼키|바르|발라|피부에|도포/,
  processed_food:     /섭취|\d정|\d포|캡슐|정제|알약|삼키|바르|발라|피부에|도포/,
  supplement_liquid:  /캡슐|알약|삼키|넘기기|목에 안|정제|바르|발라|피부에/,
  supplement_powder:  /캡슐|알약|삼키|넘기기|목에 안|정제|바르|발라|피부에/,
  supplement_capsule: /바르|발라|피부에|도포|씻어서|샐러드|조리|데워/,
  skincare:           /먹[어으고는기이]|섭취|\d정|맛있|삼키|캡슐|알약|충전|세차/,
  haircare:           /먹[어으고는기이]|섭취|\d정|맛있|삼키|캡슐|알약|충전|세차/,
  makeup:             /먹[어으고는기이]|섭취|\d정|맛있|삼키|캡슐|알약|충전|세차/,
  bodycare:           /먹[어으고는기이]|섭취|\d정|맛있|삼키|캡슐|알약|충전|세차/,
  baby_diaper:        /먹[어으고는기이여]|먹여|섭취|\d정|\d포|맛있|바르|발라|피부에|크림|로션|캡슐|알약/,
  baby_food:          /바르|발라|피부에|도포|캡슐|알약|정제|크림|로션|충전|세차/,
  baby_skincare:      /먹[어으고는기이여]|먹여|섭취|\d정|맛있|캡슐|알약|충전|세차/,
  electronics:        /먹[어으고는기이]|섭취|\d정|바르|발라|피부에|맛있|캡슐|알약/,
  cookware:           /섭취|\d정|바르|발라|피부에|캡슐|알약|충전/,
  fashion:            /먹[어으고는기이]|섭취|\d정|바르|발라|피부에|맛있|캡슐|알약|충전|세차/,
  automotive:         /먹[어으고는기이]|섭취|\d정|피부에|맛있|캡슐|알약/,
};

// ─── 상품명 기반 제형 필터 ───────────────────────────────────

function filterByProductForm(values: string[], productName: string, categoryKey?: string): string[] {
  const form = detectProductForm(productName, categoryKey || 'default');
  const blocklist = FORM_BLOCKLIST[form];
  if (!blocklist) return values;

  const filtered = values.filter(v => !blocklist.test(v));
  return filtered.length > 0 ? filtered : values;
}

// ─── 서브카테고리 변수 풀 라우팅 ────────────────────────────

function resolveVariablePool(
  categoryPath: string,
  catKey: string,
  productName: string,
): Record<string, string[]> {
  const parentVars = VARIABLES[catKey] || VARIABLES['DEFAULT'];

  // 서브카테고리 키 추론: categoryPath에서 "대분류>중분류" 패턴 검색
  const parts = categoryPath.split('>').map(p => p.trim());

  // 2단계 키 (예: "출산/유아동>기저귀") 먼저 시도
  if (parts.length >= 2) {
    const subKey = `${parts[0]}>${parts[1]}`;
    const subVars = VARIABLES[subKey];
    if (subVars) {
      // 서브 변수가 있으면 부모와 병합 (서브가 override)
      return { ...parentVars, ...subVars };
    }
  }

  // 상품명 기반 추론 (카테고리 경로에 중분류가 없는 경우)
  if (catKey === '출산/유아동') {
    if (/기저귀|팬티형|밴드형/.test(productName)) {
      const sub = VARIABLES['출산/유아동>기저귀'];
      if (sub) return { ...parentVars, ...sub };
    }
    if (/분유/.test(productName)) {
      const sub = VARIABLES['출산/유아동>분유'];
      if (sub) return { ...parentVars, ...sub };
    }
    if (/이유식|유아식|퓨레|핑거푸드|유아과자|유아음료/.test(productName)) {
      const sub = VARIABLES['출산/유아동>유아식품'];
      if (sub) return { ...parentVars, ...sub };
    }
  }

  if (catKey === '식품') {
    if (/비타민|오메가|유산균|프로바이오|루테인|밀크씨슬|홍삼|캡슐|정제|영양제|글루코사민|콜라겐|건강기능|건강식품|비오틴/.test(productName) ||
        categoryPath.includes('건강식품')) {
      const sub = VARIABLES['식품>건강식품'];
      const healthVars = sub ? { ...parentVars, ...sub } : parentVars;

      // 성분별 효과 오버라이드 — 상품과 무관한 효과 언급 방지
      const pn = productName.toLowerCase();
      if (/비오틴|모발|탈모|머리카락|손톱/.test(pn)) {
        healthVars['효과1'] = ['모발건강','피부건강','손톱건강','두피건강','모발영양','피부미용','모발강화','케라틴합성'];
        healthVars['효과2'] = ['탈모예방','모발윤기','피부탄력','손톱강화','두피영양'];
      } else if (/루테인|눈|시력|안구/.test(pn)) {
        healthVars['효과1'] = ['눈건강','시력보호','눈피로','안구건조','황반건강','눈영양','시력관리','눈노화방지'];
        healthVars['효과2'] = ['눈피로회복','시야선명','블루라이트차단','눈건조개선','안구보호'];
      } else if (/글루코사민|관절|무릎|연골|msm/.test(pn)) {
        healthVars['효과1'] = ['관절건강','연골보호','관절유연성','뼈건강','관절영양','연골재생','관절편안함','무릎건강'];
        healthVars['효과2'] = ['관절통완화','보행편안','관절유연','연골강화','움직임개선'];
      } else if (/밀크씨슬|간|헤파|실리마린/.test(pn)) {
        healthVars['효과1'] = ['간건강','간보호','간해독','간기능개선','간영양','피로회복','간세포보호','독소배출'];
        healthVars['효과2'] = ['숙취해소','간수치개선','피로감소','활력증진','해독력강화'];
      } else if (/유산균|프로바이오|프리바이오|장/.test(pn)) {
        healthVars['효과1'] = ['장건강','소화흡수','장내환경','유익균증식','배변활동','장면역력','장내균형','소화개선'];
        healthVars['효과2'] = ['쾌변','더부룩함해소','소화력향상','장내유익균','배변규칙성'];
      } else if (/콜라겐|피부|탄력|히알루론/.test(pn)) {
        healthVars['효과1'] = ['피부탄력','피부보습','주름개선','피부건강','피부광채','피부영양','피부재생','피부노화방지'];
        healthVars['효과2'] = ['피부윤기','보습력향상','탄력개선','주름감소','피부결개선'];
      } else if (/오메가|크릴|epa|dha|혈관/.test(pn)) {
        healthVars['효과1'] = ['혈관건강','혈행개선','중성지방감소','혈액순환','콜레스테롤관리','심혈관건강','혈압관리','혈관탄력'];
        healthVars['효과2'] = ['혈행촉진','중성지방관리','혈관탄력','심장건강','혈류개선'];
      } else if (/홍삼|인삼|면역|홍경천/.test(pn)) {
        healthVars['효과1'] = ['면역력','피로회복','활력','체력','항산화','기억력','혈액순환','면역강화'];
        healthVars['효과2'] = ['에너지충전','활력개선','면역증진','체력보강','기운회복'];
      }

      return healthVars;
    }
    if (/과일|채소|한라봉|사과|배|딸기|토마토|감귤|정육|한우|돼지|닭|수산물|생선|새우|쌀|잡곡/.test(productName) ||
        categoryPath.includes('신선식품')) {
      const sub = VARIABLES['식품>신선식품'];
      if (sub) return { ...parentVars, ...sub };
    }
    if (/라면|통조림|냉동|즉석|과자|쿠키|빵|소스|밀키트|간편식/.test(productName) ||
        categoryPath.includes('가공식품')) {
      const sub = VARIABLES['식품>가공식품'];
      if (sub) return { ...parentVars, ...sub };
    }
  }

  return parentVars;
}

// ─── 후처리 새니타이저 ──────────────────────────────────────

function sanitizeByProductForm(text: string, productName: string, categoryKey: string): string {
  const form = detectProductForm(productName, categoryKey);
  const blocklist = FORM_BLOCKLIST[form];
  if (!blocklist) return text;

  // 문장 단위로 분리 (마침표 기준 + 구어체 "~요" 기준)
  const sentences = text.split(/(?<=[.!?。요])\s+/);
  const cleaned = sentences.filter(s => !blocklist.test(s));

  // 전부 제거된 경우 빈 문자열 (caller가 length > 5 체크로 스킵)
  if (cleaned.length === 0) return '';

  return cleaned.join(' ');
}

// ─── 문장 조각 조합 ─────────────────────────────────────────

function composeFragment(
  pool: FragmentPool,
  rng: () => number,
  productName?: string,
  categoryKey?: string,
): string {
  const filteredOpeners = productName ? filterByProductForm(pool.openers, productName, categoryKey) : pool.openers;
  const openers = filteredOpeners.length > 0 ? filteredOpeners : pool.openers;
  const opener = openers[Math.floor(rng() * openers.length)] || '';

  const filteredValues = productName ? filterByProductForm(pool.values, productName, categoryKey) : pool.values;
  const values = filteredValues.length > 0 ? filteredValues : pool.values;
  const value = values[Math.floor(rng() * values.length)] || '';

  const filteredClosers = productName ? filterByProductForm(pool.closers, productName, categoryKey) : pool.closers;
  const closers = filteredClosers.length > 0 ? filteredClosers : pool.closers;
  const closer = closers[Math.floor(rng() * closers.length)] || '';

  const parts = [opener, value, closer].filter(p => p.length > 0);
  return parts.join(' ');
}

/** 같은 풀에서 다른 조합의 문장을 추가로 뽑는다 */
function composeExtraFragment(
  pool: FragmentPool,
  rng: () => number,
  productName?: string,
  categoryKey?: string,
): string {
  const filteredValues = productName ? filterByProductForm(pool.values, productName, categoryKey) : pool.values;
  const values = filteredValues.length > 0 ? filteredValues : pool.values;
  const value = values[Math.floor(rng() * values.length)] || '';

  const filteredClosers = productName ? filterByProductForm(pool.closers, productName, categoryKey) : pool.closers;
  const closers = filteredClosers.length > 0 ? filteredClosers : pool.closers;
  const closer = closers[Math.floor(rng() * closers.length)] || '';

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

  // 변수 풀 (서브카테고리 라우팅)
  const vars = resolveVariablePool(categoryPath, catKey, productName);

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

    const raw = composeFragment(pool, rng, productName, catKey);
    const filled = fillVariables(raw, vars, cleanName, rng);
    const sanitized = sanitizeByProductForm(filled, productName, catKey);

    if (sanitized.trim().length > 5) {
      paragraphs.push(sanitized.trim());
    }

    // experience, detail 같은 핵심 섹션은 추가 문장으로 문단 보강
    if ((section === 'experience' || section === 'detail' || section === 'backstory') && pool.values.length > 2) {
      const extra = composeExtraFragment(pool, rng, productName, catKey);
      const filledExtra = fillVariables(extra, vars, cleanName, rng);
      const sanitizedExtra = sanitizeByProductForm(filledExtra, productName, catKey);
      if (sanitizedExtra.trim().length > 5) {
        // 이전 문단에 이어붙이기 (한 사람이 쓴 것처럼)
        const lastIdx = paragraphs.length - 1;
        if (lastIdx >= 0) {
          paragraphs[lastIdx] += ' ' + sanitizedExtra.trim();
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

    const raw = composeFragment(pool, rng, productName, catKey);
    const filled = fillVariables(raw, vars, cleanName, rng);
    const sanitizedPad = sanitizeByProductForm(filled, productName, catKey);

    if (sanitizedPad.trim().length > 5) {
      // verdict 바로 앞에 삽입
      const verdictIdx = paragraphs.length - 1;
      if (verdictIdx >= 0) {
        paragraphs.splice(verdictIdx, 0, sanitizedPad.trim());
      } else {
        paragraphs.push(sanitizedPad.trim());
      }
      totalChars += sanitizedPad.trim().length;
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
