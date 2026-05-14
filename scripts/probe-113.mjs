import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';
const jiti = createJiti(import.meta.url, { interopDefault: true });
const oe = await jiti.import('../src/lib/megaload/services/option-extractor.ts');

const cases = [
  '오렌지 113개 박스',
  '오렌지 13kg 113개',
  '오렌지',
  '고당도 978C-2134718527',
  '오렌지 17kg 1개 113개',
  '오렌지 113',
  '오렌지 1.13kg, 1개',
];
for (const pn of cases) {
  const r = await oe.extractOptionsEnhanced({
    productName: pn,
    categoryCode: '59363',
    categoryPath: '식품>신선식품>과일류>과일>오렌지',
  });
  console.log(`"${pn}"`);
  for (const o of r.buyOptions) console.log(`  ${o.name}: "${o.value}"`);
}
