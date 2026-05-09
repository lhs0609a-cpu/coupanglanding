/**
 * audit-baseline-vs-target.mjs
 *
 * 현재 노출명 생성 시스템의 baseline 측정.
 * - 16,259 카테고리 sample (1,000개 random)
 * - 각 카테고리에 다양한 가상 상품명으로 노출명 생성
 * - mobile-golden-zone.ts로 40자 골든존 점수 측정
 *
 * 출력: scripts/audit-baseline-result.json
 *   { stats, samples: [{cat, displayName, audit}] }
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dn = await import('../.build-test/lib/megaload/services/display-name-generator.js');
const gz = await import('../.build-test/lib/megaload/services/mobile-golden-zone.js');
const { generateDisplayName } = dn;
const { auditGoldenZone, aggregateGoldenZoneStats } = gz;

const COUPANG_DETAILS_PATH = join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-details.json');
const OUT_PATH = join(__dirname, 'audit-baseline-result.json');

const SAMPLE_SIZE = parseInt(process.env.SAMPLE_SIZE || '1500', 10);

const coupangDetails = JSON.parse(readFileSync(COUPANG_DETAILS_PATH, 'utf8'));
const allCats = [];
for (const [, v] of Object.entries(coupangDetails)) {
  if (v && v.p) {
    const segs = v.p.split('>');
    allCats.push({ path: v.p, leaf: segs[segs.length - 1] });
  }
}

// 시드 셔플 — 동일 결과 재현
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
console.log(`Sample size: ${sample.length} / ${allCats.length}`);

const items = [];
for (const { path, leaf } of sample) {
  // 가상 상품명 — leaf base + 일반 수식어
  const leafBase = leaf.replace(/\/.+$/, '').trim();
  const fakeName = `${leafBase} 프리미엄 대용량 100g`;
  const fakeBrand = '베스트셀러';
  try {
    const displayName = generateDisplayName(fakeName, fakeBrand, path, 'audit-baseline', 0);
    const audit = auditGoldenZone(displayName, path);
    items.push({ path, leaf, displayName, audit });
  } catch (err) {
    items.push({ path, leaf, error: String(err.message || err) });
  }
}

const stats = aggregateGoldenZoneStats(
  items.filter(i => !i.error).map(i => ({ displayName: i.displayName, categoryPath: i.path }))
);

console.log('\n=== Baseline 측정 결과 ===');
console.log(`총 sample: ${stats.total}`);
console.log(`leaf in 골든존: ${stats.withLeafInGolden} (${stats.withLeafPercentage.toFixed(1)}%)`);
console.log(`평균 점수: ${stats.avgScore.toFixed(1)} / 100`);
console.log(`평균 골든존 길이: ${stats.avgGoldenLength.toFixed(1)}자`);
console.log(`평균 핵심 키워드 수: ${stats.avgCoreKeywords.toFixed(1)}개`);
console.log(`잘림 비율 (>40자): ${(stats.truncatedCount / stats.total * 100).toFixed(1)}%`);
console.log(`점수 분포:`);
console.log(`  excellent (≥80): ${stats.scoreDistribution.excellent} (${(stats.scoreDistribution.excellent / stats.total * 100).toFixed(1)}%)`);
console.log(`  good      (60+): ${stats.scoreDistribution.good} (${(stats.scoreDistribution.good / stats.total * 100).toFixed(1)}%)`);
console.log(`  fair      (40+): ${stats.scoreDistribution.fair} (${(stats.scoreDistribution.fair / stats.total * 100).toFixed(1)}%)`);
console.log(`  poor      (<40): ${stats.scoreDistribution.poor} (${(stats.scoreDistribution.poor / stats.total * 100).toFixed(1)}%)`);

console.log('\n=== 점수 낮은 sample 5개 ===');
const sorted = items.filter(i => !i.error).sort((a, b) => a.audit.score - b.audit.score);
for (const it of sorted.slice(0, 5)) {
  console.log(`[${it.audit.score}] ${it.path}`);
  console.log(`  → ${it.displayName}`);
  console.log(`  골든존(${it.audit.goldenLength}자): "${it.audit.golden}"`);
  console.log(`  매칭 카테고리 토큰: ${it.audit.matchedCategoryWords.join(', ') || '(없음)'}`);
}

console.log('\n=== 점수 높은 sample 3개 ===');
for (const it of sorted.slice(-3).reverse()) {
  console.log(`[${it.audit.score}] ${it.path}`);
  console.log(`  → ${it.displayName}`);
  console.log(`  골든존(${it.audit.goldenLength}자): "${it.audit.golden}"`);
}

writeFileSync(OUT_PATH, JSON.stringify({ stats, samples: items }, null, 0));
console.log(`\n결과 저장: ${OUT_PATH}`);
