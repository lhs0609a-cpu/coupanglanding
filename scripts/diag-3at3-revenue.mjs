/**
 * 진단: 3@3 PT 사용자의 api_revenue_snapshots 전수 덤프
 *
 * - 어떤 year_month 가 들어있는지
 * - 각 row 의 total_sales / synced_at / sync_error
 * - 누적 매출 계산 시뮬레이션 (performance/page.tsx 와 동일 로직)
 *
 * 사용: node scripts/diag-3at3-revenue.mjs
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// .env.local 에서 직접 읽기 (Next.js 런타임 안 거침)
const envText = fs.readFileSync('.env.local', 'utf-8');
const envMap = Object.fromEntries(
  envText.split(/\r?\n/)
    .filter((l) => l && !l.trimStart().startsWith('#') && l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=');
      let v = l.slice(idx + 1).trim();
      // 양쪽 따옴표 제거
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return [l.slice(0, idx).trim(), v];
    }),
);

const SUPABASE_URL = envMap.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = envMap.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = envMap.ENCRYPTION_KEY;

// AES-256-GCM 복호화 (encryption.ts 와 동일 알고리즘)
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

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE 환경변수 누락');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// 1) 3@3 사용자 찾기 — profile.full_name 또는 email 기준
const { data: profiles, error: pErr } = await supabase
  .from('profiles')
  .select('id, email, full_name')
  .or('email.ilike.%3@3%,full_name.ilike.%3@3%');

if (pErr) { console.error(pErr); process.exit(1); }

console.log(`매칭 profile ${profiles.length}개:`);
for (const p of profiles) console.log(`  - ${p.email} / ${p.full_name} (${p.id})`);

if (profiles.length === 0) {
  console.error('3@3 매칭 profile 없음');
  process.exit(1);
}

// 2) 각 profile 의 pt_user_id 찾기
const { data: ptUsers } = await supabase
  .from('pt_users')
  .select('id, profile_id, status')
  .in('profile_id', profiles.map((p) => p.id));

console.log(`\n매칭 pt_users ${ptUsers?.length ?? 0}개:`);
for (const u of ptUsers || []) {
  const pf = profiles.find((p) => p.id === u.profile_id);
  console.log(`  - ptUserId=${u.id} status=${u.status} (${pf?.email})`);
}

if (!ptUsers || ptUsers.length === 0) process.exit(1);

// 3) 각 pt_user 의 snapshot 전수 덤프
for (const u of ptUsers) {
  const pf = profiles.find((p) => p.id === u.profile_id);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`▶ ${pf?.email} (ptUserId=${u.id})`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const { data: snaps } = await supabase
    .from('api_revenue_snapshots')
    .select('year_month, total_sales, total_settlement, item_count, synced_at, sync_error')
    .eq('pt_user_id', u.id)
    .order('year_month', { ascending: true });

  if (!snaps || snaps.length === 0) {
    console.log('  스냅샷 없음');
    continue;
  }

  console.log(`  스냅샷 ${snaps.length}개 (월별):`);
  let totalSales = 0;
  let totalSettlement = 0;
  for (const s of snaps) {
    const sales = Number(s.total_sales) || 0;
    const settle = Number(s.total_settlement) || 0;
    totalSales += sales;
    totalSettlement += settle;
    const errMark = s.sync_error ? ` ⚠ ${String(s.sync_error).slice(0, 80)}` : '';
    console.log(
      `    ${s.year_month}: sales=₩${sales.toLocaleString().padStart(15)}` +
      ` settle=₩${settle.toLocaleString().padStart(15)} items=${s.item_count}` +
      ` synced=${s.synced_at?.slice(0, 19) || '?'}${errMark}`,
    );
  }
  console.log(`\n  ▶ 누적 합산 (모든 월):`);
  console.log(`    sales 합계   = ₩${totalSales.toLocaleString()}`);
  console.log(`    settle 합계  = ₩${totalSettlement.toLocaleString()}`);

  // 4) monthly_reports 와 합치는 시뮬레이션 — performance/page.tsx 와 동일 로직
  const { data: reports } = await supabase
    .from('monthly_reports')
    .select('year_month, reported_revenue')
    .eq('pt_user_id', u.id);
  const reportMonths = new Set((reports || []).map((r) => r.year_month));
  let merged = 0;
  for (const r of reports || []) merged += Number(r.reported_revenue) || 0;
  for (const s of snaps) {
    if (reportMonths.has(s.year_month)) continue;
    merged += Number(s.total_sales) || 0;
  }
  console.log(`\n  ▶ performance 페이지가 보여주는 "누적 매출" = ₩${merged.toLocaleString()}`);
  console.log(`    (monthly_reports ${reports?.length ?? 0}개 + snapshot ${snaps.length}개 합산)`);

  // 5) 비정상 의심 row 표시
  const suspicious = snaps.filter((s) => Number(s.total_sales) > 100_000_000);
  if (suspicious.length > 0) {
    console.log(`\n  🚨 ₩1억 초과 month ${suspicious.length}개:`);
    for (const s of suspicious) {
      console.log(`    ${s.year_month}: ₩${Number(s.total_sales).toLocaleString()} (synced ${s.synced_at})`);
    }
  }

  // 6) 의심 month 에 대해 공식 revenue-history API 와 ordersheets 결과를 직접 비교
  if (suspicious.length === 0) continue;

  console.log(`\n  ▶ 의심 month 에 대해 두 API 직접 호출 비교:`);

  const { data: cred } = await supabase
    .from('pt_users')
    .select('coupang_vendor_id, coupang_access_key, coupang_secret_key')
    .eq('id', u.id)
    .single();

  if (!cred?.coupang_vendor_id) {
    console.log('    coupang credential 없음 — skip');
    continue;
  }

  const vendorId = cred.coupang_vendor_id;
  const accessKey = await decryptPassword(cred.coupang_access_key);
  const secretKey = await decryptPassword(cred.coupang_secret_key);

  for (const sus of suspicious) {
    const ym = sus.year_month;
    const [year, mon] = ym.split('-').map(Number);
    const lastDay = new Date(year, mon, 0).getDate();
    let endDate = `${ym}-${String(lastDay).padStart(2, '0')}`;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    if (endDate > yesterdayStr) endDate = yesterdayStr;
    const startDate = `${ym}-01`;

    // (1) revenue-history (공식 매출인식 API) — 페이지네이션 끝까지
    let revTotal = 0;
    let revItems = 0;
    let token = '';
    let pageCount = 0;
    let revError = null;
    try {
      while (true) {
        pageCount++;
        const path = `/v2/providers/openapi/apis/api/v1/revenue-history?vendorId=${vendorId}&recognitionDateFrom=${startDate}&recognitionDateTo=${endDate}&token=${encodeURIComponent(token)}&maxPerPage=50`;
        const res = await callViaProxy(path, accessKey, secretKey, vendorId);
        const orders = Array.isArray(res?.data) ? res.data : [];
        for (const o of orders) {
          const items = Array.isArray(o.items) ? o.items : [];
          for (const it of items) {
            revItems++;
            revTotal += Number(it.saleAmount ?? it.salePrice ?? 0);
          }
        }
        const next = res?.nextToken ?? res?.token ?? '';
        if (!next || pageCount >= 200) break;
        token = String(next);
      }
    } catch (e) {
      revError = e?.message || String(e);
    }

    // (2) ordersheets — 5개 status × 페이지 모두 — 그리고 orderId 별 중복 카운트
    let osTotal = 0;
    let osItems = 0;
    const orderIdSeen = new Map(); // orderId -> count
    let osError = null;
    try {
      for (const status of ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY']) {
        for (let page = 1; page <= 200; page++) {
          const qs = `createdAtFrom=${startDate}&createdAtTo=${endDate}&status=${status}&maxPerPage=50&page=${page}`;
          const path = `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets?${qs}`;
          const res = await callViaProxy(path, accessKey, secretKey, vendorId);
          const orders = Array.isArray(res?.data) ? res.data : [];
          if (orders.length === 0) break;
          for (const o of orders) {
            const oid = String(o.orderId || '');
            orderIdSeen.set(oid, (orderIdSeen.get(oid) || 0) + 1);
            const oStatus = String(o.status || '').toUpperCase();
            if (oStatus === 'CANCEL' || oStatus === 'CANCELLED' || oStatus === 'RETURN_DONE') continue;
            const items = Array.isArray(o.orderItems) ? o.orderItems : [];
            for (const it of items) {
              const iStatus = String(it.status || '').toUpperCase();
              if (iStatus === 'CANCEL' || iStatus === 'CANCELLED') continue;
              osItems++;
              const unitPrice = Number(it.salesPrice ?? it.orderPrice ?? 0);
              const qty = Number(it.shippingCount ?? it.shippingNumberSum ?? 1);
              osTotal += unitPrice * qty;
            }
          }
          if (orders.length < 50) break;
        }
      }
    } catch (e) {
      osError = e?.message || String(e);
    }

    const dupOrders = [...orderIdSeen.entries()].filter(([, c]) => c > 1);
    const totalOrderHits = [...orderIdSeen.values()].reduce((a, b) => a + b, 0);

    console.log(`\n    ── ${ym} ──`);
    console.log(`    snapshot 저장값      : ₩${Number(sus.total_sales).toLocaleString()} (${sus.item_count} items)`);
    console.log(`    revenue-history(공식): ₩${revTotal.toLocaleString()} (${revItems} items)${revError ? ` ⚠ ${revError}` : ''}`);
    console.log(`    ordersheets 합산     : ₩${osTotal.toLocaleString()} (${osItems} items)${osError ? ` ⚠ ${osError}` : ''}`);
    console.log(`    ordersheets unique orderId = ${orderIdSeen.size}, 총 응답 hit = ${totalOrderHits}, 중복 orderId = ${dupOrders.length}`);
    if (dupOrders.length > 0) {
      const top5 = dupOrders.sort((a, b) => b[1] - a[1]).slice(0, 5);
      console.log(`    🚨 중복 사례 top5 (orderId × 등장횟수):`);
      for (const [oid, c] of top5) console.log(`       ${oid} × ${c}`);
    }
    if (revTotal > 0) {
      const ratio = osTotal / revTotal;
      console.log(`    ▶ ordersheets / revenue-history = ${ratio.toFixed(2)}x ${ratio > 1.5 ? '🚨 부풀림 의심' : '✅ 정상 범위'}`);
    }
  }
}

// ── HMAC 직접 서명 (proxy 없으면) 또는 proxy 경유 호출 ──
async function callViaProxy(path, accessKey, secretKey, vendorId) {
  const proxyUrl = envMap.COUPANG_PROXY_URL;
  const proxySecret = envMap.COUPANG_PROXY_SECRET;
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
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
  // 직접 호출 — HMAC 서명
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
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
