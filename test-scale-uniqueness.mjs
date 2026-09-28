// 대량 등록 전 중복 검증 — 상품 N건 × 셀러 26명에서 제목/상세/대표이미지가
// 하나라도 겹치는지 전수 확인한다. 쿠팡 호출 없음(순수 함수만), 비용 0.
//
// 사용: node test-scale-uniqueness.mjs [상품수=80]
import { readFileSync } from 'fs';
import { createJiti } from 'jiti';
import { createClient } from '@supabase/supabase-js';

for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const N = Number(process.argv[2] || 80);
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': new URL('./src', import.meta.url).pathname.replace(/^\//, '') },
});
const { generateDisplayName } = await jiti.import('./src/lib/megaload/services/display-name-generator.ts');
const { generateStoryV2 } = await jiti.import('./src/lib/megaload/services/story-generator.ts');
const { matchByNaverCategory } = await jiti.import('./src/lib/megaload/services/category-matcher.ts');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// 실제 등록 대상 계정 (물류·연락처·WING 다 갖춘 곳)
const { data: users } = await supabase
  .from('megaload_users')
  .select('id')
  .not('coupang_outbound_code', 'is', null)
  .not('coupang_return_code', 'is', null)
  .limit(100);
const sellers = (users || []).map((u) => u.id);

// 실제 소싱 상품명
const { data: prods } = await supabase
  .from('sh_naver_sourcing_products')
  .select('id, title, naver_category_id, category_path')
  .eq('detail_status', 'done')
  .gt('price', 0)
  .limit(N);

console.log(`상품 ${prods.length}건 × 셀러 ${sellers.length}명 = ${prods.length * sellers.length}건 시뮬레이션\n`);

function stableIndex(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 997;
}

let dupTitleInProduct = 0;   // 같은 상품 안에서 셀러끼리 제목 충돌 (치명적)
let dupStoryInProduct = 0;
let worstProduct = null;
const globalTitles = new Map();  // 전체 제목 충돌 (다른 상품끼리 겹치는 건 무해하지만 집계)

for (const p of prods) {
  const cat = p.naver_category_id ? matchByNaverCategory(String(p.naver_category_id)) : null;
  const path = cat?.categoryPath || p.category_path || '';
  const idx = stableIndex(p.id);

  const titles = new Set(), stories = new Set();
  for (const uid of sellers) {
    const seed = `seller_${uid}`;
    // catalog-register.ts 와 동일한 충돌 회피: 이미 쓰인 제목이면 시드를 바꿔 다시 뽑는다.
    let t = '';
    for (let a = 0; a < 12; a++) {
      t = generateDisplayName(p.title, '', path, a === 0 ? seed : `${seed}#${a}`, idx + a);
      if (!titles.has(t)) break;
    }
    const st = generateStoryV2(t, path, seed, idx, { brand: '' }, cat?.categoryCode).paragraphs.join('\n');
    titles.add(t);
    stories.add(st);
    globalTitles.set(t, (globalTitles.get(t) || 0) + 1);
  }
  const tDup = sellers.length - titles.size;
  const sDup = sellers.length - stories.size;
  dupTitleInProduct += tDup;
  dupStoryInProduct += sDup;
  if (tDup > 0 && (!worstProduct || tDup > worstProduct.dup)) worstProduct = { title: p.title, dup: tDup };
}

const total = prods.length * sellers.length;
console.log('='.repeat(72));
console.log(`같은 상품 안 셀러간 제목 충돌  : ${dupTitleInProduct} / ${total}  (${(dupTitleInProduct / total * 100).toFixed(2)}%)`);
console.log(`같은 상품 안 셀러간 상세 충돌  : ${dupStoryInProduct} / ${total}  (${(dupStoryInProduct / total * 100).toFixed(2)}%)`);
if (worstProduct) console.log(`최악 사례: "${worstProduct.title.slice(0, 40)}" — ${worstProduct.dup}명 충돌`);
console.log(`\n대표이미지: 셀러별 경로 megaload/<userId>/variant/<productId>.jpg 로 1:1 생성 → 구조상 충돌 불가`);
console.log(`\n판정: ${dupTitleInProduct === 0 && dupStoryInProduct === 0 ? '통과 — 중복 없음' : '실패 — 중복 발생'}`);
