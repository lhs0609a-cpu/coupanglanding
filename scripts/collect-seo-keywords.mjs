/**
 * 네이버 검색광고 키워드도구 대량 수집 (SEO 문서용)
 *
 * ── 앱의 collectTrendKeywords 와 다른 점 ──
 * 앱 파이프라인은 카테고리당 상위 100개만 남기고 trending_keywords 테이블에 upsert 한다.
 * 그건 화면에 띄울 트렌드용이다. 여기서는
 *   · 상위 컷을 두지 않는다 (문서를 만들 후보는 많을수록 좋다)
 *   · DB 에 쓰지 않는다 (앱 기능 데이터를 건드리지 않는다)
 *   · 결과를 파일로 떨궈, 실제로 몇 개가 나오는지 먼저 재본다
 *
 * 실행: node scripts/collect-seo-keywords.mjs [--limit N] [--out 경로]
 *   --limit  시드 개수 제한 (시험 실행용)
 *   --out    결과 JSON 경로 (기본: scratchpad 아래)
 *
 * ⚠️ 외부 API 를 수백 회 호출한다. 시드 3,310개 기준 약 660회, 10분 안팎.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const LIMIT = Number(arg('--limit', '0')) || 0;
const OUT = arg('--out', path.join(ROOT, 'seo-keywords.json'));
/**
 * 시드를 파일에서 읽는다 (한 줄에 하나, '#' 주석 허용).
 * 없으면 trend-seed-keywords.ts 의 상품 시드를 쓴다.
 * 상품 키워드 말고 다른 주제(부업·세금 등)의 수요를 잴 때 쓴다.
 */
const SEED_FILE = arg('--seed-file', '');

// ── .env.local 로드 (dotenv 규칙: 큰따옴표 벗기고 escape 확장) ──
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) {
    v = v.slice(1, -1);
    v = v.split(String.fromCharCode(92) + 'n').join('\n');
  }
  env[m[1]] = v.trim();
}

const ACCESS = env.NAVER_AD_ACCESS_KEY;
const SECRET = env.NAVER_AD_SECRET_KEY;
const CUSTOMER = env.NAVER_AD_CUSTOMER_ID;
if (!ACCESS || !SECRET || !CUSTOMER) {
  console.error('네이버 광고 API 키가 .env.local 에 없습니다.');
  process.exit(1);
}

// ── 시드 키워드 추출 ──
const seedSrc = fs.readFileSync(
  path.join(ROOT, 'src', 'lib', 'data', 'trend-seed-keywords.ts'),
  'utf8'
);
const seedsByCategory = {};
{
  const catRe = /^ {2}'([^']+)':\s*\[([\s\S]*?)^ {2}\],/gm;
  let m;
  while ((m = catRe.exec(seedSrc)) !== null) {
    const words = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    seedsByCategory[m[1]] = words;
  }
}

const allSeeds = [];
if (SEED_FILE) {
  // 파일의 시드는 카테고리 구분이 없다 — 한 덩어리로 본다
  const lines = fs
    .readFileSync(SEED_FILE, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  for (const w of lines) allSeeds.push({ category: '사용자지정', seed: w });
} else {
  for (const [cat, words] of Object.entries(seedsByCategory)) {
    for (const w of words) allSeeds.push({ category: cat, seed: w });
  }
}
const seeds = LIMIT ? allSeeds.slice(0, LIMIT) : allSeeds;

console.log(
  SEED_FILE
    ? `시드 ${allSeeds.length}개 (${path.relative(ROOT, SEED_FILE)})`
    : `시드 ${allSeeds.length}개 (카테고리 ${Object.keys(seedsByCategory).length}개)` +
        (LIMIT ? ` → 이번 실행 ${seeds.length}개로 제한` : '')
);

// ── API ──
function parseCount(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (value.includes('< 10') || value.includes('<10')) return 5;
    const n = parseInt(value.replace(/,/g, ''), 10);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

/**
 * 힌트 키워드 정제 — 네이버 키워드도구는 **공백이 든 힌트를 400 으로 거부한다.**
 *
 * 처음엔 상품 시드(공백 없음)만 돌려서 드러나지 않았다. 쿠팡 카테고리명을 시드로 쓰자
 * 1,564개에 공백이 있었고, 배치가 5개 묶음이라 하나만 걸려도 배치 전체가 버려졌다.
 * 실측 결과 1,442회 중 622회(43%)가 실패했다 — 시드의 43%가 그냥 날아갔다.
 */
function sanitizeHint(s) {
  return s.replace(/\s+/g, '');
}

async function fetchKeywords(hints) {
  const ts = Date.now();
  const sig = crypto
    .createHmac('sha256', SECRET)
    .update(`${ts}.GET./keywordstool`)
    .digest('base64');
  const params = new URLSearchParams({
    hintKeywords: hints.map(sanitizeHint).filter(Boolean).join(','),
    showDetail: '1',
  });
  const res = await fetch(`https://api.searchad.naver.com/keywordstool?${params}`, {
    headers: {
      'X-API-KEY': ACCESS,
      'X-CUSTOMER': CUSTOMER,
      'X-Timestamp': String(ts),
      'X-Signature': sig,
    },
  });
  if (!res.ok) {
    return { ok: false, status: res.status, list: [] };
  }
  const data = await res.json();
  return { ok: true, status: 200, list: data.keywordList || [] };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 수집 ──
/** keyword -> { keyword, pc, mo, total, comp, categories:Set } */
const collected = new Map();
const BATCH = 5;
let calls = 0;
let failures = 0;
let recovered = 0;
let lostSeeds = 0;
const startedAt = Date.now();

/** 응답의 키워드를 수집 맵에 넣는다 */
function absorb(list, category) {
  for (const item of list) {
    const kw = String(item.relKeyword || '').trim();
    if (!kw) continue;
    const pc = parseCount(item.monthlyPcQcCnt);
    const mo = parseCount(item.monthlyMobileQcCnt);
    const total = pc + mo;
    if (total <= 0) continue; // 검색량 0 은 문서를 만들 이유가 없다

    const key = kw.toLowerCase();
    const prev = collected.get(key);
    if (prev) {
      prev.categories.add(category);
      if (total > prev.total) {
        prev.pc = pc;
        prev.mo = mo;
        prev.total = total;
        prev.comp = item.compIdx || prev.comp;
      }
    } else {
      collected.set(key, {
        keyword: kw,
        pc,
        mo,
        total,
        comp: item.compIdx || '낮음',
        categories: new Set([category]),
      });
    }
  }
}

async function callOnce(hints) {
  try {
    return await fetchKeywords(hints);
  } catch (e) {
    return { ok: false, status: 0, list: [], error: String(e) };
  }
}

for (let i = 0; i < seeds.length; i += BATCH) {
  const batch = seeds.slice(i, i + BATCH);
  const hints = batch.map((b) => b.seed);
  const category = batch[0].category;

  const result = await callOnce(hints);
  calls++;

  if (!result.ok) {
    failures++;
    if (failures <= 5 || failures % 50 === 0) {
      console.warn(`  배치 ${calls} 실패 (HTTP ${result.status}) — 누적 ${failures}, 개별 재시도로 회수 중`);
    }
    // 429 는 서버가 밀린 것이니 쉬었다가, 그 외에는 바로 시드별로 쪼개 재시도한다.
    // 배치 하나가 통째로 버려지면 멀쩡한 시드 4개까지 같이 날아간다 — 실제로 43%를 잃었다.
    await sleep(result.status === 429 ? 5000 : 300);
    for (const b of batch) {
      const one = await callOnce([b.seed]);
      calls++;
      if (one.ok) {
        recovered++;
        absorb(one.list, b.category);
      } else {
        lostSeeds++;
      }
      await sleep(250);
    }
    continue;
  }

  for (const item of result.list) {
    const kw = String(item.relKeyword || '').trim();
    if (!kw) continue;
    const pc = parseCount(item.monthlyPcQcCnt);
    const mo = parseCount(item.monthlyMobileQcCnt);
    const total = pc + mo;
    if (total <= 0) continue; // 검색량 0 은 문서를 만들 이유가 없다

    const key = kw.toLowerCase();
    const prev = collected.get(key);
    if (prev) {
      prev.categories.add(category);
      if (total > prev.total) {
        prev.pc = pc;
        prev.mo = mo;
        prev.total = total;
        prev.comp = item.compIdx || prev.comp;
      }
    } else {
      collected.set(key, {
        keyword: kw,
        pc,
        mo,
        total,
        comp: item.compIdx || '낮음',
        categories: new Set([category]),
      });
    }
  }

  if (calls % 25 === 0) {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
    const pct = (((i + BATCH) / seeds.length) * 100).toFixed(1);
    console.log(
      `  ${calls}회 호출 · 시드 ${Math.min(i + BATCH, seeds.length)}/${seeds.length} (${pct}%) · ` +
        `고유 키워드 ${collected.size.toLocaleString()}개 · ${elapsed}초`
    );
  }

  if (i + BATCH < seeds.length) await sleep(500);
}

// ── 저장 ──
const rows = [...collected.values()]
  .map((r) => ({
    keyword: r.keyword,
    pc: r.pc,
    mo: r.mo,
    total: r.total,
    comp: r.comp,
    categories: [...r.categories],
  }))
  .sort((a, b) => b.total - a.total);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(rows), 'utf8');

const buckets = { '10만+': 0, '1만~10만': 0, '1천~1만': 0, '100~1천': 0, '100미만': 0 };
for (const r of rows) {
  if (r.total >= 100000) buckets['10만+']++;
  else if (r.total >= 10000) buckets['1만~10만']++;
  else if (r.total >= 1000) buckets['1천~1만']++;
  else if (r.total >= 100) buckets['100~1천']++;
  else buckets['100미만']++;
}

console.log('');
console.log('── 수집 완료 ──');
console.log(
  `  API 호출 ${calls}회 (배치 실패 ${failures}회 → 개별 회수 ${recovered}개, 최종 손실 ${lostSeeds}개) · ` +
    `${((Date.now() - startedAt) / 1000 / 60).toFixed(1)}분`
);
console.log(`  검색량 있는 고유 키워드: ${rows.length.toLocaleString()}개`);
console.log(`  검색량 분포:`, buckets);
console.log(`  저장: ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)}MB)`);
console.log('  상위 10개:');
for (const r of rows.slice(0, 10)) {
  console.log(`    ${r.keyword} — 월 ${r.total.toLocaleString()} (경쟁 ${r.comp})`);
}
