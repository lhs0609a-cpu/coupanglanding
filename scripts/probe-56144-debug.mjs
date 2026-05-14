import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';
const jiti = createJiti(import.meta.url, { interopDefault: true });
const oe = await jiti.import('../src/lib/megaload/services/option-extractor.ts');

// 직접 extractComposite 와 extractCountRaw 확인
const name = '립앤아이리무버 100g x 24개';
console.log('Input:', name);

// 재현
function extractComposite(name) {
  const result = {};
  const wm = name.match(/(\d+(?:\.\d+)?)\s*(g|kg|KG|㎏)\s*[xX×]\s*(\d+)/i);
  if (wm) {
    let wVal = parseFloat(wm[1]);
    if (/kg/i.test(wm[2])) wVal *= 1000;
    result.weight = { value: wVal, unit: 'g' };
    result.count = parseInt(wm[3], 10);
  }
  return result;
}
const c = extractComposite(name);
console.log('composite:', c);

// 그리고 full extractor
const r = await oe.extractOptionsEnhanced({
  productName: name,
  categoryCode: '56144',
  categoryPath: '뷰티>스킨>클렌징>립앤아이리무버',
});
console.log('full result:', JSON.stringify(r, null, 2));
