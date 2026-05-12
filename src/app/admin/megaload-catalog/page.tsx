'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, RefreshCw, Eye, EyeOff, Archive, Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';

interface CatalogImage {
  id: string;
  name: string;
  thumbnail_link: string | null;
  kind: 'main' | 'detail' | 'option';
}

interface CatalogProduct {
  id: string;
  drive_folder_id: string;
  drive_folder_name: string;
  product_name: string;
  display_name: string | null;
  brand: string | null;
  status: 'draft' | 'active' | 'suspended' | 'archived';
  is_visible: boolean;
  suggested_price: number | null;
  main_image_count: number;
  detail_image_count: number;
  register_count: number;
  images: CatalogImage[];
  updated_at: string;
}

interface SyncJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  total_folders: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  failed_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: '초안',
  active: '활성',
  suspended: '중지',
  archived: '보관',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-yellow-100 text-yellow-700',
  archived: 'bg-red-100 text-red-700',
};

export default function AdminMegaloadCatalogPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [visibleFilter, setVisibleFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string>('');
  const [syncMaxFolders, setSyncMaxFolders] = useState(200);
  const [syncPageToken, setSyncPageToken] = useState<string | null>(null);
  const [recentJobs, setRecentJobs] = useState<SyncJob[]>([]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set('q', q);
    if (statusFilter) params.set('status', statusFilter);
    if (visibleFilter) params.set('visible', visibleFilter);
    return params.toString();
  }, [page, q, statusFilter, visibleFilter]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/megaload-catalog?${queryString}`);
      const data = await res.json();
      if (res.ok) {
        setProducts(data.items || []);
        setTotalPages(data.total_pages || 1);
        setTotal(data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  const fetchJobs = useCallback(async () => {
    const res = await fetch('/api/admin/megaload-catalog/sync');
    const data = await res.json();
    if (res.ok) setRecentJobs(data.jobs || []);
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult('');
    try {
      const res = await fetch('/api/admin/megaload-catalog/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxFolders: syncMaxFolders,
          pageToken: syncPageToken,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const s = data.stats;
        setSyncResult(
          `✓ ${s.total}개 폴더 처리 (신규 ${s.inserted}, 갱신 ${s.updated}, 건너뜀 ${s.skipped}, 실패 ${s.failed})${data.next_page_token ? ' · 더 남음' : ' · 완료'}`
        );
        setSyncPageToken(data.next_page_token || null);
        fetchList();
        fetchJobs();
      } else {
        setSyncResult(`❌ ${data.error || '동기화 실패'}`);
      }
    } catch (err) {
      setSyncResult(`❌ ${err instanceof Error ? err.message : '동기화 실패'}`);
    } finally {
      setSyncing(false);
    }
  };

  const handlePatch = async (id: string, patch: Partial<CatalogProduct>) => {
    const res = await fetch('/api/admin/megaload-catalog', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    if (res.ok) fetchList();
  };

  const handleArchive = async (id: string) => {
    if (!confirm('이 상품을 보관(아카이브)하시겠습니까?')) return;
    const res = await fetch(`/api/admin/megaload-catalog?id=${id}`, { method: 'DELETE' });
    if (res.ok) fetchList();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Package className="w-6 h-6 text-[#E31837]" />
        <h1 className="text-2xl font-bold text-gray-900">메가로드 카탈로그</h1>
        <span className="text-sm text-gray-500">전체 {total.toLocaleString()}개</span>
      </div>

      {/* 동기화 패널 */}
      <Card>
        <h2 className="text-sm font-bold text-gray-700 mb-3">Drive 동기화</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-600">
            한 번에 처리할 폴더 수
            <input
              type="number"
              min={10}
              max={1000}
              value={syncMaxFolders}
              onChange={(e) => setSyncMaxFolders(Number(e.target.value))}
              className="ml-2 w-24 border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </label>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#E31837] text-white rounded-lg text-sm font-medium hover:bg-[#c41530] disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {syncing ? '동기화 중...' : syncPageToken ? '다음 페이지 동기화' : '동기화 시작'}
          </button>
          {syncPageToken && (
            <button
              onClick={() => setSyncPageToken(null)}
              className="text-xs text-gray-500 underline"
            >
              처음부터 다시
            </button>
          )}
        </div>
        {syncResult && <div className="mt-3 text-sm text-gray-700">{syncResult}</div>}

        {recentJobs.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <div className="text-xs text-gray-500 mb-2">최근 작업</div>
            <div className="space-y-1 text-xs text-gray-600">
              {recentJobs.slice(0, 5).map((j) => (
                <div key={j.id} className="flex gap-3">
                  <span className="w-32">{new Date(j.created_at).toLocaleString('ko-KR')}</span>
                  <span className="w-16 font-medium">{j.status}</span>
                  <span>
                    총 {j.total_folders} · 신규 {j.inserted_count} · 갱신 {j.updated_count} · 건너뜀{' '}
                    {j.skipped_count} · 실패 {j.failed_count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* 검색/필터 */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="상품명 검색"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">전체 상태</option>
            <option value="draft">초안</option>
            <option value="active">활성</option>
            <option value="suspended">중지</option>
            <option value="archived">보관</option>
          </select>
          <select
            value={visibleFilter}
            onChange={(e) => {
              setVisibleFilter(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">노출 무관</option>
            <option value="true">노출됨</option>
            <option value="false">미노출</option>
          </select>
        </div>
      </Card>

      {/* 목록 */}
      <Card>
        {loading ? (
          <div className="py-12 text-center text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto" />
          </div>
        ) : products.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            카탈로그가 비어있습니다. 위에서 동기화를 시작하세요.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {products.map((p) => {
                const thumb = p.images?.[0]?.thumbnail_link || '';
                return (
                  <div key={p.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="aspect-square bg-gray-100 relative">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt={p.product_name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                          이미지 없음
                        </div>
                      )}
                      <div className="absolute top-2 left-2 flex gap-1">
                        <Badge label={STATUS_LABELS[p.status]} colorClass={STATUS_COLORS[p.status]} />
                        {p.is_visible && <Badge label="노출" colorClass="bg-green-100 text-green-700" />}
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="text-sm font-medium text-gray-900 line-clamp-2 min-h-[2.5rem]">
                        {p.display_name || p.product_name}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {p.brand && <span>{p.brand} · </span>}
                        이미지 {p.images?.length || 0}장
                      </div>
                      {p.suggested_price !== null && (
                        <div className="mt-1 text-sm font-bold text-gray-900">
                          {p.suggested_price.toLocaleString()}원
                        </div>
                      )}
                      {p.register_count > 0 && (
                        <div className="text-xs text-gray-400">{p.register_count}회 등록</div>
                      )}
                      <div className="mt-2 flex gap-1">
                        <button
                          onClick={() =>
                            handlePatch(p.id, {
                              is_visible: !p.is_visible,
                              status: !p.is_visible ? 'active' : p.status,
                            })
                          }
                          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                        >
                          {p.is_visible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          {p.is_visible ? '숨김' : '노출'}
                        </button>
                        <button
                          onClick={() => handleArchive(p.id)}
                          className="inline-flex items-center justify-center px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-500"
                          title="보관"
                        >
                          <Archive className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 페이지네이션 */}
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {page} / {totalPages} 페이지
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="inline-flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" /> 이전
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="inline-flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded disabled:opacity-50"
                >
                  다음 <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
