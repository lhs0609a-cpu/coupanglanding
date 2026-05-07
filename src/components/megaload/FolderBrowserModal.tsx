'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Folder, FolderOpen, Package, ChevronRight, ArrowUp,
  Loader2, HardDrive, Navigation,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';

interface DirEntry {
  name: string;
  path: string;
  hasProducts: boolean;
}

interface BrowseResponse {
  entries: DirEntry[];
  currentPath: string | null;
  parentPath: string | null;
}

interface FolderBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export default function FolderBrowserModal({ isOpen, onClose, onSelect }: FolderBrowserModalProps) {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [directInput, setDirectInput] = useState('');

  const fetchEntries = useCallback(async (targetPath?: string) => {
    setLoading(true);
    setError('');
    try {
      const url = targetPath
        ? `/api/megaload/products/bulk-register/browse-folders?path=${encodeURIComponent(targetPath)}`
        : '/api/megaload/products/bulk-register/browse-folders';
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const data = (await res.json()) as BrowseResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || '폴더 탐색 실패');
      setEntries(data.entries);
      setCurrentPath(data.currentPath);
      setParentPath(data.parentPath);
      if (data.currentPath) setDirectInput(data.currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : '폴더 탐색 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  // 모달 열리면 드라이브 목록 로드
  useEffect(() => {
    if (isOpen) {
      fetchEntries();
      setDirectInput('');
    }
  }, [isOpen, fetchEntries]);

  const navigateTo = useCallback((targetPath: string) => {
    fetchEntries(targetPath);
  }, [fetchEntries]);

  const handleDirectGo = useCallback(() => {
    if (!directInput.trim()) return;
    fetchEntries(directInput.trim());
  }, [directInput, fetchEntries]);

  const handleSelect = useCallback(() => {
    if (currentPath) {
      onSelect(currentPath);
      onClose();
    }
  }, [currentPath, onSelect, onClose]);

  // 브레드크럼 세그먼트 생성
  const breadcrumbs: { label: string; path: string | null }[] = [];
  if (currentPath) {
    // "드라이브" 루트
    breadcrumbs.push({ label: 'Drives', path: null });
    // 경로 분할
    const parts = currentPath.split(/[\\/]/);
    let accumulated = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part && i > 0) continue;
      accumulated = i === 0 ? part + '\\' : accumulated + part + (i < parts.length - 1 ? '\\' : '');
      breadcrumbs.push({ label: part || '', path: accumulated });
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="폴더 찾기" maxWidth="max-w-2xl">
      {/* 경로 직접 입력 */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={directInput}
            onChange={(e) => setDirectInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDirectGo()}
            placeholder="경로를 직접 입력 (예: J:\소싱)"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
          />
        </div>
        <button
          onClick={handleDirectGo}
          className="px-4 py-2 text-sm bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition"
        >
          이동
        </button>
      </div>

      {/* 브레드크럼 */}
      {breadcrumbs.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-3 flex-wrap">
          {breadcrumbs.map((bc, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300" />}
              <button
                onClick={() => bc.path ? navigateTo(bc.path) : fetchEntries()}
                className="hover:text-[#E31837] hover:underline transition"
              >
                {bc.label || 'Drives'}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="text-sm text-red-600 mb-3 bg-red-50 border border-red-200 rounded-lg p-2">
          {error}
        </div>
      )}

      {/* 디렉토리 목록 */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">불러오는 중...</span>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* 상위 폴더 */}
              {parentPath && (
                <button
                  onClick={() => navigateTo(parentPath)}
                  className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition"
                >
                  <ArrowUp className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">..</span>
                </button>
              )}
              {/* currentPath == null이면 드라이브 루트로 돌아가기 안 필요 */}
              {currentPath && !parentPath && (
                <button
                  onClick={() => fetchEntries()}
                  className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition"
                >
                  <HardDrive className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">드라이브 목록</span>
                </button>
              )}

              {entries.length === 0 && !loading && (
                <div className="px-4 py-8 text-center text-sm text-gray-400">
                  {currentPath ? '하위 폴더가 없습니다.' : '접근 가능한 드라이브가 없습니다.'}
                </div>
              )}

              {entries.map((entry) => {
                const isProduct = entry.name.startsWith('product_');
                const isDrive = !currentPath;

                return (
                  <button
                    key={entry.path}
                    onClick={() => navigateTo(entry.path)}
                    className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition ${
                      entry.hasProducts
                        ? 'bg-green-50 hover:bg-green-100'
                        : isProduct
                          ? 'bg-blue-50 hover:bg-blue-100'
                          : 'hover:bg-gray-50'
                    }`}
                  >
                    {isDrive ? (
                      <HardDrive className="w-4 h-4 text-gray-500 shrink-0" />
                    ) : isProduct ? (
                      <Package className="w-4 h-4 text-blue-500 shrink-0" />
                    ) : entry.hasProducts ? (
                      <FolderOpen className="w-4 h-4 text-green-600 shrink-0" />
                    ) : (
                      <Folder className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                    <span className={`text-sm flex-1 truncate ${
                      isProduct ? 'text-blue-700 font-medium' : entry.hasProducts ? 'text-green-700 font-medium' : 'text-gray-700'
                    }`}>
                      {entry.name}
                    </span>
                    {entry.hasProducts && !isProduct && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-green-200 text-green-700 rounded-full shrink-0">
                        product_* 포함
                      </span>
                    )}
                    {isProduct && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-blue-200 text-blue-700 rounded-full shrink-0">
                        상품 폴더
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 하단 버튼 */}
      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-gray-400 truncate max-w-[300px]">
          {currentPath || '드라이브를 선택하세요'}
        </span>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            취소
          </button>
          <button
            onClick={handleSelect}
            disabled={!currentPath}
            className="px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
          >
            이 폴더 선택
          </button>
        </div>
      </div>
    </Modal>
  );
}
