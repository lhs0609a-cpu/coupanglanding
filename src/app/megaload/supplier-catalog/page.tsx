'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Search, Flame, TrendingUp, Sparkles, X, Store, RefreshCw, Check, Megaphone } from 'lucide-react';
import BrandLogoMarquee from '@/components/supplier/BrandLogoMarquee';

interface CatProduct {
  id: string; seller_product_name: string; brand: string | null; category_path: string | null;
  thumbnail_url: string | null; min_price: number; max_price: number;
  min_supply_price: number; total_stock: number; sold_count: number;
  supplier_notice: string | null;
  supplier: { brand_name: string | null; company_name: string | null; logo_url: string | null } | null;
}

const SORTS = [
  { key: 'hot', label: '잘팔림', icon: Flame },
  { key: 'margin', label: '마진순', icon: TrendingUp },
  { key: 'new', label: '신규', icon: Sparkles },
];

export default function SupplierCatalogPage() {
  const [products, setProducts] = useState<CatProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('hot');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<CatProduct | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/megaload/supplier-catalog?sort=${sort}&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setProducts(data.products || []);
    } finally { setLoading(false); }
  }, [sort, q]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-1"><Store className="w-6 h-6 text-[#E31837]" /> 공급사 제휴상품</h1>
      <p className="text-gray-500 text-sm mb-5">공급사가 등록한 상품을 골라 <b>딸깍</b> 한 번으로 내 쿠팡 계정에 올리세요. 상품명은 나만 다르게 자동 생성됩니다.</p>

      <BrandLogoMarquee />


      <div className="flex items-center gap-2 mb-5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="상품 검색" className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm" />
        </div>
        {SORTS.map((s) => (
          <button key={s.key} onClick={() => setSort(s.key)}
            className={`px-3 py-2 text-sm rounded-lg flex items-center gap-1 ${sort === s.key ? 'bg-[#E31837] text-white' : 'bg-gray-100 text-gray-600'}`}>
            <s.icon className="w-3.5 h-3.5" /> {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">등록된 상품이 없습니다.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((p) => {
            const marginPct = p.min_supply_price > 0 ? Math.round(((p.max_price - p.min_supply_price) / p.min_supply_price) * 100) : 0;
            return (
              <div key={p.id} className="border rounded-xl bg-white overflow-hidden flex flex-col">
                {p.thumbnail_url
                  ? <img src={p.thumbnail_url} alt="" className="w-full aspect-square object-cover" />
                  : <div className="w-full aspect-square bg-gray-100" />}
                <div className="p-3 flex-1 flex flex-col">
                  <div className="flex items-center gap-1 text-[11px] text-gray-400 mb-1">
                    {p.supplier?.logo_url && <img src={p.supplier.logo_url} alt="" className="w-3.5 h-3.5 rounded" />}
                    <span className="truncate">{p.supplier?.brand_name || p.supplier?.company_name || '공급사'}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 line-clamp-2 min-h-[2.5rem]">{p.seller_product_name}</p>
                  {p.supplier_notice && (
                    <div className="mt-1 flex items-start gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-1">
                      <Megaphone className="w-3 h-3 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{p.supplier_notice}</span>
                    </div>
                  )}
                  <div className="mt-1.5 text-xs text-gray-500">
                    공급가 ₩{p.min_supply_price.toLocaleString()} · <span className="text-emerald-600 font-medium">마진 +{marginPct}%</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400">
                    {p.sold_count > 0 && <span className="text-orange-500">🔥 {p.sold_count}개 판매</span>}
                    <span>재고 {p.total_stock}</span>
                  </div>
                  <button onClick={() => setPicked(p)}
                    className="mt-2 w-full px-3 py-2 text-xs font-bold text-white bg-[#E31837] rounded-lg hover:opacity-90">
                    내 쿠팡에 올리기
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {picked && <ListModal product={picked} onClose={() => setPicked(null)} />}
    </div>
  );
}

function ListModal({ product, onClose }: { product: CatProduct; onClose: () => void }) {
  const [price, setPrice] = useState(String(product.max_price || product.min_price || ''));
  const [seo, setSeo] = useState<string | null>(null);
  const [seoLoading, setSeoLoading] = useState(false);
  const [listing, setListing] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const previewSeo = async () => {
    setSeoLoading(true); setMsg(null);
    try {
      const res = await fetch('/api/megaload/supplier-catalog/list', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalog_product_id: product.id, preview: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '생성 실패');
      setSeo(data.display_name);
    } catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : '생성 실패' }); }
    finally { setSeoLoading(false); }
  };

  const doList = async () => {
    setListing(true); setMsg(null);
    try {
      const res = await fetch('/api/megaload/supplier-catalog/list', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalog_product_id: product.id, retail_price: Number(price) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '등록 실패');
      setSeo(data.display_name);
      setMsg({ type: 'success', text: '리스팅 생성됨! 로컬 에이전트가 내 쿠팡 계정에 등록합니다.' });
      setTimeout(onClose, 1800);
    } catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : '등록 실패' }); }
    finally { setListing(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">내 쿠팡에 올리기</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <p className="text-sm text-gray-700 mb-3 line-clamp-2">{product.seller_product_name}</p>

        {product.supplier_notice && (
          <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2 mb-3">
            <Megaphone className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span><b className="font-semibold">공급사 공지</b> · {product.supplier_notice}</span>
          </div>
        )}

        <label className="text-sm block mb-3">
          <span className="block text-gray-500 mb-1">
            판매가 (₩{product.min_price.toLocaleString()}~{product.max_price.toLocaleString()} 범위)
          </span>
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric"
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </label>

        <div className="bg-gray-50 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">내 계정용 상품명 (나만 다르게 자동생성)</span>
            <button onClick={previewSeo} disabled={seoLoading} className="text-xs text-blue-600 flex items-center gap-1">
              {seoLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} 미리보기
            </button>
          </div>
          <p className="text-sm text-gray-800 min-h-[1.25rem]">{seo || '— 미리보기를 눌러 확인'}</p>
        </div>

        {msg && <p className={`text-sm mb-3 ${msg.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{msg.text}</p>}

        <button onClick={doList} disabled={listing}
          className="w-full px-4 py-2.5 text-sm font-bold text-white bg-[#E31837] rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50">
          {listing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} 딸깍! 올리기
        </button>
      </div>
    </div>
  );
}
