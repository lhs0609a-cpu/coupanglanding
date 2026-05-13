#!/usr/bin/env node
// ============================================================
// 16,259 카테고리 × 30개 노출상품명 생성 → 쿠팡 SEO 종합 검증
// ============================================================
// 입력: src/lib/megaload/data/coupang-cat-index.json (전체 카테고리)
// 생성: 우리 generateDisplayName() — 카테고리당 30개 (다양한 셀러/상품 시드)
// 검증: 온라인 쿠팡 SEO 가이드 기반 룰셋 (length/keyword/banned/stuffing/etc.)
// ============================================================

import fs from 'node:fs';

const GEN = await import('../.build-test/lib/megaload/services/display-name-generator.js');
const { generateDisplayName } = GEN;

const CAT_INDEX = JSON.parse(
  fs.readFileSync('src/lib/megaload/data/coupang-cat-index.json', 'utf8'),
);
// 형식: [[code, fullSpace, leaf, depth], ...]
const ALL_CATS = CAT_INDEX.map(([code, fullSpace, leaf, depth]) => {
  const tokens = fullSpace.split(/\s+/).filter(Boolean);
  const leafParts = leaf.split(/[\s/(),\[\]]+/).filter(Boolean);
  const parentTokens = tokens.slice(0, Math.max(1, tokens.length - leafParts.length));
  const path = parentTokens.length > 0 ? parentTokens.join('>') + '>' + leaf : leaf;
  return { code, path, leaf, depth };
});

const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const VARIANTS = parseInt(process.env.VARIANTS || '30', 10);
const SHARD_COUNT = parseInt(process.env.SHARDS || '1', 10);
const SHARD_INDEX = parseInt(process.env.SHARD || '0', 10);

let SELECTED = LIMIT > 0 ? ALL_CATS.slice(0, LIMIT) : ALL_CATS;
if (SHARD_COUNT > 1) {
  SELECTED = SELECTED.filter((_, i) => i % SHARD_COUNT === SHARD_INDEX);
}
const CATEGORIES = SELECTED;

console.log(`Shard ${SHARD_INDEX}/${SHARD_COUNT} | 카테고리 ${CATEGORIES.length} × ${VARIANTS} = ${CATEGORIES.length * VARIANTS}건`);

// ─── 30개 변형 입력(원본 상품명 + 셀러 시나리오) ────────────
const SELLERS = [
  '데일리홈', '메가샵', '베스트마켓', '프리미엄스토어', '한국유통',
  '코리아셀러', '굿라이프', '스마트홈', '에코프렌즈', '리빙플러스',
];
const BRAND_SCENARIOS = [
  { brand: '데일리', prefix: '데일리 프리미엄', suffix: '100g' },
  { brand: '베스트', prefix: '베스트 인기', suffix: '1개' },
  { brand: '에코', prefix: '에코 친환경', suffix: '500ml' },
  { brand: '스마트', prefix: '스마트 신상품', suffix: '대용량' },
  { brand: '리빙', prefix: '리빙 명품', suffix: '500g' },
];

function buildVariants(cat, ci) {
  const leaf = cat.leaf;
  const leafBase = leaf.replace(/\/.+$/, '').trim();
  const variants = [];

  // 1) 단순 leaf-only (3개)
  variants.push({ name: `${leafBase}`, brand: '데일리', seller: SELLERS[0] });
  variants.push({ name: `${leafBase} 1개`, brand: '베스트', seller: SELLERS[1] });
  variants.push({ name: `프리미엄 ${leafBase} 500g`, brand: '에코', seller: SELLERS[2] });

  // 2) brand 시나리오 5개 — 노이즈 추가
  for (let i = 0; i < BRAND_SCENARIOS.length; i++) {
    const s = BRAND_SCENARIOS[i];
    variants.push({
      name: `${s.prefix} ${leafBase} 인기상품 ${s.suffix}`,
      brand: s.brand,
      seller: SELLERS[(ci + i) % SELLERS.length],
    });
  }

  // 3) 수량/용량 변형 (10개)
  const specs = ['1개', '2개입', '5개입', '10개입', '50g', '200g', '500g', '1kg', '500ml', '1L'];
  for (let i = 0; i < specs.length; i++) {
    variants.push({
      name: `${SELLERS[(ci + i) % SELLERS.length]} ${leafBase} ${specs[i]}`,
      brand: BRAND_SCENARIOS[i % BRAND_SCENARIOS.length].brand,
      seller: SELLERS[(ci + i) % SELLERS.length],
    });
  }

  // 4) 노이즈 input 5개 — 셀러 SEO 오염
  variants.push({
    name: `[정품] ${leafBase} 무료배송 특가 ★당일발송★ ${leafBase} ${leafBase}`,
    brand: '메가셀러',
    seller: SELLERS[(ci + 3) % SELLERS.length],
  });
  variants.push({
    name: `${leafBase}/세트/모음 추천 베스트 인기 ${leafBase}`,
    brand: '데일리',
    seller: SELLERS[(ci + 4) % SELLERS.length],
  });
  variants.push({
    name: `명품 ${leafBase} 대용량 신상품 ${leafBase} 효과만점 100% 보장`,
    brand: '프리미엄',
    seller: SELLERS[(ci + 5) % SELLERS.length],
  });
  variants.push({
    name: `${leafBase} (대용량) 사은품 증정 리뷰이벤트 ${leafBase}`,
    brand: '에코',
    seller: SELLERS[(ci + 6) % SELLERS.length],
  });
  variants.push({
    name: `이서진 추천 ${leafBase} 광고모델 ${leafBase} 베스트`,
    brand: '스마트',
    seller: SELLERS[(ci + 7) % SELLERS.length],
  });

  // 5) 복합 (7개) — brand 다중, 색상/사이즈
  const colorSize = ['블랙', '화이트', '레드', 'M사이즈', 'L사이즈', '대형', '소형'];
  for (let i = 0; i < colorSize.length; i++) {
    variants.push({
      name: `${SELLERS[(ci + i) % SELLERS.length]} ${leafBase} ${colorSize[i]} 100ml`,
      brand: BRAND_SCENARIOS[(i + 2) % BRAND_SCENARIOS.length].brand,
      seller: SELLERS[(ci + i + 2) % SELLERS.length],
    });
  }

  return variants.slice(0, VARIANTS);
}

// ─── 쿠팡 SEO 룰셋 (온라인 가이드 기반) ───────────────────────
// 1. HARD MAX: 100자 (쿠팡 시스템 강제 제한; 초과 시 등록 실패)
// 2. RECOMMENDED: ≤50자
// 3. OPTIMAL: 20~50자, mobile-safe (40자 이내 핵심 키워드)
// 4. 카테고리 leaf 키워드가 첫 40자 안에 포함
// 5. 동일 단어 3회 이상 반복 금지 (키워드 스터핑)
// 6. 광고성/효능 금지 표현: 최고/최상/완치/효과/100%/무료배송/특가/할인/세일/사은품/이벤트/증정
// 7. 의미 토큰 수: 3~8개 권장
// 8. 특수문자: 사용 자제 (한글/영문/숫자/공백/일부 단위 외)
// 9. 연예인/유명인 이름 금지

const BANNED_PROMO = [
  '무료배송', '당일발송', '특가', '할인', '세일', '사은품', '리뷰이벤트',
  '증정', '쿠폰', '적립', '이벤트',
];
const BANNED_HYPE = [
  '최고', '최상', '최강', '최우수', '1위', '넘버원', 'NO.1', '완치', '100%',
  '효과만점', '치료', '의학적', '식약처인증최고',
];
const BANNED_DUPLICATE_MARKERS = [
  '상품상세참조', '상세페이지참조', '상페참조', '참조', '상세참조',
];
const CELEBRITY_NAMES = new Set([
  '이서진', '정우성', '전지현', '손예진', '공유', '김연아', '박서준',
  '송중기', '이민호', '차은우', '김수현', '현빈', '박보검', '송혜교',
  '유재석', '이광수', '김종국', '강호동', '이승기', '임영웅',
  '백종원', '안성재', '아이유', '수지', '제니', '지수',
]);

const HARD_MAX = 100;
const RECOMMENDED_MAX = 50;
const OPTIMAL_MIN = 20;
const MOBILE_FIRST = 40;

function tokenize(name) {
  // 한글 토큰 (2자 이상) + 단위 토큰 + 영문/숫자
  return name.split(/[\s,·/\(\)\[\]+&_]+/).map(t => t.trim()).filter(Boolean);
}

function countDuplicateTokens(name) {
  const tokens = tokenize(name).map(t => t.toLowerCase());
  const counts = new Map();
  for (const t of tokens) {
    if (t.length < 2) continue;
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  let dup3plus = 0;
  let dup2 = 0;
  for (const [, c] of counts) {
    if (c >= 3) dup3plus++;
    else if (c === 2) dup2++;
  }
  return { dup3plus, dup2 };
}

function leafTokens(leaf) {
  // leaf "비타민/미네랄" → ["비타민", "미네랄"]
  return leaf.split(/[\/·\s\(\)\[\],+&\-_]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
}

function validateName(name, cat) {
  const len = name.length;
  const first40 = name.slice(0, MOBILE_FIRST);
  const lower = name.toLowerCase();
  const first40Lower = first40.toLowerCase();
  const lTokens = leafTokens(cat.leaf);

  const issues = [];

  // 1) Hard length
  if (len > HARD_MAX) issues.push('hardMaxExceeded');
  if (len < OPTIMAL_MIN) issues.push('tooShort');
  if (len > RECOMMENDED_MAX) issues.push('overRecommended');

  // 2) Category leaf inclusion
  const leafInAll = lTokens.some(t => lower.includes(t));
  const leafInFirst40 = lTokens.some(t => first40Lower.includes(t));
  if (!leafInAll) issues.push('leafMissing');
  else if (!leafInFirst40) issues.push('leafLateInTitle');

  // 3) 중복/스터핑
  const { dup3plus, dup2 } = countDuplicateTokens(name);
  if (dup3plus > 0) issues.push('keywordStuffing');
  else if (dup2 >= 2) issues.push('mildRepetition');

  // 4) 광고성/판촉 금지
  for (const b of BANNED_PROMO) {
    if (lower.includes(b.toLowerCase())) { issues.push('promoBanned'); break; }
  }
  // 5) 효능/과장 금지
  for (const b of BANNED_HYPE) {
    if (lower.includes(b.toLowerCase())) { issues.push('hypeBanned'); break; }
  }
  // 6) 참조 마커
  for (const b of BANNED_DUPLICATE_MARKERS) {
    if (lower.includes(b.toLowerCase())) { issues.push('referenceMarker'); break; }
  }
  // 7) 연예인 이름
  for (const c of CELEBRITY_NAMES) {
    if (name.includes(c)) { issues.push('celebrityLeak'); break; }
  }
  // 8) 토큰 개수 — 3~10개
  const toks = tokenize(name);
  const meaningful = toks.filter(t => t.length >= 2);
  if (meaningful.length < 3) issues.push('tooFewTokens');
  if (meaningful.length > 10) issues.push('tooManyTokens');

  // 9) 특수문자 (★, ●, ※, 【】, 큰따옴표 등)
  if (/[★☆●◆■◎※♥♡♬→←↑↓【】《》①②③④⑤]/u.test(name)) issues.push('specialChars');

  return issues;
}

// ─── 실행 ──────────────────────────────────────────────────
const counters = {
  total: 0,
  pass: 0,
  byIssue: {},
  lengthBuckets: { '<20': 0, '20-30': 0, '31-40': 0, '41-50': 0, '51-70': 0, '71-100': 0, '>100': 0 },
};
const failureSamples = {}; // issue → up to 5 samples
const categoryStats = []; // 카테고리당 pass/fail 카운트

const startedAt = Date.now();
const shardTag = SHARD_COUNT > 1 ? `.shard${SHARD_INDEX}-of-${SHARD_COUNT}` : '';
const PROGRESS_LOG = `simulate-30x-seo-progress${shardTag}.log`;
const RESULT_JSON = `simulate-30x-seo-result${shardTag}.json`;
fs.writeFileSync(PROGRESS_LOG, `START ${new Date().toISOString()} | ${CATEGORIES.length} × ${VARIANTS}\n`);

function logProgress(msg) {
  fs.writeFileSync(PROGRESS_LOG, `[${new Date().toISOString()}] ${msg}\n`, { flag: 'a' });
  console.log(msg);
}

// 결과는 메모리에 다 들고 있지 않고, 카테고리별 요약만 저장
for (let ci = 0; ci < CATEGORIES.length; ci++) {
  const cat = CATEGORIES[ci];
  const variants = buildVariants(cat, ci);
  const catBucket = { code: cat.code, path: cat.path, leaf: cat.leaf, pass: 0, fail: 0, issues: {} };

  for (let vi = 0; vi < variants.length; vi++) {
    const v = variants[vi];
    let name;
    try {
      name = generateDisplayName(v.name, v.brand, cat.path, v.seller, vi);
    } catch (err) {
      name = '';
      counters.byIssue['generationError'] = (counters.byIssue['generationError'] || 0) + 1;
      continue;
    }
    counters.total++;

    // length bucket
    const L = name.length;
    if (L < 20) counters.lengthBuckets['<20']++;
    else if (L <= 30) counters.lengthBuckets['20-30']++;
    else if (L <= 40) counters.lengthBuckets['31-40']++;
    else if (L <= 50) counters.lengthBuckets['41-50']++;
    else if (L <= 70) counters.lengthBuckets['51-70']++;
    else if (L <= 100) counters.lengthBuckets['71-100']++;
    else counters.lengthBuckets['>100']++;

    const issues = validateName(name, cat);
    // hardMaxExceeded, leafMissing, keywordStuffing, promoBanned, hypeBanned,
    // referenceMarker, celebrityLeak, tooFewTokens, specialChars are FAIL
    // overRecommended, tooShort, leafLateInTitle, mildRepetition, tooManyTokens are WARN
    const FAIL_TYPES = new Set([
      'hardMaxExceeded', 'leafMissing', 'keywordStuffing',
      'promoBanned', 'hypeBanned', 'referenceMarker',
      'celebrityLeak', 'tooFewTokens', 'specialChars',
    ]);
    const failed = issues.some(i => FAIL_TYPES.has(i));

    if (!failed) {
      counters.pass++;
      catBucket.pass++;
    } else {
      catBucket.fail++;
    }
    for (const i of issues) {
      counters.byIssue[i] = (counters.byIssue[i] || 0) + 1;
      catBucket.issues[i] = (catBucket.issues[i] || 0) + 1;
      if (!failureSamples[i]) failureSamples[i] = [];
      if (failureSamples[i].length < 5) {
        failureSamples[i].push({
          cat: cat.path, leaf: cat.leaf, input: v.name, brand: v.brand,
          generated: name, len: name.length,
        });
      }
    }
  }

  categoryStats.push(catBucket);

  if ((ci + 1) % 1000 === 0) {
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(0);
    const rate = ((ci + 1) / parseFloat(elapsedSec || '1')).toFixed(1);
    const eta = (((CATEGORIES.length - (ci + 1)) / parseFloat(rate || '1')) / 60).toFixed(1);
    logProgress(
      `[${ci + 1}/${CATEGORIES.length}] ${((ci + 1) / CATEGORIES.length * 100).toFixed(1)}% ` +
      `| ${elapsedSec}s @ ${rate}cat/s | ETA ${eta}min ` +
      `| pass ${counters.pass}/${counters.total} (${(counters.pass / Math.max(1, counters.total) * 100).toFixed(1)}%)`,
    );
  }
}

const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
logProgress(`DONE in ${elapsedSec}s`);

// 카테고리별 worst 정렬 (fail율 기준)
categoryStats.sort((a, b) => (b.fail - a.fail) || (b.pass + b.fail - (a.pass + a.fail)));
const worst30 = categoryStats.slice(0, 30).map(c => ({
  code: c.code, path: c.path, leaf: c.leaf, pass: c.pass, fail: c.fail, issues: c.issues,
}));
// best (모두 통과)
const best30 = categoryStats.filter(c => c.fail === 0).slice(0, 30).map(c => ({
  code: c.code, path: c.path, leaf: c.leaf, pass: c.pass,
}));

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
    pass: counters.pass,
    fail: counters.total - counters.pass,
    passRate: pct(counters.pass),
  },
  lengthDistribution: counters.lengthBuckets,
  issueBreakdown: Object.fromEntries(
    Object.entries(counters.byIssue)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, { count: v, pct: pct(v) }]),
  ),
  failureSamples,
  worstCategories: worst30,
  bestCategoriesSample: best30,
};

fs.writeFileSync(RESULT_JSON, JSON.stringify(report, null, 2));

console.log(`\n=== 최종 결과 ===`);
console.log(`총 생성: ${counters.total}`);
console.log(`PASS:    ${counters.pass} (${pct(counters.pass)}%)`);
console.log(`FAIL:    ${counters.total - counters.pass} (${pct(counters.total - counters.pass)}%)`);
console.log(`\n길이 분포:`);
for (const [k, v] of Object.entries(counters.lengthBuckets)) {
  console.log(`  ${k}: ${v} (${pct(v)}%)`);
}
console.log(`\n주요 이슈:`);
for (const [k, v] of Object.entries(counters.byIssue).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v} (${pct(v)}%)`);
}
console.log(`\n결과 저장: ${RESULT_JSON}`);
