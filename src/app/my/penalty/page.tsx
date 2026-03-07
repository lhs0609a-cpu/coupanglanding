'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { ShieldCheck, Plus, AlertTriangle, CheckCircle, Clock, AlertCircle } from 'lucide-react';

interface PenaltyRecord {
  id: string;
  penalty_category: string;
  title: string;
  description: string | null;
  occurred_at: string;
  score_impact: number;
  evidence_url: string | null;
  is_resolved: boolean;
  resolved_at: string | null;
  resolution_note: string | null;
  reported_by: string;
  created_at: string;
}

interface PenaltySummary {
  total_records: number;
  active_records: number;
  risk_score: number;
  risk_level: string;
  delivery_delay_count: number;
  cs_nonresponse_count: number;
  return_rate_excess_count: number;
  product_info_mismatch_count: number;
  false_advertising_count: number;
}

const PENALTY_CATEGORIES = [
  { value: 'delivery_delay', label: '배송지연', score: 10, color: 'bg-blue-100 text-blue-700' },
  { value: 'cs_nonresponse', label: 'CS 미응답', score: 15, color: 'bg-orange-100 text-orange-700' },
  { value: 'return_rate_excess', label: '반품률 초과', score: 20, color: 'bg-red-100 text-red-700' },
  { value: 'product_info_mismatch', label: '상품정보 불일치', score: 15, color: 'bg-yellow-100 text-yellow-700' },
  { value: 'false_advertising', label: '허위과장광고', score: 25, color: 'bg-purple-100 text-purple-700' },
];

const RISK_LEVELS: Record<string, { label: string; color: string; bgColor: string }> = {
  safe: { label: '안전', color: 'text-green-600', bgColor: 'bg-green-500' },
  caution: { label: '주의', color: 'text-yellow-600', bgColor: 'bg-yellow-500' },
  warning: { label: '경고', color: 'text-orange-600', bgColor: 'bg-orange-500' },
  danger: { label: '위험', color: 'text-red-600', bgColor: 'bg-red-500' },
};

const GAUGE_COLORS: Record<string, string> = {
  safe: '#22c55e',
  caution: '#eab308',
  warning: '#f97316',
  danger: '#ef4444',
};

function getCategoryInfo(value: string) {
  return PENALTY_CATEGORIES.find(c => c.value === value);
}

function getCategoryCounts(summary: PenaltySummary) {
  return [
    { key: 'delivery_delay', count: summary.delivery_delay_count },
    { key: 'cs_nonresponse', count: summary.cs_nonresponse_count },
    { key: 'return_rate_excess', count: summary.return_rate_excess_count },
    { key: 'product_info_mismatch', count: summary.product_info_mismatch_count },
    { key: 'false_advertising', count: summary.false_advertising_count },
  ];
}

export default function MyPenaltyPage() {
  const supabase = useMemo(() => createClient(), []);

  const [records, setRecords] = useState<PenaltyRecord[]>([]);
  const [summary, setSummary] = useState<PenaltySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Report form state
  const [formCategory, setFormCategory] = useState('delivery_delay');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formOccurredAt, setFormOccurredAt] = useState('');
  const [formEvidenceUrl, setFormEvidenceUrl] = useState('');

  const fetchData = async () => {
    setError(null);
    try {
      const res = await fetch('/api/penalty');
      if (!res.ok) {
        setError('페널티 정보를 불러오지 못했습니다.');
        return;
      }
      const data = await res.json();
      if (data.records) setRecords(data.records);
      if (data.summary) setSummary(data.summary);
    } catch {
      setError('페널티 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setFormCategory('delivery_delay');
    setFormTitle('');
    setFormDescription('');
    setFormOccurredAt('');
    setFormEvidenceUrl('');
  };

  const handleSubmitReport = async () => {
    if (!formTitle.trim() || !formOccurredAt) return;
    setSubmitting(true);

    try {
      const res = await fetch('/api/penalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          penalty_category: formCategory,
          title: formTitle.trim(),
          description: formDescription.trim() || null,
          occurred_at: formOccurredAt,
          evidence_url: formEvidenceUrl.trim() || null,
        }),
      });

      if (res.ok) {
        setModalOpen(false);
        resetForm();
        setLoading(true);
        await fetchData();
      } else {
        const err = await res.json();
        setError(err.error || '등록에 실패했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const riskScore = summary?.risk_score ?? 0;
  const riskLevel = summary?.risk_level ?? 'safe';
  const riskInfo = RISK_LEVELS[riskLevel] ?? RISK_LEVELS.safe;
  const gaugeColor = GAUGE_COLORS[riskLevel] ?? GAUGE_COLORS.safe;
  const resolvedCount = summary ? summary.total_records - summary.active_records : 0;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <div className="py-8 text-center text-gray-400">불러오는 중...</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-[#E31837]" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">페널티 트래커</h1>
            <p className="text-sm text-gray-500">쿠팡 셀러 페널티 현황 및 자가 관리</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition"
        >
          <Plus className="w-4 h-4" />
          자가 신고
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 text-red-600 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Risk Score Card */}
      <Card>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Gauge */}
          <div className="relative w-32 h-32 mx-auto sm:mx-0 flex-shrink-0">
            <svg className="w-32 h-32 -rotate-90" viewBox="0 0 128 128">
              <circle cx="64" cy="64" r="56" fill="none" stroke="#e5e7eb" strokeWidth="12" />
              <circle
                cx="64"
                cy="64"
                r="56"
                fill="none"
                stroke={gaugeColor}
                strokeWidth="12"
                strokeDasharray={`${(riskScore / 100) * 352} 352`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold">{riskScore}</span>
              <span className="text-sm text-gray-500">/ 100</span>
            </div>
          </div>

          {/* Risk info & stats */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-3">
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${riskInfo.bgColor} text-white`}>
                {riskLevel === 'safe' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
                {riskInfo.label}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500">전체 건수</p>
                <p className="text-xl font-bold text-gray-900">{summary?.total_records ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">미해결</p>
                <p className="text-xl font-bold text-orange-600">{summary?.active_records ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">해결 완료</p>
                <p className="text-xl font-bold text-green-600">{resolvedCount}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Category Breakdown */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {getCategoryCounts(summary).map(({ key, count }) => {
            const cat = getCategoryInfo(key);
            if (!cat) return null;
            return (
              <Card key={key} className="!p-4">
                <p className="text-xs text-gray-500 mb-1">{cat.label}</p>
                <p className="text-2xl font-bold text-gray-900">{count}</p>
                <p className="text-xs text-gray-400 mt-0.5">기본 {cat.score}점</p>
              </Card>
            );
          })}
        </div>
      )}

      {/* Records List */}
      {records.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">등록된 페널티가 없습니다.</p>
            <p className="text-sm text-gray-400 mt-1">양호한 셀러 상태를 유지하고 있습니다.</p>
          </div>
        </Card>
      ) : (
        <Card>
          <h3 className="text-sm font-bold text-gray-900 mb-3">페널티 내역</h3>
          <div className="space-y-3">
            {records.map((record) => {
              const cat = getCategoryInfo(record.penalty_category);
              return (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {cat && (
                        <Badge label={cat.label} colorClass={cat.color} />
                      )}
                      {record.reported_by === 'admin' && (
                        <Badge label="관리자 등록" colorClass="bg-gray-100 text-gray-600" />
                      )}
                      {record.reported_by === 'self' && (
                        <Badge label="자가 신고" colorClass="bg-indigo-100 text-indigo-700" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">{record.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-gray-500">{formatDate(record.occurred_at)}</p>
                      <p className="text-xs font-medium text-red-600">-{record.score_impact}점</p>
                      {record.evidence_url && (
                        <a
                          href={record.evidence_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          증빙자료
                        </a>
                      )}
                    </div>
                    {record.resolution_note && (
                      <p className="text-xs text-gray-500 mt-1 bg-gray-50 rounded px-2 py-1">
                        {record.resolution_note}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0 ml-3">
                    {record.is_resolved ? (
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-5 h-5" />
                        <div className="text-right">
                          <p className="text-xs font-medium">해결</p>
                          <p className="text-[10px] text-gray-400">{formatDate(record.resolved_at)}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-orange-500">
                        <Clock className="w-5 h-5" />
                        <p className="text-xs font-medium">미해결</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Self-Report Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="페널티 자가 신고">
        <div className="space-y-4">
          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
            <select
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
            >
              {PENALTY_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label} (기본 {cat.score}점)
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="페널티 사유를 간단히 입력하세요"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">상세 설명</label>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={3}
              placeholder="상세 내용을 작성해주세요 (선택)"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
            />
          </div>

          {/* Occurred date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">발생일</label>
            <input
              type="date"
              value={formOccurredAt}
              onChange={(e) => setFormOccurredAt(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
            />
          </div>

          {/* Evidence URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              증빙 URL <span className="text-gray-400">(선택)</span>
            </label>
            <input
              type="url"
              value={formEvidenceUrl}
              onChange={(e) => setFormEvidenceUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
            />
          </div>

          {/* Submit */}
          <button
            type="button"
            disabled={!formTitle.trim() || !formOccurredAt || submitting}
            onClick={handleSubmitReport}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {submitting ? '등록 중...' : '페널티 신고 등록'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
