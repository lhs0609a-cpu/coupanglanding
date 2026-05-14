// 6 shard 결과 통합
import fs from 'node:fs';
import path from 'node:path';

const dir = './scripts/verification-reports/';
const shardFiles = fs.readdirSync(dir)
  .filter(f => f.startsWith('simulate-final-487k.shard') && f.endsWith('.json'))
  .sort();

console.log(`shard 파일 ${shardFiles.length}개 발견:`, shardFiles);

const merged = {
  total: 0,
  elapsed: 0,
  scoreSum: 0,
  crossPollution: 0,
  optionMismatch: 0,
  seoIssues: {},
  scoreBuckets: { '90-100': 0, '80-89': 0, '70-79': 0, '60-69': 0, '<60': 0 },
  lengthBuckets: { '<20': 0, '20-30': 0, '31-40': 0, '41-50': 0, '51-70': 0, '71-100': 0, '>100': 0 },
  groupStats: {},
  failureSamples: { cross: [], seo: [], option: [] },
};

for (const f of shardFiles) {
  const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  merged.total += r.summary.total;
  merged.elapsed = Math.max(merged.elapsed, r.summary.elapsed);
  merged.scoreSum += r.summary.avgScore * r.summary.total;
  merged.crossPollution += r.summary.crossPollution;
  merged.optionMismatch += r.summary.optionMismatch;
  for (const [k, v] of Object.entries(r.seoIssues || {})) merged.seoIssues[k] = (merged.seoIssues[k] || 0) + v;
  for (const [k, v] of Object.entries(r.scoreBuckets || {})) merged.scoreBuckets[k] += v;
  for (const [k, v] of Object.entries(r.lengthBuckets || {})) merged.lengthBuckets[k] += v;
  for (const [g, s] of Object.entries(r.groupStats || {})) {
    if (!merged.groupStats[g]) merged.groupStats[g] = { total: 0, cross: 0, seoFail: 0, optFail: 0, scoreSum: 0 };
    merged.groupStats[g].total += s.total;
    merged.groupStats[g].cross += s.cross;
    merged.groupStats[g].seoFail += s.seoFail;
    merged.groupStats[g].optFail += s.optFail;
    merged.groupStats[g].scoreSum += s.scoreSum;
  }
  for (const k of ['cross', 'seo', 'option']) {
    for (const s of (r.failureSamples?.[k] || [])) {
      if (merged.failureSamples[k].length < 30) merged.failureSamples[k].push(s);
    }
  }
}

const avgScore = merged.scoreSum / merged.total;

console.log('\n' + '='.repeat(70));
console.log(`최종 통합 결과 — 16,259 카테고리 × 30 변형 = ${merged.total.toLocaleString()}건`);
console.log('='.repeat(70));
console.log(`최대 shard 소요시간: ${(merged.elapsed / 60).toFixed(1)}분`);
console.log(`평균 SEO 점수: ${avgScore.toFixed(2)}/100`);

console.log('\n📌 1. Cross-Pollution (카테고리 무관 단어)');
console.log(`   발생: ${merged.crossPollution}건 (${(100 * merged.crossPollution / merged.total).toFixed(4)}%)`);
console.log(`   Clean: ${(merged.total - merged.crossPollution).toLocaleString()}건 (${(100 * (merged.total - merged.crossPollution) / merged.total).toFixed(4)}%)`);

console.log('\n📌 2. 쿠팡 SEO 룰셋 검증');
const sorted = Object.entries(merged.seoIssues).sort((a, b) => b[1] - a[1]);
const critical = ['hardMaxExceeded', 'leafMissing', 'keywordStuffing', 'promoBanned', 'hypeBanned', 'celebrityLeak', 'specialChars', 'referenceMarker'];
console.log('   [치명적 위반]');
let hasCritical = false;
for (const [k, v] of sorted) {
  if (critical.includes(k)) {
    hasCritical = true;
    console.log(`     ${k.padEnd(22)} ${v.toString().padStart(8)}건 (${(100 * v / merged.total).toFixed(3)}%)`);
  }
}
if (!hasCritical) console.log('     ✅ 0건 (모두 통과)');
console.log('   [경미한 이슈]');
for (const [k, v] of sorted) {
  if (!critical.includes(k)) console.log(`     ${k.padEnd(22)} ${v.toString().padStart(8)}건 (${(100 * v / merged.total).toFixed(3)}%)`);
}

console.log('\n📌 3. 옵션 수량 추출 정확성');
console.log(`   불일치: ${merged.optionMismatch}건 (${(100 * merged.optionMismatch / merged.total).toFixed(4)}%)`);
console.log(`   정확: ${(merged.total - merged.optionMismatch).toLocaleString()}건 (${(100 * (merged.total - merged.optionMismatch) / merged.total).toFixed(4)}%)`);

console.log('\n📌 4. SEO 점수 분포');
for (const [b, c] of Object.entries(merged.scoreBuckets)) {
  console.log(`   ${b.padEnd(8)} : ${c.toLocaleString().padStart(8)}건 (${(100 * c / merged.total).toFixed(2)}%)`);
}

console.log('\n📌 5. 길이 분포 (쿠팡 모바일 최적 20~50자)');
for (const [b, c] of Object.entries(merged.lengthBuckets)) {
  console.log(`   ${b.padEnd(8)} : ${c.toLocaleString().padStart(8)}건 (${(100 * c / merged.total).toFixed(2)}%)`);
}

console.log('\n📌 6. 카테고리 그룹별 통계');
console.log('   그룹                   전체       cross   SEO실패  옵션실패  평균점수');
const groupSorted = Object.entries(merged.groupStats).sort((a, b) => b[1].total - a[1].total);
for (const [g, s] of groupSorted) {
  const avg = s.total > 0 ? (s.scoreSum / s.total).toFixed(1) : '-';
  console.log(`   ${g.padEnd(20)} ${s.total.toLocaleString().padStart(8)} ${s.cross.toString().padStart(8)} ${s.seoFail.toString().padStart(8)} ${s.optFail.toString().padStart(8)} ${avg.toString().padStart(8)}`);
}

if (merged.failureSamples.cross.length > 0) {
  console.log('\n📌 7. Cross-pollution 샘플');
  for (const s of merged.failureSamples.cross.slice(0, 5)) {
    console.log(`   [${s.path}] "${s.name}" → ${s.detected.join(', ')}`);
  }
}

if (merged.failureSamples.seo.length > 0) {
  console.log('\n📌 8. SEO 치명적 실패 샘플');
  for (const s of merged.failureSamples.seo.slice(0, 5)) {
    console.log(`   [${s.path}] "${s.name}" → [${s.issues.join(', ')}]`);
  }
}

if (merged.failureSamples.option.length > 0) {
  console.log('\n📌 9. 옵션 수량 불일치 샘플');
  for (const s of merged.failureSamples.option.slice(0, 5)) {
    console.log(`   [${s.path}] 입력:"${s.original}" → 출력:"${s.name}" (예상수량 ${s.expected})`);
  }
}

const outPath = `./scripts/verification-reports/simulate-final-487k-MERGED-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
fs.writeFileSync(outPath, JSON.stringify({
  summary: { total: merged.total, avgScore, crossPollution: merged.crossPollution, optionMismatch: merged.optionMismatch },
  ...merged,
}, null, 2));
console.log(`\n전체 통합 결과 저장: ${outPath}`);
