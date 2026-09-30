// 대리등록분 뒤처리 — 삭제 실행 후 남은 기록을 실제 쿠팡 상태와 맞춘다.
//
// 두 가지를 한다:
//   1) 쿠팡에 이미 없는 기록 → sh_products/catalog_registrations 를 'deleted' 로 표시.
//      안 하면 DB 만 보고 "아직 살아있다" 고 오판한다 (장부는 증거가 아니다).
//   2) 쿠팡에 남아 있는 것 → 옵션 판매상태를 실제로 조회해서, 판매중이면 판매중지.
//      쿠팡이 삭제를 거부하는 상품(승인완료)은 노출만이라도 끊는 게 최선이다.
//
// 키가 막힌 계정은 조회 자체가 안 되므로 아무것도 바꾸지 않는다 — 추정으로 표시하면 그게 또 거짓 장부가 된다.
//
// 사용:
//   node reconcile-bulk-registered.mjs            # 미리보기
//   node reconcile-bulk-registered.mjs --live     # 실제 반영
import { readFileSync, appendFileSync } from 'fs';
import { createJiti } from 'jiti';
import { createClient } from '@supabase/supabase-js';
for (const l of readFileSync('.env.local','utf-8').split(/\r?\n/)) { const m=l.match(/^([A-Z_]+)=(.*)$/); if(m) process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,''); }
const jiti = createJiti(import.meta.url, { interopDefault:true, alias:{ '@': new URL('./src', import.meta.url).pathname.replace(/^\//,'') } });
const { getAuthenticatedAdapter } = await jiti.import('./src/lib/megaload/adapters/factory.ts');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

const LIVE = process.argv.includes('--live');
const LOG = 'reconcile-bulk-registered.log';
const log = (s) => { console.log(s); try { appendFileSync(LOG, s+'\n'); } catch {} };
const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
async function withRetry(fn, label, tries=3){
  let last; for(let i=0;i<tries;i++){ try { return await fn(); } catch(e){ last=e;
    const m=String(e?.message||e);
    if(!/429|rate|timeout|ETIMEDOUT|ECONNRESET|socket|50[0-9]|Gateway/i.test(m) || i===tries-1) throw e;
    await sleep(1500*Math.pow(2,i)); } }
  throw last;
}

log(`\n=== 대리등록분 뒤처리 ${LIVE?'[실행]':'[미리보기]'} ${new Date().toISOString()} ===`);

// 남아 있는(active) 대리등록분을 계정별로
const rows=[];
for(let f=0;;f+=1000){
  const { data } = await sb.from('sh_products').select('megaload_user_id,coupang_product_id,status,raw_data').range(f,f+999);
  if(!data?.length)break; rows.push(...data); if(data.length<1000)break;
}
const pending = new Map();
for (const p of rows) {
  if (String(p.raw_data?.source||'')!=='admin_bulk') continue;
  if (p.status!=='active' || !p.coupang_product_id) continue;
  if(!pending.has(p.megaload_user_id)) pending.set(p.megaload_user_id,new Set());
  pending.get(p.megaload_user_id).add(String(p.coupang_product_id));
}
const { data: profs } = await sb.from('profiles').select('id, full_name').limit(2000);
const { data: mus } = await sb.from('megaload_users').select('id, profile_id').limit(1000);
const nameOf=(uid)=>{const u=(mus||[]).find(x=>x.id===uid); return String((profs||[]).find(p=>p.id===u?.profile_id)?.full_name||uid.slice(0,8));};

log(`뒤처리 대상 ${[...pending.values()].reduce((a,s)=>a+s.size,0)}건 / ${pending.size}계정`);

const tot = { marked:0, stopped:0, onSaleFound:0, stillLive:0, skipped:0, failed:0 };
for (const [uid, idSet] of pending) {
  const nm = nameOf(uid);
  let a;
  try { a = await getAuthenticatedAdapter(sb, uid, 'coupang'); }
  catch (e) { log(`\n[${nm}] 건너뜀 — 키 불가 (${idSet.size}건 그대로 둔다): ${String(e?.message||e).slice(0,50)}`); tot.skipped+=idSet.size; continue; }

  const live = new Map();
  let token='1', pages=0, err=null;
  try {
    while (pages<120){
      const r = await withRetry(()=>a.getProducts({ size:100, nextToken: token }), 'list');
      for (const it of r.items) live.set(String(it.sellerProductId), String(it.statusName||'?'));
      pages++; if(!r.nextToken || r.items.length===0) break; token=r.nextToken;
    }
  } catch(e){ err=String(e?.message||e); }
  if (err) { log(`\n[${nm}] 건너뜀 — 목록 조회 실패 (${idSet.size}건 그대로): ${err.slice(0,50)}`); tot.skipped+=idSet.size; continue; }

  const absent = [...idSet].filter(id=>!live.has(id));
  const present = [...idSet].filter(id=>live.has(id));
  log(`\n[${nm}] ${idSet.size}건 → 쿠팡에 없음 ${absent.length} · 남아있음 ${present.length}`);

  // 1) 쿠팡에 없는 것 = 실제로 사라짐 → DB 표시
  if (absent.length) {
    if (LIVE) {
      for (let i=0;i<absent.length;i+=100) {
        const chunk = absent.slice(i,i+100);
        await sb.from('sh_products').update({ status:'deleted' }).eq('megaload_user_id', uid).in('coupang_product_id', chunk);
        await sb.from('catalog_registrations').update({ status:'deleted' }).eq('megaload_user_id', uid).in('channel_product_id', chunk);
      }
      tot.marked += absent.length;
      log(`  DB 'deleted' 표시 ${absent.length}건`);
    } else log(`  (미리보기) DB 표시 대상 ${absent.length}건`);
  }

  // 2) 남아있는 것 = 삭제 거부된 것 → 실제 판매상태 확인 후 판매중지
  for (const id of present) {
    tot.stillLive++;
    try {
      const d = await withRetry(()=>a.getProductDetail(id), 'detail');
      const items = (d?.items||[]).filter(i=>i.vendorItemId);
      let onSale = 0;
      for (const it of items) {
        const inv = await withRetry(()=>a.getVendorItemInventory(it.vendorItemId), 'inv').catch(()=>null);
        if (inv?.onSale) {
          onSale++;
          if (LIVE) { try { await withRetry(()=>a.stopItemSale(it.vendorItemId), 'stop'); tot.stopped++; } catch(e){ tot.failed++; } }
        }
      }
      if (onSale) { tot.onSaleFound += onSale; log(`  ${id} [${live.get(id)}] 판매중 옵션 ${onSale}개 → ${LIVE?'판매중지 처리':'(미리보기)'}`); }
      await sleep(120);
    } catch(e){ tot.failed++; log(`  ${id} 조회 실패: ${String(e?.message||e).slice(0,60)}`); }
  }
}

log(`\n────────── 결과 ──────────`);
log(`DB 'deleted' 표시  : ${tot.marked}건 (쿠팡에 실제로 없는 기록)`);
log(`쿠팡에 남아있는 것 : ${tot.stillLive}건`);
log(`  판매중이던 옵션  : ${tot.onSaleFound}개 → 판매중지 ${tot.stopped}개`);
log(`키 불가로 손 안 댄 것: ${tot.skipped}건`);
log(`실패: ${tot.failed}건`);
