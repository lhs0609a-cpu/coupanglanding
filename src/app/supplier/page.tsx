'use client';

import { useEffect, useState, useCallback } from 'react';
import { Building2, CreditCard, Check, Lock, Loader2, PackagePlus, ShieldCheck, TrendingUp, Upload, X } from 'lucide-react';
import SupplierCardRegistration from '@/components/supplier/SupplierCardRegistration';
import BrandLogoMarquee from '@/components/supplier/BrandLogoMarquee';
import type { Supplier, SupplierUploadGate } from '@/lib/megaload/supplier/types';

export default function SupplierHomePage() {
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [gate, setGate] = useState<SupplierUploadGate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 계정 폼
  const [form, setForm] = useState({
    company_name: '', brand_name: '', business_number: '',
    contact_email: '', contact_phone: '', logo_url: '', logo_public_consent: true,
  });

  // 서류 재제출 (반려 시)
  const [reForm, setReForm] = useState({ homepage_url: '', mall_url: '', applicant_note: '' });
  const [reLicense, setReLicense] = useState<File | null>(null);
  const [reMfr, setReMfr] = useState<File[]>([]);
  const [resubmitting, setResubmitting] = useState(false);
  const [reMsg, setReMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/supplier/account');
      const data = await res.json();
      setSupplier(data.supplier);
      setGate(data.gate);
      if (data.supplier) {
        setForm((f) => ({
          ...f,
          company_name: data.supplier.company_name || '',
          brand_name: data.supplier.brand_name || '',
          business_number: data.supplier.business_number || '',
          contact_email: data.supplier.contact_email || '',
          contact_phone: data.supplier.contact_phone || '',
          logo_url: data.supplier.logo_url || '',
          logo_public_consent: data.supplier.logo_public_consent ?? true,
        }));
        setReForm({
          homepage_url: data.supplier.homepage_url || '',
          mall_url: data.supplier.mall_url || '',
          applicant_note: data.supplier.applicant_note || '',
        });
      }
    } catch { setError('불러오기 실패'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/supplier/account', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      setSupplier(data.supplier); setGate(data.gate);
    } catch (e) { setError(e instanceof Error ? e.message : '저장 실패'); }
    finally { setSaving(false); }
  };

  const resubmit = async () => {
    setResubmitting(true); setReMsg(null);
    try {
      const fd = new FormData();
      Object.entries(reForm).forEach(([k, v]) => fd.append(k, v));
      if (reLicense) fd.append('business_license', reLicense);
      reMfr.forEach((d) => fd.append('manufacturer_docs', d));
      const res = await fetch('/api/supplier/resubmit', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setReMsg({ type: 'error', text: data.error || '재제출 실패' }); return; }
      setReMsg({ type: 'success', text: '재제출되었습니다. 관리자 재심사 후 안내됩니다.' });
      setReLicense(null); setReMfr([]);
      await load();
    } catch { setReMsg({ type: 'error', text: '서버 오류가 발생했습니다.' }); }
    finally { setResubmitting(false); }
  };

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;
  }

  const hasCard = supplier?.billing_status === 'active';
  const canUpload = gate?.canUpload;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="w-6 h-6 text-[#E31837]" /> 공급사 센터
        </h1>
        <a href="/supplier/dashboard" className="text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4" /> 판매·정산 현황
        </a>
      </div>
      <p className="text-gray-500 text-sm mb-6">상품을 등록하면 우리 셀러망이 각자 채널에서 판매합니다. 판매가 일어난 만큼만 수수료를 냅니다.</p>

      {/* 가입 심사 상태 배너 */}
      {supplier && supplier.status !== 'approved' && (
        <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
          supplier.status === 'suspended' ? 'bg-rose-50 border-rose-200 text-rose-700'
            : supplier.rejection_reason ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-sky-50 border-sky-200 text-sky-800'
        }`}>
          {supplier.status === 'suspended' ? (
            <><b>계정이 정지되었습니다.</b> 자세한 내용은 고객센터로 문의해주세요.</>
          ) : supplier.rejection_reason ? (
            <><b>가입이 반려되었습니다.</b> 사유: {supplier.rejection_reason}<br />서류를 보완하신 뒤 아래 정보를 수정·저장하거나 고객센터로 재제출해주세요. 재검토 후 승인되면 상품 등록이 열립니다.</>
          ) : (
            <><b>가입 심사 중입니다.</b> 제출하신 사업자등록증·증빙서류를 관리자가 검토하고 있습니다. <b>승인이 완료되면 상품 등록이 가능</b>합니다.</>
          )}
        </div>
      )}
      {supplier && supplier.status === 'approved' && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <b>가입이 승인되었습니다.</b> 카드 등록 후 상품을 등록하면 셀러망이 판매를 시작합니다.
        </div>
      )}

      {/* 서류 재제출 (반려 시) */}
      {supplier && supplier.status !== 'approved' && supplier.rejection_reason && (
        <section className="border border-amber-200 rounded-xl p-5 bg-amber-50/40 mb-6">
          <h2 className="font-semibold mb-1 flex items-center gap-2 text-amber-900"><Upload className="w-4 h-4" /> 서류 재제출</h2>
          <p className="text-sm text-gray-600 mb-4">보완할 정보·서류를 올리고 재제출하면 관리자가 다시 심사합니다. <b>파일을 비워두면 기존 제출본이 유지</b>됩니다.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="회사 홈페이지 URL" value={reForm.homepage_url} onChange={(v) => setReForm({ ...reForm, homepage_url: v })} />
            <Field label="쇼핑몰/스토어 URL" value={reForm.mall_url} onChange={(v) => setReForm({ ...reForm, mall_url: v })} />
          </div>
          <div className="mt-3">
            <label className="block text-xs text-gray-500 mb-1">사업자등록증 재업로드 (선택)</label>
            {reLicense ? (
              <div className="flex items-center justify-between text-sm bg-white border rounded-lg px-3 py-2">
                <span className="truncate">{reLicense.name}</span>
                <button type="button" onClick={() => setReLicense(null)} className="text-gray-400 hover:text-rose-500"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <input type="file" accept=".pdf,image/*" onChange={(e) => setReLicense(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-amber-100 file:text-amber-800 file:font-medium hover:file:bg-amber-200" />
            )}
          </div>
          <div className="mt-3">
            <label className="block text-xs text-gray-500 mb-1">제조/공장·상표 증빙 재업로드 (선택 · 올리면 교체)</label>
            <input type="file" multiple accept=".pdf,image/*" onChange={(e) => setReMfr((p) => [...p, ...Array.from(e.target.files || [])])}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-amber-100 file:text-amber-800 file:font-medium hover:file:bg-amber-200" />
            {reMfr.length > 0 && (
              <ul className="mt-2 space-y-1">
                {reMfr.map((d, i) => (
                  <li key={i} className="flex items-center justify-between text-xs bg-white border rounded px-2.5 py-1.5">
                    <span className="truncate">{d.name}</span>
                    <button type="button" onClick={() => setReMfr((p) => p.filter((_, j) => j !== i))} className="text-gray-400 hover:text-rose-500"><X className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {reMsg && <p className={`text-sm mt-3 ${reMsg.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>{reMsg.text}</p>}
          <button onClick={resubmit} disabled={resubmitting}
            className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
            {resubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} 재제출하기
          </button>
        </section>
      )}

      <BrandLogoMarquee />


      {/* 진행 단계 */}
      <div className="flex items-center gap-2 mb-8 text-sm">
        <Step done={!!supplier} label="① 계정" />
        <div className="flex-1 h-px bg-gray-200" />
        <Step done={hasCard} label="② 카드 등록" />
        <div className="flex-1 h-px bg-gray-200" />
        <Step done={!!canUpload} label="③ 상품 등록" />
      </div>

      {/* ① 계정 정보 */}
      <section className="border rounded-xl p-5 bg-white mb-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2"><Building2 className="w-4 h-4" /> 회사·브랜드 정보</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="회사명 *" value={form.company_name} onChange={(v) => setForm({ ...form, company_name: v })} />
          <Field label="브랜드명" value={form.brand_name} onChange={(v) => setForm({ ...form, brand_name: v })} />
          <Field label="사업자등록번호" value={form.business_number} onChange={(v) => setForm({ ...form, business_number: v })} />
          <Field label="담당자 연락처" value={form.contact_phone} onChange={(v) => setForm({ ...form, contact_phone: v })} />
          <Field label="담당자 이메일" value={form.contact_email} onChange={(v) => setForm({ ...form, contact_email: v })} />
          <Field label="로고 이미지 URL" value={form.logo_url} onChange={(v) => setForm({ ...form, logo_url: v })} />
        </div>
        <label className="flex items-center gap-2 mt-3 text-sm text-gray-600">
          <input type="checkbox" checked={form.logo_public_consent}
            onChange={(e) => setForm({ ...form, logo_public_consent: e.target.checked })} />
          홈페이지·카탈로그에 브랜드 로고 노출 동의 (신뢰도↑ · 셀러 유입↑)
        </label>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <button onClick={save} disabled={saving || !form.company_name}
          className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-[#E31837] text-white hover:opacity-90 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {supplier ? '저장' : '계정 만들기'}
        </button>
      </section>

      {/* ② 카드 게이트 */}
      <section className="border rounded-xl p-5 bg-white mb-6">
        <h2 className="font-semibold mb-1 flex items-center gap-2"><CreditCard className="w-4 h-4" /> 자동결제 카드</h2>
        <p className="text-sm text-gray-500 mb-4">판매가 발생한 만큼의 수수료가 매월 이 카드로 자동결제됩니다. <b>카드를 등록해야 상품을 올릴 수 있어요.</b></p>
        {!supplier ? (
          <p className="text-sm text-amber-600">먼저 위에서 계정을 만들어주세요.</p>
        ) : hasCard ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-4 py-3">
            <ShieldCheck className="w-4 h-4" /> {supplier.card_company} {supplier.card_number} 등록됨 — 자동결제 활성화
          </div>
        ) : (
          <SupplierCardRegistration />
        )}
      </section>

      {/* ③ 상품 등록 게이트 */}
      <section className="border rounded-xl p-5 bg-white">
        <h2 className="font-semibold mb-1 flex items-center gap-2"><PackagePlus className="w-4 h-4" /> 상품 등록</h2>
        {canUpload ? (
          <a href="/supplier/products/new"
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-[#E31837] text-white hover:opacity-90">
            <PackagePlus className="w-4 h-4" /> 새 상품 등록하기
          </a>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-3">
            <Lock className="w-4 h-4" /> {gate?.reason || '먼저 계정과 카드를 등록해주세요.'}
          </div>
        )}
      </section>
    </div>
  );
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-1 font-medium ${done ? 'text-emerald-600' : 'text-gray-400'}`}>
      {done ? <Check className="w-4 h-4" /> : <span className="w-4 h-4 rounded-full border border-current" />} {label}
    </span>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-sm">
      <span className="block text-gray-500 mb-1">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31837]/30" />
    </label>
  );
}
