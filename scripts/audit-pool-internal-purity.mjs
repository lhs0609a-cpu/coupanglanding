#!/usr/bin/env node
// 풀 JSON 내부 오염 검사.
// 각 카테고리 풀에 담긴 키워드가 "다른 카테고리에만 속하는 고유어"인 경우 탐지.
// 예: "식품>가공식품>라면" 풀에 "블루베리"(과일 고유어)가 있으면 오염.

import { readFileSync } from 'fs';
import path from 'path';

const seoData = JSON.parse(readFileSync(path.join(process.cwd(), 'src/lib/megaload/data/seo-keyword-pools.json'), 'utf8'));
const POOLS = seoData.categoryPools;
const KEYS = Object.keys(POOLS);

// 각 풀별 keyword set
const poolWords = new Map();
for (const k of KEYS) {
  const p = POOLS[k];
  const all = new Set();
  for (const w of [...(p.generic || []), ...(p.ingredients || []), ...(p.features || [])]) {
    all.add(w.toLowerCase());
  }
  poolWords.set(k, all);
}

// 단어 → 그 단어가 포함된 풀 key들
const wordToPools = new Map();
for (const [key, words] of poolWords) {
  for (const w of words) {
    if (!wordToPools.has(w)) wordToPools.set(w, new Set());
    wordToPools.get(w).add(key);
  }
}

// 고유어 = 1개 풀에만 속한 단어
// 그 고유어가 다른 대분류 풀에 나오면 오염
let flagged = 0;
const flagsByPool = new Map();

for (const [ownerKey, words] of poolWords) {
  const ownerTop = ownerKey.split('>')[0].trim();
  for (const w of words) {
    const pools = wordToPools.get(w);
    if (!pools || pools.size === 1) continue; // 고유어가 아니거나 혼자만 있음
    // 서로 다른 대분류에 걸쳐 있으면 의심
    const tops = new Set([...pools].map(p => p.split('>')[0].trim()));
    if (tops.size > 1) {
      // 해당 단어가 ownerTop이 아닌 다른 대분류에도 있음 → cross-top leak
      const otherTops = [...tops].filter(t => t !== ownerTop);
      if (otherTops.length > 0) {
        flagged++;
        if (!flagsByPool.has(ownerKey)) flagsByPool.set(ownerKey, []);
        flagsByPool.get(ownerKey).push({ word: w, alsoIn: [...pools].filter(p => p !== ownerKey) });
      }
    }
  }
}

console.log('=== 풀 JSON 내부 오염 (cross-top 단어) ===\n');
console.log(`총 의심 항목: ${flagged}개 (풀별 중복 카운트)`);
console.log(`오염 풀 수: ${flagsByPool.size} / ${KEYS.length}\n`);

// 예상 공통어(범용 수식어) 제외 필터
const GENERIC_UNIVERSALS = new Set([
  '국내산', '유기농', '프리미엄', '신선', '냉동', '냉장', '무첨가', '대용량',
  '선물용', '가정용', '산지직송', '친환경', '유기', '천연', '100%', '고급',
  '특가', '베스트', '추천', '인기', 'new', 'hot',
]);

console.log('=== cross-top 오염 상세 (범용어 제외) ===\n');
let shownPools = 0;
for (const [pool, flags] of flagsByPool) {
  const real = flags.filter(f => !GENERIC_UNIVERSALS.has(f.word));
  if (real.length === 0) continue;
  console.log(`\n[${pool}]`);
  for (const f of real.slice(0, 10)) {
    console.log(`  "${f.word}"  → 다른 대분류 풀에도 존재: ${f.alsoIn.slice(0, 3).join(' | ')}${f.alsoIn.length > 3 ? ` 외 ${f.alsoIn.length - 3}개` : ''}`);
  }
  shownPools++;
  if (shownPools >= 30) { console.log('\n... (이하 생략, 30개 풀 표시)'); break; }
}

// 특정 건강식품 하위 풀들 간 교차 오염 체크
console.log('\n\n=== 건강식품 하위 풀들의 교차 단어 (동일 대분류 내 중복은 정상이나 엉뚱한 조합은 오염) ===\n');
const healthKeys = KEYS.filter(k => k.startsWith('식품>건강식품'));
for (const k of healthKeys) {
  const uniqueToThisPool = [...poolWords.get(k)].filter(w => {
    const pools = wordToPools.get(w);
    return pools.size === 1;
  });
  const sharedWithOthers = [...poolWords.get(k)].filter(w => wordToPools.get(w).size > 1);
  console.log(`[${k}]`);
  console.log(`  고유어 ${uniqueToThisPool.length}개: ${uniqueToThisPool.slice(0, 8).join(', ')}${uniqueToThisPool.length > 8 ? '...' : ''}`);
  console.log(`  공유어 ${sharedWithOthers.length}개 (다른 풀과): ${sharedWithOthers.slice(0, 5).join(', ')}`);
}
