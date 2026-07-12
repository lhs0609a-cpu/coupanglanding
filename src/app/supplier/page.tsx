'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { Building2, CreditCard, Check, Lock, Loader2, PackagePlus, ShieldCheck, TrendingUp, Upload, X, ArrowRight, Sparkles } from 'lucide-react';
import SupplierCardRegistration from '@/components/supplier/SupplierCardRegistration';
import BrandLogoMarquee from '@/components/supplier/BrandLogoMarquee';
import type { Supplier, SupplierUploadGate } from '@/lib/megaload/supplier/types';

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

export default function SupplierHomePage() {
  const reduced = useReducedMotion();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [gate, setGate] = useState<SupplierUploadGate | null>(null);
  const [productCount, setProductCount] = useState(0);
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
        // 등록한 상품 수 — 진행 단계 표시용
        try {
          const pr = await fetch('/api/supplier/products');
          const pd = await pr.json();
          setProductCount(Array.isArray(pd.products) ? pd.products.length : 0);
        } catch { /* 무시 */ }
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

  const hasCard = supplier?.billing_status === 'active';
  const canUpload = gate?.canUpload;
  const accountDone = supplier?.status === 'approved';
  const stepIndex = hasCard ? 3 : productCount > 0 ? 2 : accountDone ? 1 : 0;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <Backdrop reduced={!!reduced} />

      {loading ? (
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500/70" />
        </div>
      ) : (
        <div className="relative z-10 max-w-3xl mx-auto px-4 py-10 sm:py-14">
          {/* 헤더 */}
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-start justify-between gap-3 mb-6">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 backdrop-blur px-3 py-1 text-xs font-medium text-emerald-700 border border-white/70 shadow-sm mb-3">
                <Sparkles className="w-3.5 h-3.5" /> 공급사 파트너
              </span>
              <h1 className="text-[28px] leading-tight font-extrabold text-gray-900 flex items-center gap-2">
                <span className="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg shadow-emerald-500/30">
                  <Building2 className="w-5 h-5" />
                </span>
                공급사 센터
              </h1>
              <p className="text-gray-500 text-sm mt-2 max-w-md">
                상품을 등록하면 우리 셀러망이 각 채널에서 판매합니다. <b className="text-gray-700">판매가 일어난 만큼만</b> 수수료를 냅니다.
              </p>
            </div>
            <a href="/supplier/dashboard"
              className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-xl bg-white/70 backdrop-blur border border-white/70 shadow-sm text-gray-700 hover:bg-white transition">
              <TrendingUp className="w-4 h-4 text-emerald-600" /> 판매·정산
            </a>
          </motion.div>

          {/* 가입 심사 상태 배너 */}
          {supplier && supplier.status !== 'approved' && (
            <div className={`mb-6 rounded-2xl border backdrop-blur px-4 py-3.5 text-sm ${
              supplier.status === 'suspended' ? 'bg-rose-50/80 border-rose-200/70 text-rose-700'
                : supplier.rejection_reason ? 'bg-amber-50/80 border-amber-200/70 text-amber-800'
                : 'bg-sky-50/80 border-sky-200/70 text-sky-800'
            }`}>
              {supplier.status === 'suspended' ? (
                <><b>계정이 정지되었습니다.</b> 자세한 내용은 고객센터로 문의해주세요.</>
              ) : supplier.rejection_reason ? (
                <><b>가입이 반려되었습니다.</b> 사유: {supplier.rejection_reason}<br />서류를 보완하신 뒤 아래에서 재제출해주세요. 재검토 후 승인되면 상품 등록이 열립니다.</>
              ) : (
                <><b>가입 심사 중입니다.</b> 제출하신 서류를 관리자가 검토하고 있습니다. <b>승인되면 상품 등록이 가능</b>합니다.</>
              )}
            </div>
          )}
          {supplier && supplier.status === 'approved' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="mb-6 rounded-2xl border border-emerald-200/70 bg-emerald-50/80 backdrop-blur px-4 py-3.5 text-sm text-emerald-800">
              <b>가입이 승인되었습니다 🎉</b> 먼저 <b>상품을 등록</b>하세요. 마친 뒤 <b>자동결제 카드</b>를 등록하면 셀러망이 판매를 시작합니다.
            </motion.div>
          )}

          {/* 서류 재제출 (반려 시) */}
          {supplier && supplier.status !== 'approved' && supplier.rejection_reason && (
            <GlassCard className="border-amber-200/60 mb-6">
              <h2 className="font-semibold mb-1 flex items-center gap-2 text-amber-900"><Upload className="w-4 h-4" /> 서류 재제출</h2>
              <p className="text-sm text-gray-600 mb-4">보완할 정보·서류를 올리고 재제출하면 관리자가 다시 심사합니다. <b>파일을 비워두면 기존 제출본이 유지</b>됩니다.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="회사 홈페이지 URL" value={reForm.homepage_url} onChange={(v) => setReForm({ ...reForm, homepage_url: v })} />
                <Field label="쇼핑몰/스토어 URL" value={reForm.mall_url} onChange={(v) => setReForm({ ...reForm, mall_url: v })} />
              </div>
              <div className="mt-3">
                <label className="block text-xs text-gray-500 mb-1">사업자등록증 재업로드 (선택)</label>
                {reLicense ? (
                  <div className="flex items-center justify-between text-sm bg-white/80 border border-gray-200 rounded-xl px-3 py-2">
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
                      <li key={i} className="flex items-center justify-between text-xs bg-white/80 border border-gray-200 rounded px-2.5 py-1.5">
                        <span className="truncate">{d.name}</span>
                        <button type="button" onClick={() => setReMfr((p) => p.filter((_, j) => j !== i))} className="text-gray-400 hover:text-rose-500"><X className="w-3.5 h-3.5" /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {reMsg && <p className={`text-sm mt-3 ${reMsg.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>{reMsg.text}</p>}
              <button onClick={resubmit} disabled={resubmitting}
                className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
                {resubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} 재제출하기
              </button>
            </GlassCard>
          )}

          {/* 진행 스텝퍼 */}
          <Stepper index={stepIndex} steps={['계정', '상품 등록', '카드 등록']} />

          <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
            {/* ① 계정 정보 */}
            <motion.section variants={item}>
              <GlassCard>
                <SectionHead n={1} icon={<Building2 className="w-4 h-4" />} title="회사·브랜드 정보" done={accountDone} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                  <Field label="회사명 *" value={form.company_name} onChange={(v) => setForm({ ...form, company_name: v })} />
                  <Field label="브랜드명" value={form.brand_name} onChange={(v) => setForm({ ...form, brand_name: v })} />
                  <Field label="사업자등록번호" value={form.business_number} onChange={(v) => setForm({ ...form, business_number: v })} />
                  <Field label="담당자 연락처" value={form.contact_phone} onChange={(v) => setForm({ ...form, contact_phone: v })} />
                  <Field label="담당자 이메일" value={form.contact_email} onChange={(v) => setForm({ ...form, contact_email: v })} />
                  <Field label="로고 이미지 URL" value={form.logo_url} onChange={(v) => setForm({ ...form, logo_url: v })} />
                </div>
                <label className="flex items-center gap-2 mt-4 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={form.logo_public_consent} className="accent-emerald-500 w-4 h-4"
                    onChange={(e) => setForm({ ...form, logo_public_consent: e.target.checked })} />
                  홈페이지·카탈로그에 브랜드 로고 노출 동의 <span className="text-emerald-600">(신뢰도↑ · 셀러 유입↑)</span>
                </label>
                {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}
                <button onClick={save} disabled={saving || !form.company_name}
                  className="mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold rounded-xl text-white bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 transition disabled:opacity-50 disabled:shadow-none disabled:translate-y-0">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {supplier ? '저장' : '계정 만들기'}
                </button>
              </GlassCard>
            </motion.section>

            {/* ② 상품 등록 (히어로) */}
            <motion.section variants={item}>
              <GlassCard>
                <SectionHead n={2} icon={<PackagePlus className="w-4 h-4" />} title="상품 등록" done={productCount > 0} />
                <p className="text-sm text-gray-500 mt-1">판매할 상품을 먼저 등록하세요. <b>카드 없이</b> 등록·검수 신청까지 됩니다.</p>

                {canUpload ? (
                  <a href="/supplier/products/new"
                    className="group mt-4 flex items-center gap-4 rounded-2xl p-5 bg-gradient-to-br from-emerald-50 to-teal-50/50 border border-emerald-100/80 hover:shadow-xl hover:shadow-emerald-500/10 hover:-translate-y-0.5 transition">
                    <span className="grid place-items-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg shadow-emerald-500/30 rotate-3 group-hover:rotate-6 transition-transform">
                      <PackagePlus className="w-7 h-7" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-900 flex items-center gap-2">새 상품 등록하기
                        {productCount > 0 && <span className="text-xs font-medium text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">등록 {productCount}개</span>}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5">3분이면 끝나요</p>
                      <div className="flex items-center gap-1.5 mt-2 text-[11px] text-gray-400">
                        <Chip>등록</Chip><ArrowRight className="w-3 h-3" /><Chip>검수</Chip><ArrowRight className="w-3 h-3" /><Chip>셀러망 판매</Chip>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-emerald-500 group-hover:translate-x-1 transition-transform shrink-0" />
                  </a>
                ) : (
                  <div className="mt-4 flex items-center gap-2 text-sm text-gray-500 bg-gray-50/80 rounded-xl px-4 py-3 border border-gray-100">
                    <Lock className="w-4 h-4" /> {gate?.reason || '먼저 계정을 만들어주세요.'}
                  </div>
                )}
              </GlassCard>
            </motion.section>

            {/* ③ 자동결제 카드 (최종 단계) */}
            <motion.section variants={item}>
              <GlassCard>
                <SectionHead n={3} icon={<CreditCard className="w-4 h-4" />} title="자동결제 카드" done={!!hasCard} />
                <p className="text-sm text-gray-500 mt-1">상품 등록을 마쳤다면 마지막으로 카드를 등록하세요. 판매분의 수수료가 매월 자동결제됩니다. <b>카드를 등록해야 셀러망이 판매를 시작</b>합니다.</p>

                {!supplier ? (
                  <p className="text-sm text-amber-600 mt-4">먼저 위에서 계정을 만들어주세요.</p>
                ) : hasCard ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50/80 rounded-xl px-4 py-3 border border-emerald-100">
                      <ShieldCheck className="w-4 h-4" /> {supplier.card_company} {supplier.card_number} 등록됨 — 자동결제 활성화
                    </div>
                    <a href="/supplier/dashboard"
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold rounded-xl text-white bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/25 hover:-translate-y-0.5 transition">
                      <TrendingUp className="w-4 h-4" /> 판매·정산 대시보드로 가기
                    </a>
                  </div>
                ) : (
                  <div className="mt-4">
                    <CardMock />
                    {productCount === 0 && (
                      <p className="text-xs text-amber-600 mt-3 mb-1">아직 등록한 상품이 없습니다. 상품을 먼저 등록한 뒤 카드를 등록하는 것을 권장합니다.</p>
                    )}
                    <div className="mt-3">
                      <SupplierCardRegistration />
                    </div>
                  </div>
                )}
              </GlassCard>
            </motion.section>
          </motion.div>

          {/* 함께하는 브랜드 */}
          <div className="mt-10">
            <BrandLogoMarquee />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 배경: 파스텔 메시 + 부유하는 3D 오브 ─────────────────── */
function Backdrop({ reduced }: { reduced: boolean }) {
  const orbs = [
    { c: 'rgba(16,185,129,0.30)', s: 'top-[-6rem] left-[-6rem] w-[30rem] h-[30rem]', d: 0 },
    { c: 'rgba(139,92,246,0.24)', s: 'top-[10rem] right-[-8rem] w-[34rem] h-[34rem]', d: 1.2 },
    { c: 'rgba(56,189,248,0.22)', s: 'bottom-[-10rem] left-[4rem] w-[32rem] h-[32rem]', d: 2.1 },
    { c: 'rgba(244,114,182,0.18)', s: 'bottom-[2rem] right-[6rem] w-[24rem] h-[24rem]', d: 0.6 },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg,#F7F8FC 0%,#F4F1FB 45%,#EDF7F3 100%)' }} />
      {orbs.map((o, i) => (
        <motion.div key={i}
          className={`absolute rounded-full blur-3xl ${o.s}`}
          style={{ background: `radial-gradient(circle at 30% 30%, ${o.c}, transparent 70%)` }}
          animate={reduced ? undefined : { y: [0, -24, 0], x: [0, 14, 0] }}
          transition={reduced ? undefined : { duration: 14 + o.d * 2, repeat: Infinity, ease: 'easeInOut', delay: o.d }}
        />
      ))}
    </div>
  );
}

/* ── 글래스 카드 ──────────────────────────────────────────── */
function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative rounded-[1.75rem] border border-white/70 bg-white/70 backdrop-blur-xl p-5 sm:p-6 shadow-[0_12px_40px_-16px_rgba(80,80,160,0.28)] ${className}`}>
      <div aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
      {children}
    </div>
  );
}

function SectionHead({ n, icon, title, done }: { n: number; icon: React.ReactNode; title: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`grid place-items-center w-8 h-8 rounded-xl text-white shadow-md ${done ? 'bg-gradient-to-br from-emerald-400 to-teal-500 shadow-emerald-500/30' : 'bg-gradient-to-br from-gray-300 to-gray-400'}`}>
        {done ? <Check className="w-4 h-4" /> : icon}
      </span>
      <h2 className="font-bold text-gray-900">{title}</h2>
      <span className="ml-auto text-[11px] font-semibold text-gray-400">STEP {n}</span>
    </div>
  );
}

/* ── 진행 스텝퍼 ──────────────────────────────────────────── */
function Stepper({ index, steps }: { index: number; steps: string[] }) {
  return (
    <div className="mb-8 rounded-2xl border border-white/70 bg-white/60 backdrop-blur-xl px-5 py-4 shadow-[0_8px_30px_-16px_rgba(80,80,160,0.28)]">
      <div className="flex items-center">
        {steps.map((label, i) => {
          const done = i < index;
          const active = i === index;
          return (
            <div key={label} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
              <div className="flex flex-col items-center gap-1.5">
                <motion.span
                  initial={false}
                  animate={{ scale: active ? 1.1 : 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                  className={`grid place-items-center w-8 h-8 rounded-full text-xs font-bold transition-colors ${
                    done ? 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-md shadow-emerald-500/30'
                      : active ? 'bg-white text-emerald-600 ring-2 ring-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]'
                      : 'bg-gray-100 text-gray-400'
                  }`}>
                  {done ? <Check className="w-4 h-4" /> : i + 1}
                </motion.span>
                <span className={`text-[11px] font-medium whitespace-nowrap ${done || active ? 'text-gray-700' : 'text-gray-400'}`}>{label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className="flex-1 h-1 mx-2 rounded-full bg-gray-100 overflow-hidden -mt-4">
                  <motion.div initial={false} animate={{ width: i < index ? '100%' : '0%' }} transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="h-full bg-gradient-to-r from-emerald-400 to-teal-500" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── 3D 카드 목업 ─────────────────────────────────────────── */
function CardMock() {
  return (
    <div className="flex justify-center py-2 [perspective:800px]">
      <div className="relative w-64 h-40 rounded-2xl p-4 text-white shadow-2xl shadow-indigo-500/20 transition-transform duration-500 hover:[transform:rotateY(-12deg)_rotateX(6deg)]"
        style={{ background: 'linear-gradient(135deg,#4f46e5 0%,#7c3aed 55%,#0ea5e9 100%)' }}>
        <div aria-hidden className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/0 via-white/10 to-white/25" />
        <div className="relative flex flex-col h-full justify-between">
          <div className="flex items-center justify-between">
            <span className="w-9 h-6 rounded-md bg-gradient-to-br from-amber-200 to-amber-400 shadow-inner" />
            <span className="text-[10px] font-semibold tracking-wide opacity-80">MEGALOAD</span>
          </div>
          <div className="tracking-[0.2em] text-sm font-medium opacity-90">•••• •••• •••• ••••</div>
          <div className="flex items-center justify-between text-[10px] opacity-80">
            <span>자동결제 · 판매분만 청구</span>
            <ShieldCheck className="w-4 h-4" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white/70 border border-gray-200/70 px-2 py-0.5 text-gray-500">{children}</span>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-sm block">
      <span className="block text-gray-500 mb-1.5 text-[13px]">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/80 border border-gray-200/80 rounded-xl px-3.5 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition" />
    </label>
  );
}
