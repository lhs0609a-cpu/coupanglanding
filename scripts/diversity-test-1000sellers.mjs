/**
 * diversity-test-1000sellers.mjs
 *
 * 16,259 카테고리 × 같은 상품 × 1,000명 셀러 = 16,259,000개 노출명.
 * 카테고리당 unique 노출명 비율 측정.
 *
 * 1,000명이 동일 상품 등록할 때 노출명이 모두 다른지 검증 → 아이템위너 묶임 방지.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dn = await import('../.build-test/lib/megaload/services/display-name-generator.js');
const { generateDisplayName } = dn;

const COUPANG_DETAILS_PATH = join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-details.json');
const OUT_PATH = join(__dirname, 'diversity-1000-result.json');

const SELLER_COUNT = 1000;

const coupangDetails = JSON.parse(readFileSync(COUPANG_DETAILS_PATH, 'utf8'));
const allCats = [];
for (const [, v] of Object.entries(coupangDetails)) {
  if (v && v.p) {
    const segs = v.p.split('>');
    allCats.push({ path: v.p, leaf: segs[segs.length - 1] });
  }
}
console.log(`총 카테고리: ${allCats.length}`);
console.log(`테스트: 같은 상품 × ${SELLER_COUNT}명 셀러 → 노출명 ${(allCats.length * SELLER_COUNT / 1000000).toFixed(1)}M개\n`);

// 1,000명 셀러 시드
const SELLER_SEEDS = Array.from({ length: SELLER_COUNT }, (_, i) => `seller-${(i + 1).toString().padStart(4, '0')}`);

const stats = {
  totalCats: 0,
  uniqueDistribution: {
    '1000 (완전다양)': 0,
    '900-999': 0,
    '700-899': 0,
    '500-699': 0,
    '300-499': 0,
    '100-299': 0,
    '30-99': 0,
    '10-29': 0,
    '2-9': 0,
    '1 (모두동일)': 0,
  },
  uniqueSum: 0,
  perfectCases: 0,
  worstCases: [],
};

const start = Date.now();
let processed = 0;

for (const { path, leaf } of allCats) {
  stats.totalCats++;
  const leafBase = leaf.replace(/\/.+$/, '').trim() || leaf;
  const input = `${leafBase} 프리미엄 100g`;
  const brand = '리셀러';

  const displayNames = new Set();
  for (let i = 0; i < SELLER_SEEDS.length; i++) {
    let dn;
    try {
      dn = generateDisplayName(input, brand, path, SELLER_SEEDS[i], 0);
    } catch {
      continue;
    }
    if (dn) displayNames.add(dn);
  }

  const uniqueCount = displayNames.size;
  stats.uniqueSum += uniqueCount;

  if (uniqueCount === SELLER_COUNT) { stats.uniqueDistribution['1000 (완전다양)']++; stats.perfectCases++; }
  else if (uniqueCount >= 900) stats.uniqueDistribution['900-999']++;
  else if (uniqueCount >= 700) stats.uniqueDistribution['700-899']++;
  else if (uniqueCount >= 500) stats.uniqueDistribution['500-699']++;
  else if (uniqueCount >= 300) stats.uniqueDistribution['300-499']++;
  else if (uniqueCount >= 100) stats.uniqueDistribution['100-299']++;
  else if (uniqueCount >= 30) stats.uniqueDistribution['30-99']++;
  else if (uniqueCount >= 10) stats.uniqueDistribution['10-29']++;
  else if (uniqueCount >= 2) stats.uniqueDistribution['2-9']++;
  else stats.uniqueDistribution['1 (모두동일)']++;

  if (uniqueCount <= 50 && stats.worstCases.length < 30) {
    stats.worstCases.push({
      path,
      uniqueCount,
      samples: [...displayNames].slice(0, 3),
    });
  }

  processed++;
  if (processed % 1000 === 0) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    const rate = (processed / parseFloat(elapsed)).toFixed(1);
    const eta = ((allCats.length - processed) / parseFloat(rate)).toFixed(0);
    console.log(`  [${processed}/${allCats.length}] ${rate}/s · 경과 ${elapsed}s · 잔여 ~${eta}s`);
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(0);
const avgUnique = stats.uniqueSum / stats.totalCats;

console.log(`\n총 처리: ${processed} 카테고리 · ${(processed * SELLER_COUNT).toLocaleString()}개 노출명 · ${elapsed}s`);

console.log('\n=== 1,000명 셀러 다양성 측정 ===');
console.log(`평균 unique 노출명 (1,000개 중): ${avgUnique.toFixed(1)} / 1,000 (${(avgUnique / SELLER_COUNT * 100).toFixed(2)}%)`);
console.log(`완전 다양 (1,000/1,000 unique): ${stats.perfectCases.toLocaleString()} / ${stats.totalCats.toLocaleString()} (${(stats.perfectCases / stats.totalCats * 100).toFixed(2)}%)`);

console.log('\n=== Unique 분포 ===');
for (const [bucket, count] of Object.entries(stats.uniqueDistribution)) {
  const pct = (count / stats.totalCats * 100).toFixed(2);
  const bar = '█'.repeat(Math.round(parseFloat(pct) / 2));
  console.log(`  ${bucket.padEnd(15)}: ${count.toString().padStart(6)} (${pct}%) ${bar}`);
}

if (stats.worstCases.length > 0) {
  console.log(`\n=== Unique 50 이하 worst 5 ===`);
  const sortedWorst = stats.worstCases.sort((a, b) => a.uniqueCount - b.uniqueCount);
  for (const w of sortedWorst.slice(0, 5)) {
    console.log(`\n  📂 ${w.path}`);
    console.log(`     unique: ${w.uniqueCount}/1000`);
    for (const s of w.samples) console.log(`       - "${s}"`);
  }
}

writeFileSync(OUT_PATH, JSON.stringify(stats, null, 0));
console.log(`\n결과 저장: ${OUT_PATH}`);
