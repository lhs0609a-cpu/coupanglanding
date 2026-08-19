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
import { Search, Loader2, ExternalLink, PackageSearch, ChevronLeft, ChevronRight, Download, AlertTriangle } from 'lucide-react';
import { findHelper, fetchCollection, startImport, fetchImportState, type ImportState } from '@/lib/megaload/naver-ingest-local';

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
  detail_status: 'none' | 'requested' | 'running' | 'done' | 'failed';
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
  // 올인원으로 가져오기 — 고른 것만 내 PC 로 내려받아 폴더를 만든다.
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [importing, setImporting] = useState(false);
  const [imp, setImp] = useState<ImportState | null>(null);
  const [impNote, setImpNote] = useState<string | null>(null);

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

  /**
   * 도우미에 아직 안 올라간 수집물이 있으면 여기서 올린다.
   * ★ 왜 이 화면에도 두나: 저장은 원래 조종석(/megaload/naver-sourcing)이 수집을 마칠 때만
   *   했다. 그런데 수집은 몇 분씩 걸려서 사람은 그동안 다른 화면으로 가 있기 마련이고,
   *   실제로 이 카탈로그를 보고 있는 동안 수집이 끝나면 **아무 데도 저장되지 않았다**.
   *   저장이 "어느 탭을 보고 있었는가"에 달려 있으면 안 된다.
   * 도우미가 없거나(셀러) 올릴 게 없으면 조용히 아무 일도 하지 않는다.
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const helper = await findHelper();
        if (!helper || !alive) return;
        const c = await fetchCollection(helper.ep);
        if (!alive || !c || c.running || !c.items?.length) return;
        const res = await fetch('/api/megaload/naver-sourcing/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: c.items, categoryPath: c.catName || '' }),
        });
        // 관리자가 아니면 403 이 정상이다(셀러는 올릴 권한이 없다) — 조용히 넘어간다.
        if (res.ok && alive) load();
      } catch { /* 도우미 미설치·미실행은 정상 상황이다 */ }
    })();
    return () => { alive = false; };
    // 첫 진입에 한 번만 — 폴링하면 셀러 브라우저가 매번 localhost 를 두드린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 가져오기 진행 폴링 — 도는 동안만. */
  useEffect(() => {
    if (!imp?.running && !importing) return;
    let alive = true;
    const t = setInterval(async () => {
      const helper = await findHelper();
      if (!helper || !alive) return;
      const st = await fetchImportState(helper.ep);
      if (!alive || !st) return;
      setImp(st);
      if (!st.running) { setImporting(false); clearInterval(t); }
    }, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [imp?.running, importing]);

  /**
   * 고른 상품을 내 PC 로 가져온다.
   * 서버에서 받는 건 **URL 과 JSON 뿐**이다 — 이미지 바이트는 도우미가 CDN 에서 직접 받는다.
   * 그래서 네이버 페이지를 열지 않고, 셀러는 로그인·캡차·429 를 겪지 않는다.
   */
  const runImport = async () => {
    setErr(null);
    setImpNote(null);
    setImporting(true);
    try {
      const helper = await findHelper();
      if (!helper) throw new Error('이 PC 에서 메가로드 도우미를 찾지 못했습니다 — 도우미를 실행해 주세요.');

      const res = await fetch('/api/megaload/naver-sourcing/products/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...picked] }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);

      // ★ 상세가 없는 건 막다른 길이 아니다 — **자동으로 요청을 걸어 둔다.**
      //   셀러 PC 가 직접 네이버를 열면 셀러마다 로그인·캡차·429 를 겪으므로, 요청만 남기고
      //   실제 추출은 관리자 도우미가 대신한다. 셀러는 기다렸다 다시 누르면 된다.
      if (j.skipped?.length) {
        const ids = j.skipped.map((x: { id: string }) => x.id);
        let queued = 0;
        try {
          const qr = await fetch('/api/megaload/naver-sourcing/products/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
          });
          const qj = await qr.json();
          queued = qr.ok ? (qj.requested ?? 0) : 0;
        } catch { /* 요청 등록 실패는 치명적이지 않다 */ }
        setImpNote(queued
          ? `${queued}개는 아직 상세가 없어 지금 요청을 걸었습니다 — 준비되면(보통 몇 분) 다시 눌러 가져오세요.`
          : `${j.skipped.length}개는 아직 상세가 없습니다 — 잠시 후 다시 시도해 주세요.`);
      }
      if (!j.products?.length) {
        // 가져올 게 없어도 요청은 걸렸다 — 그 사실을 에러로 덮지 않는다.
        setImporting(false);
        return;
      }
      const r = await startImport(helper.ep, j.products);
      setImp({ running: true, total: r.total ?? j.products.length, done: 0, ok: 0, failed: 0, current: '', rootDir: r.rootDir ?? '', stopped: null, at: Date.now() });
      setPicked(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setImporting(false);
    }
  };

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

      {/* 카탈로그와 올인원을 잇는 지점.
          서버에서 오는 건 URL·JSON 뿐이고, 이미지는 내 PC 도우미가 CDN 에서 직접 받는다. */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4 flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setPicked((prev) => {
            const all = products.length > 0 && products.every((x) => prev.has(x.id));
            const next = new Set(prev);
            for (const x of products) { if (all) next.delete(x.id); else next.add(x.id); }
            return next;
          })}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
        >
          {products.length > 0 && products.every((x) => picked.has(x.id)) ? '이 페이지 선택 해제' : '이 페이지 전체 선택'}
        </button>
        <button
          onClick={runImport}
          disabled={!picked.size || importing || !!imp?.running}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E31837] text-white text-sm font-medium hover:bg-[#c41230] disabled:opacity-40"
        >
          {importing || imp?.running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          선택한 {picked.size.toLocaleString()}개 내 PC 로 가져오기
        </button>
        {!!picked.size && !importing && (
          <button onClick={() => setPicked(new Set())} className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">
            선택 해제
          </button>
        )}
        <span className="text-xs text-gray-500">
          도우미가 이미지를 받아 올인원 폴더를 만듭니다 — 네이버 로그인이 필요 없습니다.
        </span>
      </div>

      {impNote && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-4 inline-flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {impNote}
        </div>
      )}

      {imp && (imp.running || imp.done > 0) && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-800">가져오기 {imp.running ? '진행 중' : (imp.stopped || '완료')}</span>
            <span className="text-gray-500">{imp.done}/{imp.total} · 성공 {imp.ok} · 실패 {imp.failed}</span>
          </div>
          <div className="mt-2 h-1.5 rounded bg-gray-100 overflow-hidden">
            <div className="h-full bg-[#E31837] transition-all" style={{ width: `${imp.total ? Math.round((imp.done / imp.total) * 100) : 0}%` }} />
          </div>
          {imp.current && <p className="text-xs text-gray-500 mt-2 truncate">지금: {imp.current}</p>}
          {!imp.running && imp.ok > 0 && (
            <p className="text-xs text-emerald-700 mt-2">
              폴더가 준비됐습니다 — 올인원이 이어서 상세페이지를 만듭니다. 저장 위치: <code className="text-[11px]">{imp.rootDir}</code>
            </p>
          )}
        </div>
      )}

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
              <div
                key={p.id}
                className={`rounded-xl border bg-white overflow-hidden hover:shadow-sm transition ${picked.has(p.id) ? 'border-[#E31837] ring-1 ring-[#E31837]' : 'border-gray-200'}`}
              >
                <div className="relative aspect-square bg-gray-100">
                  <label className="absolute top-2 left-2 z-10 bg-white/90 rounded p-1 cursor-pointer">
                    <input
                      type="checkbox"
                      aria-label={`${p.title} 선택`}
                      checked={picked.has(p.id)}
                      onChange={(e) => setPicked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(p.id); else next.delete(p.id);
                        return next;
                      })}
                    />
                  </label>
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
                  {(p.detail_status === 'requested' || p.detail_status === 'running') && (
                    <span className="mt-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                      상세 준비 중
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
