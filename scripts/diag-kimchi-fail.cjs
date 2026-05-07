/* eslint-disable */
const matcher = require('../.test-out/src/lib/megaload/services/category-matcher.js');

// 셀러가 김치 카테고리에서 흔히 사용하는 상품명 패턴 시뮬레이션
const cases = [
  // 단순 leaf 이름 (그대로 매칭 기대)
  '동치미',
  '백김치',
  '알타리 김치',
  '부추김치 1kg',
  // 잘 매칭되는 패턴 (control)
  '오재롬 갓김치 5kg',
  '국산 묵은지 3kg',
  '엄마손 총각김치',
  // 셀러 변형
  '국산 신선 동치미',  // leaf "물김치/동치미" 슬래시 처리 필요
  '오재롬 동치미 시원한',
  '한정수량 묵은지 농장직송',
  '진짜 알타리무 김치',
  '시원한 백김치 어른용',  // 백김치 leaf 없음
  '오이소박이 1kg 국산 신선',
  '깻잎김치 농가직송',  // 깻잎김치 leaf 없음 (양파/파/부추김치 매핑?)
  '파김치 5kg',  // leaf "양파/파/부추김치"
  '5152084088',  // 코드만 (셀러 brand+code)
  '국산 5152084088',  // brand+code
  '오재롬 묵은지',
  '진짜 묵은지 국산 5kg',
  '풍부한 양념의 깍두기 1kg',
];

(async () => {
  let pass = 0, fail = 0;
  for (const name of cases) {
    const r = await matcher.matchCategory(name);
    if (r) { pass++; console.log(`✅ ${name}\n     → ${r.categoryCode} ${r.categoryName} (${r.confidence}, ${r.source})`); }
    else { fail++; console.log(`❌ ${name}\n     → NULL`); }
  }
  console.log(`\nResult: ${pass} pass / ${fail} fail (총 ${cases.length})`);
})();
