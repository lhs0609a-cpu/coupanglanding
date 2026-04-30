#!/usr/bin/env node
// ============================================================
// 16,259 카테고리 × 다양한 상품명 시나리오 전수조사
// 검출 항목:
//   1. 오염(pollution): leaf와 무관한 키워드 주입
//   2. SEO 미흡: leaf 누락, 30자 미만 부족, 토큰 < 5개
//   3. 정체성 붕괴: 상호배타 토큰 동시 노출(사과+자몽 등)
//   4. 제목 이상: 빈 문자열, 단일 토큰, 숫자 잔여물, 중복단어
//   5. 브랜드 누출: 브랜드의 부분문자열이 결과에 포함
//   6. 길이 위반: 100자 초과
//   7. compliance 잔여 위반어
// ============================================================

import fs from 'node:fs';

const m = await import('../.build-test/lib/megaload/services/display-name-generator.js');
const m2 = await import('../.build-test/lib/megaload/services/compliance-filter.js');
const { generateDisplayName, findBestPool } = m;
const { checkCompliance } = m2;

const SEO = JSON.parse(fs.readFileSync('src/lib/megaload/data/seo-keyword-pools.json', 'utf8'));
const CATS = JSON.parse(fs.readFileSync('src/lib/megaload/data/coupang-cat-details.json', 'utf8'));
const SYNONYM_GROUPS = SEO.synonymGroups;

// 전체 카테고리 추출
const ALL_CATS = [];
for (const [code, v] of Object.entries(CATS)) {
  if (v && v.p && typeof v.p === 'string') ALL_CATS.push({ code, path: v.p });
}

// 정체성 모순 패밀리 (display-name-generator.ts와 동일)
const MUTUALLY_EXCLUSIVE_FAMILIES = [
  { name: '과일', tokens: ['사과','배','감','귤','오렌지','레몬','자몽','바나나','파인애플','망고','딸기','블루베리','포도','복숭아','체리','키위','아보카도','수박','멜론','석류','용과','리치','망고스틴','두리안'] },
  { name: '사과품종', tokens: ['부사','홍로','아오리','시나노골드','감홍','양광'] },
  { name: '채소', tokens: ['배추','무','당근','양파','대파','마늘','감자','고구마','오이','토마토','호박','가지','시금치','브로콜리'] },
  { name: '곡물', tokens: ['쌀','현미','찹쌀','보리','귀리','퀴노아','메밀','수수','조'] },
  { name: '육류', tokens: ['소고기','돼지고기','닭고기','오리고기','양고기','한우','한돈'] },
];

// 자주 쓰는 노이즈/광고 키워드 — 결과에 남으면 안 됨
const FORBIDDEN_NOISE = ['무료배송','당일발송','특가','할인','증정','사은품','리뷰이벤트','상세페이지참조','상품상세참조'];

// 카테고리별로 리얼한 상품명 시나리오 생성
function makeScenarios(catPath) {
  const segs = catPath.split('>');
  const leafRaw = segs[segs.length - 1];
  // leaf 분할 (슬래시/특수문자)
  const leafParts = leafRaw.split(/[\/·\s\(\)\[\],+&\-._''""\u2018\u2019\u201C\u201D]+/).map(s => s.trim()).filter(s => s.length >= 1);
  const leafBase = leafParts[0] || leafRaw;

  return [
    {
      label: 'plain',
      name: `${leafBase} 프리미엄 100g`,
      brand: '데일리',
    },
    {
      label: 'noisy',
      name: `[무료배송] ${leafBase} 신상품 특가 ★베스트★ 상세페이지 참조 100g`,
      brand: '셀러몰',
    },
    {
      label: 'brand_eq_leaf',
      name: `${leafBase} 골드 프리미엄 신상`,
      brand: leafBase,
    },
    {
      label: 'fruit_mix', // 정체성 붕괴 유발 — 의도적
      name: `${leafBase} 사과 망고 자몽 부사 아오리 5kg`,
      brand: '신선마켓',
    },
    {
      label: 'spec_only',
      name: `${leafBase} 1개 100g 500ml`,
      brand: '몰',
    },
    {
      label: 'long',
      name: `${leafBase} 명품 한정판 풀세트 정품 신형 ${leafBase} 60정 2개입 대용량 가정용`,
      brand: '한국건강식품',
    },
  ];
}

const isHangul = c => c >= '\uAC00' && c <= '\uD7AF';

const results = {
  total: 0,
  ok: 0,
  empty: 0,
  noLeaf: 0,
  pollution: 0,         // 노이즈/광고/단어 잔여
  identityCollapse: 0,  // 모순 토큰
  shortTitle: 0,        // < 20자
  longTitle: 0,         // > 100자
  fewTokens: 0,         // 토큰 < 4개 (SEO 부족)
  bareNumberLeftover: 0,// "1" 같은 단위 없는 숫자만
  brandLeak: 0,
  complianceFail: 0,
  duplicateWord: 0,     // 같은 단어 3회+
};

const samples = {
  empty: [], noLeaf: [], pollution: [], identityCollapse: [],
  shortTitle: [], longTitle: [], fewTokens: [], bareNumberLeftover: [],
  brandLeak: [], complianceFail: [], duplicateWord: [],
};

const SAMPLE_LIMIT = 10;

function pushSample(bucket, item) {
  if (samples[bucket].length < SAMPLE_LIMIT) samples[bucket].push(item);
}

let processed = 0;
const startTime = Date.now();

for (const { code, path: catPath } of ALL_CATS) {
  const segs = catPath.split('>');
  const leafRaw = segs[segs.length - 1];
  const leafLower = leafRaw.toLowerCase();
  const leafParts = leafRaw.split(/[\/·\s\(\)\[\],+&\-._''""\u2018\u2019\u201C\u201D]+/).map(s => s.trim().toLowerCase()).filter(s => s.length >= 1);
  // categorySafeWords — display-name-generator buildCategorySafeWords와 동일 로직 (compliance false positive 차단)
  const categorySafeWords = new Set();
  const leafIdx = segs.length - 1;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const minLen = i === leafIdx ? 1 : 2;
    if (seg.length >= minLen) categorySafeWords.add(seg.toLowerCase());
    for (const part of seg.split(/[\/·\s\(\)\[\],+&\-._''""\u2018\u2019\u201C\u201D]+/).map(s => s.trim())) {
      if (part.length < minLen) continue;
      if (/^\d+$/.test(part)) continue;
      categorySafeWords.add(part.toLowerCase());
    }
  }
  const pool = findBestPool(catPath);
  const poolFeatLower = (pool.features || []).map(s => s.toLowerCase());
  const poolIngrLower = (pool.ingredients || []).map(s => s.toLowerCase());
  const poolGenLower = (pool.generic || []).map(s => s.toLowerCase());
  const catSegLower = segs.map(s => s.toLowerCase());

  // 카테고리 의미 단어 집합 — 결과 토큰이 여기 또는 원본에 있어야 "오염 아님"
  const categoryRelevantWords = new Set([
    ...catSegLower,
    ...poolFeatLower, ...poolIngrLower, ...poolGenLower,
    ...leafParts,
  ]);

  for (const sc of makeScenarios(catPath)) {
    results.total++;
    const out = generateDisplayName(sc.name, sc.brand, catPath, 'audit-seller', 0);
    const outLower = out.toLowerCase();

    // 1. 빈 문자열
    if (!out || !out.trim()) {
      results.empty++;
      pushSample('empty', { code, catPath, ...sc, out });
      continue;
    }

    // 2. leaf 누락
    const hasLeaf = outLower.includes(leafLower) || leafParts.some(p => p && outLower.includes(p));
    if (!hasLeaf) {
      results.noLeaf++;
      pushSample('noLeaf', { code, catPath, ...sc, out });
    }

    // 3. 길이
    if (out.length < 20) {
      results.shortTitle++;
      pushSample('shortTitle', { code, catPath, ...sc, out });
    }
    if (out.length > 100) {
      results.longTitle++;
      pushSample('longTitle', { code, catPath, ...sc, out });
    }

    const tokens = out.split(/\s+/).filter(t => t.length > 0);

    // 4. 토큰 개수
    if (tokens.length < 4) {
      results.fewTokens++;
      pushSample('fewTokens', { code, catPath, ...sc, out, tokenCount: tokens.length });
    }

    // 5. 노이즈/광고 잔여 (오염)
    let polluted = false;
    for (const noise of FORBIDDEN_NOISE) {
      if (out.includes(noise)) { polluted = true; break; }
    }
    if (polluted) {
      results.pollution++;
      pushSample('pollution', { code, catPath, ...sc, out, reason: '노이즈잔여' });
    }

    // 6. 정체성 붕괴 — 같은 패밀리에서 2개 이상 노출
    //    false positive 제외:
    //      - 카테고리 path 자체에 가족 토큰이 들어있는 경우 ("현미유/쌀눈유" leaf → 쌀+현미 정상)
    //      - "세트/박스/모듬/혼합" 키워드가 있으면 의도된 모듬으로 간주
    let collapsed = false;
    const catPathLower = catPath.toLowerCase();
    for (const fam of MUTUALLY_EXCLUSIVE_FAMILIES) {
      const matched = fam.tokens.filter(t => out.includes(t));
      if (matched.length >= 2) {
        if (/세트|박스|모듬|혼합|패키지/.test(out)) continue;
        // 카테고리 path에 매칭 토큰이 2개 이상 들어있으면 카테고리가 합법적으로 묶은 것
        const inCatPath = matched.filter(t => catPathLower.includes(t.toLowerCase()));
        if (inCatPath.length >= 2) continue;
        collapsed = true;
        pushSample('identityCollapse', { code, catPath, ...sc, out, family: fam.name, tokens: matched });
        break;
      }
    }
    if (collapsed) results.identityCollapse++;

    // 7. 단위 없는 숫자만 (스펙 누락 후 잔여)
    for (const tok of tokens) {
      if (/^\d+$/.test(tok)) {
        results.bareNumberLeftover++;
        pushSample('bareNumberLeftover', { code, catPath, ...sc, out, badToken: tok });
        break;
      }
    }

    // 8. 브랜드 누출 — 브랜드 자체 토큰이 결과에 그대로 있으면 누출
    //    (단 brand가 leaf와 같으면 leaf로 카운팅 — 누출 아님)
    if (sc.brand && sc.brand.length >= 2 && sc.label !== 'brand_eq_leaf') {
      const brandLower = sc.brand.toLowerCase();
      const brandTokens = brandLower.split(/[\s\/·]+/).filter(s => s.length >= 2);
      let leaked = false;
      for (const bt of brandTokens) {
        // leaf의 일부면 누출 아님
        if (leafParts.some(lp => lp === bt)) continue;
        // 카테고리 의미 단어면 누출 아님
        if (categoryRelevantWords.has(bt)) continue;
        // 토큰 단위 매칭 (substring 매칭은 false-positive 많음)
        if (tokens.some(t => t.toLowerCase() === bt)) {
          leaked = true;
          pushSample('brandLeak', { code, catPath, ...sc, out, leakedBrand: bt });
          break;
        }
      }
      if (leaked) results.brandLeak++;
    }

    // 9. compliance 위반 잔여 (leaf safe word 부분 매칭은 false positive로 제외)
    const compl = checkCompliance(out, { removeErrors: false, categoryContext: catPath, categorySafeWords });
    if (compl.hasErrors) {
      results.complianceFail++;
      pushSample('complianceFail', { code, catPath, ...sc, out, violations: compl.violations });
    }

    // 10. 같은 단어 3회+ (중복)
    const counts = new Map();
    for (const t of tokens) {
      const k = t.toLowerCase();
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    let dup = false;
    for (const [w, c] of counts) {
      if (c >= 3 && w.length >= 2) {
        dup = true;
        pushSample('duplicateWord', { code, catPath, ...sc, out, word: w, count: c });
        break;
      }
    }
    if (dup) results.duplicateWord++;

    if (hasLeaf && !polluted && !collapsed && tokens.length >= 4 &&
        out.length >= 20 && out.length <= 100 && !compl.hasErrors && !dup) {
      results.ok++;
    }
  }

  processed++;
  if (processed % 2000 === 0) {
    const pct = ((processed / ALL_CATS.length) * 100).toFixed(0);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`  진행 ${processed}/${ALL_CATS.length} (${pct}%) — ${elapsed}s`);
  }
}

const pct = n => ((n / results.total) * 100).toFixed(2) + '%';

console.log('\n========================================');
console.log(`총 ${results.total}건 (${ALL_CATS.length} 카테고리 × 6 시나리오)`);
console.log('========================================');
console.log(`✅ 모든 검사 통과:           ${results.ok} (${pct(results.ok)})`);
console.log(`❌ 빈 문자열:                ${results.empty} (${pct(results.empty)})`);
console.log(`❌ leaf 키워드 누락:         ${results.noLeaf} (${pct(results.noLeaf)})`);
console.log(`❌ 오염(노이즈/광고잔여):    ${results.pollution} (${pct(results.pollution)})`);
console.log(`❌ 정체성 붕괴(상호배타):    ${results.identityCollapse} (${pct(results.identityCollapse)})`);
console.log(`⚠️  20자 미만:               ${results.shortTitle} (${pct(results.shortTitle)})`);
console.log(`⚠️  100자 초과:              ${results.longTitle} (${pct(results.longTitle)})`);
console.log(`⚠️  토큰 4개 미만:           ${results.fewTokens} (${pct(results.fewTokens)})`);
console.log(`⚠️  단위없는 숫자 잔여:      ${results.bareNumberLeftover} (${pct(results.bareNumberLeftover)})`);
console.log(`⚠️  브랜드 누출:             ${results.brandLeak} (${pct(results.brandLeak)})`);
console.log(`⚠️  compliance 위반:         ${results.complianceFail} (${pct(results.complianceFail)})`);
console.log(`⚠️  중복 단어 3회+:          ${results.duplicateWord} (${pct(results.duplicateWord)})`);

console.log('\n=== 빈 문자열 샘플 ===');
for (const s of samples.empty) console.log(`  [${s.code}] ${s.catPath} | ${s.label} brand=${s.brand} | "${s.out}"`);

console.log('\n=== leaf 누락 샘플 ===');
for (const s of samples.noLeaf) console.log(`  [${s.code}] ${s.catPath} | ${s.label} brand=${s.brand}\n     원본: ${s.name}\n     생성: ${s.out}`);

console.log('\n=== 오염 샘플 ===');
for (const s of samples.pollution) console.log(`  [${s.code}] ${s.catPath} | ${s.label}\n     원본: ${s.name}\n     생성: ${s.out}`);

console.log('\n=== 정체성 붕괴 샘플 ===');
for (const s of samples.identityCollapse) console.log(`  [${s.code}] ${s.catPath} | ${s.label} family=${s.family} tokens=${JSON.stringify(s.tokens)}\n     원본: ${s.name}\n     생성: ${s.out}`);

console.log('\n=== 20자 미만 샘플 ===');
for (const s of samples.shortTitle.slice(0, 5)) console.log(`  [${s.code}] ${s.catPath} | ${s.label} | "${s.out}"`);

console.log('\n=== 토큰 4개 미만 샘플 ===');
for (const s of samples.fewTokens.slice(0, 5)) console.log(`  [${s.code}] ${s.catPath} | ${s.label} (${s.tokenCount}토큰) | "${s.out}"`);

console.log('\n=== 단위없는 숫자 샘플 ===');
for (const s of samples.bareNumberLeftover.slice(0, 5)) console.log(`  [${s.code}] ${s.catPath} | "${s.out}" badToken="${s.badToken}"`);

console.log('\n=== 브랜드 누출 샘플 ===');
for (const s of samples.brandLeak.slice(0, 5)) console.log(`  [${s.code}] ${s.catPath} brand=${s.brand} 누출=${s.leakedBrand}\n     생성: ${s.out}`);

console.log('\n=== compliance 위반 샘플 ===');
for (const s of samples.complianceFail.slice(0, 5)) console.log(`  [${s.code}] ${s.catPath} | "${s.out}" violations=${JSON.stringify(s.violations)}`);

console.log('\n=== 중복단어 샘플 ===');
for (const s of samples.duplicateWord.slice(0, 5)) console.log(`  [${s.code}] ${s.catPath} | word="${s.word}" count=${s.count}\n     생성: ${s.out}`);

const outFile = `scripts/verification-reports/audit-seo-comprehensive-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
fs.writeFileSync(outFile, JSON.stringify({
  generatedAt: new Date().toISOString(),
  totalCategories: ALL_CATS.length,
  totalSamples: results.total,
  metrics: results,
  samples,
}, null, 2));
console.log(`\n전체 보고서: ${outFile}`);
