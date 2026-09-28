import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
for (const line of readFileSync('.env.local','utf-8').split(/\r?\n/)) { const m=line.match(/^([A-Z_]+)=(.*)$/); if(m) process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,''); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const st=new Map(), fruitSt=new Map(), kindPending=new Map();
for (let f=0;;f+=1000){
  const {data}=await sb.from('sh_naver_sourcing_products').select('detail_status, category_path, price').range(f,f+999);
  if(!data?.length) break;
  for(const r of data){
    const s=String(r.detail_status??'(null)'); st.set(s,(st.get(s)||0)+1);
    const isFruit=String(r.category_path||'').includes('과일');
    if(isFruit){ fruitSt.set(s,(fruitSt.get(s)||0)+1);
      if(s!=='done'){ const k=String(r.category_path||'').split('>')[2]?.trim()||'(기타)'; kindPending.set(k,(kindPending.get(k)||0)+1); } }
  }
  if(data.length<1000) break;
}
console.log('detail_status 전체:', [...st.entries()].map(([k,v])=>`${k}=${v}`).join(' · '));
console.log('detail_status 과일:', [...fruitSt.entries()].map(([k,v])=>`${k}=${v}`).join(' · '));
console.log('\n과일 중 detail 미완 품목별:');
[...kindPending.entries()].sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`  ${String(v).padStart(5)}  ${k}`));
