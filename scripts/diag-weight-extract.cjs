/* eslint-disable */
// 옵션 weight 추출 진단
const ext = require('../.test-out/src/lib/megaload/services/option-extractor.js');
const det = require('../src/lib/megaload/data/coupang-cat-details.json');

const cases = [
  '종가집 갓김치 남녀노소 황제 돌산 5kg 1개',
  '갓김치 5kg',
  '오재롬 갓김치 5kg 1개',
  '5kg 갓김치 1개',
  '갓김치 5kg 1팩',
  '갓김치 5kg 가족용',
  '돌산 갓김치 5kg',
  '황제 갓김치 5kg 1박스',
];

const kimchiDetails = { buyOptions: det['58442'].b.map(o => ({ name: o.n, unit: o.u, required: o.r })) };
console.log('갓김치 buyOptions:', JSON.stringify(kimchiDetails));
console.log('');

for (const name of cases) {
  const r = ext.extractOptionsFromDetails(name, kimchiDetails);
  console.log(`"${name}"`);
  console.log('  → buyOptions:', JSON.stringify(r.buyOptions));
  console.log('  → totalUnitCount:', r.totalUnitCount);
  if (r.warnings && r.warnings.length) console.log('  → warnings:', r.warnings);
  console.log('');
}
