'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2, RefreshCw, Save, Send, PackagePlus, Smartphone, X, Eye, Wand2, BookmarkPlus, Check } from 'lucide-react';
import type { SupplierCategoryMeta } from '@/lib/megaload/supplier/category-meta';
import ImageGallery from '@/components/supplier/ImageGallery';
import SupplierPhonePreview from '@/components/supplier/SupplierPhonePreview';
import CategorySearchField from '@/components/supplier/CategorySearchField';
import DetailEditor from '@/components/supplier/DetailEditor';

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
    detail_html: '',
    min_price: '', max_price: '',
    courier: '', delivery_charge_type: 'FREE', delivery_charge: '', return_charge: '',
    return_address: '', return_zip: '', as_tel: '', as_guide: '',
  });
  const [images, setImages] = useState<string[]>([]);
  const [options, setOptions] = useState<OptionRow[]>([emptyOption()]);
  const [meta, setMeta] = useState<SupplierCategoryMeta | null>(null);
  const [noticeVals, setNoticeVals] = useState<Record<string, string>>({});
  const [attrVals, setAttrVals] = useState<Record<string, string>>({});
  const [metaLoading, setMetaLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [catLoading, setCatLoading] = useState(false);
  const [catConfidence, setCatConfidence] = useState<number | null>(null);
  const [uncertainAttrs, setUncertainAttrs] = useState<string[]>([]);
  const [savingDefault, setSavingDefault] = useState(false);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  // 계정의 기본 배송/AS 프로필 → 신규 상품에 자동 상속(반복입력 제거)
  useEffect(() => {
    fetch('/api/supplier/account').then((r) => r.json()).then((d) => {
      const sp = d?.supplier?.default_shipping_profile as Record<string, unknown> | undefined;
      if (sp && typeof sp === 'object' && Object.keys(sp).length > 0) {
        setF((p) => ({
          ...p,
          courier: (sp.courier as string) ?? p.courier,
          delivery_charge_type: (sp.deliveryChargeType as string) ?? p.delivery_charge_type,
          delivery_charge: sp.deliveryCharge != null ? String(sp.deliveryCharge) : p.delivery_charge,
          return_charge: sp.returnCharge != null ? String(sp.returnCharge) : p.return_charge,
          return_address: (sp.returnAddress as string) ?? p.return_address,
          return_zip: (sp.returnZipCode as string) ?? p.return_zip,
          as_tel: (sp.afterServiceTel as string) ?? p.as_tel,
          as_guide: (sp.afterServiceGuide as string) ?? p.as_guide,
        }));
      }
    }).catch(() => {});
  }, []);

  const loadMeta = useCallback(async (codeArg?: string) => {
    const code = codeArg ?? f.category_code;
    if (!code) { setMsg({ type: 'error', text: '카테고리 코드를 먼저 입력하세요.' }); return; }
    setMetaLoading(true); setMsg(null);
    try {
      const qs = `categoryCode=${encodeURIComponent(code)}&productName=${encodeURIComponent(f.seller_product_name)}`;
      const res = await fetch(`/api/supplier/category-meta?${qs}`);
      const data = await res.json();
      if (!res.ok && !data.notices) throw new Error(data.error || '메타 조회 실패');
      setMeta({ notices: data.notices || [], attributes: data.attributes || [] });
      // 자동채움 제안값을 빈 칸에만 채움(사용자 입력 우선)
      const suggested = (data.suggestedAttributes || {}) as Record<string, string>;
      if (Object.keys(suggested).length > 0) setAttrVals((prev) => ({ ...suggested, ...prev }));
      setUncertainAttrs(Array.isArray(data.uncertainAttributes) ? data.uncertainAttributes : []);
      if ((data.notices?.length ?? 0) === 0 && (data.attributes?.length ?? 0) === 0) {
        setMsg({ type: 'error', text: '이 카테고리의 고시/속성 메타가 없습니다. 직접 입력해도 됩니다.' });
      }
    } catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : '메타 조회 실패' }); }
    finally { setMetaLoading(false); }
  }, [f.category_code, f.seller_product_name]);

  // 상품명으로 카테고리 자동 추천 → 코드/경로 채우고 고시·속성까지 자동 로드
  const autoCategory = useCallback(async () => {
    if (!f.seller_product_name.trim()) { setMsg({ type: 'error', text: '먼저 상품명을 입력해주세요.' }); return; }
    setCatLoading(true); setMsg(null); setCatConfidence(null);
    try {
      const res = await fetch('/api/supplier/auto-category', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: f.seller_product_name }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ type: 'error', text: data.error || '카테고리 추천 실패' }); return; }
      setF((p) => ({ ...p, category_code: data.categoryCode, category_path: data.categoryPath || data.categoryName || p.category_path }));
      setCatConfidence(typeof data.confidence === 'number' ? data.confidence : null);
      await loadMeta(data.categoryCode);
    } catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : '카테고리 추천 실패' }); }
    finally { setCatLoading(false); }
  }, [f.seller_product_name, loadMeta]);

  // 현재 배송/AS 정보를 계정 기본값으로 저장(다음 상품부터 자동 적용)
  const saveShippingDefault = useCallback(async () => {
    setSavingDefault(true); setMsg(null);
    try {
      const profile = {
        courier: f.courier, deliveryChargeType: f.delivery_charge_type,
        deliveryCharge: Number(f.delivery_charge) || 0, returnCharge: Number(f.return_charge) || 0,
        returnAddress: f.return_address, returnZipCode: f.return_zip,
        afterServiceTel: f.as_tel, afterServiceGuide: f.as_guide,
      };
      const res = await fetch('/api/supplier/account', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_shipping_profile: profile }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ type: 'error', text: data.error || '기본값 저장 실패' }); return; }
      setMsg({ type: 'success', text: '기본 배송정보로 저장했습니다. 다음 상품부터 자동으로 채워집니다.' });
    } catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : '기본값 저장 실패' }); }
    finally { setSavingDefault(false); }
  }, [f]);

  const submit = async (doSubmit: boolean) => {
    setSaving(true); setMsg(null);
    try {
      const body = {
        category_code: f.category_code, category_path: f.category_path,
        seller_product_name: f.seller_product_name, display_product_name: f.display_product_name,
        brand: f.brand, manufacturer: f.manufacturer, origin: f.origin,
        search_tags: f.search_tags.split(',').map((s) => s.trim()).filter(Boolean),
        thumbnail_url: images[0] || '',
        image_urls: images.slice(1),
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

  const previewData = useMemo(() => ({
    name: f.seller_product_name,
    brand: f.brand,
    images,
    minPrice: Number(f.min_price) || 0,
    maxPrice: Number(f.max_price) || 0,
    origin: f.origin,
    categoryPath: f.category_path,
    options: options.filter((o) => o.option_name.trim()).map((o) => ({ name: '', value: o.option_name })),
    detailHtml: f.detail_html,
    freeShipping: f.delivery_charge_type === 'FREE',
  }), [f, images, options]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="absolute inset-0 -z-10" style={{ background: 'linear-gradient(160deg,#F7F8FC 0%,#F4F1FB 45%,#EDF7F3 100%)' }} />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-extrabold flex items-center gap-2 text-gray-900">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg shadow-emerald-500/30"><PackagePlus className="w-5 h-5" /></span>
            상품 등록
          </h1>
          <button onClick={() => setMobilePreview(true)}
            className="lg:hidden inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl bg-white/70 backdrop-blur border border-white/70 text-gray-700">
            <Smartphone className="w-4 h-4 text-emerald-600" /> 미리보기
          </button>
        </div>

        <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
          {/* ─── 좌: 입력 폼 ─── */}
          <div className="space-y-5 min-w-0">
            <p className="text-xs text-gray-500 -mb-1">
              <span className="text-[#E31837] font-bold">*</span> 표시는 <b className="text-gray-700">쿠팡 등록 필수값</b>이에요. 비우면 검수 요청이 막힙니다.
            </p>
            {/* 기본 정보 */}
            <Card title="기본 정보" desc="상품명만 입력하고 '상품명으로 자동'을 누르면 카테고리·필수속성이 자동으로 채워집니다. 코드를 몰라도 됩니다.">
              <div className="grid grid-cols-2 gap-3">
                <F label="상품명" req v={f.seller_product_name} on={(v) => set('seller_product_name', v)} span ph="예: 국내산 햇 감자 5kg 특품 박스" hint="구체적일수록 잘 팔려요 (원산지·용량·등급 포함)" />
                <div className="col-span-2 space-y-2">
                  <div className="flex gap-2 items-end">
                    <F label="쿠팡 카테고리 코드" req v={f.category_code} on={(v) => set('category_code', v)} ph="예: 56137" />
                    <button onClick={autoCategory} disabled={catLoading}
                      className="shrink-0 h-[42px] px-3.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white text-sm font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-500/25 disabled:opacity-50">
                      {catLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} 상품명으로 자동
                    </button>
                    <button onClick={() => loadMeta()} disabled={metaLoading} title="현재 코드로 고시/속성 다시 불러오기"
                      className="shrink-0 h-[42px] px-3 rounded-xl bg-white/80 border border-gray-200 text-gray-600 text-sm flex items-center gap-1.5 disabled:opacity-50">
                      {metaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </button>
                  </div>
                  {catConfidence !== null && (
                    <p className="text-xs text-emerald-600 flex items-center gap-1">
                      <Check className="w-3 h-3" /> 자동 추천됨 (신뢰도 {Math.round(catConfidence * 100)}%){f.category_path ? ` · ${f.category_path}` : ''}. 다르면 코드를 직접 고치세요.
                    </p>
                  )}
                </div>
                <CategorySearchField
                  path={f.category_path}
                  code={f.category_code}
                  onSelect={(code, path) => {
                    setF((p) => ({ ...p, category_code: code, category_path: path }));
                    setCatConfidence(null);
                    loadMeta(code);
                  }}
                />
                <F label="원산지" v={f.origin} on={(v) => set('origin', v)} ph="예: 국내산(강원도)" />
                <F label="브랜드" v={f.brand} on={(v) => set('brand', v)} ph="예: 메가로드팜" />
                <F label="제조사" v={f.manufacturer} on={(v) => set('manufacturer', v)} ph="예: 메가로드팜" />
                <F label="검색태그 (쉼표 구분)" v={f.search_tags} on={(v) => set('search_tags', v)} span ph="감자, 국내산, 5kg, 요리용, 알감자" />
              </div>
            </Card>

            {/* 이미지 */}
            <Card title="상품 이미지" req desc="끌어다 놓기 · 클릭 · Ctrl+V 붙여넣기 · URL 모두 가능. 첫 장이 대표 썸네일입니다 (대표 1장 필수).">
              <ImageGallery urls={images} onChange={setImages} />
              {images.length === 0 && <p className="text-xs text-[#E31837] mt-2">대표 이미지 최소 1장은 필수입니다.</p>}
            </Card>

            {/* 상세페이지 */}
            <Card title="상세페이지" desc="글은 그냥 쓰고, 상세 이미지는 통째로 끌어다 놓거나 Ctrl+V. 워드에서 복사해 붙여넣어도 됩니다.">
              <DetailEditor html={f.detail_html} onChange={(h) => set('detail_html', h)} />
            </Card>

            {/* 동적 고시 */}
            {meta && meta.notices.length > 0 && (
              <Card title="상품정보고시 (카테고리 필수)">
                {meta.notices.map((g) => (
                  <div key={g.noticeCategoryName} className="mb-3">
                    <p className="text-xs font-medium text-gray-400 mb-1.5">{g.noticeCategoryName}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {g.fields.map((fd) => (
                        <F key={fd.name} label={fd.name} req={fd.required} v={noticeVals[fd.name] || ''}
                          on={(v) => setNoticeVals((p) => ({ ...p, [fd.name]: v }))} />
                      ))}
                    </div>
                  </div>
                ))}
              </Card>
            )}

            {/* 동적 속성 */}
            {meta && meta.attributes.length > 0 && (
              <Card title="필수 속성 (카테고리)" desc="상품명 기준으로 채울 수 있는 값은 미리 넣었어요. 노란색은 꼭 확인·수정하세요.">
                <div className="grid grid-cols-2 gap-2">
                  {meta.attributes.map((a) => {
                    const uncertain = uncertainAttrs.includes(a.name);
                    return (
                      <F key={a.name} label={a.name + (a.unit ? ` (${a.unit})` : '')} req={a.required}
                        v={attrVals[a.name] || ''} on={(v) => setAttrVals((p) => ({ ...p, [a.name]: v }))}
                        warn={uncertain} hint={uncertain ? '자동입력됨 · 확인 필요' : undefined} />
                    );
                  })}
                </div>
              </Card>
            )}

            {/* 옵션 */}
            <Card title="옵션 · 공급가 · 재고 · 구매처" desc="공급가는 셀러 매입가, 재고는 전 셀러 공유풀입니다.">
              {options.map((o, i) => (
                <div key={i} className="rounded-xl border border-gray-200/80 bg-white/60 p-3 mb-2">
                  <div className="grid grid-cols-3 gap-2">
                    <OF label="옵션명" v={o.option_name} on={(v) => upd(setOptions, i, 'option_name', v)} ph="5kg" />
                    <OF label="공급가" req v={o.supply_price} on={(v) => upd(setOptions, i, 'supply_price', v)} ph="8000" />
                    <OF label="재고(공유풀)" v={o.stock} on={(v) => upd(setOptions, i, 'stock', v)} ph="100" />
                    <OF label="SKU" v={o.sku} on={(v) => upd(setOptions, i, 'sku', v)} />
                    <OF label="바코드" v={o.barcode} on={(v) => upd(setOptions, i, 'barcode', v)} />
                    <OF label="구매처 링크" v={o.purchase_url} on={(v) => upd(setOptions, i, 'purchase_url', v)} />
                  </div>
                  {options.length > 1 && (
                    <button onClick={() => setOptions((p) => p.filter((_, k) => k !== i))} className="mt-2 text-xs text-rose-500 flex items-center gap-1"><Trash2 className="w-3 h-3" /> 삭제</button>
                  )}
                </div>
              ))}
              <button onClick={() => setOptions((p) => [...p, emptyOption()])} className="text-sm text-emerald-600 font-medium flex items-center gap-1"><Plus className="w-4 h-4" /> 옵션 추가</button>
            </Card>

            {/* 판매가 범위 */}
            <Card title="판매가 범위" desc="셀러는 이 범위 안에서만 판매가를 정할 수 있어요.">
              <div className="grid grid-cols-2 gap-3">
                <F label="최소 판매가" req v={f.min_price} on={(v) => set('min_price', v)} ph="9900" />
                <F label="최대 판매가" req v={f.max_price} on={(v) => set('max_price', v)} ph="14900" />
              </div>
            </Card>

            {/* 배송/반품/AS */}
            <Card title="배송 · 반품 · A/S" desc="드롭십(공급사 발송) 기준. 한 번 '기본값으로 저장'하면 다음 상품부터 자동으로 채워집니다.">
              <div className="grid grid-cols-2 gap-3">
                <F label="택배사 코드" v={f.courier} on={(v) => set('courier', v)} ph="예: CJGLS" />
                <label className="text-sm"><span className="block text-gray-500 mb-1.5 text-[13px]">배송비 유형</span>
                  <select value={f.delivery_charge_type} onChange={(e) => set('delivery_charge_type', e.target.value)}
                    className="w-full bg-white/80 border border-gray-200/80 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40">
                    <option value="FREE">무료</option><option value="NOT_FREE">유료</option><option value="CONDITIONAL_FREE">조건부무료</option>
                  </select></label>
                <F label="배송비" v={f.delivery_charge} on={(v) => set('delivery_charge', v)} ph="3000" />
                <F label="반품 배송비" v={f.return_charge} on={(v) => set('return_charge', v)} ph="3000" />
                <F label="반품지 주소" v={f.return_address} on={(v) => set('return_address', v)} span ph="예: 강원도 ..." />
                <F label="반품지 우편번호" v={f.return_zip} on={(v) => set('return_zip', v)} ph="예: 24000" />
                <F label="A/S 전화" v={f.as_tel} on={(v) => set('as_tel', v)} ph="예: 010-0000-0000" />
                <F label="A/S 안내" v={f.as_guide} on={(v) => set('as_guide', v)} span ph="예: 평일 09~18시" />
              </div>
              <button onClick={saveShippingDefault} disabled={savingDefault}
                className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                {savingDefault ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className="w-4 h-4" />} 이 배송정보를 기본값으로 저장
              </button>
            </Card>

            {msg && <p className={`text-sm ${msg.type === 'error' ? 'text-rose-600' : 'text-emerald-600'}`}>{msg.text}</p>}

            <div className="flex gap-2 sticky bottom-4 bg-white/70 backdrop-blur-xl p-2 rounded-2xl border border-white/70 shadow-lg">
              <button onClick={() => submit(false)} disabled={saving} className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white/70 flex items-center justify-center gap-1.5 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 임시저장
              </button>
              <button onClick={() => submit(true)} disabled={saving} className="flex-[1.4] px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-1.5 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} 검수 요청
              </button>
            </div>
          </div>

          {/* ─── 우: 실시간 폰 미리보기 (lg+) ─── */}
          <div className="hidden lg:block sticky top-6">
            <div className="flex items-center gap-1.5 justify-center mb-3 text-xs font-medium text-gray-500">
              <Eye className="w-3.5 h-3.5 text-emerald-500" /> 고객에게 이렇게 보여요 (실시간)
            </div>
            <SupplierPhonePreview data={previewData} />
          </div>
        </div>
      </div>

      {/* 모바일 미리보기 오버레이 */}
      {mobilePreview && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setMobilePreview(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end mb-2">
              <button onClick={() => setMobilePreview(false)} className="w-8 h-8 rounded-full bg-white grid place-items-center text-gray-500 shadow"><X className="w-4 h-4" /></button>
            </div>
            <SupplierPhonePreview data={previewData} />
          </div>
        </div>
      )}
    </div>
  );
}

function upd(setter: React.Dispatch<React.SetStateAction<OptionRow[]>>, i: number, k: keyof OptionRow, v: string) {
  setter((p) => p.map((o, k2) => (k2 === i ? { ...o, [k]: v } : o)));
}

function Card({ title, desc, children, req }: { title: string; desc?: string; children: React.ReactNode; req?: boolean }) {
  return (
    <section className="relative rounded-[1.5rem] border border-white/70 bg-white/70 backdrop-blur-xl p-5 shadow-[0_12px_40px_-18px_rgba(80,80,160,0.28)]">
      <div aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
      <h2 className="font-bold text-gray-900">{title}{req && <span className="text-[#E31837] font-bold"> *</span>}</h2>
      {desc && <p className="text-xs text-gray-500 mt-0.5 mb-3">{desc}</p>}
      {!desc && <div className="mb-3" />}
      {children}
    </section>
  );
}

function F({ label, v, on, span, ph, hint, warn, req }: { label: string; v: string; on: (v: string) => void; span?: boolean; ph?: string; hint?: string; warn?: boolean; req?: boolean }) {
  const emptyReq = req && !v.trim();
  const border = warn
    ? 'border-amber-300 focus:ring-amber-400/40 focus:border-amber-400'
    : emptyReq
      ? 'border-[#E31837]/50 focus:ring-[#E31837]/25 focus:border-[#E31837]'
      : 'border-gray-200/80 focus:ring-emerald-400/40 focus:border-emerald-400';
  return (
    <label className={`text-sm ${span ? 'col-span-2' : ''}`}>
      <span className={`block mb-1.5 text-[13px] ${req ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
        {label}{req && <span className="text-[#E31837] font-bold"> *</span>}
      </span>
      <input value={v} onChange={(e) => on(e.target.value)} placeholder={ph}
        className={`w-full bg-white/80 border rounded-xl px-3.5 py-2.5 text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 transition ${border}`} />
      {hint && <span className={`block text-[11px] mt-1 ${warn ? 'text-amber-600' : 'text-emerald-600/80'}`}>{hint}</span>}
    </label>
  );
}

function OF({ label, v, on, ph, req }: { label: string; v: string; on: (v: string) => void; ph?: string; req?: boolean }) {
  const emptyReq = req && !v.trim();
  return (
    <label className="text-xs">
      <span className={`block mb-1 ${req ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
        {label}{req && <span className="text-[#E31837] font-bold"> *</span>}
      </span>
      <input value={v} onChange={(e) => on(e.target.value)} placeholder={ph}
        className={`w-full bg-white/80 border rounded-lg px-2.5 py-1.5 text-sm placeholder:text-gray-300 focus:outline-none focus:ring-2 ${emptyReq ? 'border-[#E31837]/50 focus:ring-[#E31837]/25' : 'border-gray-200/80 focus:ring-emerald-400/40'}`} />
    </label>
  );
}
