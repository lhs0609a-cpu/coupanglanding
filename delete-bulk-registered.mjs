// 관리자 대리 등록분을 쿠팡 계정에서 삭제한다. 셀러 본인 상품은 절대 건드리지 않는다.
//
// 삭제 대상 정본: sh_products(raw_data.source='admin_bulk').coupang_product_id ∪ catalog_registrations(성공).channel_product_id
//   장부(catalog_registrations)만 쓰면 안 된다 — (catalog_product_id, megaload_user_id, channel) 유니크 upsert 라
//   같은 상품을 재등록하면 이전 쿠팡ID가 덮어써져 사라진다. 실측 2026-09-29: 장부 8,074 vs 실제 8,592 (518건 누락).
//
// 안전장치:
//   1) 계정별로 그 계정 키로만 삭제한다 (다른 계정에 손 안 감).
//   2) 쿠팡 목록을 먼저 받아 "우리 ID 집합 ∩ 실제 존재" 만 대상으로 삼는다.
//   3) 셀러 본인 상품ID와 교집합이 0인 것을 사전 확인했다 (30,491 vs 8,592 → 0).
//   4) 판매중이면 옵션 전부 판매중지 후 삭제 (쿠팡이 판매중 상품 삭제를 막는 경우 대비).
//
// 사용:
//   node delete-bulk-registered.mjs                      # 미리보기 (아무것도 안 지움)
//   node delete-bulk-registered.mjs --live               # 실제 삭제
//   node delete-bulk-registered.mjs --live --limit=10     # 계정당 10건만 (검증용)
//   node delete-bulk-registered.mjs --live --user=46623ab0 # 특정 계정만
import { readFileSync, appendFileSync } from 'fs';
import { createJiti } from 'jiti';
import { createClient } from '@supabase/supabase-js';
for (const l of readFileSync('.env.local','utf-8').split(/\r?\n/)) { const m=l.match(/^([A-Z_]+)=(.*)$/); if(m) process.env[m[1]]=m[2].trim().replace(/^["']|["']$/g,''); }
const jiti = createJiti(import.meta.url, { interopDefault:true, alias:{ '@': new URL('./src', import.meta.url).pathname.replace(/^\//,'') } });
const { getAuthenticatedAdapter } = await jiti.import('./src/lib/megaload/adapters/factory.ts');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

const LIVE = process.argv.includes('--live');
const LIMIT = Number((process.argv.find(a=>a.startsWith('--limit='))||'').split('=')[1] || 0);
const ONLY = (process.argv.find(a=>a.startsWith('--user='))||'').split('=')[1] || '';
const LOG = 'delete-bulk-registered.log';
const SLEEP_MS = Number((process.argv.find(a=>a.startsWith('--delay='))||'').split('=')[1] || 120);
const sleep = (ms) => new Promise(r=>setTimeout(r,ms));

/**
 * 쿠팡 호출 재시도 — 6,600건이면 API 호출이 2만 번 가까이 된다.
 * 429(rate limit)·5xx·네트워크 오류는 잠깐 쉬고 다시 걸면 대개 통과한다.
 * 이걸 안 하면 한 번의 rate limit 폭탄이 수천 건을 실패로 기록해버린다.
 */
async function withRetry(fn, label, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      const retriable = /429|rate|too many|timeout|ETIMEDOUT|ECONNRESET|socket|50[0-9]|Gateway/i.test(msg);
      if (!retriable || i === tries - 1) throw e;
      const wait = 1500 * Math.pow(2, i);
      log(`  대기 ${wait}ms 후 재시도 (${label}): ${msg.slice(0, 70)}`);
      await sleep(wait);
    }
  }
  throw lastErr;
}
const log = (s) => { console.log(s); try { appendFileSync(LOG, s+'\n'); } catch {} };

log(`\n=== 대리등록분 삭제 ${LIVE?'[실행]':'[미리보기]'} ${new Date().toISOString()} ===`);

// 1) 우리가 올린 쿠팡ID — 계정별
const ourIds = new Map();   // uid -> Set(channelProductId)
const add = (uid, id) => { if(!uid||!id) return; if(!ourIds.has(uid)) ourIds.set(uid,new Set()); ourIds.get(uid).add(String(id)); };
for (let f=0;;f+=1000){
  const { data } = await sb.from('sh_products').select('megaload_user_id,coupang_product_id,raw_data').range(f,f+999);
  if(!data?.length) break;
  for (const p of data) if (String(p.raw_data?.source||'')==='admin_bulk') add(p.megaload_user_id, p.coupang_product_id);
  if(data.length<1000) break;
}
for (let f=0;;f+=1000){
  const { data } = await sb.from('catalog_registrations').select('megaload_user_id,status,channel_product_id').range(f,f+999);
  if(!data?.length) break;
  for (const r of data) if (r.status==='succeeded') add(r.megaload_user_id, r.channel_product_id);
  if(data.length<1000) break;
}
// 안전 재확인 — 셀러 본인 상품과 겹치면 즉시 중단
const selfIds = new Set();
for (let f=0;;f+=1000){
  const { data } = await sb.from('sh_products').select('coupang_product_id,raw_data').range(f,f+999);
  if(!data?.length) break;
  for (const p of data) if (String(p.raw_data?.source||'')!=='admin_bulk' && p.coupang_product_id) selfIds.add(String(p.coupang_product_id));
  if(data.length<1000) break;
}
let allOur = 0; const overlap = [];
for (const s of ourIds.values()) for (const id of s) { allOur++; if (selfIds.has(id)) overlap.push(id); }
log(`삭제 대상 후보 ${allOur}건 / ${ourIds.size}계정 · 셀러 본인 상품 ${selfIds.size}건`);
if (overlap.length) { log(`중단: 본인 상품과 겹치는 ID ${overlap.length}건 — ${overlap.slice(0,5).join(', ')}`); process.exit(1); }
log('겹침 0건 확인 — 본인 상품은 건드리지 않는다.');

const { data: profs } = await sb.from('profiles').select('id, full_name').limit(2000);
const { data: mus } = await sb.from('megaload_users').select('id, profile_id').limit(1000);
const nameOf = (uid) => { const u=(mus||[]).find(x=>x.id===uid); return String((profs||[]).find(p=>p.id===u?.profile_id)?.full_name || uid.slice(0,8)); };

const tot = { accounts:0, skipped:0, absent:0, deleted:0, stopped:0, failed:0 };
const failures = [];

for (const [uid, idSet] of ourIds) {
  if (ONLY && !uid.startsWith(ONLY)) continue;
  const nm = nameOf(uid);
  let a;
  try { a = await getAuthenticatedAdapter(sb, uid, 'coupang'); }
  catch (e) { log(`\n[${nm}] 건너뜀 — 키 불가: ${String(e?.message||e).slice(0,60)}`); tot.skipped++; continue; }

  // 쿠팡 목록 전량 → 실제 존재하는 것만 대상
  const live = new Map();
  let token='1', pages=0, listErr=null;
  try {
    while (pages < 120) {
      const r = await withRetry(() => a.getProducts({ size:100, nextToken: token }), 'list');
      for (const it of r.items) live.set(String(it.sellerProductId), String(it.statusName||'?'));
      pages++;
      if (!r.nextToken || r.items.length===0) break;
      token = r.nextToken;
    }
  } catch (e) { listErr = String(e?.message||e); }
  if (listErr) { log(`\n[${nm}] 건너뜀 — 목록 조회 실패: ${listErr.slice(0,60)}`); tot.skipped++; continue; }

  let targets = [...idSet].filter(id => live.has(id));
  const absent = idSet.size - targets.length;
  tot.absent += absent;
  if (LIMIT) targets = targets.slice(0, LIMIT);
  tot.accounts++;
  log(`\n[${nm}] 우리 ${idSet.size}건 · 쿠팡 전체 ${live.size} · 실제 존재 ${idSet.size-absent} · 이미 없음 ${absent} → 이번 대상 ${targets.length}`);
  if (!LIVE) { log(`  (미리보기 — 삭제하지 않음) 예: ${targets.slice(0,3).join(', ')}`); continue; }

  for (const id of targets) {
    const st = live.get(id);
    try {
      // 판매중이면 옵션 전부 판매중지 후 삭제
      if (/승인완료|부분승인완료|판매중/.test(st)) {
        try {
          const d = await withRetry(() => a.getProductDetail(id), 'detail');
          for (const it of (d?.items||[])) if (it.vendorItemId) {
            try { await withRetry(() => a.stopItemSale(it.vendorItemId), 'stop'); tot.stopped++; } catch {}
          }
        } catch {}
      }
      await withRetry(() => a.deleteProduct(id), 'delete');
      if (SLEEP_MS) await sleep(SLEEP_MS);
      tot.deleted++;
      await sb.from('sh_products').update({ status:'deleted' }).eq('megaload_user_id', uid).eq('coupang_product_id', id);
      await sb.from('catalog_registrations').update({ status:'deleted' }).eq('megaload_user_id', uid).eq('channel_product_id', id);
      if (tot.deleted % 50 === 0) log(`  ... 누적 삭제 ${tot.deleted}건`);
    } catch (e) {
      const msg = String(e?.message||e).slice(0,120);
      tot.failed++; failures.push(`${nm} ${id} [${st}] ${msg}`);
      if (failures.length <= 10) log(`  실패 ${id} [${st}] ${msg}`);
    }
  }
}

log(`\n────────── 결과 ──────────`);
log(`처리 계정 ${tot.accounts} · 건너뜀 ${tot.skipped}`);
log(`쿠팡에 이미 없던 것 ${tot.absent}건`);
log(`삭제 성공 ${tot.deleted}건 · 판매중지 처리 ${tot.stopped}옵션 · 실패 ${tot.failed}건`);
if (failures.length) {
  log(`\n실패 사유 상위:`);
  const byMsg = new Map();
  for (const f of failures) { const k=f.split('] ').pop().slice(0,60); byMsg.set(k,(byMsg.get(k)||0)+1); }
  [...byMsg.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).forEach(([k,v])=>log(`  ${v}건  ${k}`));
}
