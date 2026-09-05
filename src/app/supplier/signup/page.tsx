'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Store, Loader2, CheckCircle2, Upload, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const BUCKET = 'supplier-docs';

export default function SupplierSignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const [f, setF] = useState({
    fullName: '', phone: '', email: '', password: '',
    company_name: '', representative_name: '', business_number: '', brand_name: '',
    homepage_url: '', mall_url: '', applicant_note: '',
  });
  const [license, setLicense] = useState<File | null>(null);
  const [mfrDocs, setMfrDocs] = useState<File[]>([]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!license) { setError('사업자등록증 파일을 첨부해주세요.'); return; }
    if (mfrDocs.length === 0) { setError('제조/공장·상표 등 증빙서류를 1개 이상 첨부해주세요.'); return; }
    setLoading(true);
    try {
      // 파일을 field 순서대로 정렬 (index 로 응답과 매칭)
      const orderedFiles: { field: 'license' | 'mfr'; file: File }[] = [
        { field: 'license', file: license },
        ...mfrDocs.map((d) => ({ field: 'mfr' as const, file: d })),
      ];

      // 1) 서명 업로드 URL 발급 (본문 작음 → 크기 제한 무관)
      setProgress('업로드 준비 중...');
      const urlRes = await fetch('/api/supplier/signup/upload-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: orderedFiles.map((o) => ({ field: o.field, name: o.file.name, size: o.file.size })) }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) { setError(urlData.error || '업로드 준비에 실패했습니다.'); return; }
      const uploads: { field: string; name: string; path: string; token: string }[] = urlData.uploads || [];
      if (uploads.length !== orderedFiles.length) { setError('업로드 준비 응답이 올바르지 않습니다. 다시 시도해주세요.'); return; }

      // 2) 브라우저 → Supabase 스토리지 직접 업로드
      const supabase = createClient();
      for (let i = 0; i < orderedFiles.length; i++) {
        setProgress(`서류 업로드 중 (${i + 1}/${orderedFiles.length})`);
        const u = uploads[i];
        const { error: upErr } = await supabase.storage.from(BUCKET).uploadToSignedUrl(u.path, u.token, orderedFiles[i].file);
        if (upErr) { setError(`파일 업로드 실패: ${orderedFiles[i].file.name}`); return; }
      }

      const licensePath = uploads[0].path;                     // orderedFiles[0] == license
      const manufacturerDocPaths = uploads.slice(1).map((u) => u.path);

      // 3) 가입 신청 (경로만 전송 — 파일 바이트는 서버 본문을 안 거침)
      setProgress('가입 신청 처리 중...');
      const res = await fetch('/api/supplier/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...f,
          uploadToken: urlData.uploadToken,
          business_license_path: licensePath,
          manufacturer_doc_paths: manufacturerDocPaths,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '가입 신청에 실패했습니다.'); return; }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? `오류: ${err.message}` : '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">가입 신청이 접수되었습니다</h1>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            제출하신 서류를 관리자가 검토합니다. <b>승인이 완료되면 로그인하여 상품을 등록</b>할 수 있습니다.
            결과는 등록하신 이메일/연락처로 안내됩니다.
          </p>
          <Link href="/auth/login" className="mt-6 inline-block px-6 py-3 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition">
            로그인 페이지로
          </Link>
        </div>
      </div>
    );
  }

  const input = 'w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition';
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center"><Store className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">공급사 회원가입</h1>
            <p className="text-xs text-gray-500">제조사·도매·공급사 전용 · 관리자 승인 후 상품 등록 가능</p>
          </div>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
          {/* 계정 */}
          <section className="space-y-4">
            <h2 className="text-sm font-bold text-gray-900">계정 정보</h2>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>담당자명 *</label><input required value={f.fullName} onChange={set('fullName')} className={input} placeholder="홍길동" /></div>
              <div><label className={labelCls}>연락처 *</label><input required value={f.phone} onChange={set('phone')} className={input} placeholder="010-1234-5678" /></div>
            </div>
            <div><label className={labelCls}>이메일 *</label><input required type="email" value={f.email} onChange={set('email')} className={input} placeholder="company@example.com" /></div>
            <div><label className={labelCls}>비밀번호 *</label><input required type="password" minLength={6} value={f.password} onChange={set('password')} className={input} placeholder="6자 이상" /></div>
          </section>

          {/* 사업자 */}
          <section className="space-y-4 border-t border-gray-100 pt-5">
            <h2 className="text-sm font-bold text-gray-900">사업자 정보</h2>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>회사명(상호) *</label><input required value={f.company_name} onChange={set('company_name')} className={input} placeholder="(주)메가로드" /></div>
              <div><label className={labelCls}>대표자명 *</label><input required value={f.representative_name} onChange={set('representative_name')} className={input} placeholder="홍길동" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>사업자등록번호 *</label><input required value={f.business_number} onChange={set('business_number')} className={input} placeholder="123-45-67890" /></div>
              <div><label className={labelCls}>브랜드명 (선택)</label><input value={f.brand_name} onChange={set('brand_name')} className={input} placeholder="브랜드" /></div>
            </div>
            <div><label className={labelCls}>회사 홈페이지 URL *</label><input required type="url" value={f.homepage_url} onChange={set('homepage_url')} className={input} placeholder="https://" /></div>
            <div><label className={labelCls}>쇼핑몰/스토어 URL *</label><input required type="url" value={f.mall_url} onChange={set('mall_url')} className={input} placeholder="https://smartstore.naver.com/..." /></div>
          </section>

          {/* 증빙 서류 */}
          <section className="space-y-4 border-t border-gray-100 pt-5">
            <h2 className="text-sm font-bold text-gray-900">증빙 서류 <span className="font-normal text-gray-500">(제조사/공급사 확인용 · PDF·이미지, 파일당 10MB)</span></h2>
            <FileField label="사업자등록증 *" file={license} onPick={(files) => setLicense(files[0] || null)} onClear={() => setLicense(null)} />
            <div>
              <label className={labelCls}>제조/공장·상표 증빙서류 * <span className="font-normal text-gray-400">(공장등록증·제조업등록증·상표등록증 등, 여러 개 가능)</span></label>
              <input type="file" multiple accept=".pdf,image/*" onChange={(e) => setMfrDocs((prev) => [...prev, ...Array.from(e.target.files || [])])}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 file:font-medium hover:file:bg-emerald-100" />
              {mfrDocs.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {mfrDocs.map((d, i) => (
                    <li key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2.5 py-1.5">
                      <span className="truncate">{d.name}</span>
                      <button type="button" onClick={() => setMfrDocs((p) => p.filter((_, j) => j !== i))} className="text-gray-400 hover:text-rose-500"><X className="w-3.5 h-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div><label className={labelCls}>취급 카테고리·브랜드 등 메모 (선택)</label><textarea value={f.applicant_note} onChange={set('applicant_note')} rows={2} className={input} placeholder="주력 상품군, 보유 브랜드, 제조 품목 등" /></div>
          </section>

          {error && <div className="bg-rose-50 text-rose-600 px-4 py-3 rounded-lg text-sm" role="alert">{error}</div>}

          <button type="submit" disabled={loading}
            className="w-full py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><Loader2 className="w-5 h-5 animate-spin" />{progress || '신청 처리 중...'}</> : <><Upload className="w-5 h-5" />가입 신청하기</>}
          </button>
          <p className="text-center text-sm text-gray-500">
            이미 공급사 계정이 있으신가요? <Link href="/auth/login" className="text-emerald-600 font-semibold hover:underline">로그인</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

function FileField({ label, file, onPick, onClear }: { label: string; file: File | null; onPick: (files: File[]) => void; onClear: () => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {file ? (
        <div className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
          <span className="truncate">{file.name}</span>
          <button type="button" onClick={onClear} className="text-gray-400 hover:text-rose-500"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <input type="file" accept=".pdf,image/*" onChange={(e) => onPick(Array.from(e.target.files || []))}
          className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 file:font-medium hover:file:bg-emerald-100" />
      )}
    </div>
  );
}
