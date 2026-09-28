// 강제 재검사에서 자격이 없는 계정의 물류 캐시를 비운다.
// 캐시가 살아 있으면 등록 스크립트가 쿠팡에 안 물어보고 자격 있다고 판단해,
// 키가 폐기된 계정에 100번 헛시도한다.
import { readFileSync } from 'fs';
import { createJiti } from 'jiti';
import { createClient } from '@supabase/supabase-js';
for (const line of readFileSync('.env.local','utf-8').split(/\r?\n/)) { const m=line.match(/^([A-Z_]+)=(.*)$/); if(m) process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,''); }
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': new URL('./src', import.meta.url).pathname.replace(/^\//,'') } });
const { checkEligibility } = await jiti.import('./src/lib/megaload/services/catalog-register.ts');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const { data: users } = await sb.from('megaload_users').select('id').limit(500);
let cleared=0, ok=0;
for (const u of users) {
  let cached=false, forced=false;
  try { cached = (await checkEligibility(sb, u.id)).eligible; } catch {}
  try { forced = (await checkEligibility(sb, u.id, { force:true })).eligible; } catch {}
  if (forced) { ok++; continue; }
  if (cached && !forced) {
    await sb.from('megaload_users').update({ coupang_shipping_checked_at: null }).eq('id', u.id);
    cleared++;
    console.log(`  캐시 삭제 ${u.id.slice(0,8)} — 캐시상 자격OK 였으나 실제로는 불가`);
  }
}
console.log(`\n실제 자격 ${ok}개 · 캐시 정리 ${cleared}개`);
