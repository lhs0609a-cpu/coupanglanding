/**
 * 감사 결과 세분화 분석 — 대분류별 이슈 분포 + 오염 유형 분류
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const BASE = 'G:/내 드라이브/landingpage/coupanglanding/src/lib/megaload';
const catDetails = JSON.parse(readFileSync(join(BASE, 'data/coupang-cat-details.json'), 'utf8'));
const seoData = JSON.parse(readFileSync(join(BASE, 'data/seo-keyword-pools.json'), 'utf8'));
const CATEGORY_POOLS = seoData.categoryPools;
const SYNONYM_GROUPS = seoData.synonymGroups;

// ─── seeded random (동일) ──
function stringToSeed(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return h >>> 0; }
function createSeededRandom(seed) { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function selectSubset(items, count, rng) { if (items.length <= count) return [...items]; const sh = [...items]; for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; } return sh.slice(0, count); }

// 대분류별 카테고리 분류
const allCats = [];
for (const [code, detail] of Object.entries(catDetails)) {
  if (detail.p) {
    const segments = detail.p.split('>').map(s => s.trim());
    allCats.push({ code, path: detail.p, top: segments[0], leaf: segments[segments.length - 1] });
  }
}

// 대분류별 카테고리 수
const topLevel = {};
for (const cat of allCats) {
  topLevel[cat.top] = (topLevel[cat.top] || 0) + 1;
}

console.log('━━━ 대분류별 카테고리 분포 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const sorted = Object.entries(topLevel).sort((a, b) => b[1] - a[1]);
for (const [top, count] of sorted) {
  const pct = (count / allCats.length * 100).toFixed(1);
  console.log(`  ${top.padEnd(20)} ${String(count).padStart(5)}개 (${pct}%)`);
}

// 상품 판매 관련 대분류 vs 비관련 대분류
const PRODUCT_TOPS = new Set([
  '식품', '뷰티', '생활용품', '가전디지털', '패션의류/잡화', '패션잡화', '가구/홈데코',
  '출산/유아동', '스포츠/레져', '반려/애완용품', '주방용품', '문구/오피스', '완구/취미',
  '자동차용품', '건강/의료용품', '헬스/건강식품', '여성패션', '남성패션', '생활/건강',
  '화장품/미용', '디지털/가전', '스포츠/레저', '출산/육아', '식품/건강',
  // 쿠팡 실제 대분류
  '여성패션', '남성패션', '남녀 공용 의류', '유아동패션', '뷰티', '출산/유아동', '식품',
  '주방용품', '생활용품', '홈인테리어', '가전디지털', '스포츠/레저', '자동차/공구', '도서/음반/DVD',
  '완구/취미', '문구/오피스', '반려동물용품', '헬스/건강식품', '가구/홈데코',
]);

const NON_PRODUCT_TOPS = new Set(['도서', '도서/음반/DVD', 'DVD', '음반']);

// SEO 풀 커버리지 심층 분석 (대분류별)
console.log('\n━━━ 대분류별 SEO 풀 커버리지 ━━━━━━━━━━━━━━━━━━━━━━━━━━');

const poolCoverage = {};
for (const cat of allCats) {
  if (!poolCoverage[cat.top]) poolCoverage[cat.top] = { exact: 0, twoLevel: 0, oneLevel: 0, noPool: 0, total: 0 };
  poolCoverage[cat.top].total++;

  if (CATEGORY_POOLS[cat.path]) {
    poolCoverage[cat.top].exact++;
    continue;
  }

  const segments = cat.path.split('>').map(s => s.trim());
  let bestScore = 0;
  for (const key of Object.keys(CATEGORY_POOLS)) {
    const ks = key.split('>').map(s => s.trim());
    let m = 0;
    for (let i = 0; i < Math.min(segments.length, ks.length); i++) { if (segments[i] === ks[i]) m++; else break; }
    if (m > bestScore) bestScore = m;
  }

  if (bestScore >= 2) poolCoverage[cat.top].twoLevel++;
  else if (bestScore >= 1) poolCoverage[cat.top].oneLevel++;
  else poolCoverage[cat.top].noPool++;
}

console.log(`${'대분류'.padEnd(20)} ${'전체'.padStart(5)} ${'정확'.padStart(5)} ${'2+단계'.padStart(6)} ${'1단계'.padStart(6)} ${'미매칭'.padStart(6)} 매칭률`);
for (const [top, c] of Object.entries(poolCoverage).sort((a, b) => b[1].total - a[1].total)) {
  const matchRate = ((c.exact + c.twoLevel) / c.total * 100).toFixed(0);
  console.log(`  ${top.padEnd(20)} ${String(c.total).padStart(5)} ${String(c.exact).padStart(5)} ${String(c.twoLevel).padStart(6)} ${String(c.oneLevel).padStart(6)} ${String(c.noPool).padStart(6)} ${matchRate}%`);
}

// 오염 유형 분류
console.log('\n━━━ 오염(Contamination) 유형 분석 ━━━━━━━━━━━━━━━━━━━━━━');

// synonymGroup 키를 유형별로 분류
const synKeyTypes = {};
for (const key of Object.keys(SYNONYM_GROUPS)) {
  synKeyTypes[key] = SYNONYM_GROUPS[key];
}

// 어떤 synonym 키가 가장 많이 오염 원인인지 확인
// (위 테스트에서 상위 contaminant 단어 수집)
const contaminantCandidates = Object.keys(SYNONYM_GROUPS);
console.log(`\nSYNONYM_GROUPS 총 키 수: ${contaminantCandidates.length}개`);
console.log('\n주요 synonym 키 (상위 30개):');
for (const key of contaminantCandidates.slice(0, 30)) {
  console.log(`  "${key}" → [${SYNONYM_GROUPS[key].slice(0, 5).join(', ')}${SYNONYM_GROUPS[key].length > 5 ? '...' : ''}]`);
}

// 실제로 문제가 되는 케이스 분석
// "저자극" 이 synonym key에 있는지?
console.log('\n\n━━━ 오염 원인 단어 분석 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const testContaminants = ['저자극', '대용량', '보습', '조명', '커피', '과자', '비스킷', '간식'];
for (const word of testContaminants) {
  const inSynKeys = Object.keys(SYNONYM_GROUPS).some(k => k.toLowerCase() === word.toLowerCase());
  const inSynValues = Object.entries(SYNONYM_GROUPS).find(([, vals]) => vals.some(v => v.toLowerCase() === word.toLowerCase()));
  const containsSynKey = Object.keys(SYNONYM_GROUPS).filter(k => word.toLowerCase().includes(k.toLowerCase()));
  console.log(`  "${word}": synKey=${inSynKeys}, synValue=${!!inSynValues}, containsSynKey=[${containsSynKey.join(',')}]`);
  if (inSynValues) console.log(`    → synGroup: "${inSynValues[0]}" = [${inSynValues[1].slice(0, 5).join(', ')}]`);
}

// 수식어(MODIFIER_POOL)와 synonym 키 교차점 분석
const MODIFIER_POOL = [
  '프리미엄', '유기농', '무농약', '친환경', '저자극', '고농축', '대용량',
  '순수', '내추럴', '클래식', '오리지널', '플러스', '스페셜', '리뉴얼',
  '미니', '점보', '에코', '슬림', '울트라', '마일드', '센시티브',
  '모이스처', '인텐시브', '디럭스', '라이트', '스탠다드',
];

console.log('\n\n━━━ 수식어 ↔ Synonym 교차점 ━━━━━━━━━━━━━━━━━━━━━━━━━━');
for (const mod of MODIFIER_POOL) {
  const modLower = mod.toLowerCase();
  const matchingKeys = Object.keys(SYNONYM_GROUPS).filter(k => {
    const kl = k.toLowerCase();
    return modLower.includes(kl) || kl.includes(modLower);
  });
  if (matchingKeys.length > 0) {
    console.log(`  "${mod}" ↔ synonym keys: [${matchingKeys.join(', ')}]`);
  }
}

// 길이 미달 원인 분석: 풀이 없는 카테고리의 generic 키워드 수
console.log('\n\n━━━ 길이 미달 원인: generic 키워드 부족 ━━━━━━━━━━━━━━━━');
let emptyGenericCount = 0;
let fewGenericCount = 0;
for (const cat of allCats.slice(0, 500)) {
  const pool = findBestPoolForAnalysis(cat.path);
  if (pool.generic.length === 0) emptyGenericCount++;
  if (pool.generic.length <= 3) fewGenericCount++;
}
console.log(`  generic 0개: ${emptyGenericCount}/500 (${(emptyGenericCount/5).toFixed(1)}%)`);
console.log(`  generic 1~3개: ${fewGenericCount}/500 (${(fewGenericCount/5).toFixed(1)}%)`);

function findBestPoolForAnalysis(categoryPath) {
  if (CATEGORY_POOLS[categoryPath]) return CATEGORY_POOLS[categoryPath];
  const segments = categoryPath.split('>').map(s => s.trim());
  let bestKey = ''; let bestScore = 0;
  for (const key of Object.keys(CATEGORY_POOLS)) {
    const ks = key.split('>').map(s => s.trim());
    let m = 0;
    for (let i = 0; i < Math.min(segments.length, ks.length); i++) { if (segments[i] === ks[i]) m++; else break; }
    if (m > bestScore || (m === bestScore && key.length > bestKey.length)) { bestScore = m; bestKey = key; }
  }
  if (bestScore >= 2 && bestKey) return CATEGORY_POOLS[bestKey];
  if (bestScore >= 1) {
    const merged = { generic: [], ingredients: [], features: [] };
    const seen = new Set();
    for (const key of Object.keys(CATEGORY_POOLS)) {
      if (key.split('>')[0].trim() === segments[0]) {
        const p = CATEGORY_POOLS[key];
        for (const g of p.generic) { if (!seen.has(g.toLowerCase())) { seen.add(g.toLowerCase()); merged.generic.push(g); } }
      }
    }
    if (merged.generic.length > 0) return merged;
  }
  const generic = [];
  for (const s of segments) { if (s.length >= 2) generic.push(s); }
  return { generic, ingredients: [], features: [] };
}

// 핵심 상품 카테고리(식품/뷰티/생활/가전)만 따로 통계
console.log('\n\n━━━ 핵심 상품 카테고리별 상세 분석 ━━━━━━━━━━━━━━━━━━━━');
const KEY_VERTICALS = ['식품', '뷰티', '생활용품', '가전디지털', '패션의류/잡화', '여성패션', '남성패션', '출산/유아동', '스포츠/레저', '주방용품'];
for (const vertical of KEY_VERTICALS) {
  const verticalCats = allCats.filter(c => c.top === vertical);
  if (verticalCats.length === 0) continue;

  let exactPool = 0, twoLevel = 0, oneLevel = 0, noPool = 0;
  let genericLens = [];

  for (const cat of verticalCats) {
    const pool = findBestPoolForAnalysis(cat.path);
    genericLens.push(pool.generic.length);

    if (CATEGORY_POOLS[cat.path]) { exactPool++; continue; }
    const segments = cat.path.split('>').map(s => s.trim());
    let bestScore = 0;
    for (const key of Object.keys(CATEGORY_POOLS)) {
      const ks = key.split('>').map(s => s.trim());
      let m = 0;
      for (let i = 0; i < Math.min(segments.length, ks.length); i++) { if (segments[i] === ks[i]) m++; else break; }
      if (m > bestScore) bestScore = m;
    }
    if (bestScore >= 2) twoLevel++;
    else if (bestScore >= 1) oneLevel++;
    else noPool++;
  }

  const avgGeneric = genericLens.reduce((a, b) => a + b, 0) / genericLens.length;
  console.log(`\n  [${vertical}] 총 ${verticalCats.length}개`);
  console.log(`    풀: 정확=${exactPool}, 2단계=${twoLevel}, 1단계=${oneLevel}, 미매칭=${noPool}`);
  console.log(`    generic 평균: ${avgGeneric.toFixed(1)}개, 최소=${Math.min(...genericLens)}, 최대=${Math.max(...genericLens)}`);
}

console.log('\n\n완료.');
