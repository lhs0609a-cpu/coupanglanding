// 26계정을 과일 100개씩으로 채운다 — 품목을 고르게 섞어 42종을 고른다.
//   node topup100.mjs            # dry-run (쿠팡 쓰기 없음)
//   node topup100.mjs --live     # 실제 등록
import { readFileSync } from 'fs';
import { createJiti } from 'jiti';
import { createClient } from '@supabase/supabase-js';
for (const line of readFileSync('.env.local','utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g,'');
}
const LIVE = process.argv.includes('--live');
const TARGET = Number((process.argv.find(a=>a.startsWith('--target='))||'--target=100').split('=')[1]);
const DELAY = Number((process.argv.find(a=>a.startsWith('--delay='))||'--delay=300').split('=')[1]);
const sleep = ms => new Promise(r=>setTimeout(r,ms));

const jiti = createJiti(import.meta.url, { interopDefault:true, alias:{ '@': new URL('./src',import.meta.url).pathname.replace(/^\//,'') } });
const { checkEligibility, registerCatalogProductForUser } = await jiti.import('./src/lib/megaload/services/catalog-register.ts');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

const log = [];
const say = s => { log.push(s); };

// 1) 자격 계정
const { data: users } = await sb.from('megaload_users').select('id').limit(500);
const elig = [];
for (let i=0;i<users.length;i+=8) {
  const r = await Promise.all(users.slice(i,i+8).map(u=>checkEligibility(sb,u.id,{force:false}).catch(()=>null)));
  r.forEach(x=>{ if(x) elig.push(x); });
}
const accounts = elig.filter(e=>e.eligible);
say(`자격 통과 계정: ${accounts.length}`);

// 2) 계정별 현재 성공 건수
let hist=[],from=0;
for(;;){ const {data}=await sb.from('catalog_registrations').select('megaload_user_id,catalog_product_id,status').range(from,from+999);
  hist=hist.concat(data); if(data.length<1000) break; from+=1000; }
const succ = hist.filter(r=>r.status==='succeeded');
const cnt = {}; succ.forEach(r=>{ cnt[r.megaload_user_id]=(cnt[r.megaload_user_id]||0)+1; });
const need = accounts.map(a=>Math.max(0, TARGET-(cnt[a.megaloadUserId]||0)));
const maxNeed = Math.max(...need);
say(`계정당 보유: ${accounts.map(a=>cnt[a.megaloadUserId]||0).join(',')}`);
say(`가장 많이 필요한 계정 기준 추가 종수: ${maxNeed}`);

// 3) 등록 가능·미사용 상품을 품목별로 고르게
const usedSet = new Set(succ.map(r=>r.catalog_product_id));
const { data: cp } = await sb.from('catalog_products').select('id,product_name,options,notices,status,is_visible').limit(500);
const pool = cp.filter(p=>p.status==='active'&&p.is_visible!==false&&Array.isArray(p.options)&&p.options.length>0&&p.notices&&!usedSet.has(p.id));
const KW = [['참외',/참외/],['토마토',/토마토/],['키위',/키위|참다래/],['오렌지',/오렌지/],['멜론',/멜론|메론/],['포도',/포도|샤인/],['무화과',/무화과/],['감귤',/한라봉|천혜향|감귤|귤/],['딸기',/딸기/],['기타',/.*/]];
const buckets = new Map(KW.map(([n])=>[n,[]]));
for (const p of pool) { for (const [n,re] of KW) if (re.test(p.product_name)) { buckets.get(n).push(p); break; } }
const picked = [];                                   // 품목 라운드로빈 — 한 품목 도배 방지
for (let i=0; picked.length<maxNeed; i++) {
  let added=false;
  for (const [,list] of buckets) if (list[i]) { picked.push(list[i]); added=true; if(picked.length>=maxNeed) break; }
  if (!added) break;
}
const dist={}; picked.forEach(p=>{ for(const [n,re] of KW) if(re.test(p.product_name)){dist[n]=(dist[n]||0)+1;break;} });
say(`후보 풀 ${pool.length}종 → 선택 ${picked.length}종 · 분포 ${JSON.stringify(dist)}`);
say(`예상 등록 건수: 최대 ${picked.length*accounts.length}건 (이미 등록된 조합은 자동 스킵)`);
say(LIVE ? '\n*** LIVE — 실제로 쿠팡에 등록합니다 ***\n' : '\n[dry-run] 쿠팡 쓰기 없음\n');

// 4) 실행
let ok=0, skip=0, fail=0; const tally={}; const failEx=[]; const t0=Date.now();
const perAcc = {}; accounts.forEach(a=>perAcc[a.megaloadUserId]=cnt[a.megaloadUserId]||0);
let done=0; const total=picked.length*accounts.length;
for (const p of picked) {
  for (let ai=0; ai<accounts.length; ai++) {
    const a = accounts[ai];
    if (perAcc[a.megaloadUserId] >= TARGET) { done++; continue; }   // 이미 목표 도달
    const r = await registerCatalogProductForUser(sb, { megaloadUserId:a.megaloadUserId, catalogProductId:p.id, eligibility:a, dryRun:!LIVE, mainImageIndex:ai })
      .catch(e=>({ok:false,error:String(e?.message||e)}));
    done++;
    if (r.ok) { ok++; perAcc[a.megaloadUserId]++; }
    else if (r.skipped) { skip++; tally['skip:'+(r.skipReason||'?')]=(tally['skip:'+(r.skipReason||'?')]||0)+1; }
    else { fail++; const k='err:'+String(r.error).slice(0,60); tally[k]=(tally[k]||0)+1; if(failEx.length<5) failEx.push(String(r.error).slice(0,110)); }
    if (LIVE) await sleep(DELAY);
    if (done % 100 === 0) console.error(`  ${done}/${total} 성공 ${ok} 스킵 ${skip} 실패 ${fail}`);
  }
}
say(`\n결과: 성공 ${ok} · 스킵 ${skip} · 실패 ${fail} · ${((Date.now()-t0)/60000).toFixed(1)}분`);
say('사유: ' + JSON.stringify(tally));
say('계정별 최종 보유: ' + accounts.map(a=>perAcc[a.megaloadUserId]).join(','));
if (failEx.length) say('실패 샘플:\n  ' + failEx.join('\n  '));
console.error('\n===RESULT===\n' + log.join('\n') + '\n===END===');
