// catalog_registrations.deleted_at 채우기 — sh_products 에서 이미 확인된 삭제 사실을 장부에도 반영한다.
//
// 배경: 삭제·뒤처리 스크립트는 sh_products.status 를 'deleted' 로 바꿨지만 장부는 그대로였다.
//   catalog_registrations.status 는 CHECK ('pending','registering','succeeded','failed') 라 'deleted' 가 안 들어가고,
//   넣어서도 안 된다 — 'succeeded' 는 "등록에 성공했다" 는 과거 사실이고, 중복 방지(status!=='failed')와
//   계정별 등록 수 집계(status==='succeeded')가 그 값을 본다. status 를 바꾸면 계정 등록 수가 0 으로 보여
//   대량등록이 그 계정을 다시 채우려 든다. 그래서 사실은 남기고 deleted_at 만 적는다.
//
// 선행: supabase/migration_catalog_registrations_deleted_at.sql 적용 필요.
//
// 사용:
//   node fill-registration-deleted-at.mjs          # 미리보기
//   node fill-registration-deleted-at.mjs --live   # 실제 반영
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
for (const l of readFileSync('.env.local','utf-8').split(/\r?\n/)) { const m=l.match(/^([A-Z_]+)=(.*)$/); if(m) process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,''); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const LIVE = process.argv.includes('--live');

// 컬럼 존재 확인 — 없으면 마이그레이션 먼저
const probe = await sb.from('catalog_registrations').select('id, deleted_at').limit(1);
if (probe.error) {
  console.error(`deleted_at 컬럼이 없다 (${probe.error.message})`);
  console.error('먼저 적용: npx supabase db query --linked --project-ref dwfhcshvkxyokvtbgluw -f supabase/migration_catalog_registrations_deleted_at.sql');
  process.exit(1);
}

// 삭제 확인된 대리등록분의 (계정, 쿠팡ID)
const deleted = new Set();
for (let f=0;;f+=1000){
  const { data } = await sb.from('sh_products').select('megaload_user_id,coupang_product_id,status,raw_data').range(f,f+999);
  if(!data?.length)break;
  for (const p of data) if (String(p.raw_data?.source||'')==='admin_bulk' && p.status==='deleted' && p.coupang_product_id)
    deleted.add(`${p.megaload_user_id}|${p.coupang_product_id}`);
  if(data.length<1000)break;
}
console.log(`sh_products 기준 삭제 확인된 대리등록분: ${deleted.size}건`);

// 장부에서 대응 행 찾기
const regs=[];
for (let f=0;;f+=1000){
  const { data } = await sb.from('catalog_registrations').select('id,megaload_user_id,channel_product_id,status,deleted_at').range(f,f+999);
  if(!data?.length)break; regs.push(...data); if(data.length<1000)break;
}
const targets = regs.filter(r => r.channel_product_id && !r.deleted_at
  && deleted.has(`${r.megaload_user_id}|${r.channel_product_id}`));
console.log(`장부 ${regs.length}건 중 deleted_at 을 적을 대상: ${targets.length}건`);
console.log(`(이미 적혀 있는 것: ${regs.filter(r=>r.deleted_at).length}건)`);

if (!LIVE) { console.log('\n미리보기 — 아무것도 바꾸지 않았다. --live 로 반영.'); process.exit(0); }

const now = new Date().toISOString();
let done=0, failed=0;
for (let i=0;i<targets.length;i+=200) {
  const chunk = targets.slice(i,i+200).map(r=>r.id);
  const { error } = await sb.from('catalog_registrations').update({ deleted_at: now }).in('id', chunk);
  if (error) { failed += chunk.length; console.error(`  실패 ${chunk.length}건: ${error.message}`); }
  else { done += chunk.length; if (done % 1000 === 0) console.log(`  ... ${done}건`); }
}
console.log(`\ndeleted_at 기록 ${done}건 · 실패 ${failed}건`);

// 검증
const after=[];
for (let f=0;;f+=1000){
  const { data } = await sb.from('catalog_registrations').select('status,deleted_at').range(f,f+999);
  if(!data?.length)break; after.push(...data); if(data.length<1000)break;
}
const alive = after.filter(r=>r.status==='succeeded' && !r.deleted_at).length;
console.log(`검증 — 장부 succeeded 중 살아있는 것으로 남은 것: ${alive}건`);
