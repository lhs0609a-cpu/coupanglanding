// 네이버 소싱 상품 → catalog_products 대량 변환 (과일 위주)
//
// sh_naver_sourcing_products 의 이미지는 네이버 CDN URL 이라 쿠팡에 그대로 못 넘긴다
// (기존 등록 경로가 pstatic.net 을 비상품 이미지로 차단). 받아서 Supabase Storage 로
// 옮긴 뒤 카탈로그 행으로 만든다.
//
// 고시정보(detail.notice)와 옵션(detail.options)을 반드시 같이 옮긴다 —
// 없으면 빌더가 속성을 "상세페이지 참조" 로 채우고 쿠팡이 등록을 거부한다.
//
// 사용: node test-import-sourcing-to-catalog.mjs [상품수=100]
import { readFileSync } from 'fs';
import { createJiti } from 'jiti';
import { createClient } from '@supabase/supabase-js';

for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': new URL('./src', import.meta.url).pathname.replace(/^\//, '') },
});
const { matchByNaverCategory } = await jiti.import('./src/lib/megaload/services/category-matcher.ts');
const { isInSeason, fruitKindFromCategoryPath } = await jiti.import('./src/lib/megaload/services/fruit-season.ts');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const WANT = Number(process.argv[2] || 100);
// 카테고리당 상한 — 한 품목만 쓸어오면 셀러 계정이 같은 상품 반복으로 도배된다.
// (실측: 최근 수집순으로 100건 가져왔더니 100건 전부 참외였다)
const PER_CAT = Number((process.argv.find((a) => a.startsWith('--per-cat=')) || '--per-cat=0').split('=')[1])
  || Math.max(5, Math.ceil(WANT / 5));
const MAX_MAIN = 3;
const MAX_DETAIL = 6;

// 프로젝트 표준 마진 구간 (useBulkRegisterActions.ts 의 brackets 와 동일)
const BRACKETS = [
  [100, 5000, 450], [5001, 10000, 240], [10001, 20000, 160], [20001, 30000, 115],
  [30001, 50000, 100], [50001, 80000, 90], [80001, 150000, 80], [150001, 200000, 60],
  [200001, 300000, 55], [300001, 9999999, 70],
];
function sellingPrice(cost) {
  const b = BRACKETS.find(([lo, hi]) => cost >= lo && cost <= hi) || BRACKETS.at(-1);
  return Math.ceil((cost * (1 + b[2] / 100)) / 100) * 100;
}

// 과일 위주 — 소싱 재고의 975/977 이 신선식품>과일이다.
const { data: rows, error } = await supabase
  .from('sh_naver_sourcing_products')
  .select('id, product_no, title, price, naver_category_id, category_path, images, detail')
  .eq('detail_status', 'done')
  .gt('price', 0)
  .not('detail->notice', 'is', null)
  .like('category_path', '%과일%')
  .limit(4000);
if (error) { console.error('소싱 조회 실패:', error.message); process.exit(1); }

// 이미 변환된 것 제외 (재실행 가능하게)
const { data: done } = await supabase.from('catalog_products').select('drive_folder_id').limit(5000);
const already = new Set((done || []).map((d) => d.drive_folder_id));

// 등록될 수 없는 후보는 변환하지 않는다 — 이미지를 받아 Storage 에 올리는 게 가장 비싼
// 단계인데, 비시즌·품절·중량표기 없는 상품은 등록 스크립트가 어차피 전부 걸러낸다.
//   중량: 쿠팡 필수 구매옵션("농산물 중량")을 상품명에서 뽑는다.
//   재고: 소싱 옵션 중 soldOut=false 가 하나도 없으면 품절.
//   시즌: fruit-season.ts 화이트리스트 (사용자 확정 2026-09-28)
const WEIGHT_RE = /[0-9]+(\.[0-9]+)?\s*(kg|g)/i;
const beforeSeason = rows.length;
const inStockOf = (r) => {
  const o = r.detail?.options;
  return Array.isArray(o) && o.length > 0 ? o.some((x) => x?.soldOut === false) : null;
};
const passing = rows.filter((r) =>
  isInSeason(fruitKindFromCategoryPath(r.category_path))
  && WEIGHT_RE.test(r.title || '')
  && inStockOf(r) === true,
);
const dropSeason = rows.filter((r) => !isInSeason(fruitKindFromCategoryPath(r.category_path))).length;
const dropWeight = rows.filter((r) => !WEIGHT_RE.test(r.title || '')).length;
const dropStock = rows.filter((r) => inStockOf(r) !== true).length;
console.log(`후보 필터: 비시즌 ${dropSeason} · 중량없음 ${dropWeight} · 품절/불명 ${dropStock} → 통과 ${passing.length}/${beforeSeason}건`);
rows.length = 0;
rows.push(...passing);

// 카테고리별로 고르게 섞는다 — 같은 품목이 연달아 나오지 않도록 라운드로빈 재배열.
const byCat = new Map();
for (const r of rows) {
  const k = r.category_path || '기타';
  if (!byCat.has(k)) byCat.set(k, []);
  byCat.get(k).push(r);
}
const buckets = [...byCat.entries()].sort((a, b) => b[1].length - a[1].length);
const ordered = [];
for (let i = 0; i < PER_CAT; i++) {
  for (const [, list] of buckets) if (list[i]) ordered.push(list[i]);
}
rows.length = 0;
rows.push(...ordered);

console.log(`과일 소싱 후보 ${rows.length}건 (카테고리 ${buckets.length}종, 카테고리당 최대 ${PER_CAT})`);
console.log(`기존 카탈로그 ${already.size}건 -> 최대 ${WANT}건 신규 변환`);
console.log('  재고: ' + buckets.slice(0, 8).map(([k, v]) => k.split('>').pop().trim() + ' ' + v.length).join(' / '));
console.log('');

async function fetchImage(url) {
  const res = await fetch(url, {
    headers: { Referer: 'https://smartstore.naver.com/', 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`too small (${buf.length}B)`);
  return { buf, mime: res.headers.get('content-type') || 'image/jpeg' };
}

let made = 0, skipped = 0, failed = 0;
const t0 = Date.now();

for (const r of rows) {
  if (made >= WANT) break;

  const driveKey = `naver:${r.product_no}`;
  if (already.has(driveKey)) { skipped++; continue; }

  const cat = r.naver_category_id ? matchByNaverCategory(String(r.naver_category_id)) : null;
  if (!cat?.categoryCode) { skipped++; continue; }
  if (!r.detail?.notice) { skipped++; continue; }

  const imgs = r.images || {};
  const mains = (imgs.main || []).slice(0, MAX_MAIN);
  const details = (imgs.detail || []).slice(0, MAX_DETAIL);
  if (mains.length === 0) { skipped++; continue; }

  const plan = [...mains.map((u) => ['main', u]), ...details.map((u) => ['detail', u])];

  // 상품 1건의 이미지들은 동시에 받아 올린다 (순차면 100건에 수 시간).
  const settled = await Promise.all(plan.map(async ([kind, url], i) => {
    try {
      const { buf, mime } = await fetchImage(url);
      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
      const path = `catalog/naver_${r.product_no}/${String(i).padStart(3, '0')}.${ext}`;
      const { error: upErr } = await supabase.storage.from('product-images')
        .upload(path, buf, { contentType: mime, cacheControl: '31536000', upsert: true });
      if (upErr) throw new Error(upErr.message);
      const pub = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
      return { id: `naver_${r.product_no}_${i}`, name: `${kind}_${i}.${ext}`, mime_type: mime, kind, cdn_url: pub, width: null, height: null };
    } catch { return null; }
  }));
  const uploaded = settled.filter(Boolean);

  if (uploaded.filter((u) => u.kind === 'main').length === 0) { failed++; continue; }

  const price = sellingPrice(r.price);
  const { error: insErr } = await supabase.from('catalog_products').insert({
    drive_folder_id: driveKey,
    drive_folder_name: `naver_${r.product_no}`,
    product_name: r.title,
    coupang_category_code: cat.categoryCode,
    suggested_price: price,
    cost_price: r.price,
    images: uploaded,
    options: r.detail?.options || [],
    // 대리 등록 때 "품절 아닌 것 · 시즌인 것"만 고르려면 판정값이 필요하다.
    // 등록 스크립트가 소싱 테이블을 조인하지 않도록 여기서 한 번 계산해 넣는다.
    in_stock: (r.detail?.options || []).length === 0
      ? null                                             // 옵션 정보가 없으면 판정 불가
      : (r.detail?.options || []).some((o) => o?.soldOut === false),
    fruit_kind: fruitKindFromCategoryPath(r.category_path) || null,
    notices: r.detail?.notice || null,
    status: 'active',
    is_visible: true,
    raw_metadata: {
      source: 'naver_sourcing', sourcing_id: r.id,
      naver_category_id: r.naver_category_id, naver_category_path: r.category_path,
      coupang_category_path: cat.categoryPath,
    },
  });
  if (insErr) { failed++; continue; }

  made++;
  already.add(driveKey);
  if (made % 10 === 0 || made === WANT) {
    const el = (Date.now() - t0) / 1000;
    console.log(`  ${made}/${WANT}건  (${el.toFixed(0)}초, 건당 ${(el / made).toFixed(1)}초)  최근: ${r.title.slice(0, 34)}`);
  }
}

const { count } = await supabase.from('catalog_products').select('id', { count: 'exact', head: true }).eq('is_visible', true);
console.log(`\n신규 ${made}건 · 건너뜀 ${skipped} · 실패 ${failed}`);
console.log(`카탈로그 총 등록가능 상품: ${count}건`);
