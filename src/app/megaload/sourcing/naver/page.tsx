'use client';

/**
 * 네이버 소싱 카탈로그 — **셀러도 보는 화면**.
 *
 * 수집 자체는 관리자 PC 의 도우미만 할 수 있다(네이버가 datacenter IP 를 막는다). 그런데
 * 예전에는 그 결과가 **도우미 메모리에만** 있어서, 앱을 껐다 켜면 사라지고 도우미가 켜진
 * 그 PC 의 브라우저에서만 보였다. 그래서 이 화면이 필요하다 — 저장된 수집물을 서버에서
 * 읽으므로 관리자는 어느 자리에서든, 셀러는 도우미 없이도 볼 수 있다.
 *
 * 조종석(/megaload/naver-sourcing)과 역할이 다르다:
 *   · 조종석 = 수집을 **시키는** 곳(관리자 전용, 도우미 필요)
 *   · 이 화면 = 수집된 것을 **보는** 곳(로그인한 모두, 도우미 불필요)
 */

import { useCallback, useEffect, useState } from 'react';
import { Search, Loader2, ExternalLink, PackageSearch, ChevronLeft, ChevronRight } from 'lucide-react';

interface SourcedProduct {
  id: string;
  product_no: string;
  store_id: string | null;
  url: string;
  title: string;
  price: number;
  thumb: string | null;
  review_count: number;
  naver_category_id: string | null;
  category_path: string | null;
  detail_status: 'none' | 'done' | 'failed';
  folder_path: string | null;
  collected_at: string;
}

type Sort = 'recent' | 'price' | 'review';

export default function NaverSourcingCatalogPage() {
  const [products, setProducts] = useState<SourcedProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [queryInput, setQueryInput] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [onlyDetail, setOnlyDetail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const p = new URLSearchParams({ page: String(page), sort });
      if (q) p.set('q', q);
      if (onlyDetail) p.set('detail', '1');
      const res = await fetch(`/api/megaload/naver-sourcing/products?${p}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setProducts(j.products ?? []);
      setTotal(j.total ?? 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [page, q, sort, onlyDetail]);

  useEffect(() => { load(); }, [load]);

  const pageSize = 60;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
          <PackageSearch className="w-5 h-5 text-[#E31837]" /> 네이버 소싱 카탈로그
        </h1>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">
          수집해 둔 상품을 모아 봅니다. 수집은 관리자 PC 의 도우미가 하지만, 결과는 서버에 남아
          <b> 도우미 없이도</b> 여기서 확인할 수 있습니다.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4 flex items-end gap-2 flex-wrap">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(queryInput.trim()); }}
        >
          <label className="text-xs text-gray-600">
            상품명 검색
            <div className="mt-1 flex">
              <input
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="예: 복숭아"
                className="px-3 py-2 rounded-l-lg border border-gray-200 text-sm w-64"
              />
              <button type="submit" className="px-3 py-2 rounded-r-lg bg-gray-900 text-white">
                <Search className="w-4 h-4" />
              </button>
            </div>
          </label>
        </form>

        <label className="text-xs text-gray-600">
          정렬
          <select
            value={sort}
            onChange={(e) => { setPage(1); setSort(e.target.value as Sort); }}
            className="block mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm"
          >
            <option value="recent">최근 수집순</option>
            <option value="review">리뷰 많은순</option>
            <option value="price">가격 낮은순</option>
          </select>
        </label>

        <label className="text-xs text-gray-600 inline-flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            checked={onlyDetail}
            onChange={(e) => { setPage(1); setOnlyDetail(e.target.checked); }}
          />
          상세까지 받은 것만
        </label>

        <span className="ml-auto text-sm text-gray-500 pb-2">
          전체 <b className="text-gray-900">{total.toLocaleString()}</b>개
        </span>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4">
          {err}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin inline" />
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-gray-700 font-medium">아직 수집된 상품이 없습니다.</p>
          <p className="text-sm text-gray-500 mt-1">
            관리자가 <b>네이버 소싱</b> 화면에서 카테고리를 수집하면 여기에 쌓입니다.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {products.map((p) => (
              <div key={p.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden hover:shadow-sm transition">
                <div className="aspect-square bg-gray-100">
                  {p.thumb
                    // 네이버 CDN — next/image 최적화를 태우면 우리 서버 트래픽만 는다.
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
                    : null}
                </div>
                <div className="p-2.5">
                  <p className="text-xs text-gray-800 line-clamp-2 leading-snug h-8">{p.title}</p>
                  <p className="text-sm font-bold text-gray-900 mt-1.5">
                    {p.price ? `${p.price.toLocaleString()}원` : '-'}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-gray-400">
                      리뷰 {p.review_count ? p.review_count.toLocaleString() : 0}
                    </span>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-[#E31837]"
                      aria-label="네이버에서 열기"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  {p.detail_status === 'done' && (
                    <span className="mt-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      상세 확보
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {lastPage > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((n) => Math.max(1, n - 1))}
                disabled={page <= 1}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600">{page} / {lastPage}</span>
              <button
                onClick={() => setPage((n) => Math.min(lastPage, n + 1))}
                disabled={page >= lastPage}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
