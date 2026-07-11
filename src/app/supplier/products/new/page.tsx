'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2, RefreshCw, Save, Send, PackagePlus } from 'lucide-react';
import type { SupplierCategoryMeta } from '@/lib/megaload/supplier/category-meta';

interface OptionRow {
  option_name: string; supply_price: string; stock: string;
  sku: string; barcode: string; purchase_url: string;
}
const emptyOption = (): OptionRow => ({ option_name: '', supply_price: '', stock: '', sku: '', barcode: '', purchase_url: '' });

export default function SupplierProductNewPage() {
  const router = useRouter();
  const [f, setF] = useState({
    category_code: '', category_path: '', seller_product_name: '', display_product_name: '',
    brand: '', manufacturer: '', origin: '', search_tags: '',
    thumbnail_url: '', image_urls: '', detail_html: '',
    min_price: '', max_price: '',
    courier: '', delivery_charge_type: 'FREE', delivery_charge: '', return_charge: '',
    return_address: '', return_zip: '', as_tel: '', as_guide: '',
  });
  const [options, setOptions] = useState<OptionRow[]>([emptyOption()]);
  const [meta, setMeta] = useState<SupplierCategoryMeta | null>(null);
  const [noticeVals, setNoticeVals] = useState<Record<string, string>>({});
  const [attrVals, setAttrVals] = useState<Record<string, string>>({});
  const [metaLoading, setMetaLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const loadMeta = useCallback(async () => {
    if (!f.category_code) { setMsg({ type: 'error', text: '카테고리 코드를 먼저 입력하세요.' }); return; }
    setMetaLoading(true); setMsg(null);
    try {
      const res = await fetch(`/api/supplier/category-meta?categoryCode=${encodeURIComponent(f.category_code)}`);
      const data = await res.json();
      if (!res.ok && !data.notices) throw new Error(data.error || '메타 조회 실패');
      setMeta({ notices: data.notices || [], attributes: data.attributes || [] });
      if ((data.notices?.length ?? 0) === 0 && (data.attributes?.length ?? 0) === 0) {
        setMsg({ type: 'error', text: '이 카테고리의 고시/속성 메타가 없습니다(연결된 쿠팡 셀러 없음일 수 있음). 직접 입력해도 됩니다.' });
      }
    } catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : '메타 조회 실패' }); }
    finally { setMetaLoading(false); }
  }, [f.category_code]);

  const submit = async (doSubmit: boolean) => {
    setSaving(true); setMsg(null);
    try {
      const body = {
        category_code: f.category_code, category_path: f.category_path,
        seller_product_name: f.seller_product_name, display_product_name: f.display_product_name,
        brand: f.brand, manufacturer: f.manufacturer, origin: f.origin,
        search_tags: f.search_tags.split(',').map((s) => s.trim()).filter(Boolean),
        thumbnail_url: f.thumbnail_url,
        image_urls: f.image_urls.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
        detail_html: f.detail_html,
        notices: noticeVals, attributes: attrVals,
        min_price: Number(f.min_price) || 0, max_price: Number(f.max_price) || 0,
        shipping_profile: {
          courier: f.courier, deliveryChargeType: f.delivery_charge_type,
          deliveryCharge: Number(f.delivery_charge) || 0, returnCharge: Number(f.return_charge) || 0,
          returnAddress: f.return_address, returnZipCode: f.return_zip,
          afterServiceTel: f.as_tel, afterServiceGuide: f.as_guide,
        },
        options: options.map((o) => ({
          option_name: o.option_name, supply_price: Number(o.supply_price) || 0,
          stock: Number(o.stock) || 0, sku: o.sku, barcode: o.barcode, purchase_url: o.purchase_url,
        })),
        submit: doSubmit,
      };
      const res = await fetch('/api/supplier/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      setMsg({ type: 'success', text: doSubmit ? '검수 요청 완료! 승인되면 셀러 카탈로그에 노출됩니다.' : '임시저장 완료' });
      setTimeout(() => router.push('/supplier'), 1400);
    } catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : '저장 실패' }); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6"><PackagePlus className="w-6 h-6 text-[#E31837]" /> 상품 등록</h1>

      {/* 기본 */}
      <Section title="기본 정보">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex gap-2 items-end">
            <F label="쿠팡 카테고리 코드 *" v={f.category_code} on={(v) => set('category_code', v)} />
            <button onClick={loadMeta} disabled={metaLoading}
              className="shrink-0 h-[38px] px-3 rounded-lg bg-blue-600 text-white text-sm flex items-center gap-1 disabled:opacity-50">
              {metaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} 고시/속성 불러오기
            </button>
          </div>
          <F label="카테고리 경로" v={f.category_path} on={(v) => set('category_path', v)} />
          <F label="원산지" v={f.origin} on={(v) => set('origin', v)} />
          <F label="상품명 *" v={f.seller_product_name} on={(v) => set('seller_product_name', v)} span />
          <F label="브랜드" v={f.brand} on={(v) => set('brand', v)} />
          <F label="제조사" v={f.manufacturer} on={(v) => set('manufacturer', v)} />
          <F label="검색태그 (쉼표 구분)" v={f.search_tags} on={(v) => set('search_tags', v)} span />
        </div>
      </Section>

      {/* 이미지/상세 */}
      <Section title="이미지 · 상세페이지">
        <div className="grid grid-cols-1 gap-3">
          <F label="대표 썸네일 URL *" v={f.thumbnail_url} on={(v) => set('thumbnail_url', v)} />
          <label className="text-sm"><span className="block text-gray-500 mb-1">추가 이미지 URL (줄바꿈/쉼표 구분)</span>
            <textarea value={f.image_urls} onChange={(e) => set('image_urls', e.target.value)} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" /></label>
          <label className="text-sm"><span className="block text-gray-500 mb-1">상세페이지 HTML</span>
            <textarea value={f.detail_html} onChange={(e) => set('detail_html', e.target.value)} rows={4} className="w-full border rounded-lg px-3 py-2 text-sm" /></label>
        </div>
      </Section>

      {/* 동적 고시 */}
      {meta && meta.notices.length > 0 && (
        <Section title="상품정보고시 (카테고리 필수)">
          {meta.notices.map((g) => (
            <div key={g.noticeCategoryName} className="mb-3">
              <p className="text-xs font-medium text-gray-400 mb-1">{g.noticeCategoryName}</p>
              <div className="grid grid-cols-2 gap-2">
                {g.fields.map((fd) => (
                  <F key={fd.name} label={fd.name + (fd.required ? ' *' : '')} v={noticeVals[fd.name] || ''}
                    on={(v) => setNoticeVals((p) => ({ ...p, [fd.name]: v }))} />
                ))}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* 동적 속성 */}
      {meta && meta.attributes.length > 0 && (
        <Section title="필수 속성 (카테고리)">
          <div className="grid grid-cols-2 gap-2">
            {meta.attributes.map((a) => (
              <F key={a.name} label={a.name + (a.required ? ' *' : '') + (a.unit ? ` (${a.unit})` : '')}
                v={attrVals[a.name] || ''} on={(v) => setAttrVals((p) => ({ ...p, [a.name]: v }))} />
            ))}
          </div>
        </Section>
      )}

      {/* 옵션 + 공급가 + 구매처링크 */}
      <Section title="옵션 · 공급가 · 재고 · 구매처">
        {options.map((o, i) => (
          <div key={i} className="border rounded-lg p-3 mb-2">
            <div className="grid grid-cols-3 gap-2">
              <OF label="옵션명" v={o.option_name} on={(v) => upd(setOptions, i, 'option_name', v)} />
              <OF label="공급가 *" v={o.supply_price} on={(v) => upd(setOptions, i, 'supply_price', v)} />
              <OF label="재고(공유풀)" v={o.stock} on={(v) => upd(setOptions, i, 'stock', v)} />
              <OF label="SKU" v={o.sku} on={(v) => upd(setOptions, i, 'sku', v)} />
              <OF label="바코드" v={o.barcode} on={(v) => upd(setOptions, i, 'barcode', v)} />
              <OF label="구매처 링크" v={o.purchase_url} on={(v) => upd(setOptions, i, 'purchase_url', v)} />
            </div>
            {options.length > 1 && (
              <button onClick={() => setOptions((p) => p.filter((_, k) => k !== i))} className="mt-2 text-xs text-red-500 flex items-center gap-1"><Trash2 className="w-3 h-3" /> 삭제</button>
            )}
          </div>
        ))}
        <button onClick={() => setOptions((p) => [...p, emptyOption()])} className="text-sm text-blue-600 flex items-center gap-1"><Plus className="w-4 h-4" /> 옵션 추가</button>
      </Section>

      {/* 판매가 범위 */}
      <Section title="판매가 범위 (셀러는 이 안에서만 판매가 설정)">
        <div className="grid grid-cols-2 gap-3">
          <F label="최소 판매가 *" v={f.min_price} on={(v) => set('min_price', v)} />
          <F label="최대 판매가 *" v={f.max_price} on={(v) => set('max_price', v)} />
        </div>
      </Section>

      {/* 배송/반품/AS (드롭십=공급사 발송) */}
      <Section title="배송 · 반품 · A/S (드롭십, 공급사 발송)">
        <div className="grid grid-cols-2 gap-3">
          <F label="택배사 코드" v={f.courier} on={(v) => set('courier', v)} />
          <label className="text-sm"><span className="block text-gray-500 mb-1">배송비 유형</span>
            <select value={f.delivery_charge_type} onChange={(e) => set('delivery_charge_type', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
              <option value="FREE">무료</option><option value="NOT_FREE">유료</option><option value="CONDITIONAL_FREE">조건부무료</option>
            </select></label>
          <F label="배송비" v={f.delivery_charge} on={(v) => set('delivery_charge', v)} />
          <F label="반품 배송비" v={f.return_charge} on={(v) => set('return_charge', v)} />
          <F label="반품지 주소" v={f.return_address} on={(v) => set('return_address', v)} span />
          <F label="반품지 우편번호" v={f.return_zip} on={(v) => set('return_zip', v)} />
          <F label="A/S 전화" v={f.as_tel} on={(v) => set('as_tel', v)} />
          <F label="A/S 안내" v={f.as_guide} on={(v) => set('as_guide', v)} span />
        </div>
      </Section>

      {msg && <p className={`text-sm mb-3 ${msg.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{msg.text}</p>}

      <div className="flex gap-2 sticky bottom-4 bg-white/80 backdrop-blur p-2 rounded-xl border">
        <button onClick={() => submit(false)} disabled={saving} className="flex-1 px-4 py-2.5 text-sm border rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 임시저장
        </button>
        <button onClick={() => submit(true)} disabled={saving} className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-[#E31837] rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} 검수 요청
        </button>
      </div>
    </div>
  );
}

function upd(setter: React.Dispatch<React.SetStateAction<OptionRow[]>>, i: number, k: keyof OptionRow, v: string) {
  setter((p) => p.map((o, k2) => (k2 === i ? { ...o, [k]: v } : o)));
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border rounded-xl p-5 bg-white mb-4">
      <h2 className="font-semibold text-gray-700 mb-3">{title}</h2>
      {children}
    </section>
  );
}
function F({ label, v, on, span }: { label: string; v: string; on: (v: string) => void; span?: boolean }) {
  return (
    <label className={`text-sm ${span ? 'col-span-2' : ''}`}>
      <span className="block text-gray-500 mb-1">{label}</span>
      <input value={v} onChange={(e) => on(e.target.value)} className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31837]/30" />
    </label>
  );
}
function OF({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <label className="text-xs">
      <span className="block text-gray-400 mb-1">{label}</span>
      <input value={v} onChange={(e) => on(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
    </label>
  );
}
