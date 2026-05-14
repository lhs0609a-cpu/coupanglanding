// ============================================================
// 최종 종합 시뮬레이션: 16,259 카테고리 × 30 변형 = 487,770 노출명
// 검증: 1) cross-pollution  2) 쿠팡 SEO 룰셋  3) 옵션 수량 추출
// ============================================================
import fs from 'node:fs';

const DG = await import('../.build-test/lib/megaload/services/display-name-generator.js');
const Guard = await import('../.build-test/lib/megaload/services/cross-category-guard.js');
const OPT = await import('../.build-test/lib/megaload/services/option-extractor-test-shim.js');

const { generateDisplayName } = DG;
const { sanitizeCrossCategory, detectCrossCategory, classifyCategoryGroup } = Guard;

const CAT_INDEX = JSON.parse(fs.readFileSync('src/lib/megaload/data/coupang-cat-index.json', 'utf8'));
const ALL_CATS = CAT_INDEX.map(([code, fullSpace, leaf, depth]) => {
  const tokens = fullSpace.split(/\s+/).filter(Boolean);
  const leafParts = leaf.split(/[\s/(),\[\]]+/).filter(Boolean);
  const parentTokens = tokens.slice(0, Math.max(1, tokens.length - leafParts.length));
  const path = parentTokens.length > 0 ? parentTokens.join('>') + '>' + leaf : leaf;
  return { code, path, leaf, depth };
});

const VARIANTS = parseInt(process.env.VARIANTS || '30', 10);
const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const SHARD_COUNT = parseInt(process.env.SHARDS || '1', 10);
const SHARD_INDEX = parseInt(process.env.SHARD || '0', 10);
let SELECTED = LIMIT > 0 ? ALL_CATS.slice(0, LIMIT) : ALL_CATS;
if (SHARD_COUNT > 1) SELECTED = SELECTED.filter((_, i) => i % SHARD_COUNT === SHARD_INDEX);
const CATEGORIES = SELECTED;

console.log(`총 ${CATEGORIES.length}개 카테고리 × ${VARIANTS}개 변형 = ${CATEGORIES.length * VARIANTS}건`);

// ─── 30개 변형 입력 (실제 셀러가 입력하는 다양한 패턴) ─────────
const SELLERS = ['데일리홈', '메가샵', '베스트마켓', '프리미엄스토어', '한국유통', '코리아셀러', '굿라이프', '스마트홈', '에코프렌즈', '리빙플러스'];
const BRAND_SCEN = [
  { brand: '데일리', prefix: '데일리 프리미엄', suffix: '100g', qty: '1' },
  { brand: '베스트', prefix: '베스트 인기', suffix: '5개입', qty: '5' },
  { brand: '에코', prefix: '에코 친환경', suffix: '500ml', qty: '1' },
  { brand: '스마트', prefix: '스마트 신상품', suffix: '대용량 1kg', qty: '1' },
  { brand: '리빙', prefix: '리빙 명품', suffix: '500g', qty: '1' },
];

function buildVariants(cat, ci) {
  const leaf = cat.leaf;
  const leafBase = leaf.replace(/\/.+$/, '').trim();
  const v = [];

  // 1) leaf-only (3)
  v.push({ name: leafBase, brand: '데일리', seller: SELLERS[0], expectedQty: 1 });
  v.push({ name: `${leafBase} 1개`, brand: '베스트', seller: SELLERS[1], expectedQty: 1 });
  v.push({ name: `프리미엄 ${leafBase} 500g`, brand: '에코', seller: SELLERS[2], expectedQty: 1 });

  // 2) brand 시나리오 (5)
  for (let i = 0; i < BRAND_SCEN.length; i++) {
    const s = BRAND_SCEN[i];
    v.push({ name: `${s.prefix} ${leafBase} 인기상품 ${s.suffix}`, brand: s.brand, seller: SELLERS[(ci + i) % SELLERS.length], expectedQty: parseInt(s.qty) });
  }

  // 3) 수량/용량 변형 (10)
  const specs = [
    { spec: '1개', qty: 1 }, { spec: '2개입', qty: 2 }, { spec: '5개입', qty: 5 }, { spec: '10개입', qty: 10 },
    { spec: '50g', qty: 1 }, { spec: '200g', qty: 1 }, { spec: '500g', qty: 1 }, { spec: '1kg', qty: 1 },
    { spec: '500ml', qty: 1 }, { spec: '1L', qty: 1 },
  ];
  for (let i = 0; i < specs.length; i++) {
    v.push({ name: `${SELLERS[(ci + i) % SELLERS.length]} ${leafBase} ${specs[i].spec}`, brand: BRAND_SCEN[i % BRAND_SCEN.length].brand, seller: SELLERS[(ci + i) % SELLERS.length], expectedQty: specs[i].qty });
  }

  // 4) 노이즈 input (5)
  v.push({ name: `[정품] ${leafBase} 무료배송 특가 ★당일발송★ ${leafBase} ${leafBase}`, brand: '메가셀러', seller: SELLERS[(ci + 3) % SELLERS.length], expectedQty: 1 });
  v.push({ name: `${leafBase}/세트/모음 추천 베스트 인기 ${leafBase}`, brand: '데일리', seller: SELLERS[(ci + 4) % SELLERS.length], expectedQty: 1 });
  v.push({ name: `명품 ${leafBase} 대용량 신상품 ${leafBase} 효과만점 100% 보장`, brand: '프리미엄', seller: SELLERS[(ci + 5) % SELLERS.length], expectedQty: 1 });
  v.push({ name: `${leafBase} (대용량) 사은품 증정 리뷰이벤트 ${leafBase}`, brand: '에코', seller: SELLERS[(ci + 6) % SELLERS.length], expectedQty: 1 });
  v.push({ name: `이서진 추천 ${leafBase} 광고모델 ${leafBase} 베스트`, brand: '스마트', seller: SELLERS[(ci + 7) % SELLERS.length], expectedQty: 1 });

  // 5) 색상/사이즈 (7)
  const cs = ['블랙', '화이트', '레드', 'M사이즈', 'L사이즈', '대형', '소형'];
  for (let i = 0; i < cs.length; i++) {
    v.push({ name: `${SELLERS[(ci + i) % SELLERS.length]} ${leafBase} ${cs[i]} 100ml`, brand: BRAND_SCEN[(i + 2) % BRAND_SCEN.length].brand, seller: SELLERS[(ci + i + 2) % SELLERS.length], expectedQty: 1 });
  }

  return v.slice(0, VARIANTS);
}

// ─── 쿠팡 SEO 룰셋 ────────────────────────────────────────────
const HARD_MAX = 100;
const RECOMMENDED_MAX = 50;
const OPTIMAL_MIN = 20;
const MOBILE_FIRST = 40;
const BANNED_PROMO = ['무료배송', '당일발송', '특가', '할인', '세일', '사은품', '리뷰이벤트', '증정', '쿠폰', '적립', '이벤트'];
const BANNED_HYPE = ['최고', '최상', '최강', '최우수', '1위', '넘버원', 'NO.1', '완치', '100%', '효과만점', '치료', '의학적'];
const CELEBRITY = new Set(['이서진', '정우성', '전지현', '손예진', '공유', '김연아', '박서준', '송중기', '이민호', '차은우', '김수현', '현빈', '박보검', '송혜교', '유재석', '이광수', '김종국', '강호동', '이승기', '임영웅', '백종원', '안성재', '아이유', '수지', '제니', '지수']);
const SPECIAL = /[★☆●◆■◎※♥♡♬→←↑↓【】《》①②③④⑤]/u;

function validateSeo(name, leaf) {
  const len = name.length;
  const lower = name.toLowerCase();
  const first40 = name.slice(0, MOBILE_FIRST).toLowerCase();
  const issues = [];
  // length
  if (len > HARD_MAX) issues.push('hardMaxExceeded');
  if (len < OPTIMAL_MIN) issues.push('tooShort');
  if (len > RECOMMENDED_MAX) issues.push('overRecommended');
  // leaf
  const lTokens = leaf.split(/[\/·\s\(\)\[\],+&\-_]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
  const leafIn = lTokens.some(t => lower.includes(t));
  const leafFirst = lTokens.some(t => first40.includes(t));
  if (!leafIn) issues.push('leafMissing');
  else if (!leafFirst) issues.push('leafLateInTitle');
  // dup
  const tokens = name.split(/[\s,·/\(\)\[\]+&_]+/).map(t => t.trim().toLowerCase()).filter(t => t.length >= 2);
  const counts = new Map();
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
  let dup3 = 0, dup2 = 0;
  for (const [, c] of counts) { if (c >= 3) dup3++; else if (c === 2) dup2++; }
  if (dup3 > 0) issues.push('keywordStuffing');
  else if (dup2 >= 2) issues.push('mildRepetition');
  // banned
  for (const b of BANNED_PROMO) if (lower.includes(b.toLowerCase())) { issues.push('promoBanned'); break; }
  for (const b of BANNED_HYPE) if (lower.includes(b.toLowerCase())) { issues.push('hypeBanned'); break; }
  for (const c of CELEBRITY) if (name.includes(c)) { issues.push('celebrityLeak'); break; }
  if (SPECIAL.test(name)) issues.push('specialChars');
  // tokens
  const meaningful = tokens.filter(t => t.length >= 2);
  if (meaningful.length < 3) issues.push('tooFewTokens');
  if (meaningful.length > 12) issues.push('tooManyTokens');
  return issues;
}

// SEO 점수 계산 (높을수록 좋음, 0~100)
function seoScore(name, leaf) {
  const issues = validateSeo(name, leaf);
  let score = 100;
  // 치명적
  if (issues.includes('hardMaxExceeded')) score -= 50;
  if (issues.includes('tooShort')) score -= 30;
  if (issues.includes('leafMissing')) score -= 40;
  if (issues.includes('keywordStuffing')) score -= 25;
  if (issues.includes('promoBanned')) score -= 30;
  if (issues.includes('hypeBanned')) score -= 25;
  if (issues.includes('celebrityLeak')) score -= 35;
  // 중간
  if (issues.includes('overRecommended')) score -= 10;
  if (issues.includes('leafLateInTitle')) score -= 8;
  if (issues.includes('mildRepetition')) score -= 5;
  if (issues.includes('specialChars')) score -= 10;
  if (issues.includes('tooFewTokens')) score -= 15;
  if (issues.includes('tooManyTokens')) score -= 5;
  return Math.max(0, score);
}

// ─── 옵션 수량 검증 ───────────────────────────────────────────
function validateOption(generatedName, expectedQty) {
  // generatedName 끝부분에 수량 확인 (Xkg, X개입, X정 등)
  // expectedQty 가 1 외이면 sellerName에 명시되어 있어야 함
  if (expectedQty === 1) return { ok: true };
  const re = new RegExp(`${expectedQty}\\s*(?:개입?|정|포|캡슐|병|박스|팩|set|세트)`, 'i');
  return { ok: re.test(generatedName), expected: expectedQty };
}

// ─── 메인 ─────────────────────────────────────────────────────
const counters = {
  total: 0,
  seoIssues: {},
  crossPollutionIssues: 0,
  optionMismatch: 0,
  scoreSum: 0,
  scoreBuckets: { '90-100': 0, '80-89': 0, '70-79': 0, '60-69': 0, '<60': 0 },
  groupStats: {},
  lengthBuckets: { '<20': 0, '20-30': 0, '31-40': 0, '41-50': 0, '51-70': 0, '71-100': 0, '>100': 0 },
};
const failureSamples = { cross: [], seo: [], option: [] };

const startedAt = Date.now();
const shardTag = SHARD_COUNT > 1 ? `.shard${SHARD_INDEX}-of-${SHARD_COUNT}` : '';
const PROGRESS = `simulate-final-487k-progress${shardTag}.log`;
fs.writeFileSync(PROGRESS, `START ${new Date().toISOString()} | ${CATEGORIES.length} × ${VARIANTS}\n`);

for (let ci = 0; ci < CATEGORIES.length; ci++) {
  const cat = CATEGORIES[ci];
  const variants = buildVariants(cat, ci);
  const group = classifyCategoryGroup(cat.path);
  if (!counters.groupStats[group]) counters.groupStats[group] = { total: 0, cross: 0, seoFail: 0, optFail: 0, scoreSum: 0 };

  for (let vi = 0; vi < variants.length; vi++) {
    const v = variants[vi];
    let name;
    try {
      name = generateDisplayName(v.name, v.brand, cat.path, v.seller, vi);
    } catch (e) {
      name = '';
      counters.seoIssues['generationError'] = (counters.seoIssues['generationError'] || 0) + 1;
      continue;
    }
    counters.total++;
    counters.groupStats[group].total++;

    // 1) cross-pollution
    const crossDetected = detectCrossCategory(name, cat.path);
    if (crossDetected.length > 0) {
      counters.crossPollutionIssues++;
      counters.groupStats[group].cross++;
      if (failureSamples.cross.length < 30) failureSamples.cross.push({ path: cat.path, name, detected: crossDetected });
    }

    // 2) SEO
    const issues = validateSeo(name, cat.leaf);
    for (const i of issues) counters.seoIssues[i] = (counters.seoIssues[i] || 0) + 1;
    if (issues.length > 0) {
      counters.groupStats[group].seoFail++;
      if (failureSamples.seo.length < 30 && issues.some(i => ['hardMaxExceeded', 'leafMissing', 'keywordStuffing', 'promoBanned', 'hypeBanned', 'celebrityLeak'].includes(i))) {
        failureSamples.seo.push({ path: cat.path, name, issues });
      }
    }

    // 3) SEO 점수
    const score = seoScore(name, cat.leaf);
    counters.scoreSum += score;
    counters.groupStats[group].scoreSum += score;
    if (score >= 90) counters.scoreBuckets['90-100']++;
    else if (score >= 80) counters.scoreBuckets['80-89']++;
    else if (score >= 70) counters.scoreBuckets['70-79']++;
    else if (score >= 60) counters.scoreBuckets['60-69']++;
    else counters.scoreBuckets['<60']++;

    // 4) 옵션 수량
    const optResult = validateOption(name, v.expectedQty);
    if (!optResult.ok) {
      counters.optionMismatch++;
      counters.groupStats[group].optFail++;
      if (failureSamples.option.length < 30) failureSamples.option.push({ path: cat.path, name, expected: v.expectedQty, original: v.name });
    }

    // 5) length bucket
    const L = name.length;
    if (L < 20) counters.lengthBuckets['<20']++;
    else if (L <= 30) counters.lengthBuckets['20-30']++;
    else if (L <= 40) counters.lengthBuckets['31-40']++;
    else if (L <= 50) counters.lengthBuckets['41-50']++;
    else if (L <= 70) counters.lengthBuckets['51-70']++;
    else if (L <= 100) counters.lengthBuckets['71-100']++;
    else counters.lengthBuckets['>100']++;
  }

  if ((ci + 1) % 100 === 0 || ci === CATEGORIES.length - 1) {
    const elapsed = (Date.now() - startedAt) / 1000;
    const rate = counters.total / elapsed;
    const eta = (CATEGORIES.length - ci - 1) * VARIANTS / rate;
    const msg = `[${ci + 1}/${CATEGORIES.length}] ${counters.total}건 | ${rate.toFixed(0)}/s | ETA ${eta.toFixed(0)}s | cross:${counters.crossPollutionIssues} optFail:${counters.optionMismatch} avgScore:${(counters.scoreSum / counters.total).toFixed(1)}`;
    fs.writeFileSync(PROGRESS, msg + '\n', { flag: 'a' });
    process.stdout.write(`\r${msg}            `);
  }
}

const elapsed = (Date.now() - startedAt) / 1000;
const avgScore = counters.scoreSum / counters.total;

console.log(`\n\n=== 최종 시뮬레이션 완료 (${elapsed.toFixed(0)}s) ===\n`);
console.log(`전체 노출명 생성: ${counters.total.toLocaleString()}건`);
console.log(`평균 SEO 점수: ${avgScore.toFixed(1)}/100`);
console.log();

console.log('=== 1. Cross-Pollution (어떤 단어든 카테고리 무관) ===');
console.log(`발생: ${counters.crossPollutionIssues}건 (${(100 * counters.crossPollutionIssues / counters.total).toFixed(3)}%)`);
console.log(`Clean: ${counters.total - counters.crossPollutionIssues}건 (${(100 * (counters.total - counters.crossPollutionIssues) / counters.total).toFixed(3)}%)`);
console.log();

console.log('=== 2. 쿠팡 SEO 룰셋 검증 ===');
console.log('이슈 종류                건수    %');
const seoSorted = Object.entries(counters.seoIssues).sort((a, b) => b[1] - a[1]);
for (const [issue, count] of seoSorted) {
  console.log(`  ${issue.padEnd(22)} ${count.toString().padStart(8)}  ${(100 * count / counters.total).toFixed(2)}%`);
}
console.log();

console.log('=== 3. 옵션 수량 추출 정확성 ===');
console.log(`불일치: ${counters.optionMismatch}건 (${(100 * counters.optionMismatch / counters.total).toFixed(3)}%)`);
console.log(`정확: ${counters.total - counters.optionMismatch}건 (${(100 * (counters.total - counters.optionMismatch) / counters.total).toFixed(3)}%)`);
console.log();

console.log('=== 4. SEO 점수 분포 ===');
for (const [b, c] of Object.entries(counters.scoreBuckets)) {
  const pct = (100 * c / counters.total).toFixed(1);
  console.log(`  ${b}점: ${c.toLocaleString().padStart(8)}건 (${pct}%)`);
}
console.log();

console.log('=== 5. 길이 분포 ===');
for (const [b, c] of Object.entries(counters.lengthBuckets)) {
  const pct = (100 * c / counters.total).toFixed(1);
  console.log(`  ${b.padEnd(8)}: ${c.toLocaleString().padStart(8)}건 (${pct}%)`);
}
console.log();

console.log('=== 6. 그룹별 통계 ===');
console.log('그룹               전체     cross     SEO실패  옵션실패  평균점수');
const groupSorted = Object.entries(counters.groupStats).sort((a, b) => b[1].total - a[1].total);
for (const [g, s] of groupSorted) {
  const avg = s.total > 0 ? (s.scoreSum / s.total).toFixed(1) : '-';
  console.log(`  ${g.padEnd(18)} ${s.total.toString().padStart(7)}  ${s.cross.toString().padStart(7)}  ${s.seoFail.toString().padStart(7)}  ${s.optFail.toString().padStart(7)}  ${avg.toString().padStart(7)}`);
}
console.log();

if (failureSamples.cross.length > 0) {
  console.log('=== Cross-pollution 샘플 (최대 10) ===');
  for (const s of failureSamples.cross.slice(0, 10)) {
    console.log(`  [${s.path}] "${s.name}" → ${s.detected.join(', ')}`);
  }
  console.log();
}

if (failureSamples.seo.length > 0) {
  console.log('=== SEO 치명적 실패 샘플 (최대 10) ===');
  for (const s of failureSamples.seo.slice(0, 10)) {
    console.log(`  [${s.path}] "${s.name}" → [${s.issues.join(', ')}]`);
  }
  console.log();
}

if (failureSamples.option.length > 0) {
  console.log('=== 옵션 수량 불일치 샘플 (최대 10) ===');
  for (const s of failureSamples.option.slice(0, 10)) {
    console.log(`  [${s.path}] 입력:"${s.original}" → 출력:"${s.name}" (예상수량 ${s.expected})`);
  }
}

const reportPath = `./scripts/verification-reports/simulate-final-487k${shardTag}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
fs.writeFileSync(reportPath, JSON.stringify({
  summary: { total: counters.total, elapsed, avgScore, crossPollution: counters.crossPollutionIssues, optionMismatch: counters.optionMismatch },
  seoIssues: counters.seoIssues,
  scoreBuckets: counters.scoreBuckets,
  lengthBuckets: counters.lengthBuckets,
  groupStats: counters.groupStats,
  failureSamples,
}, null, 2));
console.log(`\n전체 결과: ${reportPath}`);
