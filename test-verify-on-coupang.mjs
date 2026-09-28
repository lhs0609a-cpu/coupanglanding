// 대리등록 결과가 "우리 DB 기록"이 아니라 "쿠팡에 실제로 있는지"를 확인한다.
//
// catalog_registrations 는 우리가 쓴 장부다. 쿠팡이 받았다는 증거는 등록 응답으로 받은
// channel_product_id 뿐이고, 그 뒤 쿠팡에서 반려·삭제됐는지는 장부에 남지 않는다.
// 그래서 sellerProductId 를 쿠팡에 되물어 승인상태(statusName)를 확인한다.
//
// 사용: node test-verify-on-coupang.mjs [계정당표본=8]
import { readFileSync } from 'fs';
import { createJiti } from 'jiti';
import { createClient } from '@supabase/supabase-js';
for (const line of readFileSync('.env.local','utf-8').split(/\r?\n/)) { const m=line.match(/^([A-Z_]+)=(.*)$/); if(m) process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,''); }
const SAMPLE = Number(process.argv[2] || 8);
const jiti = createJiti(import.meta.url, { interopDefault:true, alias:{ '@': new URL('./src', import.meta.url).pathname.replace(/^\//,'') } });
const { getAuthenticatedAdapter } = await jiti.import('./src/lib/megaload/adapters/factory.ts');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

// 1) 장부 전수 집계
const per = new Map();
for (let f=0;;f+=1000){
  const { data } = await sb.from('catalog_registrations')
    .select('megaload_user_id,status,channel_product_id,created_at').range(f,f+999);
  if(!data?.length) break;
  for (const r of data){
    if(!per.has(r.megaload_user_id)) per.set(r.megaload_user_id,{ok:0,fail:0,withId:0,ids:[],first:null,last:null});
    const e=per.get(r.megaload_user_id);
    if(r.status==='succeeded'){ e.ok++;
      if(r.channel_product_id){ e.withId++; if(e.ids.length<200) e.ids.push(r.channel_product_id); }
      if(!e.first||r.created_at<e.first) e.first=r.created_at;
      if(!e.last||r.created_at>e.last) e.last=r.created_at;
    } else if(r.status==='failed') e.fail++;
  }
  if(data.length<1000) break;
}
const rows=[...per.entries()].sort((a,b)=>b[1].ok-a[1].ok);
const totalOk=rows.reduce((s,r)=>s+r[1].ok,0);
const totalId=rows.reduce((s,r)=>s+r[1].withId,0);
console.log(`━━ 장부(catalog_registrations) ━━`);
console.log(`계정 ${rows.length}개 · 성공 ${totalOk}건 · 쿠팡상품ID 보유 ${totalId}건 (ID 없는 성공 ${totalOk-totalId}건)`);
console.log(`기간 ${rows.map(r=>r[1].first).filter(Boolean).sort()[0]?.slice(0,10)} ~ ${rows.map(r=>r[1].last).filter(Boolean).sort().at(-1)?.slice(0,10)}`);

// 2) 쿠팡에 되물어 실제 존재·승인상태 확인
console.log(`\n━━ 쿠팡 실물 확인 (계정당 표본 ${SAMPLE}건) ━━`);
const statusTally=new Map(); let checked=0, missing=0, errAcc=0;
for (const [uid, e] of rows){
  if (e.ids.length===0) { console.log(`  ${uid.slice(0,8)}  장부 ${e.ok}건 · 쿠팡ID 0건 → 확인 불가`); continue; }
  let adapter;
  try { adapter = await getAuthenticatedAdapter(sb, uid, 'coupang'); }
  catch (err){ errAcc++; console.log(`  ${uid.slice(0,8)}  장부 ${String(e.ok).padStart(3)}건 · API 불가 (${String(err?.message||err).slice(0,40)})`); continue; }
  const step = Math.max(1, Math.floor(e.ids.length/SAMPLE));
  const pick = []; for(let i=0;i<e.ids.length && pick.length<SAMPLE;i+=step) pick.push(e.ids[i]);
  const found=[];
  for (const id of pick){
    const d = await adapter.getProductDetail(String(id));
    checked++;
    if(!d){ missing++; found.push('없음'); }
    else { const k=d.statusName||d.status||'?'; statusTally.set(k,(statusTally.get(k)||0)+1); found.push(k); }
  }
  const uniq=[...new Set(found)].join(', ');
  console.log(`  ${uid.slice(0,8)}  장부 ${String(e.ok).padStart(3)}건 · 표본 ${pick.length}건 → ${uniq}`);
}
console.log(`\n확인 ${checked}건 · 쿠팡에 없음 ${missing}건 · API 불가 계정 ${errAcc}개`);
console.log('승인상태 분포: ' + ([...statusTally.entries()].map(([k,v])=>`${k} ${v}`).join(' · ') || '(없음)'));
