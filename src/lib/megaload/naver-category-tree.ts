/**
 * 네이버 카테고리 트리 — **웹이 스스로 갖는 사본**.
 *
 * ★ 왜 서버에 두나: 원본 트리는 관리자 PC 의 도우미 안에만 있었다(디스크 캐시 + 동봉 스냅샷).
 *   그런데 카탈로그는 **도우미 없이 보는 화면**이다 — 셀러에겐 도우미가 없다. 트리를 도우미에서
 *   받아 오게 만들면 셀러 화면에는 영원히 카테고리가 뜨지 않는다. 그래서 스냅샷을 웹에 둔다.
 *   (naver-category-tree.json = 도우미 스냅샷 + 대분류 25개 이름. 26KB, 요청 0회, 즉시 렌더)
 *
 * ★ 왜 id 가 아니라 **이름 경로**로 상품을 찾나(중요):
 *   트리 노드 id 는 전부 1000xxxx(쇼핑 메뉴 분류)인데, 상품에 박힌 naver_category_id 는
 *   5000xxxx(표준 상품분류)다 — **서로 다른 체계**라 id 로 맞추면 결과가 항상 0건이다
 *   (2026-08-20 전수 확인: 스냅샷 401 노드에 5000xxxx 가 하나도 없다).
 *   대신 수집할 때 조종석이 고른 경로를 `category_path` 에 '신선식품 > 과일' 로 남긴다.
 *   그 문자열이 곧 트리의 이름 경로다 → **경로 접두사로 찾는다**. 스키마 변경이 필요 없다.
 */
import raw from './naver-category-tree.json';

export interface CategoryNode {
  id: string;
  name: string;
  /** 루트부터의 이름 경로 — 상품의 category_path 와 같은 형식이다. */
  path: string;
  /** 1=대분류 2=중분류 3=소분류 … 스냅샷이 깊어지면 그대로 깊어진다. */
  depth: number;
  children: CategoryNode[];
}

/** 경로 구분자 — 조종석이 `picked.map(c => c.name).join(' > ')` 로 만드는 것과 같아야 한다. */
export const PATH_SEP = ' > ';

/** 트리에 붙지 않는 수집물이 모이는 가지. 숨기면 "내 상품이 사라졌다"가 된다. */
export const UNCLASSIFIED = '미분류';

interface RawNode { id: string; name: string; children?: RawNode[] }

/**
 * 스냅샷(중첩 배열) → 경로가 박힌 노드. **깊이를 고정하지 않는다** —
 * 대>중 두 층만 있던 스냅샷이 대>중>소로 깊어져도 이 함수는 그대로다.
 */
function build(nodes: RawNode[], parentPath = '', depth = 1): CategoryNode[] {
  return nodes.map((n) => {
    const path = parentPath ? `${parentPath}${PATH_SEP}${n.name}` : n.name;
    return {
      id: n.id,
      name: n.name,
      path,
      depth,
      children: build(n.children || [], path, depth + 1),
    };
  });
}

export const CATEGORY_TREE: CategoryNode[] = build(raw.roots as RawNode[]);

export const TREE_META = { at: raw.at as number, depth: raw.depth as number, source: raw.source as string };

/** 트리를 평평하게 — 검색·집계용. */
export function flattenTree(nodes: CategoryNode[] = CATEGORY_TREE): CategoryNode[] {
  const out: CategoryNode[] = [];
  const walk = (list: CategoryNode[]) => {
    for (const n of list) { out.push(n); if (n.children.length) walk(n.children); }
  };
  walk(nodes);
  return out;
}

/**
 * 이 경로가 저 노드에 속하는가.
 * '신선식품' 을 고르면 '신선식품 > 과일' 도 포함해야 한다(상위 클릭 = 하위 전부).
 * 단순 startsWith 는 '신선식품가공' 까지 먹으므로 **구분자까지** 확인한다.
 */
export function pathMatches(categoryPath: string | null | undefined, nodePath: string): boolean {
  const p = (categoryPath || '').trim();
  if (!p) return false;
  return p === nodePath || p.startsWith(nodePath + PATH_SEP);
}
