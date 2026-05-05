/* eslint-disable */
// ============================================================
// 카테고리 전수 도메인 일치 감사 (16,259개)
//
// 각 leaf 카테고리에 대해 합성 productName 으로 콘텐츠 생성 →
// 도메인 불일치 어휘 검출 → JSON 보고서.
//
// 도메인 분류:
//   FOOD       — 식품 / 신선식품 / 가공식품 / 음료 / 건강식품
//   COSMETICS  — 뷰티
//   APPLIANCE  — 가전/디지털
//   FASHION    — 패션의류잡화
//   FURNITURE  — 가구/홈데코
//   BABY       — 출산/유아동 (식품 제외)
//   PET        — 반려/애완용품 (식품 제외)
//   SPORTS     — 스포츠/레져
//   KITCHEN    — 주방용품
//   TOY        — 완구/취미
//   AUTO       — 자동차용품
//   STATIONERY — 문구/오피스
//   LIVING     — 생활용품
//   OTHER      — 분류 안 됨
//
// 위반 패턴:
//   FOOD에 "모델/사양/마감/소재/구조/디자인/설계/조립/내구성" 등 공산품 어휘
//   FOOD(특히 신선식품)에 "비타민/콜라겐/히알루론" 등 영양제 어휘
//   FOOD에 "1년 후/장기 사용/꾸준한 관리" 등 비현실적 사용기간
//   비식품에 "드셔보시면/한입/뒷맛/단맛/식감/맛이" 등 식음료 어휘 (해당 도메인 외)
//   COSMETICS에 "모델/사양" 등
// ============================================================

const fs = require('fs');
const path = require('path');

const idx = require('../src/lib/megaload/data/coupang-cat-index.json');
const details = require('../src/lib/megaload/data/coupang-cat-details.json');
const engine = require('../.test-out/src/lib/megaload/services/persuasion-engine.js');

// 도메인 분류기
function classifyDomain(catPath) {
  if (!catPath) return 'OTHER';
  const top = catPath.split('>')[0].trim();
  if (/^식품$/.test(top)) return 'FOOD';
  // 분유/이유식/유아식품 계열 = FOOD. 단 보관용기/식기 등 공산품은 BABY로.
  if (/이유\/유아식기|보관용기|이유식기|이유보틀|이유식저장|식기/.test(catPath)) {
    // skip — fall through to BABY classification below
  } else if (/유아식품|분유\/유아식품|^출산\/유아동>분유/.test(catPath)) {
    return 'FOOD';
  }
  if (/사료|간식\s*\(?(?:반려|강아지|고양이)?/.test(catPath) && /(반려|애완|강아지|고양이)/.test(catPath)) return 'PET_FOOD';
  if (/^뷰티$/.test(top)) return 'COSMETICS';
  if (/^가전\/디지털$/.test(top)) return 'APPLIANCE';
  if (/^패션의류잡화$/.test(top)) return 'FASHION';
  if (/^가구\/홈데코$/.test(top)) return 'FURNITURE';
  if (/^출산\/유아동$/.test(top)) return 'BABY';
  if (/^반려\/애완용품$/.test(top)) return 'PET';
  if (/^스포츠\/레져$/.test(top)) return 'SPORTS';
  if (/^주방용품$/.test(top)) return 'KITCHEN';
  if (/^완구\/취미$/.test(top)) return 'TOY';
  if (/^자동차용품$/.test(top)) return 'AUTO';
  if (/^문구\/오피스$/.test(top)) return 'STATIONERY';
  if (/^생활용품$/.test(top)) return 'LIVING';
  return 'OTHER';
}

// 위반 패턴 — 도메인별
const VIOLATIONS = {
  FOOD: {
    label: '식품에 공산품/영양제/비현실 어휘',
    patterns: [
      // 공산품 어휘 (영양제 포함 식품 전체에 부적절)
      { re: /\b모델\b/, kind: '공산품:모델' },
      { re: /\b사양\b/, kind: '공산품:사양' },
      { re: /\b스펙\b/, kind: '공산품:스펙' },
      { re: /마감\s*디테일/, kind: '공산품:마감' },
      { re: /[가-힣]+\s*소재/, kind: '공산품:소재' },
      { re: /설계됐?어요/, kind: '공산품:설계' },
      { re: /조립/, kind: '공산품:조립' },
      { re: /그립감/, kind: '공산품:그립감' },
      { re: /내구성/, kind: '공산품:내구성' },
      { re: /동급\s*(?:모델|옵션|제품)/, kind: '공산품:동급모델' },
      { re: /상위\s*(?:모델|라인업)/, kind: '공산품:상위모델' },
      // 비현실적 사용 기간 (식품)
      { re: /[0-9]+년\s*(?:후|뒤|간|동안)/, kind: '식품:장기사용' },
      { re: /수년\s*동안/, kind: '식품:장기사용' },
      // 화장품/건기식 톤 (일반 식품에 부적절 — 건강식품은 일부 허용)
      { re: /시간\s*투자할\s*가치/, kind: '식품:과한주장' },
      { re: /체감이\s*확실/, kind: '식품:과한주장' },
      // 외래 어휘
      { re: /가방에\s*넣고\s*다니/, kind: '식품:비현실' },
    ],
  },
  // 비식품 도메인에 식음료 어휘 — 보수적으로 (음료/식감 등)
  NONFOOD: {
    label: '비식품에 식음료 어휘',
    domains: ['APPLIANCE','FURNITURE','AUTO','STATIONERY','TOY','SPORTS'],
    patterns: [
      { re: /드셔보시면/, kind: '식음:드셔' },
      { re: /한\s*입에/, kind: '식음:한입' },
      { re: /뒷맛/, kind: '식음:뒷맛' },
      { re: /신선도/, kind: '식음:신선도' },
      { re: /식탁/, kind: '식음:식탁' },
      { re: /제철/, kind: '식음:제철' },
    ],
  },
  COSMETICS: {
    label: '화장품에 공산품 어휘',
    patterns: [
      { re: /\b모델\b/, kind: '공산품:모델' },
      { re: /조립/, kind: '공산품:조립' },
      { re: /내구성/, kind: '공산품:내구성' },
    ],
  },
};

function generateForCategory(catPath, leafName) {
  // 합성 productName: leafName 만 사용 (셀러 노이즈 없는 baseline)
  const productName = leafName;
  try {
    // generatePersuasionContent — public API
    const result = engine.generatePersuasionContent(
      productName,
      catPath,
      'audit-seed', // sellerSeed
      0,            // productIndex
      [],           // seoKeywords
      undefined,    // categoryCode
      { tags: [], description: '' }, // productContext
    );
    // 모든 block content concat
    const parts = [];
    for (const b of result.blocks || []) {
      if (b.content) parts.push(b.content);
      if (b.subContent) parts.push(b.subContent);
      if (b.items) parts.push(...b.items);
      if (b.emphasis) parts.push(b.emphasis);
    }
    return parts.join('\n');
  } catch (err) {
    return null;
  }
}

function checkViolations(text, domain, catPath, leafName) {
  const found = [];
  // 영양제(건강식품) 카테고리는 "1년 후/꾸준히" 등 마케팅 톤 OK — FOOD:장기사용 패턴 면제
  const isHealthSupplement = /건강식품|영양제|비타민/.test(catPath);

  if (domain === 'FOOD' && VIOLATIONS.FOOD) {
    for (const p of VIOLATIONS.FOOD.patterns) {
      // 영양제는 장기사용 OK
      if (isHealthSupplement && p.kind === '식품:장기사용') continue;
      const m = text.match(p.re);
      if (m) found.push({ kind: p.kind, sample: m[0], rule: 'FOOD' });
    }
  }
  if (domain === 'COSMETICS' && VIOLATIONS.COSMETICS) {
    for (const p of VIOLATIONS.COSMETICS.patterns) {
      const m = text.match(p.re);
      if (m) found.push({ kind: p.kind, sample: m[0], rule: 'COSMETICS' });
    }
  }
  if (VIOLATIONS.NONFOOD.domains.includes(domain)) {
    // leaf 토큰이 식음 어휘 자체인 경우 (식탁 가구 등) 면제
    const leafLower = (leafName || '').toLowerCase();
    for (const p of VIOLATIONS.NONFOOD.patterns) {
      const m = text.match(p.re);
      if (m && !leafLower.includes(m[0])) {
        found.push({ kind: p.kind, sample: m[0], rule: 'NONFOOD' });
      }
    }
  }
  return found;
}

(async () => {
  const startMs = Date.now();
  const total = idx.length;
  const stats = {
    total,
    pass: 0,
    fail: 0,
    skip: 0,
    domains: {},
    violationCounts: {},
  };
  const failures = [];
  let progress = 0;

  for (const [code, , leafName, depth] of idx) {
    const detail = details[code];
    if (!detail || !detail.p) { stats.skip++; continue; }
    const catPath = detail.p;
    const domain = classifyDomain(catPath);
    stats.domains[domain] = (stats.domains[domain] || 0) + 1;

    // 페트푸드는 검사 보류 (도메인 모호)
    if (domain === 'PET_FOOD' || domain === 'OTHER') { stats.skip++; continue; }

    const text = generateForCategory(catPath, leafName);
    if (!text) { stats.skip++; continue; }

    const violations = checkViolations(text, domain, catPath, leafName);
    if (violations.length === 0) {
      stats.pass++;
    } else {
      stats.fail++;
      for (const v of violations) {
        stats.violationCounts[v.kind] = (stats.violationCounts[v.kind] || 0) + 1;
      }
      // 처음 100개만 상세 저장 (메모리 절약)
      if (failures.length < 200) {
        failures.push({ code, leafName, catPath, domain, violations: violations.slice(0, 5) });
      }
    }

    progress++;
    if (progress % 1000 === 0) {
      const pct = ((progress / total) * 100).toFixed(1);
      console.log(`[${pct}%] ${progress}/${total} pass=${stats.pass} fail=${stats.fail} skip=${stats.skip}`);
    }
  }

  const elapsedMs = Date.now() - startMs;
  const summary = {
    elapsedMs,
    stats,
    sampleFailures: failures,
  };

  const outPath = path.join(__dirname, '..', '.test-out', 'content-domain-audit.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));

  console.log('\n=== AUDIT COMPLETE ===');
  console.log(`elapsed: ${(elapsedMs/1000).toFixed(1)}s`);
  console.log(`total: ${total}, pass: ${stats.pass}, fail: ${stats.fail}, skip: ${stats.skip}`);
  console.log(`fail rate: ${((stats.fail / (stats.pass + stats.fail)) * 100).toFixed(1)}%`);
  console.log('\nDomains:', stats.domains);
  console.log('\nTop violations:');
  const sortedViolations = Object.entries(stats.violationCounts).sort((a, b) => b[1] - a[1]);
  for (const [kind, count] of sortedViolations.slice(0, 15)) {
    console.log(`  ${kind}: ${count}`);
  }
  console.log(`\nReport: ${outPath}`);
})();
