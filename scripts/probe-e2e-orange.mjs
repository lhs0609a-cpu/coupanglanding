// End-to-end: extractor → builder logic 으로 attrValue 가 어떻게 생성되는지 검증
import { readFileSync } from 'fs';
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';
const jiti = createJiti(import.meta.url, { interopDefault: true });
const oe = await jiti.import('../src/lib/megaload/services/option-extractor.ts');

// 라이브 메타 (smoke 결과 직접 입력 — 빌더가 받는 입력 그대로)
const LIVE_ORANGE = [
  { n: '수량', r: true, dt: 'NUMBER', bu: '개', uu: ['개','박스','세트'], ex: 'EXPOSED', gn: 'NONE' },
  { n: '농산물 중량', r: true, dt: 'STRING', bu: '없음', uu: [], ex: 'EXPOSED', gn: 'NONE' },
];

function normalizeAttrName(name) {
  return String(name).replace(/\(택\d+\)/g, '').replace(/\s+/g, ' ').trim();
}

function buildAttrValue(opt, matchedMeta) {
  const isStringType = matchedMeta?.dt === 'STRING';
  const basicIsSentinel = matchedMeta?.bu === '없음' || matchedMeta?.bu === '없음 ';

  if (!isStringType && (opt.unit || (matchedMeta?.bu && !basicIsSentinel) || (matchedMeta?.uu && matchedMeta.uu.length > 0))) {
    const numMatch = String(opt.value).match(/(\d+(?:\.\d+)?)/);
    const numStr = numMatch ? numMatch[1] : '1';
    const usable = matchedMeta?.uu || [];
    const basic = matchedMeta?.bu || '';
    const basicIsValid = basic && !basicIsSentinel && usable.includes(basic);
    let unit = '';
    if (opt.unit && usable.includes(opt.unit)) unit = opt.unit;
    else if (opt.unit && basicIsValid && opt.unit === basic) unit = basic;
    else if (usable.length > 0) unit = usable[0];
    else if (basic && !basicIsSentinel) unit = basic;
    else if (opt.unit) unit = opt.unit;
    return unit ? `${numStr}${unit}` : numStr;
  }
  return String(opt.value);
}

const cases = [
  '오렌지 까는법 슈퍼 견고한 품격있는 가정용 저칼로리 전가족 17kg, 1개',
  '오렌지 5kg, 2개',
  '오렌지 500g, 1박스',
  '오렌지 17000g, 3개',
];

console.log('=== End-to-end (extractor → builder) for 오렌지 (59363) ===\n');
for (const pn of cases) {
  console.log('Input:', pn);
  const r = await oe.extractOptionsEnhanced({
    productName: pn,
    categoryCode: '59363',
    categoryPath: '식품>신선식품>과일류>과일>오렌지',
  });
  for (const opt of r.buyOptions) {
    const meta = LIVE_ORANGE.find(m => m.n === opt.name || normalizeAttrName(m.n) === normalizeAttrName(opt.name));
    if (!meta) { console.log(`  ${opt.name}: ❌ no live meta match`); continue; }
    const attrValue = buildAttrValue(opt, meta);
    console.log(`  ${opt.name} (live dt=${meta.dt}, bu=${meta.bu}): extractor="${opt.value}" → builder attrValue="${attrValue}"`);
  }
  console.log('');
}
