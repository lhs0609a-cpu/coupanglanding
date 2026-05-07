/* eslint-disable */
// 매칭 실패 케이스 진단
const matcher = require('../.test-out/src/lib/megaload/services/category-matcher.js');

const failedNames = [
  '국산 재료만 사용된 순도 100% 갓김치 갓김치 갓김치 갓김치',
  '부일갓김치 진짜 우리 갓김치',
];

const successNames = [
  '30년 전통 손맛 갓김치 1kg',
  '경자네 정통 묵은 갓김치',
  '여수 돌산 갓김치 농가직송',
  '나래식품 갓김치 5kg',
];

(async () => {
  console.log('=== FAILED ===');
  for (const name of failedNames) {
    const r = await matcher.matchCategory(name);
    console.log(`name: ${name}`);
    console.log(`  result:`, r ? `${r.categoryCode} (${r.categoryName}) confidence=${r.confidence} source=${r.source}` : 'NULL');
  }
  console.log('\n=== SUCCESS (control) ===');
  for (const name of successNames) {
    const r = await matcher.matchCategory(name);
    console.log(`name: ${name}`);
    console.log(`  result:`, r ? `${r.categoryCode} (${r.categoryName}) confidence=${r.confidence} source=${r.source}` : 'NULL');
  }
})();
