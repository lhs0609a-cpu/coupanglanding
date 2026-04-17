#!/usr/bin/env tsx
/**
 * 상세페이지 콘텐츠 품질 검증 스크립트
 *
 * - coupang-cat-details.json에서 전체 카테고리 로드
 * - 카테고리별 30개 임의 상품명 생성
 * - generateStoryV2 / generateFaqItems / extractSeoKeywords / generateClosingText 실행
 * - 오염(타 카테고리 성분 혼입), 미치환 변수, 빈 콘텐츠, 부적절 내용 검사
 *
 * 실행: npx tsx scripts/verify-content-quality.ts
 */

import catDetails from '../src/lib/megaload/data/coupang-cat-details.json';
import { generateStoryV2, generateFaqItems, extractSeoKeywords, generateClosingText } from '../src/lib/megaload/services/story-generator';
import { generatePersuasionContent, contentBlocksToParagraphs } from '../src/lib/megaload/services/persuasion-engine';
import { createSeededRandom, stringToSeed } from '../src/lib/megaload/services/seeded-random';

// ─── 설정 ────────────────────────────────────────────────────
const ITEMS_PER_CATEGORY = 30;
const SELLER_SEED = 'test-seller-2026';

// ─── 카테고리별 샘플 상품명 생성용 키워드 풀 ──────────────────
const PRODUCT_NAME_POOL: Record<string, string[]> = {
  '뷰티': ['수분크림', '세럼', '클렌징폼', '선크림', '토너', '마스크팩', '아이크림', '립밤', '파운데이션', '쿠션'],
  '식품': ['견과류 선물세트', '유기농 꿀', '김치', '라면 세트', '커피원두', '차 선물세트', '올리브오일', '참기름', '잡곡', '건조과일'],
  '건강식품': ['종합비타민', '오메가3', '유산균', '루테인', '콜라겐', '밀크씨슬', '프로폴리스', '홍삼정', '글루코사민', '마그네슘'],
  '생활용품': ['세탁세제', '섬유유연제', '방향제', '물티슈', '쓰레기봉투', '식기세척기세제', '빗자루', '걸레', '수세미', '키친타올'],
  '가전': ['무선청소기', '공기청정기', '가습기', '에어프라이어', '전기밥솥', '드라이기', '다리미', '믹서기', '전자레인지', '선풍기'],
  '패션의류잡화': ['반팔 티셔츠', '청바지', '원피스', '운동화', '크로스백', '지갑', '벨트', '양말 세트', '모자', '선글라스'],
  '가구': ['책상', '의자', '책장', '옷장', '침대 프레임', '소파', '식탁', '수납장', 'TV장', '신발장'],
  '출산': ['기저귀', '분유', '젖병', '유모차', '카시트', '아기침대', '물티슈', '이유식', '턱받이', '아기옷 세트'],
  '스포츠': ['요가매트', '아령 세트', '러닝화', '등산배낭', '골프장갑', '텐트', '자전거헬멧', '수영고글', '폼롤러', '배드민턴라켓'],
  '문구': ['볼펜 세트', 'A4용지', '노트', '파일 폴더', '스카치테이프', '가위', '색연필', '마카펜', '수정테이프', '데스크오거나이저'],
  '반려': ['사료', '간식', '모래', '장난감', '하네스', '이동장', '브러쉬', '샴푸', '패드', '급식기'],
  '자동차': ['블랙박스', '방향제', '시트커버', '세차용품', '핸들커버', '와이퍼', '충전케이블', '트렁크정리함', '햇빛가리개', '발판'],
  '주방용품': ['프라이팬', '냄비 세트', '도마', '칼 세트', '수저 세트', '텀블러', '밀폐용기', '에어프라이어종이', '국자', '뒤집개'],
  '완구': ['레고', '퍼즐', '인형', '보드게임', '물감세트', '점토', '미니카', '블록', '나무장난감', '카드게임'],
  'DEFAULT': ['프리미엄 제품', '고급 세트', '인기 상품', '베스트셀러', '추천 아이템', '스페셜 에디션', '실속 세트', '한정판', '신제품', '대용량'],
};

// 건강식품 세부 카테고리별 정확 매핑 (leafSegment 또는 path 매칭)
const HEALTH_PRODUCT_MAP: Record<string, { names: string[]; expectedIngredients: string[] }> = {
  '관절': { names: ['관절엔 글루코사민 1500', 'MSM 관절 플러스', 'N-아세틸글루코사민 정', '보스웰리아 관절영양제', '관절연골 콘드로이친'], expectedIngredients: ['글루코사민', 'MSM', '보스웰리아', '콘드로이친', '히알루론산'] },
  '눈건강': { names: ['루테인 지아잔틴 60캡슐', '마리골드 루테인 골드', '눈건강 루테인 플러스', '아스타잔틴 눈영양제', '빌베리 루테인 컴플렉스'], expectedIngredients: ['루테인'] },
  '간건강': { names: ['밀크씨슬 간건강', '실리마린 밀크시슬 150', '간건강 밀크씨슬 골드', 'UDCA 간영양제', '밀크씨슬 실리마린 플러스'], expectedIngredients: ['밀크씨슬', '밀크시슬'] },
  '유산균': { names: ['프로바이오틱스 100억 CFU', '김치유산균 모유유산균', '장건강 유산균 골드', '신바이오틱스 프리바이오틱스', '가족유산균 패밀리'], expectedIngredients: ['유산균', '프로바이오틱스'] },
  '오메가3': { names: ['알래스카 오메가3 1200mg', 'rTG 오메가3 EPA DHA', '식물성 오메가3 알티지', '크릴오일 오메가3', '초임계 오메가3 골드'], expectedIngredients: ['오메가3', '크릴오일'] },
  '홍삼': { names: ['6년근 홍삼정 EVERYTIME', '홍삼 농축액 스틱', '홍삼 면역 진세노사이드', '고려홍삼정 골드', '키즈 홍삼 젤리'], expectedIngredients: ['홍삼', '진세노사이드'] },
  '콜라겐': { names: ['저분자 피쉬콜라겐 펩타이드', '히알루론산 콜라겐 스틱', '저분자 콜라겐 3000mg', '엘라스틴 콜라겐 비오틴', '석류 콜라겐 젤리'], expectedIngredients: ['콜라겐', '히알루론산'] },
  '비타민': { names: ['종합비타민 미네랄', '멀티비타민 이뮨 플러스', '천연비타민C 1000', '비타민D 2000IU', '활성비타민B 컴플렉스'], expectedIngredients: ['비타민', '비타민A', '비타민B', '비타민C', '비타민D', '비타민E', '비타민K', '엽산', '비오틴'] },
  '다이어트': { names: ['가르시니아 다이어트', 'CLA 공액리놀레산', '키토산 다이어트 보조제', '녹차추출물 카테킨', 'HCA 가르시니아 캄보지아'], expectedIngredients: ['가르시니아', 'CLA', '카테킨'] },
  '프로틴': { names: ['WPC 유청 프로틴', '식물성 프로틴 쉐이크', '초코맛 단백질 보충제', '프로틴바 고단백', '닭가슴살 프로틴'], expectedIngredients: ['프로틴', '단백질', 'WPC', 'CLA', '카테킨', '가르시니아'] },
  '프로폴리스': { names: ['프로폴리스 플라보노이드', '브라질 프로폴리스 골드'], expectedIngredients: ['프로폴리스'] },
  '스피루리나': { names: ['스피루리나 500mg', '유기농 스피루리나'], expectedIngredients: ['스피루리나', '클로렐라'] },
  '클로렐라': { names: ['클로렐라 태블릿', '국산 클로렐라'], expectedIngredients: ['스피루리나', '클로렐라'] },
  '흑마늘': { names: ['흑마늘 농축액', '6년 발효 흑마늘'], expectedIngredients: ['흑마늘', '마늘'] },
  '마늘': { names: ['흑마늘 스틱', '숙성 마늘'], expectedIngredients: ['흑마늘', '마늘'] },
  '코엔자임': { names: ['코엔자임Q10 100mg', '유비퀴놀 환원형'], expectedIngredients: ['코엔자임'] },
  '쏘팔메토': { names: ['쏘팔메토 320mg', '쏘팔메토 노코기리야자'], expectedIngredients: ['쏘팔메토'] },
  '엽산': { names: ['활성엽산 400mcg', '임산부 엽산'], expectedIngredients: ['엽산'] },
  '비오틴': { names: ['비오틴 1000mcg', '고함량 비오틴'], expectedIngredients: ['비오틴'] },
  '글루코사민': { names: ['글루코사민 1500', 'N-아세틸글루코사민'], expectedIngredients: ['글루코사민', 'MSM', '보스웰리아', '콘드로이친', '히알루론산'] },
  '보스웰리아': { names: ['보스웰리아 관절영양제', '보스웰리아 세라타'], expectedIngredients: ['글루코사민', 'MSM', '보스웰리아', '콘드로이친', '히알루론산'] },
  'MSM': { names: ['MSM 식이유황', 'MSM 관절 플러스'], expectedIngredients: ['글루코사민', 'MSM', '보스웰리아', '콘드로이친', '히알루론산'] },
  '루테인': { names: ['루테인 지아잔틴', '마리골드 루테인'], expectedIngredients: ['루테인'] },
  '밀크시슬': { names: ['밀크시슬 실리마린', '간 밀크시슬'], expectedIngredients: ['밀크씨슬', '밀크시슬'] },
  '밀크씨슬': { names: ['밀크씨슬 실리마린', '간 밀크씨슬'], expectedIngredients: ['밀크씨슬', '밀크시슬'] },
  'CLA': { names: ['CLA 공액리놀레산'], expectedIngredients: ['프로틴', '단백질', 'WPC', 'CLA', '카테킨', '가르시니아'] },
  '크릴': { names: ['크릴오일 인지질', '남극 크릴'], expectedIngredients: ['오메가3', '크릴오일'] },
  // 프로틴 계열 세부 카테고리
  '아미노산': { names: ['복합 아미노산 파우더', 'BCAA 분말'], expectedIngredients: ['프로틴', '단백질', 'WPC', 'BCAA', 'CLA', '카테킨', '가르시니아'] },
  '크레아틴': { names: ['크레아틴 모노하이드레이트', '크레아틴 분말'], expectedIngredients: ['프로틴', '단백질', 'WPC', '크레아틴', 'BCAA', 'CLA', '카테킨', '가르시니아'] },
  '글루타민': { names: ['L-글루타민 파우더'], expectedIngredients: ['프로틴', '단백질', 'WPC', 'BCAA', 'CLA', '카테킨', '가르시니아'] },
  'BCAA': { names: ['BCAA 2:1:1'], expectedIngredients: ['프로틴', '단백질', 'WPC', 'BCAA', '크레아틴', 'CLA', '카테킨', '가르시니아'] },
  '테아닌': { names: ['L-테아닌 캡슐'], expectedIngredients: ['프로틴', '단백질', 'WPC', 'BCAA', 'CLA', '카테킨', '가르시니아'] },
  '헬스보조제': { names: ['복합 헬스보조제', '기타 헬스보조제'], expectedIngredients: ['프로틴', '단백질', 'WPC', 'BCAA', '크레아틴', 'CLA', '카테킨', '가르시니아'] },
  // 오메가3 세부
  'DHA': { names: ['식물성 DHA', 'rTG DHA'], expectedIngredients: ['오메가3', '크릴오일'] },
  '레시틴': { names: ['대두 레시틴', '해바라기 레시틴'], expectedIngredients: ['오메가3', '크릴오일'] },
  // 관절 세부
  '초록입홍합': { names: ['초록입홍합 오일'], expectedIngredients: ['글루코사민', 'MSM', '보스웰리아', '콘드로이친', '히알루론산'] },
  // 콜라겐 세부
  '석류': { names: ['석류 콜라겐 스틱'], expectedIngredients: ['콜라겐', '히알루론산'] },
  // 다이어트 세부
  '키토산': { names: ['키토산 다이어트'], expectedIngredients: ['가르시니아', 'CLA', '카테킨'] },
  '키드니빈': { names: ['키드니빈 다이어트'], expectedIngredients: ['가르시니아', 'CLA', '카테킨'] },
  // 간건강 세부
  'SAM-E': { names: ['SAM-E 메티오닌'], expectedIngredients: ['밀크씨슬', '밀크시슬'] },
  // 코엔자임 세부
  '폴리코사놀': { names: ['폴리코사놀 10mg'], expectedIngredients: ['코엔자임'] },
  // 눈건강 세부
  '아스타크산틴': { names: ['아스타크산틴 캡슐'], expectedIngredients: ['루테인'] },
  '빌베리': { names: ['빌베리 루테인'], expectedIngredients: ['루테인'] },
  // 유아동 건강식품 (일반 성분 폭넓게 허용)
  '유아': { names: ['유아 비타민', '아이 종합영양제'], expectedIngredients: ['비타민', '비타민A', '비타민B', '비타민C', '비타민D', '비타민E', '비타민K', '엽산', '비오틴', '유산균', '프로바이오틱스', '오메가3', '칼슘', '철분', '아연'] },
};

// ─── 금지 성분 리스트 (건강식품 교차 오염 감지용) ──────────────
const ALL_HEALTH_INGREDIENTS = [
  '오메가3', '루테인', '비오틴', '콜라겐', '유산균', '프로바이오틱스',
  '밀크씨슬', '밀크시슬', '홍삼', '마그네슘', '칼슘', '글루코사민',
  '히알루론산', '코엔자임', '크릴오일', '프로폴리스', '쏘팔메토',
  '엽산', '가르시니아', '스피루리나', '클로렐라', '흑마늘',
  '비타민A', '비타민B', '비타민C', '비타민D', '비타민E', '비타민K',
  '철분', '아연', '셀레늄', '보스웰리아', 'MSM', '진세노사이드',
  '프로틴', '단백질', 'WPC', 'CLA', '카테킨',
];

// ─── 미치환 변수 패턴 ───────────────────────────────────────
const UNRESOLVED_VAR_RE = /\{[가-힣a-zA-Z0-9_]+\}/g;

// ─── 결과 수집 ──────────────────────────────────────────────

interface Issue {
  category: string;
  categoryCode: string;
  productName: string;
  productIndex: number;
  type: 'contamination' | 'unresolved_var' | 'empty_content' | 'too_short' | 'repeated' | 'wrong_category_term' | 'error';
  detail: string;
  severity: 'critical' | 'warning' | 'info';
}

const issues: Issue[] = [];
let totalProducts = 0;
let totalCategories = 0;

// ─── 카테고리 경로로 상품명 풀 결정 ─────────────────────────
function getProductNamePool(categoryPath: string): string[] {
  const path = categoryPath.toLowerCase();
  if (path.includes('건강식품')) {
    // 건강식품 세부 분류 감지 — 가장 구체적인 키 우선
    const leafSegment = categoryPath.split('>').pop()?.trim() || '';
    for (const [subKey, data] of Object.entries(HEALTH_PRODUCT_MAP)) {
      if (leafSegment.includes(subKey) || path.includes(`>${subKey}`)) {
        return data.names;
      }
    }
    // 매칭 안되면 건강식품 기본
    return HEALTH_PRODUCT_MAP['비타민'].names;
  }

  const top = categoryPath.split('>')[0]?.trim() || '';
  if (top.includes('뷰티') || top.includes('화장품')) return PRODUCT_NAME_POOL['뷰티'];
  if (top.includes('식품')) return PRODUCT_NAME_POOL['식품'];
  if (top.includes('생활')) return PRODUCT_NAME_POOL['생활용품'];
  if (top.includes('가전') || top.includes('디지털') || path.includes('컴퓨터')) return PRODUCT_NAME_POOL['가전'];
  if (top.includes('패션') || top.includes('의류') || top.includes('잡화')) return PRODUCT_NAME_POOL['패션의류잡화'];
  if (top.includes('가구') || top.includes('홈데코') || path.includes('인테리어')) return PRODUCT_NAME_POOL['가구'];
  if (top.includes('출산') || top.includes('유아')) return PRODUCT_NAME_POOL['출산'];
  if (top.includes('스포츠') || top.includes('레져')) return PRODUCT_NAME_POOL['스포츠'];
  if (top.includes('문구') || top.includes('오피스')) return PRODUCT_NAME_POOL['문구'];
  if (top.includes('반려') || top.includes('애완')) return PRODUCT_NAME_POOL['반려'];
  if (top.includes('자동차')) return PRODUCT_NAME_POOL['자동차'];
  if (top.includes('주방')) return PRODUCT_NAME_POOL['주방용품'];
  if (top.includes('완구') || top.includes('취미')) return PRODUCT_NAME_POOL['완구'];
  return PRODUCT_NAME_POOL['DEFAULT'];
}

// ─── 건강식품 교차 오염 검사 ─────────────────────────────────
function checkHealthContamination(
  text: string,
  categoryPath: string,
  productName: string,
): string[] {
  if (!categoryPath.includes('건강식품')) return [];
  const path = categoryPath.toLowerCase();
  const name = productName.toLowerCase();

  // 이 상품에 관련된 성분 찾기
  let expectedIngredients: string[] = [];
  for (const [, data] of Object.entries(HEALTH_PRODUCT_MAP)) {
    for (const n of data.names) {
      if (name.includes(n.toLowerCase().split(' ')[0]) || n.toLowerCase().includes(name.split(' ')[0])) {
        expectedIngredients = data.expectedIngredients;
        break;
      }
    }
    if (expectedIngredients.length > 0) break;
  }
  // 카테고리 경로에서도 추정 — 리프 세그먼트 또는 경로 중간 매칭
  const leafSegment = categoryPath.split('>').pop()?.trim() || '';
  for (const [subKey, data] of Object.entries(HEALTH_PRODUCT_MAP)) {
    if (leafSegment.includes(subKey) || path.includes(`>${subKey}`)) {
      expectedIngredients = [...new Set([...expectedIngredients, ...data.expectedIngredients])];
    }
  }
  if (expectedIngredients.length === 0) return []; // 매핑 불가 → 스킵

  const contaminations: string[] = [];
  for (const ingredient of ALL_HEALTH_INGREDIENTS) {
    if (expectedIngredients.some(e => ingredient.includes(e) || e.includes(ingredient))) continue;
    // 상품명에 포함된 성분은 허용
    if (productName.includes(ingredient)) continue;
    // 일반적 용어(비타민 등)는 단독으로는 관대하게 처리
    if (['비타민', '칼슘', '마그네슘', '철분', '아연', '셀레늄'].includes(ingredient)) continue;
    // 텍스트에 해당 성분이 언급되면 오염
    if (text.includes(ingredient)) {
      contaminations.push(ingredient);
    }
  }
  return [...new Set(contaminations)];
}

// ─── 비건강식품 카테고리 부적절 용어 검사 ────────────────────
function checkWrongCategoryTerms(
  text: string,
  categoryPath: string,
): string[] {
  const path = categoryPath.toLowerCase();
  const issues: string[] = [];

  // 비식품 카테고리에서 식품/건강식품 용어가 나오면 이상
  if (!path.includes('식품') && !path.includes('건강') && !path.includes('뷰티')) {
    const foodTerms = ['복용', '섭취', '공복', '식후', '하루 권장량', '1일 섭취량'];
    for (const term of foodTerms) {
      if (text.includes(term)) issues.push(term);
    }
  }

  // 비뷰티 카테고리에서 화장품 전용 용어가 나오면 이상
  if (!path.includes('뷰티') && !path.includes('화장품')) {
    const beautyTerms = ['피부결', '각질', '모공', '미백', '주름개선'];
    for (const term of beautyTerms) {
      // 텍스트에 3회 이상 반복 시만 이상 판정 (우연 1회는 허용)
      const count = (text.match(new RegExp(term, 'g')) || []).length;
      if (count >= 3) issues.push(`${term}(x${count})`);
    }
  }

  return issues;
}

// ─── 메인 검증 루프 ─────────────────────────────────────────

function main() {
  const startTime = Date.now();

  const cats = catDetails as Record<string, { p: string }>;
  const allCodes = Object.keys(cats);
  console.log(`\n총 ${allCodes.length}개 카테고리에서 검증 시작 (카테고리당 ${ITEMS_PER_CATEGORY}개)\n`);
  console.log('='.repeat(80));

  // 카테고리 순회
  for (const code of allCodes) {
    const catInfo = cats[code];
    if (!catInfo?.p) continue;
    const categoryPath = catInfo.p;
    totalCategories++;

    const namePool = getProductNamePool(categoryPath);
    const rng = createSeededRandom(stringToSeed(`verify::${code}::${categoryPath}`));

    for (let idx = 0; idx < ITEMS_PER_CATEGORY; idx++) {
      totalProducts++;
      const baseName = namePool[Math.floor(rng() * namePool.length)];
      const brand = ['네이처메이드', '종근당건강', '에이블씨엔씨', 'LG생활건강', '아모레퍼시픽', '오뚜기', '삼성전자', '나이키', '이케아', '레고'][Math.floor(rng() * 10)];
      const productName = `${brand} ${baseName} ${Math.floor(rng() * 900) + 100}`;

      try {
        // 1. 스토리 생성 — categoryCode 전달로 CPG 프로필 정확 매칭
        const story = generateStoryV2(productName, categoryPath, SELLER_SEED, idx, undefined, code);
        const allParagraphs = story.paragraphs.join('\n');

        // 2. FAQ 생성
        const faqs = generateFaqItems(productName, categoryPath, SELLER_SEED, idx, 6);
        const faqText = faqs.map(f => `${f.question} ${f.answer}`).join('\n');

        // 3. SEO 키워드
        const seoKeywords = extractSeoKeywords(productName, categoryPath, SELLER_SEED, idx);

        // 4. 마무리 글
        const closingText = generateClosingText(productName, categoryPath, SELLER_SEED, idx);

        // 5. 설득 엔진
        const persuasion = generatePersuasionContent(productName, categoryPath, SELLER_SEED, idx, seoKeywords, code);
        const persuasionText = contentBlocksToParagraphs(persuasion.blocks).join('\n');

        const fullText = [allParagraphs, faqText, closingText, persuasionText].join('\n');

        // ── 검사 1: 미치환 변수 ──
        const unresolvedVars = fullText.match(UNRESOLVED_VAR_RE);
        if (unresolvedVars) {
          const uniqueVars = [...new Set(unresolvedVars)];
          issues.push({
            category: categoryPath, categoryCode: code, productName, productIndex: idx,
            type: 'unresolved_var', detail: `미치환 변수 발견: ${uniqueVars.join(', ')}`,
            severity: 'critical',
          });
        }

        // ── 검사 2: 빈 콘텐츠 ──
        if (story.paragraphs.length === 0) {
          issues.push({
            category: categoryPath, categoryCode: code, productName, productIndex: idx,
            type: 'empty_content', detail: '스토리 문단 0개',
            severity: 'critical',
          });
        }
        if (faqs.length === 0) {
          issues.push({
            category: categoryPath, categoryCode: code, productName, productIndex: idx,
            type: 'empty_content', detail: 'FAQ 0개',
            severity: 'warning',
          });
        }
        if (!closingText || closingText.trim().length < 10) {
          issues.push({
            category: categoryPath, categoryCode: code, productName, productIndex: idx,
            type: 'empty_content', detail: `마무리글 너무 짧음 (${closingText?.length || 0}자)`,
            severity: 'warning',
          });
        }

        // ── 검사 3: 콘텐츠 너무 짧음 ──
        if (allParagraphs.length < 100) {
          issues.push({
            category: categoryPath, categoryCode: code, productName, productIndex: idx,
            type: 'too_short', detail: `스토리 전체 ${allParagraphs.length}자 (100자 미만)`,
            severity: 'warning',
          });
        }

        // ── 검사 4: 건강식품 교차 오염 ──
        const contaminations = checkHealthContamination(fullText, categoryPath, productName);
        if (contaminations.length > 0) {
          issues.push({
            category: categoryPath, categoryCode: code, productName, productIndex: idx,
            type: 'contamination', detail: `타 성분 오염: ${contaminations.join(', ')}`,
            severity: 'critical',
          });
        }

        // ── 검사 5: 부적절 카테고리 용어 ──
        const wrongTerms = checkWrongCategoryTerms(fullText, categoryPath);
        if (wrongTerms.length > 0) {
          issues.push({
            category: categoryPath, categoryCode: code, productName, productIndex: idx,
            type: 'wrong_category_term', detail: `부적절 용어: ${wrongTerms.join(', ')}`,
            severity: 'warning',
          });
        }

        // ── 검사 6: 동일 문단 반복 ──
        const seen = new Set<string>();
        for (const p of story.paragraphs) {
          const normalized = p.trim().slice(0, 80);
          if (normalized.length > 20 && seen.has(normalized)) {
            issues.push({
              category: categoryPath, categoryCode: code, productName, productIndex: idx,
              type: 'repeated', detail: `동일 문단 반복: "${normalized.slice(0, 40)}..."`,
              severity: 'warning',
            });
            break;
          }
          seen.add(normalized);
        }

        // ── 검사 7: 설득 엔진 블록 수 확인 ──
        if (persuasion.blocks.length < 3) {
          issues.push({
            category: categoryPath, categoryCode: code, productName, productIndex: idx,
            type: 'too_short', detail: `설득 블록 ${persuasion.blocks.length}개 (3개 미만)`,
            severity: 'warning',
          });
        }

      } catch (err) {
        issues.push({
          category: categoryPath, categoryCode: code, productName, productIndex: idx,
          type: 'error', detail: `생성 오류: ${err instanceof Error ? err.message : String(err)}`,
          severity: 'critical',
        });
      }
    }

    // 진행률 표시 (100개마다)
    if (totalCategories % 100 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const critCount = issues.filter(i => i.severity === 'critical').length;
      const warnCount = issues.filter(i => i.severity === 'warning').length;
      console.log(`[${elapsed}s] ${totalCategories}/${allCodes.length} 카테고리 완료 | ${totalProducts}개 상품 | critical=${critCount} warning=${warnCount}`);
    }
  }

  // ─── 결과 리포트 ───────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(80));
  console.log(`검증 완료: ${totalCategories}개 카테고리 × ${ITEMS_PER_CATEGORY}개 = ${totalProducts}개 상품 (${elapsed}s)`);
  console.log('='.repeat(80));

  const criticals = issues.filter(i => i.severity === 'critical');
  const warnings = issues.filter(i => i.severity === 'warning');

  console.log(`\n🔴 CRITICAL: ${criticals.length}건`);
  console.log(`🟡 WARNING:  ${warnings.length}건`);
  console.log(`✅ 정상:     ${totalProducts - new Set(issues.map(i => `${i.categoryCode}::${i.productIndex}`)).size}개 상품\n`);

  // 타입별 집계
  const byType: Record<string, number> = {};
  for (const i of issues) {
    byType[i.type] = (byType[i.type] || 0) + 1;
  }
  console.log('── 이슈 타입별 집계 ──');
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}건`);
  }

  // CRITICAL 상세 출력
  if (criticals.length > 0) {
    console.log('\n── CRITICAL 상세 (최대 50건) ──');
    for (const i of criticals.slice(0, 50)) {
      console.log(`  [${i.type}] ${i.categoryCode} "${i.category}"`);
      console.log(`    상품: ${i.productName} (idx=${i.productIndex})`);
      console.log(`    내용: ${i.detail}`);
    }
    if (criticals.length > 50) {
      console.log(`  ... 외 ${criticals.length - 50}건`);
    }
  }

  // WARNING 카테고리별 요약
  if (warnings.length > 0) {
    console.log('\n── WARNING 카테고리별 요약 (상위 20개) ──');
    const byCat: Record<string, number> = {};
    for (const i of warnings) {
      const catShort = i.category.split('>').slice(0, 2).join('>');
      byCat[catShort] = (byCat[catShort] || 0) + 1;
    }
    const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 20);
    for (const [cat, count] of sorted) {
      console.log(`  ${cat}: ${count}건`);
    }
  }

  // 오염 상세 — 어떤 성분이 어디에 유출되었는지
  const contaminationIssues = issues.filter(i => i.type === 'contamination');
  if (contaminationIssues.length > 0) {
    console.log('\n── 건강식품 교차 오염 상세 ──');
    const byIngredient: Record<string, string[]> = {};
    for (const i of contaminationIssues) {
      const ingredients = i.detail.replace('타 성분 오염: ', '').split(', ');
      for (const ing of ingredients) {
        if (!byIngredient[ing]) byIngredient[ing] = [];
        byIngredient[ing].push(`${i.categoryCode}(${i.category.split('>').pop()?.trim()})`);
      }
    }
    for (const [ing, cats] of Object.entries(byIngredient).sort((a, b) => b[1].length - a[1].length)) {
      const uniqueCats = [...new Set(cats)];
      console.log(`  "${ing}" → ${uniqueCats.length}개 카테고리에서 유출: ${uniqueCats.slice(0, 5).join(', ')}${uniqueCats.length > 5 ? ` 외 ${uniqueCats.length - 5}개` : ''}`);
    }
  }

  // 미치환 변수 상세
  const unresolvedIssues = issues.filter(i => i.type === 'unresolved_var');
  if (unresolvedIssues.length > 0) {
    console.log('\n── 미치환 변수 상세 ──');
    const byVar: Record<string, number> = {};
    for (const i of unresolvedIssues) {
      const vars = i.detail.replace('미치환 변수 발견: ', '').split(', ');
      for (const v of vars) byVar[v] = (byVar[v] || 0) + 1;
    }
    for (const [v, count] of Object.entries(byVar).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${v}: ${count}건`);
    }
  }

  // 종합 판정
  console.log('\n' + '='.repeat(80));
  if (criticals.length === 0) {
    console.log('✅ 종합 판정: PASS — critical 이슈 없음');
  } else {
    console.log(`❌ 종합 판정: FAIL — critical ${criticals.length}건 발견`);
  }
  const errorRate = ((issues.length / totalProducts) * 100).toFixed(2);
  console.log(`   전체 이슈율: ${errorRate}% (${issues.length}/${totalProducts})`);
  console.log('='.repeat(80) + '\n');

  // 결과를 파일로도 저장
  const reportPath = 'scripts/verify-content-report.json';
  const fs = require('fs');
  fs.writeFileSync(reportPath, JSON.stringify({
    summary: {
      totalCategories, totalProducts,
      criticals: criticals.length,
      warnings: warnings.length,
      errorRate,
      elapsed,
    },
    byType,
    criticalIssues: criticals.slice(0, 200),
    warningIssues: warnings.slice(0, 200),
  }, null, 2));
  console.log(`상세 리포트 저장: ${reportPath}`);
}

main();
