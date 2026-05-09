/**
 * audit-v2-comprehensive.mjs
 *
 * v2 풀 통합 후 종합 audit:
 *   1. 모바일 골든존 점수 (40자 안 leaf+modifier)
 *   2. 검색량 매칭률 — topRelated 키워드 중 골든존 들어간 비율
 *   3. 데이터 품질 분포 (rich/minimal/fallback)
 *   4. 다양성 — 동일 카테고리 다른 시드 → 토큰 분포 측정
 *   5. baseline 대비 개선 정량화
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dn = await import('../.build-test/lib/megaload/services/display-name-generator.js');
const gz = await import('../.build-test/lib/megaload/services/mobile-golden-zone.js');
const v2r = await import('../.build-test/lib/megaload/services/v2-pool-resolver.js');
const { generateDisplayName } = dn;
const { auditGoldenZone, aggregateGoldenZoneStats } = gz;
const { getDataQuality, getV2Pool } = v2r;

const COUPANG_DETAILS_PATH = join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-details.json');
const OUT_PATH = join(__dirname, 'audit-v2-result.json');

const SAMPLE_SIZE = parseInt(process.env.SAMPLE_SIZE || '2000', 10);

const coupangDetails = JSON.parse(readFileSync(COUPANG_DETAILS_PATH, 'utf8'));
const allCats = [];
for (const [, v] of Object.entries(coupangDetails)) {
  if (v && v.p) {
    const segs = v.p.split('>');
    allCats.push({ path: v.p, leaf: segs[segs.length - 1] });
  }
}

function seededShuffle(arr, seed = 42) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const sample = seededShuffle(allCats).slice(0, SAMPLE_SIZE);
console.log(`Sample: ${sample.length} / ${allCats.length}`);

// 다양성 시드 — 셀러 5명 가정
const SELLER_SEEDS = ['seller-1', 'seller-2', 'seller-3', 'seller-4', 'seller-5'];

const items = [];
const dataQualityCount = { rich: 0, minimal: 0, fallback: 0 };
let topRelatedMatches = 0;
let topRelatedTotal = 0;
const diversityMap = new Map(); // path → Set of unique tokens across sellers

for (const { path, leaf } of sample) {
  const leafBase = leaf.replace(/\/.+$/, '').trim();
  const fakeName = `${leafBase} 프리미엄 대용량 100g`;
  const fakeBrand = '베스트셀러';

  const quality = getDataQuality(path);
  dataQualityCount[quality]++;

  const v2 = getV2Pool(path);

  const sellerNames = [];
  const sellerTokenSets = [];
  for (const seed of SELLER_SEEDS) {
    try {
      const dn = generateDisplayName(fakeName, fakeBrand, path, seed, 0);
      sellerNames.push(dn);
      const tokens = new Set(dn.toLowerCase().split(/\s+/).filter(t => t.length >= 2));
      sellerTokenSets.push(tokens);
    } catch (err) {
      // skip
    }
  }

  if (sellerNames.length === 0) continue;

  // 첫 셀러로 audit
  const audit = auditGoldenZone(sellerNames[0], path);

  // topRelated 매칭률 — 골든존에 검색량 가중치 키워드 포함 여부
  if (v2 && Array.isArray(v2.topRelated)) {
    for (const r of v2.topRelated.slice(0, 3)) {
      if (!r.kw) continue;
      topRelatedTotal++;
      if (audit.golden.toLowerCase().includes(r.kw.toLowerCase())) {
        topRelatedMatches++;
      }
    }
  }

  // 다양성 측정 — 셀러간 토큰 union / intersection
  if (sellerTokenSets.length >= 2) {
    const allTokens = new Set();
    const commonTokens = new Set(sellerTokenSets[0]);
    for (const s of sellerTokenSets) {
      for (const t of s) allTokens.add(t);
      for (const t of commonTokens) if (!s.has(t)) commonTokens.delete(t);
    }
    const diversity = allTokens.size > 0 ? 1 - (commonTokens.size / allTokens.size) : 0;
    diversityMap.set(path, { allTokens: allTokens.size, commonTokens: commonTokens.size, diversity });
  }

  items.push({ path, leaf, displayName: sellerNames[0], audit, quality, sellerNames });
}

const stats = aggregateGoldenZoneStats(
  items.map(i => ({ displayName: i.displayName, categoryPath: i.path }))
);

// 다양성 평균
const diversities = [...diversityMap.values()].map(d => d.diversity);
const avgDiversity = diversities.length > 0 ? diversities.reduce((a, b) => a + b, 0) / diversities.length : 0;

console.log('\n=== v2 통합 후 audit ===');
console.log(`총 sample: ${stats.total}`);
console.log(`데이터 품질 분포:`);
console.log(`  rich     (modifier≥3 + volume): ${dataQualityCount.rich} (${(dataQualityCount.rich / stats.total * 100).toFixed(1)}%)`);
console.log(`  minimal  (modifier≥2):          ${dataQualityCount.minimal} (${(dataQualityCount.minimal / stats.total * 100).toFixed(1)}%)`);
console.log(`  fallback (v1 fallback):         ${dataQualityCount.fallback} (${(dataQualityCount.fallback / stats.total * 100).toFixed(1)}%)`);
console.log(`\n골든존 매칭:`);
console.log(`  leaf 포함률: ${stats.withLeafPercentage.toFixed(1)}%`);
console.log(`  평균 골든존 길이: ${stats.avgGoldenLength.toFixed(1)}자`);
console.log(`  평균 핵심 키워드: ${stats.avgCoreKeywords.toFixed(1)}개`);
console.log(`  잘림 비율: ${(stats.truncatedCount / stats.total * 100).toFixed(1)}%`);
console.log(`\n검색량 가중 키워드 매칭:`);
console.log(`  topRelated 매칭률: ${topRelatedTotal > 0 ? (topRelatedMatches / topRelatedTotal * 100).toFixed(1) : 0}% (${topRelatedMatches}/${topRelatedTotal})`);
console.log(`\n셀러 다양성:`);
console.log(`  평균 다양성 (1.0=완전다름, 0=동일): ${avgDiversity.toFixed(3)}`);

// 데이터 품질별 평균 점수
const byQuality = { rich: [], minimal: [], fallback: [] };
for (const it of items) byQuality[it.quality].push(it.audit.score);
console.log(`\n데이터 품질별 평균 점수:`);
for (const [q, scores] of Object.entries(byQuality)) {
  if (scores.length > 0) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    console.log(`  ${q}: ${avg.toFixed(1)} (${scores.length}개)`);
  }
}

// rich 카테고리 sample 5개
const richSamples = items.filter(i => i.quality === 'rich').slice(0, 5);
console.log(`\n=== Rich 데이터 카테고리 sample 5개 ===`);
for (const it of richSamples) {
  console.log(`[score=${it.audit.score}] ${it.path}`);
  console.log(`  → ${it.displayName}`);
  console.log(`  골든존(${it.audit.goldenLength}자): "${it.audit.golden}"`);
}

writeFileSync(OUT_PATH, JSON.stringify({
  stats,
  dataQualityCount,
  topRelatedMatches,
  topRelatedTotal,
  avgDiversity,
  byQuality: Object.fromEntries(Object.entries(byQuality).map(([q, s]) => [q, { count: s.length, avg: s.length > 0 ? s.reduce((a, b) => a + b, 0) / s.length : 0 }])),
  richSamples,
}, null, 0));
console.log(`\n결과 저장: ${OUT_PATH}`);
