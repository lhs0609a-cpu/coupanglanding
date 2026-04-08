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
import { resolveContentProfile } from './content-profile-resolver';
import type { ContentProfile } from './content-profile-resolver';
import { extractContextOverrides } from './product-name-parser';
import type { ProductContext } from './product-name-parser';

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

// 실제 쿠팡 중분류 → VARIABLES 키 매핑
// 쿠팡 카테고리 경로의 중분류명은 VARIABLES 키와 다른 경우가 많음
const SUBCATEGORY_ALIASES: Record<string, string> = {
  // ── 가전/디지털 (9 → 5 기존 + 4 신규) ──
  '가전/디지털>TV/영상가전':                    '가전/디지털>영상가전',
  '가전/디지털>계절환경가전':                    '가전/디지털>계절가전',
  '가전/디지털>냉장고/밥솥/주방가전':            '가전/디지털>주방가전',
  '가전/디지털>생활가전':                        '가전/디지털>청소가전',
  '가전/디지털>이미용건강가전':                  '가전/디지털>건강가전',
  '가전/디지털>음향기기/이어폰/스피커':          '가전/디지털>음향가전',
  '가전/디지털>컴퓨터/게임/SW':                  '가전/디지털>컴퓨터',
  '가전/디지털>휴대폰/태블릿PC/액세서리':        '가전/디지털>휴대폰',
  '가전/디지털>카메라/캠코더':                   '가전/디지털>카메라',

  // ── 뷰티 (11 → 4 기존 + 7 매핑) ──
  '뷰티>스킨':             '뷰티>스킨',
  '뷰티>메이크업':         '뷰티>메이크업',
  '뷰티>헤어':             '뷰티>헤어',
  '뷰티>바디':             '뷰티>바디',
  '뷰티>남성화장품':       '뷰티>스킨',
  '뷰티>어린이화장품':     '뷰티>스킨',
  '뷰티>임산부화장품':     '뷰티>스킨',
  '뷰티>선물세트':         '뷰티>스킨',
  '뷰티>뷰티소품':         '뷰티>메이크업',
  '뷰티>네일':             '뷰티>네일',
  '뷰티>향수':             '뷰티>향수',

  // ── 식품 (11 → 3 기존 + 8 매핑) ──
  '식품>건강식품':                  '식품>건강식품',
  '식품>신선식품':                  '식품>신선식품',
  '식품>가공/즉석식품':             '식품>가공식품',
  '식품>냉장/냉동식품':             '식품>가공식품',
  '식품>스낵/간식':                 '식품>가공식품',
  '식품>생수/음료':                 '식품>음료',
  '식품>유제품/아이스크림/디저트':   '식품>가공식품',
  '식품>장/소스':                   '식품>가공식품',
  '식품>가루/조미료/향신료':         '식품>가공식품',
  '식품>커피/차':                   '식품>음료',
  '식품>전통주':                    '식품>음료',

  // ── 생활용품 (23 → 3 기존 + 20 매핑) ──
  '생활용품>세제':             '생활용품>세제',
  '생활용품>세탁용품':         '생활용품>세제',
  '생활용품>욕실용품':         '생활용품>욕실용품',
  '생활용품>수납/정리':        '생활용품>수납/정리',
  '생활용품>청소용품':         '생활용품>세제',
  '생활용품>방향/탈취/제습/살충':  '생활용품>세제',
  '생활용품>화장지/물티슈':    '생활용품>욕실용품',
  '생활용품>구강/면도':        '생활용품>욕실용품',
  '생활용품>생리대/성인기저귀': '생활용품>욕실용품',
  '생활용품>건강용품':         '생활용품>건강용품',
  '생활용품>의료/간호용품':    '생활용품>건강용품',
  '생활용품>조명/전기용품':    '생활용품>수납/정리',
  '생활용품>생활소품':         '생활용품>수납/정리',
  '생활용품>생활잡화':         '생활용품>수납/정리',
  '생활용품>안전용품':         '생활용품>수납/정리',
  '생활용품>공구':             '생활용품>공구',
  '생활용품>보수용품':         '생활용품>공구',
  '생활용품>배관/건축자재':    '생활용품>공구',
  '생활용품>철물':             '생활용품>공구',
  '생활용품>접착용품':         '생활용품>공구',
  '생활용품>방충용품':         '생활용품>세제',
  '생활용품>도장용품':         '생활용품>공구',
  '생활용품>성인용품(19)':     '생활용품>수납/정리',

  // ── 패션의류잡화 (7 → 3 기존 + 4 매핑) ──
  '패션의류잡화>남성패션':                                   '패션의류잡화>남성의류',
  '패션의류잡화>여성패션':                                   '패션의류잡화>여성의류',
  '패션의류잡화>유니섹스/남녀공용 패션':                       '패션의류잡화>남성의류',
  '패션의류잡화>베이비 의류/신발/잡화(~24개월)':               '패션의류잡화>아동의류',
  '패션의류잡화>영유아동 신발/잡화/기타의류(0~17세)':          '패션의류잡화>아동의류',
  '패션의류잡화>주니어 의류(9~17세)':                          '패션의류잡화>아동의류',
  '패션의류잡화>키즈 의류(3~8세)':                             '패션의류잡화>아동의류',

  // ── 가구/홈데코 (11 → 3 기존 + 8 매핑) ──
  '가구/홈데코>가구':             '가구/홈데코>가구',
  '가구/홈데코>침구':             '가구/홈데코>침대',
  '가구/홈데코>인테리어용품':     '가구/홈데코>조명',
  '가구/홈데코>인테리어자재':     '가구/홈데코>조명',
  '가구/홈데코>카페트/매트':      '가구/홈데코>소파',
  '가구/홈데코>커튼/침장':        '가구/홈데코>침대',
  '가구/홈데코>쿠션/방석':        '가구/홈데코>소파',
  '가구/홈데코>패브릭소품/커버':  '가구/홈데코>소파',
  '가구/홈데코>원예/가드닝':      '가구/홈데코>원예',
  '가구/홈데코>금고':             '가구/홈데코>소파',
  '가구/홈데코>수선/수예도구':    '가구/홈데코>소파',

  // ── 출산/유아동 (13 → 3 기존 + 10 매핑) ──
  '출산/유아동>기저귀/교체용품':     '출산/유아동>기저귀',
  '출산/유아동>분유/유아식품':       '출산/유아동>분유',
  '출산/유아동>수유/이유용품':       '출산/유아동>분유',
  '출산/유아동>이유/유아식기':       '출산/유아동>유아식품',
  '출산/유아동>유아목욕/스킨케어':   '출산/유아동>유아스킨케어',
  '출산/유아동>유아물티슈/캡/홀더':  '출산/유아동>기저귀',
  '출산/유아동>유아위생/건강/세제':  '출산/유아동>기저귀',
  '출산/유아동>놀이매트/안전용품':   '출산/유아동>유아식품',
  '출산/유아동>외출용품':            '출산/유아동>외출용품',
  '출산/유아동>유아가구/인테리어':   '출산/유아동>외출용품',
  '출산/유아동>유아동침구':          '출산/유아동>유아스킨케어',
  '출산/유아동>임부용품':            '출산/유아동>유아스킨케어',
  '출산/유아동>출산준비물/선물':     '출산/유아동>외출용품',

  // ── 스포츠/레져 (19 → 3 기존 + 16 매핑) ──
  '스포츠/레져>골프':                 '스포츠/레져>골프',
  '스포츠/레져>캠핑':                 '스포츠/레져>캠핑',
  '스포츠/레져>헬스/요가':            '스포츠/레져>헬스',
  '스포츠/레져>등산':                 '스포츠/레져>캠핑',
  '스포츠/레져>자전거':               '스포츠/레져>자전거',
  '스포츠/레져>수영/수상스포츠':       '스포츠/레져>수영',
  '스포츠/레져>낚시':                 '스포츠/레져>낚시',
  '스포츠/레져>스키/겨울스포츠':       '스포츠/레져>캠핑',
  '스포츠/레져>구기스포츠':           '스포츠/레져>구기',
  '스포츠/레져>라켓스포츠':           '스포츠/레져>구기',
  '스포츠/레져>킥보드/스케이트':      '스포츠/레져>자전거',
  '스포츠/레져>발레/댄스/에어로빅':   '스포츠/레져>헬스',
  '스포츠/레져>검도/격투/무술':       '스포츠/레져>헬스',
  '스포츠/레져>스포츠 신발':          '스포츠/레져>헬스',
  '스포츠/레져>스포츠 잡화':          '스포츠/레져>헬스',
  '스포츠/레져>기타스포츠':           '스포츠/레져>헬스',
  '스포츠/레져>심판용품':             '스포츠/레져>구기',
  '스포츠/레져>측정용품':             '스포츠/레져>헬스',
  '스포츠/레져>철인3종경기':          '스포츠/레져>헬스',

  // ── 반려/애완용품 (14 → 2 기존 + 12 매핑) ──
  '반려/애완용품>강아지 사료/간식/영양제': '반려/애완용품>강아지',
  '반려/애완용품>강아지용품':              '반려/애완용품>강아지',
  '반려/애완용품>강아지/고양이 겸용':      '반려/애완용품>강아지',
  '반려/애완용품>고양이 사료/간식/영양제': '반려/애완용품>고양이',
  '반려/애완용품>고양이용품':              '반려/애완용품>고양이',
  '반려/애완용품>관상어용품':              '반려/애완용품>소동물',
  '반려/애완용품>햄스터/토끼/기니피그용품': '반려/애완용품>소동물',
  '반려/애완용품>조류용품':                '반려/애완용품>소동물',
  '반려/애완용품>파충류용품':              '반려/애완용품>소동물',
  '반려/애완용품>고슴도치용품':            '반려/애완용품>소동물',
  '반려/애완용품>페럿용품':               '반려/애완용품>소동물',
  '반려/애완용품>장수풍뎅이/곤충용품':     '반려/애완용품>소동물',
  '반려/애완용품>거북이/달팽이용품':       '반려/애완용품>소동물',
  '반려/애완용품>가축사료/용품':           '반려/애완용품>소동물',

  // ── 주방용품 (14 → 2 기존 + 12 매핑) ──
  '주방용품>조리용품':          '주방용품>프라이팬',
  '주방용품>취사도구':          '주방용품>프라이팬',
  '주방용품>칼/가위/도마':      '주방용품>칼/도마',
  '주방용품>보관/밀폐용기':     '주방용품>도시락',
  '주방용품>보온/보냉용품':     '주방용품>도시락',
  '주방용품>수저/컵/식기':      '주방용품>식기',
  '주방용품>이유/유아식기':     '주방용품>식기',
  '주방용품>베이킹&포장용품':   '주방용품>프라이팬',
  '주방용품>주방수납/정리':     '주방용품>도시락',
  '주방용품>주방일회용품':      '주방용품>도시락',
  '주방용품>주방잡화':          '주방용품>도시락',
  '주방용품>커피/티/와인':      '주방용품>식기',
  '주방용품>교자상/밥상/상커버': '주방용품>식기',
  '주방용품>제기/제수용품':     '주방용품>식기',

  // ── 완구/취미 (19 → 1 기존 + 18 매핑) ──
  '완구/취미>블록놀이':              '완구/취미>레고/블록',
  '완구/취미>보드게임':              '완구/취미>보드게임',
  '완구/취미>퍼즐/큐브/피젯토이':    '완구/취미>보드게임',
  '완구/취미>인형':                  '완구/취미>인형',
  '완구/취미>역할놀이':              '완구/취미>인형',
  '완구/취미>로봇/작동완구':         '완구/취미>RC/로봇',
  '완구/취미>RC완구/부품':           '완구/취미>RC/로봇',
  '완구/취미>STEAM/학습완구':        '완구/취미>레고/블록',
  '완구/취미>프라모델':              '완구/취미>레고/블록',
  '완구/취미>피규어/다이캐스트':     '완구/취미>레고/블록',
  '완구/취미>수집품':                '완구/취미>레고/블록',
  '완구/취미>악기/음향기기':         '완구/취미>악기',
  '완구/취미>DIY':                   '완구/취미>레고/블록',
  '완구/취미>신생아/영아완구':       '완구/취미>인형',
  '완구/취미>물놀이/계절완구':       '완구/취미>인형',
  '완구/취미>스포츠/야외완구':       '완구/취미>RC/로봇',
  '완구/취미>승용완구':              '완구/취미>RC/로봇',
  '완구/취미>실내대형완구':          '완구/취미>인형',
  '완구/취미>마술용품':              '완구/취미>보드게임',

  // ── 자동차용품 (13 → 1 기존 + 12 매핑) ──
  '자동차용품>세차/관리용품':       '자동차용품>세차용품',
  '자동차용품>공기청정/방향/탈취':  '자동차용품>실내용품',
  '자동차용품>매트/시트/쿠션':      '자동차용품>실내용품',
  '자동차용품>실내용품':            '자동차용품>실내용품',
  '자동차용품>실외용품':            '자동차용품>세차용품',
  '자동차용품>차량용디지털기기':    '자동차용품>디지털기기',
  '자동차용품>차량용튜닝용품':      '자동차용품>세차용품',
  '자동차용품>램프/배터리/전기':    '자동차용품>디지털기기',
  '자동차용품>비상/안전/차량가전':  '자동차용품>디지털기기',
  '자동차용품>오일/정비/소모품':    '자동차용품>세차용품',
  '자동차용품>오토바이용품':        '자동차용품>세차용품',
  '자동차용품>타이어/휠/체인':      '자동차용품>세차용품',
  '자동차용품>DIY/공구용품':        '자동차용품>세차용품',

  // ── 문구/오피스 (4 → 1 기존 + 3 매핑) ──
  '문구/오피스>문구/학용품':    '문구/오피스>필기구',
  '문구/오피스>사무용품':       '문구/오피스>필기구',
  '문구/오피스>사무기기':       '문구/오피스>필기구',
  '문구/오피스>미술/화방용품':  '문구/오피스>필기구',
};

function resolveVariablePoolCore(
  categoryPath: string,
  catKey: string,
  productName: string,
  categoryCode?: string,
): Record<string, string[]> {
  // ── CPG 프로필 우선 참조 (격리된 변수풀) ──
  const profile = resolveContentProfile(categoryPath, categoryCode);
  if (profile && profile.variables && Object.keys(profile.variables).length > 0) {
    return { ...profile.variables };
  }

  // ── 레거시 로직 ──
  const parentVars = VARIABLES[catKey] || VARIABLES['DEFAULT'];

  // 서브카테고리 키 추론: categoryPath에서 "대분류>중분류" 패턴 검색
  const parts = categoryPath.split('>').map(p => p.trim());

  // 2단계 키 (예: "출산/유아동>기저귀/교체용품") 먼저 시도
  // ※ "식품>건강식품"은 성분별 오버라이드가 필요하므로 조기 return 하지 않음
  if (parts.length >= 2) {
    const rawSubKey = `${parts[0]}>${parts[1]}`;
    // 별칭 테이블로 실제 쿠팡 중분류명 → VARIABLES 키 변환
    const subKey = SUBCATEGORY_ALIASES[rawSubKey] || rawSubKey;
    if (subKey !== '식품>건강식품') {
      const subVars = VARIABLES[subKey];
      if (subVars) {
        return { ...parentVars, ...subVars };
      }
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

      // 성분별 효과 + 성분 오버라이드 — 상품과 무관한 효과/성분 언급 방지
      const pn = productName.toLowerCase();
      if (/비오틴|모발|탈모|머리카락|손톱/.test(pn)) {
        healthVars['효과1'] = ['모발건강','피부건강','손톱건강','두피건강','모발영양','피부미용','모발강화','케라틴합성'];
        healthVars['효과2'] = ['탈모예방','모발윤기','피부탄력','손톱강화','두피영양'];
        healthVars['성분'] = ['비오틴','비타민B7','판토텐산','아연','셀레늄','비타민E','비타민C','케라틴','시스테인','엽산'];
        healthVars['카테고리'] = ['비오틴','모발영양제','비타민','영양제','건강식품'];
      } else if (/루테인|눈|시력|안구|지아잔틴/.test(pn)) {
        healthVars['효과1'] = ['눈건강','시력보호','눈피로','안구건조','황반건강','눈영양','시력관리','눈노화방지'];
        healthVars['효과2'] = ['눈피로회복','시야선명','블루라이트차단','눈건조개선','안구보호'];
        healthVars['성분'] = ['루테인','지아잔틴','비타민A','베타카로틴','빌베리추출물','아스타잔틴','오메가3','아연','비타민E','마리골드꽃추출물'];
        healthVars['카테고리'] = ['루테인','눈영양제','비타민','영양제','건강식품'];
      } else if (/콘드로이친|상어연골|보스웰리아|글루코사민|관절|무릎|연골|msm/.test(pn)) {
        healthVars['효과1'] = ['관절건강','연골보호','관절유연성','뼈건강','관절영양','연골재생','관절편안함','무릎건강'];
        healthVars['효과2'] = ['관절통완화','보행편안','관절유연','연골강화','움직임개선'];
        healthVars['성분'] = ['콘드로이친','글루코사민','MSM','상어연골','보스웰리아','초록입홍합','칼슘','비타민D','콜라겐','히알루론산'];
        healthVars['카테고리'] = ['관절영양제','글루코사민','영양제','건강식품','관절건강'];
      } else if (/밀크씨슬|간|헤파|실리마린/.test(pn)) {
        healthVars['효과1'] = ['간건강','간보호','간해독','간기능개선','간영양','피로회복','간세포보호','독소배출'];
        healthVars['효과2'] = ['숙취해소','간수치개선','피로감소','활력증진','해독력강화'];
        healthVars['성분'] = ['밀크씨슬','실리마린','UDCA','아티초크','비타민B군','헛개나무열매','강황','울금','타우린','메티오닌'];
        healthVars['카테고리'] = ['밀크씨슬','간영양제','영양제','건강식품','간건강'];
      } else if (/유산균|프로바이오|프리바이오|장|락토|비피더스/.test(pn)) {
        healthVars['효과1'] = ['장건강','소화흡수','장내환경','유익균증식','배변활동','장면역력','장내균형','소화개선'];
        healthVars['효과2'] = ['쾌변','더부룩함해소','소화력향상','장내유익균','배변규칙성'];
        healthVars['성분'] = ['유산균','프로바이오틱스','프리바이오틱스','락토바실러스','비피더스균','모유유래유산균','김치유산균','식이섬유','프락토올리고당','아연'];
        healthVars['카테고리'] = ['유산균','프로바이오틱스','영양제','건강식품','장건강'];
      } else if (/콜라겐|히알루론/.test(pn)) {
        healthVars['효과1'] = ['피부탄력','피부보습','주름개선','피부건강','피부광채','피부영양','피부재생','피부노화방지'];
        healthVars['효과2'] = ['피부윤기','보습력향상','탄력개선','주름감소','피부결개선'];
        healthVars['성분'] = ['콜라겐','히알루론산','엘라스틴','비타민C','세라마이드','코엔자임Q10','석류추출물','비타민E','아스타잔틴','펩타이드'];
        healthVars['카테고리'] = ['콜라겐','이너뷰티','영양제','건강식품','피부영양'];
      } else if (/오메가|크릴|epa|dha|혈관/.test(pn)) {
        healthVars['효과1'] = ['혈관건강','혈행개선','중성지방감소','혈액순환','콜레스테롤관리','심혈관건강','혈압관리','혈관탄력'];
        healthVars['효과2'] = ['혈행촉진','중성지방관리','혈관탄력','심장건강','혈류개선'];
        healthVars['성분'] = ['오메가3','EPA','DHA','크릴오일','어유','rTG오메가3','비타민E','아스타잔틴','인지질','비타민D'];
        healthVars['카테고리'] = ['오메가3','크릴오일','영양제','건강식품','혈관건강'];
      } else if (/홍삼|인삼|면역|홍경천|프로폴리스/.test(pn)) {
        healthVars['효과1'] = ['면역력','피로회복','활력','체력','항산화','기억력','혈액순환','면역강화'];
        healthVars['효과2'] = ['에너지충전','활력개선','면역증진','체력보강','기운회복'];
        healthVars['성분'] = ['홍삼','진세노사이드','인삼사포닌','프로폴리스','플라보노이드','홍경천','아연','비타민C','셀레늄','베타글루칸'];
        healthVars['카테고리'] = ['홍삼','면역영양제','건강식품','영양제','면역건강'];
      } else if (/코엔자임|coq10|유비퀴놀|심장/.test(pn)) {
        healthVars['효과1'] = ['심장건강','항산화','에너지생성','세포보호','혈압관리','심혈관건강','피로회복','활력'];
        healthVars['효과2'] = ['심장기능','항산화력','에너지충전','세포활력','혈관건강'];
        healthVars['성분'] = ['코엔자임Q10','유비퀴놀','비타민E','셀레늄','오메가3','비타민B군','마그네슘','L-카르니틴','알파리포산','PQQ'];
        healthVars['카테고리'] = ['코엔자임Q10','항산화영양제','영양제','건강식품','심장건강'];
      } else if (/마그네슘|칼슘|아연|셀레늄|철분|미네랄/.test(pn)) {
        healthVars['효과1'] = ['뼈건강','근육이완','신경안정','에너지대사','면역력','수면개선','스트레스완화','혈압관리'];
        healthVars['효과2'] = ['근육경련완화','수면질개선','피로감소','뼈밀도유지','면역강화'];
        healthVars['성분'] = ['마그네슘','칼슘','아연','셀레늄','철분','비타민D','비타민K','망간','구리','크롬'];
        healthVars['카테고리'] = ['미네랄','칼슘','영양제','건강식품','뼈건강'];
      } else if (/비타민[cdCD]|비타민\s*[cdCD]|멀티비타민|종합비타민/.test(pn)) {
        healthVars['효과1'] = ['면역력','뼈건강','항산화','에너지대사','피부건강','활력','영양균형','피로회복'];
        healthVars['효과2'] = ['면역강화','에너지충전','뼈밀도유지','피부건강','활력개선'];
        healthVars['성분'] = ['비타민C','비타민D','비타민B군','비타민E','비타민A','비타민K','나이아신','엽산','판토텐산','비오틴'];
        healthVars['카테고리'] = ['비타민','멀티비타민','영양제','건강식품','비타민제'];
      } else if (/쏘팔메토|전립선|노코기리야자/.test(pn)) {
        healthVars['효과1'] = ['전립선건강','배뇨기능','남성건강','호르몬균형','소변기능','전립선보호','야간뇨감소','배뇨개선'];
        healthVars['효과2'] = ['전립선기능','배뇨편안','남성활력','전립선보호','소변건강'];
        healthVars['성분'] = ['쏘팔메토','노코기리야자','아연','리코펜','셀레늄','호박씨오일','비타민E','비타민B6','쐐기풀추출물','베타시토스테롤'];
        healthVars['카테고리'] = ['쏘팔메토','남성영양제','영양제','건강식품','전립선건강'];
      } else if (/엽산|임산부|태아/.test(pn)) {
        healthVars['효과1'] = ['태아건강','세포분열','신경관발달','임산부건강','영양보충','DNA합성','혈액생성','면역력'];
        healthVars['효과2'] = ['태아발달','임산부영양','빈혈예방','건강한임신','영양균형'];
        healthVars['성분'] = ['엽산','활성엽산','비타민B12','철분','비타민D','칼슘','DHA','아연','비타민C','마그네슘'];
        healthVars['카테고리'] = ['엽산','임산부영양제','영양제','건강식품','임산부건강'];
      } else if (/가르시니아|다이어트|체지방|CLA|지방/.test(pn)) {
        healthVars['효과1'] = ['체지방감소','식욕억제','대사촉진','지방분해','체중관리','에너지대사','포만감','지방연소'];
        healthVars['효과2'] = ['체중관리','체지방관리','식욕조절','대사개선','지방감소'];
        healthVars['성분'] = ['가르시니아','HCA','녹차추출물','CLA','L-카르니틴','키토산','크롬','카테킨','후코잔틴','공액리놀레산'];
        healthVars['카테고리'] = ['다이어트','체지방관리','영양제','건강식품','체중관리'];
      } else if (/흑마늘|마늘|양파/.test(pn)) {
        healthVars['효과1'] = ['면역력','항산화','피로회복','혈관건강','활력','체력','항균','혈압관리'];
        healthVars['효과2'] = ['면역강화','활력개선','항산화력','피로감소','기운회복'];
        healthVars['성분'] = ['흑마늘','S-알릴시스테인','폴리페놀','알리신','셀레늄','아연','비타민B6','게르마늄','사포닌','항산화성분'];
        healthVars['카테고리'] = ['흑마늘','면역영양제','건강식품','영양제','면역건강'];
      } else if (/프로틴|단백질|BCAA|아미노산|크레아틴|운동/.test(pn)) {
        healthVars['효과1'] = ['근력강화','근육회복','단백질보충','운동능력','체력','근육성장','에너지공급','근지구력'];
        healthVars['효과2'] = ['근육회복','운동효과','근력향상','체력증진','근육합성'];
        healthVars['성분'] = ['유청단백질','WPI','WPC','BCAA','L-글루타민','크레아틴','아미노산','카제인','대두단백','콜라겐펩타이드'];
        healthVars['카테고리'] = ['프로틴','단백질보충제','영양제','건강식품','운동보충제'];
      } else if (/스피루리나|클로렐라|녹즙|녹색/.test(pn)) {
        healthVars['효과1'] = ['영양균형','항산화','면역력','디톡스','에너지','철분보충','영양보충','해독'];
        healthVars['효과2'] = ['영양보충','항산화력','면역강화','에너지충전','해독력'];
        healthVars['성분'] = ['스피루리나','클로렐라','피코시아닌','클로로필','철분','단백질','비타민B12','감마리놀렌산','베타카로틴','아연'];
        healthVars['카테고리'] = ['스피루리나','클로렐라','영양제','건강식품','녹색영양'];
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

/** 변수풀 해석 + productContext 오버라이드 일괄 적용 */
function resolveVariablePool(
  categoryPath: string,
  catKey: string,
  productName: string,
  categoryCode?: string,
  productContext?: ProductContext,
): Record<string, string[]> {
  // Core에서 카테고리/상품명 기반 변수풀 해석
  const vars = { ...resolveVariablePoolCore(categoryPath, catKey, productName, categoryCode) };

  // productContext 오버라이드 — 모든 경로에 공통 적용
  if (productContext) {
    const contextOverrides = extractContextOverrides(productContext, categoryPath);
    for (const [key, values] of Object.entries(contextOverrides)) {
      if (values.length > 0) {
        // 상품 컨텍스트 값을 앞에 배치 (높은 선택 확률)
        vars[key] = [...values, ...(vars[key] || [])];
      }
    }
  }
  return vars;
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
  categoryCode?: string,
  productContext?: ProductContext,
): RealReviewResult {
  const catKey = getReviewCategoryKey(categoryPath);
  const fragCatKey = resolveFragmentCategory(catKey);

  // 변수 풀 (CPG 프로필 우선, 없으면 서브카테고리 라우팅 + productContext 오버라이드)
  const vars = resolveVariablePool(categoryPath, catKey, productName, categoryCode, productContext);

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

  // ── 문장 중복 제거 (같은 리뷰 내 동일 문장 반복 방지) ──
  const allSeenSentences = new Set<string>();
  for (let i = 0; i < paragraphs.length; i++) {
    // 문장 단위로 분리 (마침표/느낌표/물음표 뒤 공백)
    const sentences = paragraphs[i].split(/(?<=[.!?。])\s+/);
    const deduped: string[] = [];
    for (const s of sentences) {
      const key = s.trim().replace(/\s+/g, ' ');
      if (key.length < 10 || !allSeenSentences.has(key)) {
        allSeenSentences.add(key);
        deduped.push(s);
      }
    }
    paragraphs[i] = deduped.join(' ').trim();
  }
  // 빈 문단 제거
  const cleanedParagraphs = paragraphs.filter(p => p.trim().length > 5);

  return {
    paragraphs: cleanedParagraphs,
    frameId,
    frameName: frame.name,
  };
}

/**
 * 리얼 후기 배치 생성
 */
export function generateRealReviewBatch(
  products: { name: string; categoryPath: string; categoryCode?: string; productContext?: ProductContext }[],
  sellerSeed: string,
): RealReviewResult[] {
  return products.map((p, i) =>
    generateRealReview(p.name, p.categoryPath, sellerSeed, i, p.categoryCode, p.productContext),
  );
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
