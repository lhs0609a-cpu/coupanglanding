'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import type { PartnerViolation, ViolationSummary } from '@/lib/supabase/types';
import {
  VIOLATION_CATEGORY_LABELS, VIOLATION_TYPE_LABELS,
  VIOLATION_STATUS_LABELS, VIOLATION_STATUS_COLORS,
  VIOLATION_ACTION_LABELS, VIOLATION_ACTION_COLORS,
  VIOLATION_CATEGORY_COLORS,
  getRiskLevel, RISK_SCORE_LABELS,
} from '@/lib/utils/constants';
import { AlertCircle, Gavel, Send } from 'lucide-react';

export default function MyViolationsPage() {
  const [violations, setViolations] = useState<PartnerViolation[]>([]);
  const [summary, setSummary] = useState<ViolationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PartnerViolation | null>(null);
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    fetch('/api/violations')
      .then(res => res.json())
      .then(data => {
        if (data.data) setViolations(data.data);
        if (data.summary) setSummary(data.summary);
      })
      .catch(() => {
        setError('계약위반 정보를 불러오지 못했습니다.');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSubmitResponse = async () => {
    if (!selected || !response.trim()) return;
    setSubmitting(true);

    try {
      const res = await fetch('/api/violations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, partner_response: response }),
      });

      if (res.ok) {
        const { data } = await res.json();
        setViolations(prev => prev.map(v => v.id === data.id ? data : v));
        setSelected(data);
        setResponse('');
      } else {
        const err = await res.json();
        setError(err.error || '제출에 실패했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const activeViolations = violations.filter(v =>
    ['reported', 'investigating', 'action_taken', 'escalated'].includes(v.status)
  );
  const closedViolations = violations.filter(v =>
    ['dismissed', 'resolved', 'terminated'].includes(v.status)
  );

  const riskLevel = summary ? getRiskLevel(summary.risk_score) : 'good';
  const riskInfo = RISK_SCORE_LABELS[riskLevel];

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card><div className="py-8 text-center text-gray-400">불러오는 중...</div></Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Gavel className="w-6 h-6 text-[#E31837]" />
        <h1 className="text-2xl font-bold text-gray-900">계약위반 내역</h1>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-600 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary */}
      {summary && summary.total_violations > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <p className="text-xs text-gray-500">위험도</p>
            <p className={`text-xl font-bold ${riskInfo.color}`}>{riskInfo.label}</p>
            <p className="text-xs text-gray-400">{summary.risk_score}점</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">진행 중</p>
            <p className="text-2xl font-bold text-orange-600">{summary.active_violations}</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">주의/경고</p>
            <p className="text-2xl font-bold text-yellow-600">{summary.notice_count + summary.warning_count}</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">전체</p>
            <p className="text-2xl font-bold text-gray-700">{summary.total_violations}</p>
          </Card>
        </div>
      )}

      {violations.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <Gavel className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">접수된 위반 건이 없습니다.</p>
            <p className="text-sm text-gray-400 mt-1">계약을 준수해주셔서 감사합니다.</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Active violations */}
          {activeViolations.length > 0 && (
            <Card>
              <h3 className="text-sm font-bold text-gray-900 mb-3">진행 중인 위반 건</h3>
              <div className="space-y-3">
                {activeViolations.map(v => (
                  <div
                    key={v.id}
                    onClick={() => { setSelected(v); setResponse(''); }}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-[#E31837] hover:bg-red-50/30 cursor-pointer transition"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge label={VIOLATION_CATEGORY_LABELS[v.violation_category]} colorClass={VIOLATION_CATEGORY_COLORS[v.violation_category]} />
                        <Badge label={VIOLATION_STATUS_LABELS[v.status]} colorClass={VIOLATION_STATUS_COLORS[v.status]} />
                        {v.action_level && (
                          <Badge label={VIOLATION_ACTION_LABELS[v.action_level]} colorClass={VIOLATION_ACTION_COLORS[v.action_level]} />
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate">{v.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatDate(v.created_at)}</p>
                    </div>
                    {v.correction_deadline && (
                      <div className="text-right ml-3">
                        <p className="text-xs text-gray-500">시정 기한</p>
                        <p className="text-sm font-medium text-orange-600">{formatDate(v.correction_deadline)}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Closed violations */}
          {closedViolations.length > 0 && (
            <Card>
              <h3 className="text-sm font-bold text-gray-900 mb-3">종결된 위반 건</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-medium text-gray-600">날짜</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">카테고리</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">제목</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">조치</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedViolations.map(v => (
                      <tr
                        key={v.id}
                        onClick={() => { setSelected(v); setResponse(''); }}
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{formatDate(v.created_at)}</td>
                        <td className="py-2 px-3">
                          <Badge label={VIOLATION_CATEGORY_LABELS[v.violation_category]} colorClass={VIOLATION_CATEGORY_COLORS[v.violation_category]} />
                        </td>
                        <td className="py-2 px-3 text-gray-900">{v.title}</td>
                        <td className="py-2 px-3">
                          {v.action_level ? (
                            <Badge label={VIOLATION_ACTION_LABELS[v.action_level]} colorClass={VIOLATION_ACTION_COLORS[v.action_level]} />
                          ) : '-'}
                        </td>
                        <td className="py-2 px-3">
                          <Badge label={VIOLATION_STATUS_LABELS[v.status]} colorClass={VIOLATION_STATUS_COLORS[v.status]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Detail Modal */}
      {selected && (
        <Modal isOpen={true} onClose={() => setSelected(null)} title="위반 상세" maxWidth="max-w-lg">
          <div className="space-y-4">
            {/* Status & Category */}
            <div className="flex flex-wrap gap-2">
              <Badge label={VIOLATION_CATEGORY_LABELS[selected.violation_category]} colorClass={VIOLATION_CATEGORY_COLORS[selected.violation_category]} />
              <Badge label={VIOLATION_TYPE_LABELS[selected.violation_type]} colorClass="bg-gray-100 text-gray-700" />
              <Badge label={VIOLATION_STATUS_LABELS[selected.status]} colorClass={VIOLATION_STATUS_COLORS[selected.status]} />
              {selected.action_level && (
                <Badge label={VIOLATION_ACTION_LABELS[selected.action_level]} colorClass={VIOLATION_ACTION_COLORS[selected.action_level]} />
              )}
            </div>

            {/* Title & Description */}
            <div className="bg-gray-50 rounded-lg p-3">
              <h4 className="font-medium text-gray-900 mb-1">{selected.title}</h4>
              {selected.description && <p className="text-sm text-gray-600">{selected.description}</p>}
            </div>

            {/* Contract article */}
            {selected.contract_article && (
              <p className="text-xs text-gray-500">관련 조항: {selected.contract_article}</p>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">접수일:</span>
                <span className="ml-1">{formatDate(selected.created_at)}</span>
              </div>
              {selected.correction_deadline && (
                <div>
                  <span className="text-gray-500">시정 기한:</span>
                  <span className="ml-1 font-medium text-orange-600">{formatDate(selected.correction_deadline)}</span>
                </div>
              )}
            </div>

            {/* Previous response */}
            {selected.partner_response && (
              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-1">
                  내 소명
                  <span className="text-xs text-gray-400 ml-2">{formatDate(selected.partner_responded_at)}</span>
                </h5>
                <p className="text-sm text-gray-600 bg-blue-50 rounded-lg p-3 border border-blue-100">
                  {selected.partner_response}
                </p>
              </div>
            )}

            {/* Response form */}
            {['reported', 'investigating', 'action_taken'].includes(selected.status) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {selected.partner_response ? '추가 소명' : '소명서 작성'}
                </label>
                <textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={4}
                  placeholder="위반 사항에 대한 소명 내용을 작성해주세요."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
                />
                <button
                  type="button"
                  disabled={!response.trim() || submitting}
                  onClick={handleSubmitResponse}
                  className="mt-2 flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? '제출 중...' : '소명 제출'}
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
