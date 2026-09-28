// 대리 등록 캠페인 실행 — 기본은 dry-run, --live 를 줘야 실제로 쿠팡에 올린다.
//
// 사용:
//   node test-bulk-campaign.mjs                 # dry-run, 자격되는 전 계정
//   node test-bulk-campaign.mjs --live --max=10 # 실제 등록, 최대 10건
import { readFileSync } from 'fs';
import { createJiti } from 'jiti';
import { createClient } from '@supabase/supabase-js';

for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const LIVE = process.argv.includes('--live');
const MAX = Number((process.argv.find((a) => a.startsWith('--max=')) || '--max=999').split('=')[1]);

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': new URL('./src', import.meta.url).pathname.replace(/^\//, '') },
});
const { checkEligibility, registerCatalogProductForUser } =
  await jiti.import('./src/lib/megaload/services/catalog-register.ts');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// 등록할 카탈로그 상품 1건 (가장 최근 변환분)
const { data: cats } = await supabase
  .from('catalog_products')
  .select('id, product_name, coupang_category_code, suggested_price')
  .eq('status', 'active').eq('is_visible', true)
  .order('created_at', { ascending: false }).limit(1);
if (!cats?.length) { console.error('등록 가능한 카탈로그 상품이 없습니다.'); process.exit(1); }
const product = cats[0];

const { data: users } = await supabase.from('megaload_users').select('id, profile_id').limit(500);

console.log(`모드      : ${LIVE ? '★ 실제 등록 (쿠팡에 올라갑니다)' : 'dry-run (쿠팡 호출 없음)'}`);
console.log(`상품      : ${product.product_name}`);
console.log(`카테고리  : ${product.coupang_category_code} · ${product.suggested_price.toLocaleString()}원`);
console.log(`대상 계정 : ${users.length}개 검사 · 최대 ${MAX}건 처리\n`);

let ok = 0, fail = 0, skip = 0, processed = 0;
const titles = [], mains = [], failures = [];

for (const u of users) {
  if (processed >= MAX) break;

  let elig;
  try { elig = await checkEligibility(supabase, u.id); }
  catch (e) { skip++; continue; }
  if (!elig.eligible) { skip++; continue; }

  // 계정마다 대표이미지를 다르게 — 캠페인이 하는 라운드로빈 배정과 동일
  const mainImageIndex = processed;
  processed++;

  try {
    const res = await registerCatalogProductForUser(supabase, {
      megaloadUserId: u.id,
      catalogProductId: product.id,
      eligibility: elig,
      dryRun: !LIVE,
      mainImageIndex,
    });

    if (res.ok) {
      ok++;
      if (res.preview) {
        titles.push(res.preview.displayName);
        mains.push(res.preview.mainImageUrl || res.preview.mainImage);
        console.log(`  ✔ ${u.id.slice(0, 8)}  ${res.preview.displayName}`);
        console.log(`             대표:${res.preview.mainImage}  |  ${res.preview.storyFirstLine}`);
      } else {
        console.log(`  ✔ ${u.id.slice(0, 8)}  등록완료 쿠팡상품ID=${res.channelProductId}`);
      }
    } else if (res.skipped) {
      skip++;
      console.log(`  - ${u.id.slice(0, 8)}  스킵(${res.skipReason})`);
    } else {
      fail++;
      failures.push(`${u.id.slice(0, 8)}: ${res.error?.slice(0, 150)}`);
      console.log(`  ✘ ${u.id.slice(0, 8)}  ${res.error?.slice(0, 110)}`);
    }
  } catch (e) {
    fail++;
    failures.push(`${u.id.slice(0, 8)}: ${String(e?.message || e).slice(0, 150)}`);
    console.log(`  ✘ ${u.id.slice(0, 8)}  예외 ${String(e?.message || e).slice(0, 110)}`);
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`성공 ${ok} · 실패 ${fail} · 스킵 ${skip}`);
if (titles.length) {
  console.log(`고유 제목      : ${new Set(titles).size} / ${titles.length}`);
  console.log(`고유 대표이미지: ${new Set(mains).size} / ${mains.length}`);
}
if (failures.length) {
  console.log('\n실패 상세:');
  failures.slice(0, 10).forEach((f) => console.log('  ' + f));
}
