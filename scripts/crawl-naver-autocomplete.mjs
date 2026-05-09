/**
 * crawl-naver-autocomplete.mjs
 *
 * 16,259 쿠팡 leaf 카테고리 → 네이버 자동완성 API로 실검색 키워드 수집.
 *
 * 쿠팡 자동완성은 Akamai로 차단됨. 네이버는 한국 검색 60%+ 점유 →
 * 쿠팡 SEO와 트렌드 거의 일치 (소비자가 네이버에서 미리 검색해보고 쿠팡 구매).
 *
 * 출력: src/lib/megaload/data/naver-autocomplete.json
 *   {
 *     "<카테고리경로>": {
 *       "leaf": "비타민",
 *       "suggestions": ["비타민", "비타민프로그램", "비타민젤리", ...],
 *       "ts": 1234567890
 *     }
 *   }
 *
 * 특징:
 *   - Resume: 기존 결과 보존
 *   - Rate limit: 5 req/s (concurrency 3, jitter 200~400ms)
 *   - Auto-save: 500건마다 저장
 *   - 비용: 0원 (네이버 자동완성은 비공식이지만 무료/무인증)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'src', 'lib', 'megaload', 'data');
const COUPANG_DETAILS_PATH = join(DATA_DIR, 'coupang-cat-details.json');
const OUTPUT_PATH = join(DATA_DIR, 'naver-autocomplete.json');

const CONCURRENCY = parseInt(process.env.AC_CONCURRENCY || '3', 10);
const SAVE_EVERY = 500;
const MIN_DELAY_MS = 200;
const MAX_DELAY_MS = 400;

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
];

function jitter() {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function pickUA() {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

/**
 * leaf "비타민/미네랄" → "비타민" (첫 분할 토큰).
 * "굴착,성토,정지용" → "굴착". 순수 숫자 제외.
 */
function leafToQuery(leaf) {
  const splits = leaf
    .split(/[\/·\(\)\[\],+&\-_'']+/)
    .map(s => s.trim())
    .filter(s => s.length >= 1 && !/^\d+$/.test(s));
  return splits[0] || leaf;
}

/**
 * L1 대분류별 query 컨텍스트 suffix.
 * 동음이의어 잡기: 도서 카테고리의 "와인" leaf → "와인 책"으로 검색해야 도서 의도.
 * 식품/가전/패션처럼 leaf 자체로 specific한 분류는 suffix 없음 (빈 문자열).
 */
const L1_CONTEXT_SUFFIX = {
  '도서': ' 책',
  '도서/음반/DVD': ' 책',
  '완구/취미': '',
  '반려/애완용품': '',
  '문구/오피스': '',
  '자동차용품': ' 자동차',
  '스포츠/레져': '',
  '가전/디지털': '',
  '식품': '',
  '뷰티': '',
  '패션의류잡화': '',
  '출산/유아동': '',
  '주방용품': '',
  '가구/홈데코': '',
  '생활용품': '',
};

/**
 * leaf가 충분히 specific하면 suffix 안 붙임 (예: "에어프라이어", "마그네슘영양제").
 * leaf가 짧고 동음이의 위험 있으면 L1 컨텍스트 suffix 추가.
 */
function buildSearchQuery(leaf, l1) {
  const baseQuery = leafToQuery(leaf);
  const suffix = L1_CONTEXT_SUFFIX[l1] ?? '';
  if (!suffix) return baseQuery;
  // leaf가 이미 L1 키워드 포함하면 suffix 생략 (중복 방지)
  if (baseQuery.includes(suffix.trim())) return baseQuery;
  // leaf가 4자 이상이면 충분히 specific — suffix 생략
  if (baseQuery.length >= 4) return baseQuery;
  return `${baseQuery}${suffix}`;
}

async function fetchAutocomplete(query, retries = 3) {
  const url = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(query)}&st=100&r_format=json&r_enc=UTF-8&q_enc=UTF-8&r_lt=100`;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': pickUA(),
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
          Referer: 'https://www.naver.com/',
        },
      });
      if (res.status === 429 || res.status === 503) {
        await sleep(2000 + Math.pow(2, i) * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // schema: { query: ["비타민"], items: [[ ["비타민"], ["비타민프로그램"], ... ]] }
      const items = data.items?.[0] || [];
      const suggestions = items
        .map(arr => Array.isArray(arr) ? arr[0] : null)
        .filter(s => typeof s === 'string' && s.trim().length >= 1);
      return suggestions;
    } catch (err) {
      if (i === retries - 1) return { error: String(err.message || err) };
      await sleep(1000 + i * 500);
    }
  }
  return { error: 'max_retries' };
}

async function main() {
  const coupangDetails = JSON.parse(readFileSync(COUPANG_DETAILS_PATH, 'utf8'));

  const allCats = [];
  for (const [code, v] of Object.entries(coupangDetails)) {
    if (v && v.p && typeof v.p === 'string') {
      const segs = v.p.split('>');
      const leaf = segs[segs.length - 1];
      const l1 = segs[0];
      allCats.push({ code, path: v.p, leaf, l1 });
    }
  }
  console.log(`총 카테고리: ${allCats.length}`);

  let store = {};
  if (existsSync(OUTPUT_PATH)) {
    try {
      store = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));
      console.log(`기존 결과 로드: ${Object.keys(store).length}개`);
    } catch { store = {}; }
  }

  const todo = allCats.filter(c => !store[c.path] || store[c.path].error);
  console.log(`처리 대상: ${todo.length}개 (concurrent=${CONCURRENCY})`);
  if (todo.length === 0) {
    console.log('완료된 상태.');
    return;
  }

  let cursor = 0;
  let done = 0;
  let failed = 0;
  const start = Date.now();

  const worker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= todo.length) return;
      const { code, path, leaf, l1 } = todo[idx];
      const query = buildSearchQuery(leaf, l1);
      const result = await fetchAutocomplete(query);
      if (Array.isArray(result)) {
        store[path] = { leaf, query, l1, suggestions: result, ts: Date.now() };
      } else {
        store[path] = { leaf, query, l1, error: result.error, ts: Date.now() };
        failed++;
      }
      done++;
      if (done % SAVE_EVERY === 0) {
        writeFileSync(OUTPUT_PATH, JSON.stringify(store));
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        const rate = (done / Math.max(1, elapsed)).toFixed(1);
        const remaining = todo.length - done;
        const eta = (remaining / Math.max(0.1, parseFloat(rate))).toFixed(0);
        console.log(`  [${done}/${todo.length}] ${rate}/s · 실패 ${failed} · 경과 ${elapsed}s · 잔여 ~${eta}s`);
      }
      await sleep(jitter());
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  writeFileSync(OUTPUT_PATH, JSON.stringify(store));

  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  console.log(`\n완료: ${done}건 · 실패 ${failed}건 · ${elapsed}s`);
  console.log(`출력: ${OUTPUT_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
