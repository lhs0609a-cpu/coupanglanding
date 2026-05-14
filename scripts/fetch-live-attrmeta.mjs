// 16k 카테고리 live attributeMeta 전수 수집 (Fly.io 프록시 경유)
//
// 출력: src/lib/megaload/data/cache/live-attr-meta-shardNN.json (10 shards)
// 각 shard: { [code]: { attrs: [...], fetchedAt: number } | { error: string } }
//
// 재시작 가능: 이미 수집된 code 는 skip
// 동시성: 기본 8 — 쿠팡 rate limit 회피
//
// 사용:
//   node scripts/fetch-live-attrmeta.mjs                # 전체
//   SHARD=3 TOTAL_SHARDS=10 node scripts/fetch-live-attrmeta.mjs   # shard 3 만
//   CONCURRENCY=4 node scripts/fetch-live-attrmeta.mjs             # 동시 4건

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUPABASE_URL = 'https://dwfhcshvkxyokvtbgluw.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3Zmhjc2h2a3h5b2t2dGJnbHV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQzMTE4MSwiZXhwIjoyMDg4MDA3MTgxfQ.nU6WSkFOgU6YX6uhIzSZFseK6jWud4v4yq3WheLjirI';
const COUPANG_PROXY_URL = 'https://coupang-api-proxy.fly.dev';
const COUPANG_PROXY_SECRET = 'cpx-3dbbbbc400bb7c15e68d258bfb86e2dc';

const CONCURRENCY = parseInt(process.env.CONCURRENCY || '8', 10);
const TOTAL_SHARDS = parseInt(process.env.TOTAL_SHARDS || '10', 10);
const SHARD = process.env.SHARD !== undefined ? parseInt(process.env.SHARD, 10) : null;
const CACHE_DIR = join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'cache');
const SAVE_EVERY = 100;  // 100건마다 디스크 저장
const REQUEST_TIMEOUT_MS = 30000;

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getCredentials() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data, error } = await supabase
    .from('channel_credentials')
    .select('credentials')
    .eq('channel', 'coupang')
    .eq('is_connected', true)
    .limit(1)
    .single();
  if (error || !data) throw new Error('자격증명 조회 실패: ' + (error?.message || 'no data'));
  return data.credentials;
}

async function fetchMeta(code, creds, attempt = 0) {
  const path = `/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-metas/display-category-codes/${code}`;
  const url = COUPANG_PROXY_URL + '/proxy' + path;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Proxy-Secret': COUPANG_PROXY_SECRET,
        'X-Coupang-Access-Key': creds.accessKey,
        'X-Coupang-Secret-Key': creds.secretKey,
        'X-Coupang-Vendor-Id': creds.vendorId,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 429 && attempt < 3) {
        await sleep(2000 * (attempt + 1));
        return fetchMeta(code, creds, attempt + 1);
      }
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = await res.json();
    const data = json?.data || json;
    const attrs = (data?.attributes || []).map(a => ({
      n: a.attributeTypeName,           // attribute 이름
      r: a.required === 'MANDATORY' || a.required === true,  // 필수 여부
      dt: a.dataType,                   // STRING / NUMBER / ENUM
      bu: a.basicUnit,                  // 기본 단위
      uu: a.usableUnits,                // 사용 가능 단위 list
      ex: a.exposed,                    // EXPOSED (구매옵션) / NONE (검색속성)
      gn: a.groupNumber,                // 택1 그룹 번호
      vs: (a.inputValues || a.attributeValueList || []).map(v => v.inputValue || v.attributeValueName).filter(Boolean),
    }));
    return { code, attrs };
  } catch (e) {
    if (e.name === 'AbortError' && attempt < 2) {
      return fetchMeta(code, creds, attempt + 1);
    }
    return { code, error: e.message?.slice(0, 200) || String(e) };
  } finally {
    clearTimeout(timer);
  }
}

async function processShard(shardIdx, totalShards, allCodes, creds) {
  const shardCodes = allCodes.filter((_, i) => i % totalShards === shardIdx);
  const cacheFile = join(CACHE_DIR, `live-attr-meta-shard${String(shardIdx).padStart(2, '0')}.json`);
  let cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf-8')) : {};

  // skip already cached (success only — errors will retry)
  const todo = shardCodes.filter(c => !cache[c] || cache[c].error);
  console.log(`[shard ${shardIdx}] total=${shardCodes.length}, cached=${shardCodes.length - todo.length}, todo=${todo.length}`);

  let saveCounter = 0;
  let okCount = 0;
  let errCount = 0;
  const startAt = Date.now();

  // 동시성 worker pool
  let cursor = 0;
  async function worker() {
    while (cursor < todo.length) {
      const idx = cursor++;
      const code = todo[idx];
      const result = await fetchMeta(code, creds);
      if (result.error) {
        cache[code] = { error: result.error, fetchedAt: Date.now() };
        errCount++;
      } else {
        cache[code] = { attrs: result.attrs, fetchedAt: Date.now() };
        okCount++;
      }
      saveCounter++;
      if (saveCounter >= SAVE_EVERY) {
        writeFileSync(cacheFile, JSON.stringify(cache));
        const elapsed = ((Date.now() - startAt) / 1000).toFixed(0);
        const rate = ((okCount + errCount) / Math.max(1, parseInt(elapsed))).toFixed(1);
        console.log(`[shard ${shardIdx}] processed=${okCount + errCount}/${todo.length} | ok=${okCount} err=${errCount} | ${rate}/s | elapsed=${elapsed}s`);
        saveCounter = 0;
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  writeFileSync(cacheFile, JSON.stringify(cache));

  const elapsed = ((Date.now() - startAt) / 1000).toFixed(0);
  console.log(`[shard ${shardIdx}] DONE: ok=${okCount} err=${errCount} (total ${shardCodes.length}) in ${elapsed}s`);
}

async function main() {
  const creds = await getCredentials();
  const idx = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-index.json'), 'utf-8'));
  const codes = idx.map(([code]) => String(code)).sort();
  console.log(`Total cats: ${codes.length}, shards: ${TOTAL_SHARDS}, concurrency per shard: ${CONCURRENCY}`);

  if (SHARD !== null) {
    await processShard(SHARD, TOTAL_SHARDS, codes, creds);
  } else {
    for (let s = 0; s < TOTAL_SHARDS; s++) await processShard(s, TOTAL_SHARDS, codes, creds);
  }
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
