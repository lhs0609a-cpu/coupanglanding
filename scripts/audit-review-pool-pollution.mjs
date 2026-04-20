#!/usr/bin/env node
// FULL_REVIEWS 풀 매칭 오염 전수조사 (story-generator.ts findBestReviewPool)

import { readFileSync } from 'fs';
import path from 'path';

const FULL_REVIEWS = JSON.parse(readFileSync(path.join(process.cwd(), 'src/lib/megaload/data/full-review-templates.json'), 'utf8'));
const catDetails = JSON.parse(readFileSync(path.join(process.cwd(), 'src/lib/megaload/data/coupang-cat-details.json'), 'utf8'));
const catList = Object.entries(catDetails).map(([code, v]) => ({ code, path: v?.p })).filter(e => e.path?.includes('>'));
const REVIEW_KEYS = Object.keys(FULL_REVIEWS).filter(k => k !== '_comment' && Array.isArray(FULL_REVIEWS[k]) && FULL_REVIEWS[k].length > 0);

/** 수정 후 로직 (story-generator.ts) */
function findBestReviewPool(categoryPath) {
  if (FULL_REVIEWS[categoryPath]?.length > 0) return { key: categoryPath, mode: 'exact' };
  const parts = categoryPath.split('>').map(s => s.trim());
  for (let len = parts.length; len >= 1; len--) {
    const key = parts.slice(0, len).join('>');
    if (FULL_REVIEWS[key]?.length > 0) return { key, mode: `prefix${len}` };
  }
  return { key: 'DEFAULT', mode: 'default' };
}

/** 이전(버그 있던) 로직 */
function findBestReviewPool_OLD(categoryPath) {
  if (FULL_REVIEWS[categoryPath]?.length > 0) return { key: categoryPath, mode: 'exact' };
  const parts = categoryPath.split('>');
  for (let len = parts.length; len >= 2; len--) {
    const key = parts.slice(0, len).join('>');
    if (FULL_REVIEWS[key]?.length > 0) return { key, mode: `prefix${len}` };
  }
  let bestKey = '';
  let bestLen = 0;
  for (const key of REVIEW_KEYS) {
    if (categoryPath.includes(key) || key.includes(parts.slice(0, 3).join('>'))) {
      if (key.length > bestLen) { bestLen = key.length; bestKey = key; }
    }
  }
  if (bestKey) return { key: bestKey, mode: 'substring' };
  const top = parts[0];
  for (const key of REVIEW_KEYS) {
    if (key.startsWith(top)) return { key, mode: 'firstTop' };
  }
  return { key: 'DEFAULT', mode: 'default' };
}

/** prefix 불일치 탐지 — 다른 가지 풀이 붙은 경우 */
function isPollution(pathStr, matchedKey) {
  if (!matchedKey || matchedKey === 'DEFAULT') return false;
  if (!matchedKey.includes('>')) return false; // 대분류는 안전하다고 가정
  const pathSegs = pathStr.split('>').map(s => s.trim());
  const keySegs = matchedKey.split('>').map(s => s.trim());
  if (keySegs.length > pathSegs.length) return true;
  for (let i = 0; i < keySegs.length; i++) if (pathSegs[i] !== keySegs[i]) return true;
  return false;
}

let oldPol = 0, newPol = 0;
const oldSamples = [], newSamples = [];

for (const { path: p } of catList) {
  const oldR = findBestReviewPool_OLD(p);
  const newR = findBestReviewPool(p);
  if (isPollution(p, oldR.key)) { oldPol++; if (oldSamples.length < 10) oldSamples.push({ p, key: oldR.key, mode: oldR.mode }); }
  if (isPollution(p, newR.key)) { newPol++; if (newSamples.length < 10) newSamples.push({ p, key: newR.key, mode: newR.mode }); }
}

console.log('=== FULL_REVIEWS 풀 매칭 오염 ===\n');
console.log(`이전 로직: 오염 ${oldPol} / ${catList.length} (${(oldPol/catList.length*100).toFixed(2)}%)`);
console.log(`수정 후:   오염 ${newPol} / ${catList.length} (${(newPol/catList.length*100).toFixed(2)}%)`);

if (oldSamples.length > 0) {
  console.log('\n이전 오염 샘플:');
  for (const s of oldSamples) console.log(`  [${s.mode}] ${s.p}\n    → ${s.key}`);
}
if (newSamples.length > 0) {
  console.log('\n⚠️ 수정 후에도 남은 오염:');
  for (const s of newSamples) console.log(`  [${s.mode}] ${s.p}\n    → ${s.key}`);
}

// 시연 케이스
const cases = [
  '뷰티>스킨>크림>페이스 스크럽',
  '뷰티>스킨>필링>페이스 스크럽',
  '식품>신선식품>채소류>열매채소>고추',
  '식품>신선식품>쌀/잡곡류>쌀류>백미',
  '식품>신선식품>과일류>과일>블루베리',
  '식품>건강식품>비타민',
  '출산/유아동>분유/유아식품>일반분유>스틱분유',
];
console.log('\n=== 시연 ===');
for (const c of cases) {
  const oldR = findBestReviewPool_OLD(c);
  const newR = findBestReviewPool(c);
  const oldTag = isPollution(c, oldR.key) ? '⚠️' : '✓';
  const newTag = isPollution(c, newR.key) ? '⚠️' : '✓';
  console.log(`\n[${c}]`);
  console.log(`  이전: ${oldTag} ${oldR.key} (${oldR.mode})`);
  console.log(`  수정: ${newTag} ${newR.key} (${newR.mode})`);
}
