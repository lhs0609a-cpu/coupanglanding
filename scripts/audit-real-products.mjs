#!/usr/bin/env node
// 실제 상품명 100개로 추출 검증 — 사용자 직접 확인용
//
// 사용자가 수동으로 결과를 보고 오답을 판정. 내가 GT를 만들지 않음.

import fs from 'node:fs';

const m = await import('../.build-test/lib/megaload/services/option-extractor-test-shim.js');
const { extractOptionsFromDetailsSimple } = m;

const TEST_DATA = JSON.parse(fs.readFileSync('scripts/test-data.json', 'utf8'));
const TEST_EXT = JSON.parse(fs.readFileSync('scripts/test-data-extended.json', 'utf8'));
Object.assign(TEST_DATA, TEST_EXT);
const CAT_DETAILS = JSON.parse(fs.readFileSync('src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

function normalizeBuyOpts(rawB) {
  if (!Array.isArray(rawB)) return [];
  return rawB.map(b => ({ name: b.n, unit: b.u, required: !!b.r, choose1: !!b.c1 }));
}

const lines = [];
let total = 0;
const issues = [];

for (const [catName, catData] of Object.entries(TEST_DATA)) {
  const code = catData.code;
  const det = CAT_DETAILS[code];
  if (!det) {
    lines.push(`\n=== ${catName} (${code}) ===`);
    lines.push(`  ⚠️ 카테고리 데이터 없음 (테스트 코드 잘못)`);
    continue;
  }
  const buyOpts = normalizeBuyOpts(det.b);
  lines.push(`\n=== ${catName} (${code}) ${det.p} ===`);
  lines.push(`  buyOpts: ${buyOpts.map(o => `${o.name}${o.unit ? `(${o.unit})` : ''}${o.choose1 ? '#c1' : ''}`).join(', ')}`);

  for (const productName of catData.products) {
    total++;
    const r = extractOptionsFromDetailsSimple(productName, buyOpts);
    const optStr = r.buyOptions.map(o => `${o.name}=${o.value}${o.unit || ''}`).join(' | ');
    lines.push(`\n  📦 ${productName}`);
    lines.push(`     → ${optStr || '(추출 없음)'}`);

    // 명백한 휴리스틱 검증 (GT 없이 invariant 검사)
    const localIssues = [];

    // 1) "Nmg/mcg/IU"는 성분 함량 — 절대 weight=N 으로 추출되면 안됨
    const mgMatches = productName.match(/(\d+)\s*(mg|mcg|μg|IU|iu)/gi);
    if (mgMatches) {
      for (const o of r.buyOptions) {
        if ((o.unit === 'g' || o.name.includes('중량')) && parseFloat(o.value) > 0) {
          // 만약 중량으로 추출됐는데 그 숫자가 mg/mcg/IU 값과 동일하면 BUG
          const wVal = parseFloat(o.value);
          for (const mm of mgMatches) {
            const mgVal = parseFloat(mm);
            if (mgVal === wVal) localIssues.push(`성분 함량 ${mm}이 중량으로 잘못 추출됨 (${o.value}g)`);
          }
        }
      }
    }

    // 2) "N개월" / "N개월분" 의 N은 절대 count로 추출되면 안됨
    const monthMatches = productName.match(/(\d+)\s*개월/g);
    if (monthMatches) {
      for (const o of r.buyOptions) {
        if (o.name === '수량' || o.name === '총 수량') {
          const cVal = parseInt(o.value);
          for (const mm of monthMatches) {
            const monthN = parseInt(mm);
            if (monthN === cVal) localIssues.push(`"개월" 숫자 ${mm}이 count로 잘못 추출됨 (count=${cVal})`);
          }
        }
      }
    }

    // 3) "N일분" / "N일"의 N도 count 아님
    const dayMatches = productName.match(/(\d+)\s*일/g);
    if (dayMatches) {
      for (const o of r.buyOptions) {
        if (o.name === '수량' || o.name === '총 수량') {
          const cVal = parseInt(o.value);
          for (const dm of dayMatches) {
            const dayN = parseInt(dm);
            if (dayN === cVal && dayN > 30) localIssues.push(`"일" 숫자 ${dm}이 count로 잘못 추출됨 (count=${cVal})`);
          }
        }
      }
    }

    // 4) 정/캡슐 옵션 카테고리에서 정 추출 0이면 의심 (정/캡슐 명시되어 있는데 0 또는 없음)
    const tabletPatternInName = /\d+\s*(정|캡슐|알|소프트젤|베지캡|타블렛|포)/.test(productName);
    if (tabletPatternInName) {
      const hasTabletOpt = buyOpts.some(o => (o.name.includes('캡슐') || o.name.includes('정')));
      const tabletOpt = r.buyOptions.find(o => o.name.includes('캡슐') || o.name.includes('정'));
      if (hasTabletOpt && !tabletOpt) localIssues.push('정/캡슐 표기 있는데 추출 누락');
    }

    if (localIssues.length > 0) {
      lines.push(`     ❌ ${localIssues.join(' | ')}`);
      issues.push({ category: catName, code, name: productName, output: optStr, issues: localIssues });
    } else {
      lines.push(`     ✓ invariant 통과`);
    }
  }
}

const output = lines.join('\n');
console.log(output);
console.log(`\n\n=== 종합 ===`);
console.log(`총 ${total}건 / invariant 위반: ${issues.length}건`);

const reportPath = `scripts/verification-reports/audit-real-products-${new Date().toISOString().replace(/[:.]/g,'-')}.txt`;
fs.writeFileSync(reportPath, output + `\n\n=== 종합: ${total}건 / 위반 ${issues.length}건 ===\n`);
console.log(`\n전체 보고서: ${reportPath}`);

if (issues.length > 0) {
  console.log(`\n=== 위반 케이스 ===`);
  for (const iss of issues) console.log(JSON.stringify(iss, null, 2));
}
