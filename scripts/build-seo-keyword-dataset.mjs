/**
 * 수집한 네이버 키워드 → SEO 문서용 데이터셋 생성
 *
 * 입력: collect-seo-keywords.mjs 가 떨군 원본 JSON (336,283개, 무관 키워드 포함)
 * 출력:
 *   src/lib/data/generated/seo-keyword-index.json   목록·사이트맵용 경량 인덱스
 *   public/data/kw/{0..63}.json                     문서 렌더용 상세 샤드
 *
 * ── 왜 거르는가 ──
 * 키워드도구는 연관검색어를 넓게 물어온다. 원본에는 "로또·프로야구·계산기·근처맛집"처럼
 * 우리 사업과 무관한 키워드가 17만 개 섞여 있다. 그대로 문서를 만들면 doorway page 다.
 * 사람이 고른 시드 상품어(3,155개)를 포함하는 키워드만 상품 키워드로 본다.
 *
 * ⚠️ 이 필터에도 오매칭이 약 10% 남는다(룰루레몬→레몬, 웹하드→하드).
 *    네이버 쇼핑 검색 API 가 살아나면 상품수로 한 번 더 걸러낼 수 있다.
 *    (현재 그 API 는 SE05 로 막혀 있다 — 개발자센터에서 "검색" API 등록 필요)
 *
 * 실행: node scripts/build-seo-keyword-dataset.mjs --src <수집본.json> [--floor 100]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const SRC = arg('--src', path.join(ROOT, 'seo-keywords.json'));
const FLOOR = Number(arg('--floor', '100'));
// 전체 인덱스는 public/data 로 뺀다. src/ 아래에 두고 import 하면 TypeScript 가
// 75,748개 원소의 리터럴 타입을 추론하려 들어 tsc 가 10분 넘게 걸린다(실측).
const INDEX_OUT = path.join(ROOT, 'public', 'data', 'kw-index.json');
/** 목록 그룹 수·전체 개수처럼 작은 값만 담는 파일 — 이건 import 해도 안전하다 */
const META_OUT = path.join(ROOT, 'src', 'lib', 'data', 'generated', 'seo-keyword-meta.json');
const SHARD_DIR = path.join(ROOT, 'public', 'data', 'kw');
const SHARD_COUNT = 64;

/** 키워드 → 샤드 번호. 런타임 로더와 반드시 같은 식이어야 한다 */
function shardOf(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h) % SHARD_COUNT;
}

// ── 시드 상품어 (긴 것부터 봐야 '경량패딩조끼' 가 '패딩' 보다 먼저 잡힌다) ──
const seedSrc = fs.readFileSync(
  path.join(ROOT, 'src', 'lib', 'data', 'trend-seed-keywords.ts'),
  'utf8'
);
const seedsByCategory = {};
{
  const catRe = /^ {2}'([^']+)':\s*\[([\s\S]*?)^ {2}\],/gm;
  let m;
  while ((m = catRe.exec(seedSrc)) !== null) {
    seedsByCategory[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  }
}
const seedToCategory = new Map();
for (const [cat, words] of Object.entries(seedsByCategory)) {
  for (const w of words) if (!seedToCategory.has(w)) seedToCategory.set(w, cat);
}
const seedList = [...seedToCategory.keys()].filter((s) => s.length >= 2).sort((a, b) => b.length - a.length);

// ── 쿠팡 카테고리: 시드/키워드를 카테고리에 연결하기 위한 이름 색인 ──
const cats = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src', 'lib', 'data', 'generated', 'coupang-cat-slim.json'), 'utf8')
);
/** 카테고리 표시명 → 가장 얕은(=대표성 높은) 카테고리 */
const catByName = new Map();
for (const c of cats) {
  const n = (c[1] || '').trim();
  if (n.length < 2) continue;
  const prev = catByName.get(n);
  if (!prev || c[3] < prev[3]) catByName.set(n, c);
}

// ── 필터링 ──
const rows = JSON.parse(fs.readFileSync(SRC, 'utf8'));
console.log(`원본 키워드: ${rows.length.toLocaleString()}개 · 검색량 하한 ${FLOOR}`);

/**
 * 오매칭 걸러내기 — 문자열 포함만으로는 '룰루레몬'이 시드 '레몬'에 붙는다.
 *
 * 우리에겐 네이버가 준 출처가 있다: 이 키워드를 어느 상품군 배치에서 물어왔는지.
 * '룰루레몬'은 패션의류 배치에서 나왔는데 시드 '레몬'은 식품이다 → 어긋나면 오매칭이다.
 * 반대로 '나이키운동화'는 패션잡화 배치에서 나왔고 시드 '운동화'도 패션잡화다 → 맞다.
 *
 * 쿠팡 카테고리(=수수료)를 붙이는 건 둘 다 만족할 때만 한다:
 *   1) 시드가 키워드의 **끝**에 온다 (한국어 복합어는 뒤가 핵심이다)
 *   2) 시드의 상품군 == 네이버가 이 키워드를 물어온 상품군
 * 틀린 수수료를 적느니 안 적는 쪽이 낫다.
 */
const kept = [];
let dropped = 0;
let linkSkipped = 0;
for (const r of rows) {
  if (r.total < FLOOR) continue;
  let seed = null;
  for (const s of seedList) {
    if (r.keyword.includes(s)) {
      seed = s;
      break;
    }
  }
  if (!seed) continue;

  // 네이버 출처 상품군 (수집 시 어느 배치에서 나왔는지)
  const provenance = (r.categories && r.categories[0]) || null;
  const seedCat = seedToCategory.get(seed) || '기타';
  const consistent = provenance ? provenance === seedCat : true;
  const headFinal = r.keyword.endsWith(seed);

  // 출처와 시드 상품군이 어긋나고 시드가 끝에도 없으면 관련성이 약하다 → 버린다
  if (!consistent && !headFinal) {
    dropped++;
    continue;
  }

  const canLink = headFinal && consistent;
  const cat = canLink ? catByName.get(seed) || null : null;
  if (headFinal && !consistent) linkSkipped++;

  kept.push({
    k: r.keyword,
    pc: r.pc,
    mo: r.mo,
    t: r.total,
    c: r.comp,
    s: seed,
    // 화면에 쓰는 상품군은 네이버 출처를 우선한다 — 그게 실제 관측값이다
    sc: provenance || seedCat,
    ci: cat ? cat[0] : null,
    cr: cat ? cat[4] : null,
  });
}
console.log(`  관련성 부족으로 제외: ${dropped.toLocaleString()}개`);
console.log(`  카테고리 연결 보류(출처 불일치): ${linkSkipped.toLocaleString()}개`);

kept.sort((a, b) => b.t - a.t);
console.log(`상품 키워드로 판정: ${kept.length.toLocaleString()}개`);

// ── 경량 인덱스: [키워드, 총검색량, 시드, 시드카테고리, 쿠팡카테고리id] ──
const index = kept.map((r) => [r.k, r.t, r.s, r.sc, r.ci]);
fs.mkdirSync(path.dirname(INDEX_OUT), { recursive: true });
fs.writeFileSync(INDEX_OUT, JSON.stringify(index), 'utf8');

// 메타 (작다 — 런타임에 파일을 안 열고도 개수를 알 수 있어야 robots/사이트맵이 싸진다)
const groupCounts = {};
for (const r of kept) groupCounts[r.sc] = (groupCounts[r.sc] || 0) + 1;
fs.mkdirSync(path.dirname(META_OUT), { recursive: true });
fs.writeFileSync(
  META_OUT,
  JSON.stringify({ count: kept.length, groups: groupCounts, generatedAt: new Date().toISOString().slice(0, 10) }),
  'utf8'
);

// ── 상세 샤드 ──
fs.rmSync(SHARD_DIR, { recursive: true, force: true });
fs.mkdirSync(SHARD_DIR, { recursive: true });
const shards = Array.from({ length: SHARD_COUNT }, () => ({}));
for (const r of kept) {
  shards[shardOf(r.k)][r.k] = { pc: r.pc, mo: r.mo, t: r.t, c: r.c, s: r.s, sc: r.sc, ci: r.ci, cr: r.cr };
}
let total = 0;
let max = 0;
shards.forEach((obj, i) => {
  const f = path.join(SHARD_DIR, `${i}.json`);
  fs.writeFileSync(f, JSON.stringify(obj), 'utf8');
  const size = fs.statSync(f).size;
  total += size;
  max = Math.max(max, size);
});

// ── 통계 ──
const byCat = {};
for (const r of kept) byCat[r.sc] = (byCat[r.sc] || 0) + 1;
const linkedToCoupang = kept.filter((r) => r.ci).length;

console.log('');
console.log(`인덱스: ${path.relative(ROOT, INDEX_OUT)} (${(fs.statSync(INDEX_OUT).size / 1024 / 1024).toFixed(2)}MB)`);
console.log(`메타:   ${path.relative(ROOT, META_OUT)} (${fs.statSync(META_OUT).size}B)`);
console.log(`샤드: ${SHARD_COUNT}개 · 합계 ${(total / 1024 / 1024).toFixed(2)}MB · 최대 ${(max / 1024).toFixed(0)}KB`);
console.log(`쿠팡 카테고리 직결(수수료 표기 가능): ${linkedToCoupang.toLocaleString()}개`);
console.log('시드 카테고리별:', byCat);
