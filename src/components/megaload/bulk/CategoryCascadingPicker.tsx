'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Search, Check, ChevronRight, Loader2 } from 'lucide-react';

interface CategoryNode {
  name: string;
  fullPath: string;
  code: string | null;
  children: Record<string, CategoryNode>;
}

interface CategoryCascadingPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (code: string, fullPath: string) => void;
  /** 현재 선택된 코드 (있으면 picker 가 그 경로로 자동 펼침) */
  currentCode?: string;
  /** 모달 제목 (예: "카테고리 선택 — 망고 1kg") */
  title?: string;
}

// 모듈 레벨 캐시 — 한 세션에 한 번만 fetch
let _cachedRoot: CategoryNode | null = null;
let _fetchPromise: Promise<CategoryNode | null> | null = null;

async function loadCategoryTree(): Promise<CategoryNode | null> {
  if (_cachedRoot) return _cachedRoot;
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = (async () => {
    try {
      const res = await fetch('/api/megaload/categories/tree');
      if (!res.ok) return null;
      const data = await res.json() as CategoryNode;
      _cachedRoot = data;
      return data;
    } catch {
      return null;
    } finally {
      _fetchPromise = null;
    }
  })();

  return _fetchPromise;
}

/**
 * 검색 매칭: 카테고리 트리 전체에서 name 또는 fullPath 가
 * 검색어를 포함하는 leaf 노드 반환.
 */
function searchTree(root: CategoryNode, query: string): CategoryNode[] {
  if (!query || query.length < 1) return [];
  const lower = query.toLowerCase();
  const results: CategoryNode[] = [];
  const stack: CategoryNode[] = [root];
  while (stack.length > 0 && results.length < 100) {
    const node = stack.pop()!;
    if (node.code && (node.name.toLowerCase().includes(lower) || node.fullPath.toLowerCase().includes(lower))) {
      results.push(node);
    }
    for (const child of Object.values(node.children)) stack.push(child);
  }
  // fullPath 길이로 정렬 (구체적인 leaf 가 위로)
  results.sort((a, b) => a.fullPath.length - b.fullPath.length);
  return results;
}

export default function CategoryCascadingPicker({
  isOpen, onClose, onSelect, currentCode, title,
}: CategoryCascadingPickerProps) {
  const [root, setRoot] = useState<CategoryNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [path, setPath] = useState<string[]>([]); // navigated path: ['식품', '신선식품', ...]
  const [searchQuery, setSearchQuery] = useState('');

  // 모달 열릴 때 트리 로드
  useEffect(() => {
    if (!isOpen) return;
    if (root) return;
    setLoading(true);
    loadCategoryTree().then(t => {
      setRoot(t);
      setLoading(false);
    });
  }, [isOpen, root]);

  // 모달 열릴 때 currentCode 가 있으면 자동으로 그 경로 펼침
  useEffect(() => {
    if (!isOpen) return;
    if (!root) return;
    if (currentCode) {
      // 현재 코드가 가리키는 경로 찾기
      const stack: { node: CategoryNode; ancestors: string[] }[] = [{ node: root, ancestors: [] }];
      while (stack.length > 0) {
        const { node, ancestors } = stack.pop()!;
        if (node.code === currentCode) {
          setPath(ancestors);
          return;
        }
        for (const [k, child] of Object.entries(node.children)) {
          stack.push({ node: child, ancestors: [...ancestors, k] });
        }
      }
    }
    // 현재 코드 없으면 처음부터
    setPath([]);
  }, [isOpen, root, currentCode]);

  // 모달 닫힐 때 검색 초기화
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  // 현재 path 에 해당하는 노드들의 자식 리스트 (3컬럼 또는 N컬럼)
  const columns = useMemo(() => {
    if (!root) return [] as { node: CategoryNode; selectedKey: string | null }[];
    const cols: { node: CategoryNode; selectedKey: string | null }[] = [];
    let cursor: CategoryNode = root;
    cols.push({ node: cursor, selectedKey: path[0] || null });
    for (let i = 0; i < path.length; i++) {
      const next = cursor.children[path[i]];
      if (!next) break;
      cursor = next;
      cols.push({ node: cursor, selectedKey: path[i + 1] || null });
    }
    return cols;
  }, [root, path]);

  // 검색 결과
  const searchResults = useMemo(() => {
    if (!root || !searchQuery.trim()) return [];
    return searchTree(root, searchQuery.trim());
  }, [root, searchQuery]);

  if (!isOpen) return null;

  const handleColumnClick = (colIdx: number, key: string) => {
    setPath(prev => {
      const next = prev.slice(0, colIdx);
      next.push(key);
      return next;
    });
  };

  const handleConfirm = () => {
    if (!root) return;
    let cursor: CategoryNode = root;
    for (const k of path) {
      cursor = cursor.children[k];
      if (!cursor) return;
    }
    if (!cursor.code) return; // leaf 가 아니면 저장 불가
    onSelect(cursor.code, cursor.fullPath);
    onClose();
  };

  const handleSearchSelect = (node: CategoryNode) => {
    if (!node.code) return;
    onSelect(node.code, node.fullPath);
    onClose();
  };

  // 마지막 컬럼의 선택 노드가 leaf 인지
  let canConfirm = false;
  let selectedPath = '';
  let selectedCode: string | null = null;
  if (root && path.length > 0) {
    let cursor: CategoryNode = root;
    for (const k of path) {
      cursor = cursor.children[k];
      if (!cursor) break;
    }
    if (cursor && cursor.code) {
      canConfirm = true;
      selectedPath = cursor.fullPath;
      selectedCode = cursor.code;
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-[1200px] h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-900">
              {title || '카테고리 선택'}
            </h2>
            {selectedPath && (
              <>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                <span className="text-sm text-gray-500 truncate" title={selectedPath}>
                  {selectedPath}
                </span>
                <span className="text-xs text-gray-300 shrink-0">({selectedCode})</span>
              </>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* 검색 */}
        <div className="px-5 py-2 border-b border-gray-100">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="카테고리 이름으로 검색 (예: 다시마, 망고, 노트북)"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-[#E31837] outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* 본문 — 검색 모드 vs 카스케이드 모드 */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 카테고리 트리 로드 중...
            </div>
          ) : !root ? (
            <div className="h-full flex items-center justify-center text-red-500 text-sm">
              카테고리 데이터 로드 실패. 새로고침 후 다시 시도하세요.
            </div>
          ) : searchQuery.trim() ? (
            <div className="h-full overflow-y-auto px-5 py-2">
              <div className="text-xs text-gray-500 mb-2">검색 결과: {searchResults.length}개</div>
              {searchResults.length === 0 ? (
                <div className="text-sm text-gray-400 py-8 text-center">
                  &lsquo;{searchQuery}&rsquo; 매칭 카테고리 없음. 다른 키워드로 시도해보세요.
                </div>
              ) : (
                <div className="space-y-1">
                  {searchResults.map((node) => (
                    <button
                      key={node.code!}
                      onClick={() => handleSearchSelect(node)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 border border-transparent hover:border-blue-200 transition group"
                    >
                      <div className="text-sm font-medium text-gray-900">{node.name}</div>
                      <div className="text-xs text-gray-500 truncate" title={node.fullPath}>
                        {node.fullPath}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">코드 {node.code}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex">
              {columns.map((col, idx) => {
                const childKeys = Object.keys(col.node.children).sort((a, b) => a.localeCompare(b, 'ko'));
                if (childKeys.length === 0) return null;
                return (
                  <div
                    key={idx}
                    className="border-r border-gray-100 overflow-y-auto"
                    style={{ width: idx === 0 ? 220 : 240, minWidth: idx === 0 ? 220 : 240 }}
                  >
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 sticky top-0 bg-white border-b border-gray-100">
                      {idx === 0 ? '대분류' : idx === 1 ? '중분류' : idx === 2 ? '소분류' : `L${idx + 1}`}
                    </div>
                    {childKeys.map((k) => {
                      const child = col.node.children[k];
                      const isSelected = col.selectedKey === k;
                      const hasChildren = Object.keys(child.children).length > 0;
                      const isLeaf = !!child.code && !hasChildren;
                      return (
                        <button
                          key={k}
                          onClick={() => handleColumnClick(idx, k)}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between border-b border-gray-50 transition ${
                            isSelected
                              ? 'bg-red-50 text-[#E31837] font-medium'
                              : 'hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <span className="truncate flex items-center gap-1.5">
                            {isLeaf && <Check className="w-3 h-3 text-green-500 shrink-0" />}
                            {k}
                          </span>
                          {hasChildren && <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-500">
            {searchQuery.trim()
              ? '검색 결과 클릭하면 즉시 선택'
              : canConfirm
                ? '아래 [선택] 버튼으로 저장'
                : '대분류부터 클릭하여 leaf 카테고리까지 내려가세요'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className={`px-4 py-2 text-sm rounded-lg flex items-center gap-1.5 ${
                canConfirm
                  ? 'bg-[#E31837] text-white hover:bg-red-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Check className="w-4 h-4" /> 선택
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
