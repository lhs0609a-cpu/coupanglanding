// 쿠팡에 "실제로" 몇 개가 살아 있는지 계정별로 전수 확인한다.
//
// 장부(catalog_registrations)는 우리가 등록 요청에 성공했다는 기록일 뿐이다.
// 그 뒤 쿠팡에서 반려·삭제되면 장부에는 아무 흔적이 없다(실측 2026-09-28: 표본
// 184건 중 30건이 "상품삭제"). 쿠팡 목록을 전량 받아 상태별로 세는 게 유일한 정답이다.
//
// 사용: node test-coupang-live-count.mjs
import { readFileSync } from 'fs';
import { createJiti } from 'jiti';
import { createClient } from '@supabase/supabase-js';
for (const line of readFileSync('.env.local','utf-8').split(/\r?\n/)) { const m=line.match(/^([A-Z_]+)=(.*)$/); if(m) process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,''); }
const jiti = createJiti(import.meta.url, { interopDefault:true, alias:{ '@': new URL('./src', import.meta.url).pathname.replace(/^\//,'') } });
const { getAuthenticatedAdapter } = await jiti.import('./src/lib/megaload/adapters/factory.ts');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

// 장부: 계정별 성공 건수 + 우리가 올린 쿠팡상품ID 집합
const ledger = new Map();
for (let f=0;;f+=1000){
  const { data } = await sb.from('catalog_registrations').select('megaload_user_id,status,channel_product_id').range(f,f+999);
  if(!data?.length) break;
  for (const r of data){
    if(!ledger.has(r.megaload_user_id)) ledger.set(r.megaload_user_id,{ok:0,ids:new Set()});
    const e=ledger.get(r.megaload_user_id);
    if(r.status==='succeeded'){ e.ok++; if(r.channel_product_id) e.ids.add(String(r.channel_product_id)); }
  }
  if(data.length<1000) break;
}

const { data: users } = await sb.from('megaload_users').select('id').limit(500);
const rows=[...ledger.entries()].filter(([,v])=>v.ok>0).sort((a,b)=>b[1].ok-a[1].ok);

console.log('계정      장부  쿠팡전체  우리등록분 상태별');
console.log('─'.repeat(84));
let sumLedger=0, sumOurs=0, sumLive=0, sumDeleted=0, blocked=[];
const statusAll = new Map();
for (const [uid, e] of rows){
  sumLedger += e.ok;
  let a;
  try { a = await getAuthenticatedAdapter(sb, uid, 'coupang'); }
  catch (err){ blocked.push([uid, String(err?.message||err).slice(0,44)]); continue; }

  const all = new Map();   // sellerProductId -> statusName
  let token = '1', pages = 0;
  try {
    while (pages < 80) {
      const r = await a.getProducts({ size: 100, nextToken: token });
      for (const it of r.items) all.set(String(it.sellerProductId), String(it.statusName||'?'));
      pages++;
      if (!r.nextToken || r.items.length === 0) break;
      token = r.nextToken;
    }
  } catch (err){ blocked.push([uid, String(err?.message||err).slice(0,44)]); continue; }

  // 우리가 올린 것만 골라 상태를 센다
  const mine = new Map();
  for (const id of e.ids){ const st = all.get(id); mine.set(st ?? '목록에없음', (mine.get(st ?? '목록에없음')||0)+1); }
  for (const [k,v] of mine) statusAll.set(k,(statusAll.get(k)||0)+v);
  const live = (mine.get('승인완료')||0) + (mine.get('승인대기중')||0) + (mine.get('부분승인완료')||0);
  const del  = (mine.get('상품삭제')||0);
  sumOurs += e.ids.size; sumLive += live; sumDeleted += del;
  const detail=[...mine.entries()].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${v}`).join(' · ');
  console.log(`${uid.slice(0,8)}  ${String(e.ok).padStart(4)}  ${String(all.size).padStart(7)}  ${detail}`);
}
console.log('─'.repeat(84));
console.log(`장부 성공 합계        : ${sumLedger}건`);
console.log(`쿠팡ID 보유(확인대상) : ${sumOurs}건`);
console.log(`살아있음(승인완료 등) : ${sumLive}건`);
console.log(`쿠팡에서 삭제됨       : ${sumDeleted}건`);
console.log(`전체 상태분포: ` + [...statusAll.entries()].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${v}`).join(' · '));
if (blocked.length){ console.log(`\nAPI 불가 계정 ${blocked.length}개:`); blocked.forEach(([u,m])=>console.log(`  ${u.slice(0,8)}  ${m}`)); }
