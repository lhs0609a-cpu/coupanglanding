/**
 * diversity-test-100x1000.mjs
 *
 * 1단계: 16,259 카테고리 × 100명 셀러 (전수 측정, 약 35분)
 * 2단계: worst 카테고리 100개 × 1,000명 셀러 (focused, 약 1분)
 *
 * 1,000명 동일 상품 등록 시 노출명 충돌 정량화 → 아이템위너 묶임 위험 측정.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dn = await import('../.build-test/lib/megaload/services/display-name-generator.js');
const { generateDisplayName } = dn;

const COUPANG_DETAILS_PATH = join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-details.json');
const OUT_PATH = join(__dirname, 'diversity-100x1000-result.json');

const coupangDetails = JSON.parse(readFileSync(COUPANG_DETAILS_PATH, 'utf8'));
const allCats = [];
for (const [, v] of Object.entries(coupangDetails)) {
  if (v && v.p) {
    const segs = v.p.split('>');
    allCats.push({ path: v.p, leaf: segs[segs.length - 1] });
  }
}
console.log(`총 카테고리: ${allCats.length}`);

// ─── 1단계: 16K × 100명 ─────────────────────────────────
const SELLER_100 = Array.from({ length: 100 }, (_, i) => `seller-${(i + 1).toString().padStart(4, '0')}`);

console.log(`\n1단계: ${allCats.length} 카테고리 × 100명 셀러 = ${(allCats.length * 100 / 1000000).toFixed(2)}M 노출명`);

const stats100 = {
  totalCats: 0,
  uniqueDistribution: {
    '100 (완전다양)': 0,
    '90-99': 0,
    '70-89': 0,
    '50-69': 0,
    '30-49': 0,
    '10-29': 0,
    '2-9': 0,
    '1 (모두동일)': 0,
  },
  uniqueSum: 0,
  perfectCases: 0,
  worstCats: [], // unique <= 50 → 1000명 테스트 대상
};

const start1 = Date.now();
let processed = 0;

for (const { path, leaf } of allCats) {
  stats100.totalCats++;
  const leafBase = leaf.replace(/\/.+$/, '').trim() || leaf;
  const input = `${leafBase} 프리미엄 100g`;
  const brand = '리셀러';

  const displayNames = new Set();
  for (let i = 0; i < SELLER_100.length; i++) {
    let dn;
    try {
      dn = generateDisplayName(input, brand, path, SELLER_100[i], 0);
    } catch {
      continue;
    }
    if (dn) displayNames.add(dn);
  }

  const uniqueCount = displayNames.size;
  stats100.uniqueSum += uniqueCount;

  if (uniqueCount === 100) { stats100.uniqueDistribution['100 (완전다양)']++; stats100.perfectCases++; }
  else if (uniqueCount >= 90) stats100.uniqueDistribution['90-99']++;
  else if (uniqueCount >= 70) stats100.uniqueDistribution['70-89']++;
  else if (uniqueCount >= 50) stats100.uniqueDistribution['50-69']++;
  else if (uniqueCount >= 30) stats100.uniqueDistribution['30-49']++;
  else if (uniqueCount >= 10) stats100.uniqueDistribution['10-29']++;
  else if (uniqueCount >= 2) stats100.uniqueDistribution['2-9']++;
  else stats100.uniqueDistribution['1 (모두동일)']++;

  // unique <= 50 → 1000명 테스트 대상
  if (uniqueCount <= 50) {
    stats100.worstCats.push({ path, leaf, unique100: uniqueCount });
  }

  processed++;
  if (processed % 2000 === 0) {
    const elapsed = ((Date.now() - start1) / 1000).toFixed(0);
    const rate = (processed / parseFloat(elapsed)).toFixed(0);
    console.log(`  [${processed}/${allCats.length}] ${rate}/s · ${elapsed}s`);
  }
}

const elapsed1 = ((Date.now() - start1) / 1000).toFixed(0);
const avg100 = stats100.uniqueSum / stats100.totalCats;

console.log(`\n=== 1단계 결과 (100명 셀러) ===`);
console.log(`경과: ${elapsed1}s`);
console.log(`평균 unique: ${avg100.toFixed(2)} / 100 (${(avg100 / 100 * 100).toFixed(2)}%)`);
console.log(`완전 다양 (100/100): ${stats100.perfectCases.toLocaleString()} / ${stats100.totalCats.toLocaleString()} (${(stats100.perfectCases / stats100.totalCats * 100).toFixed(2)}%)`);
console.log(`Unique 50 이하 worst: ${stats100.worstCats.length}개`);

console.log('\n--- 분포 ---');
for (const [bucket, count] of Object.entries(stats100.uniqueDistribution)) {
  const pct = (count / stats100.totalCats * 100).toFixed(2);
  const bar = '█'.repeat(Math.round(parseFloat(pct) / 2));
  console.log(`  ${bucket.padEnd(15)}: ${count.toString().padStart(6)} (${pct}%) ${bar}`);
}

// ─── 2단계: worst 카테고리 × 1,000명 ─────────────────────────
const WORST_TARGETS = stats100.worstCats.slice(0, 100);
const SELLER_1000 = Array.from({ length: 1000 }, (_, i) => `seller-${(i + 1).toString().padStart(5, '0')}`);

console.log(`\n2단계: 1단계 worst ${WORST_TARGETS.length}개 카테고리 × 1,000명 셀러`);

const stats1000 = {
  perfectCases: 0,  // 1000/1000 unique
  total: 0,
  results: [],
};

const start2 = Date.now();

for (const { path, leaf, unique100 } of WORST_TARGETS) {
  stats1000.total++;
  const leafBase = leaf.replace(/\/.+$/, '').trim() || leaf;
  const input = `${leafBase} 프리미엄 100g`;
  const brand = '리셀러';

  const displayNames = new Set();
  for (let i = 0; i < SELLER_1000.length; i++) {
    let dn;
    try {
      dn = generateDisplayName(input, brand, path, SELLER_1000[i], 0);
    } catch {
      continue;
    }
    if (dn) displayNames.add(dn);
  }

  const uniqueCount = displayNames.size;
  if (uniqueCount === 1000) stats1000.perfectCases++;
  stats1000.results.push({
    path,
    unique100,
    unique1000: uniqueCount,
    sample: [...displayNames].slice(0, 2),
  });
}

const elapsed2 = ((Date.now() - start2) / 1000).toFixed(0);

console.log(`\n=== 2단계 결과 (worst ${WORST_TARGETS.length}개 × 1,000명) ===`);
console.log(`경과: ${elapsed2}s`);
console.log(`완전 다양 (1000/1000): ${stats1000.perfectCases} / ${stats1000.total}`);

// worst 5
const worstSorted = stats1000.results.sort((a, b) => a.unique1000 - b.unique1000);
console.log('\n--- 1000명 중 unique 가장 적은 worst 10 ---');
for (const w of worstSorted.slice(0, 10)) {
  console.log(`  unique ${w.unique1000.toString().padStart(4)}/1000 · ${w.path}`);
  for (const s of w.sample) console.log(`     "${s}"`);
}

writeFileSync(OUT_PATH, JSON.stringify({ stats100, stats1000 }, null, 0));
console.log(`\n결과 저장: ${OUT_PATH}`);
