/**
 * 모든 eligible PT 사용자의 api_revenue_snapshots 를 revenue-history 기준으로 재동기화.
 *
 * 손상된 snapshot 판별 휴리스틱:
 *   - total_sales == total_settlement 이고 둘 다 > 0  → ordersheets 기반 (버그 가능)
 *   - total_sales > 100,000,000 (1억)                  → 부풀림 의심
 *
 * 모든 eligible 사용자에 대해 최근 3개월(current/target/prev) 다시 호출하고 upsert.
 *
 * 사용: node scripts/resync-all-snapshots.mjs
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
const PROXY_URL = envMap.COUPANG_PROXY_URL;
const PROXY_SECRET = envMap.COUPANG_PROXY_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ENCRYPTION_KEY) {
  console.error('필수 env 누락');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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
  if (PROXY_URL && PROXY_SECRET) {
    const url = `${PROXY_URL}/proxy${path}`;
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Proxy-Secret': PROXY_SECRET,
        'X-Coupang-Access-Key': accessKey,
        'X-Coupang-Secret-Key': secretKey,
        'X-Coupang-Vendor-Id': vendorId,
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
  throw new Error('PROXY_URL 미설정');
}

// revenue-history 한 달 호출 (token 페이지네이션)
async function fetchRevenueHistory(vendorId, accessKey, secretKey, ym) {
  const [year, mon] = ym.split('-').map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  let endDate = `${ym}-${String(lastDay).padStart(2, '0')}`;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  if (endDate > yesterdayStr) endDate = yesterdayStr;
  const startDate = `${ym}-01`;
  if (startDate > endDate) {
    return { totalSales: 0, totalCommission: 0, totalSettlement: 0, items: [] };
  }

  let totalSales = 0, totalCommission = 0, totalSettlement = 0, totalShipping = 0;
  let token = '', pageCount = 0;
  const items = [];
  while (pageCount < 200) {
    pageCount++;
    const path = `/v2/providers/openapi/apis/api/v1/revenue-history?vendorId=${vendorId}&recognitionDateFrom=${startDate}&recognitionDateTo=${endDate}&token=${encodeURIComponent(token)}&maxPerPage=50`;
    const res = await callViaProxy(path, accessKey, secretKey, vendorId);
    const orders = Array.isArray(res?.data) ? res.data : [];
    for (const o of orders) {
      const dFee = o.deliveryFee || {};
      const orderItems = Array.isArray(o.items) ? o.items : [];
      for (const it of orderItems) {
        const sale = Number(it.saleAmount ?? it.salePrice ?? 0);
        totalSales += sale;
        totalCommission += Number(it.serviceFee ?? 0) + Number(it.serviceFeeVat ?? 0);
        totalSettlement += Number(it.settlementAmount ?? 0);
        items.push(sale);
      }
      totalShipping += Number(dFee.amount ?? 0);
    }
    const next = res?.nextToken ?? res?.token ?? '';
    if (!next) break;
    token = String(next);
  }

  return { totalSales, totalCommission, totalSettlement, totalShipping, items };
}

// ──────────────────────────────────────────

const now = new Date();
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
const prev2Date = new Date(now.getFullYear(), now.getMonth() - 2, 1);
const prev2Month = `${prev2Date.getFullYear()}-${String(prev2Date.getMonth() + 1).padStart(2, '0')}`;
const yearMonths = [currentMonth, prevMonth, prev2Month];

console.log(`재동기화 대상 month: ${yearMonths.join(', ')}\n`);

// SCOPE: 3@3 만 (사용자 명시적 동의 없이 다른 사용자 production data 변경 금지)
const TARGET_PT_USER_ID = 'cf1102f4-422f-49aa-ab34-a1f01e9ff677';

const { data: users } = await supabase
  .from('pt_users')
  .select('id, profile_id, coupang_vendor_id, coupang_access_key, coupang_secret_key')
  .eq('id', TARGET_PT_USER_ID);

console.log(`대상 PT 사용자 ${users?.length ?? 0}명 (3@3 한정)\n`);

const profileIds = users.map((u) => u.profile_id);
const { data: profiles } = await supabase.from('profiles').select('id, email').in('id', profileIds);
const profileMap = new Map(profiles.map((p) => [p.id, p.email]));

let totalUpdated = 0;
let totalErrors = 0;

for (const u of users) {
  const email = profileMap.get(u.profile_id) || '?';
  console.log(`▶ ${email} (${u.id})`);

  let accessKey, secretKey;
  try {
    accessKey = await decryptPassword(u.coupang_access_key);
    secretKey = await decryptPassword(u.coupang_secret_key);
  } catch (e) {
    console.log(`  ⚠ 복호화 실패: ${e.message}`);
    totalErrors++;
    continue;
  }

  for (const ym of yearMonths) {
    try {
      const r = await fetchRevenueHistory(u.coupang_vendor_id, accessKey, secretKey, ym);
      await supabase.from('api_revenue_snapshots').upsert({
        pt_user_id: u.id,
        year_month: ym,
        total_sales: r.totalSales,
        total_commission: r.totalCommission,
        total_shipping: r.totalShipping,
        total_returns: 0,
        total_settlement: r.totalSettlement,
        item_count: r.items.length,
        synced_at: new Date().toISOString(),
        sync_error: null,
      }, { onConflict: 'pt_user_id,year_month' });
      console.log(`  ${ym}: sales=₩${r.totalSales.toLocaleString().padStart(15)} settle=₩${r.totalSettlement.toLocaleString().padStart(15)} items=${r.items.length}`);
      totalUpdated++;
    } catch (e) {
      console.log(`  ${ym}: ⚠ ${e.message}`);
      totalErrors++;
    }
  }
}

console.log(`\n✅ ${totalUpdated}개 snapshot 갱신, ❌ ${totalErrors}개 실패`);
