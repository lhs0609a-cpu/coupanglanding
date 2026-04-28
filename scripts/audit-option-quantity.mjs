#!/usr/bin/env node
// ============================================================
// 옵션 수량 추출 정확도 전수조사
// 16,259 카테고리 × 20 가상 상품 = ~325k 케이스
//
// 각 케이스: 의도된 정답(ground truth) 수량 vs 시스템 추출값
// 불일치를 카테고리별/패턴별로 군집화
// ============================================================

import fs from 'node:fs';

const m = await import('../.build-test/lib/megaload/services/option-extractor-test-shim.js');
const { extractOptionsFromDetailsSimple } = m;

const CAT_DETAILS = JSON.parse(fs.readFileSync('src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

// 카테고리의 buyOpts 정규화 (b → {name, unit, required, choose1})
function normalizeBuyOpts(rawB) {
  if (!Array.isArray(rawB)) return [];
  return rawB.map(b => ({
    name: b.n,
    unit: b.u,
    required: !!b.r,
    choose1: !!b.c1,
  }));
}

// 카테고리가 어떤 옵션 타입을 가지는지 분류 (unit 기준 — 추출 로직과 일치)
function classifyCategory(buyOpts) {
  return {
    hasCount: buyOpts.some(o => (o.name === '수량' || o.name === '총 수량') && o.unit === '개'),
    hasPerCount: buyOpts.some(o => o.name.includes('수량') && o.name !== '수량' && o.name !== '총 수량' && o.unit === '개'),
    hasVolume: buyOpts.some(o => o.name.includes('용량') && o.unit === 'ml'),
    hasWeight: buyOpts.some(o => o.name.includes('중량') && o.unit === 'g'),
    hasWeightUnitless: buyOpts.some(o => o.name.includes('중량') && !o.unit), // 농산물 중량 등
    hasTablet: buyOpts.some(o => (o.name.includes('캡슐') || o.name.includes('정')) && o.unit === '개'),
    buyOpts,
  };
}

// 가상 상품명 생성 + 정답 (ground truth)
// label: 케이스 식별용
function makeTestCases(catPath, cls) {
  const cases = [];
  const leaf = catPath.split('>').pop().replace(/\/.+$/, '').trim();
  const pn = `${leaf} 프리미엄`; // 상품명 prefix

  // 수량 패턴 (모든 카테고리에 적용 가능)
  if (cls.hasCount) {
    cases.push({ label: 'count_1개', name: `${pn} 1개`, gt: { count: 1 } });
    cases.push({ label: 'count_2개', name: `${pn}, 2개`, gt: { count: 2 } });
    cases.push({ label: 'count_3팩', name: `${pn} 3팩`, gt: { count: 3 } });
    cases.push({ label: 'count_5세트', name: `${pn} 5세트`, gt: { count: 5 } });
    cases.push({ label: 'count_1박스', name: `${pn} 1박스`, gt: { count: 1 } });
    cases.push({ label: 'plus_1+1', name: `${pn} 1+1`, gt: { count: 2 } });
    cases.push({ label: 'plus_2+1', name: `${pn} 2+1`, gt: { count: 3 } });
  }

  // 용량 패턴 (unit='ml' 옵션이 있을 때)
  if (cls.hasVolume) {
    cases.push({ label: 'vol_500ml', name: `${pn} 500ml`, gt: { volume: 500 } });
    cases.push({ label: 'vol_1L', name: `${pn} 1L`, gt: { volume: 1000 } });
    if (cls.hasCount) {
      cases.push({ label: 'vol_x3', name: `${pn} 500ml x 3개`, gt: { volume: 500, count: 3 } });
    }
  }

  // 중량 패턴 (unit='g' 옵션이 있을 때)
  if (cls.hasWeight) {
    cases.push({ label: 'wt_500g', name: `${pn} 500g`, gt: { weight: 500 } });
    cases.push({ label: 'wt_1.5kg', name: `${pn} 1.5kg`, gt: { weight: 1500 } });
    if (cls.hasCount) {
      cases.push({ label: 'wt_x2', name: `${pn} 500g x 2팩`, gt: { weight: 500, count: 2 } });
      cases.push({ label: 'wt_135g_1개', name: `${pn} 135g 1개`, gt: { weight: 135, count: 1 } });
      // ★ 사용자 신고 케이스: "1개입, 2개" 파싱
      const gt = { weight: 135, count: 2 };
      if (cls.hasPerCount) gt.perCount = 1;
      cases.push({ label: 'wt_1개입_2개', name: `${pn} 135g 1개입, 2개`, gt });
    }
  }

  // 캡슐/정 패턴 (count 옵션이 있을 때만 count GT 적용)
  if (cls.hasTablet) {
    cases.push({ label: 'tab_60정', name: `${pn} 60정`, gt: cls.hasCount ? { tablet: 60, count: 1 } : { tablet: 60 } });
    cases.push({ label: 'tab_60캡슐_2병', name: `${pn} 60캡슐 2병`, gt: cls.hasCount ? { tablet: 120, count: 1 } : { tablet: 60 } });
    cases.push({ label: 'tab_30포_3개', name: `${pn} 30포 3개`, gt: cls.hasCount ? { tablet: 30, count: 3 } : { tablet: 30 } });
    cases.push({ label: 'tab_dosage', name: `${pn} 60캡슐 1일 2정`, gt: cls.hasCount ? { tablet: 60, count: 1 } : { tablet: 60 } });
  }

  // 개당 수량 (개입)
  if (cls.hasPerCount) {
    if (cls.hasCount) {
      cases.push({ label: 'per_100매_5팩', name: `${pn} 100매 x 5팩`, gt: { perCount: 100, count: 5 } });
      cases.push({ label: 'per_2개입_3팩', name: `${pn} 2개입 x 3팩`, gt: { perCount: 2, count: 3 } });
    } else {
      cases.push({ label: 'per_100매', name: `${pn} 100매`, gt: { perCount: 100 } });
    }
  }

  return cases;
}

// 추출 결과를 GT 형식으로 변환
function resultToCheck(result) {
  const out = {};
  for (const o of result.buyOptions) {
    const n = o.name;
    if (n === '수량' || n === '총 수량') out.count = parseInt(o.value);
    else if (n.includes('수량') && n !== '수량') out.perCount = parseInt(o.value);
    else if (n.includes('용량')) out.volume = parseFloat(o.value);
    else if (n.includes('중량')) out.weight = parseFloat(o.value);
    else if (n.includes('캡슐') || n.includes('정')) out.tablet = parseInt(o.value);
  }
  return out;
}

// 검증: GT vs 추출 일치 여부
function compare(gt, actual) {
  const fails = [];
  for (const k of Object.keys(gt)) {
    if (gt[k] !== actual[k]) {
      fails.push(`${k}: 정답=${gt[k]}, 추출=${actual[k] ?? 'null'}`);
    }
  }
  return fails;
}

const stats = {
  totalCases: 0,
  passed: 0,
  failed: 0,
  noBuyOpts: 0,
};
const failsByLabel = {};
const sampleFails = [];

let processed = 0;
for (const [code, det] of Object.entries(CAT_DETAILS)) {
  const buyOpts = normalizeBuyOpts(det.b);
  if (buyOpts.length === 0) {
    stats.noBuyOpts++;
    processed++;
    continue;
  }
  const cls = classifyCategory(buyOpts);
  const cases = makeTestCases(det.p, cls);
  if (cases.length === 0) { processed++; continue; }

  for (const c of cases) {
    stats.totalCases++;
    const r = extractOptionsFromDetailsSimple(c.name, buyOpts);
    const actual = resultToCheck(r);
    const fails = compare(c.gt, actual);
    if (fails.length === 0) {
      stats.passed++;
    } else {
      stats.failed++;
      failsByLabel[c.label] = (failsByLabel[c.label] || 0) + 1;
      // 각 라벨별 최소 1개 샘플 보장
      const labelSeen = sampleFails.filter(s => s.label === c.label).length;
      if (sampleFails.length < 500 || labelSeen < 3) {
        sampleFails.push({
          code, path: det.p, label: c.label, name: c.name, gt: c.gt, actual, fails,
          buyOpts: buyOpts.map(o => `${o.name}${o.unit ? `(${o.unit})` : ''}${o.choose1 ? '#c1' : ''}${o.required ? '*' : ''}`).join(', '),
        });
      }
    }
  }
  processed++;
  if (processed % 2000 === 0) console.log(`진행: ${processed}/${Object.keys(CAT_DETAILS).length}`);
}

console.log(`\n=== 결과 ===`);
console.log(`buyOpts 없는 카테고리:  ${stats.noBuyOpts}`);
console.log(`총 검증 케이스:         ${stats.totalCases}`);
console.log(`✅ 통과:                ${stats.passed} (${(stats.passed/stats.totalCases*100).toFixed(2)}%)`);
console.log(`❌ 실패:                ${stats.failed} (${(stats.failed/stats.totalCases*100).toFixed(2)}%)`);

console.log(`\n=== 실패 패턴별 카운트 ===`);
const sorted = Object.entries(failsByLabel).sort((a,b) => b[1] - a[1]);
for (const [label, n] of sorted) {
  console.log(`  ${label.padEnd(25)} ${n}`);
}

console.log(`\n=== 실패 샘플 (각 패턴 첫 케이스) ===`);
const seen = new Set();
for (const f of sampleFails) {
  if (seen.has(f.label)) continue;
  seen.add(f.label);
  console.log(`\n[${f.label}] ${f.path}`);
  console.log(`  buyOpts: ${f.buyOpts}`);
  console.log(`  name:    ${f.name}`);
  console.log(`  gt:      ${JSON.stringify(f.gt)}`);
  console.log(`  actual:  ${JSON.stringify(f.actual)}`);
  console.log(`  fails:   ${f.fails.join('; ')}`);
}

const out = {
  generatedAt: new Date().toISOString(),
  stats,
  failsByLabel,
  sampleFails,
};
const outPath = `scripts/verification-reports/audit-option-quantity-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\n전체 보고서: ${outPath}`);
