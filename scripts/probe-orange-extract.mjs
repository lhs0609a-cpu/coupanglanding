import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';
const jiti = createJiti(import.meta.url, { interopDefault: true });
const oe = await jiti.import('../src/lib/megaload/services/option-extractor.ts');

const cases = [
  '오렌지 까는법 슈퍼 견고한 품격있는 가정용 저칼로리 전가족 17kg, 1개',
  '오렌지 17kg 1개 박스',
  '오렌지 5kg, 1개',
  '오렌지',
];

for (const pn of cases) {
  console.log('=====');
  console.log('input:', pn);
  const r = await oe.extractOptionsEnhanced({
    productName: pn,
    categoryCode: '59363',
    categoryPath: '식품>신선식품>과일류>과일>오렌지',
  });
  for (const o of r.buyOptions) {
    console.log(`  ${o.name}: value="${o.value}", unit="${o.unit ?? '∅'}"`);
  }
  console.log('  warnings:', r.warnings);
  console.log('  totalUnitCount:', r.totalUnitCount);
}
