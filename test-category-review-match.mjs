// ============================================================
// 4000+ 소분류 카테고리 × 후기 내용 일치성 전수검사
//
// 1. coupang-cat-details.json에서 전체 카테고리 로드
// 2. 카테고리 경로(leaf)로 가상 상품명 생성
// 3. generateRealReview()로 후기 생성
// 4. 카테고리 ↔ 후기 교차오염 탐지 (뷰티 후기가 식품에 등장 등)
// ============================================================

import { generateRealReview } from './src/lib/megaload/services/real-review-composer';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── 카테고리 로드 ──────────────────────────────────────────
const catDetailsPath = resolve('./src/lib/megaload/data/coupang-cat-details.json');
const catDetails = JSON.parse(readFileSync(catDetailsPath, 'utf-8'));

// ─── 카테고리별 배타적 키워드 (교차오염 탐지용) ─────────────
// 해당 카테고리 후기에서만 나와야 하는 키워드
const CATEGORY_EXCLUSIVE_KEYWORDS = {
  '뷰티': {
    ownTerms: ['피부', '보습', '수분', '각질', '트러블', '모공', '탄력', '미백', '세안', '화장', '스킨', '로션', '세럼', '크림', '팩', '자외선', '선크림', '클렌징', '톤업', '메이크업'],
    forbiddenIn: ['식품', '가전/디지털', '자동차용품', '스포츠/레져'],
  },
  '식품': {
    ownTerms: ['맛있', '먹', '식감', '달달', '고소', '담백', '칼로리', '영양', '유통기한', '냉장', '냉동', '조리', '레시피', '간식', '반찬', '밥', '국물'],
    forbiddenIn: ['뷰티', '가전/디지털', '자동차용품', '가구/홈데코'],
  },
  '가전/디지털': {
    ownTerms: ['소음', '전력', '충전', '배터리', '와트', '볼트', '모터', '흡입력', '디스플레이', '해상도', '블루투스', '와이파이', '스피커'],
    forbiddenIn: ['뷰티', '식품', '패션의류잡화'],
  },
  '패션의류잡화': {
    ownTerms: ['핏', '사이즈', '착용', '코디', '원단', '봉제', '재질', '기장', '루즈', '슬림', '오버핏', '스타일링'],
    forbiddenIn: ['식품', '가전/디지털', '자동차용품'],
  },
  '반려/애완용품': {
    ownTerms: ['강아지', '고양이', '반려', '사료', '간식', '배변', '산책', '하네스', '목줄', '캣타워', '펫'],
    forbiddenIn: ['뷰티', '가전/디지털', '자동차용품', '패션의류잡화'],
  },
  '자동차용품': {
    ownTerms: ['차량', '엔진', '타이어', '세차', '광택', '대시보드', '운전', '주차', '시트', '핸들'],
    forbiddenIn: ['뷰티', '식품', '출산/유아동'],
  },
  '출산/유아동': {
    ownTerms: ['아기', '유아', '젖병', '기저귀', '이유식', '아이', '아기띠', '유모차', '분유', '돌잔치'],
    forbiddenIn: ['자동차용품', '가전/디지털'],
  },
};

// ─── 대분류 판별 ────────────────────────────────────────────
function getMajorCategory(categoryPath) {
  const top = categoryPath.split('>')[0]?.trim() || '';
  if (top.includes('뷰티') || top.includes('화장품')) return '뷰티';
  if (top.includes('식품') || top.includes('건강식품')) return '식품';
  if (top.includes('생활') || categoryPath.includes('세제') || categoryPath.includes('욕실')) return '생활용품';
  if (top.includes('가전') || top.includes('디지털')) return '가전/디지털';
  if (top.includes('패션') || top.includes('의류')) return '패션의류잡화';
  if (top.includes('가구') || top.includes('홈데코')) return '가구/홈데코';
  if (top.includes('출산') || top.includes('유아')) return '출산/유아동';
  if (top.includes('스포츠') || top.includes('레져')) return '스포츠/레져';
  if (top.includes('반려') || top.includes('애완')) return '반려/애완용품';
  if (top.includes('주방')) return '주방용품';
  if (top.includes('문구') || top.includes('사무')) return '문구/오피스';
  if (top.includes('완구') || top.includes('취미')) return '완구/취미';
  if (top.includes('자동차')) return '자동차용품';
  return 'DEFAULT';
}

// ─── 카테고리 경로에서 가상 상품명 생성 ─────────────────────
function generateVirtualProductName(categoryPath) {
  const parts = categoryPath.split('>').map(p => p.trim());
  // 맨 끝(소분류) + 중분류를 조합
  const leaf = parts[parts.length - 1] || '상품';
  const mid = parts.length >= 3 ? parts[parts.length - 2] : '';

  // 현실적인 상품명 패턴
  const suffixes = ['프리미엄', '베스트', '인기', '추천', '고급', ''];
  const units = ['1개', '세트', '500ml', '1kg', '100g', '대용량', ''];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  const unit = units[Math.floor(Math.random() * units.length)];

  return `${suffix} ${mid} ${leaf} ${unit}`.replace(/\s+/g, ' ').trim();
}

// ─── 교차오염 검사 ──────────────────────────────────────────
function checkCrossContamination(majorCat, reviewText) {
  const issues = [];

  for (const [otherCat, config] of Object.entries(CATEGORY_EXCLUSIVE_KEYWORDS)) {
    // 자기 카테고리는 스킵
    if (otherCat === majorCat) continue;

    // 이 카테고리의 용어가 현재 제품 후기에 금지인지 확인
    if (!config.forbiddenIn.includes(majorCat)) continue;

    // 다른 카테고리의 배타적 용어가 내 후기에 나타나는지 검사
    const found = config.ownTerms.filter(term => reviewText.includes(term));
    if (found.length >= 3) { // 3개 이상 매칭 시 교차오염 의심
      issues.push({
        contaminatingCategory: otherCat,
        matchedTerms: found,
        count: found.length,
      });
    }
  }

  return issues;
}

// ─── 미해결 변수 검사 ───────────────────────────────────────
function checkUnresolvedVariables(text) {
  const matches = text.match(/\{[^}]+\}/g);
  return matches || [];
}

// ─── 메인 실행 ──────────────────────────────────────────────
console.log('='.repeat(70));
console.log('  4000+ 소분류 카테고리 × 후기 내용 일치성 전수검사');
console.log('='.repeat(70));
console.log('');

const allCategoryCodes = Object.keys(catDetails);
console.log(`총 카테고리 수: ${allCategoryCodes.length}`);

// 대분류별 집계
const majorCatCounts = {};
for (const code of allCategoryCodes) {
  const path = catDetails[code].p;
  if (!path) continue;
  const major = getMajorCategory(path);
  majorCatCounts[major] = (majorCatCounts[major] || 0) + 1;
}
console.log('\n대분류별 소분류 카테고리 수:');
for (const [cat, count] of Object.entries(majorCatCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}개`);
}

// 전수검사 실행
const sellerSeed = 'test-seller-2024';
let totalTested = 0;
let crossContaminations = [];
let unresolvedVarIssues = [];
let emptyReviews = [];
let shortReviews = [];
let defaultFallbacks = [];

const startTime = Date.now();

for (const code of allCategoryCodes) {
  const detail = catDetails[code];
  const categoryPath = detail.p;
  if (!categoryPath) continue;

  const majorCat = getMajorCategory(categoryPath);
  const productName = generateVirtualProductName(categoryPath);

  try {
    const result = generateRealReview(productName, categoryPath, sellerSeed, totalTested);
    const fullText = result.paragraphs.join(' ');
    totalTested++;

    // 1. 빈 후기 검사
    if (!result.paragraphs || result.paragraphs.length === 0) {
      emptyReviews.push({ code, categoryPath, productName });
      continue;
    }

    // 2. 짧은 후기 검사 (400자 미만)
    if (fullText.length < 400) {
      shortReviews.push({ code, categoryPath, productName, charCount: fullText.length });
    }

    // 3. 미해결 변수 검사
    const unresolved = checkUnresolvedVariables(fullText);
    if (unresolved.length > 0) {
      unresolvedVarIssues.push({ code, categoryPath, productName, unresolved });
    }

    // 4. DEFAULT 폴백 사용 여부
    if (majorCat === 'DEFAULT') {
      defaultFallbacks.push({ code, categoryPath, productName });
    }

    // 5. 교차오염 검사
    const contaminations = checkCrossContamination(majorCat, fullText);
    if (contaminations.length > 0) {
      crossContaminations.push({
        code,
        categoryPath,
        majorCat,
        productName,
        fullText: fullText.substring(0, 200) + '...',
        contaminations,
      });
    }

    // 진행률 표시
    if (totalTested % 500 === 0) {
      console.log(`  ... ${totalTested}개 검사 완료 (${Date.now() - startTime}ms)`);
    }
  } catch (err) {
    console.error(`  ERROR [${code}] ${categoryPath}: ${err.message}`);
  }
}

const elapsed = Date.now() - startTime;

// ─── 결과 출력 ──────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('  검사 결과');
console.log('='.repeat(70));

console.log(`\n총 검사: ${totalTested}개 카테고리 (${elapsed}ms)`);
console.log(`속도: ${(totalTested / elapsed * 1000).toFixed(0)}개/초\n`);

// 1. 빈 후기
console.log(`\n[1] 빈 후기 (문단 0개): ${emptyReviews.length}건`);
if (emptyReviews.length > 0) {
  emptyReviews.slice(0, 10).forEach(e => console.log(`  ❌ ${e.categoryPath} → "${e.productName}"`));
}

// 2. 짧은 후기
console.log(`\n[2] 짧은 후기 (400자 미만): ${shortReviews.length}건`);
if (shortReviews.length > 0) {
  shortReviews.slice(0, 10).forEach(e => console.log(`  ⚠️ ${e.categoryPath} → ${e.charCount}자 "${e.productName}"`));
}

// 3. 미해결 변수
console.log(`\n[3] 미해결 {변수}: ${unresolvedVarIssues.length}건`);
if (unresolvedVarIssues.length > 0) {
  unresolvedVarIssues.slice(0, 10).forEach(e =>
    console.log(`  ⚠️ ${e.categoryPath} → ${e.unresolved.join(', ')}`)
  );
  // 미해결 변수별 빈도
  const varFreq = {};
  unresolvedVarIssues.forEach(e => e.unresolved.forEach(v => varFreq[v] = (varFreq[v] || 0) + 1));
  console.log('\n  변수별 빈도:');
  Object.entries(varFreq).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([v, c]) =>
    console.log(`    ${v}: ${c}건`)
  );
}

// 4. DEFAULT 폴백
console.log(`\n[4] DEFAULT 폴백 (매핑 안 된 대분류): ${defaultFallbacks.length}건`);
if (defaultFallbacks.length > 0) {
  // 대분류별 그룹핑
  const groups = {};
  defaultFallbacks.forEach(e => {
    const top = e.categoryPath.split('>')[0]?.trim() || 'UNKNOWN';
    if (!groups[top]) groups[top] = [];
    groups[top].push(e);
  });
  Object.entries(groups).sort((a, b) => b[1].length - a[1].length).forEach(([top, items]) => {
    console.log(`  📌 "${top}" (${items.length}건): ${items.slice(0, 3).map(i => i.categoryPath).join(', ')}...`);
  });
}

// 5. 교차오염 (핵심!)
console.log(`\n[5] 교차오염 (다른 카테고리 용어 3개+ 발견): ${crossContaminations.length}건`);
if (crossContaminations.length > 0) {
  // 심각도별 정렬
  crossContaminations.sort((a, b) => {
    const aMax = Math.max(...a.contaminations.map(c => c.count));
    const bMax = Math.max(...b.contaminations.map(c => c.count));
    return bMax - aMax;
  });

  console.log('\n  --- 심각도 높은 순 (상위 30건) ---');
  crossContaminations.slice(0, 30).forEach((e, i) => {
    console.log(`\n  [${i + 1}] ${e.majorCat} → "${e.productName}"`);
    console.log(`      카테고리: ${e.categoryPath}`);
    e.contaminations.forEach(c => {
      console.log(`      ❌ ${c.contaminatingCategory} 용어 ${c.count}개: ${c.matchedTerms.join(', ')}`);
    });
    console.log(`      후기 앞부분: ${e.fullText}`);
  });

  // 오염 패턴 분석
  console.log('\n  --- 오염 패턴 요약 ---');
  const patternCounts = {};
  crossContaminations.forEach(e => {
    e.contaminations.forEach(c => {
      const pattern = `${e.majorCat} ← ${c.contaminatingCategory}`;
      patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
    });
  });
  Object.entries(patternCounts).sort((a, b) => b[1] - a[1]).forEach(([pattern, count]) => {
    console.log(`    ${pattern}: ${count}건`);
  });
} else {
  console.log('  ✅ 교차오염 없음!');
}

// ─── 종합 판정 ──────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('  종합 판정');
console.log('='.repeat(70));

const criticalIssues = emptyReviews.length + crossContaminations.filter(c =>
  c.contaminations.some(x => x.count >= 5)
).length;

const warnings = shortReviews.length + unresolvedVarIssues.length + defaultFallbacks.length;

if (criticalIssues === 0 && warnings === 0) {
  console.log('\n  ✅ 전체 PASS — 교차오염 없음, 모든 카테고리 정상');
} else if (criticalIssues === 0) {
  console.log(`\n  ⚠️ 경고 ${warnings}건 있으나 심각한 교차오염 없음`);
} else {
  console.log(`\n  ❌ 심각한 문제 ${criticalIssues}건 발견! 수정 필요`);
}

console.log(`\n  검사 완료: ${totalTested}개 카테고리, ${elapsed}ms`);
console.log('');
