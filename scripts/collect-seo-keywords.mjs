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
for (const [cat, words] of Object.entries(seedsByCategory)) {
  for (const w of words) allSeeds.push({ category: cat, seed: w });
}
const seeds = LIMIT ? allSeeds.slice(0, LIMIT) : allSeeds;

console.log(
  `시드 ${allSeeds.length}개 (카테고리 ${Object.keys(seedsByCategory).length}개)` +
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

async function fetchKeywords(hints) {
  const ts = Date.now();
  const sig = crypto
    .createHmac('sha256', SECRET)
    .update(`${ts}.GET./keywordstool`)
    .digest('base64');
  const params = new URLSearchParams({ hintKeywords: hints.join(','), showDetail: '1' });
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
const startedAt = Date.now();

for (let i = 0; i < seeds.length; i += BATCH) {
  const batch = seeds.slice(i, i + BATCH);
  const hints = batch.map((b) => b.seed);
  const category = batch[0].category;

  let result;
  try {
    result = await fetchKeywords(hints);
  } catch (e) {
    result = { ok: false, status: 0, list: [], error: String(e) };
  }
  calls++;

  if (!result.ok) {
    failures++;
    // 429/5xx 는 잠시 쉬고 넘어간다. 한 배치 실패로 전체를 멈추지 않는다.
    if (failures <= 5 || failures % 20 === 0) {
      console.warn(`  배치 ${calls} 실패 (HTTP ${result.status}) — 누적 실패 ${failures}`);
    }
    await sleep(result.status === 429 ? 5000 : 1000);
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
console.log(`  API 호출 ${calls}회 (실패 ${failures}회) · ${((Date.now() - startedAt) / 1000 / 60).toFixed(1)}분`);
console.log(`  검색량 있는 고유 키워드: ${rows.length.toLocaleString()}개`);
console.log(`  검색량 분포:`, buckets);
console.log(`  저장: ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)}MB)`);
console.log('  상위 10개:');
for (const r of rows.slice(0, 10)) {
  console.log(`    ${r.keyword} — 월 ${r.total.toLocaleString()} (경쟁 ${r.comp})`);
}
