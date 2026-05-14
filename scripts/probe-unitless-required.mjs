// 모든 카테고리에서 schema unit 이 undefined 인 required 옵션을 열거하여
// 어떤 옵션명이 anomaly 위험인지 파악
import { readFileSync, writeFileSync } from 'fs';
const details = JSON.parse(readFileSync('src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

const unitlessCounts = {};
const unitDefinedCounts = {};
const samplesByName = {};

for (const [code, d] of Object.entries(details)) {
  for (const opt of (d.b || [])) {
    if (!opt.r) continue;  // required only
    if (opt.u) {
      unitDefinedCounts[opt.n] = (unitDefinedCounts[opt.n] || 0) + 1;
    } else {
      unitlessCounts[opt.n] = (unitlessCounts[opt.n] || 0) + 1;
      if (!samplesByName[opt.n]) samplesByName[opt.n] = [];
      if (samplesByName[opt.n].length < 3) samplesByName[opt.n].push({ code, p: d.p });
    }
  }
}

const sorted = Object.entries(unitlessCounts).sort((a, b) => b[1] - a[1]);
console.log('=== Schema unit=undefined (required) ===');
console.log('Total distinct option names:', sorted.length);
console.log('Top 40 by category count:');
for (const [name, cnt] of sorted.slice(0, 40)) {
  const samples = samplesByName[name].map(s => `${s.code}(${s.p})`).join(' | ');
  console.log(`  ${cnt.toString().padStart(5)} | ${name.padEnd(28)} | ${samples}`);
}

writeFileSync('probe-unitless-required-result.json', JSON.stringify({
  unitlessOptionNames: sorted,
  samplesByName,
}, null, 2));
console.log('\n결과: probe-unitless-required-result.json');
