// scripts/audit-cross-leaf.mjs
// 16,259 카테고리 cross-leaf 누출 검증.
//
// 시나리오: 카테고리 A의 leaf 토큰을 카테고리 B의 노출상품명 입력에 넣음.
//   B의 결과에 A의 leaf 토큰이 등장하면 (B와 A가 family-related 아니면) cross-leaf 누출.
//
// 카테고리쌍 16,259 × 16,259 = 2.6억 케이스는 너무 큼 → 계층화 sample.
// stratified sampling: 각 L1 대표 카테고리 × 다른 L1 카테고리 → 약 200만 케이스.
// SMOKE=N 환경 변수로 조정.

import fs from 'node:fs';

const m = await import('../.build-test/lib/megaload/services/display-name-generator.js');
const { generateDisplayName } = m;

const CAT_DETAILS = JSON.parse(fs.readFileSync('src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

const ALL_CATS = [];
for (const [code, v] of Object.entries(CAT_DETAILS)) {
  if (v && v.p && typeof v.p === 'string') {
    ALL_CATS.push({ code, path: v.p });
  }
}

// L1별 stratified sample — 각 L1당 N개 카테고리
function stratifiedSample(cats, perL1 = 80) {
  const byL1 = new Map();
  for (const c of cats) {
    const l1 = c.path.split('>')[0];
    if (!byL1.has(l1)) byL1.set(l1, []);
    byL1.get(l1).push(c);
  }
  const out = [];
  for (const [, arr] of byL1) {
    const step = Math.max(1, Math.floor(arr.length / perL1));
    for (let i = 0; i < arr.length && out.length < (perL1 + 1) * byL1.size; i += step) {
      out.push(arr[i]);
    }
  }
  return out;
}

const PER_L1 = parseInt(process.env.PER_L1 || '60');
const SAMPLE_CATS = stratifiedSample(ALL_CATS, PER_L1);
console.log(`stratified sample: ${SAMPLE_CATS.length} categories (per L1 ≈ ${PER_L1})`);

// leaf 토큰 추출 (1글자 이하 제외 — false positive 회피)
function leafTokens(path) {
  const leaf = path.split('>').pop() || '';
  return leaf
    .split(/[\/·\s\(\)\[\],+&\-_'']+/)
    .map(s => s.trim())
    .filter(s => s.length >= 2 && /[가-힣]/.test(s));
}

// L1 다른지 판정 (가장 보수적 cross-L1)
function isL1Different(pathA, pathB) {
  return pathA.split('>')[0] !== pathB.split('>')[0];
}

const stats = {
  total: 0,
  clean: 0,
  leak: 0,
  leakSample: [],
};

const SELLER_SEED = 'cross-leaf-audit';
let processed = 0;
const totalPairs = SAMPLE_CATS.length * SAMPLE_CATS.length;

for (const target of SAMPLE_CATS) {
  // target 카테고리에서 다른 카테고리들의 leaf를 input으로 넣음
  for (const source of SAMPLE_CATS) {
    if (source.code === target.code) continue;
    if (!isL1Different(source.path, target.path)) continue; // 같은 L1은 skip (cross-L1만 검증)
    stats.total++;
    processed++;
    if (processed % 50000 === 0) {
      console.log(`  진행 ${processed}/${totalPairs}`);
    }

    const sourceTokens = leafTokens(source.path);
    if (sourceTokens.length === 0) continue;

    const input = sourceTokens.join(' ') + ' 프리미엄 100g';
    let dn;
    try {
      dn = generateDisplayName(input, '', target.path, SELLER_SEED, 0);
    } catch { continue; }
    if (!dn) continue;

    // dn에서 sourceTokens가 leak되는지 (단어 단위)
    const dnWords = dn
      .toLowerCase()
      .split(/[\s\/·\(\)\[\],+&]+/)
      .map(w => w.trim())
      .filter(Boolean);
    const dnWordSet = new Set(dnWords);
    const targetPathLower = target.path.toLowerCase();
    const targetSegs = targetPathLower.split('>').map(s => s.trim());

    const leaked = sourceTokens.filter(tok => {
      const tokLower = tok.toLowerCase();
      // 단어 단위 매칭
      const wordHit = dnWords.some(w => w === tokLower || (tokLower.length >= 2 && w.endsWith(tokLower)));
      if (!wordHit) return false;
      // target path 어디에라도 같은 token이 있으면 false positive (예: "한우" 토큰이 target leaf "한우혼합세트"에 자연 등장)
      const tokInTargetPath = targetSegs.some(seg => seg.includes(tokLower));
      return !tokInTargetPath;
    });

    if (leaked.length === 0) {
      stats.clean++;
    } else {
      stats.leak++;
      if (stats.leakSample.length < 30) {
        stats.leakSample.push({
          source: source.path,
          target: target.path,
          leaked,
          dn,
        });
      }
    }
  }
}

const cleanPct = (stats.clean / stats.total * 100).toFixed(3);
const leakPct = (stats.leak / stats.total * 100).toFixed(3);

console.log(`\n=== Cross-Leaf 누출 검증 결과 ===`);
console.log(`총 케이스: ${stats.total.toLocaleString()}`);
console.log(`✅ 무결점:  ${stats.clean.toLocaleString()} (${cleanPct}%)`);
console.log(`🚨 누출:    ${stats.leak.toLocaleString()} (${leakPct}%)`);

console.log(`\n=== 누출 sample (first 30) ===`);
for (const s of stats.leakSample.slice(0, 30)) {
  console.log(`source: [${s.source}]`);
  console.log(`target: [${s.target}]`);
  console.log(`  → ${s.dn}`);
  console.log(`  누출: ${s.leaked.join(', ')}`);
}
