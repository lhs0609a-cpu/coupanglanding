#!/usr/bin/env node
// 모든 쿠팡 카테고리(16,259개) 대상 display-name-generator 오염 전수조사.
// 2가지 오염 경로 모두 측정:
//   A) match2 오매칭 — tiebreaker(길이) 때문에 관련없는 긴 5레벨 key 선점
//   B) merge1 대분류 병합 폴백 — 형제 카테고리 키워드 섞임

import { readFileSync } from 'fs';
import path from 'path';

const root = path.resolve(process.cwd());
const seoData = JSON.parse(readFileSync(path.join(root, 'src/lib/megaload/data/seo-keyword-pools.json'), 'utf8'));
const catDetails = JSON.parse(readFileSync(path.join(root, 'src/lib/megaload/data/coupang-cat-details.json'), 'utf8'));
// cat-details: { code: { p: ">-separated path", ... } }
const catList = Object.entries(catDetails)
  .map(([code, v]) => ({ code, path: v?.p }))
  .filter(e => e.path && e.path.includes('>'));

const POOLS = seoData.categoryPools;
const POOL_KEYS = Object.keys(POOLS);

/** 수정 후 로직: prefix 정확 일치만 유효, 1레벨 병합 폴백 제거 */
function findBestPool(categoryPath) {
  if (POOLS[categoryPath]) return { key: categoryPath, mode: 'exact' };
  const segments = categoryPath.split('>').map(s => s.trim());
  let bestKey = '';
  let bestDepth = 0;
  for (const key of POOL_KEYS) {
    const keySegs = key.split('>').map(s => s.trim());
    if (keySegs.length > segments.length) continue;
    let isPrefix = true;
    for (let i = 0; i < keySegs.length; i++) {
      if (segments[i] !== keySegs[i]) { isPrefix = false; break; }
    }
    if (!isPrefix) continue;
    if (keySegs.length > bestDepth) {
      bestDepth = keySegs.length;
      bestKey = key;
    }
  }
  if (bestDepth >= 2 && bestKey) return { key: bestKey, mode: 'match2', score: bestDepth };
  return { key: null, mode: 'path_only' };
}

/** 침투어 검출 — 선택된 풀 key가 카테고리 경로와 의미적으로 무관할 때의 전체 단어 */
function detectSemanticMismatch(categoryPath, result) {
  if (result.mode === 'path_only' || result.mode === 'exact') return null;
  const segments = categoryPath.split('>').map(s => s.trim());
  const keySegs = (result.key || '').split('>').map(s => s.trim());

  // 풀 key의 모든 세그먼트가 category path의 prefix와 정확 일치해야 정상 매칭
  const isPrefix = keySegs.every((seg, i) => segments[i] === seg);
  if (isPrefix) return null; // 정상

  // 불일치 지점 반환
  let mismatchAt = 0;
  for (let i = 0; i < keySegs.length; i++) {
    if (segments[i] !== keySegs[i]) { mismatchAt = i; break; }
  }
  return { keyUsed: result.key, mismatchAt, expectedSeg: segments[mismatchAt] || '(없음)', wrongSeg: keySegs[mismatchAt] };
}

// 전체 카테고리 순회
const stats = {
  total: 0, exact: 0, match2Ok: 0, match2Bad: 0, merge1: 0, pathOnly: 0,
};
const badSamples = new Map(); // 대분류 → samples

for (const { code, path: pathStr } of catList) {
  stats.total++;
  const r = findBestPool(pathStr);
  if (r.mode === 'exact') stats.exact++;
  else if (r.mode === 'match2') {
    const mm = detectSemanticMismatch(pathStr, r);
    if (mm) {
      stats.match2Bad++;
      const top = pathStr.split('>')[0].trim();
      if (!badSamples.has(top)) badSamples.set(top, []);
      if (badSamples.get(top).length < 4) {
        badSamples.get(top).push({ code, path: pathStr, wronglyMatched: r.key, detail: mm });
      }
    } else {
      stats.match2Ok++;
    }
  } else if (r.mode === 'merge1') stats.merge1++;
  else stats.pathOnly++;
}

console.log(`=== display-name-generator 오염 전수조사 (카테고리 ${catList.length}개) ===\n`);
console.log(`정확 매칭: ${stats.exact} (${(stats.exact/stats.total*100).toFixed(2)}%)`);
console.log(`match2 정상: ${stats.match2Ok} (${(stats.match2Ok/stats.total*100).toFixed(2)}%)`);
console.log(`match2 오매칭: ${stats.match2Bad} (${(stats.match2Bad/stats.total*100).toFixed(2)}%)  ⚠️ 블루베리 등 엉뚱한 풀 적용`);
console.log(`merge1 대분류 병합: ${stats.merge1} (${(stats.merge1/stats.total*100).toFixed(2)}%)  ⚠️ 형제 카테고리 단어 침투`);
console.log(`경로 세그먼트만: ${stats.pathOnly} (${(stats.pathOnly/stats.total*100).toFixed(2)}%)`);
const pollutedTotal = stats.match2Bad + stats.merge1;
console.log(`\n총 오염 카테고리: ${pollutedTotal} / ${stats.total} (${(pollutedTotal/stats.total*100).toFixed(2)}%)`);

console.log('\n=== match2 오매칭 대분류별 샘플 ===\n');
for (const [top, samples] of [...badSamples.entries()].sort()) {
  const count = catList.filter(c => {
    if (!c.path?.startsWith(top + '>')) return false;
    const rr = findBestPool(c.path);
    return rr.mode === 'match2' && detectSemanticMismatch(c.path, rr);
  }).length;
  console.log(`[${top}]  해당 대분류에서 ${count}건 오매칭`);
  for (const s of samples) {
    console.log(`  ${s.code} · ${s.path}`);
    console.log(`    → 엉뚱하게 매칭된 풀: "${s.wronglyMatched}"`);
    console.log(`    (segments[${s.detail.mismatchAt}] 기대="${s.detail.expectedSeg}", 풀key="${s.detail.wrongSeg}")`);
  }
  console.log('');
}

// 주요 테스트 케이스
console.log('=== 주요 시연 (사용자 보고 사례) ===');
const testCases = [
  '식품>신선식품>채소류>열매채소>고추',
  '식품>신선식품>쌀/잡곡류>쌀류>백미',
  '식품>신선식품>콩/두부/곤약>콩',
  '식품>신선식품>수산물>생선류>갈치',
  '식품>가공식품>라면',
  '식품>가공식품>김치',
  '출산/유아동>분유/유아식품>일반분유>스틱분유',
  '뷰티>스킨케어>크림',
];
for (const p of testCases) {
  const r = findBestPool(p);
  const mm = r.mode === 'match2' ? detectSemanticMismatch(p, r) : null;
  const tag = mm ? '⚠️ 오매칭' : r.mode === 'merge1' ? '⚠️ 병합' : '✓';
  console.log(`\n${tag} [${p}]`);
  console.log(`  → ${r.mode}: ${r.key || '(풀 없음 · 경로 세그먼트만 사용)'}`);
  if (r.mode !== 'path_only' && r.mode !== 'exact') {
    const pool = POOLS[r.key];
    if (pool) {
      const sample = [...(pool.generic || []).slice(0, 5), ...(pool.features || []).slice(0, 10)];
      console.log(`    적용되는 풀 샘플: ${sample.join(', ')}${(pool.features||[]).length > 10 ? ' …' : ''}`);
    }
  }
}
