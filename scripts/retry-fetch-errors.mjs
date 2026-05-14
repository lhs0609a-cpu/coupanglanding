// 캐시된 error entries 만 단일 thread 로 재시도 (rate limit 회피)
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUPABASE_URL = 'https://dwfhcshvkxyokvtbgluw.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3Zmhjc2h2a3h5b2t2dGJnbHV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQzMTE4MSwiZXhwIjoyMDg4MDA3MTgxfQ.nU6WSkFOgU6YX6uhIzSZFseK6jWud4v4yq3WheLjirI';
const COUPANG_PROXY_URL = 'https://coupang-api-proxy.fly.dev';
const COUPANG_PROXY_SECRET = 'cpx-3dbbbbc400bb7c15e68d258bfb86e2dc';

const CACHE_DIR = join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'cache');

async function getCreds() {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data, error } = await sb.from('channel_credentials').select('credentials').eq('channel','coupang').eq('is_connected',true).limit(1).single();
  if (error || !data) throw new Error('creds fail');
  return data.credentials;
}

async function fetchMeta(code, creds) {
  const path = `/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-metas/display-category-codes/${code}`;
  const url = COUPANG_PROXY_URL + '/proxy' + path;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-Proxy-Secret': COUPANG_PROXY_SECRET,
      'X-Coupang-Access-Key': creds.accessKey,
      'X-Coupang-Secret-Key': creds.secretKey,
      'X-Coupang-Vendor-Id': creds.vendorId,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0,150)}`);
  }
  const json = await res.json();
  const data = json?.data || json;
  return (data?.attributes || []).map(a => ({
    n: a.attributeTypeName, r: a.required === 'MANDATORY' || a.required === true,
    dt: a.dataType, bu: a.basicUnit, uu: a.usableUnits, ex: a.exposed, gn: a.groupNumber,
    vs: (a.inputValues || a.attributeValueList || []).map(v => v.inputValue || v.attributeValueName).filter(Boolean),
  }));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const creds = await getCreds();
console.log('Got creds');

// 각 shard 의 error 만 모음
const allErrors = [];
const shardMap = new Map();
for (let s = 0; s < 10; s++) {
  const f = join(CACHE_DIR, `live-attr-meta-shard${String(s).padStart(2, '0')}.json`);
  if (!existsSync(f)) continue;
  const data = JSON.parse(readFileSync(f, 'utf-8'));
  shardMap.set(s, { file: f, data });
  for (const [code, val] of Object.entries(data)) {
    if (val.error) allErrors.push({ s, code });
  }
}
console.log(`Found ${allErrors.length} errors across ${shardMap.size} shards`);

let ok = 0, persistentErr = 0;
const startAt = Date.now();
for (let i = 0; i < allErrors.length; i++) {
  const { s, code } = allErrors[i];
  try {
    const attrs = await fetchMeta(code, creds);
    shardMap.get(s).data[code] = { attrs, fetchedAt: Date.now() };
    ok++;
  } catch (e) {
    if (/HTTP 429/.test(e.message)) {
      await sleep(3000);
      // retry once more
      try {
        const attrs = await fetchMeta(code, creds);
        shardMap.get(s).data[code] = { attrs, fetchedAt: Date.now() };
        ok++;
        continue;
      } catch {
        persistentErr++;
      }
    } else {
      persistentErr++;
      shardMap.get(s).data[code] = { error: e.message.slice(0, 150), fetchedAt: Date.now() };
    }
  }
  // small rate limit safety
  await sleep(150);

  if ((i + 1) % 50 === 0) {
    // save all shards
    for (const { file, data } of shardMap.values()) writeFileSync(file, JSON.stringify(data));
    const el = ((Date.now() - startAt) / 1000).toFixed(0);
    console.log(`[${i+1}/${allErrors.length}] ok=${ok} err=${persistentErr} elapsed=${el}s`);
  }
}
// final save
for (const { file, data } of shardMap.values()) writeFileSync(file, JSON.stringify(data));
console.log(`\nDONE: ok=${ok}, persistentErr=${persistentErr} in ${((Date.now()-startAt)/1000).toFixed(0)}s`);
