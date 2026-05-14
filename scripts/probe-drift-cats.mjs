// 이전에 schema drift 였던 cat 들이 regen 후 정상 동작하는지 sanity check
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';
const jiti = createJiti(import.meta.url, { interopDefault: true });
const oe = await jiti.import('../src/lib/megaload/services/option-extractor.ts');

const cases = [
  { code: '64478', leaf: '샤워가운', product: '샤워가운 L사이즈 핑크 1개 면 100%' },
  { code: '81660', leaf: '복싱복', product: '복싱복 XL 검정 1개' },
  { code: '63317', leaf: '창문형 에어컨', product: '창문형 에어컨 10평 SAC-12B 모델' },
  { code: '62886', leaf: '노트북', product: '노트북 16GB RAM 1TB SSD 윈도우11 블랙' },
  { code: '56196', leaf: '선블록', product: '선블록 50ml 1개 SPF50' },
];
for (const c of cases) {
  console.log(`\n=== ${c.code} ${c.leaf} ===`);
  console.log(`Input: ${c.product}`);
  const r = await oe.extractOptionsEnhanced({ productName: c.product, categoryCode: c.code, categoryPath: c.leaf });
  for (const o of r.buyOptions) {
    console.log(`  ${o.name}: "${o.value}" (unit=${o.unit ?? '∅'})`);
  }
  if (r.warnings.length > 0) console.log(`  warnings: ${r.warnings.join('; ')}`);
}
