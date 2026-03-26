#!/usr/bin/env node
/**
 * 실제 함수 호출 테스트 — 4993 리프 카테고리 × 30 mock 상품
 *
 * 1. matchCategory(상품명, null, 네이버ID) 실제 호출 (Tier 0→네이버맵→로컬DB→Tier3)
 *    - CoupangAdapter 없이 호출하므로 Tier 1.5/2 (API) 스킵 → 순수 로컬 성능 측정
 * 2. generateDisplayName() 실제 호출 → 결과물 품질 검증
 * 3. 교차 검증: 네이버맵 결과 vs 상품명 매칭 결과 일치율
 *
 * 사용법:
 *   node scripts/test-real-category-matching.cjs [--limit 100] [--verbose] [--sample 5]
 */

const path = require('path');
const { performance } = require('perf_hooks');

// jiti로 TypeScript import
const jiti = require('jiti')(__filename, {
  alias: { '@': path.resolve(__dirname, '..', 'src') },
  transformOptions: { babel: { plugins: [] } },
});

// ── 실제 서비스 함수 import ──
const { matchCategory, matchByNaverCategory, matchCategoryBatch } = jiti('@/lib/megaload/services/category-matcher.ts');
const { generateDisplayName } = jiti('@/lib/megaload/services/display-name-generator.ts');

// ── JSON 데이터 ──
const naverCats = require('../src/lib/megaload/data/naver-categories.json');

// ── CLI 옵션 ──
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const sampleIdx = args.indexOf('--sample');
const sampleCount = sampleIdx !== -1 ? parseInt(args[sampleIdx + 1], 10) : 3;

// ── 현실적인 Mock 상품명 생성 ──
// 네이버 카테고리 경로의 키워드를 활용하여 실제 쇼핑몰에서 볼 법한 상품명 생성
const BRANDS = [
  '청정원', '풀무원', '오뚜기', 'CJ', '하림', '비비고', '삼양',
  '동원', '매일', '서울우유', '남양', '빙그레', '롯데', '농심',
  '아모레퍼시픽', 'LG생활건강', '이니스프리', '라네즈', '설화수',
  '나이키', '아디다스', '뉴발란스', '무인양품', '이케아',
  'LG전자', '삼성전자', '필립스', '다이슨', '보쉬',
];

const MODIFIERS = [
  '프리미엄', '유기농', '무농약', '100%', '고급', '신선한',
  '국내산', '수입', '저칼로리', '무첨가', '순수', '전문가용',
  '초경량', '대용량', '가성비', '한정판', '리뉴얼', '신상품',
  '친환경', '에너지절약형', '저소음', '고효율', '올인원',
];

const AMOUNTS = [
  '500ml', '1kg', '300g', '100정', '60캡슐', '30포',
  '1+1', '2박스', '10매', '5세트', '1개', '3팩',
  '250ml', '2kg', '500g', '90정', '50ml 3개입',
  '1L', '200g', '120정', '30개입', '15포',
];

function generateMockProducts(naverPath, count) {
  const parts = naverPath.split('>');
  const leaf = parts[parts.length - 1];
  const parent = parts.length > 1 ? parts[parts.length - 2] : '';
  const grandparent = parts.length > 2 ? parts[parts.length - 3] : '';

  const products = [];
  for (let i = 0; i < count; i++) {
    const brand = BRANDS[i % BRANDS.length];
    const mod = MODIFIERS[(i * 7 + 3) % MODIFIERS.length];
    const amt = AMOUNTS[(i * 11 + 5) % AMOUNTS.length];

    // 다양한 패턴으로 상품명 생성
    const patterns = [
      // 기본: [브랜드] 수식어 상품명 수량
      `[${brand}] ${mod} ${leaf} ${amt}`,
      // 부모 포함
      `${brand} ${parent} ${leaf} ${mod} ${amt}`,
      // 수식어 앞 배치
      `${mod} ${brand} ${leaf} ${amt}`,
      // 부모+조부모 키워드 포함
      `${brand} ${grandparent} ${parent} ${leaf} ${mod}`,
      // 복합 상품명
      `[${brand}] ${mod} ${parent} ${leaf} 세트 ${amt}`,
      // 짧은 상품명
      `${brand} ${leaf} ${amt}`,
      // 긴 상품명 (키워드 풍부)
      `[${brand}] ${mod} ${grandparent} ${parent} ${leaf} 선물세트 ${amt} 무료배송`,
      // 영문 브랜드 + 한글
      `${brand} ${leaf} ${mod} BEST ${amt}`,
      // 역순
      `${leaf} ${brand} ${mod} ${amt}`,
      // 상품+특징 중심
      `${mod} ${parent} ${leaf} ${brand}`,
      // 추가 10개 패턴
      `[${brand}] 인기 ${leaf} ${mod} ${amt}`,
      `${brand} ${leaf} 특가 ${amt}`,
      `${mod} ${leaf} ${amt} ${brand} 추천`,
      `[${brand}] NEW ${parent} ${leaf} ${amt}`,
      `${brand} 베스트셀러 ${leaf} ${mod}`,
      `${leaf} ${parent} ${mod} ${brand} ${amt}`,
      `[${brand}] ${leaf} 전문가용 ${amt}`,
      `${mod} ${brand} ${parent} ${leaf} 기획전`,
      `${brand} 올시즌 ${leaf} ${amt}`,
      `[${brand}] ${mod} ${leaf} 리미티드 에디션`,
      // 20~29: 더 다양하게
      `${brand} ${leaf} ${parent} 컬렉션 ${amt}`,
      `${mod} ${leaf} 가성비 ${brand}`,
      `[${brand}] ${grandparent} ${leaf} ${amt}`,
      `${brand} ${leaf} 세일 ${mod} ${amt}`,
      `${parent} ${leaf} ${brand} ${mod}`,
      `[${brand}] 오늘의특가 ${leaf} ${amt}`,
      `${brand} ${mod} ${leaf} 정기배송`,
      `${leaf} ${mod} ${amt} ${brand} 당일발송`,
      `[${brand}] 신상 ${leaf} ${parent} ${amt}`,
      `${brand} ${leaf} ${mod} 추천상품 ${amt}`,
    ];

    products.push({
      name: patterns[i % patterns.length],
      brand,
      index: i,
    });
  }
  return products;
}

// ── 노출상품명 품질 검증 ──
function validateDisplayName(displayName, originalName, categoryPath) {
  const issues = [];

  if (!displayName || displayName.trim().length === 0) {
    issues.push('빈 문자열');
  }
  if (displayName && displayName.length > 100) {
    issues.push(`100자 초과 (${displayName.length}자)`);
  }
  if (displayName && displayName.trim().length < 5) {
    issues.push(`너무 짧음 (${displayName.trim().length}자)`);
  }
  // 원본과 완전 동일하면 생성이 안 된 것
  // (단, fallback으로 원본을 반환할 수는 있으므로 경고 수준)
  if (displayName === originalName) {
    issues.push('원본과 동일 (생성 미적용)');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// ── 메인 ──
async function main() {
  console.log('='.repeat(80));
  console.log('  실제 함수 호출 기반 전체 카테고리 테스트');
  console.log('  matchCategory() + generateDisplayName() 실제 실행');
  console.log('='.repeat(80));

  const leafCategories = naverCats.all.filter(c => c.isLeaf);
  const totalLeaf = leafCategories.length;
  const testCount = Math.min(totalLeaf, limit);
  const productsPerCat = 30;

  console.log(`\n리프 카테고리: ${totalLeaf}개`);
  console.log(`테스트 대상: ${testCount}개 카테고리 × ${productsPerCat}개 상품 = ${(testCount * productsPerCat).toLocaleString()}개`);
  console.log(`모드: API 없이 로컬 전용 (Tier 0 → 네이버맵 → Tier 1 로컬DB)\n`);

  const startTime = performance.now();

  // ── 통계 ──
  // 카테고리 매칭
  let naverMapSuccess = 0;        // matchByNaverCategory 성공
  let naverMapFail = 0;
  let productMatchSuccess = 0;    // matchCategory(상품명) 성공
  let productMatchFail = 0;
  let crossMatchAgree = 0;        // 네이버맵 결과 == 상품명 결과 (동일 코드)
  let crossMatchDisagree = 0;
  let totalProducts = 0;

  // 노출상품명
  let displayNameOk = 0;
  let displayNameIssues = 0;
  const displayNameIssueDetails = [];

  // matchCategory tier 분포
  const sourceCounts = {};

  // 실패 수집
  const naverMapFailures = [];
  const productMatchFailures = [];
  const crossDisagreeExamples = [];

  // 샘플 수집 (카테고리별 첫 N개)
  const samples = [];

  for (let ci = 0; ci < testCount; ci++) {
    const cat = leafCategories[ci];

    // 1. 네이버맵 매칭
    const naverResult = matchByNaverCategory(cat.id);
    if (naverResult) {
      naverMapSuccess++;
    } else {
      naverMapFail++;
      naverMapFailures.push({ id: cat.id, path: cat.path });
    }

    // 2. 상품 30개 생성 & 테스트
    const mockProducts = generateMockProducts(cat.path, productsPerCat);
    const catSamples = [];

    for (const prod of mockProducts) {
      totalProducts++;

      // 2a. matchCategory(상품명, null, 네이버ID) — Tier 0→네이버맵→로컬DB
      let matchResult;
      try {
        matchResult = await matchCategory(prod.name, undefined, cat.id);
      } catch (err) {
        matchResult = null;
      }

      if (matchResult) {
        productMatchSuccess++;
        sourceCounts[matchResult.source] = (sourceCounts[matchResult.source] || 0) + 1;

        // 2b. 교차 검증: 네이버맵 결과 vs 상품명 매칭 결과
        if (naverResult) {
          if (matchResult.categoryCode === naverResult.categoryCode) {
            crossMatchAgree++;
          } else {
            crossMatchDisagree++;
            if (crossDisagreeExamples.length < 30) {
              crossDisagreeExamples.push({
                naverPath: cat.path,
                productName: prod.name,
                naverMapCode: naverResult.categoryCode,
                naverMapPath: naverResult.categoryPath,
                matchCode: matchResult.categoryCode,
                matchPath: matchResult.categoryPath,
                matchSource: matchResult.source,
              });
            }
          }
        }

        // 2c. 노출상품명 생성
        const categoryPath = matchResult.categoryPath || naverResult?.categoryPath || '';
        let displayName;
        try {
          displayName = generateDisplayName(
            prod.name,
            prod.brand,
            categoryPath,
            'test-seller-001',
            prod.index,
          );
        } catch (err) {
          displayName = '';
        }

        const validation = validateDisplayName(displayName, prod.name, categoryPath);
        if (validation.valid) {
          displayNameOk++;
        } else {
          displayNameIssues++;
          if (displayNameIssueDetails.length < 30) {
            displayNameIssueDetails.push({
              naverPath: cat.path,
              productName: prod.name,
              displayName,
              issues: validation.issues,
            });
          }
        }

        // 샘플 수집
        if (catSamples.length < sampleCount) {
          catSamples.push({
            productName: prod.name,
            matchCode: matchResult.categoryCode,
            matchPath: matchResult.categoryPath,
            confidence: matchResult.confidence,
            source: matchResult.source,
            displayName,
          });
        }
      } else {
        productMatchFail++;
        if (productMatchFailures.length < 50) {
          productMatchFailures.push({
            naverPath: cat.path,
            naverId: cat.id,
            productName: prod.name,
          });
        }
      }
    }

    if (verbose && catSamples.length > 0) {
      samples.push({ category: cat.path, samples: catSamples });
    }

    // 진행률
    if ((ci + 1) % 200 === 0 || ci === testCount - 1) {
      const pct = ((ci + 1) / testCount * 100).toFixed(1);
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(
        `\r  ${ci + 1}/${testCount} (${pct}%) — ${elapsed}s — 상품매칭: ${productMatchSuccess}/${totalProducts}  `
      );
    }
  }

  const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);

  // ── 결과 출력 ──
  console.log('\n\n' + '='.repeat(80));
  console.log('  테스트 결과');
  console.log('='.repeat(80));

  console.log('\n━━━ 1. 네이버→쿠팡 매핑 (matchByNaverCategory) ━━━');
  console.log(`  전체: ${testCount}`);
  console.log(`  ✅ 성공: ${naverMapSuccess} (${(naverMapSuccess / testCount * 100).toFixed(2)}%)`);
  console.log(`  ❌ 실패: ${naverMapFail} (${(naverMapFail / testCount * 100).toFixed(2)}%)`);

  console.log('\n━━━ 2. 상품명 기반 카테고리 매칭 (matchCategory) ━━━');
  console.log(`  전체 상품: ${totalProducts.toLocaleString()}`);
  console.log(`  ✅ 매칭 성공: ${productMatchSuccess.toLocaleString()} (${(productMatchSuccess / totalProducts * 100).toFixed(2)}%)`);
  console.log(`  ❌ 매칭 실패: ${productMatchFail.toLocaleString()} (${(productMatchFail / totalProducts * 100).toFixed(2)}%)`);

  console.log('\n  [ 매칭 소스 분포 ]');
  for (const [source, count] of Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${source}: ${count.toLocaleString()} (${(count / productMatchSuccess * 100).toFixed(1)}%)`);
  }

  console.log('\n━━━ 3. 교차 검증 (네이버맵 vs 상품명 매칭 일치율) ━━━');
  const crossTotal = crossMatchAgree + crossMatchDisagree;
  if (crossTotal > 0) {
    console.log(`  전체: ${crossTotal.toLocaleString()}`);
    console.log(`  ✅ 일치: ${crossMatchAgree.toLocaleString()} (${(crossMatchAgree / crossTotal * 100).toFixed(2)}%)`);
    console.log(`  ⚠ 불일치: ${crossMatchDisagree.toLocaleString()} (${(crossMatchDisagree / crossTotal * 100).toFixed(2)}%)`);
  }

  console.log('\n━━━ 4. 노출상품명 생성 (generateDisplayName) ━━━');
  const displayTotal = displayNameOk + displayNameIssues;
  console.log(`  전체: ${displayTotal.toLocaleString()}`);
  console.log(`  ✅ 정상: ${displayNameOk.toLocaleString()} (${(displayNameOk / displayTotal * 100).toFixed(2)}%)`);
  console.log(`  ⚠ 이슈: ${displayNameIssues.toLocaleString()} (${(displayNameIssues / displayTotal * 100).toFixed(2)}%)`);

  // 실패 상세
  if (naverMapFailures.length > 0) {
    console.log('\n[ 네이버맵 매칭 실패 ]');
    for (const f of naverMapFailures.slice(0, 10)) {
      console.log(`  ❌ [${f.id}] ${f.path}`);
    }
    if (naverMapFailures.length > 10) console.log(`  ... 외 ${naverMapFailures.length - 10}개`);
  }

  if (productMatchFailures.length > 0) {
    console.log('\n[ 상품명 매칭 실패 상세 (상위 20개) ]');
    for (const f of productMatchFailures.slice(0, 20)) {
      console.log(`  ❌ [${f.naverId}] ${f.naverPath}`);
      console.log(`     상품명: ${f.productName}`);
    }
    if (productMatchFailures.length > 20) console.log(`  ... 외 ${productMatchFailures.length - 20}개`);
  }

  if (crossDisagreeExamples.length > 0) {
    console.log('\n[ 교차 검증 불일치 예시 (상위 15개) ]');
    for (const d of crossDisagreeExamples.slice(0, 15)) {
      console.log(`  ⚠ 네이버: ${d.naverPath}`);
      console.log(`    상품명: ${d.productName}`);
      console.log(`    네이버맵 → ${d.naverMapCode} (${d.naverMapPath})`);
      console.log(`    상품매칭 → ${d.matchCode} (${d.matchPath}) [${d.matchSource}]`);
      console.log();
    }
  }

  if (displayNameIssueDetails.length > 0) {
    console.log('\n[ 노출상품명 이슈 (상위 15개) ]');
    for (const d of displayNameIssueDetails.slice(0, 15)) {
      console.log(`  ⚠ 카테고리: ${d.naverPath}`);
      console.log(`    원본: ${d.productName}`);
      console.log(`    생성: ${d.displayName}`);
      console.log(`    이슈: ${d.issues.join(', ')}`);
      console.log();
    }
  }

  // 샘플 출력
  if (verbose && samples.length > 0) {
    console.log('\n[ 카테고리별 샘플 (일부) ]');
    for (const s of samples.slice(0, 10)) {
      console.log(`\n  📂 ${s.category}`);
      for (const ex of s.samples) {
        console.log(`    원본: ${ex.productName}`);
        console.log(`    쿠팡: [${ex.matchCode}] ${ex.matchPath} (${ex.confidence.toFixed(2)}, ${ex.source})`);
        console.log(`    노출: ${ex.displayName}`);
      }
    }
  }

  console.log(`\n⏱ 총 소요시간: ${totalTime}s`);
  console.log('='.repeat(80));

  // ── 최종 판정 ──
  const naverRate = (naverMapSuccess / testCount * 100);
  const productRate = (productMatchSuccess / totalProducts * 100);
  const displayRate = displayTotal > 0 ? (displayNameOk / displayTotal * 100) : 100;
  const crossRate = crossTotal > 0 ? (crossMatchAgree / crossTotal * 100) : 100;

  console.log('\n🏆 최종 판정:');
  const report = (label, rate, threshold = 100) => {
    const icon = rate >= threshold ? '✅' : rate >= 95 ? '🟡' : '❌';
    console.log(`  ${icon} ${label}: ${rate.toFixed(2)}%`);
  };

  report('네이버→쿠팡 매핑', naverRate);
  report('상품명 카테고리 매칭', productRate);
  report('교차 검증 일치율', crossRate);
  report('노출상품명 생성', displayRate);

  const allPerfect = naverRate >= 100 && productRate >= 100 && displayRate >= 100;
  if (allPerfect) {
    console.log('\n  🎉 ALL PERFECT!');
  }

  process.exit(naverRate >= 99 && productRate >= 99 ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
