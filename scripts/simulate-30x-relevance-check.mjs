#!/usr/bin/env node
// ============================================================
// 16,259 카테고리 × 30개 노출상품명 — 카테고리 무관 토큰 검출
// ============================================================
// 검증: 각 생성 노출명의 모든 토큰이 카테고리와 관련 있는가?
//
// allowlist (관련 토큰):
//   1) leaf 분할 토큰
//   2) parent path segment 토큰
//   3) seo-keyword-pools.json: pool.generic + ingredients + features
//   4) synonymGroups: leaf의 synonym
//   5) universalModifiers + DIVERSITY_POOL
//   6) input 원본 토큰 (사용자 input 보존)
//   7) brand 토큰
//   8) 단위 토큰 (g, ml, kg, 개, etc.)
//
// 위 어디에도 없으면 → "관련없는 토큰".
// 그 중 ALL_CATEGORY_LEAF_TOKENS에 있으면 → "cross-leaf" (가장 심각).
// ============================================================

import fs from 'node:fs';

const GEN = await import('../.build-test/lib/megaload/services/display-name-generator.js');
const { generateDisplayName, findBestPool } = GEN;

const CAT_INDEX = JSON.parse(fs.readFileSync('src/lib/megaload/data/coupang-cat-index.json', 'utf8'));
const SEO_DATA  = JSON.parse(fs.readFileSync('src/lib/megaload/data/seo-keyword-pools.json', 'utf8'));

const ALL_CATS = CAT_INDEX.map(([code, fullSpace, leaf, depth]) => {
  const tokens = fullSpace.split(/\s+/).filter(Boolean);
  const leafParts = leaf.split(/[\s/(),\[\]]+/).filter(Boolean);
  const parentTokens = tokens.slice(0, Math.max(1, tokens.length - leafParts.length));
  const path = parentTokens.length > 0 ? parentTokens.join('>') + '>' + leaf : leaf;
  return { code, path, leaf };
});

const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const VARIANTS = parseInt(process.env.VARIANTS || '30', 10);
const SHARD_COUNT = parseInt(process.env.SHARDS || '1', 10);
const SHARD_INDEX = parseInt(process.env.SHARD || '0', 10);

let SELECTED = LIMIT > 0 ? ALL_CATS.slice(0, LIMIT) : ALL_CATS;
if (SHARD_COUNT > 1) SELECTED = SELECTED.filter((_, i) => i % SHARD_COUNT === SHARD_INDEX);
const CATEGORIES = SELECTED;

console.log(`Shard ${SHARD_INDEX}/${SHARD_COUNT} | ${CATEGORIES.length} × ${VARIANTS} = ${CATEGORIES.length * VARIANTS}건`);

// ─── 글로벌 allowlist (입력 무관, 모든 카테고리 통용) ──────
const UNIVERSAL = new Set([
  // generator의 universalModifiers + extras + DIVERSITY_POOL
  '프리미엄','고급','고품질','가성비','실속형','신상품','최신형',
  '선물용','가정용','대용량','소용량','세트','묶음','정식수입',
  '국내정발','친환경','안전인증','컴팩트','심플','심플한','모던','모던한','클래식','클래식한',
  '실용적','편리한','견고한','내구성','고효율','다용도','기능성',
  '전문가용','입문용','어린이용','여성용','남성용','시니어용',
  '미니','소형','대형','특대형','휴대용','리필용','교체용',
  '단품','기본형','고급형','표준형','베이직','프로','플러스',
  '에코','울트라','슈퍼','맥스','라이트','신선','국내산','국산',
  '수입','특가','인기','추천','베스트','한정판','럭셔리',
  // diversity pool
  '베스트셀러','인기상품','추천상품','신상','한정수량',
  '프로페셔널','명품급','특별한','실용','장인정신','품격있는',
  // 일반 명사/형용사 자주 사용
  '상품','선물','구성','사용','제품','용','형',
]);

const SEO_UNIVERSAL = (SEO_DATA.universalModifiers || []).map(s => s.toLowerCase());
for (const u of SEO_UNIVERSAL) UNIVERSAL.add(u);

// 단위 키워드 (스펙 토큰)
const UNIT_PATTERN = /^\d+(?:[.,]\d+)?(?:개월분?|일분|주분|ml|g|kg|mg|mcg|iu|L|정|개|매|팩|세트|입|병|통|포|봉|캡슐|알|ea|p|장|m|cm|mm|인치|oz|lb|x|X)?$/i;

// brand 시드 (입력에서 흘러갈 수 있는 브랜드)
const BRAND_TOKENS = new Set([
  '데일리','베스트','에코','스마트','리빙','메가셀러','프리미엄','메가샵',
  '데일리홈','베스트마켓','프리미엄스토어','한국유통','코리아셀러',
  '굿라이프','스마트홈','에코프렌즈','리빙플러스',
]);

const NOISE_INPUT_TOKENS = new Set([
  '정품','명품','효과만점','보장','사은품','증정','리뷰이벤트','광고모델',
  '무료배송','당일발송','이서진','베스트','인기','추천','대용량','신상품',
]);

// ─── 모든 카테고리 leaf 토큰 (cross-leaf 판정용) ──────────
const ALL_LEAF_TOKENS = new Set();
for (const cat of ALL_CATS) {
  const leaf = cat.leaf.toLowerCase();
  for (const w of leaf.split(/[\/·\s\(\)\[\],+&\-_]+/)) {
    const t = w.trim();
    if (t.length >= 2 && /[가-힣]/.test(t)) ALL_LEAF_TOKENS.add(t);
  }
  if (leaf.length >= 2 && /[가-힣]/.test(leaf)) ALL_LEAF_TOKENS.add(leaf);
}

function buildCategorySafeWords(path) {
  const safe = new Set();
  const segs = path.split('>').map(s => s.trim()).filter(Boolean);
  const leafIdx = segs.length - 1;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const minLen = i === leafIdx ? 1 : 2;
    if (seg.length >= minLen) safe.add(seg.toLowerCase());
    for (const part of seg.split(/[\/·\s\(\)\[\],+&\-._'"]+/).map(s => s.trim())) {
      if (part.length < minLen) continue;
      if (/^\d+$/.test(part)) continue;
      safe.add(part.toLowerCase());
    }
  }
  return safe;
}

// 카테고리 풀에서 합법 토큰 추출
function poolTokensFor(path) {
  const pool = findBestPool(path);
  const out = new Set();
  for (const arr of [pool.generic || [], pool.ingredients || [], pool.features || []]) {
    for (const t of arr) {
      if (t && t.length >= 1) out.add(t.toLowerCase());
    }
  }
  return out;
}

// synonyms
function synonymsFor(leaf) {
  const out = new Set();
  const lower = leaf.toLowerCase();
  for (const [key, syns] of Object.entries(SEO_DATA.synonymGroups || {})) {
    const all = [key, ...syns].map(s => s.toLowerCase());
    if (all.includes(lower)) {
      for (const a of all) out.add(a);
    } else {
      const leafTokens = lower.split(/[\/·\s,+&\-_]+/).filter(Boolean);
      if (leafTokens.some(t => all.includes(t))) {
        for (const a of all) out.add(a);
      }
    }
  }
  return out;
}

function tokenizeName(name) {
  return name.split(/\s+/).map(t => t.trim()).filter(Boolean);
}

// ─── input 변형 (시뮬레이션과 동일 시드) ──────
const SELLERS = [
  '데일리홈','메가샵','베스트마켓','프리미엄스토어','한국유통',
  '코리아셀러','굿라이프','스마트홈','에코프렌즈','리빙플러스',
];
const BRAND_SCENARIOS = [
  { brand: '데일리', prefix: '데일리 프리미엄', suffix: '100g' },
  { brand: '베스트', prefix: '베스트 인기', suffix: '1개' },
  { brand: '에코', prefix: '에코 친환경', suffix: '500ml' },
  { brand: '스마트', prefix: '스마트 신상품', suffix: '대용량' },
  { brand: '리빙', prefix: '리빙 명품', suffix: '500g' },
];

function buildVariants(cat, ci) {
  const leafBase = cat.leaf.replace(/\/.+$/, '').trim();
  const variants = [];
  variants.push({ name: `${leafBase}`, brand: '데일리', seller: SELLERS[0] });
  variants.push({ name: `${leafBase} 1개`, brand: '베스트', seller: SELLERS[1] });
  variants.push({ name: `프리미엄 ${leafBase} 500g`, brand: '에코', seller: SELLERS[2] });
  for (let i = 0; i < BRAND_SCENARIOS.length; i++) {
    const s = BRAND_SCENARIOS[i];
    variants.push({
      name: `${s.prefix} ${leafBase} 인기상품 ${s.suffix}`,
      brand: s.brand,
      seller: SELLERS[(ci + i) % SELLERS.length],
    });
  }
  const specs = ['1개','2개입','5개입','10개입','50g','200g','500g','1kg','500ml','1L'];
  for (let i = 0; i < specs.length; i++) {
    variants.push({
      name: `${SELLERS[(ci+i)%SELLERS.length]} ${leafBase} ${specs[i]}`,
      brand: BRAND_SCENARIOS[i % BRAND_SCENARIOS.length].brand,
      seller: SELLERS[(ci+i)%SELLERS.length],
    });
  }
  variants.push({ name: `[정품] ${leafBase} 무료배송 특가 ★당일발송★ ${leafBase} ${leafBase}`,
    brand: '메가셀러', seller: SELLERS[(ci+3)%SELLERS.length] });
  variants.push({ name: `${leafBase}/세트/모음 추천 베스트 인기 ${leafBase}`,
    brand: '데일리', seller: SELLERS[(ci+4)%SELLERS.length] });
  variants.push({ name: `명품 ${leafBase} 대용량 신상품 ${leafBase} 효과만점 100% 보장`,
    brand: '프리미엄', seller: SELLERS[(ci+5)%SELLERS.length] });
  variants.push({ name: `${leafBase} (대용량) 사은품 증정 리뷰이벤트 ${leafBase}`,
    brand: '에코', seller: SELLERS[(ci+6)%SELLERS.length] });
  variants.push({ name: `이서진 추천 ${leafBase} 광고모델 ${leafBase} 베스트`,
    brand: '스마트', seller: SELLERS[(ci+7)%SELLERS.length] });
  const colorSize = ['블랙','화이트','레드','M사이즈','L사이즈','대형','소형'];
  for (let i = 0; i < colorSize.length; i++) {
    variants.push({
      name: `${SELLERS[(ci+i)%SELLERS.length]} ${leafBase} ${colorSize[i]} 100ml`,
      brand: BRAND_SCENARIOS[(i+2)%BRAND_SCENARIOS.length].brand,
      seller: SELLERS[(ci+i+2)%SELLERS.length],
    });
  }
  return variants.slice(0, VARIANTS);
}

// ─── 실행 ──────────────────────────────────────
const counters = {
  total: 0,
  clean: 0,            // 무관 토큰 0개
  hasIrrelevant: 0,    // 무관 토큰 1개+
  crossLeaf: 0,        // 다른 카테고리 leaf 토큰 포함
  irrelevantTokenInstances: 0,
  irrelevantTokenFreq: new Map(),  // token → count
};
const samples = { crossLeaf: [], hasIrrelevant: [] };
const categoryStats = [];

const startedAt = Date.now();
const shardTag = SHARD_COUNT > 1 ? `.shard${SHARD_INDEX}-of-${SHARD_COUNT}` : '';
const PROGRESS_LOG = `simulate-30x-rel-progress${shardTag}.log`;
const RESULT_JSON = `simulate-30x-rel-result${shardTag}.json`;
fs.writeFileSync(PROGRESS_LOG, `START ${new Date().toISOString()} | ${CATEGORIES.length} × ${VARIANTS}\n`);

function logp(msg) {
  fs.writeFileSync(PROGRESS_LOG, `[${new Date().toISOString()}] ${msg}\n`, { flag: 'a' });
  console.log(msg);
}

for (let ci = 0; ci < CATEGORIES.length; ci++) {
  const cat = CATEGORIES[ci];
  const variants = buildVariants(cat, ci);

  // category-specific allowlist build (once)
  const safe = buildCategorySafeWords(cat.path);
  const pool = poolTokensFor(cat.path);
  const syn = synonymsFor(cat.leaf);
  const catAllow = new Set([...safe, ...pool, ...syn]);

  const catBucket = { code: cat.code, path: cat.path, leaf: cat.leaf,
    clean: 0, irrelevant: 0, crossLeaf: 0, irrelevantTokens: {} };

  for (let vi = 0; vi < variants.length; vi++) {
    const v = variants[vi];
    let name;
    try {
      name = generateDisplayName(v.name, v.brand, cat.path, v.seller, vi);
    } catch {
      continue;
    }
    counters.total++;

    // input 토큰도 합법 (사용자 input 보존)
    const inputTokens = new Set(
      v.name.toLowerCase().split(/[\s,·/\(\)\[\]+&_]+/).map(t => t.trim()).filter(Boolean)
    );
    inputTokens.add(v.brand.toLowerCase());

    const tokens = tokenizeName(name);
    const irrelevant = [];
    const crossLeafTokens = [];

    for (const tok of tokens) {
      const tl = tok.toLowerCase();
      if (tl.length < 1) continue;

      // 단위·숫자 토큰
      if (UNIT_PATTERN.test(tl)) continue;
      if (/^\d+$/.test(tl)) continue;

      // 카테고리 allowlist
      if (catAllow.has(tl)) continue;

      // category safe words 부분 매칭 (예: "다이어리" allowlist에 있을 때 "여권/다이어리" leaf)
      let inSafe = false;
      for (const sw of safe) {
        if (sw.length >= 2 && (tl === sw || tl.includes(sw) || sw.includes(tl))) { inSafe = true; break; }
      }
      if (inSafe) continue;

      // 글로벌 universal (프리미엄 등)
      if (UNIVERSAL.has(tl)) continue;
      // brand 시드
      if (BRAND_TOKENS.has(tl)) continue;
      // input 노이즈 (사용자 input 그대로 전달된 단어)
      if (NOISE_INPUT_TOKENS.has(tl)) continue;
      // 입력 토큰 자체
      if (inputTokens.has(tl)) continue;

      // 여전히 매칭 안되면 무관 토큰
      irrelevant.push(tok);
      counters.irrelevantTokenFreq.set(tl, (counters.irrelevantTokenFreq.get(tl) || 0) + 1);
      catBucket.irrelevantTokens[tok] = (catBucket.irrelevantTokens[tok] || 0) + 1;

      // cross-leaf 판정: 다른 카테고리의 leaf 토큰?
      if (ALL_LEAF_TOKENS.has(tl) && !safe.has(tl)) {
        crossLeafTokens.push(tok);
      }
    }

    counters.irrelevantTokenInstances += irrelevant.length;
    if (irrelevant.length === 0) {
      counters.clean++;
      catBucket.clean++;
    } else {
      counters.hasIrrelevant++;
      catBucket.irrelevant++;
      if (samples.hasIrrelevant.length < 30) {
        samples.hasIrrelevant.push({
          cat: cat.path, leaf: cat.leaf, input: v.name, brand: v.brand,
          generated: name, irrelevant, crossLeaf: crossLeafTokens,
        });
      }
    }
    if (crossLeafTokens.length > 0) {
      counters.crossLeaf++;
      catBucket.crossLeaf++;
      if (samples.crossLeaf.length < 30) {
        samples.crossLeaf.push({
          cat: cat.path, leaf: cat.leaf, input: v.name, brand: v.brand,
          generated: name, crossLeafTokens,
        });
      }
    }
  }

  categoryStats.push(catBucket);

  if ((ci+1) % 1000 === 0) {
    const sec = ((Date.now() - startedAt) / 1000).toFixed(0);
    logp(`[${ci+1}/${CATEGORIES.length}] ${((ci+1)/CATEGORIES.length*100).toFixed(1)}% | ${sec}s | clean ${counters.clean}/${counters.total} (${(counters.clean/Math.max(1,counters.total)*100).toFixed(1)}%) | crossLeaf ${counters.crossLeaf}`);
  }
}

const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
logp(`DONE in ${elapsedSec}s`);

// 정렬: 무관 토큰 많은 카테고리 순
categoryStats.sort((a, b) => b.irrelevant - a.irrelevant);

const topIrrelevantTokens = Array.from(counters.irrelevantTokenFreq.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 50);

const pct = n => +(n / Math.max(1, counters.total) * 100).toFixed(2);

const report = {
  meta: {
    totalCategories: CATEGORIES.length,
    variantsPerCategory: VARIANTS,
    totalGenerated: counters.total,
    elapsedSec: parseFloat(elapsedSec),
    finishedAt: new Date().toISOString(),
  },
  summary: {
    clean: counters.clean,
    cleanPct: pct(counters.clean),
    hasIrrelevant: counters.hasIrrelevant,
    hasIrrelevantPct: pct(counters.hasIrrelevant),
    crossLeaf: counters.crossLeaf,
    crossLeafPct: pct(counters.crossLeaf),
    totalIrrelevantTokenInstances: counters.irrelevantTokenInstances,
  },
  topIrrelevantTokens: topIrrelevantTokens.map(([t, c]) => ({ token: t, count: c })),
  samples,
  worstCategories: categoryStats.slice(0, 30).map(c => ({
    code: c.code, path: c.path, leaf: c.leaf,
    clean: c.clean, irrelevant: c.irrelevant, crossLeaf: c.crossLeaf,
    topTokens: Object.entries(c.irrelevantTokens).sort((a,b)=>b[1]-a[1]).slice(0,5),
  })),
};

fs.writeFileSync(RESULT_JSON, JSON.stringify(report, null, 2));

console.log(`\n=== 결과 ===`);
console.log(`총 생성: ${counters.total}`);
console.log(`Clean (무관 토큰 0):   ${counters.clean} (${pct(counters.clean)}%)`);
console.log(`Has irrelevant:        ${counters.hasIrrelevant} (${pct(counters.hasIrrelevant)}%)`);
console.log(`Cross-leaf leak:       ${counters.crossLeaf} (${pct(counters.crossLeaf)}%)`);
console.log(`총 무관 토큰 인스턴스: ${counters.irrelevantTokenInstances}`);
console.log(`결과 저장: ${RESULT_JSON}`);
