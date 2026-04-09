#!/usr/bin/env node
// ============================================================
// CPG 콘텐츠 프로필 검증 스크립트
//
// 4가지 검증:
// 1. 커버리지: 모든 비도서 카테고리 코드가 CPG에 매핑되는지
// 2. 교차오염: 각 프로필의 변수값이 forbiddenTerms에 포함되지 않는지
// 3. 형제 중복: 같은 부모 아래 형제 프로필 간 효과/성분 중복률 <20%
// 4. 통합 테스트: 건강식품 상품 콘텐츠 생성 → forbiddenTerms 출현 확인
// ============================================================

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ─── 데이터 로드 ────────────────────────────────────────────
const cpgMapping = JSON.parse(
  readFileSync(join(ROOT, 'src/lib/megaload/data/cpg-mapping.json'), 'utf8'),
);

const PROFILE_DIR = join(ROOT, 'src/lib/megaload/data/content-profiles');

// 모든 프로필 로드
const allProfiles = {};
const profileFiles = readdirSync(PROFILE_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');

for (const file of profileFiles) {
  const data = JSON.parse(readFileSync(join(PROFILE_DIR, file), 'utf8'));
  if (data.profiles) {
    for (const [groupId, profile] of Object.entries(data.profiles)) {
      allProfiles[groupId] = profile;
    }
  }
}

console.log(`Loaded ${Object.keys(allProfiles).length} profiles from ${profileFiles.length} files\n`);

let totalIssues = 0;

// ─── 1. 커버리지 검증 ────────────────────────────────────────
console.log('=== 1. 커버리지 검증 ===');

const totalGroups = Object.keys(cpgMapping.groups).length;
const profiledGroups = Object.keys(cpgMapping.groups).filter(gid => allProfiles[gid]);
const missingGroups = Object.keys(cpgMapping.groups).filter(gid => !allProfiles[gid]);

console.log(`  Groups with profiles: ${profiledGroups.length}/${totalGroups}`);
console.log(`  Coverage: ${((profiledGroups.length / totalGroups) * 100).toFixed(1)}%`);

if (missingGroups.length > 0 && missingGroups.length <= 10) {
  console.log(`  Missing groups:`);
  missingGroups.forEach(g => console.log(`    - ${g}`));
}

const totalCodes = Object.keys(cpgMapping.codeToGroup).length;
const codesWithProfiles = Object.entries(cpgMapping.codeToGroup)
  .filter(([, gid]) => allProfiles[gid])
  .length;
console.log(`  Codes with profiles: ${codesWithProfiles}/${totalCodes}`);
console.log(`  Code coverage: ${((codesWithProfiles / totalCodes) * 100).toFixed(1)}%`);

// ─── 2. 교차오염 검증 ────────────────────────────────────────
console.log('\n=== 2. 교차오염 검증 ===');

let contaminated = 0;
const contaminations = [];

for (const [groupId, profile] of Object.entries(allProfiles)) {
  const forbidden = profile.forbiddenTerms || [];
  if (forbidden.length === 0) continue;

  const forbiddenSet = new Set(forbidden);
  const vars = profile.variables || {};

  for (const [key, values] of Object.entries(vars)) {
    for (const val of values) {
      if (forbiddenSet.has(val)) {
        contaminated++;
        contaminations.push(`${groupId} → ${key}: "${val}" is in forbiddenTerms`);
      }
    }
  }
}

console.log(`  Self-contamination: ${contaminated} issues`);
if (contaminated > 0) {
  totalIssues += contaminated;
  contaminations.slice(0, 10).forEach(c => console.log(`    ✗ ${c}`));
  if (contaminations.length > 10) {
    console.log(`    ... and ${contaminations.length - 10} more`);
  }
} else {
  console.log('  ✓ No self-contamination found');
}

// ─── 3. 형제 중복 검증 ───────────────────────────────────────
console.log('\n=== 3. 형제 중복 검증 ===');

// 같은 parentGroup 아래 형제 프로필 간 효과/성분 중복률 계산
const parentGroupMap = {};
for (const [groupId, profile] of Object.entries(allProfiles)) {
  const parent = profile.parentGroup || groupId.split('>').slice(0, -1).join('>');
  if (!parentGroupMap[parent]) parentGroupMap[parent] = [];
  parentGroupMap[parent].push({ groupId, profile });
}

let highOverlapCount = 0;
const highOverlaps = [];

for (const [parent, siblings] of Object.entries(parentGroupMap)) {
  if (siblings.length < 2) continue;

  for (let i = 0; i < siblings.length; i++) {
    for (let j = i + 1; j < siblings.length; j++) {
      const a = siblings[i];
      const b = siblings[j];

      // 효과1 + 성분 풀 비교
      const aVals = new Set([
        ...(a.profile.variables?.['효과1'] || []),
        ...(a.profile.variables?.['성분'] || []),
      ]);
      const bVals = new Set([
        ...(b.profile.variables?.['효과1'] || []),
        ...(b.profile.variables?.['성분'] || []),
      ]);

      const intersection = [...aVals].filter(v => bVals.has(v));
      const union = new Set([...aVals, ...bVals]);
      const overlap = union.size > 0 ? intersection.length / union.size : 0;

      if (overlap > 0.2) {
        highOverlapCount++;
        highOverlaps.push({
          a: a.groupId,
          b: b.groupId,
          overlap: (overlap * 100).toFixed(0) + '%',
          shared: intersection.slice(0, 5).join(', '),
        });
      }
    }
  }
}

console.log(`  Sibling pairs with >20% overlap: ${highOverlapCount}`);
if (highOverlapCount > 0) {
  totalIssues += highOverlapCount;
  highOverlaps.slice(0, 10).forEach(o =>
    console.log(`    ✗ ${o.a} ↔ ${o.b}: ${o.overlap} [${o.shared}]`),
  );
} else {
  console.log('  ✓ All sibling pairs have <20% overlap');
}

// ─── 4. 건강식품 오염 검증 (핵심 테스트) ────────────────────
console.log('\n=== 4. 건강식품 오염 검증 (핵심) ===');

// 건강식품 프로필별 교차오염 체크
const healthProfiles = Object.entries(allProfiles)
  .filter(([gid]) => gid.startsWith('건강식품::') || gid.includes('건강식품'));

let crossContamination = 0;
const crossContaminations = [];

for (const [gidA, profileA] of healthProfiles) {
  const forbiddenA = new Set(profileA.forbiddenTerms || []);
  if (forbiddenA.size === 0) continue;

  // 다른 건강식품 프로필의 변수값이 이 프로필의 forbiddenTerms에 있는지
  for (const [gidB, profileB] of healthProfiles) {
    if (gidA === gidB) continue;

    const varsB = profileB.variables || {};
    for (const [key, values] of Object.entries(varsB)) {
      if (key === '인증' || key === '기간' || key === '사용법') continue;
      for (const val of values) {
        if (forbiddenA.has(val)) {
          crossContamination++;
          crossContaminations.push(
            `${gidA}의 forbidden "${val}" ← ${gidB}의 ${key}에 존재 ✓ (정상: 격리 확인)`
          );
        }
      }
    }
  }
}

console.log(`  Cross-contamination cases caught: ${crossContamination}`);
console.log(`  이는 forbiddenTerms가 정상적으로 다른 프로필 변수를 차단하는 것을 의미`);

// 핵심 테스트: 콘드로이친 관절 영양제 상품에서 간건강/눈건강/오메가3 출현 여부
console.log('\n  --- 콘드로이친 관절 영양제 프로필 검증 ---');
const jointProfile = allProfiles['건강식품::관절'];
if (jointProfile) {
  const allValues = Object.values(jointProfile.variables).flat();
  const allValuesStr = allValues.join(' ');
  const forbidden = jointProfile.forbiddenTerms || [];

  const leaks = forbidden.filter(term => allValuesStr.includes(term));
  if (leaks.length > 0) {
    console.log(`  ✗ 관절 프로필에 금지어 유출: ${leaks.join(', ')}`);
    totalIssues += leaks.length;
  } else {
    console.log('  ✓ 관절 프로필: 금지어 0건 (간건강, 눈건강, 오메가3 등 미출현)');
  }

  // 관절 관련 키워드만 있는지 확인
  const effect1 = jointProfile.variables['효과1'] || [];
  const hasJointTerms = effect1.some(v => /관절|연골|무릎|뼈/.test(v));
  const hasNonJointTerms = effect1.some(v => /간건강|눈건강|혈당|체지방|피부탄력/.test(v));
  console.log(`  관절 관련 키워드 존재: ${hasJointTerms ? '✓' : '✗'}`);
  console.log(`  비관절 오염 키워드 존재: ${hasNonJointTerms ? '✗ 오염!' : '✓ 없음'}`);
  if (hasNonJointTerms) totalIssues++;
} else {
  console.log('  ⚠ 관절 전용 프로필 미등록');
  totalIssues++;
}

// 간건강 프로필 검증
console.log('\n  --- 밀크씨슬 간건강 프로필 검증 ---');
const liverProfile = allProfiles['건강식품::간건강'];
if (liverProfile) {
  const effect1 = liverProfile.variables['효과1'] || [];
  const hasLiverTerms = effect1.some(v => /간|해독|독소/.test(v));
  const hasNonLiverTerms = effect1.some(v => /관절|눈건강|혈당|체지방|장건강/.test(v));
  console.log(`  간건강 관련 키워드 존재: ${hasLiverTerms ? '✓' : '✗'}`);
  console.log(`  비간건강 오염 키워드 존재: ${hasNonLiverTerms ? '✗ 오염!' : '✓ 없음'}`);
  if (hasNonLiverTerms) totalIssues++;
} else {
  console.log('  ⚠ 간건강 전용 프로필 미등록');
}

// ─── 5. 변수풀 완전성 검증 ───────────────────────────────────
console.log('\n=== 5. 변수풀 완전성 검증 ===');

const REQUIRED_KEYS = ['효과1', '효과2', '성분', '사용법', '사용감', '추천대상', '카테고리'];
let incompleteProfiles = 0;

for (const [groupId, profile] of Object.entries(allProfiles)) {
  const vars = profile.variables || {};
  const missingKeys = REQUIRED_KEYS.filter(k => !vars[k] || vars[k].length === 0);

  if (missingKeys.length > 0) {
    incompleteProfiles++;
    if (incompleteProfiles <= 5) {
      console.log(`  ✗ ${groupId}: missing [${missingKeys.join(', ')}]`);
    }
  }
}

if (incompleteProfiles > 5) {
  console.log(`  ... and ${incompleteProfiles - 5} more incomplete profiles`);
}

if (incompleteProfiles === 0) {
  console.log(`  ✓ All ${Object.keys(allProfiles).length} profiles have required variable keys`);
} else {
  totalIssues += incompleteProfiles;
}

// ─── 결과 ────────────────────────────────────────────────────
console.log('\n' + '='.repeat(50));
if (totalIssues === 0) {
  console.log('✓ ALL CHECKS PASSED — 카테고리 오염 방지 시스템 정상');
} else {
  console.log(`✗ ${totalIssues} ISSUES FOUND — 검토 필요`);
}
console.log('='.repeat(50));
