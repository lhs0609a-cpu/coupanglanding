/* eslint-disable */
// SEO 키워드 풀 정제 — 카테고리별 부적합 토큰 자동 제거.
// 진단: 식품>신선식품, 뷰티, 반려 등 1,800+ 카테고리에 영양제/건기식 키워드(비오틴/콜라겐/홍삼...)
// 가 무차별 누출. SEO 적합도 하락 + 쿠팡 irrelevance penalty 위험.
//
// 룰:
//   - 카테고리 path 에 "건강식품" / "비타민" / "영양제" / "헬스" 포함 → 건기식 키워드 유지
//   - 카테고리 path 에 "신선식품" / "과일류" / "채소류" / "축산" / "수산" → 건기식 키워드 전체 제거
//   - 뷰티/반려/생활용품 등 비식품 → 건기식 키워드 전체 제거
//
// 룰 외 토큰은 보존 — 카테고리별 차별화 큐레이션(features) 그대로 유지.

const fs = require('fs');
const path = require('path');

const POOL_PATH = path.join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'seo-keyword-pools.json');

// 명시적 건강기능식품 / 영양제 키워드 (비식품 카테고리에서 제거 대상)
const HEALTH_SUPPLEMENT_TOKENS = new Set([
  '비오틴', '바이오틴', '콜라겐', '히알루론산', '홍삼', '홍삼정',
  '프로폴리스', '녹용', '오메가3', '오메가', '루테인', '글루코사민',
  '마그네슘', '아연', '셀레늄', '엽산', '철분', '칼슘',
  '비타민A', '비타민B', '비타민C', '비타민D', '비타민E', '비타민K',
  '비타민', '멀티비타민', '종합비타민', '유산균', '프로바이오틱스',
  '쏘팔메토', '코큐텐', '코엔자임', '크릴오일', '레시틴',
  '보스웰리아', '폴리코사놀', '감마리놀렌산', '초록입홍합',
  '레스베라트롤', '스피루리나', '클로렐라', '맥주효모',
  'BCAA', '크레아틴', '아르기닌', '프로틴', '타우린', '가르시니아',
  '밀크씨슬', '밀크시슬', '알로에정', '토코페롤',
]);

// 카테고리가 건기식/영양제 카테고리인지 판정
function isHealthCategory(path) {
  return /건강식품|비타민\/미네랄|영양제|건강기능식품|헬스보충식품|다이어트식품/.test(path);
}

// 카테고리가 식품 도메인인지 (가공식품/스낵 등은 일부 영양 키워드 허용 가능 — 예외 처리)
function isProcessedFoodCategory(path) {
  return /식품>가공|식품>스낵|식품>음료|식품>즉석|식품>건과/.test(path);
}

// 일반 영양 표시는 보존 (건기식 명시 아닌 일반 식품 영양정보)
const GENERAL_NUTRITION_KEEP = new Set(['단백질', '식이섬유']);

// 건기식 효능/인증 features — 신선식품(과일/채소)에는 부적합
// (체력/면역/피로회복 같은 효능 표현은 식약처 광고법상 식품에 사용 불가)
const HEALTH_EFFICACY_FEATURES = new Set([
  '체력', '면역', '피로회복', '다이어트', '저칼로리', '보충',
  '활력', '에너지', '수면개선', '스트레스완화', '근육이완',
  '혈관건강', '심장건강', '간건강', '장건강', '뼈건강',
  '항산화', '주름개선', '미백', '탄력', '피부건강',
  'HACCP', 'GMP', 'ISO',  // 인증은 가공식품에는 적합하나 신선식품에는 보통 미적용
]);

function isFreshFoodCategory(path) {
  return /식품>신선식품/.test(path);
}

// 식품 sub-도메인 키워드 — 다른 sub-도메인에 leak 되면 부적합
const FOOD_DOMAIN_KEYWORDS = {
  fruit: ['과일', '과일류'],
  veg: ['채소', '채소류'],
  livestock: ['한우', '한돈', '닭고기', '돼지고기', '소고기', '축산'],
  seafood: ['수산', '생선', '회', '해산물'],
  grain: ['쌀', '잡곡', '곡물', '현미', '백미'],
  nuts: ['견과류', '견과', '아몬드'],
  health: ['홍삼', '인삼'],
};

/**
 * 카테고리 path 의 식품 sub-도메인 판정.
 * 그 외 sub-도메인 키워드는 ingredients/features 풀에서 제거 대상.
 */
function detectFoodSubDomain(path) {
  if (/과일류|>과일/.test(path)) return 'fruit';
  if (/채소류|>채소/.test(path)) return 'veg';
  if (/축산|>한우|>한돈|>닭고기|>돼지고기|>소고기/.test(path)) return 'livestock';
  if (/수산|생선|회|해산물/.test(path)) return 'seafood';
  if (/곡물|>쌀|>잡곡|>현미/.test(path)) return 'grain';
  if (/견과/.test(path)) return 'nuts';
  return null;
}

const data = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
const cp = data.categoryPools;
let totalRemoved = 0;
let categoriesAffected = 0;

for (const [path, pool] of Object.entries(cp)) {
  // 1차: 건기식 키워드 제거 (비건기식 카테고리)
  const isHealth = isHealthCategory(path);
  const subDomain = detectFoodSubDomain(path);
  // 다른 식품 sub-도메인 키워드 셋 빌드 — 본인 도메인 외 모두 제거 대상
  const crossFoodTokens = new Set();
  if (subDomain) {
    for (const [d, tokens] of Object.entries(FOOD_DOMAIN_KEYWORDS)) {
      if (d === subDomain) continue;
      for (const t of tokens) crossFoodTokens.add(t);
    }
  }

  const isFresh = isFreshFoodCategory(path);
  const filterTok = (tok) => {
    if (GENERAL_NUTRITION_KEEP.has(tok)) return true;
    if (!isHealth && HEALTH_SUPPLEMENT_TOKENS.has(tok)) return false;
    if (subDomain && crossFoodTokens.has(tok)) return false;
    // 신선식품에는 건기식 효능/인증 features 부적합 — 식약처 광고법상 식품 효능 표현 불가
    if (isFresh && HEALTH_EFFICACY_FEATURES.has(tok)) return false;
    return true;
  };

  const ingredients = pool.ingredients || [];
  const ingFiltered = ingredients.filter(filterTok);
  if (ingredients.length !== ingFiltered.length) {
    pool.ingredients = ingFiltered;
    totalRemoved += ingredients.length - ingFiltered.length;
    categoriesAffected++;
  }

  const features = pool.features || [];
  const featFiltered = features.filter(filterTok);
  if (features.length !== featFiltered.length) {
    pool.features = featFiltered;
    totalRemoved += features.length - featFiltered.length;
  }
}

// 변경된 데이터 _comment 에 정제 메타 추가
data._sanitizedAt = new Date().toISOString();
data._sanitizeNote = `Cross-category 건기식 키워드 제거: ${categoriesAffected}개 카테고리에서 ${totalRemoved}개 토큰 제거`;

fs.writeFileSync(POOL_PATH, JSON.stringify(data, null, 2), 'utf8');
console.log(`✓ 정제 완료: ${categoriesAffected}개 카테고리, ${totalRemoved}개 토큰 제거`);

// 검증: 자몽 / 사과 카테고리 풀 확인
const verify = ['식품>신선식품>과일류>과일>자몽', '식품>신선식품>과일류>과일>사과', '식품>건강식품>비타민/미네랄>바이오틴'];
for (const p of verify) {
  const pool = cp[p];
  if (!pool) continue;
  console.log(`\n[${p}]`);
  console.log(`  ingredients: ${JSON.stringify(pool.ingredients)}`);
}
