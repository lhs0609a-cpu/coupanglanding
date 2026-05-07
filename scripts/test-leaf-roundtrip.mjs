// Leaf 이름 라운드트립 테스트 — 실제 카테고리 정확도 측정.
//
// 16,259개 카테고리 leaf 이름 자체를 input 으로 매칭 → 자기 자신으로 돌아오는지 확인.
// 만약 "다시마" leaf 가 코드 X 인데 input "다시마" → 코드 Y 반환되면 매칭 실패.
//
// 한계: 매처의 모든 로직(SYNONYM/cleanProductName/NOISE_PATTERNS 등) 을 그대로
// 재현하지 못함. 단순화된 Tier 0 vote 로 baseline 정확도만 측정.
// 실제 매처는 이보다 더 정교한 휴리스틱이 있어 정확도 ↑ 가능.
//
// 실행: node scripts/test-leaf-roundtrip.mjs

import { readFileSync } from 'node:fs';

const indexPath = 'src/lib/megaload/data/coupang-cat-index.json';
const detailsPath = 'src/lib/megaload/data/coupang-cat-details.json';

const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
const details = JSON.parse(readFileSync(detailsPath, 'utf-8'));

console.log(`총 카테고리 leaf: ${index.length}`);

// ─── 단순 토큰화 (실제 매처 비슷하게) ─────────────────────
const NOISE_WORDS = new Set(['용','과','와','등','및','외','각','별','종','류','등급','용도','전용','일체','복합','다용도','만능']);

function tokenize(name) {
  return name.toLowerCase()
    .replace(/[\/]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !NOISE_WORDS.has(t));
}

// ─── 토큰 → 카테고리 코드 인덱스 구축 ─────────────────────
const tokenToCategoryMap = new Map(); // token → Map<code, leafScore>

for (const entry of index) {
  const [code, catTokensStr, leafName, depth] = entry;
  const leafLower = leafName.toLowerCase();
  const leafTokens = tokenize(leafName);
  const allCatTokens = catTokensStr.split(' ').filter(t => t.length >= 2);

  // 카테고리의 모든 토큰을 인덱스에 등록
  for (const t of [...leafTokens, ...allCatTokens]) {
    if (!tokenToCategoryMap.has(t)) tokenToCategoryMap.set(t, new Map());
    const m = tokenToCategoryMap.get(t);
    // leaf 토큰은 가중치 ↑, path 토큰은 가중치 ↓
    const isLeafToken = leafTokens.includes(t);
    const weight = isLeafToken ? 10 : 1;
    m.set(code, (m.get(code) || 0) + weight);
  }
}

// ─── 매칭: 입력 토큰 → 가장 많은 vote 받은 코드 ──────────
function matchCategory(productName) {
  const tokens = tokenize(productName);
  if (tokens.length === 0) return null;

  const voteMap = new Map(); // code → score
  for (const t of tokens) {
    const candidates = tokenToCategoryMap.get(t);
    if (!candidates) continue;
    for (const [code, weight] of candidates) {
      voteMap.set(code, (voteMap.get(code) || 0) + weight);
    }
  }

  if (voteMap.size === 0) return null;

  // 가장 높은 점수의 코드 반환
  let bestCode = null;
  let bestScore = -1;
  for (const [code, score] of voteMap) {
    if (score > bestScore) {
      bestScore = score;
      bestCode = code;
    }
  }
  return { code: bestCode, score: bestScore };
}

// ─── 테스트 1: leaf 이름 라운드트립 ─────────────────────
console.log('\n=== 테스트 1: leaf 이름 → 자기 자신 매칭 ===');

let exactMatch = 0;
let l1Match = 0;
let l1Wrong = 0;
let nullMatch = 0;
const l1Confusions = new Map(); // "expectedL1 → actualL1" → count

for (const entry of index) {
  const [expectedCode, , leafName] = entry;
  const result = matchCategory(leafName);
  if (!result) {
    nullMatch++;
    continue;
  }
  if (result.code === expectedCode) {
    exactMatch++;
    l1Match++;
    continue;
  }
  // L1 비교
  const expectedDetail = details[expectedCode];
  const actualDetail = details[result.code];
  const expL1 = (expectedDetail?.p || '').split('>')[0];
  const actL1 = (actualDetail?.p || '').split('>')[0];
  if (expL1 && actL1 && expL1 === actL1) {
    l1Match++;
  } else {
    l1Wrong++;
    const key = `${expL1 || '?'} → ${actL1 || '?'}`;
    l1Confusions.set(key, (l1Confusions.get(key) || 0) + 1);
  }
}

const total = index.length;
console.log(`정확 매칭 (코드 일치):     ${exactMatch} / ${total} (${(exactMatch / total * 100).toFixed(1)}%)`);
console.log(`L1 동일 (식품→식품 등):    ${l1Match} / ${total} (${(l1Match / total * 100).toFixed(1)}%)`);
console.log(`L1 다름 (식품→뷰티 등):    ${l1Wrong} / ${total} (${(l1Wrong / total * 100).toFixed(1)}%)`);
console.log(`매칭 실패 (null):          ${nullMatch} / ${total} (${(nullMatch / total * 100).toFixed(1)}%)`);

console.log('\n=== Top 20 L1 혼동 패턴 ===');
const sortedConfusions = [...l1Confusions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [key, count] of sortedConfusions) {
  console.log(`  ${count.toString().padStart(5)}건: ${key}`);
}

// ─── 테스트 2: 흔한 상품명 매칭 (현실 케이스) ─────────────
console.log('\n=== 테스트 2: 흔한 상품명 매칭 ===');
const realCases = [
  { name: '다시마', expectedL1: '식품' },
  { name: '미역', expectedL1: '식품' },
  { name: '망고', expectedL1: '식품' },
  { name: '한우 등심', expectedL1: '식품' },
  { name: '강아지 사료', expectedL1: '반려' },
  { name: '안티에이징 크림', expectedL1: '뷰티' },
  { name: '청바지', expectedL1: '패션' },
  { name: '노트북', expectedL1: '가전' },
  { name: '소파', expectedL1: '가구' },
  { name: '비타민C', expectedL1: '식품' }, // 또는 건강식품
  { name: '치약', expectedL1: '생활용품' },
  { name: '프라이팬', expectedL1: '주방' },
  { name: '런닝머신', expectedL1: '스포츠' },
  { name: '타이어', expectedL1: '자동차' },
  { name: '볼펜', expectedL1: '문구' },
  { name: '레고', expectedL1: '완구' },
  { name: '소설책', expectedL1: '도서' },
  { name: '기저귀', expectedL1: '출산' },
];

for (const tc of realCases) {
  const result = matchCategory(tc.name);
  if (!result) {
    console.log(`  ${tc.name.padEnd(20)} → null (매칭 실패)`);
    continue;
  }
  const detail = details[result.code];
  const path = detail?.p || '?';
  const actL1 = path.split('>')[0];
  const ok = actL1.includes(tc.expectedL1) || tc.expectedL1.includes(actL1);
  const flag = ok ? '✓' : '✗';
  console.log(`  ${flag} ${tc.name.padEnd(20)} → ${result.code} ${path}`);
}
