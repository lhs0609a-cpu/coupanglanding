/**
 * coupang-to-auction-map.json 생성 — 옥션 무인증 카테고리 XML 로부터.
 *
 * 소스: https://script.auction.co.kr/category/categories.xml (약 4.9MB, 무인증)
 *   각 <CategoryDetailT ID Name IsLeaf> + 하위 L/M/S/DCategory(Name) 로 경로 복원.
 *   Level: L=대, M=중, S=소, D=세. 등록 대상은 IsLeaf="true".
 *
 * 매칭: 쿠팡 leaf(coupang-cat-details.json p=path) → 옥션 leaf 를 이름/경로 토큰 유사도로.
 *   성능: 옥션 leaf 를 토큰 역인덱스로 만들어 후보만 스코어(16k×수만 완전비교 회피).
 *   보수적 채택: 신뢰도 floor 미만은 버림 → grounded 리졸버가 폴백(무효코드 방지).
 *
 * 사용법: node scripts/build-coupang-auction-map.cjs /tmp/auction_cats.xml
 * 출력: src/lib/megaload/data/coupang-to-auction-map.json
 *   { generatedAt, source, stats, map: { [coupangCode]: { c: auctionLeafId, n, nm: auctionPath } } }
 */
const fs = require('fs');
const path = require('path');

const XML_PATH = process.argv[2] || '/tmp/auction_cats.xml';
const DATA = path.join(__dirname, '..', 'src', 'lib', 'megaload', 'data');
const CONF_FLOOR = 0.45; // 이 미만은 채택 안 함(grounded 폴백)

// 도메인(대분류) 동의어 — 쿠팡 L1 어휘 ≠ 옥션 L1 어휘. 조상 토큰 비교 시 확장해
// 같은 도메인인데 단어만 다른 경우(뷰티↔화장품)의 정답 손실을 막는다. 보수적으로만.
const DOMAIN_SYN = {
  '뷰티': ['화장품', '향수'],
  '식품': ['신선식품', '가공식품', '건강식품', '신선'],
  '가전': ['디지털', '전자제품', '컴퓨터'],
  '디지털': ['가전', '전자제품', '컴퓨터'],
  '생활용품': ['생활'],
  '주방용품': ['주방'],
  '스포츠': ['레저', '스포츠용품'],
  '반려': ['반려동물', '애완'],
  '애완용품': ['반려동물', '애완'],
  '출산': ['유아동', '유아', '출산/육아'],
  '유아동': ['유아', '출산', '아동'],
  '완구': ['장난감', '취미'],
  '가구': ['인테리어', '홈'],
  '자동차용품': ['자동차', '차량'],
  '패션의류잡화': ['의류', '잡화', '패션'],
};
function expandDomain(tokenSet) {
  const out = new Set(tokenSet);
  for (const t of tokenSet) {
    const syn = DOMAIN_SYN[t];
    if (syn) for (const s of syn) out.add(s);
  }
  return out;
}

// ── 정규화/토큰화 ──
function norm(s) {
  return (s || '').toLowerCase().replace(/[\s\/\-_,.()[\]]+/g, '');
}
function tokens(s) {
  return (s || '')
    .toLowerCase()
    .split(/[\s\/\-_,.()[\]>]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

// ── 옥션 XML 파싱 (IsLeaf=true 만, 경로 복원) ──
console.log('parsing auction XML:', XML_PATH);
const xml = fs.readFileSync(XML_PATH, 'utf8');
const auctionLeaves = []; // {id, name, path, leafTokens:Set, pathTokens:Set}
const blockRe = /<CategoryDetailT\b([^>]*)>([\s\S]*?)<\/CategoryDetailT>/g;
const attr = (s, k) => {
  const m = s.match(new RegExp(`d2p1:${k}="([^"]*)"`));
  return m ? m[1] : '';
};
let m;
while ((m = blockRe.exec(xml)) !== null) {
  const head = m[1];
  const body = m[2];
  if (attr(head, 'IsLeaf') !== 'true') continue;
  const id = attr(head, 'ID');
  if (!id) continue;
  // 경로 복원: L>M>S>D 순서로 Name 수집
  const names = [];
  for (const lvl of ['LCategory', 'MCategory', 'SCategory', 'DCategory']) {
    const sub = body.match(new RegExp(`<d2p1:${lvl}\\b([^>]*?)/>`));
    if (sub) {
      const nm = attr(sub[1], 'Name');
      if (nm) names.push(nm);
    }
  }
  const leafName = attr(head, 'Name') || names[names.length - 1] || '';
  const fullPath = names.join('>') || leafName;
  const leafTokens = new Set(tokens(leafName));
  const pathTokens = new Set(tokens(fullPath));
  // 조상(상위) 토큰 = 경로 토큰 − leaf 토큰. 도메인 일치 판정용(leaf명만 같은 오매칭 차단).
  const ancestorTokens = new Set([...pathTokens].filter((t) => !leafTokens.has(t)));
  auctionLeaves.push({ id, name: leafName, path: fullPath, leafTokens, pathTokens, ancestorTokens });
}
console.log('auction leaves:', auctionLeaves.length);

// ── 역인덱스: leaf 토큰 → 옥션 leaf 인덱스들 + leaf명 exact 맵 ──
const tokenIndex = new Map();
const exactLeaf = new Map(); // norm(leafName) → [idx]
auctionLeaves.forEach((al, i) => {
  for (const t of al.leafTokens) {
    let arr = tokenIndex.get(t);
    if (!arr) { arr = []; tokenIndex.set(t, arr); }
    arr.push(i);
  }
  const k = norm(al.name);
  if (k) {
    const arr = exactLeaf.get(k) || [];
    arr.push(i);
    exactLeaf.set(k, arr);
  }
});

// ── 쿠팡 leaf 매칭 ──
const cpDetails = JSON.parse(fs.readFileSync(path.join(DATA, 'coupang-cat-details.json'), 'utf8'));
const cpCodes = Object.keys(cpDetails);
const outMap = {};
let exactHits = 0;

let ancestorGatedOut = 0;

function ancestorOverlap(cpAncestor, al) {
  let n = 0;
  for (const t of cpAncestor) if (al.ancestorTokens.has(t)) n++;
  return n;
}
function scoreAuction(cpLeafTokens, cpPathTokens, al) {
  // leaf 토큰 Jaccard(가중 2) + 경로 토큰 overlap(가중 1)
  let leafInter = 0;
  for (const t of cpLeafTokens) if (al.leafTokens.has(t)) leafInter++;
  const leafUnion = new Set([...cpLeafTokens, ...al.leafTokens]).size || 1;
  const leafJ = leafInter / leafUnion;
  let pathInter = 0;
  for (const t of cpPathTokens) if (al.pathTokens.has(t)) pathInter++;
  const pathScore = pathInter / (cpPathTokens.size || 1);
  return leafJ * 2 + pathScore;
}

for (const code of cpCodes) {
  const p = cpDetails[code] && cpDetails[code].p;
  if (!p) continue;
  const segs = p.split('>').map((s) => s.trim()).filter(Boolean);
  const cpLeaf = segs[segs.length - 1] || '';
  const cpLeafTokens = new Set(tokens(cpLeaf));
  const cpPathTokens = new Set(tokens(p));
  const cpAncestor = expandDomain(new Set([...cpPathTokens].filter((t) => !cpLeafTokens.has(t))));

  // 1) leaf명 exact — 단, 조상(도메인) 토큰이 최소 1개 겹쳐야 채택.
  //    "티셔츠"만 같고 도메인(여성의류 vs 반려/베이비)이 다른 오매칭 차단.
  const exactIdxs = exactLeaf.get(norm(cpLeaf));
  if (exactIdxs && exactIdxs.length) {
    let bi = -1, bs = 0;
    for (const i of exactIdxs) {
      const ov = ancestorOverlap(cpAncestor, auctionLeaves[i]);
      if (ov > bs) { bs = ov; bi = i; }
    }
    if (bi >= 0) {
      const al = auctionLeaves[bi];
      // 도메인 일치 강도(조상 overlap)에 따라 0.85~0.95
      outMap[code] = { c: al.id, n: Number(Math.min(0.95, 0.82 + bs * 0.04).toFixed(4)), nm: al.path };
      exactHits++;
      continue;
    }
    // 조상 겹침 0 → exact 거부, 스코어 매칭으로 폴백(대개 grounded 로 떨어짐)
  }

  // 2) 토큰 역인덱스로 후보 수집 후 스코어 — 조상 overlap>=1 필수(도메인 가드)
  const candIdx = new Set();
  for (const t of cpLeafTokens) {
    const arr = tokenIndex.get(t);
    if (arr) for (const i of arr) candIdx.add(i);
  }
  if (candIdx.size === 0) continue;
  let best = null, bestScore = 0, gated = false;
  for (const i of candIdx) {
    const al = auctionLeaves[i];
    if (ancestorOverlap(cpAncestor, al) < 1) { gated = true; continue; } // 도메인 불일치 배제
    const s = scoreAuction(cpLeafTokens, cpPathTokens, al);
    if (s > bestScore) { bestScore = s; best = al; }
  }
  if (!best) { if (gated) ancestorGatedOut++; continue; }
  const conf = Math.min(0.88, bestScore / 3);
  if (conf < CONF_FLOOR) continue;
  outMap[code] = { c: best.id, n: Number(conf.toFixed(4)), nm: best.path };
}

const out = {
  generatedAt: new Date().toISOString(),
  source: 'https://script.auction.co.kr/category/categories.xml (name/path similarity match)',
  stats: {
    auctionLeaves: auctionLeaves.length,
    coupangCodes: cpCodes.length,
    coupangCodesCovered: Object.keys(outMap).length,
    exactLeafHits: exactHits,
    confFloor: CONF_FLOOR,
  },
  map: outMap,
};
fs.writeFileSync(path.join(DATA, 'coupang-to-auction-map.json'), JSON.stringify(out));
console.log(`coupang-to-auction-map.json: ${Object.keys(outMap).length}/${cpCodes.length} covered (exact ${exactHits})`);
