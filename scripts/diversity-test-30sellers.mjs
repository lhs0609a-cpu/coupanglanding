/**
 * diversity-test-30sellers.mjs
 *
 * 16,259 카테고리 × 같은 상품명 × 30명 셀러 시드 → 30개 노출명 생성.
 * 각 카테고리에서 30개 중 unique 개수 측정.
 *
 * unique=30이면 완전 다양 (모든 셀러가 다른 노출명)
 * unique<30이면 일부 중복 (아이템위너 묶임 위험)
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dn = await import('../.build-test/lib/megaload/services/display-name-generator.js');
const { generateDisplayName } = dn;

const COUPANG_DETAILS_PATH = join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-details.json');
const OUT_PATH = join(__dirname, 'diversity-test-result.json');

const coupangDetails = JSON.parse(readFileSync(COUPANG_DETAILS_PATH, 'utf8'));
const allCats = [];
for (const [, v] of Object.entries(coupangDetails)) {
  if (v && v.p) {
    const segs = v.p.split('>');
    allCats.push({ path: v.p, leaf: segs[segs.length - 1] });
  }
}
console.log(`총 카테고리: ${allCats.length}`);
console.log('테스트: 같은 상품 × 30명 다른 셀러 → 노출명이 30개 모두 다른지 측정\n');

// 30명 셀러 시드 (실제 셀러 ID 시뮬레이션)
const SELLER_SEEDS = Array.from({ length: 30 }, (_, i) => `seller-${(i + 1).toString().padStart(3, '0')}`);

// 셀러간 평균 토큰 jaccard 유사도
function jaccardSimilarity(setA, setB) {
  const intersection = [...setA].filter(x => setB.has(x));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.length / union.size : 0;
}

const stats = {
  totalCats: 0,
  uniqueDistribution: { '30 (완전다양)': 0, '25-29': 0, '20-24': 0, '15-19': 0, '10-14': 0, '5-9': 0, '2-4': 0, '1 (모두동일)': 0 },
  uniqueSum: 0,
  jaccardSum: 0,
  worstCases: [], // unique <= 5
  perfectCases: 0, // unique = 30
};

const start = Date.now();
let processed = 0;

for (const { path, leaf } of allCats) {
  stats.totalCats++;
  const segs = path.split('>');
  const leafBase = leaf.replace(/\/.+$/, '').trim() || leaf;

  // 같은 상품 입력 (모든 셀러 동일)
  const input = `${leafBase} 프리미엄 100g`;
  const brand = '리셀러';

  const displayNames = new Set();
  const tokenSets = [];
  for (let i = 0; i < SELLER_SEEDS.length; i++) {
    let dn;
    try {
      dn = generateDisplayName(input, brand, path, SELLER_SEEDS[i], 0);
    } catch {
      continue;
    }
    if (!dn) continue;
    displayNames.add(dn);
    tokenSets.push(new Set(dn.toLowerCase().split(/\s+/).filter(t => t.length >= 2)));
  }

  const uniqueCount = displayNames.size;
  stats.uniqueSum += uniqueCount;

  // jaccard 평균 (셀러 쌍별)
  let pairCount = 0, jaccardSum = 0;
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      jaccardSum += jaccardSimilarity(tokenSets[i], tokenSets[j]);
      pairCount++;
    }
  }
  const avgJaccard = pairCount > 0 ? jaccardSum / pairCount : 0;
  stats.jaccardSum += avgJaccard;

  // 분포 카운트
  if (uniqueCount === 30) { stats.uniqueDistribution['30 (완전다양)']++; stats.perfectCases++; }
  else if (uniqueCount >= 25) stats.uniqueDistribution['25-29']++;
  else if (uniqueCount >= 20) stats.uniqueDistribution['20-24']++;
  else if (uniqueCount >= 15) stats.uniqueDistribution['15-19']++;
  else if (uniqueCount >= 10) stats.uniqueDistribution['10-14']++;
  else if (uniqueCount >= 5) stats.uniqueDistribution['5-9']++;
  else if (uniqueCount >= 2) stats.uniqueDistribution['2-4']++;
  else stats.uniqueDistribution['1 (모두동일)']++;

  // worst case 수집
  if (uniqueCount <= 5 && stats.worstCases.length < 30) {
    stats.worstCases.push({
      path,
      uniqueCount,
      avgJaccard: avgJaccard.toFixed(3),
      samples: [...displayNames].slice(0, 3),
    });
  }

  processed++;
  if (processed % 2000 === 0) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    const rate = (processed / parseFloat(elapsed)).toFixed(0);
    console.log(`  [${processed}/${allCats.length}] ${rate}/s`);
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(0);
const avgUnique = stats.uniqueSum / stats.totalCats;
const avgJaccard = stats.jaccardSum / stats.totalCats;

console.log(`\n총 처리: ${processed} 카테고리 · ${elapsed}s`);
console.log(`(테스트: 같은 상품 × 30명 셀러 → ${(processed * 30).toLocaleString()}개 노출명 생성)`);

console.log('\n=== 다양성 측정 결과 ===');
console.log(`평균 unique 노출명 수 (30개 중): ${avgUnique.toFixed(2)} / 30 (${(avgUnique / 30 * 100).toFixed(1)}%)`);
console.log(`평균 셀러간 토큰 유사도 (낮을수록 좋음): ${avgJaccard.toFixed(3)} (1.0=완전동일)`);
console.log(`완전 다양 카테고리 (30/30 unique): ${stats.perfectCases.toLocaleString()} / ${stats.totalCats.toLocaleString()} (${(stats.perfectCases / stats.totalCats * 100).toFixed(2)}%)`);

console.log('\n=== Unique 노출명 분포 ===');
for (const [bucket, count] of Object.entries(stats.uniqueDistribution)) {
  const pct = (count / stats.totalCats * 100).toFixed(2);
  const bar = '█'.repeat(Math.round(parseFloat(pct) / 2));
  console.log(`  ${bucket.padEnd(15)}: ${count.toString().padStart(6)} (${pct}%) ${bar}`);
}

if (stats.worstCases.length > 0) {
  console.log(`\n=== 다양성 낮은 카테고리 worst ${Math.min(stats.worstCases.length, 5)} ===`);
  const sortedWorst = stats.worstCases.sort((a, b) => a.uniqueCount - b.uniqueCount);
  for (const w of sortedWorst.slice(0, 5)) {
    console.log(`\n  📂 ${w.path}`);
    console.log(`     unique: ${w.uniqueCount}/30 · jaccard: ${w.avgJaccard}`);
    console.log(`     sample 노출명:`);
    for (const s of w.samples) console.log(`       - "${s}"`);
  }
}

writeFileSync(OUT_PATH, JSON.stringify({ stats, sellerSeeds: SELLER_SEEDS }, null, 0));
console.log(`\n결과 저장: ${OUT_PATH}`);
