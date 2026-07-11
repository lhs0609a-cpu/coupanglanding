'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Check, X, FileText, ExternalLink, Building2, Phone, Mail, Globe, Store } from 'lucide-react';

interface Supplier {
  id: string;
  company_name: string;
  brand_name: string | null;
  representative_name: string | null;
  business_number: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  homepage_url: string | null;
  mall_url: string | null;
  applicant_note: string | null;
  status: string;
  rejection_reason: string | null;
  submitted_at: string | null;
  business_license_url: string | null;
  manufacturer_doc_urls: (string | null)[];
  owner?: { email: string | null; full_name: string | null; is_active: boolean } | null;
}

const STATUS_TABS = [
  { key: 'pending', label: '심사 대기' },
  { key: 'approved', label: '승인됨' },
  { key: 'suspended', label: '정지' },
  { key: 'all', label: '전체' },
];

export default function AdminSuppliersPage() {
  const [status, setStatus] = useState('pending');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/suppliers?status=${status}`);
      const data = await res.json();
      setSuppliers(data.suppliers || []);
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    let reason: string | undefined;
    if (action === 'reject') {
      const r = window.prompt('반려 사유를 입력하세요 (공급사에게 표시됩니다):');
      if (r === null) return;
      if (!r.trim()) { alert('반려 사유를 입력해주세요.'); return; }
      reason = r.trim();
    } else {
      if (!window.confirm('이 공급사를 승인하시겠습니까? 승인 후 상품 등록·판매가 가능해집니다.')) return;
    }
    setActing(id);
    try {
      const res = await fetch('/api/admin/suppliers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, reason }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || '처리 실패'); return; }
      await load();
    } finally { setActing(null); }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">공급사 가입 승인</h1>
        <p className="text-sm text-gray-500 mt-1">제출된 사업자등록증·증빙서류를 확인하고 승인/반려합니다. 승인해야 상품 등록·판매가 가능합니다.</p>
      </div>

      <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 p-1 w-fit">
        {STATUS_TABS.map((t) => (
          <button key={t.key} onClick={() => setStatus(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${status === t.key ? 'bg-[#E31837] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />불러오는 중...</div>
      ) : suppliers.length === 0 ? (
        <div className="py-16 text-center text-gray-400 bg-white rounded-xl border border-gray-200">해당 상태의 공급사 신청이 없습니다.</div>
      ) : (
        <div className="space-y-4">
          {suppliers.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="font-semibold text-gray-900">{s.company_name}</span>
                    {s.brand_name && <span className="text-sm text-gray-500">· {s.brand_name}</span>}
                    <StatusBadge status={s.status} rejected={!!s.rejection_reason} />
                  </div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600">
                    <span>대표자: <b className="text-gray-800">{s.representative_name || '-'}</b></span>
                    <span>사업자번호: <b className="text-gray-800">{s.business_number || '-'}</b></span>
                    <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-gray-400" />{s.contact_email || s.owner?.email || '-'}</span>
                    <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-gray-400" />{s.contact_phone || '-'}</span>
                    {s.homepage_url && <a href={s.homepage_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-emerald-600 hover:underline truncate"><Globe className="w-3.5 h-3.5" />홈페이지 <ExternalLink className="w-3 h-3" /></a>}
                    {s.mall_url && <a href={s.mall_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-emerald-600 hover:underline truncate"><Store className="w-3.5 h-3.5" />쇼핑몰 <ExternalLink className="w-3 h-3" /></a>}
                  </div>
                  {s.applicant_note && <p className="mt-2 text-sm text-gray-500">메모: {s.applicant_note}</p>}
                  {s.submitted_at && <p className="mt-1 text-xs text-gray-400">신청: {new Date(s.submitted_at).toLocaleString('ko-KR')}</p>}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button onClick={() => act(s.id, 'approve')} disabled={acting === s.id || s.status === 'approved'}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 transition">
                    {acting === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}승인
                  </button>
                  <button onClick={() => act(s.id, 'reject')} disabled={acting === s.id}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-rose-600 border border-rose-200 hover:bg-rose-50 disabled:opacity-40 transition">
                    <X className="w-4 h-4" />반려
                  </button>
                </div>
              </div>

              {/* 서류 */}
              <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-gray-500">서류:</span>
                {s.business_license_url
                  ? <a href={s.business_license_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-xs text-gray-700"><FileText className="w-3.5 h-3.5" />사업자등록증</a>
                  : <span className="text-xs text-rose-500">사업자등록증 없음</span>}
                {s.manufacturer_doc_urls.filter(Boolean).map((u, i) => (
                  <a key={i} href={u as string} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-xs text-gray-700"><FileText className="w-3.5 h-3.5" />증빙 {i + 1}</a>
                ))}
              </div>

              {s.rejection_reason && (
                <div className="mt-3 text-sm bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2">반려 사유(공급사에게 표시): {s.rejection_reason}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, rejected }: { status: string; rejected: boolean }) {
  if (status === 'approved') return <span className="px-2 py-0.5 text-xs font-medium rounded bg-emerald-100 text-emerald-700">승인됨</span>;
  if (status === 'suspended') return <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-200 text-gray-600">정지</span>;
  if (rejected) return <span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-700">반려(재제출 대기)</span>;
  return <span className="px-2 py-0.5 text-xs font-medium rounded bg-sky-100 text-sky-700">심사 대기</span>;
}
