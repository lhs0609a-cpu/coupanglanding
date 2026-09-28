// 계정별 대리 등록 이력 — 어느 계정에 어떤 상품을 올렸는지 확인한다.
// catalog_registrations 가 정본이므로 여기만 보면 된다.
//
// 사용:
//   node test-registration-report.mjs              # 계정별 집계
//   node test-registration-report.mjs <계정8자리>   # 그 계정의 상품 목록
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const filter = process.argv[2];

// PostgREST 는 한 번에 1000행까지만 준다 — limit 을 키워도 잘린다.
// 페이지로 끊어 전부 가져와야 계정별 수치와 중복 감사가 정확해진다.
const regs = [];
for (let from = 0; ; from += 1000) {
  const { data: page } = await supabase
    .from('catalog_registrations')
    .select('megaload_user_id, catalog_product_id, channel_product_id, display_name, status, registered_at')
    .range(from, from + 999);
  if (!page || page.length === 0) break;
  regs.push(...page);
  if (page.length < 1000) break;
}

const prods = [];
for (let from = 0; ; from += 1000) {
  const { data: page } = await supabase
    .from('catalog_products')
    .select('id, product_name, coupang_category_code, raw_metadata')
    .range(from, from + 999);
  if (!page || page.length === 0) break;
  prods.push(...page);
  if (page.length < 1000) break;
}
const pMap = new Map(prods.map((p) => [p.id, p]));

if (filter) {
  const rows = regs.filter((r) => r.megaload_user_id.startsWith(filter));
  console.log(`계정 ${filter} — 등록 ${rows.length}건\n`);
  rows
    .sort((a, b) => String(a.registered_at).localeCompare(String(b.registered_at)))
    .forEach((r, i) => {
      const p = pMap.get(r.catalog_product_id);
      const cat = (p?.raw_metadata?.naver_category_path || '').split('>').pop()?.trim() || '';
      console.log(`${String(i + 1).padStart(4)}. [${r.status}] ${cat.padEnd(8)} ${String(r.display_name || p?.product_name || '').slice(0, 52)}`);
      if (r.channel_product_id) console.log(`        쿠팡ID ${r.channel_product_id}`);
    });
  process.exit(0);
}

// 계정별 집계
const byUser = new Map();
for (const r of regs) {
  if (!byUser.has(r.megaload_user_id)) byUser.set(r.megaload_user_id, { ok: 0, fail: 0, cats: new Map() });
  const b = byUser.get(r.megaload_user_id);
  if (r.status === 'succeeded') b.ok++; else b.fail++;
  const p = pMap.get(r.catalog_product_id);
  const cat = (p?.raw_metadata?.naver_category_path || '').split('>').pop()?.trim() || '기타';
  b.cats.set(cat, (b.cats.get(cat) || 0) + 1);
}

console.log(`계정 ${byUser.size}개 · 등록 이력 ${(regs || []).length}건\n`);
console.log('계정        성공  실패   품목 분포');
console.log('-'.repeat(78));
[...byUser.entries()]
  .sort((a, b) => b[1].ok - a[1].ok)
  .forEach(([uid, b]) => {
    const dist = [...b.cats.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`).join(' / ');
    console.log(`${uid.slice(0, 8)}  ${String(b.ok).padStart(5)} ${String(b.fail).padStart(5)}   ${dist}`);
  });

// 제목 중복 감사 — 같은 상품을 여러 셀러에게 올렸을 때 제목이 겹치면 안 된다.
const titlesByProduct = new Map();
for (const r of regs) {
  if (r.status !== 'succeeded' || !r.display_name) continue;
  if (!titlesByProduct.has(r.catalog_product_id)) titlesByProduct.set(r.catalog_product_id, []);
  titlesByProduct.get(r.catalog_product_id).push(r.display_name);
}
let dup = 0, checked = 0;
for (const [, list] of titlesByProduct) {
  checked += list.length;
  dup += list.length - new Set(list).size;
}
console.log(`\n제목 중복 감사: ${dup}건 / ${checked}건 ${dup === 0 ? '(중복 없음)' : '⚠ 중복 발견'}`);
