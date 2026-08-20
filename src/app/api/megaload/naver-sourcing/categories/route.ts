import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
  CATEGORY_TREE, TREE_META, UNCLASSIFIED, PATH_SEP, pathMatches, flattenTree,
} from '@/lib/megaload/naver-category-tree';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * 카테고리 트리 + 가지별 상품 수.
 *
 * ★ 트리 자체는 **서버 코드에 동봉된 스냅샷**이라 DB 도 도우미도 필요 없다(요청 0회, 즉시).
 *   DB 에서 읽는 건 "어느 가지에 몇 개가 쌓였나" 뿐이다.
 *
 * ★ 왜 category_path(이름)로 세나: 트리 id(1000xxxx)와 상품 카테고리 id(5000xxxx)는 다른
 *   체계다 — id 로 맞추면 항상 0건이다. 수집할 때 남긴 이름 경로가 유일하게 맞는 축이다.
 *   (naver-category-tree.ts 의 설명 참고)
 *
 * ★ 왜 group by 를 DB 에 안 맡기나: PostgREST 는 집계를 안 준다(RPC 를 새로 파야 한다).
 *   지금 필요한 건 텍스트 두 컬럼뿐이라 읽어서 여기서 센다. 표가 커지면 그때 RPC 로 옮긴다
 *   — 그 경계를 넘겼는지 알 수 있게 truncated 를 함께 돌려준다.
 */
const SCAN_LIMIT = 20000;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const service = await createServiceClient();
  const { data, error } = await service
    .from('sh_naver_sourcing_products')
    .select('category_path, detail_status')
    .limit(SCAN_LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  // 같은 경로가 수백 번 나오므로 먼저 경로별로 접는다(비교 횟수를 노드×경로로 줄인다).
  const byPath = new Map<string, { total: number; ready: number }>();
  for (const r of rows) {
    const key = (r.category_path || '').trim() || UNCLASSIFIED;
    const cur = byPath.get(key) || { total: 0, ready: 0 };
    cur.total += 1;
    if (r.detail_status === 'done') cur.ready += 1;
    byPath.set(key, cur);
  }

  const nodes = flattenTree();
  const counts: Record<string, { total: number; ready: number }> = {};
  for (const n of nodes) {
    let total = 0; let ready = 0;
    for (const [path, c] of byPath) {
      if (pathMatches(path, n.path)) { total += c.total; ready += c.ready; }
    }
    if (total) counts[n.path] = { total, ready };
  }

  // 트리 어느 가지에도 안 붙는 수집물 — 숨기지 않고 '미분류'로 모아 보여 준다.
  let orphanTotal = 0; let orphanReady = 0;
  const orphanPaths: string[] = [];
  for (const [path, c] of byPath) {
    if (nodes.some((n) => pathMatches(path, n.path))) continue;
    orphanTotal += c.total; orphanReady += c.ready;
    if (path !== UNCLASSIFIED) orphanPaths.push(path);
  }
  if (orphanTotal) counts[UNCLASSIFIED] = { total: orphanTotal, ready: orphanReady };

  const all = { total: rows.length, ready: rows.filter((r) => r.detail_status === 'done').length };

  return NextResponse.json({
    tree: CATEGORY_TREE,
    meta: { ...TREE_META, sep: PATH_SEP },
    counts,
    all,
    // 트리에 못 붙은 경로의 실제 값 — '미분류'가 왜 생겼는지 화면이 설명할 수 있어야 한다.
    orphanPaths: orphanPaths.slice(0, 20),
    truncated: rows.length >= SCAN_LIMIT,
  });
}
