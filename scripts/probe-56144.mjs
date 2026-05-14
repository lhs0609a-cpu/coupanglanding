import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';
const jiti = createJiti(import.meta.url, { interopDefault: true });
const oe = await jiti.import('../src/lib/megaload/services/option-extractor.ts');

const cases = [
  ['립앤아이리무버 100g x 24개', '56144', '뷰티>스킨>클렌징>립앤아이리무버'],
  ['립앤아이리무버 3개', '56144', '뷰티>스킨>클렌징>립앤아이리무버'],
  ['립앤아이리무버 10개', '56144', '뷰티>스킨>클렌징>립앤아이리무버'],
  ['3종 세트 250ml 2개입', '56179', '뷰티>스킨>기초세트>3종 세트'],
  ['3종 세트 1kg 2개입', '56179', '뷰티>스킨>기초세트>3종 세트'],
];
for (const [pn, code, path] of cases) {
  console.log('---');
  console.log('Input:', pn);
  const r = await oe.extractOptionsEnhanced({ productName: pn, categoryCode: code, categoryPath: path });
  for (const o of r.buyOptions) console.log(`  ${o.name}: "${o.value}" (unit=${o.unit ?? '∅'})`);
  console.log('  totalUnitCount:', r.totalUnitCount);
}
