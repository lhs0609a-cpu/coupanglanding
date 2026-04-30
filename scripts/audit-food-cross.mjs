// scripts/audit-food-cross.mjs
// 식품 L1 카테고리 전수 × 다른 16k 카테고리 leaf token으로 cross 검증.
// 사용자 의도: "자몽/귤/쌀/건기식"에 다른 카테고리 토큰 1도 안 들어오는지 정밀 확인.

import fs from 'node:fs';

const m = await import('../.build-test/lib/megaload/services/display-name-generator.js');
const { generateDisplayName } = m;

const CAT_DETAILS = JSON.parse(fs.readFileSync('src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

const ALL_CATS = [];
const FOOD_CATS = [];
for (const [code, v] of Object.entries(CAT_DETAILS)) {
  if (v && v.p && typeof v.p === 'string') {
    ALL_CATS.push({ code, path: v.p });
    if (v.p.startsWith('식품>')) FOOD_CATS.push({ code, path: v.p });
  }
}
console.log(`전체 카테고리: ${ALL_CATS.length}, 식품 카테고리: ${FOOD_CATS.length}`);

function leafTokens(path) {
  const leaf = path.split('>').pop() || '';
  return leaf
    .split(/[\/·\s\(\)\[\],+&\-_'']+/)
    .map(s => s.trim())
    .filter(s => s.length >= 2 && /[가-힣]/.test(s));
}

// 비식품 카테고리에서 leaf 토큰 추출 (다양한 source)
const NON_FOOD_SOURCES = [];
for (const c of ALL_CATS) {
  if (c.path.startsWith('식품>')) continue;
  const tokens = leafTokens(c.path);
  if (tokens.length > 0) NON_FOOD_SOURCES.push({ ...c, tokens });
}
console.log(`비식품 source 카테고리: ${NON_FOOD_SOURCES.length}`);

// 비식품 source 1500개 stratified sample
const SOURCE_STEP = Math.max(1, Math.floor(NON_FOOD_SOURCES.length / 1500));
const SOURCES = NON_FOOD_SOURCES.filter((_, i) => i % SOURCE_STEP === 0).slice(0, 1500);
console.log(`source sample: ${SOURCES.length}`);

const stats = {
  total: 0,
  clean: 0,
  leak: 0,
  leakSample: [],
  leakByFoodCat: new Map(),
};

const SELLER_SEED = 'food-cross-audit';
let processed = 0;
const totalPairs = FOOD_CATS.length * SOURCES.length;
console.log(`총 케이스: ${totalPairs.toLocaleString()}`);

for (const target of FOOD_CATS) {
  const targetSegs = target.path.toLowerCase().split('>').map(s => s.trim());
  for (const source of SOURCES) {
    stats.total++;
    processed++;
    if (processed % 200000 === 0) {
      console.log(`  진행 ${processed}/${totalPairs}`);
    }

    const sourceTokens = source.tokens;
    const input = sourceTokens.join(' ') + ' 프리미엄 100g';
    let dn;
    try {
      dn = generateDisplayName(input, '', target.path, SELLER_SEED, 0);
    } catch { continue; }
    if (!dn) continue;

    const dnWords = dn
      .toLowerCase()
      .split(/[\s\/·\(\)\[\],+&]+/)
      .map(w => w.trim())
      .filter(Boolean);

    // dn에서 sourceTokens가 leak되는지 (단어 단위)
    const leaked = sourceTokens.filter(tok => {
      const tokLower = tok.toLowerCase();
      const wordHit = dnWords.some(w => w === tokLower || (tokLower.length >= 2 && w.endsWith(tokLower)));
      if (!wordHit) return false;
      // target path에 같은 token이 있으면 false positive
      const tokInTargetPath = targetSegs.some(seg => seg.includes(tokLower));
      return !tokInTargetPath;
    });

    if (leaked.length === 0) {
      stats.clean++;
    } else {
      stats.leak++;
      stats.leakByFoodCat.set(target.path, (stats.leakByFoodCat.get(target.path) || 0) + leaked.length);
      if (stats.leakSample.length < 50) {
        stats.leakSample.push({
          source: source.path,
          target: target.path,
          leaked: leaked.slice(0, 5),
          dn,
        });
      }
    }
  }
}

const cleanPct = (stats.clean / stats.total * 100).toFixed(3);
const leakPct = (stats.leak / stats.total * 100).toFixed(3);

console.log(`\n=== 식품 카테고리 cross-leaf 누출 검증 ===`);
console.log(`총 케이스: ${stats.total.toLocaleString()}`);
console.log(`✅ 무결점:  ${stats.clean.toLocaleString()} (${cleanPct}%)`);
console.log(`🚨 누출:    ${stats.leak.toLocaleString()} (${leakPct}%)`);

console.log(`\n=== 누출 발생 식품 카테고리 (top 20) ===`);
const sortedFood = [...stats.leakByFoodCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [path, cnt] of sortedFood) {
  console.log(`  ${cnt}건 [${path}]`);
}

console.log(`\n=== 누출 sample (first 20) ===`);
for (const s of stats.leakSample.slice(0, 20)) {
  console.log(`source: [${s.source}]`);
  console.log(`target: [${s.target}]`);
  console.log(`  → ${s.dn}`);
  console.log(`  누출: ${s.leaked.join(', ')}`);
}

// 사용자 핵심 카테고리 직접 결과 확인
console.log(`\n=== 핵심 카테고리 sample (자몽/귤/쌀/홍삼) ===`);
const KEY = [
  '식품>신선식품>과일류>과일>자몽',
  '식품>신선식품>과일류>과일>귤',
  '식품>신선식품>과일류>과일>한라봉',
  '식품>신선식품>쌀/잡곡류>쌀류>백미',
  '식품>건강식품>전통건강식품>홍삼>홍삼농축액/홍삼정',
  '식품>건강식품>비타민/미네랄>오메가-3',
];
const NOISY = [
  '여성모카신 털단화 프리미엄 100g',
  '베이비 파우더 신생아 무향 200ml',
  '오메가3 1000mg 90캡슐 영양제',
  '소설 자기계발 베스트셀러 책',
  '에어컨 무선 IoT 24평 프리미엄',
  '노트북 가방 백팩 캐주얼 데일리',
];
for (const path of KEY) {
  console.log(`\n[${path}]`);
  for (const input of NOISY) {
    const r = generateDisplayName(input, '', path, SELLER_SEED, 0);
    console.log(`  input: "${input}"`);
    console.log(`    → ${r}`);
  }
}
