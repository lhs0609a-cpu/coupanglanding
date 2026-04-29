/**
 * 진단(읽기 전용): 모든 PT 사용자의 api_revenue_snapshots 검사.
 *
 * 손상 의심 휴리스틱:
 *   - total_sales == total_settlement (이고 둘 다 > 0) → ordersheets 기반 (cron 버그 영향)
 *   - total_sales > 100,000,000 (1억)                  → 부풀림 의심
 *
 * 사용: node scripts/diag-all-snapshots.mjs
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

const supabase = createClient(envMap.NEXT_PUBLIC_SUPABASE_URL, envMap.SUPABASE_SERVICE_ROLE_KEY);

const { data: users } = await supabase
  .from('pt_users')
  .select('id, profile_id, status')
  .eq('status', 'active')
  .eq('coupang_api_connected', true);

const profileIds = users.map((u) => u.profile_id);
const { data: profiles } = await supabase.from('profiles').select('id, email, full_name').in('id', profileIds);
const profileMap = new Map(profiles.map((p) => [p.id, p]));

const { data: snaps } = await supabase
  .from('api_revenue_snapshots')
  .select('pt_user_id, year_month, total_sales, total_settlement, item_count, synced_at, sync_error')
  .in('pt_user_id', users.map((u) => u.id));

const byUser = new Map();
for (const s of snaps) {
  const arr = byUser.get(s.pt_user_id) || [];
  arr.push(s);
  byUser.set(s.pt_user_id, arr);
}

let totalSuspicious = 0;
let totalUsers = 0;
const affectedUsers = [];

for (const u of users) {
  const userSnaps = byUser.get(u.id) || [];
  if (userSnaps.length === 0) continue;
  totalUsers++;
  const profile = profileMap.get(u.profile_id);

  // 손상 의심 row 추출
  const suspicious = userSnaps.filter((s) => {
    const sales = Number(s.total_sales) || 0;
    const settle = Number(s.total_settlement) || 0;
    // 조건1: sales > 1억
    if (sales > 100_000_000) return true;
    // 조건2: sales == settle 이고 둘 다 > 0 (ordersheets footprint)
    if (sales > 0 && sales === settle) return true;
    return false;
  });

  if (suspicious.length === 0) continue;

  totalSuspicious += suspicious.length;
  const total = userSnaps.reduce((a, s) => a + (Number(s.total_sales) || 0), 0);
  affectedUsers.push({ profile, ptUserId: u.id, suspicious, total, allSnaps: userSnaps });
}

console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`전체 활성+연동 PT 사용자: ${users.length}명`);
console.log(`snapshot 보유 사용자    : ${totalUsers}명`);
console.log(`손상 의심 사용자        : ${affectedUsers.length}명`);
console.log(`손상 의심 snapshot row  : ${totalSuspicious}개`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

// 매출 큰 순으로 정렬
affectedUsers.sort((a, b) => b.total - a.total);

for (const a of affectedUsers) {
  console.log(`▶ ${a.profile?.email || '?'} / ${a.profile?.full_name || '?'} (${a.ptUserId})`);
  console.log(`  현재 누적: ₩${a.total.toLocaleString()}`);
  console.log(`  의심 row ${a.suspicious.length}개:`);
  for (const s of a.suspicious) {
    const sales = Number(s.total_sales) || 0;
    const settle = Number(s.total_settlement) || 0;
    const reason = sales > 100_000_000 ? '1억 초과' : (sales === settle ? 'sales==settle' : '?');
    console.log(`    ${s.year_month}: sales=₩${sales.toLocaleString().padStart(13)} settle=₩${settle.toLocaleString().padStart(13)} items=${s.item_count} synced=${s.synced_at?.slice(0, 19)} [${reason}]`);
  }
  console.log('');
}

if (affectedUsers.length === 0) {
  console.log('✅ 손상 의심 snapshot 없음');
}
