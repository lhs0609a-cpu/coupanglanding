#!/usr/bin/env node
// shard 결과를 머지해서 최종 리포트 생성
import fs from 'node:fs';

const SHARD_COUNT = parseInt(process.env.SHARDS || '4', 10);
const shards = [];
for (let i = 0; i < SHARD_COUNT; i++) {
  const path = `simulate-30x-seo-result.shard${i}-of-${SHARD_COUNT}.json`;
  if (!fs.existsSync(path)) {
    console.error(`MISSING: ${path}`);
    process.exit(1);
  }
  shards.push(JSON.parse(fs.readFileSync(path, 'utf8')));
}

const merged = {
  meta: {
    totalCategories: 0,
    variantsPerCategory: shards[0].meta.variantsPerCategory,
    totalGenerated: 0,
    elapsedSecMax: 0,
    finishedAt: new Date().toISOString(),
    shardsCount: SHARD_COUNT,
  },
  summary: { pass: 0, fail: 0, passRate: 0 },
  lengthDistribution: {},
  issueBreakdown: {},
  failureSamples: {},
  worstCategories: [],
  bestCategoriesSample: [],
};

for (const s of shards) {
  merged.meta.totalCategories += s.meta.totalCategories;
  merged.meta.totalGenerated += s.meta.totalGenerated;
  merged.meta.elapsedSecMax = Math.max(merged.meta.elapsedSecMax, s.meta.elapsedSec);
  merged.summary.pass += s.summary.pass;
  merged.summary.fail += s.summary.fail;
  for (const [k, v] of Object.entries(s.lengthDistribution)) {
    merged.lengthDistribution[k] = (merged.lengthDistribution[k] || 0) + v;
  }
  for (const [k, v] of Object.entries(s.issueBreakdown)) {
    if (!merged.issueBreakdown[k]) merged.issueBreakdown[k] = { count: 0, pct: 0 };
    merged.issueBreakdown[k].count += v.count;
  }
  for (const [k, samples] of Object.entries(s.failureSamples || {})) {
    if (!merged.failureSamples[k]) merged.failureSamples[k] = [];
    for (const sam of samples) {
      if (merged.failureSamples[k].length < 8) merged.failureSamples[k].push(sam);
    }
  }
  merged.worstCategories.push(...(s.worstCategories || []));
  merged.bestCategoriesSample.push(...(s.bestCategoriesSample || []));
}

const total = merged.meta.totalGenerated;
const pct = n => +(n / Math.max(1, total) * 100).toFixed(2);
merged.summary.passRate = pct(merged.summary.pass);
for (const k of Object.keys(merged.issueBreakdown)) {
  merged.issueBreakdown[k].pct = pct(merged.issueBreakdown[k].count);
}
// resort issueBreakdown by count desc
merged.issueBreakdown = Object.fromEntries(
  Object.entries(merged.issueBreakdown).sort((a, b) => b[1].count - a[1].count),
);
// worst by fail desc
merged.worstCategories.sort((a, b) => b.fail - a.fail);
merged.worstCategories = merged.worstCategories.slice(0, 50);
merged.bestCategoriesSample = merged.bestCategoriesSample.slice(0, 50);

const out = 'simulate-30x-seo-result.merged.json';
fs.writeFileSync(out, JSON.stringify(merged, null, 2));

console.log(`\n=== 머지 완료 (${SHARD_COUNT}샤드) ===`);
console.log(`총 카테고리: ${merged.meta.totalCategories}`);
console.log(`총 생성: ${total}`);
console.log(`PASS:    ${merged.summary.pass} (${merged.summary.passRate}%)`);
console.log(`FAIL:    ${merged.summary.fail} (${pct(merged.summary.fail)}%)`);
console.log(`최대 elapsed: ${merged.meta.elapsedSecMax}s\n`);
console.log('길이 분포:');
for (const [k, v] of Object.entries(merged.lengthDistribution)) {
  console.log(`  ${k}: ${v} (${pct(v)}%)`);
}
console.log('\n이슈:');
for (const [k, v] of Object.entries(merged.issueBreakdown)) {
  console.log(`  ${k}: ${v.count} (${v.pct}%)`);
}
console.log(`\n출력: ${out}`);
