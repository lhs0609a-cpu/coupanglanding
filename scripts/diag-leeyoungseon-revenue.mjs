/**
 * 이영선 (sunkind0709@gmail.com) 쿠팡 매출 직접 확인.
 *
 * 두 종류 API를 직접 호출해서 비교:
 *   (1) revenue-history (공식 매출인식 — 정산 기준)
 *   (2) ordersheets (Wing 대시보드 — 주문 기준)
 *
 * 사용: node scripts/diag-leeyoungseon-revenue.mjs
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf-8');
const envMap = Object.fromEntries(
  envText.split(/\r?\n/)
    .filter((l) => l && !l.trimStart().startsWith('#') && l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=');
      let v = l.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return [l.slice(0, idx).trim(), v];
    }),
);

const SUPABASE_URL = envMap.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = envMap.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = envMap.ENCRYPTION_KEY;
const TARGET_EMAIL = 'sunkind0709@gmail.com';
const MONTHS = ['2026-02', '2026-03', '2026-04', '2026-05'];

async function decryptPassword(ciphertext) {
  const encoder = new TextEncoder();
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw', encoder.encode(ENCRYPTION_KEY),
    { name: 'PBKDF2' }, false, ['deriveKey'],
  );
  const key = await globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode('coupang-seller-pw-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  );
  const combined = Uint8Array.from(Buffer.from(ciphertext, 'base64'));
  const iv = combined.slice(0, 12);
  const enc = combined.slice(12);
  const dec = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, enc);
  return new TextDecoder().decode(dec);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ENCRYPTION_KEY) {
  console.error('환경변수 누락: SUPABASE_URL/SERVICE_KEY/ENCRYPTION_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const { data: prof } = await supabase
  .from('profiles')
  .select('id, email, full_name')
  .eq('email', TARGET_EMAIL)
  .maybeSingle();
if (!prof) { console.error(`profile 없음: ${TARGET_EMAIL}`); process.exit(1); }
console.log(`✅ profile: ${prof.email} (${prof.full_name}) id=${prof.id}`);

const { data: ptUser } = await supabase
  .from('pt_users')
  .select('id, status, coupang_api_connected, coupang_vendor_id, coupang_access_key, coupang_secret_key, coupang_api_blocked_until, created_at, billing_excluded_until, billing_excluded_at')
  .eq('profile_id', prof.id)
  .maybeSingle();
if (!ptUser) { console.error('pt_user 없음'); process.exit(1); }
console.log(`✅ pt_user: id=${ptUser.id}`);
console.log(`   status=${ptUser.status} api_connected=${ptUser.coupang_api_connected}`);
console.log(`   vendorId=${ptUser.coupang_vendor_id}`);
console.log(`   created_at=${ptUser.created_at}`);
console.log(`   billing_excluded_until=${ptUser.billing_excluded_until} (at ${ptUser.billing_excluded_at})`);
console.log(`   coupang_api_blocked_until=${ptUser.coupang_api_blocked_until}`);

if (!ptUser.coupang_vendor_id || !ptUser.coupang_access_key || !ptUser.coupang_secret_key) {
  console.error('🚨 쿠팡 자격증명 누락 — API 호출 불가');
  process.exit(1);
}

const vendorId = ptUser.coupang_vendor_id;
const accessKey = await decryptPassword(ptUser.coupang_access_key);
const secretKey = await decryptPassword(ptUser.coupang_secret_key);
console.log(`✅ 자격증명 복호화 성공: accessKey=${accessKey.slice(0, 6)}... (${accessKey.length} chars)`);

async function callViaProxy(path) {
  const proxyUrl = envMap.COUPANG_PROXY_URL;
  const proxySecret = envMap.COUPANG_PROXY_SECRET || envMap.PROXY_SECRET;
  if (proxyUrl && proxySecret) {
    const url = `${proxyUrl}/proxy${path}`;
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Proxy-Secret': proxySecret,
        'X-Coupang-Access-Key': accessKey,
        'X-Coupang-Secret-Key': secretKey,
        'X-Coupang-Vendor-Id': vendorId,
      },
    });
    if (!r.ok) throw new Error(`PROXY HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
  const crypto = await import('crypto');
  const [pathOnly, query = ''] = path.split('?');
  const datetime = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const message = `${datetime}GET${pathOnly}${query}`;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  const auth = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
  const r = await fetch(`https://api-gateway.coupang.com${path}`, {
    method: 'GET',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json;charset=UTF-8',
      'X-Requested-By': vendorId,
    },
  });
  if (!r.ok) throw new Error(`DIRECT HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

console.log(`\n${'━'.repeat(60)}`);
console.log('월별 두 API 직접 호출 비교');
console.log('━'.repeat(60));

for (const ym of MONTHS) {
  const [year, mon] = ym.split('-').map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  let endDate = `${ym}-${String(lastDay).padStart(2, '0')}`;
  const today = new Date().toISOString().split('T')[0];
  if (endDate > today) endDate = today;
  const startDate = `${ym}-01`;

  console.log(`\n── ${ym} (${startDate} ~ ${endDate}) ──`);

  // (1) revenue-history (공식 매출인식 = 정산 기준)
  let revTotal = 0, revItems = 0, revPages = 0, revError = null;
  try {
    let token = '';
    while (true) {
      revPages++;
      const path = `/v2/providers/openapi/apis/api/v1/revenue-history?vendorId=${vendorId}&recognitionDateFrom=${startDate}&recognitionDateTo=${endDate}&token=${encodeURIComponent(token)}&maxPerPage=50`;
      const res = await callViaProxy(path);
      const orders = Array.isArray(res?.data) ? res.data : [];
      for (const o of orders) {
        const items = Array.isArray(o.items) ? o.items : [];
        for (const it of items) {
          revItems++;
          revTotal += Number(it.saleAmount ?? it.salePrice ?? 0);
        }
      }
      const next = res?.nextToken ?? res?.token ?? '';
      if (!next || revPages >= 50) break;
      token = String(next);
    }
  } catch (e) {
    revError = e?.message || String(e);
  }

  // (2) ordersheets (Wing 대시보드 = 주문 기준)
  let osTotal = 0, osItems = 0, osOrders = 0, osError = null;
  const orderIdSeen = new Set();
  try {
    for (const status of ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY']) {
      for (let page = 1; page <= 50; page++) {
        const qs = `createdAtFrom=${startDate}&createdAtTo=${endDate}&status=${status}&maxPerPage=50&page=${page}`;
        const path = `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets?${qs}`;
        const res = await callViaProxy(path);
        const orders = Array.isArray(res?.data) ? res.data : [];
        if (orders.length === 0) break;
        for (const o of orders) {
          const oid = String(o.orderId || '');
          if (orderIdSeen.has(oid)) continue;
          orderIdSeen.add(oid);
          osOrders++;
          const oStatus = String(o.status || '').toUpperCase();
          if (oStatus === 'CANCEL' || oStatus === 'CANCELLED' || oStatus === 'RETURN_DONE') continue;
          const items = Array.isArray(o.orderItems) ? o.orderItems : [];
          for (const it of items) {
            const iStatus = String(it.status || '').toUpperCase();
            if (iStatus === 'CANCEL' || iStatus === 'CANCELLED') continue;
            osItems++;
            const unitPrice = Number(it.salesPrice ?? it.orderPrice ?? 0);
            const qty = Number(it.shippingCount ?? 1);
            osTotal += unitPrice * qty;
          }
        }
        if (orders.length < 50) break;
      }
    }
  } catch (e) {
    osError = e?.message || String(e);
  }

  console.log(`  📊 revenue-history (정산 기준): ₩${revTotal.toLocaleString()} (${revItems} items, ${revPages} pages)${revError ? ` ⚠ ${revError}` : ''}`);
  console.log(`  📦 ordersheets (주문 기준)    : ₩${osTotal.toLocaleString()} (${osItems} items, ${osOrders} unique orders)${osError ? ` ⚠ ${osError}` : ''}`);
}

console.log(`\n${'━'.repeat(60)}`);
console.log('진단 결론:');
console.log('━'.repeat(60));
console.log('- 두 API 모두 0이면 → 실제 매출 없음 (셀러 미활동)');
console.log('- revenue-history 0인데 ordersheets > 0 → 주문은 있지만 정산 미반영 (신규 셀러 정상)');
console.log('- 둘 다 에러 → 자격증명/권한 mismatch');
console.log('- 다른 PT생은 정상인데 이 사람만 에러 → 이영선 키 자체 문제\n');
