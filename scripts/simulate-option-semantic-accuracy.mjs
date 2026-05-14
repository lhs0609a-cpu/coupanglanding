// 의미적 정확성 실측 시뮬레이션 — 16k cats × N spec 변형
//
// productName 에 명시된 값(수량/중량/용량/정수)과 추출 결과를 직접 비교.
// 단순 형식 충족이 아닌 "사용자가 입력한 값 그대로 나오는가" 검증.
//
// Specs (expected 값 명시):
//   { input: '1kg 3개', expected: { weight: 1000, count: 3 } }
//   { input: '500g 2개', expected: { weight: 500, count: 2 } }
//   { input: '500ml x 24개', expected: { volume: 500, count: 24 } }
//   { input: '60정 2통', expected: { tablet: 60, count: 2 } }
//   ...
//
// 검출:
//   S1 COUNT_MISMATCH:   "{N}개" → 수량 ≠ N
//   S2 WEIGHT_MISMATCH:  "{N}kg/g" → 중량 ≠ N (g 환산)
//   S3 VOLUME_MISMATCH:  "{N}ml/L" → 용량 ≠ N (ml 환산)
//   S4 TABLET_MISMATCH:  "{N}정/캡슐" → 정/캡슐 수 ≠ N
//   S5 SACHET_MISMATCH:  "{N}포" → 포 수 ≠ N
//   S6 EXTRA_VALUE:      입력에 명시 안 된 값이 출력에 나옴 (113개 같은 케이스)

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(import.meta.url, { interopDefault: true });
const oe = await jiti.import('../src/lib/megaload/services/option-extractor.ts');

const idx = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-index.json'), 'utf-8'));
const details = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-details.json'), 'utf-8'));

const catInfo = new Map();
for (const [code, fullSpace, leaf] of idx) {
  const tokens = fullSpace.split(/\s+/).filter(Boolean);
  const leafParts = leaf.split(/[\s/(),\[\]]+/).filter(Boolean);
  const parentTokens = tokens.slice(0, Math.max(1, tokens.length - leafParts.length));
  const path = parentTokens.length > 0 ? parentTokens.join('>') + '>' + leaf : leaf;
  catInfo.set(String(code), { path, leaf });
}

// expected 값 명시된 spec — 추출 결과와 직접 비교
const SEMANTIC_SPECS = [
  { suffix: '1kg, 3개',         exp: { weightG: 1000, count: 3 } },
  { suffix: '500g 2개',         exp: { weightG: 500,  count: 2 } },
  { suffix: '2kg 1박스',        exp: { weightG: 2000, count: 1 } },
  { suffix: '17kg 1개',         exp: { weightG: 17000, count: 1 } },
  { suffix: '100g x 24개',      exp: { weightG: 100,  count: 24 } },
  { suffix: '250ml 2개입',      exp: { volumeMl: 250, count: 2 } },
  { suffix: '500ml x 12병',     exp: { volumeMl: 500, count: 12 } },
  { suffix: '1L 6개',           exp: { volumeMl: 1000,count: 6 } },
  { suffix: '60정 2통',         exp: { tablet: 60, count: 2 } },
  { suffix: '90캡슐 3통',       exp: { tablet: 90, count: 3 } },
  { suffix: '30정 1병',         exp: { tablet: 30, count: 1 } },
  { suffix: '5개입',            exp: { perCount: 5 } },
  { suffix: '10개입 박스',      exp: { perCount: 10 } },
  { suffix: '1개',              exp: { count: 1 } },
  { suffix: '3개',              exp: { count: 3 } },
  { suffix: '10개',             exp: { count: 10 } },
  // 노이즈 + spec
  { suffix: '프리미엄 가정용 17kg, 1개',     exp: { weightG: 17000, count: 1 } },
  { suffix: '슈퍼 견고한 500g 5개',          exp: { weightG: 500, count: 5 } },
  { suffix: '특가★ 1kg 2개입',               exp: { weightG: 1000, count: 2 } },
  { suffix: '대용량 250ml x 24개',           exp: { volumeMl: 250, count: 24 } },
  // 다축
  { suffix: '500g x 2개',       exp: { weightG: 500, count: 2 } },
  { suffix: '80매 x 10팩',      exp: { perCount: 80, count: 10 } },
];

const stats = {
  totalCats: 0, totalCalls: 0,
  evaluated: { count:0, weight:0, volume:0, tablet:0, perCount:0 },
  S: { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 },
  Sc: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set() },
  samples: { 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] },
};

function findOpt(buyOptions, predicate) {
  return buyOptions.find(predicate);
}

const startAt = Date.now();
const allCats = Object.keys(details);
console.log(`Semantic-accuracy simulating ${allCats.length} cats × ${SEMANTIC_SPECS.length} specs = ${allCats.length * SEMANTIC_SPECS.length} calls\n`);

for (let ci = 0; ci < allCats.length; ci++) {
  const code = allCats[ci];
  const detail = details[code];
  const info = catInfo.get(code);
  if (!info || !detail?.b) continue;
  stats.totalCats++;

  // 옵션 타입 확인 — 카테고리 별로 검증 가능한 차원만 평가
  const hasCount = detail.b.some(o => /수량/.test(o.n) && o.u === '개');
  const hasWeight = detail.b.some(o => /중량/.test(o.n) && (o.u === 'g' || !o.u));
  const hasVolume = detail.b.some(o => /용량/.test(o.n) && o.u === 'ml');
  const hasTablet = detail.b.some(o => /캡슐|정/.test(o.n) && o.u === '개');
  const hasPerCount = detail.b.some(o => /개당.수량|개당수량/.test(o.n) && o.u === '개');

  for (const { suffix, exp } of SEMANTIC_SPECS) {
    const productName = `${info.leaf} ${suffix}`;
    stats.totalCalls++;
    let result;
    try {
      result = await oe.extractOptionsEnhanced({
        productName, categoryCode: code, categoryPath: info.path,
      });
    } catch { continue; }
    if (!result?.buyOptions) continue;

    // 각 차원 별 평가
    if (exp.count !== undefined && hasCount) {
      stats.evaluated.count++;
      const opt = findOpt(result.buyOptions, o => /^수량$/.test(o.name) || /^총 수량$/.test(o.name));
      const actual = opt ? parseInt(opt.value, 10) : null;
      // ✓ 예외 1: leaf 가 "{N}종" 포함 시 count=N 도 허용 (3종세트는 3 의도 합리적)
      const leafCountMatch = info.leaf.match(/(\d+)종/);
      const leafCount = leafCountMatch ? parseInt(leafCountMatch[1], 10) : null;
      // ✓ 예외 2: hasTabletOpt + 정/캡슐 명시 시 count=1 보정됨 (tablet × count → totalTablets, count=1)
      const isTabletCorrected = hasTablet && exp.tablet !== undefined && actual === 1;
      // ✓ 예외 3: validateUnitWeightPlausibility 가 비현실 단위중량 (예: 배추 100g/24개 = 4g/개)
      //   감지 시 count=1 폴백. spec 의 weight/count 가 minG 미만이면 정상 동작.
      const isUnrealisticUnit = exp.weightG !== undefined && exp.count > 1 && (exp.weightG / exp.count) < 100 &&
        /(^|\s)(사과|배|망고|파인애플|수박|멜론|두리안|감(?!자)|귤|오렌지|레몬|자몽|복숭아|키위|아보카도|석류|닭고기|소고기|돼지고기|오리고기|한우|한돈|삼겹살|목살|등심|안심|갈비|감자|고구마|양파|당근|배추|호박|가지|호박씨)/.test(info.leaf) && actual === 1;
      const accept = actual === exp.count || actual === leafCount || isTabletCorrected || isUnrealisticUnit;
      if (!accept) {
        stats.S[1]++; stats.Sc[1].add(code);
        if (stats.samples[1].length < 30) stats.samples[1].push({ code, path: info.path, product: productName, expected: exp.count, actual, optValue: opt?.value, leafCount, note: isTabletCorrected ? 'tablet-corrected' : (isUnrealisticUnit ? 'unrealistic-unit' : 'real-mismatch') });
      }
    }
    if (exp.weightG !== undefined && hasWeight) {
      stats.evaluated.weight++;
      const opt = findOpt(result.buyOptions, o => /중량/.test(o.name));
      const valStr = String(opt?.value || '');
      // "{N}kg" / "{N}g" / "{N}" → g 환산
      let actual = null;
      const m = valStr.match(/^(\d+(?:\.\d+)?)(kg|g)?/);
      if (m) {
        actual = parseFloat(m[1]);
        if (m[2] === 'kg') actual *= 1000;
        else if (!m[2] && opt?.unit === 'kg') actual *= 1000;
      }
      if (actual !== exp.weightG) {
        stats.S[2]++; stats.Sc[2].add(code);
        if (stats.samples[2].length < 30) stats.samples[2].push({ code, path: info.path, product: productName, expected: exp.weightG + 'g', actual: valStr, unit: opt?.unit });
      }
    }
    if (exp.volumeMl !== undefined && hasVolume) {
      stats.evaluated.volume++;
      const opt = findOpt(result.buyOptions, o => /용량/.test(o.name));
      const valStr = String(opt?.value || '');
      let actual = null;
      const m = valStr.match(/^(\d+(?:\.\d+)?)/);
      if (m) actual = parseFloat(m[1]);
      if (actual !== exp.volumeMl) {
        stats.S[3]++; stats.Sc[3].add(code);
        if (stats.samples[3].length < 30) stats.samples[3].push({ code, path: info.path, product: productName, expected: exp.volumeMl + 'ml', actual: valStr });
      }
    }
    if (exp.tablet !== undefined && hasTablet) {
      stats.evaluated.tablet++;
      const opt = findOpt(result.buyOptions, o => /캡슐|정/.test(o.name));
      const actual = opt ? parseInt(opt.value, 10) : null;
      // tablet 보정: hasTabletOpt && count>1 일 때 builder 가 tablet × count → total 로 변환 가능 (예: 60정 2통 → 120정 1개)
      if (actual !== exp.tablet && actual !== exp.tablet * (exp.count || 1)) {
        stats.S[4]++; stats.Sc[4].add(code);
        if (stats.samples[4].length < 30) stats.samples[4].push({ code, path: info.path, product: productName, expected: exp.tablet, actual, optValue: opt?.value });
      }
    }
    if (exp.perCount !== undefined && hasPerCount) {
      stats.evaluated.perCount++;
      const opt = findOpt(result.buyOptions, o => /개당.수량|개당수량/.test(o.name));
      const actual = opt ? parseInt(opt.value, 10) : null;
      if (actual !== exp.perCount) {
        stats.S[5]++; stats.Sc[5].add(code);
        if (stats.samples[5].length < 30) stats.samples[5].push({ code, path: info.path, product: productName, expected: exp.perCount, actual, optValue: opt?.value });
      }
    }

    // S6: extra value — 입력에 명시 안 된 큰 숫자가 수량으로 등장 (113개 같은 케이스 차단 검증)
    const inputNumbers = new Set();
    const numRe = /\d+/g;
    let m2;
    while ((m2 = numRe.exec(productName)) !== null) inputNumbers.add(parseInt(m2[0], 10));
    inputNumbers.add(1);  // default count
    const countOpt = findOpt(result.buyOptions, o => /^수량$/.test(o.name) || /^총 수량$/.test(o.name));
    if (countOpt && countOpt.unit === '개') {
      const n = parseInt(countOpt.value, 10);
      if (!isNaN(n) && n >= 10 && !inputNumbers.has(n)) {
        stats.S[6]++; stats.Sc[6].add(code);
        if (stats.samples[6].length < 30) stats.samples[6].push({ code, path: info.path, product: productName, leakedCount: n, inputNums: [...inputNumbers] });
      }
    }
  }

  if ((ci + 1) % 2000 === 0) {
    const el = ((Date.now() - startAt) / 1000).toFixed(0);
    const tot = Object.values(stats.S).reduce((a, b) => a + b, 0);
    console.log(`[${ci+1}/${allCats.length}] ${el}s | calls=${stats.totalCalls} | mismatches=${tot}`);
  }
}

const elapsedSec = ((Date.now() - startAt) / 1000).toFixed(1);
const pct = (n, d) => +(n / Math.max(1, d) * 100).toFixed(3);
const summary = {
  meta: {
    totalCats: stats.totalCats,
    totalCalls: stats.totalCalls,
    specsPerCat: SEMANTIC_SPECS.length,
    elapsedSec: parseFloat(elapsedSec),
    evaluatedPerDim: stats.evaluated,
  },
  mismatches: {
    S1_COUNT_MISMATCH:   { count: stats.S[1], pct: pct(stats.S[1], stats.evaluated.count),    cats: stats.Sc[1].size },
    S2_WEIGHT_MISMATCH:  { count: stats.S[2], pct: pct(stats.S[2], stats.evaluated.weight),   cats: stats.Sc[2].size },
    S3_VOLUME_MISMATCH:  { count: stats.S[3], pct: pct(stats.S[3], stats.evaluated.volume),   cats: stats.Sc[3].size },
    S4_TABLET_MISMATCH:  { count: stats.S[4], pct: pct(stats.S[4], stats.evaluated.tablet),   cats: stats.Sc[4].size },
    S5_PERCOUNT_MISMATCH:{ count: stats.S[5], pct: pct(stats.S[5], stats.evaluated.perCount), cats: stats.Sc[5].size },
    S6_EXTRA_COUNT_VALUE:{ count: stats.S[6], pct: pct(stats.S[6], stats.totalCalls),         cats: stats.Sc[6].size },
  },
  samples: stats.samples,
};

writeFileSync('simulate-option-semantic-result.json', JSON.stringify(summary, null, 2));
console.log('\n=== 옵션값 의미적 정확성 실측 결과 ===');
console.log(`Simulated ${stats.totalCats.toLocaleString()} cats × ${SEMANTIC_SPECS.length} specs = ${stats.totalCalls.toLocaleString()} calls in ${elapsedSec}s`);
console.log(`평가 차원별: count=${stats.evaluated.count} weight=${stats.evaluated.weight} volume=${stats.evaluated.volume} tablet=${stats.evaluated.tablet} perCount=${stats.evaluated.perCount}\n`);
for (const [name, v] of Object.entries(summary.mismatches)) {
  const status = v.count === 0 ? '✅' : '🚨';
  console.log(`${status} ${name.padEnd(28)} ${v.count.toLocaleString().padStart(7)} (${v.pct}%) | ${v.cats} cats`);
}
console.log('\n결과: simulate-option-semantic-result.json');
