/**
 * 전체 연동 PT생에 대해 settlement + orders 두 API 모두 호출해서
 * api_revenue_snapshots 의 새 컬럼(total_sales_orders/item_count_orders/order_count)을 채운다.
 *
 * 사전 조건:
 *   - supabase/migration_api_revenue_snapshots_orders.sql 가 production DB 에 적용되어 있어야 함
 *   - .env.local 에 SUPABASE / ENCRYPTION_KEY / (선택) COUPANG_PROXY_URL / COUPANG_PROXY_SECRET
 *
 * 사용: node scripts/resync-all-with-orders.mjs
 *
 * 처리 범위: 모든 연동 PT생 × 최근 3개월 (currentMonth, targetMonth=직전월, prevMonth=전전월)
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

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ENCRYPTION_KEY) {
  console.error('환경변수 누락');
  process.exit(1);
}

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

async function callViaProxy(path, accessKey, secretKey, vendorId) {
  const proxyUrl = envMap.COUPANG_PROXY_URL;
  const proxySecret = envMap.COUPANG_PROXY_SECRET || envMap.PROXY_SECRET;
  if (proxyUrl && proxySecret) {
    const r = await fetch(`${proxyUrl}/proxy${path}`, {
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

async function fetchSettlement(creds, ym) {
  const [year, month] = ym.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const startDate = `${ym}-01`;
  // revenue-history는 yesterday까지만 허용
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  let endDate = `${ym}-${String(lastDay).padStart(2, '0')}`;
  if (endDate > yesterdayStr) endDate = yesterdayStr;
  if (startDate > yesterdayStr) {
    return { totalSales: 0, totalCommission: 0, totalShipping: 0, totalReturns: 0, totalSettlement: 0, itemCount: 0 };
  }

  let totalSales = 0, totalCommission = 0, totalShipping = 0, totalReturns = 0, totalSettlement = 0, itemCount = 0;
  let token = '', pages = 0;
  while (true) {
    pages++;
    const path = `/v2/providers/openapi/apis/api/v1/revenue-history?vendorId=${creds.vendorId}&recognitionDateFrom=${startDate}&recognitionDateTo=${endDate}&token=${encodeURIComponent(token)}&maxPerPage=50`;
    const res = await callViaProxy(path, creds.accessKey, creds.secretKey, creds.vendorId);
    const orders = Array.isArray(res?.data) ? res.data : [];
    for (const o of orders) {
      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        itemCount++;
        totalSales += Number(it.saleAmount ?? it.salePrice ?? 0);
        totalCommission += Number(it.commission ?? 0);
        totalShipping += Number(it.shippingFee ?? 0);
        totalReturns += Number(it.returnFee ?? 0);
        totalSettlement += Number(it.settlementAmount ?? 0);
      }
    }
    const next = res?.nextToken ?? res?.token ?? '';
    if (!next || pages >= 100) break;
    token = String(next);
  }
  return { totalSales, totalCommission, totalShipping, totalReturns, totalSettlement, itemCount };
}

async function fetchOrders(creds, ym) {
  const [year, month] = ym.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const startDate = `${ym}-01`;
  const today = new Date().toISOString().split('T')[0];
  let endDate = `${ym}-${String(lastDay).padStart(2, '0')}`;
  if (endDate > today) endDate = today;
  if (startDate > today) return { totalSales: 0, itemCount: 0, orderCount: 0 };

  let totalSales = 0, itemCount = 0;
  const orderIdSeen = new Set();
  for (const status of ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY']) {
    for (let page = 1; page <= 100; page++) {
      const qs = `createdAtFrom=${startDate}&createdAtTo=${endDate}&status=${status}&maxPerPage=50&page=${page}`;
      const path = `/v2/providers/openapi/apis/api/v4/vendors/${creds.vendorId}/ordersheets?${qs}`;
      const res = await callViaProxy(path, creds.accessKey, creds.secretKey, creds.vendorId);
      const orders = Array.isArray(res?.data) ? res.data : [];
      if (orders.length === 0) break;
      for (const o of orders) {
        const oid = String(o.orderId || '');
        if (orderIdSeen.has(oid)) continue;
        orderIdSeen.add(oid);
        const oStatus = String(o.status || '').toUpperCase();
        if (oStatus === 'CANCEL' || oStatus === 'CANCELLED' || oStatus === 'RETURN_DONE') continue;
        const items = Array.isArray(o.orderItems) ? o.orderItems : [];
        for (const it of items) {
          const iStatus = String(it.status || '').toUpperCase();
          if (iStatus === 'CANCEL' || iStatus === 'CANCELLED') continue;
          itemCount++;
          const unitPrice = Number(it.salesPrice ?? it.orderPrice ?? 0);
          const qty = Number(it.shippingCount ?? 1);
          totalSales += unitPrice * qty;
        }
      }
      if (orders.length < 50) break;
    }
  }
  return { totalSales, itemCount, orderCount: orderIdSeen.size };
}

function previousMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const prev = new Date(y, m - 2, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const now = new Date();
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const targetMonth = previousMonth(currentMonth);
const prevMonth = previousMonth(targetMonth);
const yearMonths = Array.from(new Set([currentMonth, targetMonth, prevMonth]));

console.log(`재sync 대상 월: ${yearMonths.join(', ')}\n`);

const { data: users, error } = await supabase
  .from('pt_users')
  .select(`
    id,
    coupang_vendor_id,
    coupang_access_key,
    coupang_secret_key,
    profile:profiles(email, full_name)
  `)
  .eq('status', 'active')
  .eq('coupang_api_connected', true)
  .not('coupang_vendor_id', 'is', null)
  .not('coupang_access_key', 'is', null)
  .not('coupang_secret_key', 'is', null);

if (error) {
  console.error('users query error:', error);
  process.exit(1);
}

console.log(`연동 PT생 ${users.length}명\n`);

let successCount = 0, partialCount = 0, failedCount = 0;

for (const u of users) {
  const profile = Array.isArray(u.profile) ? u.profile[0] : u.profile;
  const label = profile?.email || profile?.full_name || u.id.slice(0, 8);
  console.log(`▶ ${label}`);

  let accessKey, secretKey;
  try {
    accessKey = await decryptPassword(u.coupang_access_key);
    secretKey = await decryptPassword(u.coupang_secret_key);
  } catch (err) {
    console.log(`  ⚠ decrypt failed — skip`);
    failedCount++;
    continue;
  }
  const creds = { vendorId: u.coupang_vendor_id, accessKey, secretKey };

  for (const ym of yearMonths) {
    let settlement = null, settlementError = null;
    let orders = null, ordersError = null;
    try {
      settlement = await fetchSettlement(creds, ym);
    } catch (e) { settlementError = e?.message || String(e); }
    try {
      orders = await fetchOrders(creds, ym);
    } catch (e) { ordersError = e?.message || String(e); }

    const effective = Math.max(settlement?.totalSales ?? 0, orders?.totalSales ?? 0);
    const settleVal = settlement?.totalSales ?? 0;
    const ordersVal = orders?.totalSales ?? 0;
    console.log(`  ${ym}: settlement=₩${settleVal.toLocaleString()} orders=₩${ordersVal.toLocaleString()} → effective=₩${effective.toLocaleString()}${settlementError ? ` [s-err: ${settlementError.slice(0, 50)}]` : ''}${ordersError ? ` [o-err: ${ordersError.slice(0, 50)}]` : ''}`);

    await supabase.from('api_revenue_snapshots').upsert({
      pt_user_id: u.id,
      year_month: ym,
      total_sales: settlement?.totalSales ?? 0,
      total_commission: settlement?.totalCommission ?? 0,
      total_shipping: settlement?.totalShipping ?? 0,
      total_returns: settlement?.totalReturns ?? 0,
      total_settlement: settlement?.totalSettlement ?? 0,
      item_count: settlement?.itemCount ?? 0,
      total_sales_orders: orders?.totalSales ?? 0,
      item_count_orders: orders?.itemCount ?? 0,
      order_count: orders?.orderCount ?? 0,
      synced_at: new Date().toISOString(),
      sync_error: settlementError ? settlementError.slice(0, 500) : null,
      orders_sync_error: ordersError ? ordersError.slice(0, 500) : null,
    }, { onConflict: 'pt_user_id,year_month' });

    if (!settlementError && !ordersError) successCount++;
    else if (settlementError && ordersError) failedCount++;
    else partialCount++;
  }
  console.log('');
}

console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`완료: 성공 ${successCount} / 부분성공 ${partialCount} / 실패 ${failedCount}`);
