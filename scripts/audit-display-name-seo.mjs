#!/usr/bin/env node
// ============================================================
// 노출상품명 SEO 전수조사 — 16,259 카테고리 × 가상 상품
// 측정 항목:
//   1) 카테고리 leaf 키워드가 displayName에 포함되는지 (가장 중요)
//   2) leaf의 synonym 그룹 어느 하나라도 포함되는지
//   3) 길이 분포 (모바일 노출 40자, 타겟 50~70자)
//   4) generic-only 풀 비율 (풀 데이터 빈약 카테고리)
//   5) 브랜드-leak 필터로 leaf가 강제 제거되는 케이스
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const m = await import('../.build-test/lib/megaload/services/display-name-generator.js');
const { generateDisplayName, classifyTokens, findBestPool } = m;

const SEO_DATA = JSON.parse(fs.readFileSync('src/lib/megaload/data/seo-keyword-pools.json', 'utf8'));
const CAT_DETAILS = JSON.parse(fs.readFileSync('src/lib/megaload/data/coupang-cat-details.json', 'utf8'));
const SYNONYM_GROUPS = SEO_DATA.synonymGroups;
const POOLS = SEO_DATA.categoryPools;

const ALL_CATS = [];
for (const [code, v] of Object.entries(CAT_DETAILS)) {
  if (v && v.p && typeof v.p === 'string') ALL_CATS.push({ code, path: v.p });
}

console.log(`총 카테고리: ${ALL_CATS.length}`);
console.log(`풀 사전 키 수: ${Object.keys(POOLS).length}`);
console.log(`synonym 그룹 수: ${Object.keys(SYNONYM_GROUPS).length}\n`);

// leaf 키워드의 synonym 그룹 (있다면) 조회
function getLeafSynonyms(leaf) {
  const lower = leaf.toLowerCase();
  for (const [key, syns] of Object.entries(SYNONYM_GROUPS)) {
    if (key.toLowerCase() === lower) return syns.map(s => s.toLowerCase());
    if (syns.some(s => s.toLowerCase() === lower)) return syns.map(s => s.toLowerCase());
  }
  return null;
}

// 가상 상품 — 카테고리 리프를 자연스럽게 포함한 이름 + 다양한 브랜드 시나리오
function makeFakeProducts(catPath) {
  const segs = catPath.split('>');
  const leaf = segs[segs.length - 1];
  const leafBase = leaf.replace(/\/.+$/, '').trim(); // "비타민/미네랄" → "비타민"
  return [
    {
      label: 'plain',
      name: `${leafBase} 프리미엄 제품 100g`,
      brand: '데일리',
    },
    {
      label: 'brand_contains_leaf',
      name: `슈퍼${leafBase}플러스 다이렉트 ${leafBase} ${leafBase}`,
      brand: `슈퍼${leafBase}플러스`,
    },
    {
      label: 'long_brand',
      name: `${leafBase} 명품 대용량 60정`,
      brand: '한국건강식품주식회사',
    },
  ];
}

const results = {
  total: 0,
  leafIncluded: 0,
  leafIncludedBrandSafe: 0, // brand가 leaf 포함 안하는 케이스만 계산
  brandStripsLeaf: 0,       // brand가 leaf를 강제 제거하는 케이스
  synonymOnly: 0,           // leaf 자체는 없지만 synonym은 있음
  noLeafNoSynonym: 0,       // leaf도 synonym도 없음 → SEO 실패
  poorPool: 0,              // pool ingredients+features 합쳐서 0개
  shortName: 0,             // < 30자
  longName: 0,              // > 80자
};
const failures = []; // 가장 심각한 케이스 샘플
const failureByReason = { compliance: 0, oneCharNonHangul: 0, brandLeak: 0, unknown: 0 };
const reasonSamples = { compliance: [], oneCharNonHangul: [], brandLeak: [], unknown: [] };

const m2 = await import('../.build-test/lib/megaload/services/compliance-filter.js');
const checkCompliance = m2.checkCompliance;

let processed = 0;
for (const { code, path: catPath } of ALL_CATS) {
  const segs = catPath.split('>');
  const leaf = segs[segs.length - 1];
  const leafLower = leaf.toLowerCase();
  const synonyms = getLeafSynonyms(leaf);

  const pool = findBestPool(catPath);
  const poolPoor = (pool.ingredients?.length || 0) + (pool.features?.length || 0) === 0;

  const fakes = makeFakeProducts(catPath);
  for (const fake of fakes) {
    results.total++;
    if (poolPoor) results.poorPool++;

    const displayName = generateDisplayName(fake.name, fake.brand, catPath, 'audit-seller', 0);
    const dnLower = displayName.toLowerCase();

    const brandContainsLeaf = fake.brand.toLowerCase().includes(leafLower);
    // 슬래시·괄호·콤마·플러스·앰퍼샌드·공백 모든 분리형 leaf — display-name-generator의 buildCategorySafeWords와 일치
    const leafSplits = leaf.split(/[\/·\s\(\)\[\],+&\-._''""\u2018\u2019\u201C\u201D]+/).map(s => s.trim().toLowerCase()).filter(s => s.length >= 1);
    const leafIn = dnLower.includes(leafLower) || leafSplits.some(s => dnLower.includes(s));
    const synIn = synonyms ? synonyms.some(s => dnLower.includes(s)) : false;

    if (leafIn) {
      results.leafIncluded++;
      if (!brandContainsLeaf) results.leafIncludedBrandSafe++;
    } else if (synIn) {
      results.synonymOnly++;
    } else {
      results.noLeafNoSynonym++;
      if (failures.length < 60) {
        failures.push({ code, path: catPath, leaf, label: fake.label, brand: fake.brand, name: fake.name, displayName });
      }
      // 원인 분류: 어떤 이유로 leaf가 누락됐는가
      const leafCheck = checkCompliance(leaf, { removeErrors: true, categoryContext: catPath });
      const firstSplit = leafSplits[0] || leaf;
      const splitCheck = checkCompliance(firstSplit, { removeErrors: true, categoryContext: catPath });
      let reason;
      if (leafCheck.hasErrors || splitCheck.hasErrors) {
        reason = 'compliance';
      } else if (firstSplit.length === 1 && !/[가-힣]/.test(firstSplit)) {
        reason = 'oneCharNonHangul';
      } else if (brandContainsLeaf) {
        reason = 'brandLeak';
      } else {
        reason = 'unknown';
      }
      failureByReason[reason]++;
      if (reasonSamples[reason].length < 8) {
        reasonSamples[reason].push({
          code, path: catPath, leaf, label: fake.label, brand: fake.brand,
          violations: leafCheck.violations || splitCheck.violations,
          orig: fake.name, out: displayName,
        });
      }
    }

    if (brandContainsLeaf && !leafIn) {
      results.brandStripsLeaf++;
    }

    if (displayName.length < 30) results.shortName++;
    if (displayName.length > 80) results.longName++;
  }

  processed++;
  if (processed % 2000 === 0) console.log(`  진행 ${processed}/${ALL_CATS.length}`);
}

console.log('\n=== 결과 (총 ' + results.total + '건) ===');
const pct = (n) => ((n / results.total) * 100).toFixed(1) + '%';
console.log(`✅ leaf 키워드 포함:          ${results.leafIncluded} (${pct(results.leafIncluded)})`);
console.log(`   ↳ brand 안전한 케이스만:   ${results.leafIncludedBrandSafe}`);
console.log(`⚠️  synonym만 포함 (leaf x):   ${results.synonymOnly} (${pct(results.synonymOnly)})`);
console.log(`❌ leaf/synonym 둘 다 없음:    ${results.noLeafNoSynonym} (${pct(results.noLeafNoSynonym)})`);
console.log(`🚨 brand-leak이 leaf 강제삭제: ${results.brandStripsLeaf} (${pct(results.brandStripsLeaf)})`);
console.log(`📉 풀 데이터 빈약(generic only): ${results.poorPool} (${pct(results.poorPool)})`);
console.log(`📏 30자 미만:                 ${results.shortName} (${pct(results.shortName)})`);
console.log(`📏 80자 초과:                 ${results.longName} (${pct(results.longName)})`);

console.log('\n=== 실패 원인 분류 ===');
console.log('compliance(법규):  ', failureByReason.compliance);
console.log('1자 비-한글 leaf:  ', failureByReason.oneCharNonHangul);
console.log('brand-leak:       ', failureByReason.brandLeak);
console.log('기타(원인 미상):   ', failureByReason.unknown);
console.log('\n=== compliance 차단 샘플 ===');
for (const s of reasonSamples.compliance.slice(0, 5)) {
  console.log(`  ${s.path} | leaf="${s.leaf}" | violations=${JSON.stringify(s.violations)}`);
}
console.log('\n=== brand-leak 잔존 샘플 ===');
for (const s of reasonSamples.brandLeak.slice(0, 5)) {
  console.log(`  ${s.path} | leaf="${s.leaf}" brand="${s.brand}"`);
  console.log(`    out: ${s.out}`);
}
console.log('\n=== unknown 샘플 ===');
for (const s of reasonSamples.unknown.slice(0, 8)) {
  console.log(`  ${s.path} | leaf="${s.leaf}" label="${s.label}"`);
  console.log(`    out: ${s.out}`);
}
console.log('\n=== plain 케이스 실패 샘플 (leaf/synonym 둘 다 없음) ===');
for (const f of failures.slice(0, 30)) {
  console.log(`[${f.code}] ${f.path}`);
  console.log(`   leaf="${f.leaf}" brand="${f.brand}"`);
  console.log(`   원본: ${f.name}`);
  console.log(`   생성: ${f.displayName}`);
}

const out = {
  generatedAt: new Date().toISOString(),
  totalCategories: ALL_CATS.length,
  totalSamples: results.total,
  metrics: results,
  failureSamples: failures,
};
const outPath = `scripts/verification-reports/audit-display-name-seo-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\n전체 보고서: ${outPath}`);
