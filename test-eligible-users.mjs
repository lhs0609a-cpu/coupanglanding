// 대리 등록 자격 판정 실검증 — checkEligibility 를 프로덕션 계정 전체에 돌린다.
// 쿠팡 출고지/반품지를 실제로 조회하고 megaload_users 캐시 컬럼을 채운다.
import { readFileSync } from 'fs';
import { createJiti } from 'jiti';
import { createClient } from '@supabase/supabase-js';

// .env.local 로드 (Next 없이 실행하므로 직접 읽는다)
for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': new URL('./src', import.meta.url).pathname.replace(/^\//, '') },
});

const { checkEligibility } = await jiti.import('./src/lib/megaload/services/catalog-register.ts');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: users, error } = await supabase
  .from('megaload_users')
  .select('id, profile_id')
  .limit(500);
if (error) { console.error('계정 조회 실패:', error.message); process.exit(1); }

console.log(`메가로드 계정 ${users.length}개 자격 판정 시작 (쿠팡 실조회)\n`);

const rows = [];
const CONC = 5;
for (let i = 0; i < users.length; i += CONC) {
  const chunk = users.slice(i, i + CONC);
  const res = await Promise.all(chunk.map(async (u) => {
    try {
      return await checkEligibility(supabase, u.id, { force: true });
    } catch (err) {
      return { megaloadUserId: u.id, eligible: false, skipReason: 'exception', detail: String(err?.message || err) };
    }
  }));
  rows.push(...res);
  process.stdout.write(`\r  진행 ${Math.min(i + CONC, users.length)}/${users.length}`);
}
console.log('\n');

const ok = rows.filter((r) => r.eligible);
const byReason = {};
for (const r of rows) if (!r.eligible) byReason[r.skipReason || 'unknown'] = (byReason[r.skipReason || 'unknown'] || 0) + 1;

console.log(`등록 가능: ${ok.length} / ${rows.length}`);
console.log('불가 사유별:');
for (const [k, v] of Object.entries(byReason)) console.log(`   ${k.padEnd(16)} ${v}`);

console.log('\n불가 계정 상세 (앞 12건):');
rows.filter((r) => !r.eligible).slice(0, 12).forEach((r) =>
  console.log(`   ${r.megaloadUserId.slice(0, 8)}  ${(r.skipReason || '').padEnd(15)} ${(r.detail || '').slice(0, 78)}`));

console.log('\n가능 계정 (앞 8건) — 캐시된 물류코드:');
ok.slice(0, 8).forEach((r) =>
  console.log(`   ${r.megaloadUserId.slice(0, 8)}  출고지=${r.outboundCode}  반품지=${r.returnCode}  연락처=${r.contactNumber ? '있음' : '없음'}`));
