/**
 * 카탈로그 category_path 되살리기.
 *
 * 왜 필요한가(실측 2026-08-20): 상세 추출 결과를 저장할 때 `category_path` 를 네이버 **표준
 * 상품분류**(`식품>농산물>과일>토마토`)로 덮어써 왔다. 카탈로그 카테고리 트리는 수집할 때
 * 남긴 **이름 경로**(`신선식품 > 과일`)를 축으로 쓰므로, 덮어쓴 줄은 트리에서 '미분류'로
 * 빠졌다 — 상세를 확보한, 가장 쓸모 있는 줄들이 안 보이는 상태였다(done 5건 전부).
 *
 * 덮어쓰기는 detail/route.ts 에서 막았다. 이 스크립트는 이미 덮어써진 줄을 되돌린다.
 *   표준 경로의 조각을 뒤에서부터 훑어 **트리에 있는 이름**을 만나면 그 노드의 경로로 바꾼다.
 *   ('식품>농산물>과일>토마토' → 조각 [토마토, 과일, …] → '과일' 이 트리에 있음 → '신선식품 > 과일')
 *   못 찾으면 건드리지 않는다 — 틀린 가지에 넣느니 '미분류'로 두는 편이 정직하다.
 *
 * 사용:  node scripts/backfill-naver-category-path.mjs           (무엇이 바뀌는지만 보여 준다)
 *        node scripts/backfill-naver-category-path.mjs --apply   (실제로 고친다)
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const SEP = ' > ';
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const raw = JSON.parse(fs.readFileSync('src/lib/megaload/naver-category-tree.json', 'utf8'));
/** 이름 → 트리 경로. 같은 이름이 여러 가지에 있으면 **얕은 쪽**을 쓴다(덜 틀린다). */
const byName = new Map();
for (const r of raw.roots) {
  if (!byName.has(r.name)) byName.set(r.name, r.name);
  for (const c of r.children) if (!byName.has(c.name)) byName.set(c.name, `${r.name}${SEP}${c.name}`);
}
const nodePaths = new Set([...byName.values()]);
const matches = (p, np) => p === np || p.startsWith(np + SEP);
const known = (p) => [...nodePaths].some((np) => matches(p, np));

const { data, error } = await sb
  .from('sh_naver_sourcing_products')
  .select('id, title, category_path, detail_status');
if (error) { console.error('조회 실패:', error.message); process.exit(1); }

const fixes = [];
for (const r of data ?? []) {
  const p = (r.category_path || '').trim();
  if (!p || known(p)) continue;                       // 이미 트리에 붙는다
  const segs = p.split(/[>›|/]/).map((s) => s.trim()).filter(Boolean).reverse();
  const hit = segs.find((s) => byName.has(s));
  if (!hit) continue;                                 // 못 찾으면 그대로 둔다
  fixes.push({ id: r.id, from: p, to: byName.get(hit), title: (r.title || '').slice(0, 30) });
}

console.log(`전체 ${(data ?? []).length}건 · 되살릴 수 있는 것 ${fixes.length}건`);
for (const f of fixes) console.log(`  ${f.from}  →  ${f.to}   (${f.title})`);

if (!process.argv.includes('--apply')) {
  console.log('\n실제로 고치려면 --apply 를 붙여 다시 실행하세요.');
  process.exit(0);
}
let ok = 0;
for (const f of fixes) {
  const { error: e } = await sb.from('sh_naver_sourcing_products')
    .update({ category_path: f.to }).eq('id', f.id);
  if (e) console.error('  실패:', f.title, e.message); else ok += 1;
}
console.log(`고침 ${ok}/${fixes.length}건`);
