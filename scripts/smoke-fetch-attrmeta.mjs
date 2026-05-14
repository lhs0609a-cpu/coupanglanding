// 5 cats smoke test (connectivity check)
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dwfhcshvkxyokvtbgluw.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3Zmhjc2h2a3h5b2t2dGJnbHV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQzMTE4MSwiZXhwIjoyMDg4MDA3MTgxfQ.nU6WSkFOgU6YX6uhIzSZFseK6jWud4v4yq3WheLjirI';
const COUPANG_PROXY_URL = 'https://coupang-api-proxy.fly.dev';
const COUPANG_PROXY_SECRET = 'cpx-3dbbbbc400bb7c15e68d258bfb86e2dc';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const { data, error } = await supabase
  .from('channel_credentials')
  .select('credentials')
  .eq('channel', 'coupang')
  .eq('is_connected', true)
  .limit(1)
  .single();
if (error || !data) { console.error('creds fail:', error?.message); process.exit(1); }
const creds = data.credentials;
console.log('Got creds: vendorId=', creds.vendorId);

// Test 5 cats: 오렌지(59363), 의류(test), 영양제(58920), 화장품, 휴대폰
const testCats = ['59363', '58920', '56137', '63702', '78900'];

const startAll = Date.now();
for (const code of testCats) {
  const startCat = Date.now();
  const path = `/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-metas/display-category-codes/${code}`;
  const url = COUPANG_PROXY_URL + '/proxy' + path;
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
    });
    if (!res.ok) {
      const text = await res.text();
      console.log(`[${code}] HTTP ${res.status}: ${text.slice(0, 200)}`);
      continue;
    }
    const json = await res.json();
    const data = json?.data || json;
    const attrs = data?.attributes || [];
    const exposed = attrs.filter(a => a.exposed === 'EXPOSED');
    const required = attrs.filter(a => a.required === 'MANDATORY' || a.required === true);
    const elapsed = Date.now() - startCat;
    console.log(`[${code}] ${elapsed}ms | attrs=${attrs.length} exposed=${exposed.length} required=${required.length}`);
    if (code === '59363') {
      for (const a of exposed) {
        console.log(`  EXPOSED: ${a.attributeTypeName} | dataType=${a.dataType} | basicUnit=${a.basicUnit ?? '∅'} | usableUnits=[${(a.usableUnits || []).join(',')}] | required=${a.required} | group=${a.groupNumber}`);
      }
    }
  } catch (e) {
    console.log(`[${code}] ERROR: ${e.message?.slice(0, 200)}`);
  }
}
console.log(`Total ${testCats.length} cats in ${((Date.now() - startAll) / 1000).toFixed(1)}s`);
