/**
 * coupang-to-gmarket-hint.json 생성 — ESM_BU_CAT_MATCHING.xlsx 로부터.
 *
 * ⚠️ 이 XLSX 에는 지마켓 카테고리 "경로(이름)"만 있고 등록용 9자리 catCode 는 없다.
 *    지마켓 catCode 는 ESM API(/item/v1/categories/site-cats, 크레덴셜 필요)로만 얻는다.
 *    → 지금 오프라인으로 만들 수 있는 건 coupang→지마켓 leaf "이름" 크로스워크(=검색 힌트).
 *    리졸버가 이 힌트로 ESM API 를 정확한 이름으로 조회 → 크레덴셜 생기면 코드 자동 확정.
 *    (크레덴셜 없으면 grounding 실패 → needs_input 안전 보류)
 *
 * XLSX 구조: A=ESM통합경로, B=사이트("A옥션"|"G마켓"), C=사이트 카테고리 경로.
 *   B=="G마켓" 행의 C 를 지마켓 leaf 경로로 사용.
 *
 * 매칭: 옥션(build-coupang-auction-map.cjs)과 동일한 도메인-가드 + 동의어 브릿지.
 *
 * 사용법: node scripts/build-coupang-gmarket-hint.cjs /tmp/esm_xlsx
 * 출력: src/lib/megaload/data/coupang-to-gmarket-hint.json
 *   { generatedAt, source, stats, map: { [coupangCode]: { q: gmarketLeafName, path, n } } }
 */
const fs = require('fs');
const path = require('path');

const XLSX_DIR = process.argv[2] || '/tmp/esm_xlsx';
const DATA = path.join(__dirname, '..', 'src', 'lib', 'megaload', 'data');
const CONF_FLOOR = 0.45;

function norm(s) { return (s || '').toLowerCase().replace(/[\s\/\-_,.()[\]]+/g, ''); }
function tokens(s) {
  return (s || '').toLowerCase().split(/[\s\/\-_,.()[\]>]+/).map((t) => t.trim()).filter((t) => t.length >= 2);
}
const DOMAIN_SYN = {
  '뷰티': ['화장품', '향수'], '식품': ['신선식품', '가공식품', '건강식품', '신선'],
  '가전': ['디지털', '전자제품', '컴퓨터'], '디지털': ['가전', '전자제품', '컴퓨터'],
  '생활용품': ['생활'], '주방용품': ['주방'], '스포츠': ['레저', '스포츠용품'],
  '반려': ['반려동물', '애완'], '애완용품': ['반려동물', '애완'],
  '출산': ['유아동', '유아', '출산/육아'], '유아동': ['유아', '출산', '아동'],
  '완구': ['장난감', '취미'], '가구': ['인테리어', '홈'],
  '자동차용품': ['자동차', '차량'], '패션의류잡화': ['의류', '잡화', '패션'],
};
function expandDomain(set) {
  const out = new Set(set);
  for (const t of set) { const syn = DOMAIN_SYN[t]; if (syn) for (const s of syn) out.add(s); }
  return out;
}

// ── XLSX 파싱 (sharedStrings + sheet1) ──
console.log('parsing XLSX dir:', XLSX_DIR);
const ss = fs.readFileSync(path.join(XLSX_DIR, 'xl/sharedStrings.xml'), 'utf8');
const strs = [];
{
  const re = /<si>([\s\S]*?)<\/si>/g; let m;
  while ((m = re.exec(ss))) {
    const t = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('');
    strs.push(t.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&'));
  }
}
const sheet = fs.readFileSync(path.join(XLSX_DIR, 'xl/worksheets/sheet1.xml'), 'utf8');

// 지마켓 leaf(경로) 유니크 수집
const gmSet = new Map(); // gmarketPath → {path, name, esm:Set}
const rowRe = /<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
let r;
while ((r = rowRe.exec(sheet)) !== null) {
  if (r[1] === '1') continue; // 헤더
  const cells = {};
  for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*t="(\w+)")?[^>]*>(?:<v>([\s\S]*?)<\/v>)?<\/c>/g)) {
    const col = c[1]; const t = c[2]; const v = c[3];
    cells[col] = t === 's' ? strs[+v] : v;
  }
  if (cells.B !== 'G마켓') continue;
  const gmPath = cells.C;
  if (!gmPath) continue;
  if (!gmSet.has(gmPath)) {
    const segs = gmPath.split('>').map((s) => s.trim()).filter(Boolean);
    const name = segs[segs.length - 1] || gmPath;
    const leafTokens = new Set(tokens(name));
    const pathTokens = new Set(tokens(gmPath));
    gmSet.set(gmPath, {
      path: gmPath, name, leafTokens, pathTokens,
      ancestorTokens: new Set([...pathTokens].filter((t) => !leafTokens.has(t))),
    });
  }
}
const gmLeaves = [...gmSet.values()];
console.log('gmarket leaves (unique):', gmLeaves.length);

// 역인덱스 + exact
const tokenIndex = new Map();
const exactLeaf = new Map();
gmLeaves.forEach((gl, i) => {
  for (const t of gl.leafTokens) { let a = tokenIndex.get(t); if (!a) { a = []; tokenIndex.set(t, a); } a.push(i); }
  const k = norm(gl.name); if (k) { const a = exactLeaf.get(k) || []; a.push(i); exactLeaf.set(k, a); }
});

function ancestorOverlap(cpAnc, gl) { let n = 0; for (const t of cpAnc) if (gl.ancestorTokens.has(t)) n++; return n; }
function score(cpLeafTok, cpPathTok, gl) {
  let li = 0; for (const t of cpLeafTok) if (gl.leafTokens.has(t)) li++;
  const lu = new Set([...cpLeafTok, ...gl.leafTokens]).size || 1;
  let pi = 0; for (const t of cpPathTok) if (gl.pathTokens.has(t)) pi++;
  return (li / lu) * 2 + pi / (cpPathTok.size || 1);
}

// ── 쿠팡 leaf 매칭 ──
const cpDetails = JSON.parse(fs.readFileSync(path.join(DATA, 'coupang-cat-details.json'), 'utf8'));
const outMap = {};
let exactHits = 0;
for (const code of Object.keys(cpDetails)) {
  const p = cpDetails[code] && cpDetails[code].p; if (!p) continue;
  const segs = p.split('>').map((s) => s.trim()).filter(Boolean);
  const cpLeaf = segs[segs.length - 1] || '';
  const cpLeafTok = new Set(tokens(cpLeaf));
  const cpPathTok = new Set(tokens(p));
  const cpAnc = expandDomain(new Set([...cpPathTok].filter((t) => !cpLeafTok.has(t))));

  const ex = exactLeaf.get(norm(cpLeaf));
  if (ex && ex.length) {
    let bi = -1, bs = 0;
    for (const i of ex) { const ov = ancestorOverlap(cpAnc, gmLeaves[i]); if (ov > bs) { bs = ov; bi = i; } }
    if (bi >= 0) {
      const gl = gmLeaves[bi];
      outMap[code] = { q: gl.name, path: gl.path, n: Number(Math.min(0.95, 0.82 + bs * 0.04).toFixed(4)) };
      exactHits++; continue;
    }
  }
  const cand = new Set();
  for (const t of cpLeafTok) { const a = tokenIndex.get(t); if (a) for (const i of a) cand.add(i); }
  if (cand.size === 0) continue;
  let best = null, bestS = 0;
  for (const i of cand) {
    const gl = gmLeaves[i];
    if (ancestorOverlap(cpAnc, gl) < 1) continue;
    const s = score(cpLeafTok, cpPathTok, gl);
    if (s > bestS) { bestS = s; best = gl; }
  }
  if (!best) continue;
  const conf = Math.min(0.88, bestS / 3);
  if (conf < CONF_FLOOR) continue;
  outMap[code] = { q: best.name, path: best.path, n: Number(conf.toFixed(4)) };
}

const out = {
  generatedAt: new Date().toISOString(),
  source: 'ESM_BU_CAT_MATCHING.xlsx (G마켓 rows) — 이름 힌트, 코드는 런타임 ESM API 로 확정',
  note: 'q=지마켓 leaf 이름(ESM API 검색어). 등록용 catCode 아님. 리졸버가 이 q 로 site-cats 조회.',
  stats: { gmarketLeaves: gmLeaves.length, coupangCovered: Object.keys(outMap).length, exactHits, confFloor: CONF_FLOOR },
  map: outMap,
};
fs.writeFileSync(path.join(DATA, 'coupang-to-gmarket-hint.json'), JSON.stringify(out));
console.log(`coupang-to-gmarket-hint.json: ${Object.keys(outMap).length} covered (exact ${exactHits})`);
