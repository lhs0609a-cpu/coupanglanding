'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import FileUpload from '@/components/ui/FileUpload';
import NumberInput from '@/components/ui/NumberInput';
import { Loader2, AlertTriangle, CheckCircle2, Clock, XCircle, Lock, Megaphone } from 'lucide-react';
import { formatKRW } from '@/lib/utils/format';
import type { AdCostSubmission, AdCostSubmissionStatus, PtUser } from '@/lib/supabase/types';
import { getPreviousMonthYM, AD_COST_MAX_ATTEMPTS } from '@/lib/payments/ad-cost';

type Submission = AdCostSubmission;

const STATUS_LABEL: Record<AdCostSubmissionStatus, string> = {
  pending: '검토 대기',
  approved: '승인 완료',
  rejected: '반려 (재제출 가능)',
  missed: '미제출 (0원 확정)',
  locked: '재제출 한도 초과 (0원 확정)',
};

const STATUS_BADGE_CLASS: Record<AdCostSubmissionStatus, string> = {
  pending:  'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  missed:   'bg-gray-100 text-gray-700',
  locked:   'bg-red-100 text-red-700',
};

function StatusIcon({ status }: { status: AdCostSubmissionStatus }) {
  switch (status) {
    case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
    case 'approved': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'rejected': return <XCircle className="w-4 h-4 text-red-500" />;
    case 'missed': return <AlertTriangle className="w-4 h-4 text-gray-400" />;
    case 'locked': return <Lock className="w-4 h-4 text-red-500" />;
  }
}

export default function AdCostPage() {
  const supabase = useMemo(() => createClient(), []);

  const [ptUser, setPtUser] = useState<Pick<PtUser, 'id'> | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success' | 'warning'; text: string } | null>(null);

  const targetMonth = useMemo(() => getPreviousMonthYM(), []);
  const [amount, setAmount] = useState<number>(0);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: pt } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!pt) { setLoading(false); return; }
    setPtUser(pt as { id: string });

    const res = await fetch('/api/ad-cost/list');
    if (res.ok) {
      const data = await res.json();
      setSubmissions(data.submissions || []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 직전 달 제출 상태 — 새로 제출 가능한지 판단
  const targetMonthSubs = submissions.filter((s) => s.year_month === targetMonth);
  const lastSub = targetMonthSubs[0]; // attempt_no DESC 정렬
  const blocked: { reason: string; canRetry: boolean } | null = (() => {
    if (!lastSub) return null;
    if (lastSub.status === 'pending') return { reason: '검토 대기 중인 제출이 있습니다', canRetry: false };
    if (lastSub.status === 'approved') return { reason: '이미 승인된 제출이 있습니다', canRetry: false };
    if (lastSub.status === 'missed') return { reason: '제출 마감일이 지나 광고비 0원으로 확정되었습니다', canRetry: false };
    if (lastSub.status === 'locked') return { reason: `재제출 한도(${AD_COST_MAX_ATTEMPTS}회) 초과로 더 이상 제출할 수 없습니다`, canRetry: false };
    if (lastSub.status === 'rejected' && Number(lastSub.attempt_no) >= AD_COST_MAX_ATTEMPTS) {
      return { reason: '재제출 한도 초과', canRetry: false };
    }
    if (lastSub.status === 'rejected') return { reason: `반려됨 — 1회 재제출 가능. 사유: ${lastSub.reject_reason || '-'}`, canRetry: true };
    return null;
  })();

  const canSubmit = !blocked || blocked.canRetry;

  const handleFileSelect = (f: File) => {
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!ptUser) return;
    if (amount < 0) {
      setMessage({ type: 'error', text: '광고비를 입력해 주세요' });
      return;
    }
    if (!file) {
      setMessage({ type: 'error', text: '광고비 스크린샷을 업로드해 주세요' });
      return;
    }

    setSubmitting(true); setMessage(null);
    try {
      // 1) 스크린샷 업로드
      const formData = new FormData();
      formData.append('file', file);
      formData.append('ptUserId', ptUser.id);
      formData.append('yearMonth', targetMonth);
      formData.append('type', 'ad');
      const upRes = await fetch('/api/upload-screenshot', { method: 'POST', body: formData });
      const upData = await upRes.json();
      if (!upRes.ok) {
        setMessage({ type: 'error', text: upData.error || '업로드 실패' });
        return;
      }

      // 2) 제출 행 insert
      const subRes = await fetch('/api/ad-cost/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yearMonth: targetMonth, amount, screenshotUrl: upData.url }),
      });
      const subData = await subRes.json();
      if (!subRes.ok) {
        setMessage({ type: 'error', text: subData.error || '제출 실패' });
        return;
      }

      setMessage({
        type: subData.warning ? 'warning' : 'success',
        text: subData.warning
          ? `제출 완료. ${subData.warning}`
          : `${targetMonth} 광고비 ${formatKRW(amount)} 제출 완료. 관리자 검토 대기 중입니다.`,
      });
      setFile(null);
      setPreviewUrl(null);
      setAmount(0);
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '제출 실패' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      </div>
    );
  }

  if (!ptUser) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Card><p className="text-sm text-gray-500">PT 사용자 정보를 불러올 수 없습니다.</p></Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-rose-500" /> 광고비 제출
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          매월 1일까지 직전 달 광고비를 스크린샷과 함께 제출하면 메가로드 수수료 계산에서 차감됩니다.
          미제출 시 광고비 0원으로 확정됩니다.
        </p>
      </div>

      {/* 신규 제출 폼 */}
      <Card>
        <h2 className="text-lg font-bold text-gray-900 mb-3">{targetMonth} 광고비 제출</h2>

        {blocked && (
          <div className={`mb-4 p-3 rounded-lg text-sm flex items-start gap-2 ${
            blocked.canRetry ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' : 'bg-gray-100 text-gray-700'
          }`}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{blocked.reason}</span>
          </div>
        )}

        {canSubmit && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">광고비 금액</label>
              <NumberInput value={amount} onChange={setAmount} placeholder="원 단위 입력" suffix="원" />
              <p className="text-[11px] text-gray-400 mt-1">
                * 매출의 30% 초과 시 경고, 200% 초과 시 자동 거부됩니다.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">광고 플랫폼 스크린샷</label>
              <FileUpload
                label="광고비 명세서 스크린샷"
                onFileSelect={handleFileSelect}
                onClear={() => { setFile(null); setPreviewUrl(null); }}
                previewUrl={previewUrl}
              />
              <p className="text-[11px] text-gray-400 mt-1">
                쿠팡 광고센터 / 네이버 광고 / 카카오 모먼트 등 광고비 청구 내역이 보이는 화면.
              </p>
            </div>

            {message && (
              <div className={`p-3 rounded-lg text-sm ${
                message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
                message.type === 'warning' ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' :
                'bg-green-50 text-green-700 border border-green-200'
              }`}>{message.text}</div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !file || amount < 0}
                className="px-5 py-2.5 bg-[#E31837] text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition flex items-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                제출하기
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* 이전 제출 이력 */}
      <Card>
        <h2 className="text-lg font-bold text-gray-900 mb-3">제출 이력</h2>
        {submissions.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">제출 이력이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {submissions.map((s) => (
              <div key={s.id} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
                <StatusIcon status={s.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{s.year_month}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE_CLASS[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                    {s.attempt_no > 1 && <span className="text-xs text-gray-400">(재제출 {s.attempt_no}회차)</span>}
                  </div>
                  <div className="text-sm text-gray-700 mt-0.5">{formatKRW(Number(s.amount) || 0)}</div>
                  {s.reject_reason && (
                    <div className="text-xs text-red-600 mt-1">반려 사유: {s.reject_reason}</div>
                  )}
                  {s.admin_note && (
                    <div className="text-xs text-gray-500 mt-1">관리자 메모: {s.admin_note}</div>
                  )}
                  <div className="text-[10px] text-gray-400 mt-1">
                    제출: {new Date(s.submitted_at).toLocaleString('ko-KR')}
                    {s.reviewed_at && ` · 검토: ${new Date(s.reviewed_at).toLocaleString('ko-KR')}`}
                  </div>
                </div>
                {s.screenshot_url && (
                  <a
                    href={s.screenshot_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline shrink-0"
                  >
                    스크린샷 보기
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
