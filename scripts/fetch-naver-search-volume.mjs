/**
 * fetch-naver-search-volume.mjs
 *
 * 16,259 쿠팡 leaf 카테고리 → 네이버 검색광고 keywordstool API로
 * 월간 PC/모바일 검색량, 클릭수, 경쟁도, 연관 키워드 수집.
 *
 * 출력: src/lib/megaload/data/naver-search-volume.json
 *   {
 *     "<카테고리경로>": {
 *       "leaf": "비타민",
 *       "queryHint": "비타민",
 *       "monthlyPc": 12450,
 *       "monthlyMobile": 87320,
 *       "totalMonthly": 99770,
 *       "compIdx": "높음",
 *       "related": [
 *         { "kw": "종합비타민", "pc": 8200, "mobile": 32100, "compIdx": "중간" },
 *         ...
 *       ],
 *       "ts": 1234567890
 *     }
 *   }
 *
 * 특징:
 *   - keywordstool은 hint 1개에 최대 1000 related 반환 → 카테고리당 1 API call
 *   - Rate limit 보수적: 1.2 req/s (네이버 광고 API는 분당 60건 권장)
 *   - Resume 지원
 *   - 비용: 0원 (네이버 검색광고 API는 광고주 무료)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

// .env.local 직접 로드 (Next.js 외부 스크립트라 process.env 자동 로드 안 됨)
const ENV_PATH = '.env.local';
if (existsSync(ENV_PATH)) {
  const content = readFileSync(ENV_PATH, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const m = rawLine.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      let v = m[2];
      // 양 옆 따옴표 제거
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      // literal escape sequence 제거 (file에 \\n 형태로 저장된 경우)
      v = v.replace(/\\[rn]+$/g, '').replace(/[\r\n\t]+$/g, '').trim();
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'src', 'lib', 'megaload', 'data');
const COUPANG_DETAILS_PATH = join(DATA_DIR, 'coupang-cat-details.json');
const OUTPUT_PATH = join(DATA_DIR, 'naver-search-volume.json');

const CUSTOMER_ID = process.env.NAVER_AD_CUSTOMER_ID;
const ACCESS_KEY = process.env.NAVER_AD_ACCESS_KEY;
const SECRET_KEY = process.env.NAVER_AD_SECRET_KEY;

if (!CUSTOMER_ID || !ACCESS_KEY || !SECRET_KEY) {
  console.error('NAVER_AD_* 환경변수 누락. .env.local 확인.');
  process.exit(1);
}

const SAVE_EVERY = 200;
const REQUEST_INTERVAL_MS = 800; // 1.25 req/s (분당 ~75건, 보수적)
const RELATED_LIMIT = 30; // 카테고리당 저장할 연관 키워드 최대

function generateSignature(timestamp, method, path, secretKey) {
  const message = `${timestamp}.${method}.${path}`;
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

function parseCount(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    if (v === '< 10') return 5;
    const n = parseInt(v.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function leafToHint(leaf) {
  const splits = leaf
    .split(/[\/·\(\)\[\],+&\-_'']+/)
    .map(s => s.trim())
    .filter(s => s.length >= 1 && !/^\d+$/.test(s));
  // 네이버 검색광고는 한글/영문/숫자 + 공백만 허용 — 특수문자 제거
  const hint = (splits[0] || leaf).replace(/[^가-힣a-zA-Z0-9]/g, '');
  return hint;
}

async function fetchKeywordstool(hint, retries = 3) {
  const path = '/keywordstool';
  for (let i = 0; i < retries; i++) {
    const ts = Date.now();
    const sig = generateSignature(ts, 'GET', path, SECRET_KEY);
    const params = new URLSearchParams({ hintKeywords: hint, showDetail: '1' });
    try {
      const res = await fetch(`https://api.searchad.naver.com${path}?${params}`, {
        method: 'GET',
        headers: {
          'X-API-KEY': ACCESS_KEY,
          'X-CUSTOMER': CUSTOMER_ID,
          'X-Timestamp': String(ts),
          'X-Signature': sig,
        },
      });
      if (res.status === 429 || res.status === 503) {
        await new Promise(r => setTimeout(r, 3000 + Math.pow(2, i) * 1500));
        continue;
      }
      if (!res.ok) {
        if (res.status === 400) return { error: 'bad_hint' }; // 검색 불가 키워드
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
      }
      const data = await res.json();
      const list = data.keywordList || [];
      // hint 자기 자신 매칭
      const self = list.find(
        k => (k.relKeyword || '').toLowerCase() === hint.toLowerCase(),
      );
      const related = list
        .filter(k => (k.relKeyword || '').toLowerCase() !== hint.toLowerCase())
        .slice(0, RELATED_LIMIT)
        .map(k => ({
          kw: k.relKeyword,
          pc: parseCount(k.monthlyPcQcCnt),
          mobile: parseCount(k.monthlyMobileQcCnt),
          compIdx: k.compIdx || '',
        }));
      return {
        monthlyPc: self ? parseCount(self.monthlyPcQcCnt) : 0,
        monthlyMobile: self ? parseCount(self.monthlyMobileQcCnt) : 0,
        compIdx: self?.compIdx || '',
        related,
      };
    } catch (err) {
      if (i === retries - 1) return { error: String(err.message || err) };
      await new Promise(r => setTimeout(r, 2000 + i * 1000));
    }
  }
  return { error: 'max_retries' };
}

async function main() {
  const coupangDetails = JSON.parse(readFileSync(COUPANG_DETAILS_PATH, 'utf8'));

  const allCats = [];
  for (const [, v] of Object.entries(coupangDetails)) {
    if (v && v.p && typeof v.p === 'string') {
      const segs = v.p.split('>');
      const leaf = segs[segs.length - 1];
      allCats.push({ path: v.p, leaf });
    }
  }
  console.log(`총 카테고리: ${allCats.length}`);

  let store = {};
  if (existsSync(OUTPUT_PATH)) {
    try {
      store = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));
      console.log(`기존 결과: ${Object.keys(store).length}개`);
    } catch { store = {}; }
  }

  const todo = allCats.filter(c => !store[c.path] || store[c.path].error);
  console.log(`처리 대상: ${todo.length}개`);
  if (todo.length === 0) {
    console.log('완료된 상태.');
    return;
  }

  let done = 0;
  let failed = 0;
  const start = Date.now();

  for (const { path, leaf } of todo) {
    const hint = leafToHint(leaf);
    if (!hint) {
      store[path] = { leaf, error: 'no_hint', ts: Date.now() };
      failed++;
      done++;
      continue;
    }
    const result = await fetchKeywordstool(hint);
    if (result.error) {
      store[path] = { leaf, queryHint: hint, error: result.error, ts: Date.now() };
      failed++;
    } else {
      store[path] = {
        leaf,
        queryHint: hint,
        monthlyPc: result.monthlyPc,
        monthlyMobile: result.monthlyMobile,
        totalMonthly: result.monthlyPc + result.monthlyMobile,
        compIdx: result.compIdx,
        related: result.related,
        ts: Date.now(),
      };
    }
    done++;
    if (done % SAVE_EVERY === 0) {
      writeFileSync(OUTPUT_PATH, JSON.stringify(store));
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      const rate = (done / Math.max(1, elapsed)).toFixed(2);
      const remaining = todo.length - done;
      const eta = (remaining / Math.max(0.1, parseFloat(rate))).toFixed(0);
      console.log(`  [${done}/${todo.length}] ${rate}/s · 실패 ${failed} · 경과 ${elapsed}s · 잔여 ~${eta}s`);
    }
    await new Promise(r => setTimeout(r, REQUEST_INTERVAL_MS));
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(store));
  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  console.log(`\n완료: ${done}건 · 실패 ${failed}건 · ${elapsed}s`);
  console.log(`출력: ${OUTPUT_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
