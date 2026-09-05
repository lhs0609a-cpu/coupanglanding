/**
 * coupang-to-naver-map.json 생성 — 기존 naver-to-coupang-map.json 을 반전.
 *
 * 왜: 소싱용으로 만든 naver→coupang 맵(4,965 네이버 leaf)을 반전하면
 *     복제용 coupang→naver leaf 크로스워크를 네트워크·크레덴셜 없이 결정론적으로 얻는다.
 *
 * 다대일 주의: 여러 네이버 leaf 가 같은 쿠팡코드로 매핑됨 → 반전 시 1:다.
 *   쿠팡코드별로 (1)신뢰도 n 최고 → (2)매칭방식(exact>gpt>partial) → (3)네이버 경로 depth 깊은(구체적) 순으로 대표 1개 선택.
 *
 * 출력: src/lib/megaload/data/coupang-to-naver-map.json
 *   { generatedAt, source, stats, map: { [coupangCode]: { c: naverLeafId, n, nm: naverPath } } }
 *   (channel-category-resolver 의 PRECOMPUTED 크로스워크 형식과 동일)
 */
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'src', 'lib', 'megaload', 'data');
const nvToCp = JSON.parse(fs.readFileSync(path.join(DATA, 'naver-to-coupang-map.json'), 'utf8'));
const nvCats = JSON.parse(fs.readFileSync(path.join(DATA, 'naver-categories.json'), 'utf8'));

// 네이버 leaf id → {name, path, isLeaf}
const nvById = new Map();
for (const c of nvCats.all) nvById.set(String(c.id), c);

// 매칭방식 우선순위 (동일 신뢰도 tie-break): exact > gpt > partial/path > relaxed > best_effort
const methodRank = { e: 3, g: 2, p: 1, c: 1, r: 0, b: -1 };

/** @type {Map<string, {naverId:string,n:number,m:string,depth:number,nm:string|null}>} */
const best = new Map();
let skippedNonLeaf = 0;

for (const [naverId, v] of Object.entries(nvToCp.map || {})) {
  const cp = v && v.c;
  if (!cp) continue;
  const meta = nvById.get(String(naverId));
  // 반전 결과는 네이버 등록에 쓰이므로 leaf 만 채택(비-leaf id 는 등록 거부됨)
  if (meta && meta.isLeaf === false) { skippedNonLeaf++; continue; }
  const depth = meta && meta.path ? meta.path.split('>').length : 0;
  const cand = { naverId: String(naverId), n: Number(v.n) || 0, m: String(v.m || ''), depth, nm: (meta && meta.path) || null };
  const cur = best.get(cp);
  if (!cur) { best.set(cp, cand); continue; }
  const rc = methodRank[cand.m] || 0;
  const rcur = methodRank[cur.m] || 0;
  const better =
    cand.n !== cur.n ? cand.n > cur.n
      : rc !== rcur ? rc > rcur
        : cand.depth > cur.depth;
  if (better) best.set(cp, cand);
}

const outMap = {};
for (const [cp, cand] of best) {
  outMap[cp] = { c: cand.naverId, n: Number(cand.n.toFixed(4)), nm: cand.nm };
}

const out = {
  generatedAt: new Date().toISOString(),
  source: 'inverted from naver-to-coupang-map.json (naver→coupang)',
  stats: {
    fromNaverLeaves: Object.keys(nvToCp.map || {}).length,
    coupangCodesCovered: Object.keys(outMap).length,
    skippedNonLeaf,
  },
  map: outMap,
};

const outPath = path.join(DATA, 'coupang-to-naver-map.json');
fs.writeFileSync(outPath, JSON.stringify(out));
console.log(`coupang-to-naver-map.json written: ${Object.keys(outMap).length} coupang codes (from ${out.stats.fromNaverLeaves} naver leaves, skipped ${skippedNonLeaf} non-leaf)`);
