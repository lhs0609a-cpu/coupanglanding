#!/usr/bin/env node
// ============================================================
// 옵션 추출 corpus 분석
// scripts/verification-reports/corpus/extractions-YYYY-MM-DD.jsonl 파일들을
// 읽어서 추출 정확도 회귀 검증.
//
// 사용:
//   node scripts/analyze-corpus.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const CORPUS_DIR = 'scripts/verification-reports/corpus';

if (!fs.existsSync(CORPUS_DIR)) {
  console.log(`corpus 디렉토리 없음: ${CORPUS_DIR}`);
  console.log(`(아직 등록된 상품이 없거나 로깅이 비활성)`);
  process.exit(0);
}

const files = fs.readdirSync(CORPUS_DIR).filter(f => f.startsWith('extractions-')).sort();
console.log(`corpus 파일: ${files.length}개`);

let total = 0;
const byCategory = new Map();
const allEntries = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(CORPUS_DIR, file), 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      total++;
      allEntries.push(entry);
      const cat = entry.categoryPath || entry.categoryCode || 'unknown';
      const top = cat.split('>')[0]?.trim() || 'unknown';
      byCategory.set(top, (byCategory.get(top) || 0) + 1);
    } catch {}
  }
}

console.log(`\n총 ${total.toLocaleString()}건 등록 corpus 적재`);

console.log(`\n=== 대분류별 분포 ===`);
for (const [cat, n] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat.padEnd(20)} ${n.toLocaleString()}`);
}

// 추출 결과 분석: 추출 옵션 0개인 케이스 (의심)
const noExtraction = allEntries.filter(e => (e.extracted || []).length === 0);
console.log(`\n⚠️  옵션 추출 0건 케이스: ${noExtraction.length} (${(noExtraction.length / total * 100).toFixed(1)}%)`);
if (noExtraction.length > 0) {
  console.log(`첫 5개 샘플:`);
  for (const e of noExtraction.slice(0, 5)) {
    console.log(`  [${e.categoryCode}] ${e.productName}`);
  }
}

// 옵션값별 빈도 분석 — 어떤 단위가 자주 등장하는지
const unitFrequency = new Map();
for (const e of allEntries) {
  for (const o of (e.extracted || [])) {
    const key = `${o.name}/${o.unit || '-'}`;
    unitFrequency.set(key, (unitFrequency.get(key) || 0) + 1);
  }
}
console.log(`\n=== 추출 옵션 유형 분포 (상위 15) ===`);
const sortedUnits = [...unitFrequency.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
for (const [key, n] of sortedUnits) {
  console.log(`  ${key.padEnd(35)} ${n.toLocaleString()}`);
}

// 의심 케이스: 가장 큰 / 가장 작은 추출값
console.log(`\n=== 극단값 케이스 (수량 > 100 또는 = 0) ===`);
const extremes = [];
for (const e of allEntries) {
  for (const o of (e.extracted || [])) {
    const v = parseFloat(o.value);
    if (!isNaN(v) && (v > 100 && o.unit === '개') || v === 0) {
      extremes.push({ entry: e, opt: o });
    }
  }
}
for (const x of extremes.slice(0, 10)) {
  console.log(`  ${x.entry.productName}`);
  console.log(`     ${x.opt.name}=${x.opt.value}${x.opt.unit || ''}`);
}

const reportPath = `scripts/verification-reports/corpus-analysis-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
fs.writeFileSync(reportPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  totalEntries: total,
  byCategory: Object.fromEntries(byCategory),
  unitFrequency: Object.fromEntries(unitFrequency),
  noExtractionCount: noExtraction.length,
  noExtractionSamples: noExtraction.slice(0, 30),
}, null, 2));
console.log(`\n분석 리포트: ${reportPath}`);
