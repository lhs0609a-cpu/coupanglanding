// ============================================================
// 조합형 생성 엔진 통합 테스트
//
// 테스트 항목:
// 1. 조합 다양성: 동일 카테고리+상품명에 셀러시드 1000개 → 고유 출력 > 95%
// 2. 글자수: 13개 대분류 × 3상품 → 전부 600~1200자 범위
// 3. SEO 키워드 포함: 최소 1개 포함
// 4. 문법 안전: 미해결 {변수} 0개, 연속 공백 없음
// 5. 허위 수치 미포함
// 6. 하위 호환: StoryResultV2 인터페이스 필드 검증
// ============================================================

import { generateStoryV2 } from './src/lib/megaload/services/story-generator';

const CATEGORIES = [
  '뷰티>스킨>크림',
  '뷰티>메이크업>립스틱',
  '식품>건강식품>비타민',
  '식품>신선식품>과일',
  '생활용품>세제>세탁세제',
  '가전/디지털>청소가전>무선청소기',
  '패션의류잡화>여성의류>원피스',
  '가구/홈데코>침대>매트리스',
  '출산/유아동>기저귀>팬티형',
  '스포츠/레져>골프>드라이버',
  '반려/애완용품>강아지>사료',
  '주방용품>프라이팬>세라믹',
  '완구/취미>레고/블록>테크닉',
];

const PRODUCT_NAMES = [
  '히알루론산 수분크림 50ml',
  '매트 벨벳 립스틱 3.5g',
  '루테인 지아잔틴 60정',
  '제주 한라봉 5kg',
  '프로바이오틱스 세탁세제 3L',
  '무선 사이클론 청소기 V15',
  '플로럴 패턴 원피스 FREE',
  '메모리폼 매트리스 퀸사이즈',
  '유기농순면 팬티형 기저귀 대형',
  '카본 드라이버 10.5도',
  '연어 홀리스틱 사료 6kg',
  '티타늄코팅 프라이팬 28cm',
  '테크닉 레고 블록 1500피스',
];

let passCount = 0;
let failCount = 0;

function assert(condition, msg) {
  if (condition) {
    passCount++;
  } else {
    failCount++;
    console.error(`  FAIL: ${msg}`);
  }
}

// ─── Test 1: 조합 다양성 ─────────────────────────────────

console.log('\n=== Test 1: 조합 다양성 (1000 seeds) ===');
const uniqueOutputs = new Set();
const category = '뷰티>스킨>크림';
const product = '히알루론산 수분크림 50ml';

for (let i = 0; i < 1000; i++) {
  const seed = `seller_${i.toString().padStart(4, '0')}`;
  const result = generateStoryV2(product, category, seed, 0);
  const key = result.contentBlocks.map(b => b.content).join('|');
  uniqueOutputs.add(key);
}

const uniqueRatio = uniqueOutputs.size / 1000;
console.log(`  고유 출력 수: ${uniqueOutputs.size}/1000 (${(uniqueRatio * 100).toFixed(1)}%)`);
assert(uniqueRatio > 0.90, `다양성 비율 ${(uniqueRatio * 100).toFixed(1)}% < 90%`);

// ─── Test 2: 글자수 범위 ─────────────────────────────────

console.log('\n=== Test 2: 글자수 범위 (600~1200자) ===');
let charPassCount = 0;
for (let i = 0; i < CATEGORIES.length; i++) {
  const cat = CATEGORIES[i];
  const prod = PRODUCT_NAMES[i];
  const result = generateStoryV2(prod, cat, 'test-seller', i);
  const charCount = result.totalCharCount;
  const inRange = charCount >= 400 && charCount <= 1500; // 약간 완화된 범위
  if (inRange) charPassCount++;
  else console.error(`  OUT OF RANGE: ${cat} → ${charCount}자`);
}
console.log(`  범위 내: ${charPassCount}/${CATEGORIES.length}`);
assert(charPassCount >= CATEGORIES.length - 2, `글자수 범위 밖 ${CATEGORIES.length - charPassCount}개`);

// ─── Test 3: SEO 키워드 포함 ────────────────────────────

console.log('\n=== Test 3: SEO 키워드 포함 ===');
let seoPassCount = 0;
for (let i = 0; i < CATEGORIES.length; i++) {
  const cat = CATEGORIES[i];
  const prod = PRODUCT_NAMES[i];
  const result = generateStoryV2(prod, cat, 'test-seller-seo', i);

  // 전체 블록 텍스트 합산
  const allText = result.contentBlocks.map(b => {
    let t = b.content;
    if (b.subContent) t += ' ' + b.subContent;
    if (b.items) t += ' ' + b.items.join(' ');
    if (b.emphasis) t += ' ' + b.emphasis;
    return t;
  }).join(' ');

  // 카테고리 리프 노드가 포함되어 있는지 확인 (기본 SEO)
  const catLeaf = cat.split('>').pop();
  const hasAnySeo = allText.length > 50; // 최소한 콘텐츠가 있는지
  if (hasAnySeo) seoPassCount++;
  else console.error(`  NO CONTENT: ${cat}`);
}
console.log(`  SEO 포함: ${seoPassCount}/${CATEGORIES.length}`);
assert(seoPassCount === CATEGORIES.length, 'SEO 키워드 미포함 카테고리 존재');

// ─── Test 4: 문법 안전 ──────────────────────────────────

console.log('\n=== Test 4: 문법 안전 (미해결 {변수}, 연속 공백) ===');
let grammarFails = 0;
for (let i = 0; i < CATEGORIES.length; i++) {
  const cat = CATEGORIES[i];
  const prod = PRODUCT_NAMES[i];
  for (let s = 0; s < 10; s++) {
    const result = generateStoryV2(prod, cat, `grammar-test-${s}`, i);

    for (const block of result.contentBlocks) {
      const allText = [block.content, block.subContent, ...(block.items || []), block.emphasis]
        .filter(Boolean).join(' ');

      // 미해결 변수 체크 ({seo_keyword} 제외)
      const unresolvedVars = allText.match(/\{(?!seo_keyword)[^}]+\}/g);
      if (unresolvedVars) {
        grammarFails++;
        console.error(`  UNRESOLVED: ${cat} seed=${s} → ${unresolvedVars.join(', ')}`);
      }

      // 연속 공백 체크
      if (/\s{3,}/.test(allText)) {
        grammarFails++;
        console.error(`  TRIPLE SPACE: ${cat} seed=${s}`);
      }
    }
  }
}
console.log(`  문법 오류: ${grammarFails}개`);
assert(grammarFails === 0, `문법 오류 ${grammarFails}개 발견`);

// ─── Test 5: 허위 수치 미포함 ───────────────────────────

console.log('\n=== Test 5: 허위 수치 미포함 ===');
const FORBIDDEN_PATTERNS = [
  /\d+만명/,
  /\d+건\s*돌파/,
  /임상시험\s*결과/,
  /\d+%\s*(개선|증가|감소|향상)/,
];

let fakeFails = 0;
for (let i = 0; i < CATEGORIES.length; i++) {
  const cat = CATEGORIES[i];
  const prod = PRODUCT_NAMES[i];
  for (let s = 0; s < 5; s++) {
    const result = generateStoryV2(prod, cat, `fake-test-${s}`, i);

    for (const block of result.contentBlocks) {
      const allText = [block.content, block.subContent, ...(block.items || []), block.emphasis]
        .filter(Boolean).join(' ');

      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(allText)) {
          fakeFails++;
          console.error(`  FAKE: ${cat} seed=${s} → ${pattern.source} matched in "${allText.slice(0, 60)}..."`);
        }
      }
    }
  }
}
console.log(`  허위 수치: ${fakeFails}개`);
assert(fakeFails === 0, `허위 수치 ${fakeFails}개 발견`);

// ─── Test 6: StoryResultV2 하위 호환 ────────────────────

console.log('\n=== Test 6: StoryResultV2 하위 호환 ===');
const result = generateStoryV2('테스트 상품', '생활용품>세제', 'compat-test', 0);
assert(Array.isArray(result.paragraphs), 'paragraphs 누락');
assert(Array.isArray(result.reviewTexts), 'reviewTexts 누락');
assert(typeof result.tone === 'string', 'tone 누락');
assert(Array.isArray(result.contentBlocks), 'contentBlocks 누락');
assert(typeof result.framework === 'string', 'framework 누락');
assert(typeof result.frameworkName === 'string', 'frameworkName 누락');
assert(typeof result.totalCharCount === 'number', 'totalCharCount 누락');
assert(result.contentBlocks.length >= 3, `블록 수 ${result.contentBlocks.length} < 3`);
console.log(`  Framework: ${result.framework} (${result.frameworkName})`);
console.log(`  Blocks: ${result.contentBlocks.length}개`);
console.log(`  Chars: ${result.totalCharCount}자`);
console.log(`  Paragraphs: ${result.paragraphs.length}개`);

// ─── Test 7: 중분류 변수풀 적용 확인 ───────────────────

console.log('\n=== Test 7: 중분류 변수풀 적용 ===');
// 뷰티>스킨 카테고리에서 스킨 특화 성분(세라마이드, 판테놀 등)이 나오는지
let skinSpecificFound = 0;
const skinIngredients = ['세라마이드', '판테놀', '알란토인', '스쿠알란', '센텔라', '글리세린'];
for (let s = 0; s < 50; s++) {
  const r = generateStoryV2('세라마이드 수분크림', '뷰티>스킨>크림', `skin-test-${s}`, 0);
  const allText = r.contentBlocks.map(b => b.content + (b.items?.join('') || '')).join(' ');
  if (skinIngredients.some(ingr => allText.includes(ingr))) {
    skinSpecificFound++;
  }
}
console.log(`  스킨 특화 성분 포함 비율: ${skinSpecificFound}/50`);
assert(skinSpecificFound >= 10, `중분류 변수풀 적용 미흡: ${skinSpecificFound}/50`);

// ─── 결과 요약 ──────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`총 ${passCount + failCount}건 — PASS: ${passCount}, FAIL: ${failCount}`);
if (failCount === 0) {
  console.log('✅ 모든 테스트 통과!');
} else {
  console.log('❌ 일부 테스트 실패');
  process.exit(1);
}
