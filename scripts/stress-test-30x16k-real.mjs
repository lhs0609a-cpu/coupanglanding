/**
 * stress-test-30x16k-real.mjs
 *
 * 16,259 카테고리 × 30개 가상 상품명 = 487,770개 노출명 stress test.
 *
 * 가상 상품명 패턴 30개:
 *   - 짧은/긴, 마케팅 노이즈, 연예인, 영문혼재, 다중성분 등
 *   - 실제 셀러 input 다양성 시뮬레이션
 *
 * 측정 항목:
 *   1. leaf 골든존 포함률
 *   2. 평균 점수
 *   3. 카테고리 내 30개간 다양성 (토큰 union/intersection)
 *   4. 검색량 매칭률 (rich 카테고리)
 *   5. 노이즈 누출 (브랜드/연예인/마케팅)
 *   6. 모바일 40자 잘림 비율
 *   7. 카테고리별 worst case
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dn = await import('../.build-test/lib/megaload/services/display-name-generator.js');
const gz = await import('../.build-test/lib/megaload/services/mobile-golden-zone.js');
const v2r = await import('../.build-test/lib/megaload/services/v2-pool-resolver.js');
const { generateDisplayName } = dn;
const { auditGoldenZone } = gz;
const { getDataQuality, getV2Pool } = v2r;

const COUPANG_DETAILS_PATH = join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-details.json');
const OUT_PATH = join(__dirname, 'stress-test-result.json');

const coupangDetails = JSON.parse(readFileSync(COUPANG_DETAILS_PATH, 'utf8'));
const allCats = [];
for (const [, v] of Object.entries(coupangDetails)) {
  if (v && v.p) {
    const segs = v.p.split('>');
    allCats.push({ path: v.p, leaf: segs[segs.length - 1] });
  }
}
console.log(`총 카테고리: ${allCats.length}`);

// ─── 가상 상품명 30개 패턴 ─────────────────────────
const FAKE_BRANDS = [
  '베스트셀러', '하이퀄리티', '데일리', 'SS상회', '코리아몰',
  '슈퍼마켓', '굿컴퍼니', '프라임샵', '월드클래스', '스마일',
  '애터미', '닥터케어', '바이오랩', '내츄럴', '오가닉',
];

// 다양한 노이즈 토큰 (실제 셀러가 자주 넣는)
const NOISE_PHRASES = [
  '★특가★', '【무료배송】', '[당일발송]', '＊한정수량＊',
  '쿠폰적용', '리뷰이벤트', '핫딜', '오늘출발',
];

const CELEBRITIES = ['정유미', '한혜진', '이서진', '백종원'];

function buildFakeProducts(leaf, l1) {
  const leafBase = leaf.replace(/\/.+$/, '').trim() || leaf;
  const brand = FAKE_BRANDS[Math.floor(Math.random() * FAKE_BRANDS.length)];

  return [
    // 1. 가장 단순
    `${leafBase}`,
    // 2. brand + leaf
    `${brand} ${leafBase}`,
    // 3. brand + leaf + spec
    `${brand} ${leafBase} 100g`,
    // 4. with origin
    `국내산 ${leafBase} 산지직송`,
    // 5. with features
    `${leafBase} 유기농 무첨가 프리미엄`,
    // 6. noise marketing
    `${NOISE_PHRASES[0]} ${leafBase} 무료배송 당일발송`,
    // 7. mixed Korean+English
    `${leafBase} Premium Best Quality`,
    // 8. with celebrity (IP 리스크 테스트)
    `${CELEBRITIES[0]} 추천 ${leafBase}`,
    // 9. complex
    `이탈리아 천연 ${leafBase} 500ml 명품`,
    // 10. noisy seller text
    `[${brand}] ${leafBase} 100% 무료배송 핫딜`,
    // 11. ingredients heavy
    `${leafBase} 콜라겐 비타민 칼슘 마그네슘 알로에`,
    // 12. minimal Korean
    `한국 ${leafBase}`,
    // 13. English heavy
    `${leafBase} Made in Korea Premium Edition`,
    // 14. size
    `대형 ${leafBase} 특대 사이즈`,
    // 15. color
    `블랙 ${leafBase} 화이트`,
    // 16. purpose
    `선물용 ${leafBase} 명절 답례품`,
    // 17. audience
    `여성용 ${leafBase} 남성용`,
    // 18. seasonal
    `겨울 ${leafBase} 사계절`,
    // 19. comparison/info noise
    `${leafBase} 추천 비교 후기`,
    // 20. badge
    `1+1 ${leafBase} 1+2`,
    // 21. pack
    `${leafBase} 5개입 세트 묶음`,
    // 22. count
    `${leafBase} 1봉지 30정`,
    // 23. dual marketing
    `정품 ${leafBase} 정식수입 KC인증`,
    // 24. mixed promo
    `${leafBase} 신상 NEW 한정`,
    // 25. info form
    `${leafBase} 사용기 후기 추천 종류`,
    // 26. very short
    `${leafBase}`,
    // 27. rich keywords
    `${leafBase} 천연 유기농 100% 무첨가 산지직송 프리미엄`,
    // 28. wholesale
    `${leafBase} 도매 대량 사업자`,
    // 29. premium emphasis
    `프리미엄 ${leafBase} 명품 럭셔리 한정판`,
    // 30. complex with brand + spec + claim
    `${brand} ${leafBase} 비타민C 풍부 1000mg 60정 30일분`,
  ];
}

// ─── 측정 ─────────────────────────
const stats = {
  totalCats: 0,
  totalNames: 0,
  errorCount: 0,
  leafIncluded: 0,
  scoreSum: 0,
  goldenLengthSum: 0,
  coreKwSum: 0,
  truncatedCount: 0,
  excellentCount: 0,
  goodCount: 0,
  fairCount: 0,
  poorCount: 0,
  // 노이즈 누출 — 셀러 input의 노이즈가 노출명에 그대로 들어갔는지
  celebrityLeak: 0,
  marketingNoiseLeak: 0,
  emptyDisplayName: 0,
  // 검색량 매칭 (rich 카테고리만)
  topRelatedTotal: 0,
  topRelatedMatches: 0,
  // 데이터 품질
  byQuality: { rich: { cnt: 0, scoreSum: 0 }, minimal: { cnt: 0, scoreSum: 0 }, fallback: { cnt: 0, scoreSum: 0 } },
};

// 카테고리별 통계 (worst case 추출용)
const categoryStats = [];
const worstSamples = [];

const start = Date.now();
let processed = 0;

for (const { path, leaf } of allCats) {
  stats.totalCats++;
  const segs = path.split('>');
  const l1 = segs[0];
  const products = buildFakeProducts(leaf, l1);
  const quality = getDataQuality(path);
  const v2 = getV2Pool(path);

  // 카테고리 30개 결과
  const tokensSet = new Set(); // 카테고리 내 union (다양성 측정)
  let catScoreSum = 0;
  let catLeafIn = 0;
  let catTruncated = 0;
  let worstInCat = null;

  for (let i = 0; i < products.length; i++) {
    const productName = products[i];
    const sellerSeed = `seller-${i}`;
    let displayName;
    try {
      displayName = generateDisplayName(productName, FAKE_BRANDS[i % FAKE_BRANDS.length], path, sellerSeed, i);
    } catch (err) {
      stats.errorCount++;
      continue;
    }

    if (!displayName || displayName.trim().length === 0) {
      stats.emptyDisplayName++;
      continue;
    }

    stats.totalNames++;

    const audit = auditGoldenZone(displayName, path);
    if (audit.hasLeafToken) { stats.leafIncluded++; catLeafIn++; }
    stats.scoreSum += audit.score;
    catScoreSum += audit.score;
    stats.goldenLengthSum += audit.goldenLength;
    stats.coreKwSum += audit.coreKeywordCount;
    if (audit.truncated) { stats.truncatedCount++; catTruncated++; }

    if (audit.score >= 80) stats.excellentCount++;
    else if (audit.score >= 60) stats.goodCount++;
    else if (audit.score >= 40) stats.fairCount++;
    else stats.poorCount++;

    // 노이즈 누출 검사
    for (const c of CELEBRITIES) {
      if (displayName.includes(c)) { stats.celebrityLeak++; break; }
    }
    for (const n of ['특가', '무료배송', '핫딜', '리뷰이벤트', '쿠폰적용']) {
      if (displayName.includes(n)) { stats.marketingNoiseLeak++; break; }
    }

    // top related 매칭
    if (v2 && Array.isArray(v2.topRelated)) {
      for (const r of v2.topRelated.slice(0, 3)) {
        if (!r.kw) continue;
        stats.topRelatedTotal++;
        if (audit.golden.toLowerCase().includes(r.kw.toLowerCase())) {
          stats.topRelatedMatches++;
        }
      }
    }

    // 데이터 품질별 점수
    stats.byQuality[quality].cnt++;
    stats.byQuality[quality].scoreSum += audit.score;

    // 다양성: 골든존 토큰
    for (const t of audit.goldenTokens) {
      if (t.length >= 2) tokensSet.add(t.toLowerCase());
    }

    // 카테고리 내 worst case
    if (!worstInCat || audit.score < worstInCat.audit.score) {
      worstInCat = { displayName, audit, sourceProduct: productName };
    }
  }

  const catAvgScore = products.length > 0 ? catScoreSum / products.length : 0;
  categoryStats.push({
    path,
    leaf,
    quality,
    avgScore: catAvgScore,
    leafInPct: (catLeafIn / products.length) * 100,
    diversity: tokensSet.size,
    truncatedRate: (catTruncated / products.length) * 100,
  });

  // worst sample 수집 (점수 낮은 카테고리만)
  if (worstInCat && worstInCat.audit.score < 60 && worstSamples.length < 50) {
    worstSamples.push({
      path,
      leaf,
      quality,
      sourceProduct: worstInCat.sourceProduct,
      displayName: worstInCat.displayName,
      score: worstInCat.audit.score,
      golden: worstInCat.audit.golden,
    });
  }

  processed++;
  if (processed % 1000 === 0) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    const rate = (processed / elapsed).toFixed(0);
    const eta = ((allCats.length - processed) / parseFloat(rate)).toFixed(0);
    console.log(`  [${processed}/${allCats.length}] ${rate}/s · 경과 ${elapsed}s · 잔여 ~${eta}s`);
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(0);
console.log(`\n총 처리: ${processed} 카테고리 · ${stats.totalNames} 노출명 · ${elapsed}s`);

// ─── 통계 출력 ─────────────────────────
console.log('\n=== 종합 통계 ===');
console.log(`총 노출명: ${stats.totalNames.toLocaleString()}개`);
console.log(`에러: ${stats.errorCount}건`);
console.log(`빈 결과: ${stats.emptyDisplayName}건`);

console.log(`\n[정확도]`);
console.log(`  leaf 골든존 포함률: ${(stats.leafIncluded / stats.totalNames * 100).toFixed(2)}%`);
console.log(`  평균 점수: ${(stats.scoreSum / stats.totalNames).toFixed(2)} / 100`);
console.log(`  평균 골든존 길이: ${(stats.goldenLengthSum / stats.totalNames).toFixed(2)}자`);
console.log(`  평균 핵심 키워드: ${(stats.coreKwSum / stats.totalNames).toFixed(2)}개`);

console.log(`\n[모바일 친화도]`);
console.log(`  40자 초과 잘림: ${(stats.truncatedCount / stats.totalNames * 100).toFixed(2)}%`);

console.log(`\n[점수 분포]`);
console.log(`  excellent (≥80): ${stats.excellentCount.toLocaleString()} (${(stats.excellentCount / stats.totalNames * 100).toFixed(2)}%)`);
console.log(`  good      (60+): ${stats.goodCount.toLocaleString()} (${(stats.goodCount / stats.totalNames * 100).toFixed(2)}%)`);
console.log(`  fair      (40+): ${stats.fairCount.toLocaleString()} (${(stats.fairCount / stats.totalNames * 100).toFixed(2)}%)`);
console.log(`  poor      (<40): ${stats.poorCount.toLocaleString()} (${(stats.poorCount / stats.totalNames * 100).toFixed(2)}%)`);

console.log(`\n[노이즈 누출 검사]`);
console.log(`  연예인명 누출: ${stats.celebrityLeak.toLocaleString()} (${(stats.celebrityLeak / stats.totalNames * 100).toFixed(3)}%)`);
console.log(`  마케팅 노이즈 누출: ${stats.marketingNoiseLeak.toLocaleString()} (${(stats.marketingNoiseLeak / stats.totalNames * 100).toFixed(3)}%)`);

console.log(`\n[검색량 가중 매칭]`);
const matchRate = stats.topRelatedTotal > 0 ? (stats.topRelatedMatches / stats.topRelatedTotal * 100) : 0;
console.log(`  topRelated 골든존 매칭률: ${matchRate.toFixed(2)}% (${stats.topRelatedMatches.toLocaleString()}/${stats.topRelatedTotal.toLocaleString()})`);

console.log(`\n[데이터 품질별 평균 점수]`);
for (const [q, v] of Object.entries(stats.byQuality)) {
  if (v.cnt > 0) {
    console.log(`  ${q.padEnd(8)}: ${(v.scoreSum / v.cnt).toFixed(2)} (${v.cnt.toLocaleString()}개 노출명)`);
  }
}

// 카테고리 worst 5개
const sortedCats = [...categoryStats].sort((a, b) => a.avgScore - b.avgScore);
console.log(`\n=== 카테고리 평균점수 worst 10 ===`);
for (const c of sortedCats.slice(0, 10)) {
  console.log(`  [${c.avgScore.toFixed(1)}] ${c.path} (quality=${c.quality}, leaf=${c.leafInPct.toFixed(0)}%, 다양성=${c.diversity})`);
}

console.log(`\n=== 카테고리 평균점수 best 5 ===`);
for (const c of sortedCats.slice(-5).reverse()) {
  console.log(`  [${c.avgScore.toFixed(1)}] ${c.path} (quality=${c.quality}, 다양성=${c.diversity})`);
}

console.log(`\n=== 노이즈 input → 노출명 변환 sample 5 ===`);
const noiseTestSamples = worstSamples.slice(0, 5);
for (const w of noiseTestSamples) {
  console.log(`  카테고리: ${w.path}`);
  console.log(`    셀러 input: "${w.sourceProduct}"`);
  console.log(`    노출명:    "${w.displayName}"`);
  console.log(`    score=${w.score} 골든존: "${w.golden}"`);
}

writeFileSync(OUT_PATH, JSON.stringify({
  summary: stats,
  worstSamples,
  bestCategories: sortedCats.slice(-20).reverse(),
  worstCategories: sortedCats.slice(0, 30),
}, null, 0));
console.log(`\n결과 저장: ${OUT_PATH}`);
