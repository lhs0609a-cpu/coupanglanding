'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Check, X, ShieldCheck, PackageSearch, ExternalLink } from 'lucide-react';

interface Option { id: string; option_name: string; supply_price: number; stock: number; purchase_url: string | null; sku: string | null }
interface Supplier { id: string; company_name: string; brand_name: string | null; logo_url: string | null; business_verified: boolean }
interface Product {
  id: string; seller_product_name: string; category_code: string | null; category_path: string | null;
  brand: string | null; thumbnail_url: string | null; image_urls: string[];
  min_price: number; max_price: number; status: string; rejection_reason: string | null;
  notices: Record<string, unknown>; attributes: Record<string, unknown>;
  supplier: Supplier | null; options: Option[];
}

const STATUS_TABS = [
  { key: 'pending', label: '검수 대기' },
  { key: 'approved', label: '승인됨' },
  { key: 'rejected', label: '반려됨' },
  { key: 'all', label: '전체' },
];

export default function AdminSupplierCatalogPage() {
  const [status, setStatus] = useState('pending');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/supplier-catalog?status=${status}`);
      const data = await res.json();
      setProducts(data.products || []);
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    let reason: string | undefined;
    if (action === 'reject') {
      reason = prompt('반려 사유를 입력하세요 (공급사에게 표시됩니다):') || undefined;
      if (reason === undefined) return;
    }
    setActing(id);
    try {
      const res = await fetch(`/api/admin/supplier-catalog/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || '처리 실패'); return; }
      await load();
    } finally { setActing(null); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-4"><PackageSearch className="w-6 h-6 text-[#E31837]" /> 공급사 상품 검수</h1>

      <div className="flex gap-2 mb-5">
        {STATUS_TABS.map((t) => (
          <button key={t.key} onClick={() => setStatus(t.key)}
            className={`px-3 py-1.5 text-sm rounded-lg ${status === t.key ? 'bg-[#E31837] text-white' : 'bg-gray-100 text-gray-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">해당 상태의 상품이 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {products.map((p) => (
            <div key={p.id} className="border rounded-xl bg-white p-4">
              <div className="flex gap-4">
                {p.thumbnail_url
                  ? <img src={p.thumbnail_url} alt="" className="w-20 h-20 rounded-lg object-cover border shrink-0" />
                  : <div className="w-20 h-20 rounded-lg bg-gray-100 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-0.5">
                    {p.supplier?.logo_url && <img src={p.supplier.logo_url} alt="" className="w-4 h-4 rounded" />}
                    {p.supplier?.brand_name || p.supplier?.company_name || '공급사'}
                    {p.supplier?.business_verified && <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />}
                  </div>
                  <p className="font-medium text-gray-900 truncate">{p.seller_product_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    카테고리 {p.category_code || '-'} · 판매가 범위 ₩{p.min_price.toLocaleString()}~{p.max_price.toLocaleString()}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {p.options.map((o) => (
                      <span key={o.id} className="inline-flex items-center gap-1 text-[11px] bg-gray-50 border rounded px-1.5 py-0.5">
                        {o.option_name} · 공급가 ₩{o.supply_price.toLocaleString()} · 재고 {o.stock}
                        {o.purchase_url && <a href={o.purchase_url} target="_blank" rel="noreferrer" className="text-blue-500"><ExternalLink className="w-3 h-3" /></a>}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    고시 {Object.keys(p.notices || {}).length}개 · 속성 {Object.keys(p.attributes || {}).length}개 · 이미지 {(p.image_urls?.length || 0) + (p.thumbnail_url ? 1 : 0)}장
                  </p>
                  {p.status === 'rejected' && p.rejection_reason && (
                    <p className="text-xs text-red-500 mt-1">반려: {p.rejection_reason}</p>
                  )}
                </div>
                {p.status === 'pending' && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <button onClick={() => act(p.id, 'approve')} disabled={acting === p.id}
                      className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white flex items-center gap-1 disabled:opacity-50">
                      {acting === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} 승인
                    </button>
                    <button onClick={() => act(p.id, 'reject')} disabled={acting === p.id}
                      className="px-3 py-1.5 text-xs rounded-lg border text-red-600 flex items-center gap-1 disabled:opacity-50">
                      <X className="w-3.5 h-3.5" /> 반려
                    </button>
                  </div>
                )}
                {p.status !== 'pending' && (
                  <span className={`text-xs self-start px-2 py-1 rounded-full ${p.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                    {p.status === 'approved' ? '승인됨' : '반려됨'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
