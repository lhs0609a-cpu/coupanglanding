// 16k 카테고리 옵션 추출 vs 라이브 쿠팡 API 비교 audit (v2)
//
// 라이브 API 의 attributeTypeName/dataType/basicUnit/usableUnits/attributeValueList/groupNumber 와
// 옵션 추출기 + coupang-product-builder 의 결과를 대조해 anomaly 를 분류한다.
//
// 핵심 차이점 vs v1:
//   - groupNumber 기반 택1 그룹 처리 (그룹 내 1개 이상 채워지면 satisfied)
//   - REQUIRED_MISSING 은 진짜 누락(어떤 alias 도 매칭 안됨) 만 카운트
//   - STRING dataType + basicUnit "없음" sentinel 처리 검증
//   - NUMBER value 형식 검증 (숫자+유효단위)

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(import.meta.url, { interopDefault: true });
const oe = await jiti.import('../src/lib/megaload/services/option-extractor.ts');

const idx = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-index.json'), 'utf-8'));
const details = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-details.json'), 'utf-8'));

const CACHE_DIR = join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'cache');
const liveMeta = {};
let totalCachedCats = 0;
let totalErrorCats = 0;
for (let s = 0; s < 10; s++) {
  const f = join(CACHE_DIR, `live-attr-meta-shard${String(s).padStart(2, '0')}.json`);
  if (!existsSync(f)) continue;
  const data = JSON.parse(readFileSync(f, 'utf-8'));
  for (const [code, val] of Object.entries(data)) {
    if (val.attrs) { liveMeta[code] = val.attrs; totalCachedCats++; }
    else if (val.error) totalErrorCats++;
  }
}
console.log(`Live API meta cache: ok=${totalCachedCats}, err=${totalErrorCats}`);

const catInfo = new Map();
for (const [code, fullSpace, leaf] of idx) {
  const tokens = fullSpace.split(/\s+/).filter(Boolean);
  const leafParts = leaf.split(/[\s/(),\[\]]+/).filter(Boolean);
  const parentTokens = tokens.slice(0, Math.max(1, tokens.length - leafParts.length));
  const path = parentTokens.length > 0 ? parentTokens.join('>') + '>' + leaf : leaf;
  catInfo.set(String(code), { path, leaf });
}

// 다양한 spec — bug 재현 / 다축 케이스 커버
const SPECS = [
  '17kg, 1개',
  '500ml, 2개입',
  '1kg 3개입',
  '10개입 박스',
  '60정 2통',
  '30포 3박스',
  '슈퍼 견고한 가정용 17kg, 1개',
  '프리미엄 100g x 24개',
  '대용량 200ml x 12개',
];

// Builder logic reproduction
function normalizeAttrName(name) {
  return String(name).replace(/\(택\d+\)/g, '').replace(/\s+/g, ' ').trim();
}

function buildAttrValueLikeBuilder(opt, matchedMeta) {
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

function matchMeta(optName, liveAttrs, alreadyMatched = new Set()) {
  if (!liveAttrs) return null;
  let m = liveAttrs.find(a => a.n === optName);
  if (m) return m;
  const norm = normalizeAttrName(optName);
  m = liveAttrs.find(a => normalizeAttrName(a.n) === norm);
  if (m) return m;
  // suffix 매칭 (builder 와 동일 로직): EXPOSED + 끝부분 일치 + 단일 후보 + 미점유.
  const suffixCandidates = liveAttrs.filter(a =>
    a.ex === 'EXPOSED'
    && !alreadyMatched.has(a.n)
    && normalizeAttrName(a.n).endsWith(' ' + norm)
  );
  if (suffixCandidates.length === 1) return suffixCandidates[0];
  return null;
}

// 카테고리별 groupNumber 그룹 추출 (live API)
function getExposedGroups(liveAttrs) {
  const groups = new Map(); // gn -> { attrs: [...], required: bool }
  for (const a of liveAttrs) {
    if (a.ex !== 'EXPOSED') continue;
    if (!a.gn || a.gn === 'NONE') {
      // Independent (not in choose1 group)
      groups.set(`__indep__${a.n}`, { attrs: [a], required: a.r, isChoose1: false });
    } else {
      const existing = groups.get(a.gn) || { attrs: [], required: false, isChoose1: true };
      existing.attrs.push(a);
      if (a.r) existing.required = true;
      groups.set(a.gn, existing);
    }
  }
  return groups;
}

const stats = {
  totalCats: 0,
  totalCalls: 0,
  totalAttrsChecked: 0,
  totalRequiredGroups: 0,
  bugs: {
    A_STRING_UNIT_SENTINEL: 0,           // STRING + value ends with "없음"
    B_NUMBER_NO_UNIT: 0,                 // NUMBER + value lacks unit
    C_NUMBER_INVALID_UNIT: 0,            // NUMBER + value has unit not in usable
    D_ENUM_INVALID: 0,                   // ENUM + value not in enum
    E_REQUIRED_GROUP_UNFILLED: 0,        // required group (choose1 or single) not filled by extractor
    F_VALUE_EMPTY: 0,
    G_VALUE_TOO_LONG: 0,
    H_NUMBER_ZERO_OR_NEG: 0,
    I_NAME_MISMATCH: 0,                  // extracted opt.name not in live attrs
  },
  bugCats: {
    A: new Set(), B: new Set(), C: new Set(), D: new Set(),
    E: new Set(), F: new Set(), G: new Set(), H: new Set(), I: new Set(),
  },
  samples: {
    A: [], B: [], C: [], D: [], E: [], F: [], G: [], H: [], I: [],
  },
};

const startAt = Date.now();
const allCats = Object.keys(liveMeta);
console.log(`Auditing ${allCats.length} cats × ${SPECS.length} specs\n`);

for (let ci = 0; ci < allCats.length; ci++) {
  const code = allCats[ci];
  const live = liveMeta[code];
  const info = catInfo.get(code);
  if (!info || !live) continue;
  stats.totalCats++;

  const groups = getExposedGroups(live);
  const requiredGroups = [...groups.values()].filter(g => g.required);
  stats.totalRequiredGroups += requiredGroups.length;

  for (const suffix of SPECS) {
    const productName = `${info.leaf} ${suffix}`;
    stats.totalCalls++;
    let result;
    try {
      result = await oe.extractOptionsEnhanced({
        productName,
        categoryCode: code,
        categoryPath: info.path,
      });
    } catch { continue; }
    if (!result || !result.buyOptions) continue;

    // 추출된 각 buyOption 의 값 형식 검증
    const filledLiveAttrs = new Set();
    for (const opt of result.buyOptions) {
      stats.totalAttrsChecked++;
      const matched = matchMeta(opt.name, live, filledLiveAttrs);

      if (!matched) {
        stats.bugs.I_NAME_MISMATCH++;
        stats.bugCats.I.add(code);
        if (stats.samples.I.length < 30) {
          stats.samples.I.push({ code, path: info.path, optName: opt.name, value: opt.value, liveAttrNames: live.map(a => a.n).slice(0, 8) });
        }
        continue;
      }

      filledLiveAttrs.add(matched.n);
      const attrValue = buildAttrValueLikeBuilder(opt, matched);

      if (!attrValue || attrValue === '') {
        stats.bugs.F_VALUE_EMPTY++;
        stats.bugCats.F.add(code);
        if (stats.samples.F.length < 30) stats.samples.F.push({ code, path: info.path, optName: opt.name });
        continue;
      }

      if (attrValue.length > 50) {
        stats.bugs.G_VALUE_TOO_LONG++;
        stats.bugCats.G.add(code);
        if (stats.samples.G.length < 20) stats.samples.G.push({ code, path: info.path, optName: opt.name, attrValue, length: attrValue.length });
      }

      const basicIsSentinel = matched.bu === '없음' || matched.bu === '없음 ';

      // A: STRING + value ends with "없음" sentinel
      if (matched.dt === 'STRING' && basicIsSentinel) {
        if (attrValue.endsWith('없음')) {
          stats.bugs.A_STRING_UNIT_SENTINEL++;
          stats.bugCats.A.add(code);
          if (stats.samples.A.length < 30) stats.samples.A.push({ code, path: info.path, optName: opt.name, attrValue, product: productName });
        }
      }

      // B/C: NUMBER value 형식 검증
      if (matched.dt === 'NUMBER') {
        const usable = matched.uu || [];
        const validUnits = [...usable];
        if (matched.bu && !basicIsSentinel && !validUnits.includes(matched.bu)) validUnits.push(matched.bu);

        const unitMatch = attrValue.match(/^(\d+(?:\.\d+)?)(.*)$/);
        if (unitMatch) {
          const numericPart = unitMatch[1];
          const tailUnit = unitMatch[2].trim();

          if (validUnits.length > 0) {
            if (!tailUnit) {
              stats.bugs.B_NUMBER_NO_UNIT++;
              stats.bugCats.B.add(code);
              if (stats.samples.B.length < 30) stats.samples.B.push({ code, path: info.path, optName: opt.name, attrValue, validUnits });
            } else if (!validUnits.includes(tailUnit)) {
              stats.bugs.C_NUMBER_INVALID_UNIT++;
              stats.bugCats.C.add(code);
              if (stats.samples.C.length < 30) stats.samples.C.push({ code, path: info.path, optName: opt.name, attrValue, tailUnit, validUnits });
            }
          }

          const n = parseFloat(numericPart);
          if (!isNaN(n) && n <= 0) {
            stats.bugs.H_NUMBER_ZERO_OR_NEG++;
            stats.bugCats.H.add(code);
            if (stats.samples.H.length < 20) stats.samples.H.push({ code, path: info.path, optName: opt.name, attrValue });
          }
        }
      }

      // D: ENUM validation (attributeValueList non-empty)
      if (matched.vs && matched.vs.length > 0) {
        if (!matched.vs.includes(attrValue)) {
          // builder 가 폴백을 ENUM[0] 으로 강제하므로 critical 아니지만 추출 정확도 측면에서 카운트
          stats.bugs.D_ENUM_INVALID++;
          stats.bugCats.D.add(code);
          if (stats.samples.D.length < 20) stats.samples.D.push({ code, path: info.path, optName: opt.name, attrValue, enumOptions: matched.vs.slice(0, 5) });
        }
      }
    }

    // E: required group 미충족 (그룹 내 어떤 attr 도 filledLiveAttrs 에 없음)
    for (const group of requiredGroups) {
      const groupFilled = group.attrs.some(a => filledLiveAttrs.has(a.n));
      if (!groupFilled) {
        stats.bugs.E_REQUIRED_GROUP_UNFILLED++;
        stats.bugCats.E.add(code);
        if (stats.samples.E.length < 30) {
          stats.samples.E.push({
            code, path: info.path,
            groupAttrs: group.attrs.map(a => ({ n: a.n, dt: a.dt, bu: a.bu })),
            isChoose1: group.isChoose1,
            extractedNames: result.buyOptions.map(o => o.name),
          });
        }
      }
    }
  }

  if ((ci + 1) % 1500 === 0) {
    const el = ((Date.now() - startAt) / 1000).toFixed(0);
    const tot = Object.values(stats.bugs).reduce((a, b) => a + b, 0);
    console.log(`[${ci+1}/${allCats.length}] ${el}s | calls=${stats.totalCalls} | attrs=${stats.totalAttrsChecked} | bugs=${tot}`);
  }
}

const elapsedSec = ((Date.now() - startAt) / 1000).toFixed(1);
const pct = (n, d) => +(n / Math.max(1, d) * 100).toFixed(3);
const summary = {
  meta: {
    cachedCats: totalCachedCats,
    erroredCats: totalErrorCats,
    auditedCats: stats.totalCats,
    totalCalls: stats.totalCalls,
    totalAttrsChecked: stats.totalAttrsChecked,
    totalRequiredGroups: stats.totalRequiredGroups,
    elapsedSec: parseFloat(elapsedSec),
  },
  bugs: Object.fromEntries(Object.entries(stats.bugs).map(([k, v]) => [k, {
    count: v,
    pct: pct(v, k === 'E_REQUIRED_GROUP_UNFILLED' ? stats.totalRequiredGroups : stats.totalAttrsChecked),
    catCount: stats.bugCats[k.split('_')[0]].size,
  }])),
  samples: stats.samples,
};

writeFileSync('audit-live-api-comparison-result.json', JSON.stringify(summary, null, 2));
console.log('\n=== 라이브 쿠팡 API 비교 audit (v2) 결과 ===');
console.log(`Audited ${stats.totalCats.toLocaleString()} cats × ${SPECS.length} specs = ${stats.totalCalls.toLocaleString()} extractions in ${elapsedSec}s`);
console.log(`Attrs checked: ${stats.totalAttrsChecked.toLocaleString()} | Required groups: ${stats.totalRequiredGroups.toLocaleString()}\n`);
for (const [bug, v] of Object.entries(summary.bugs)) {
  const status = v.count === 0 ? '✅' : '🚨';
  console.log(`${status} ${bug.padEnd(28)} ${v.count.toLocaleString().padStart(7)} (${v.pct}%) | ${v.catCount} cats`);
}
console.log('\n결과: audit-live-api-comparison-result.json');
