// 관리자 대리 등록 대량 실행 — 카탈로그 상품 N건을 자격되는 전 계정에 등록한다.
//
// 계정끼리 제목·상세글·대표이미지가 절대 겹치지 않는다(옵션·수량은 원본 그대로).
// 중단해도 이어서 돌릴 수 있다 — 이미 등록된 (상품, 계정) 조합은 자동으로 건너뛴다.
//
// 사용:
//   node test-bulk-run.mjs                      # dry-run (쿠팡 호출 없음)
//   node test-bulk-run.mjs --live               # 실제 등록, 상품 100 × 전 계정
//   node test-bulk-run.mjs --live --products=20 --accounts=5
import { readFileSync } from 'fs';
import { createJiti } from 'jiti';
import { createClient } from '@supabase/supabase-js';

for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? Number(a.split('=')[1]) : d;
};
const LIVE = process.argv.includes('--live');
const MAX_PRODUCTS = arg('products', 100);
const MAX_ACCOUNTS = arg('accounts', 999);
const DELAY_MS = arg('delay', 300);          // 쿠팡 호출 간 간격
const ABORT_RATE = 0.3;                       // 실패율 30% 초과 시 중단
// 한 프로세스에서 처리할 최대 등록 수. jimp 가 이미지를 통째로 메모리에 펼쳐서
// 오래 돌리면 시스템 메모리가 바닥난다(실측: 500건 근처에서 OOM kill).
// 짧게 끊고 다시 실행하는 편이 안전하다 — 기등록분은 즉시 건너뛰므로 재시작이 싸다.
const RUN_LIMIT = arg('limit', 300);
// 계정당 누적 등록 상한. 이미 이 수만큼 가진 계정은 더 올리지 않는다.
// (0 이면 상한 없음)
const PER_ACCOUNT = arg('per-account', 0);

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': new URL('./src', import.meta.url).pathname.replace(/^\//, '') },
});
const { checkEligibility, registerCatalogProductForUser } =
  await jiti.import('./src/lib/megaload/services/catalog-register.ts');
const { isInSeason } = await jiti.import('./src/lib/megaload/services/fruit-season.ts');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) 등록할 카탈로그 상품 — 카테고리별로 고르게 고른다.
//    created_at 순으로 앞에서 자르면 한 품목만 뽑힌다(실측: 100건 전부 참외).
//    셀러 한 명이 같은 품목만 100개 올리면 쿠팡 중복·어뷰징 필터에 걸린다.
const { data: allProducts } = await supabase
  .from('catalog_products')
  .select('id, product_name, coupang_category_code, suggested_price, in_stock, fruit_kind')
  .eq('status', 'active').eq('is_visible', true)
  .order('created_at', { ascending: true })
  .limit(5000);
if (!allProducts?.length) { console.error('등록할 카탈로그 상품이 없습니다. 먼저 import 를 돌리세요.'); process.exit(1); }

// 필수 구매옵션("농산물 중량")을 채울 수 없는 상품은 계정마다 페이로드를 다 만든 뒤에야
// 걸러진다 — 25계정이면 25초를 헛돈다. 상품 단위로 미리 제외한다.
// 중량 근거는 상품명의 kg/g 표기다(빌더가 여기서 추출한다).
const WEIGHT_RE = /[0-9]+(\.[0-9]+)?\s*(kg|g)/i;
// 올릴 품목은 fruit-season.ts 의 화이트리스트가 정한다(사용자 확정 2026-09-28).
// 블랙리스트였을 때 멜론 45건이 9월 말까지 조용히 남아 있었다 — 모르는 품목은 안 올린다.

const beforeFilter = allProducts.length;
const noWeight = allProducts.filter((p) => !WEIGHT_RE.test(p.product_name || '')).length;
const soldOutOrUnknown = allProducts.filter((p) => p.in_stock !== true).length;
const offSeason = allProducts.filter((p) => !isInSeason(p.fruit_kind)).length;

const usable = allProducts.filter((p) =>
  WEIGHT_RE.test(p.product_name || '')          // 쿠팡 필수 구매옵션(중량)을 채울 수 있어야 한다
  && p.in_stock === true                         // 품절이거나 재고를 알 수 없으면 올리지 않는다
  && isInSeason(p.fruit_kind),                   // 제철·연중 품목만
);
if (usable.length < beforeFilter) {
  console.log(`제외: 중량없음 ${noWeight} · 품절/재고불명 ${soldOutOrUnknown} · 비시즌 ${offSeason} → 대상 ${usable.length}/${beforeFilter}건`);
}
allProducts.length = 0;
allProducts.push(...usable);

const catBuckets = new Map();
for (const p of allProducts) {
  const k = p.coupang_category_code || '기타';
  if (!catBuckets.has(k)) catBuckets.set(k, []);
  catBuckets.get(k).push(p);
}
const bucketList = [...catBuckets.values()].sort((a, b) => b.length - a.length);
const products = [];
for (let i = 0; products.length < MAX_PRODUCTS; i++) {
  let added = false;
  for (const list of bucketList) {
    if (list[i]) { products.push(list[i]); added = true; }
    if (products.length >= MAX_PRODUCTS) break;
  }
  if (!added) break;   // 모든 버킷 소진
}

// 2) 자격 있는 계정만 (물류·연락처·WING 전부 확인)
const { data: allUsers } = await supabase.from('megaload_users').select('id').limit(500);
const eligible = [];
for (const u of allUsers || []) {
  if (eligible.length >= MAX_ACCOUNTS) break;
  try {
    const e = await checkEligibility(supabase, u.id);
    if (e.eligible) eligible.push(e);
  } catch { /* 자격 없음 */ }
}
if (eligible.length === 0) { console.error('등록 가능한 계정이 없습니다.'); process.exit(1); }

// 3) 이미 등록된 (상품, 계정) 조합을 미리 읽어둔다.
//    이게 없으면 재실행 때 스킵 한 건마다 DB 를 두 번씩 때린다(실측: 스킵 2,678건에 35분 소모).
//    PostgREST 는 한 번에 1000행까지만 주므로 페이지로 끊어 가져온다.
const doneKeys = new Set();
const accountCount = new Map();   // 계정별 현재 성공 등록 수
const failCount = new Map();      // 계정별 누적 실패 수
for (let from = 0; ; from += 1000) {
  const { data: page } = await supabase
    .from('catalog_registrations')
    .select('catalog_product_id, megaload_user_id, status')
    .range(from, from + 999);
  if (!page || page.length === 0) break;
  for (const r of page) {
    if (r.status !== 'failed') doneKeys.add(`${r.catalog_product_id}|${r.megaload_user_id}`);
    if (r.status === 'succeeded') accountCount.set(r.megaload_user_id, (accountCount.get(r.megaload_user_id) || 0) + 1);
    if (r.status === 'failed') failCount.set(r.megaload_user_id, (failCount.get(r.megaload_user_id) || 0) + 1);
  }
  if (page.length < 1000) break;
}
console.log(`기등록 조합 ${doneKeys.size}건 — 이번 실행에서 건너뜁니다.
`);

// 성공이 한 건도 없는데 실패만 쌓인 계정은 계정 설정 문제다(실측: brandId 미등록 →
// 무엇을 올려도 같은 이유로 거부). 회차마다 프로세스가 새로 뜨는 구조라 실행 중 제외
// (droppedAccounts)만으로는 회차당 5건씩 영구히 헛돈다 — 시작할 때 아예 뺀다.
const broken = eligible.filter((e) =>
  (accountCount.get(e.megaloadUserId) || 0) === 0 && (failCount.get(e.megaloadUserId) || 0) >= 5,
);
if (broken.length) {
  for (const b of broken) {
    console.log(`  ⓘ ${b.megaloadUserId.slice(0, 8)} 제외 — 성공 0 / 실패 ${failCount.get(b.megaloadUserId)}건, 계정 설정 문제로 판단`);
  }
  const brokenIds = new Set(broken.map((b) => b.megaloadUserId));
  eligible.splice(0, eligible.length, ...eligible.filter((e) => !brokenIds.has(e.megaloadUserId)));
  if (eligible.length === 0) { console.error('남은 계정이 없습니다.'); process.exit(1); }
}

// 실제로 처리할 건수 = 전체 조합에서 기등록분을 뺀 것. ETA 가 맞아야 판단이 선다.
let total = 0;
for (const p of products) {
  for (const e of eligible) if (!doneKeys.has(`${p.id}|${e.megaloadUserId}`)) total++;
}
const allCombos = products.length * eligible.length;
console.log(`모드    : ${LIVE ? '★ 실제 등록 — 쿠팡에 올라갑니다' : 'dry-run (쿠팡 호출 없음)'}`);
console.log(`상품    : ${products.length}건`);
console.log(`계정    : ${eligible.length}개`);
console.log(`총 조합 : ${allCombos}건 (기등록 ${allCombos - total}건 제외)`);
if (PER_ACCOUNT > 0) {
  // 대상 계정들의 현재 보유량만 본다 — 초기값 0 을 섞으면 "최소 0" 으로 잘못 보인다.
  const cur = eligible.map((e) => accountCount.get(e.megaloadUserId) || 0);
  console.log(`계정당 상한: ${PER_ACCOUNT}건 (현재 최소 ${Math.min(...cur)} / 최대 ${Math.max(...cur)} / 남은 ${cur.reduce((s, n) => s + Math.max(0, PER_ACCOUNT - n), 0)}건)`);
}
console.log(`처리 대상: ${total}건  (건당 간격 ${DELAY_MS}ms · 이번 실행 한도 ${RUN_LIMIT}건)`);
console.log(`예상    : 약 ${((total * (LIVE ? 4500 : 800) + total * DELAY_MS) / 3600000).toFixed(1)}시간\n`);

let ok = 0, fail = 0, skip = 0, doneN = 0;
let preSkipped = 0;
const consecFail = new Map();      // 계정별 연속 실패 횟수
const droppedAccounts = new Set(); // 이번 실행에서 제외된 계정
const failSamples = [];
const t0 = Date.now();
let aborted = false;

// 상품 단위로 전 계정을 돌린다 — 중간에 멈춰도 계정들이 고르게 채워진다.
outer:
for (const p of products) {
  for (let ai = 0; ai < eligible.length; ai++) {
    const e = eligible[ai];
    if (droppedAccounts.has(e.megaloadUserId)) continue;
    // 이미 등록된 조합은 서비스 호출 없이 즉시 건너뛴다.
    if (doneKeys.has(`${p.id}|${e.megaloadUserId}`)) { skip++; preSkipped++; continue; }
    // 계정당 상한 도달 — 더 올리지 않는다.
    if (PER_ACCOUNT > 0 && (accountCount.get(e.megaloadUserId) || 0) >= PER_ACCOUNT) { skip++; preSkipped++; continue; }
    doneN++;
    try {
      const res = await registerCatalogProductForUser(supabase, {
        megaloadUserId: e.megaloadUserId,
        catalogProductId: p.id,
        eligibility: e,
        dryRun: !LIVE,
        mainImageIndex: ai,        // 계정마다 다른 원본에서 변형을 만든다
      });
      if (res.ok) {
        ok++;
        accountCount.set(e.megaloadUserId, (accountCount.get(e.megaloadUserId) || 0) + 1);
        consecFail.set(e.megaloadUserId, 0);
        if (global.gc) global.gc();
      }
      else if (res.skipped) skip++;
      else {
        fail++;
        const c = (consecFail.get(e.megaloadUserId) || 0) + 1;
        consecFail.set(e.megaloadUserId, c);
        // 계정 설정 문제(brandId 미등록 등)는 몇 번을 시도해도 같은 이유로 실패한다.
        // 100번 헛돌지 않도록 이번 실행에서는 그 계정을 뺀다.
        if (c >= 5 && !droppedAccounts.has(e.megaloadUserId)) {
          droppedAccounts.add(e.megaloadUserId);
          console.log(`  ⓘ ${e.megaloadUserId.slice(0, 8)} 연속 ${c}회 실패 — 이번 실행에서 제외합니다.`);
        }
        if (failSamples.length < 8) failSamples.push(`${e.megaloadUserId.slice(0, 8)} / ${p.product_name.slice(0, 22)}: ${String(res.error).slice(0, 110)}`);
      }
    } catch (err) {
      fail++;
      if (failSamples.length < 8) failSamples.push(`${e.megaloadUserId.slice(0, 8)}: ${String(err?.message || err).slice(0, 110)}`);
    }

    if (LIVE) await sleep(DELAY_MS);

    if (doneN % 25 === 0 || doneN === total) {
      const el = (Date.now() - t0) / 1000;
      const rate = doneN / el;
      const eta = (total - doneN) / rate / 60;
      console.log(`  ${doneN}/${total}  성공 ${ok} 실패 ${fail} 스킵 ${skip}  |  ${rate.toFixed(2)}건/초  남은 ${eta.toFixed(0)}분`);
    }

    if (ok >= RUN_LIMIT) {
      console.log(`
이번 실행 한도 ${RUN_LIMIT}건 도달 — 메모리 정리를 위해 여기서 끊습니다.`);
      aborted = false;
      break outer;
    }

    // 안전장치 — 실패가 쏟아지면 계속 밀어넣지 않는다.
    //   재실행 때는 앞부분이 전부 스킵이라 실패 몇 건만으로 비율이 100% 가 된다.
    //   그래서 "충분히 시도했을 때"만 비율을 본다(실측: 스킵 100 + 실패 20 에 오판 중단).
    const attempted = ok + fail;
    if (attempted >= 50 && fail >= 20 && fail / attempted > ABORT_RATE) {
      console.log(`\n⚠ 실패율 ${(fail / attempted * 100).toFixed(0)}% — 임계치 ${ABORT_RATE * 100}% 초과로 중단합니다.`);
      aborted = true;
      break outer;
    }
  }
}

const el = (Date.now() - t0) / 1000;
console.log(`\n${'='.repeat(72)}`);
console.log(`${aborted ? '중단됨' : '완료'} — 성공 ${ok} · 실패 ${fail} · 스킵 ${skip}(사전제외 ${preSkipped}) · ${(el / 60).toFixed(1)}분`);
if (failSamples.length) {
  console.log('\n실패 샘플:');
  failSamples.forEach((f) => console.log('  ' + f));
}
console.log('\n중단됐거나 남은 작업이 있으면 같은 명령을 다시 실행하면 이어서 진행됩니다.');
