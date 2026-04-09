// ============================================================
// 전체 카테고리 콘텐츠 오염/불일치 종합 테스트
//
// 16,259개 쿠팡 카테고리에서 ~4,000개 샘플링 →
// 카테고리별 임의 상품명 생성 → generateRealReview → 오염 패턴 스캔
//
// 검증 항목:
//   1. 미해결 변수: {효과1}, {성분} 등이 텍스트에 남아있는 경우
//   2. 폼 오염: 식품에 "바르다", 화장품에 "섭취" 등
//   3. 건강식품 교차 오염: 비오틴 상품에 오메가3 언급 등
//   4. 빈 콘텐츠: 문단 0개 또는 총 글자수 100자 미만
//   5. 연속 공백 / 깨진 조사
// ============================================================

import { readFileSync } from 'fs';
import { generateRealReview } from './src/lib/megaload/services/real-review-composer';
import { generateStoryV2 } from './src/lib/megaload/services/story-generator';

// ─── 카테고리 로드 ─────────────────────────────────────────
const catDetails = JSON.parse(
  readFileSync('./src/lib/megaload/data/coupang-cat-details.json', 'utf8'),
);
const allCodes = Object.keys(catDetails);
console.log(`총 카테고리: ${allCodes.length}개`);

// ─── 샘플링: L1별 균등 샘플 → ~4,000개 ─────────────────────
function sampleCategories(codes, targetCount) {
  // L1별 그룹핑
  const byL1 = {};
  for (const code of codes) {
    const path = catDetails[code].p;
    const l1 = path.split('>')[0]?.trim() || 'UNKNOWN';
    if (!byL1[l1]) byL1[l1] = [];
    byL1[l1].push(code);
  }

  const l1Keys = Object.keys(byL1);
  const perL1 = Math.ceil(targetCount / l1Keys.length);
  const sampled = [];

  for (const l1 of l1Keys) {
    const pool = byL1[l1];
    // 셔플 후 상위 N개
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    sampled.push(...pool.slice(0, Math.min(perL1, pool.length)));
  }
  return sampled;
}

const sampledCodes = sampleCategories(allCodes, 4000);
console.log(`샘플링: ${sampledCodes.length}개\n`);

// ─── 카테고리별 임의 상품명 생성 ────────────────────────────
const HEALTH_PRODUCT_NAMES = {
  '비오틴': '네추럴플러스 비오틴 5000mcg 90정',
  '오메가3': 'rTG 오메가3 EPA DHA 120캡슐',
  '루테인': '마리골드 루테인 지아잔틴 60캡슐',
  '콜라겐': '저분자 피쉬콜라겐 히알루론산 30포',
  '유산균': '프로바이오틱스 유산균 락토바실러스 60캡슐',
  '밀크씨슬': '밀크씨슬 실리마린 간건강 60정',
  '홍삼': '6년근 홍삼정 진세노사이드 30포',
  '글루코사민': '관절보감 글루코사민 콘드로이친 MSM 90정',
  '코엔자임': '코엔자임Q10 유비퀴놀 100mg 60캡슐',
  '마그네슘': '산화마그네슘 400mg 90정',
  '칼슘': '칼슘 비타민D 600mg 120정',
  '철분': '철분 헴철 18mg 60캡슐',
  '엽산': '활성엽산 임산부 비타민 60정',
  '가르시니아': '가르시니아 다이어트 HCA 60정',
  '쏘팔메토': '쏘팔메토 전립선 건강 60캡슐',
  '프로틴': '유청단백질 WPI 프로틴 파우더 1kg',
  '스피루리나': '유기농 스피루리나 클로렐라 1000정',
  '흑마늘': '남해 흑마늘 진액 70ml 30포',
  '비타민C': '고함량 비타민C 1000mg 120정',
  '비타민D': '비타민D3 2000IU 90캡슐',
  '멀티비타민': '종합비타민 멀티비타민 미네랄 60정',
  '보스웰리아': '보스웰리아 관절 보스웰릭산 60정',
};

const FOOD_NAMES = [
  '유기농 제주 한라봉 3kg', '국내산 냉동 블루베리 1kg', '한우 등심 1++등급 300g',
  '프리미엄 라면 멀티팩 5입', '수제 밀키트 된장찌개 2인분', '매일 저지방 우유 1L',
  '국산 벌꿀 500g', '제주 감귤주스 1L', '전통 김치 포기김치 2kg',
];
const BEAUTY_NAMES = [
  '히알루론산 수분크림 50ml', '레티놀 안티링클 세럼 30ml', '비타민C 브라이트닝 앰플 20ml',
  '시카 진정 토너 200ml', '콜라겐 리프팅 아이크림 25ml', '저자극 선크림 SPF50+ 50ml',
  '약산성 클렌징폼 150ml', '트러블 패치 36매', '수분 시트마스크 10매',
];
const BEAUTY_HAIR = ['두피 스케일링 샴푸 500ml', '단백질 트리트먼트 300ml', '헤어에센스 100ml'];
const BEAUTY_BODY = ['바디로션 400ml', '핸드크림 세트 30ml x 5', '풋크림 100ml'];
const BEAUTY_MAKEUP = ['롱래스팅 틴트 4g', '매트 파운데이션 30ml', '볼륨 마스카라 8ml'];
const LIVING_NAMES = [
  '고농축 세탁세제 3L', '항균 섬유유연제 2.5L', '욕실 곰팡이 제거제 500ml',
  '압축 다용도 정리함', '스테인리스 빨래건조대', '화장지 30롤 3겹',
];
const ELEC_NAMES = [
  '무선 청소기 V15 Pro', 'LED 스탠드 조명 12W', '공기청정기 H13 필터',
  '블루투스 이어폰 ANC', '42인치 4K 모니터', '전기히터 1800W',
];
const FASHION_NAMES = [
  '오버핏 반팔 티셔츠 M', '와이드 데님 팬츠 L', '라운드넥 니트 가디건',
  '스니커즈 운동화 270mm', '소가죽 크로스백', '울 캐시미어 머플러',
];
const FURNITURE_NAMES = [
  '메모리폼 매트리스 퀸', '3단 서랍장 화이트', 'LED 간접조명 거실등',
  '패브릭 소파 3인용', '접이식 식탁 4인용', '원목 행거 선반',
];
const BABY_NAMES = [
  '프리미엄 팬티형 기저귀 L 44매', '유기농 분유 800g', '순면 물티슈 80매 10팩',
  '유아 바디워시 300ml', '이유식 퓨레 사과당근 100g', '아기 보습로션 200ml',
];
const SPORTS_NAMES = [
  '요가매트 6mm NBR', '덤벨 10kg 세트', '골프 드라이버 10.5도',
  '캠핑 텐트 4인용', '등산 스틱 카본', '자전거 헬멧 L',
];
const PET_NAMES = [
  '강아지 건식사료 6kg', '고양이 캔 참치 24개', '반려동물 자동급식기',
  '강아지 치석제거 껌 30개', '고양이 모래 벤토나이트 10L', '강아지 하네스 M',
];
const KITCHEN_NAMES = [
  '세라믹 프라이팬 28cm', '스테인리스 냄비 세트 3종', '실리콘 조리도구 5종 세트',
  '밀폐용기 세트 6p', '보온보냉 텀블러 500ml', '양날 식칼 200mm',
];
const TOY_NAMES = [
  '레고 테크닉 슈퍼카 1500pcs', '보드게임 할리갈리', 'RC카 드리프트 1:16',
  '입문용 우쿨렐레 소프라노', '3D 퍼즐 세계 명소', '인형 곰돌이 40cm',
];
const CAR_NAMES = [
  '폴리싱 컴파운드 세차용품 500ml', '차량용 공기청정기', '가죽 시트커버 풀세트',
  '블랙박스 FHD 2채널', '타이어 공기압 게이지', 'LED 실내등 세트',
];
const OFFICE_NAMES = [
  '제트스트림 볼펜 0.5mm 10개', '무선철 스프링 노트 A5', '사무용 레이저 프린터',
  '수채화 물감 세트 24색', '코팅 A4용지 500매', '메모보드 화이트보드 60cm',
];

function generateProductName(catPath) {
  const parts = catPath.split('>').map(p => p.trim());
  const l1 = parts[0] || '';
  const leaf = parts[parts.length - 1] || '상품';

  // 식품 > 건강식품 — 특화 상품명
  if (l1.includes('식품') && (catPath.includes('건강식품') || catPath.includes('건강기능'))) {
    const keys = Object.keys(HEALTH_PRODUCT_NAMES);
    return HEALTH_PRODUCT_NAMES[keys[Math.floor(Math.random() * keys.length)]];
  }
  if (l1.includes('식품')) return FOOD_NAMES[Math.floor(Math.random() * FOOD_NAMES.length)];
  if (l1.includes('뷰티') || l1.includes('화장품')) {
    if (catPath.includes('헤어') || catPath.includes('샴푸')) return BEAUTY_HAIR[Math.floor(Math.random() * BEAUTY_HAIR.length)];
    if (catPath.includes('바디') || catPath.includes('핸드')) return BEAUTY_BODY[Math.floor(Math.random() * BEAUTY_BODY.length)];
    if (catPath.includes('메이크업') || catPath.includes('립') || catPath.includes('파운데이션')) return BEAUTY_MAKEUP[Math.floor(Math.random() * BEAUTY_MAKEUP.length)];
    return BEAUTY_NAMES[Math.floor(Math.random() * BEAUTY_NAMES.length)];
  }
  if (l1.includes('생활')) return LIVING_NAMES[Math.floor(Math.random() * LIVING_NAMES.length)];
  if (l1.includes('가전') || l1.includes('디지털')) return ELEC_NAMES[Math.floor(Math.random() * ELEC_NAMES.length)];
  if (l1.includes('패션') || l1.includes('의류')) return FASHION_NAMES[Math.floor(Math.random() * FASHION_NAMES.length)];
  if (l1.includes('가구') || l1.includes('홈데코')) return FURNITURE_NAMES[Math.floor(Math.random() * FURNITURE_NAMES.length)];
  if (l1.includes('출산') || l1.includes('유아')) return BABY_NAMES[Math.floor(Math.random() * BABY_NAMES.length)];
  if (l1.includes('스포츠') || l1.includes('레져')) return SPORTS_NAMES[Math.floor(Math.random() * SPORTS_NAMES.length)];
  if (l1.includes('반려') || l1.includes('애완')) return PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)];
  if (l1.includes('주방')) return KITCHEN_NAMES[Math.floor(Math.random() * KITCHEN_NAMES.length)];
  if (l1.includes('완구') || l1.includes('취미')) return TOY_NAMES[Math.floor(Math.random() * TOY_NAMES.length)];
  if (l1.includes('자동차')) return CAR_NAMES[Math.floor(Math.random() * CAR_NAMES.length)];
  if (l1.includes('문구') || l1.includes('사무')) return OFFICE_NAMES[Math.floor(Math.random() * OFFICE_NAMES.length)];

  return `프리미엄 ${leaf}`;
}

// ─── 오염 감지 패턴 ─────────────────────────────────────────

const UNRESOLVED_VAR = /\{[^}]+\}/g;
const DOUBLE_SPACE = /\s{3,}/;
const BROKEN_JOSA = /([\uAC00-\uD7A3])(이가|은는|을를|으로로)/; // 조사 중복

// 폼 오염: 카테고리와 맞지 않는 표현
const FORM_CHECKS = {
  '식품': { forbidden: /바르[고는며]|도포|피부에\s*(바|발라|도포)|세안\s*후|화장/g, label: '화장품 표현이 식품에' },
  '뷰티': { forbidden: /섭취|복용|캡슐을?\s*삼|하루\s*\d+정|공복|식후\s*복용|충전\s*시간|블루투스/g, label: '식품/가전 표현이 뷰티에' },
  '가전/디지털': { forbidden: /섭취|복용|바르[고는며]|도포|피부에|세안|사료/g, label: '식품/뷰티 표현이 가전에' },
  '패션의류잡화': { forbidden: /섭취|복용|캡슐|바르[고는며]|도포|충전|사료/g, label: '타카테고리 표현이 패션에' },
  '가구/홈데코': { forbidden: /섭취|복용|캡슐|바르[고는며]|피부에|사료/g, label: '타카테고리 표현이 가구에' },
  '출산/유아동': { forbidden: /캡슐을?\s*삼|하루\s*\d+정|공복|음주|블루투스|세차/g, label: '부적절 표현이 유아동에' },
  '반려/애완용품': { forbidden: /바르[고는며]|도포|피부에\s*바|세안|공복|블루투스/g, label: '타카테고리 표현이 반려에' },
};

// 건강식품 교차 오염: 각 보충제별 고유 성분 → 다른 보충제 성분 감지
const HEALTH_INGREDIENT_MAP = {
  '비오틴': { own: /비오틴|비타민B7|모발|두피|손톱|케라틴/i, others: /오메가3|EPA|DHA|루테인|지아잔틴|밀크씨슬|실리마린|글루코사민|콘드로이친|쏘팔메토|전립선|가르시니아|HCA|스피루리나|클로렐라|홍삼|진세노사이드|흑마늘/i },
  '오메가3': { own: /오메가3|EPA|DHA|크릴|혈관|중성지방/i, others: /비오틴|모발|두피|루테인|지아잔틴|황반|밀크씨슬|실리마린|간건강|글루코사민|콘드로이친|관절|쏘팔메토|전립선|가르시니아|HCA|스피루리나|클로렐라|흑마늘/i },
  '루테인': { own: /루테인|지아잔틴|눈|시력|황반|안구/i, others: /비오틴|모발|두피|오메가3|EPA|DHA|밀크씨슬|실리마린|글루코사민|콘드로이친|쏘팔메토|전립선|가르시니아|HCA|스피루리나|클로렐라|흑마늘/i },
  '밀크씨슬': { own: /밀크씨슬|실리마린|간|헤파|해독/i, others: /비오틴|모발|두피|오메가3|EPA|DHA|루테인|지아잔틴|황반|글루코사민|콘드로이친|관절|쏘팔메토|전립선|가르시니아|HCA|스피루리나|클로렐라/i },
  '유산균': { own: /유산균|프로바이오|프리바이오|장|소화|배변|락토|비피더스/i, others: /비오틴|모발|두피|오메가3|EPA|DHA|루테인|지아잔틴|밀크씨슬|실리마린|글루코사민|콘드로이친|쏘팔메토|전립선|가르시니아|HCA|스피루리나|클로렐라|흑마늘/i },
  '콜라겐': { own: /콜라겐|히알루론|피부|탄력|주름|보습/i, others: /오메가3|EPA|DHA|루테인|지아잔틴|밀크씨슬|실리마린|간건강|글루코사민|콘드로이친|관절|쏘팔메토|전립선|가르시니아|HCA|스피루리나|클로렐라|흑마늘/i },
  '홍삼': { own: /홍삼|인삼|진세노사이드|면역|사포닌/i, others: /비오틴|모발|두피|오메가3|EPA|DHA|루테인|지아잔틴|밀크씨슬|실리마린|글루코사민|콘드로이친|쏘팔메토|전립선|가르시니아|HCA|스피루리나|클로렐라/i },
  '글루코사민': { own: /글루코사민|콘드로이친|관절|연골|MSM|보스웰리아/i, others: /비오틴|모발|두피|오메가3|EPA|DHA|루테인|지아잔틴|밀크씨슬|실리마린|쏘팔메토|전립선|가르시니아|HCA|스피루리나|클로렐라|흑마늘/i },
  '쏘팔메토': { own: /쏘팔메토|전립선|배뇨|노코기리/i, others: /비오틴|모발|두피|오메가3|EPA|DHA|루테인|지아잔틴|밀크씨슬|실리마린|글루코사민|콘드로이친|관절|가르시니아|HCA|스피루리나|클로렐라|흑마늘/i },
  '가르시니아': { own: /가르시니아|HCA|체지방|다이어트|지방/i, others: /비오틴|모발|두피|오메가3|EPA|DHA|루테인|지아잔틴|밀크씨슬|실리마린|글루코사민|콘드로이친|쏘팔메토|전립선|스피루리나|클로렐라|흑마늘/i },
};

// ─── 테스트 실행 ────────────────────────────────────────────

function getL1Key(catPath) {
  const top = catPath.split('>')[0]?.trim() || '';
  if (top.includes('뷰티') || top.includes('화장품')) return '뷰티';
  if (top.includes('식품') || top.includes('건강식품')) return '식품';
  if (top.includes('생활')) return '생활용품';
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

// 결과 수집
const issues = {
  unresolvedVars: [],      // {변수} 미해결
  formContamination: [],   // 폼 오염 (식품에 "바르다" 등)
  healthCrossContam: [],   // 건강식품 교차 오염
  emptyContent: [],        // 빈/너무 짧은 콘텐츠
  doubleSpace: [],         // 연속 공백
  brokenJosa: [],          // 조사 오류
};

const stats = {
  total: 0,
  byL1: {},
  totalChars: 0,
  minChars: Infinity,
  maxChars: 0,
};

const startTime = Date.now();

// ── Part 1: 샘플 카테고리 전체 테스트 ──
console.log('━━━ Part 1: 샘플 카테고리 전체 테스트 ━━━');

for (const code of sampledCodes) {
  const catPath = catDetails[code].p;
  const productName = generateProductName(catPath);
  const l1 = getL1Key(catPath);

  try {
    const result = generateRealReview(productName, catPath, 'contamination-test', stats.total, code);
    const fullText = result.paragraphs.join(' ');
    const charCount = fullText.length;

    stats.total++;
    stats.byL1[l1] = (stats.byL1[l1] || 0) + 1;
    stats.totalChars += charCount;
    if (charCount < stats.minChars) stats.minChars = charCount;
    if (charCount > stats.maxChars) stats.maxChars = charCount;

    // 1. 미해결 변수
    const unresolvedMatches = fullText.match(UNRESOLVED_VAR);
    if (unresolvedMatches) {
      issues.unresolvedVars.push({
        code, catPath, productName,
        vars: [...new Set(unresolvedMatches)],
        sample: fullText.substring(0, 100),
      });
    }

    // 2. 폼 오염
    const formCheck = FORM_CHECKS[l1];
    if (formCheck) {
      const matches = fullText.match(formCheck.forbidden);
      if (matches) {
        issues.formContamination.push({
          code, catPath, productName, l1,
          label: formCheck.label,
          matches: [...new Set(matches)],
          sample: fullText.substring(0, 120),
        });
      }
    }

    // 3. 빈 콘텐츠
    if (charCount < 100 || result.paragraphs.length === 0) {
      issues.emptyContent.push({ code, catPath, productName, charCount, paraCount: result.paragraphs.length });
    }

    // 4. 연속 공백
    if (DOUBLE_SPACE.test(fullText)) {
      issues.doubleSpace.push({ code, catPath, productName });
    }

    // 5. 조사 오류
    if (BROKEN_JOSA.test(fullText)) {
      issues.brokenJosa.push({ code, catPath, productName, sample: fullText.match(BROKEN_JOSA)?.[0] });
    }
  } catch (err) {
    issues.emptyContent.push({ code, catPath, productName, error: err.message });
  }
}

// ── Part 2: 건강식품 교차 오염 집중 테스트 ──
console.log('\n━━━ Part 2: 건강식품 교차 오염 집중 테스트 ━━━');

// 건강식품 카테고리 코드 찾기
const healthCodes = allCodes.filter(c => {
  const p = catDetails[c].p;
  return p.includes('건강식품') || p.includes('건강기능');
});
const healthCatPath = healthCodes.length > 0
  ? catDetails[healthCodes[0]].p
  : '식품>건강식품>비타민';
const healthCatCode = healthCodes[0] || '0';

console.log(`건강식품 카테고리: ${healthCodes.length}개 (테스트 경로: ${healthCatPath})`);

for (const [supplementType, name] of Object.entries(HEALTH_PRODUCT_NAMES)) {
  const check = HEALTH_INGREDIENT_MAP[supplementType];
  if (!check) continue;

  // 같은 보충제를 시드 10개로 생성 → 교차 오염 확률 측정
  let contamCount = 0;
  let totalRuns = 10;
  const contamDetails = [];

  for (let seed = 0; seed < totalRuns; seed++) {
    const result = generateRealReview(name, healthCatPath, `health-test-${seed}`, seed, healthCatCode);
    const fullText = result.paragraphs.join(' ');

    // 자기 성분이 있는지 확인
    const hasOwn = check.own.test(fullText);

    // 다른 성분이 있는지 확인
    const otherMatches = fullText.match(check.others);
    if (otherMatches) {
      contamCount++;
      contamDetails.push({
        seed,
        matches: [...new Set(otherMatches)].slice(0, 5),
        hasOwn,
      });
    }
  }

  const contamRate = Math.round((contamCount / totalRuns) * 100);
  const icon = contamRate === 0 ? '✅' : contamRate <= 20 ? '⚠️' : '❌';
  console.log(`  ${icon} ${supplementType.padEnd(10)} → 교차오염 ${contamCount}/${totalRuns} (${contamRate}%)`);

  if (contamCount > 0) {
    issues.healthCrossContam.push({
      supplement: supplementType,
      productName: name,
      contamRate,
      totalRuns,
      contamCount,
      details: contamDetails,
    });
  }
}

// ── Part 3: generateStoryV2 + productContext 교차 오염 테스트 ──
console.log('\n━━━ Part 3: productContext 적용 후 교차 오염 테스트 ━━━');

const healthCrossContamWithContext = [];
for (const [supplementType, name] of Object.entries(HEALTH_PRODUCT_NAMES)) {
  const check = HEALTH_INGREDIENT_MAP[supplementType];
  if (!check) continue;

  // productContext 생성: 상품명에서 핵심 성분 추출
  const productContext = {
    tags: [supplementType],
    description: name,
  };

  let contamCount = 0;
  let totalRuns = 10;
  const contamDetails = [];

  for (let seed = 0; seed < totalRuns; seed++) {
    const result = generateStoryV2(name, healthCatPath, `ctx-test-${seed}`, seed, productContext);
    const fullText = result.paragraphs.join(' ');

    const otherMatches = fullText.match(check.others);
    if (otherMatches) {
      contamCount++;
      contamDetails.push({
        seed,
        matches: [...new Set(otherMatches)].slice(0, 5),
      });
    }
  }

  const contamRate = Math.round((contamCount / totalRuns) * 100);
  const icon = contamRate === 0 ? '✅' : contamRate <= 20 ? '⚠️' : '❌';
  console.log(`  ${icon} ${supplementType.padEnd(10)} → 교차오염 ${contamCount}/${totalRuns} (${contamRate}%)`);

  if (contamCount > 0) {
    healthCrossContamWithContext.push({
      supplement: supplementType,
      productName: name,
      contamRate,
      contamCount,
      totalRuns,
      details: contamDetails,
    });
  }
}

// ─── 결과 리포트 ────────────────────────────────────────────
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║            콘텐츠 오염 종합 테스트 결과                       ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`\n테스트 규모: ${stats.total}개 카테고리 / ${elapsed}초`);
console.log(`글자수: 평균 ${Math.round(stats.totalChars / stats.total)}자, 최소 ${stats.minChars}자, 최대 ${stats.maxChars}자`);
console.log(`\nL1별 분포:`);
for (const [l1, count] of Object.entries(stats.byL1).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${l1.padEnd(16)} ${count}개`);
}

console.log('\n────────────────────────────────────────────────────');
console.log('1. 미해결 변수 {xxx}');
console.log('────────────────────────────────────────────────────');
if (issues.unresolvedVars.length === 0) {
  console.log('  ✅ 없음');
} else {
  console.log(`  ❌ ${issues.unresolvedVars.length}건`);
  for (const item of issues.unresolvedVars.slice(0, 20)) {
    console.log(`    [${item.code}] ${item.catPath}`);
    console.log(`      상품: ${item.productName}`);
    console.log(`      미해결: ${item.vars.join(', ')}`);
  }
  if (issues.unresolvedVars.length > 20) {
    console.log(`    ... 외 ${issues.unresolvedVars.length - 20}건`);
  }
}

console.log('\n────────────────────────────────────────────────────');
console.log('2. 폼 오염 (카테고리와 맞지 않는 표현)');
console.log('────────────────────────────────────────────────────');
if (issues.formContamination.length === 0) {
  console.log('  ✅ 없음');
} else {
  console.log(`  ❌ ${issues.formContamination.length}건`);
  // L1별 집계
  const byL1 = {};
  for (const item of issues.formContamination) {
    byL1[item.l1] = (byL1[item.l1] || 0) + 1;
  }
  for (const [l1, cnt] of Object.entries(byL1).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${l1}: ${cnt}건`);
  }
  console.log('  샘플:');
  for (const item of issues.formContamination.slice(0, 15)) {
    console.log(`    [${item.code}] ${item.catPath}`);
    console.log(`      상품: ${item.productName}`);
    console.log(`      오염: ${item.label} — "${item.matches.join('", "')}"`);
  }
  if (issues.formContamination.length > 15) {
    console.log(`    ... 외 ${issues.formContamination.length - 15}건`);
  }
}

console.log('\n────────────────────────────────────────────────────');
console.log('3. 건강식품 교차 오염 (productContext 없이)');
console.log('────────────────────────────────────────────────────');
if (issues.healthCrossContam.length === 0) {
  console.log('  ✅ 교차 오염 없음');
} else {
  console.log(`  ❌ ${issues.healthCrossContam.length}개 보충제 유형에서 교차 오염 감지`);
  for (const item of issues.healthCrossContam) {
    console.log(`    ${item.supplement}: ${item.contamRate}% (${item.contamCount}/${item.totalRuns})`);
    for (const d of item.details.slice(0, 3)) {
      console.log(`      시드${d.seed}: ${d.matches.join(', ')} ${d.hasOwn ? '' : '(자기성분 없음!)'}`);
    }
  }
}

console.log('\n────────────────────────────────────────────────────');
console.log('4. 건강식품 교차 오염 (productContext 적용 후)');
console.log('────────────────────────────────────────────────────');
if (healthCrossContamWithContext.length === 0) {
  console.log('  ✅ productContext 적용 후 교차 오염 없음');
} else {
  console.log(`  ⚠️ ${healthCrossContamWithContext.length}개 보충제 유형에서 잔류 오염`);
  for (const item of healthCrossContamWithContext) {
    console.log(`    ${item.supplement}: ${item.contamRate}% (${item.contamCount}/${item.totalRuns})`);
    for (const d of item.details.slice(0, 3)) {
      console.log(`      시드${d.seed}: ${d.matches.join(', ')}`);
    }
  }
}

console.log('\n────────────────────────────────────────────────────');
console.log('5. 빈/짧은 콘텐츠');
console.log('────────────────────────────────────────────────────');
if (issues.emptyContent.length === 0) {
  console.log('  ✅ 없음');
} else {
  console.log(`  ❌ ${issues.emptyContent.length}건`);
  for (const item of issues.emptyContent.slice(0, 10)) {
    console.log(`    [${item.code}] ${item.catPath} — ${item.charCount ?? 0}자, ${item.paraCount ?? 0}문단 ${item.error ? `에러: ${item.error}` : ''}`);
  }
}

console.log('\n────────────────────────────────────────────────────');
console.log('6. 연속 공백 / 조사 오류');
console.log('────────────────────────────────────────────────────');
console.log(`  연속 공백: ${issues.doubleSpace.length}건`);
console.log(`  조사 오류: ${issues.brokenJosa.length}건`);
if (issues.brokenJosa.length > 0) {
  for (const item of issues.brokenJosa.slice(0, 5)) {
    console.log(`    [${item.code}] ${item.catPath} — "${item.sample}"`);
  }
}

// ─── 종합 판정 ──────────────────────────────────────────────
const totalIssues =
  issues.unresolvedVars.length +
  issues.formContamination.length +
  issues.emptyContent.length +
  issues.healthCrossContam.length;

console.log('\n════════════════════════════════════════════════════');
console.log('종합 판정');
console.log('════════════════════════════════════════════════════');
console.log(`  총 이슈: ${totalIssues}건 / ${stats.total}개 카테고리`);
console.log(`  이슈율: ${(totalIssues / stats.total * 100).toFixed(2)}%`);

if (totalIssues === 0) {
  console.log('  ✅ 전체 PASS — 오염 없음');
} else if (totalIssues / stats.total < 0.01) {
  console.log('  ⚠️ 거의 양호 — 0.01% 미만 이슈');
} else if (totalIssues / stats.total < 0.05) {
  console.log('  ⚠️ 주의 — 일부 카테고리 개선 필요');
} else {
  console.log('  ❌ 개선 필요 — 5% 이상 이슈 발견');
}

// productContext 효과
if (issues.healthCrossContam.length > 0 && healthCrossContamWithContext.length === 0) {
  console.log('\n  📊 productContext 효과: 건강식품 교차 오염 100% 해결');
} else if (issues.healthCrossContam.length > 0) {
  const before = issues.healthCrossContam.reduce((s, i) => s + i.contamCount, 0);
  const after = healthCrossContamWithContext.reduce((s, i) => s + i.contamCount, 0);
  const reduction = Math.round((1 - after / before) * 100);
  console.log(`\n  📊 productContext 효과: 건강식품 교차 오염 ${reduction}% 감소 (${before}→${after}건)`);
}
