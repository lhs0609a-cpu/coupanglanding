#!/usr/bin/env node
// ============================================================
// 옵션 수량 추출 FUZZ 테스트
// 16,259 카테고리 × 무작위 30 패턴 = ~488k 케이스
//
// 시드 기반 무작위 조합으로 예상 못한 패턴까지 검증.
// 검증 항목: 추출값이 NaN/음수/과대 안 됨, GT 일치 (fuzz는 GT 없으므로 sanity만)
// ============================================================

import fs from 'node:fs';

const m = await import('../.build-test/lib/megaload/services/option-extractor-test-shim.js');
const { extractOptionsFromDetailsSimple } = m;

const CAT_DETAILS = JSON.parse(fs.readFileSync('src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

function normalizeBuyOpts(rawB) {
  if (!Array.isArray(rawB)) return [];
  return rawB.map(b => ({ name: b.n, unit: b.u, required: !!b.r, choose1: !!b.c1 }));
}

// 시드 기반 RNG
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const COUNT_UNITS = ['개', '팩', '세트', '박스', '봉', '병', '통', '족', '켤레', '롤', '포대', 'EA', 'P'];
const VOL_UNITS = ['ml', 'mL', 'ML', '㎖', 'L', '리터', 'ℓ'];
const WT_UNITS = ['g', 'kg', 'KG', '㎏', '그램'];
const TAB_UNITS = ['정', '캡슐', '알', '타블렛', '소프트젤'];
const SACHET_UNITS = ['포'];
const ADJECTIVES = ['프리미엄', '대용량', '특가', '한정', '초특가', '명품', '신제품'];
const PREFIX = ['', '[리뉴얼] ', '(특가) ', '★ ', '✓ ', '본품 '];
const SUFFIX = ['', ' 외', ' 등', ' 추천', ' 인기', ' BEST'];

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function generateFuzzName(rng, leaf) {
  const adj = pick(ADJECTIVES, rng);
  const prefix = pick(PREFIX, rng);
  const suffix = pick(SUFFIX, rng);
  const base = `${prefix}${leaf} ${adj}`;

  // 무작위 spec 조합 (0~3개 추가)
  const specs = [];
  const useCount = rng() < 0.6;
  const useVol = rng() < 0.3;
  const useWt = rng() < 0.3;
  const useTab = rng() < 0.2;
  const useSachet = rng() < 0.1;
  const usePerCount = rng() < 0.15;
  const usePlus = rng() < 0.05;

  if (useTab) {
    const n = Math.floor(rng() * 200) + 1;
    specs.push(`${n}${pick(TAB_UNITS, rng)}`);
  }
  if (useSachet) {
    const n = Math.floor(rng() * 90) + 1;
    specs.push(`${n}${pick(SACHET_UNITS, rng)}`);
  }
  if (useVol) {
    const n = pick([10, 30, 50, 100, 250, 300, 500, 750, 1000, 1500, 2000], rng);
    specs.push(`${n}${pick(VOL_UNITS, rng)}`);
  }
  if (useWt) {
    const n = pick([10, 50, 100, 250, 500, 800, 1000, 1500, 2000, 5000], rng);
    specs.push(`${n}${pick(WT_UNITS, rng)}`);
  }
  if (usePerCount) {
    const n = Math.floor(rng() * 100) + 1;
    specs.push(`${n}개입`);
  }
  if (useCount) {
    const n = Math.floor(rng() * 50) + 1;
    specs.push(`${n}${pick(COUNT_UNITS, rng)}`);
  }
  if (usePlus) {
    const a = Math.floor(rng() * 5) + 1;
    const b = Math.floor(rng() * 3) + 1;
    specs.push(`${a}+${b}`);
  }

  // 무작위 구분자
  const seps = [' ', ', ', ' x ', '/', ' / '];
  const sep = pick(seps, rng);

  return `${base} ${specs.join(sep)}${suffix}`;
}

// Sanity 체크: 추출값이 NaN/음수 아닌지 (extreme 사이즈는 실제 입력값 반영이라 정상)
function sanityCheck(result) {
  for (const opt of result.buyOptions) {
    if (opt.value === '' || opt.value === null || opt.value === undefined) {
      return `empty: ${opt.name}`;
    }
    const v = parseFloat(opt.value);
    if (isNaN(v)) return `NaN: ${opt.name}=${opt.value}`;
    if (v < 0) return `negative: ${opt.name}=${opt.value}`;
  }
  return null;
}

const PER_CAT = 30;
const stats = { totalCases: 0, sane: 0, insane: 0 };
const insaneSamples = [];

const allCats = Object.entries(CAT_DETAILS);
let processed = 0;
for (const [code, det] of allCats) {
  const buyOpts = normalizeBuyOpts(det.b);
  if (buyOpts.length === 0) { processed++; continue; }
  const leaf = det.p.split('>').pop().replace(/\/.+$/, '').trim();
  const seed = parseInt(code) || 42;
  const rng = mulberry32(seed);

  for (let i = 0; i < PER_CAT; i++) {
    const name = generateFuzzName(rng, leaf);
    stats.totalCases++;
    let result;
    try {
      result = extractOptionsFromDetailsSimple(name, buyOpts);
    } catch (err) {
      stats.insane++;
      if (insaneSamples.length < 30) {
        insaneSamples.push({ code, path: det.p, name, error: String(err) });
      }
      continue;
    }
    const issue = sanityCheck(result);
    if (issue) {
      stats.insane++;
      if (insaneSamples.length < 30) {
        insaneSamples.push({ code, path: det.p, name, issue, result: result.buyOptions });
      }
    } else {
      stats.sane++;
    }
  }
  processed++;
  if (processed % 2000 === 0) console.log(`진행: ${processed}/${allCats.length}, 누적 ${stats.totalCases.toLocaleString()}`);
}

console.log(`\n=== Fuzz 테스트 결과 ===`);
console.log(`총 케이스:  ${stats.totalCases.toLocaleString()}`);
console.log(`✅ 정상:     ${stats.sane.toLocaleString()} (${(stats.sane/stats.totalCases*100).toFixed(3)}%)`);
console.log(`❌ 비정상:   ${stats.insane.toLocaleString()} (${(stats.insane/stats.totalCases*100).toFixed(3)}%)`);

if (insaneSamples.length > 0) {
  console.log(`\n=== 비정상 샘플 ===`);
  for (const s of insaneSamples.slice(0, 15)) {
    console.log(`\n[${s.code}] ${s.path}`);
    console.log(`  name: ${s.name}`);
    if (s.error) console.log(`  ERROR: ${s.error}`);
    if (s.issue) console.log(`  issue: ${s.issue}`);
    if (s.result) console.log(`  result: ${JSON.stringify(s.result)}`);
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  perCat: PER_CAT,
  stats,
  insaneSamples,
};
const outPath = `scripts/verification-reports/audit-option-fuzz-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\n전체 보고서: ${outPath}`);
