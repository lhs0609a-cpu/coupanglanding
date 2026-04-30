// scripts/audit-noisy-product-name.mjs
// 잡음 토큰이 섞인 상품명("사과 과일세트 레드자몽 프리미엄 10과 산지직송 아오리 대과 쌀 유산균 식품 10개 240g")을
// 16,259 카테고리 전수에 대해 노출상품명 생성, 정체성 붕괴 케이스 추출.
//
// 정체성 붕괴 = 카테고리 leaf 토큰이 노출상품명에 없거나, leaf와 무관한 잡음 토큰만 남는 경우.

import fs from 'node:fs';

const m = await import('../.build-test/lib/megaload/services/display-name-generator.js');
const { generateDisplayName } = m;

const CAT_DETAILS = JSON.parse(fs.readFileSync('src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

const NOISY_INPUT = "사과 과일세트 레드자몽 프리미엄 10과 산지직송 아오리 대과 쌀 유산균 식품 10개 240g";
const SELLER_SEED = 'audit-noisy';

const ALL_CATS = [];
for (const [code, v] of Object.entries(CAT_DETAILS)) {
  if (v && v.p && typeof v.p === 'string') {
    ALL_CATS.push({ code, path: v.p });
  }
}

console.log(`총 카테고리: ${ALL_CATS.length}`);
console.log(`입력 상품명: "${NOISY_INPUT}"\n`);

// 잡음 토큰 — 자몽 카테고리에 등장하면 정체성 붕괴
const NOISE_TOKENS = ['사과', '아오리', '쌀', '유산균'];
// 식품 외 카테고리에 등장하면 부적합한 잡음
const FOOD_NOISE = ['사과', '자몽', '레드자몽', '아오리', '쌀', '유산균', '식품'];

const stats = {
  total: 0,
  leafIncluded: 0,
  leafMissing: 0,
  noiseInNonFood: 0,
  noiseInWrongFood: 0, // 자몽이 아닌 식품 카테고리에 자몽/사과 토큰
  sample: [],
  noiseSample: [],
  missingLeafSample: [],
};

for (const { code, path } of ALL_CATS) {
  stats.total++;
  const segs = path.split('>');
  const leaf = segs[segs.length - 1];
  const top = segs[0];
  const leafLower = leaf.toLowerCase();

  let displayName;
  try {
    displayName = generateDisplayName(NOISY_INPUT, '', path, SELLER_SEED, 0);
  } catch (err) {
    continue;
  }
  if (!displayName) continue;

  const dnLower = displayName.toLowerCase();

  // 1) leaf 포함 여부
  const leafSplits = leaf.split(/[\/·\s\(\)\[\],+&\-._'']+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const leafIn = dnLower.includes(leafLower) || leafSplits.some(s => s.length >= 2 && dnLower.includes(s));

  if (leafIn) stats.leafIncluded++;
  else {
    stats.leafMissing++;
    if (stats.missingLeafSample.length < 30) {
      stats.missingLeafSample.push({ code, path, displayName });
    }
  }

  // 2) 식품이 아닌데 식품 잡음 토큰이 들어간 경우
  if (top !== '식품') {
    const noiseFound = FOOD_NOISE.filter(n => displayName.includes(n));
    if (noiseFound.length > 0) {
      stats.noiseInNonFood++;
      if (stats.noiseSample.length < 30) {
        stats.noiseSample.push({ code, path, displayName, noise: noiseFound });
      }
    }
  } else {
    // 3) 식품인데 자몽이 아닌 카테고리에 자몽/사과 토큰
    const isCitrus = path.includes('자몽') || path.includes('오렌지') || path.includes('레몬');
    const isApple = path.includes('사과');
    const wrongFruit = [];
    if (!isCitrus && (displayName.includes('자몽') || displayName.includes('레드자몽'))) wrongFruit.push('자몽');
    if (!isApple && (displayName.includes('사과') || displayName.includes('아오리'))) wrongFruit.push('사과');
    if (wrongFruit.length > 0) {
      stats.noiseInWrongFood++;
      if (stats.noiseSample.length < 60) {
        stats.noiseSample.push({ code, path, displayName, noise: wrongFruit });
      }
    }
  }

  // 일부 sample 저장
  if (stats.sample.length < 50) {
    stats.sample.push({ code, path, displayName });
  }
}

console.log(`=== 결과 ===`);
console.log(`총: ${stats.total}`);
console.log(`✅ leaf 포함:                ${stats.leafIncluded} (${(stats.leafIncluded/stats.total*100).toFixed(1)}%)`);
console.log(`❌ leaf 누락:                ${stats.leafMissing} (${(stats.leafMissing/stats.total*100).toFixed(1)}%)`);
console.log(`🚨 비식품 카테고리 식품 잡음: ${stats.noiseInNonFood} (${(stats.noiseInNonFood/stats.total*100).toFixed(1)}%)`);
console.log(`🚨 식품 잘못된 과일 잡음:     ${stats.noiseInWrongFood} (${(stats.noiseInWrongFood/stats.total*100).toFixed(1)}%)`);

console.log(`\n=== 정체성 붕괴 샘플 (비식품에 식품 토큰) ===`);
for (const s of stats.noiseSample.slice(0, 15)) {
  console.log(`[${s.path}]`);
  console.log(`  → ${s.displayName}`);
  console.log(`  잡음: ${s.noise.join(', ')}`);
}

console.log(`\n=== leaf 누락 샘플 ===`);
for (const s of stats.missingLeafSample.slice(0, 10)) {
  console.log(`[${s.path}]`);
  console.log(`  → ${s.displayName}`);
}

console.log(`\n=== 다양한 카테고리 sample 30개 ===`);
for (let i = 0; i < Math.min(30, stats.sample.length); i++) {
  const s = stats.sample[i];
  console.log(`[${s.path}]`);
  console.log(`  → ${s.displayName}`);
}
