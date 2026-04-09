// ============================================================
// 상품 형태 × 후기 내용 불일치 정밀 검사
//
// 실제 상품명으로 후기 생성 → 상품 형태에 맞지 않는 표현 검출
// 예: 토마토즙인데 "캡슐 삼키기 편해요", 크림인데 "맛있어요"
// ============================================================

import { generateRealReview } from './src/lib/megaload/services/real-review-composer';
import { generateStoryV2 } from './src/lib/megaload/services/story-generator';

// ─── 테스트 상품 목록 (상품 형태별) ─────────────────────────
// 각 상품에 "이 표현이 나오면 불일치"인 금지어를 지정
const TEST_PRODUCTS = [
  // === 식품: 음료/즙 ===
  { name: '유기농 토마토즙 100포', category: '식품>건강식품>건강즙/건강음료>토마토즙', form: '즙/음료',
    forbidden: ['캡슐', '알약', '삼키', '정제', '목넘김', '바르', '피부에', '얼굴', '착용', '신어', '충전'],
    expected: ['마시', '맛', '먹'] },

  { name: '제주 당근 주스 30팩', category: '식품>건강식품>건강즙/건강음료>당근주스', form: '주스',
    forbidden: ['캡슐', '알약', '삼키기', '정제', '목넘김', '바르', '피부에', '도포'],
    expected: [] },

  { name: '석류 콜라겐 젤리스틱 30포', category: '식품>건강식품>콜라겐>석류콜라겐', form: '젤리스틱',
    forbidden: ['캡슐', '알약', '정제', '바르', '피부에', '얼굴에'],
    expected: [] },

  { name: '양배추즙 100ml 50포', category: '식품>건강식품>건강즙/건강음료>양배추즙', form: '즙',
    forbidden: ['캡슐', '알약', '삼키기', '정제', '바르', '피부에', '착용'],
    expected: [] },

  // === 식품: 캡슐/알약 ===
  { name: '루테인 지아잔틴 캡슐 60정', category: '식품>건강식품>비타민/미네랄>루테인', form: '캡슐',
    forbidden: ['바르', '피부에', '얼굴', '착용', '신어', '충전', '세차'],
    expected: [] },

  { name: '비오틴 5000mcg 정제 90정', category: '식품>건강식품>비타민/미네랄>바이오틴', form: '정제',
    forbidden: ['바르', '피부에', '얼굴', '착용', '세차', '맛있'],
    expected: [] },

  // === 식품: 분말/파우더 ===
  { name: '단백질 프로틴 파우더 1kg', category: '식품>건강식품>헬스/다이어트식품>프로틴', form: '파우더',
    forbidden: ['캡슐', '알약', '삼키기', '정제', '바르', '피부에'],
    expected: [] },

  { name: '홍삼 분말 스틱 30포', category: '식품>건강식품>홍삼/인삼>홍삼', form: '분말스틱',
    forbidden: ['캡슐', '알약', '삼키기', '바르', '피부에', '착용'],
    expected: [] },

  // === 식품: 일반 식품 ===
  { name: '제주 한라봉 5kg 선물세트', category: '식품>신선식품>과일>감귤/한라봉', form: '과일',
    forbidden: ['캡슐', '알약', '삼키기', '정제', '바르', '피부에', '충전', '세차', '착용', '섭취'],
    expected: [] },

  { name: '유기농 방울토마토 2kg', category: '식품>신선식품>채소>토마토', form: '채소',
    forbidden: ['캡슐', '알약', '정제', '바르', '피부에', '충전', '착용', '섭취', '1정'],
    expected: [] },

  { name: '프리미엄 한우 등심 1kg', category: '식품>축산물>소고기>등심', form: '고기',
    forbidden: ['캡슐', '알약', '정제', '바르', '피부에', '충전', '착용', '섭취', '1정', '1포'],
    expected: [] },

  { name: '수제 쿠키 선물세트 30개입', category: '식품>간식/과자>쿠키/비스킷', form: '과자',
    forbidden: ['캡슐', '알약', '정제', '바르', '피부에', '충전', '착용', '섭취'],
    expected: [] },

  { name: '국산 잡곡 혼합 10곡 5kg', category: '식품>쌀/잡곡>잡곡', form: '잡곡',
    forbidden: ['캡슐', '알약', '정제', '바르', '피부에', '충전', '착용', '삼키'],
    expected: [] },

  // === 뷰티: 크림 ===
  { name: '히알루론산 수분크림 50ml', category: '뷰티>스킨케어>크림>수분크림', form: '크림',
    forbidden: ['맛있', '먹', '삼키', '캡슐', '알약', '착용', '신어', '충전', '세차', '조리'],
    expected: [] },

  // === 뷰티: 세럼/에센스 ===
  { name: '비타민C 세럼 30ml', category: '뷰티>스킨케어>에센스/세럼>비타민C', form: '세럼',
    forbidden: ['맛있', '먹', '삼키', '캡슐', '알약', '착용', '세차', '조리', '식감'],
    expected: [] },

  // === 뷰티: 립스틱 ===
  { name: '매트 벨벳 립스틱 3.5g', category: '뷰티>메이크업>립메이크업>립스틱', form: '립스틱',
    forbidden: ['맛있', '먹', '삼키', '캡슐', '알약', '세차', '조리', '식감'],
    expected: [] },

  // === 뷰티: 선크림 ===
  { name: '무기자차 선크림 SPF50+', category: '뷰티>스킨케어>선케어>선크림', form: '선크림',
    forbidden: ['맛있', '먹', '삼키', '캡슐', '알약', '착용', '세차', '조리', '식감'],
    expected: [] },

  // === 뷰티: 샴푸 ===
  { name: '약산성 두피 샴푸 500ml', category: '뷰티>헤어케어>샴푸>두피샴푸', form: '샴푸',
    forbidden: ['맛있', '먹', '삼키', '캡슐', '알약', '착용', '세차', '조리', '식감'],
    expected: [] },

  // === 가전: 청소기 ===
  { name: '무선 사이클론 청소기 V15', category: '가전/디지털>청소가전>무선청소기', form: '청소기',
    forbidden: ['맛있', '먹', '삼키', '캡슐', '바르', '피부', '착용', '신어', '식감'],
    expected: [] },

  // === 가전: 에어프라이어 ===
  { name: '대용량 에어프라이어 6.5L', category: '가전/디지털>주방가전>에어프라이어', form: '에어프라이어',
    forbidden: ['삼키', '캡슐', '바르', '피부에', '착용', '신어', '알약'],
    expected: [] },

  // === 패션: 원피스 ===
  { name: '플로럴 패턴 원피스 FREE', category: '패션의류잡화>여성의류>원피스', form: '의류',
    forbidden: ['맛있', '먹', '삼키', '캡슐', '바르', '피부에', '충전', '세차', '식감', '알약'],
    expected: [] },

  // === 패션: 운동화 ===
  { name: '경량 러닝화 260mm', category: '패션의류잡화>남성신발>운동화>러닝화', form: '신발',
    forbidden: ['맛있', '먹', '삼키', '캡슐', '바르', '피부에', '충전', '세차', '식감', '알약'],
    expected: [] },

  // === 가구: 매트리스 ===
  { name: '메모리폼 매트리스 퀸사이즈', category: '가구/홈데코>침대>매트리스', form: '매트리스',
    forbidden: ['맛있', '먹', '삼키', '캡슐', '바르', '피부에', '충전', '세차', '식감', '알약'],
    expected: [] },

  // === 반려: 사료 ===
  { name: '연어 홀리스틱 강아지 사료 6kg', category: '반려/애완용품>강아지>사료>건식사료', form: '반려사료',
    forbidden: ['삼키', '캡슐', '바르', '피부에', '충전', '세차', '착용', '알약'],
    expected: [] },

  // === 출산: 기저귀 ===
  { name: '유기농 순면 팬티형 기저귀 대형', category: '출산/유아동>기저귀>팬티형기저귀', form: '기저귀',
    forbidden: ['맛있', '먹', '삼키', '캡슐', '바르', '식감', '알약', '섭취', '먹여'],
    expected: [] },

  // === 출산: 분유 ===
  { name: '산양 분유 1단계 800g', category: '출산/유아동>분유/이유식>분유', form: '분유',
    forbidden: ['캡슐', '알약', '바르', '피부에', '충전', '세차', '착용'],
    expected: [] },

  // === 자동차: 워셔액 ===
  { name: '사계절 워셔액 1.8L', category: '자동차용품>세차용품>워셔액', form: '워셔액',
    forbidden: ['맛있', '먹', '삼키', '캡슐', '바르', '피부에', '착용', '식감', '알약'],
    expected: [] },

  // === 주방: 프라이팬 ===
  { name: '티타늄코팅 프라이팬 28cm', category: '주방용품>조리도구>프라이팬', form: '프라이팬',
    forbidden: ['맛있', '먹', '삼키', '캡슐', '바르', '피부에', '착용', '식감', '알약', '충전'],
    expected: [] },

  // === 스포츠: 골프채 ===
  { name: '카본 드라이버 10.5도', category: '스포츠/레져>골프>드라이버', form: '골프채',
    forbidden: ['맛있', '먹', '삼키', '캡슐', '바르', '피부에', '식감', '알약', '충전'],
    expected: [] },

  // === 문구: 볼펜 ===
  { name: '프리미엄 만년필 세트', category: '문구/오피스>필기도구>만년필', form: '필기구',
    forbidden: ['맛있', '먹', '삼키', '캡슐', '바르', '피부에', '착용', '식감', '알약', '충전', '세차'],
    expected: [] },

  // === 완구: 레고 ===
  { name: '테크닉 레고 블록 1500피스', category: '완구/취미>레고/블록>테크닉', form: '블록완구',
    forbidden: ['맛있', '먹', '삼키', '캡슐', '바르', '피부에', '식감', '알약', '세차'],
    expected: [] },
];

// ─── 다양한 시드로 반복 테스트 ──────────────────────────────
const SEEDS = [
  'seller-001', 'seller-002', 'seller-003', 'seller-004', 'seller-005',
  'seller-006', 'seller-007', 'seller-008', 'seller-009', 'seller-010',
  'test-2024-a', 'test-2024-b', 'test-2024-c', 'test-2024-d', 'test-2024-e',
  'mega-s1', 'mega-s2', 'mega-s3', 'mega-s4', 'mega-s5',
];

console.log('='.repeat(70));
console.log('  상품 형태 × 후기 내용 불일치 정밀 검사');
console.log('='.repeat(70));
console.log(`\n상품 ${TEST_PRODUCTS.length}개 × 시드 ${SEEDS.length}개 = 총 ${TEST_PRODUCTS.length * SEEDS.length}건 검사\n`);

let totalTests = 0;
let totalMismatches = 0;
const mismatchDetails = [];

for (const product of TEST_PRODUCTS) {
  let productMismatches = 0;

  for (let seedIdx = 0; seedIdx < SEEDS.length; seedIdx++) {
    const seed = SEEDS[seedIdx];

    // generateRealReview 테스트
    const review = generateRealReview(product.name, product.category, seed, seedIdx);
    const fullText = review.paragraphs.join(' ');
    totalTests++;

    // generateStoryV2 테스트 (변수 치환 포함)
    const story = generateStoryV2(product.name, product.category, seed, seedIdx);
    const storyText = [...story.paragraphs, ...(story.reviewTexts || [])].join(' ');
    const combinedText = fullText + ' ' + storyText;

    // 금지어 검사
    const foundForbidden = [];
    for (const term of product.forbidden) {
      // 정규식: 단어 단위가 아닌, 부분 문자열 매칭
      const regex = new RegExp(term, 'g');
      const matches = combinedText.match(regex);
      if (matches) {
        foundForbidden.push({ term, count: matches.length });
      }
    }

    if (foundForbidden.length > 0) {
      productMismatches++;
      totalMismatches++;

      mismatchDetails.push({
        product: product.name,
        form: product.form,
        category: product.category,
        seed,
        seedIdx,
        frame: review.frameId,
        forbidden: foundForbidden,
        textPreview: fullText.substring(0, 300),
        fullText,
      });
    }
  }

  const status = productMismatches === 0 ? '✅' : `❌ ${productMismatches}/${SEEDS.length}건`;
  console.log(`  ${status}  [${product.form}] ${product.name}`);
}

// ─── 결과 출력 ──────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('  상세 결과');
console.log('='.repeat(70));

console.log(`\n총 검사: ${totalTests}건`);
console.log(`불일치: ${totalMismatches}건 (${(totalMismatches / totalTests * 100).toFixed(1)}%)\n`);

if (mismatchDetails.length > 0) {
  // 상품별 그룹핑
  const byProduct = {};
  for (const m of mismatchDetails) {
    const key = `${m.form}|${m.product}`;
    if (!byProduct[key]) byProduct[key] = { ...m, allForbidden: {}, count: 0, frames: new Set() };
    byProduct[key].count++;
    byProduct[key].frames.add(m.frame);
    for (const f of m.forbidden) {
      byProduct[key].allForbidden[f.term] = (byProduct[key].allForbidden[f.term] || 0) + f.count;
    }
  }

  console.log('--- 상품별 불일치 요약 ---\n');
  const sorted = Object.values(byProduct).sort((a, b) => b.count - a.count);

  for (const item of sorted) {
    console.log(`❌ [${item.form}] ${item.product}`);
    console.log(`   카테고리: ${item.category}`);
    console.log(`   발생: ${item.count}/${SEEDS.length}건 (${(item.count / SEEDS.length * 100).toFixed(0)}%)`);
    console.log(`   프레임: ${[...item.frames].join(', ')}`);
    console.log(`   금지어 발견:`);
    for (const [term, count] of Object.entries(item.allForbidden).sort((a, b) => b[1] - a[1])) {
      console.log(`     "${term}": ${count}회`);
    }
    console.log('');
  }

  // 가장 빈번한 금지어
  console.log('--- 금지어 빈도 TOP 20 ---\n');
  const termFreq = {};
  for (const m of mismatchDetails) {
    for (const f of m.forbidden) {
      termFreq[f.term] = (termFreq[f.term] || 0) + f.count;
    }
  }
  Object.entries(termFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([term, count]) => console.log(`  "${term}": ${count}회`));

  // 불일치 샘플 출력 (상위 10건)
  console.log('\n--- 불일치 샘플 (상위 10건) ---\n');
  mismatchDetails.slice(0, 10).forEach((m, i) => {
    console.log(`[${i + 1}] ${m.product} (${m.form}) — seed: ${m.seed}, frame: ${m.frame}`);
    console.log(`    금지어: ${m.forbidden.map(f => `"${f.term}"×${f.count}`).join(', ')}`);
    console.log(`    후기:`);
    // 금지어 위치를 하이라이트하여 표시
    let highlighted = m.fullText;
    for (const f of m.forbidden) {
      highlighted = highlighted.replace(new RegExp(f.term, 'g'), `【${f.term}】`);
    }
    // 금지어 포함된 문장만 출력
    const sentences = highlighted.split(/[.!?。]\s*/);
    const relevantSentences = sentences.filter(s => s.includes('【'));
    relevantSentences.forEach(s => console.log(`    → "${s.trim()}"`));
    console.log('');
  });
} else {
  console.log('✅ 모든 상품에서 불일치 없음!');
}

// ─── 종합 판정 ──────────────────────────────────────────────
console.log('='.repeat(70));
console.log('  종합 판정');
console.log('='.repeat(70));

const mismatchRate = totalMismatches / totalTests * 100;
if (mismatchRate === 0) {
  console.log('\n  ✅ 전체 PASS — 상품 형태와 후기 내용 완전 일치');
} else if (mismatchRate < 5) {
  console.log(`\n  ⚠️ 경미한 불일치 ${mismatchRate.toFixed(1)}% — 수정 권장`);
} else if (mismatchRate < 20) {
  console.log(`\n  ❌ 불일치 ${mismatchRate.toFixed(1)}% — 수정 필요`);
} else {
  console.log(`\n  🚨 심각한 불일치 ${mismatchRate.toFixed(1)}% — 즉시 수정 필요`);
}
console.log('');
