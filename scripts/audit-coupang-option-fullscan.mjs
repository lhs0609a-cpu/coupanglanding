// 1.6만 카테고리 × 다양한 spec 변형 → 쿠팡 옵션값 anomaly 전수 검증
//
// 검출 대상:
//   A. unitMissingNumeric: 옵션값이 순수 숫자(>1)인데 schema unit=undefined → 쿠팡 윙 UI "X없음" 표시 위험
//   B. unitMissingNumericWithKgGSuffix: value="17kg" 같은 단위 포함 문자열인데 schema unit=undefined → 일단 OK(free-text 수용)
//   C. valueOversized: 수량/개당수량 옵션 값이 입력 productName 의 어떤 숫자와도 일치 안 함 → 의외 값 (113 같은 거)
//   D. valueEmpty: 옵션값이 빈 문자열
//   E. valueIsTextInUnitOpt: schema unit 정의된 옵션인데 value 가 텍스트 (숫자 없음) → API 거부
//   F. valueNegativeOrZero: 옵션값 0 또는 음수
//
// 출력: audit-coupang-option-fullscan-result.json + console 요약

import { readFileSync, writeFileSync } from 'fs';
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';
const jiti = createJiti(import.meta.url, { interopDefault: true });
const oe = await jiti.import('../src/lib/megaload/services/option-extractor.ts');

const raw = JSON.parse(readFileSync('src/lib/megaload/data/coupang-cat-index.json', 'utf8'));
const details = JSON.parse(readFileSync('src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

const ALL_CATS = raw.map(([code, fullSpace, leaf, depth]) => {
  const tokens = fullSpace.split(/\s+/).filter(Boolean);
  const leafParts = leaf.split(/[\s/(),\[\]]+/).filter(Boolean);
  const parentTokens = tokens.slice(0, Math.max(1, tokens.length - leafParts.length));
  const path = parentTokens.length > 0 ? parentTokens.join('>') + '>' + leaf : leaf;
  return { code, path, leaf, depth };
});

const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const CATS = LIMIT > 0 ? ALL_CATS.slice(0, LIMIT) : ALL_CATS;

// 카테고리당 다양한 spec 입력 — leaf 명을 포함하면 leaf 가 키워드와 충돌해서 매칭이 다를 수 있어
// 일부 NOISY suffix 도 추가하여 1.6만 × N 호출 시 다양한 패턴을 cover 하도록.
const SPECS = [
  { suffix: '17kg, 1개' },
  { suffix: '500ml, 2개입' },
  { suffix: '1kg 3개입' },
  { suffix: '10개입 박스' },
  { suffix: '대용량 1박스' },
  { suffix: '60정 2통' },
  { suffix: '30포 3박스' },
  { suffix: '슈퍼 견고한 가정용 17kg, 1개' },  // bug 재현용 noisy
  { suffix: '프리미엄 100g x 24개' },
];

// optName → 의미 분류 (numeric vs text). 단위 누락 anomaly 판정에 사용.
const NUMERIC_OPT_PATTERNS = [
  /중량|무게|순중량|용량|부피|수량|개수|개입|매수|구수|길이|폭|너비|높이|지름|두께|넓이/,
  /\(g\)|\(ml\)|\(kg\)|\(개\)|\(매\)|\(cm\)|\(mm\)|\(m\)/,
];
function isNumericOpt(name) {
  return NUMERIC_OPT_PATTERNS.some(p => p.test(name));
}

const stats = {
  totalCalls: 0,
  totalCatsWithRequired: 0,
  // anomaly counts
  unitMissingNumeric: 0,           // A: schema unit=∅ AND value=순수숫자(>1) AND numeric 의미
  valueOversized: 0,               // C: 수량/개당수량 옵션값이 productName 어떤 숫자와도 불일치
  valueEmpty: 0,                   // D
  valueIsTextInUnitOpt: 0,         // E
  valueNegativeOrZero: 0,          // F
  // 카테고리 set
  unitMissingNumericCats: new Set(),
  oversizedCats: new Set(),
  // 샘플
  unitMissingNumericSamples: [],
  oversizedSamples: [],
  textInUnitSamples: [],
  // optName → unit 누락 count
  unitMissingByOptName: {},
};

function extractNumbersFrom(s) {
  const nums = [];
  const re = /\d+(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(s)) !== null) nums.push(parseFloat(m[0]));
  return nums;
}

const startedAt = Date.now();
for (let ci = 0; ci < CATS.length; ci++) {
  const cat = CATS[ci];
  const detail = details[cat.code];
  if (!detail) continue;
  const requiredOpts = (detail.b || []).filter(o => o.r);
  if (requiredOpts.length === 0) continue;
  stats.totalCatsWithRequired++;

  for (let si = 0; si < SPECS.length; si++) {
    const spec = SPECS[si];
    const productName = `${cat.leaf} ${spec.suffix}`;
    stats.totalCalls++;

    let result;
    try {
      result = await oe.extractOptionsEnhanced({
        productName,
        categoryCode: cat.code,
        categoryPath: cat.path,
      });
    } catch {
      continue;
    }
    if (!result) continue;

    const inputNumbers = new Set(extractNumbersFrom(productName));

    for (const opt of result.buyOptions) {
      const schemaOpt = (detail.b || []).find(s => s.n === opt.name);
      const schemaUnit = schemaOpt?.u;  // undefined 면 schema 에 unit 없음
      const resultValue = String(opt.value ?? '');
      const resultUnit = opt.unit;

      // F: 0/음수
      const numericVal = parseFloat(resultValue);
      if (resultValue && !isNaN(numericVal) && numericVal <= 0) {
        stats.valueNegativeOrZero++;
      }

      // D: 빈 값
      if (!resultValue) {
        stats.valueEmpty++;
        continue;
      }

      // A: 단위 누락 numeric (UI "없음" 표시 위험)
      // schema unit 미정의 + numeric 옵션명 + value 가 순수 숫자(>1) → "X없음" 표시 위험
      const valueIsPureNumber = /^\d+(?:\.\d+)?$/.test(resultValue);
      if (!schemaUnit && !resultUnit && valueIsPureNumber && parseFloat(resultValue) > 1 && isNumericOpt(opt.name)) {
        stats.unitMissingNumeric++;
        stats.unitMissingNumericCats.add(cat.code);
        stats.unitMissingByOptName[opt.name] = (stats.unitMissingByOptName[opt.name] || 0) + 1;
        if (stats.unitMissingNumericSamples.length < 80) {
          stats.unitMissingNumericSamples.push({
            code: cat.code, path: cat.path, optName: opt.name,
            product: productName, value: resultValue, unit: resultUnit ?? null,
            schemaUnit: schemaUnit ?? null,
          });
        }
      }

      // E: schema unit 있는데 value 가 숫자 변환 불가
      // (sanitize 후 number 만 남아야 정상)
      if (schemaUnit) {
        const numMatch = resultValue.match(/^(\d+(?:\.\d+)?)$/);
        if (!numMatch) {
          // 텍스트 fallback ("상세페이지 참조") 또는 "17kg" 등 단위 포함
          // 후자는 builder 가 처리 가능. 전자만 진짜 problem.
          if (!/\d/.test(resultValue) || /상세페이지|참조/.test(resultValue)) {
            stats.valueIsTextInUnitOpt++;
            if (stats.textInUnitSamples.length < 30) {
              stats.textInUnitSamples.push({
                code: cat.code, path: cat.path, optName: opt.name,
                product: productName, value: resultValue, schemaUnit,
              });
            }
          }
        }
      }

      // C: 수량/개당수량 oversized (입력에 없는 큰 숫자)
      if ((opt.name === '수량' || opt.name === '총 수량' || opt.name === '개당 수량') && opt.unit === '개') {
        const n = parseInt(resultValue, 10);
        if (!isNaN(n) && n >= 10) {
          // productName 에 그 숫자가 명시되어 있지 않으면 의외 값
          if (!inputNumbers.has(n)) {
            stats.valueOversized++;
            stats.oversizedCats.add(cat.code);
            if (stats.oversizedSamples.length < 30) {
              stats.oversizedSamples.push({
                code: cat.code, path: cat.path, optName: opt.name,
                product: productName, value: resultValue,
                inputNums: [...inputNumbers],
              });
            }
          }
        }
      }
    }
  }

  if ((ci + 1) % 2000 === 0) {
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[${ci+1}/${CATS.length}] elapsed=${elapsedSec}s | calls=${stats.totalCalls} | unitMissing=${stats.unitMissingNumeric} | oversized=${stats.valueOversized} | textInUnit=${stats.valueIsTextInUnitOpt}`);
  }
}

const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
const pct = (n, d) => +(n / Math.max(1, d) * 100).toFixed(3);

const summary = {
  meta: {
    totalCategories: CATS.length,
    totalCatsWithRequired: stats.totalCatsWithRequired,
    specsPerCategory: SPECS.length,
    totalCalls: stats.totalCalls,
    elapsedSec: parseFloat(elapsedSec),
  },
  anomalies: {
    A_unitMissingNumeric: stats.unitMissingNumeric,
    A_pct: pct(stats.unitMissingNumeric, stats.totalCalls),
    A_categoryCount: stats.unitMissingNumericCats.size,
    C_valueOversized: stats.valueOversized,
    C_pct: pct(stats.valueOversized, stats.totalCalls),
    C_categoryCount: stats.oversizedCats.size,
    D_valueEmpty: stats.valueEmpty,
    E_valueIsTextInUnitOpt: stats.valueIsTextInUnitOpt,
    F_valueNegativeOrZero: stats.valueNegativeOrZero,
  },
  unitMissingByOptName: Object.entries(stats.unitMissingByOptName).sort((a,b) => b[1]-a[1]).slice(0, 30),
  samples: {
    A_unitMissingNumeric: stats.unitMissingNumericSamples,
    C_oversized: stats.oversizedSamples,
    E_textInUnit: stats.textInUnitSamples,
  },
};

writeFileSync('audit-coupang-option-fullscan-result.json', JSON.stringify(summary, null, 2));
console.log('\n=== 쿠팡 옵션값 anomaly 전수 검증 결과 ===');
console.log(`총 ${stats.totalCalls.toLocaleString()} 호출 in ${elapsedSec}s (cats: ${stats.totalCatsWithRequired.toLocaleString()} 필수옵션 보유)`);
console.log(`A. unit 누락 numeric  (UI "X없음" 위험): ${stats.unitMissingNumeric} (${summary.anomalies.A_pct}%) | ${stats.unitMissingNumericCats.size} cats`);
console.log(`C. 수량 oversized     (입력에 없는 숫자): ${stats.valueOversized} (${summary.anomalies.C_pct}%) | ${stats.oversizedCats.size} cats`);
console.log(`D. value empty: ${stats.valueEmpty}`);
console.log(`E. schema 단위형에 텍스트 fallback: ${stats.valueIsTextInUnitOpt}`);
console.log(`F. value ≤ 0: ${stats.valueNegativeOrZero}`);
console.log(`\nA. unit 누락 옵션명 Top 15:`);
for (const [n, c] of summary.unitMissingByOptName.slice(0, 15)) console.log(`  ${n.padEnd(24)} ${c}`);
console.log('\n결과 파일: audit-coupang-option-fullscan-result.json');
