'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Card from '@/components/ui/Card';
import { Loader2, AlertTriangle, CheckCircle2, XCircle, Megaphone, ExternalLink } from 'lucide-react';
import { formatKRW } from '@/lib/utils/format';
import type { AdCostSubmissionStatus } from '@/lib/supabase/types';

interface EnrichedSubmission {
  id: string;
  pt_user_id: string;
  year_month: string;
  amount: number;
  screenshot_url: string;
  attempt_no: number;
  status: AdCostSubmissionStatus;
  submitted_at: string;
  reviewed_at: string | null;
  reject_reason: string | null;
  admin_note: string | null;
  monthly_revenue: number;
  ratio: number | null;
  is_over_threshold: boolean;
  pt_user?: {
    id: string;
    profile?: { email: string; full_name: string };
  };
}

const STATUS_TABS: { key: AdCostSubmissionStatus | 'all'; label: string }[] = [
  { key: 'pending', label: '검토 대기' },
  { key: 'approved', label: '승인' },
  { key: 'rejected', label: '반려' },
  { key: 'missed', label: '미제출' },
  { key: 'locked', label: '재제출초과' },
  { key: 'all', label: '전체' },
];

export default function AdCostReviewPage() {
  const [tab, setTab] = useState<AdCostSubmissionStatus | 'all'>('pending');
  const [submissions, setSubmissions] = useState<EnrichedSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/ad-cost?status=${tab}`);
    if (res.ok) {
      const data = await res.json();
      setSubmissions(data.submissions || []);
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of submissions) m[s.status] = (m[s.status] || 0) + 1;
    return m;
  }, [submissions]);

  const handleApprove = async (id: string) => {
    if (!confirm('이 광고비 제출을 승인하시겠습니까?')) return;
    setActioningId(id);
    const res = await fetch(`/api/admin/ad-cost/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      fetchData();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '승인 실패');
    }
    setActioningId(null);
  };

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) {
      alert('반려 사유를 입력해 주세요');
      return;
    }
    setActioningId(id);
    const res = await fetch(`/api/admin/ad-cost/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejectReason }),
    });
    if (res.ok) {
      setRejectingId(null);
      setRejectReason('');
      fetchData();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '반려 실패');
    }
    setActioningId(null);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-rose-500" /> 광고비 검토
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          PT 사용자가 제출한 월별 광고비 스크린샷을 확인하고 승인/반려합니다.
          승인된 금액은 monthly_reports.cost_advertising 에 자동 반영됩니다.
        </p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium transition border-b-2 ${
              tab === t.key
                ? 'border-[#E31837] text-[#E31837]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.key !== 'all' && counts[t.key] !== undefined && (
              <span className="ml-1 text-xs text-gray-400">({counts[t.key]})</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : submissions.length === 0 ? (
        <Card><p className="text-sm text-gray-400 py-10 text-center">해당 상태의 제출 내역이 없습니다.</p></Card>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => {
            const ratioPct = s.ratio !== null ? Math.round(s.ratio * 100) : null;
            const isRejecting = rejectingId === s.id;
            return (
              <Card key={s.id}>
                <div className="flex items-start gap-4">
                  {/* 좌: 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-bold text-gray-900">{s.pt_user?.profile?.full_name || '?'}</span>
                      <span className="text-xs text-gray-500">{s.pt_user?.profile?.email}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{s.year_month}</span>
                      {s.attempt_no > 1 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">재제출 {s.attempt_no}회차</span>
                      )}
                      {s.is_over_threshold && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          <AlertTriangle className="w-3 h-3" />
                          매출 대비 {ratioPct}%
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                      <div>
                        <div className="text-xs text-gray-500">청구 광고비</div>
                        <div className="font-semibold text-gray-900">{formatKRW(s.amount)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">{s.year_month} 매출</div>
                        <div className="font-semibold text-gray-700">
                          {s.monthly_revenue > 0 ? formatKRW(s.monthly_revenue) : '데이터 없음'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">매출 대비 비율</div>
                        <div className={`font-semibold ${s.is_over_threshold ? 'text-red-600' : 'text-gray-700'}`}>
                          {ratioPct !== null ? `${ratioPct}%` : '-'}
                        </div>
                      </div>
                    </div>

                    {s.reject_reason && (
                      <div className="text-xs text-red-600 mb-2">반려 사유: {s.reject_reason}</div>
                    )}
                    {s.admin_note && (
                      <div className="text-xs text-gray-500 mb-2">관리자 메모: {s.admin_note}</div>
                    )}
                    <div className="text-[11px] text-gray-400">
                      제출: {new Date(s.submitted_at).toLocaleString('ko-KR')}
                      {s.reviewed_at && ` · 검토: ${new Date(s.reviewed_at).toLocaleString('ko-KR')}`}
                    </div>

                    {/* 반려 폼 */}
                    {isRejecting && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg space-y-2">
                        <textarea
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          rows={3}
                          placeholder="반려 사유 (사용자에게 그대로 전달됨)"
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => { setRejectingId(null); setRejectReason(''); }}
                            className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded"
                          >취소</button>
                          <button
                            onClick={() => handleReject(s.id)}
                            disabled={actioningId === s.id || !rejectReason.trim()}
                            className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            {actioningId === s.id && <Loader2 className="w-3 h-3 animate-spin" />}
                            반려 확정
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 액션 버튼 (pending 일 때만) */}
                    {s.status === 'pending' && !isRejecting && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => handleApprove(s.id)}
                          disabled={actioningId === s.id}
                          className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> 승인
                        </button>
                        <button
                          onClick={() => { setRejectingId(s.id); setRejectReason(''); }}
                          className="px-3 py-1.5 text-xs bg-white text-red-600 border border-red-300 rounded hover:bg-red-50 flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" /> 반려
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 우: 스크린샷 썸네일 */}
                  {s.screenshot_url && (
                    <a
                      href={s.screenshot_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 block w-32 h-32 border border-gray-200 rounded-lg overflow-hidden hover:border-blue-400 group relative"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.screenshot_url} alt="광고비 스크린샷" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center text-white opacity-0 group-hover:opacity-100">
                        <ExternalLink className="w-5 h-5" />
                      </div>
                    </a>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
