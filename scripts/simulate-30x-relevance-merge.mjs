#!/usr/bin/env node
import fs from 'node:fs';
const SHARDS = 6;
const all = [];
for (let i = 0; i < SHARDS; i++) {
  const p = `simulate-30x-rel-result.shard${i}-of-${SHARDS}.json`;
  if (!fs.existsSync(p)) { console.error('MISSING ' + p); process.exit(1); }
  all.push(JSON.parse(fs.readFileSync(p, 'utf8')));
}

const merged = {
  meta: {
    totalCategories: 0,
    variantsPerCategory: all[0].meta.variantsPerCategory,
    totalGenerated: 0,
    elapsedSecMax: 0,
    finishedAt: new Date().toISOString(),
  },
  summary: { clean: 0, hasIrrelevant: 0, crossLeaf: 0, totalIrrelevantTokenInstances: 0 },
  topIrrelevantTokens: [],
  samples: { crossLeaf: [], hasIrrelevant: [] },
  worstCategories: [],
};

const tokenFreq = new Map();
for (const s of all) {
  merged.meta.totalCategories += s.meta.totalCategories;
  merged.meta.totalGenerated += s.meta.totalGenerated;
  merged.meta.elapsedSecMax = Math.max(merged.meta.elapsedSecMax, s.meta.elapsedSec);
  merged.summary.clean += s.summary.clean;
  merged.summary.hasIrrelevant += s.summary.hasIrrelevant;
  merged.summary.crossLeaf += s.summary.crossLeaf;
  merged.summary.totalIrrelevantTokenInstances += s.summary.totalIrrelevantTokenInstances;
  for (const t of s.topIrrelevantTokens) tokenFreq.set(t.token, (tokenFreq.get(t.token) || 0) + t.count);
  for (const x of s.samples.crossLeaf) if (merged.samples.crossLeaf.length < 30) merged.samples.crossLeaf.push(x);
  for (const x of s.samples.hasIrrelevant) if (merged.samples.hasIrrelevant.length < 30) merged.samples.hasIrrelevant.push(x);
  merged.worstCategories.push(...s.worstCategories);
}

merged.topIrrelevantTokens = Array.from(tokenFreq.entries()).sort((a,b)=>b[1]-a[1]).slice(0,80).map(([t,c])=>({token:t,count:c}));
merged.worstCategories.sort((a,b)=>b.irrelevant - a.irrelevant);
merged.worstCategories = merged.worstCategories.slice(0, 50);

const total = merged.meta.totalGenerated;
const pct = n => +(n / Math.max(1, total) * 100).toFixed(2);
merged.summary.cleanPct = pct(merged.summary.clean);
merged.summary.hasIrrelevantPct = pct(merged.summary.hasIrrelevant);
merged.summary.crossLeafPct = pct(merged.summary.crossLeaf);

const out = 'scripts/verification-reports/audit-30x-relevance-2026-05-13.json';
fs.writeFileSync(out, JSON.stringify(merged, null, 2));

console.log(`\n=== 머지 완료 ===`);
console.log(`총 카테고리: ${merged.meta.totalCategories}`);
console.log(`총 생성: ${total}`);
console.log(`Clean (무관 토큰 0): ${merged.summary.clean} (${merged.summary.cleanPct}%)`);
console.log(`Has irrelevant:      ${merged.summary.hasIrrelevant} (${merged.summary.hasIrrelevantPct}%)`);
console.log(`Cross-leaf leak:     ${merged.summary.crossLeaf} (${merged.summary.crossLeafPct}%)`);
console.log(`무관 토큰 인스턴스:  ${merged.summary.totalIrrelevantTokenInstances}`);
console.log(`\nTop 20 무관 토큰:`);
for (const t of merged.topIrrelevantTokens.slice(0,20)) console.log(`  ${t.token}: ${t.count}`);
console.log(`\n출력: ${out}`);
