/**
 * 카테고리 스냅샷 갱신 — 도우미가 발견한 트리를 **제품 두 곳에 동시에** 심는다.
 * ---------------------------------------------------------------------------
 * 스냅샷이 두 벌인 이유(둘 다 필요하다):
 *   · worker/desktop/.../category-tree.json — 도우미가 첫 실행부터 요청 0으로 트리를 갖는다.
 *   · src/lib/megaload/naver-category-tree.json — 카탈로그는 **도우미 없이 보는 화면**이라
 *     웹이 자기 사본을 들고 있어야 셀러에게도 카테고리가 뜬다.
 * 손으로 두 벌을 맞추면 언젠가 어긋난다. 그래서 한 번에 만든다.
 *
 * 실행:
 *   node scripts/build-naver-category-tree.mjs <export.json>
 *   curl "http://127.0.0.1:<port>/naver-ingest/categories/export?nonce=<nonce>" > export.json
 *     (도우미 GET /naver-ingest/categories/export 결과 = { at, depth, parents, categories, map })
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT_CATEGORIES } from '../worker/desktop/main/modules/naver-ingest/categories.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER_OUT = join(ROOT, 'worker/desktop/main/modules/naver-ingest/category-tree.json');
const WEB_OUT = join(ROOT, 'src/lib/megaload/naver-category-tree.json');

const src = process.argv[2];
if (!src) { console.error('사용법: node scripts/build-naver-category-tree.mjs <export.json>'); process.exit(1); }

const exported = JSON.parse(readFileSync(src, 'utf8'));
const map = exported.map || {};
if (!Object.keys(map).length) { console.error('map 이 비어 있습니다 — export 결과가 맞는지 확인하세요.'); process.exit(1); }

/**
 * map(부모→자식) → 중첩 트리. 같은 가지를 두 번 타지 않게 조상을 들고 내려간다
 * (네이버 트리에는 여러 부모에 걸린 카테고리가 있어서, 안 막으면 무한히 깊어진다).
 */
/**
 * 카테고리가 아닌 링크 — 목록 페이지의 '더보기' 는 엉뚱한 가지로 간다(도우미 categories.mjs
 * 와 같은 목록). 도우미 캐시에 이미 들어간 옛 항목이 스냅샷으로 새어 나오지 않게 여기서도 막는다.
 */
const NON_CATEGORY_NAMES = new Set(['더보기', '더 보기', '전체보기', '전체 보기', '모두보기']);

let maxDepth = 1;
function build(id, ancestors, depth) {
  const kids = (map[id] || []).filter((c) => !NON_CATEGORY_NAMES.has(c.name));
  // 깊이는 **자식이 실제로 있을 때만** 늘린다 — 안 그러면 말단을 한 층 더 있는 것으로 세어
  // depth 3 스냅샷이 4 로 기록된다(도우미가 "세분류까지 다 읽었다"로 오해한다).
  if (kids.length) maxDepth = Math.max(maxDepth, depth);
  return kids
    .filter((c) => !ancestors.has(c.id))
    .map((c) => {
      const next = new Set(ancestors); next.add(c.id);
      const children = build(c.id, next, depth + 1);
      return children.length ? { id: c.id, name: c.name, children } : { id: c.id, name: c.name };
    });
}

const roots = ROOT_CATEGORIES.map((r) => {
  const children = build(r.id, new Set([r.id]), 2);
  return children.length ? { id: r.id, name: r.name, children } : { id: r.id, name: r.name };
});

const count = (nodes) => nodes.reduce((n, x) => n + 1 + count(x.children || []), 0);
const byDepth = {};
const tally = (nodes, d) => { for (const n of nodes) { byDepth[d] = (byDepth[d] || 0) + 1; tally(n.children || [], d + 1); } };
tally(roots, 1);

const at = exported.at || Date.now();
const source = process.env.SNAPSHOT_SOURCE
  || `관리자 PC 도우미 실측(대분류 메뉴 + 중분류 이하 목록 페이지)`;

// 도우미 스냅샷도 **거른 뒤** 내보낸다 — 안 그러면 웹만 깨끗하고 도우미 트리엔 '더보기'가 남는다.
const cleanMap = {};
let cleanCount = 0;
for (const [id, kids] of Object.entries(map)) {
  const keep = kids
    .filter((c) => !NON_CATEGORY_NAMES.has(c.name))
    .map((c) => ({ id: String(c.id), name: String(c.name) }));
  if (!keep.length) continue;
  cleanMap[id] = keep;
  cleanCount += keep.length;
}

const workerSnapshot = {
  at, depth: maxDepth, source,
  parents: Object.keys(cleanMap).length, categories: cleanCount, map: cleanMap,
};
writeFileSync(WORKER_OUT, `${JSON.stringify(workerSnapshot, null, 0)}
`);
writeFileSync(WEB_OUT, `${JSON.stringify({ at, depth: maxDepth, source, roots }, null, 0)}\n`);

console.log(`깊이 ${maxDepth} · 노드 ${count(roots)}개`);
for (const [d, n] of Object.entries(byDepth)) console.log(`  ${d}단계 ${n}개`);
console.log(`도우미 → ${WORKER_OUT}`);
console.log(`웹     → ${WEB_OUT}`);
