/**
 * 수집한 네이버 키워드 → SEO 문서용 데이터셋 생성
 *
 * 입력: collect-seo-keywords.mjs 가 떨군 수집본(여러 개 가능, --src 를 반복 지정)
 * 출력:
 *   public/data/kw-index.json                      목록·사이트맵용 인덱스
 *   src/lib/data/generated/seo-keyword-meta.json   개수·그룹 통계 (작아서 import 가능)
 *   public/data/kw/{0..63}.json                    문서 렌더용 상세 샤드
 *
 * ── 관련성 판정: 접미 매치만 인정한다 ──
 * 키워드도구는 연관검색어를 넓게 물어온다. 수집본 606,289개에는 "환율·로또·프로야구"처럼
 * 우리와 무관한 키워드가 절반 넘게 섞여 있다.
 *
 * 처음엔 상품어가 **포함**되면 통과시켰는데, 그러면 이런 게 뚫린다(실측):
 *   프리미어리그→'프리미어'  미국증시→'미국'  제주항공권→'제주'  삼성닷컴→'삼성'
 * 전부 앞부분·중간 매치다. 한국어 복합어는 뒤에 오는 말이 핵심이므로
 * **상품어가 키워드의 끝에 올 때만** 상품 키워드로 본다. 위 네 개가 한 번에 사라진다.
 *
 * ── 도서 카테고리명은 사전에서 뺀다 ──
 * '내과·외과·소설·역사' 같은 일반 명사가 도서 분류명으로 들어 있어, 상품어 사전에 두면
 * '정형외과'가 상품 키워드로 잡힌다. 도서는 어차피 외국도서를 색인에서 빼둔 영역이다.
 *
 * ── 신뢰도 ──
 *  high : 키워드가 상품어 자체거나, 매치된 상품어가 3글자 이상
 *  low  : 2글자 상품어가 접미로만 걸린 경우 (룰루레몬→레몬, 웹하드→하드)
 * 쿠팡 카테고리·수수료는 **high 일 때만** 표기한다. 틀린 수수료를 적느니 안 적는 게 낫다.
 *
 * 실행:
 *   node scripts/build-seo-keyword-dataset.mjs --src a.json --src b.json [--floor 100]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);

function argAll(name) {
  const out = [];
  for (let i = 0; i < args.length; i++) if (args[i] === name && args[i + 1]) out.push(args[i + 1]);
  return out;
}
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const SRCS = argAll('--src');
if (SRCS.length === 0) {
  console.error('--src <수집본.json> 을 하나 이상 지정하세요.');
  process.exit(1);
}
const FLOOR = Number(arg('--floor', '100'));

const INDEX_OUT = path.join(ROOT, 'public', 'data', 'kw-index.json');
const META_OUT = path.join(ROOT, 'src', 'lib', 'data', 'generated', 'seo-keyword-meta.json');
const SHARD_DIR = path.join(ROOT, 'public', 'data', 'kw');
const SHARD_COUNT = 64;

/** ⚠️ src/lib/data/seo-keywords.ts 의 shardOf 와 반드시 같아야 한다 */
function shardOf(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h) % SHARD_COUNT;
}

// ── 목록 그룹 ──
// URL(/coupang/keyword/list/{groupId}/{page})이 이미 색인돼 있으므로 순서를 바꾸지 않는다.
const GROUPS = [
  '패션의류', '패션잡화', '화장품/미용', '디지털/가전', '가구/인테리어',
  '출산/육아', '식품', '스포츠/레저', '생활/건강', '여가/생활편의', '기타',
];
/** 쿠팡 대분류 → 위 그룹 (URL 을 유지하려고 쿠팡 대분류를 그대로 쓰지 않는다) */
const TOP_TO_GROUP = {
  '패션의류잡화': '패션의류',
  '뷰티': '화장품/미용',
  '생활용품': '생활/건강',
  '식품': '식품',
  '가전/디지털': '디지털/가전',
  '가구/홈데코': '가구/인테리어',
  '출산/유아동': '출산/육아',
  '주방용품': '생활/건강',
  '완구/취미': '여가/생활편의',
  '문구/오피스': '여가/생활편의',
  '스포츠/레져': '스포츠/레저',
  '반려/애완용품': '기타',
  '자동차용품': '기타',
  '도서': '기타',
};

// ── 상품어 사전 ──
const seedSrc = fs.readFileSync(
  path.join(ROOT, 'src', 'lib', 'data', 'trend-seed-keywords.ts'),
  'utf8'
);
/** 사람이 고른 시드 → 그 시드가 속한 그룹 */
const seedGroup = new Map();
{
  const catRe = /^ {2}'([^']+)':\s*\[([\s\S]*?)^ {2}\],/gm;
  let m;
  while ((m = catRe.exec(seedSrc)) !== null) {
    const group = GROUPS.includes(m[1]) ? m[1] : '기타';
    for (const w of [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])) {
      const t = w.trim().replace(/\s+/g, '');
      if (t.length >= 2 && !seedGroup.has(t)) seedGroup.set(t, group);
    }
  }
}

const cats = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, 'src', 'lib', 'data', 'generated', 'coupang-cat-slim.json'),
    'utf8'
  )
);
/** 상품어 → 쿠팡 카테고리 (가장 얕은 것). 도서는 제외 */
const termToCat = new Map();
for (const c of cats) {
  if ((c[2] || '').startsWith('도서')) continue;
  const n = (c[1] || '').trim().replace(/\s+/g, '');
  if (n.length < 2 || !/^[가-힣0-9]+$/.test(n)) continue;
  const prev = termToCat.get(n);
  if (!prev || c[3] < prev[3]) termToCat.set(n, c);
}

/** 매칭 대상 상품어 — 긴 것부터 봐야 '경량패딩조끼'가 '조끼'보다 먼저 잡힌다 */
const TERMS = [...new Set([...seedGroup.keys(), ...termToCat.keys()])].sort(
  (a, b) => b.length - a.length
);

/**
 * 상거래와 무관한 신호. 접미 매치를 통과하더라도 이게 걸리면 버린다.
 * 실측으로 상위에 올라온 것들을 근거로 만들었다 — 감으로 넣지 않았다.
 */
const STOP =
  /환율|로또|운세|야구|축구|KBO|맞춤법|번역기|챗지피티|챗GPT|금시세|주가|주식|코인|비트|펀드|보험|연금|청약|부동산|아파트|전세|월세|대출|금리|이자|일정|순위|중계|경기|뜻|나무위키|위키|로그인|바로가기|다시보기|토렌트|맛집|날씨|채용|구인|이력서|자소서|면접|병원|약국|은행|민원|기출|인강|뉴스|속보|실시간|드라마|영화|웹툰|가사|지도|길찾기|버스|지하철|항공권|인사말|서비스센터|닷컴|증시|리그/i;

// ── 수집본 병합 ──
const merged = new Map();
for (const src of SRCS) {
  const rows = JSON.parse(fs.readFileSync(src, 'utf8'));
  for (const r of rows) {
    const k = r.keyword.toLowerCase();
    const prev = merged.get(k);
    if (!prev || r.total > prev.total) merged.set(k, r);
  }
  console.log(`  읽음: ${path.basename(src)} — ${rows.length.toLocaleString()}개`);
}
console.log(`병합 고유: ${merged.size.toLocaleString()}개 · 검색량 하한 ${FLOOR}`);

// ── 판정 ──
const kept = [];
let dropStop = 0;
let dropNoMatch = 0;
let lowConf = 0;
for (const r of merged.values()) {
  if (r.total < FLOOR) continue;
  if (STOP.test(r.keyword)) {
    dropStop++;
    continue;
  }
  let term = null;
  for (const t of TERMS) {
    if (r.keyword.endsWith(t)) {
      term = t;
      break;
    }
  }
  if (!term) {
    dropNoMatch++;
    continue;
  }

  const high = r.keyword === term || term.length >= 3;
  if (!high) lowConf++;

  const cat = high ? termToCat.get(term) || null : null;
  const group = cat
    ? TOP_TO_GROUP[cat[2].split('>')[0]] || '기타'
    : seedGroup.get(term) || TOP_TO_GROUP[(termToCat.get(term)?.[2] || '').split('>')[0]] || '기타';

  kept.push({
    k: r.keyword,
    pc: r.pc,
    mo: r.mo,
    t: r.total,
    c: r.comp,
    s: term,
    sc: GROUPS.includes(group) ? group : '기타',
    ci: cat ? cat[0] : null,
    cr: cat ? cat[4] : null,
  });
}
kept.sort((a, b) => b.t - a.t);

console.log(`  제외 — 비상거래 신호: ${dropStop.toLocaleString()} · 접미 매치 없음: ${dropNoMatch.toLocaleString()}`);
console.log(`상품 키워드로 판정: ${kept.length.toLocaleString()} (저신뢰 ${lowConf.toLocaleString()} — 카테고리·수수료 미표기)`);

// ── 출력 ──
const index = kept.map((r) => [r.k, r.t, r.s, r.sc, r.ci]);
fs.mkdirSync(path.dirname(INDEX_OUT), { recursive: true });
fs.writeFileSync(INDEX_OUT, JSON.stringify(index), 'utf8');

const groupCounts = {};
for (const r of kept) groupCounts[r.sc] = (groupCounts[r.sc] || 0) + 1;
fs.mkdirSync(path.dirname(META_OUT), { recursive: true });
fs.writeFileSync(
  META_OUT,
  JSON.stringify({
    count: kept.length,
    groups: groupCounts,
    generatedAt: new Date().toISOString().slice(0, 10),
  }),
  'utf8'
);

fs.rmSync(SHARD_DIR, { recursive: true, force: true });
fs.mkdirSync(SHARD_DIR, { recursive: true });
const shards = Array.from({ length: SHARD_COUNT }, () => ({}));
for (const r of kept) {
  shards[shardOf(r.k)][r.k] = {
    pc: r.pc, mo: r.mo, t: r.t, c: r.c, s: r.s, sc: r.sc, ci: r.ci, cr: r.cr,
  };
}
let totalBytes = 0;
let maxBytes = 0;
shards.forEach((obj, i) => {
  const f = path.join(SHARD_DIR, `${i}.json`);
  fs.writeFileSync(f, JSON.stringify(obj), 'utf8');
  const size = fs.statSync(f).size;
  totalBytes += size;
  maxBytes = Math.max(maxBytes, size);
});

console.log('');
console.log(`인덱스: ${path.relative(ROOT, INDEX_OUT)} (${(fs.statSync(INDEX_OUT).size / 1024 / 1024).toFixed(2)}MB)`);
console.log(`메타:   ${path.relative(ROOT, META_OUT)} (${fs.statSync(META_OUT).size}B)`);
console.log(`샤드:   ${SHARD_COUNT}개 · 합계 ${(totalBytes / 1024 / 1024).toFixed(2)}MB · 최대 ${(maxBytes / 1024).toFixed(0)}KB`);
console.log(`쿠팡 카테고리 직결(수수료 표기 가능): ${kept.filter((r) => r.ci).length.toLocaleString()}개`);
console.log('그룹별:', groupCounts);
