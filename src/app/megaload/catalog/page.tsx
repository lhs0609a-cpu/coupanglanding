'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Search, ChevronLeft, ChevronRight, Loader2, Check, Plus, Sparkles, Clock } from 'lucide-react';
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
  product_name: string;
  display_name: string | null;
  brand: string | null;
  suggested_price: number | null;
  main_image_count: number;
  detail_image_count: number;
  register_count: number;
  images: CatalogImage[];
  already_registered?: boolean;
}

export default function MegaloadCatalogPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'popular'>('recent');
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState<string | null>(null);
  const [registerMsg, setRegisterMsg] = useState<{ id: string; type: 'success' | 'error'; text: string } | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), sort });
    if (q) params.set('q', q);
    return params.toString();
  }, [page, q, sort]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/megaload/catalog?${queryString}`);
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

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleRegister = async (id: string) => {
    if (registering) return;
    if (!confirm('이 상품을 쿠팡에 등록하시겠습니까?')) return;
    setRegistering(id);
    setRegisterMsg(null);
    try {
      const res = await fetch(`/api/megaload/catalog/${id}/register`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setRegisterMsg({ id, type: 'success', text: data.message || '등록 요청 완료' });
        fetchList();
      } else {
        setRegisterMsg({ id, type: 'error', text: data.error || '등록 실패' });
      }
    } catch (err) {
      setRegisterMsg({ id, type: 'error', text: err instanceof Error ? err.message : '등록 실패' });
    } finally {
      setRegistering(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="w-6 h-6 text-[#E31837]" />
        <h1 className="text-2xl font-bold text-gray-900">상품 카탈로그</h1>
        <span className="text-sm text-gray-500">{total.toLocaleString()}개 상품</span>
      </div>

      <Card>
        <p className="text-sm text-gray-600">
          큐레이팅된 상품을 클릭 한 번으로 쿠팡에 등록할 수 있습니다. Drive 연동이 필요 없으며, 상품 이미지와 상세는 자동으로 처리됩니다.
        </p>
      </Card>

      {/* 검색/정렬 */}
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
          <div className="flex gap-1 border border-gray-300 rounded-lg p-1">
            <button
              onClick={() => {
                setSort('recent');
                setPage(1);
              }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded ${
                sort === 'recent' ? 'bg-[#E31837] text-white' : 'text-gray-600'
              }`}
            >
              <Clock className="w-3.5 h-3.5" /> 최신순
            </button>
            <button
              onClick={() => {
                setSort('popular');
                setPage(1);
              }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded ${
                sort === 'popular' ? 'bg-[#E31837] text-white' : 'text-gray-600'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" /> 인기순
            </button>
          </div>
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
            아직 카탈로그에 등록된 상품이 없습니다.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {products.map((p) => {
                const thumb = p.images?.[0]?.thumbnail_link || '';
                const isThis = registerMsg?.id === p.id;
                return (
                  <div key={p.id} className="border border-gray-200 rounded-lg overflow-hidden flex flex-col">
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
                      {p.already_registered && (
                        <div className="absolute top-2 right-2">
                          <Badge label="등록됨" colorClass="bg-green-100 text-green-700" />
                        </div>
                      )}
                    </div>
                    <div className="p-3 flex-1 flex flex-col">
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
                      <div className="mt-auto pt-2">
                        <button
                          onClick={() => handleRegister(p.id)}
                          disabled={registering === p.id || p.already_registered}
                          className="w-full inline-flex items-center justify-center gap-1 px-2 py-2 text-xs bg-[#E31837] text-white rounded font-medium hover:bg-[#c41530] disabled:opacity-50 disabled:bg-gray-300"
                        >
                          {registering === p.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : p.already_registered ? (
                            <>
                              <Check className="w-3.5 h-3.5" /> 등록 완료
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" /> 한 번에 등록
                            </>
                          )}
                        </button>
                        {isThis && (
                          <div
                            className={`mt-1 text-xs ${
                              registerMsg.type === 'success' ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {registerMsg.text}
                          </div>
                        )}
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
