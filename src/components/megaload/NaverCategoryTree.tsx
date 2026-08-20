'use client';

/**
 * 네이버 카테고리 트리 — 카탈로그에서 "무엇이 쌓여 있는지"를 보는 축.
 *
 * 설계 판단 세 가지(NAVER_카탈로그_카테고리트리_설계도.md):
 *  · **0개 가지를 숨기지 않는다.** 흐리게 두되 목록에는 남긴다 — 숨기면 "여성의류는 왜 없지"가 된다.
 *  · **개수는 우측 정렬 + tabular-nums.** 숫자가 세로로 줄을 맞춰야 눈으로 훑을 수 있다.
 *  · **검색은 조상을 자동으로 편다.** 수천 개를 스크롤로 찾을 수는 없다.
 *
 * 트리는 **깊이를 고정하지 않는다**(대>중>소, 더 깊어져도 그대로) — 한 층을 늘릴 때마다
 * 렌더 코드를 한 벌씩 복사해야 한다면 그건 이미 틀린 구조다.
 */

import { useMemo, useState } from 'react';
import { ChevronRight, Search, Layers } from 'lucide-react';
import { UNCLASSIFIED, PATH_SEP, type CategoryNode } from '@/lib/megaload/naver-category-tree';

export interface CategoryCount { total: number; ready: number }

/**
 * 개수 배지 — 우측 정렬 + tabular-nums 라 숫자가 세로로 줄을 맞춘다.
 * 상세 확보분이 있으면 앞에 초록 점(그 가지에 지금 등록 가능한 게 있다는 뜻).
 * (컴포넌트 밖에 둔다 — 렌더마다 새로 만들면 React 가 트리를 통째로 다시 그린다.)
 */
function Count({ c }: { c: CategoryCount | undefined }) {
  return (
    <span className="ml-auto flex items-center gap-1">
      {!!c?.ready && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title={`상세 확보 ${c.ready}개`} />
      )}
      <span className="text-[11px] tabular-nums text-gray-500">{(c?.total ?? 0).toLocaleString()}</span>
    </span>
  );
}

/**
 * 검색 중에는 이름이 걸린 노드와 그 조상만 남긴다. 걸린 노드의 **하위는 통째로** 살린다
 * ('과일'을 찾으면 그 아래 소분류까지 보여야 고를 수 있다).
 * (컴포넌트 밖의 순수 함수다 — 안에 두면 렌더마다 새로 만들어져 useMemo 가 의미를 잃는다.)
 */
function filterTree(nodes: CategoryNode[], needle: string): CategoryNode[] {
  return nodes
    .map((n) => {
      if (n.name.includes(needle)) return n;
      const kids = filterTree(n.children, needle);
      return kids.length ? { ...n, children: kids } : null;
    })
    .filter(Boolean) as CategoryNode[];
}

interface Props {
  tree: CategoryNode[];
  counts: Record<string, CategoryCount>;
  all: CategoryCount;
  /** 선택된 이름 경로. '' 이면 전체. */
  selected: string;
  onSelect: (path: string) => void;
  loading?: boolean;
}

export default function NaverCategoryTree({ tree, counts, all, selected, onSelect, loading }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const q = query.trim();

  const visible = useMemo(() => (q ? filterTree(tree, q) : tree), [tree, q]);

  /** 선택된 경로의 조상은 저절로 펼쳐진다 — 소분류를 고르면 그 위 두 층이 열려 있어야 한다. */
  const isOpen = (node: CategoryNode) =>
    !!q || open.has(node.id) || selected === node.path || selected.startsWith(`${node.path}${PATH_SEP}`);

  const rowClass = (path: string, count: CategoryCount | undefined) => {
    const on = selected === path;
    const empty = !count?.total;
    return [
      'w-full flex items-center gap-1.5 pl-2 pr-2 py-1.5 rounded-lg text-left text-[13px] transition',
      on ? 'bg-[#E31837]/8 text-gray-900 font-semibold shadow-[inset_3px_0_0_#E31837]'
         : empty ? 'text-gray-400 hover:bg-gray-50' : 'text-gray-700 hover:bg-gray-50',
    ].join(' ');
  };

  /**
   * 한 노드 = [펼침 화살표] + [이름·개수]. 자식이 있으면 자기 자신을 다시 그린다.
   * 화살표 자리는 말단에도 비워 둔다 — 안 그러면 이름 시작점이 형제끼리 어긋난다.
   */
  const renderNode = (node: CategoryNode): React.ReactNode => {
    const c = counts[node.path];
    const expanded = isOpen(node);
    const hasKids = node.children.length > 0;
    return (
      <div key={node.id}>
        <div className="flex items-stretch">
          {hasKids ? (
            <button
              type="button"
              aria-label={expanded ? `${node.name} 접기` : `${node.name} 펼치기`}
              aria-expanded={expanded}
              onClick={() => setOpen((prev) => {
                const next = new Set(prev);
                if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
                return next;
              })}
              className="px-1 text-gray-400 hover:text-gray-700"
            >
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>
          ) : (
            <span className="px-1 w-[22px]" aria-hidden />
          )}
          <button
            type="button"
            onClick={() => onSelect(node.path)}
            className={rowClass(node.path, c)}
            role="treeitem"
            aria-selected={selected === node.path}
          >
            <span className="truncate">{node.name}</span>
            <Count c={c} />
          </button>
        </div>

        {hasKids && expanded && (
          <div className="ml-4 border-l border-gray-100 pl-1" role="group">
            {node.children.map((child) => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  const unclassified = counts[UNCLASSIFIED];

  return (
    <aside className="rounded-xl border border-gray-200 bg-white overflow-hidden lg:sticky lg:top-4">
      <div className="px-3 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <Layers className="w-4 h-4 text-[#E31837]" />
        <span className="text-sm font-semibold text-gray-900">카테고리</span>
        {loading && <span className="ml-auto text-[11px] text-gray-400">불러오는 중</span>}
      </div>

      <div className="px-2.5 py-2 border-b border-gray-100">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="카테고리 이름 검색"
            aria-label="카테고리 이름 검색"
            className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#E31837]/30"
          />
        </div>
      </div>

      <div className="p-1.5 max-h-[70vh] overflow-y-auto" role="tree" aria-label="네이버 카테고리">
        <button type="button" onClick={() => onSelect('')} className={rowClass('', all)} role="treeitem" aria-selected={!selected}>
          <span className="w-3.5" />
          <span className="truncate">전체</span>
          <Count c={all} />
        </button>

        {visible.map((node) => renderNode(node))}

        {/* 트리에 못 붙은 수집물 — 있을 때만, 그러나 반드시 보인다. */}
        {!!unclassified?.total && !q && (
          <button
            type="button"
            onClick={() => onSelect(UNCLASSIFIED)}
            className={`${rowClass(UNCLASSIFIED, unclassified)} mt-1 border-t border-gray-100 rounded-none pt-2`}
            role="treeitem"
            aria-selected={selected === UNCLASSIFIED}
            title="수집 경로가 트리의 어느 가지에도 붙지 않는 상품입니다."
          >
            <span className="w-3.5" />
            <span className="truncate">{UNCLASSIFIED}</span>
            <Count c={unclassified} />
          </button>
        )}

        {q && !visible.length && (
          <p className="px-2 py-3 text-[12px] text-gray-400">이름이 맞는 카테고리가 없습니다.</p>
        )}
      </div>
    </aside>
  );
}
