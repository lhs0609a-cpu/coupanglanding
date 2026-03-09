'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  PENALTY_GUIDES,
  PENALTY_GROUPS,
  getGuidesByGroup,
  getSeverityColor,
  type PenaltyGuide,
  type PenaltyGroup,
} from '@/lib/data/penalty-response-guide';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import FeatureTutorial from '@/components/tutorial/FeatureTutorial';
import {
  ShieldCheck,
  Plus,
  AlertTriangle,
  CheckCircle,
  Clock,
  AlertCircle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Shield,
  FileText,
  Phone,
  Lightbulb,
  XCircle,
  BarChart3,
  Copy,
  Check,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────

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
}

// ── Constants ───────────────────────────────────────────

const RISK_LEVELS: Record<string, { label: string; bgColor: string }> = {
  safe: { label: '안전', bgColor: 'bg-green-500' },
  caution: { label: '주의', bgColor: 'bg-yellow-500' },
  warning: { label: '경고', bgColor: 'bg-orange-500' },
  danger: { label: '위험', bgColor: 'bg-red-500' },
};

const GAUGE_COLORS: Record<string, string> = {
  safe: '#22c55e',
  caution: '#eab308',
  warning: '#f97316',
  danger: '#ef4444',
};

type TabKey = 'guide' | 'tracker';

// ── Page Component ──────────────────────────────────────

export default function MyPenaltyPage() {
  const supabase = useMemo(() => createClient(), []);

  const [activeTab, setActiveTab] = useState<TabKey>('guide');
  const [records, setRecords] = useState<PenaltyRecord[]>([]);
  const [summary, setSummary] = useState<PenaltySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Guide state
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);

  // Report form state
  const [formCategory, setFormCategory] = useState(PENALTY_GUIDES[0].id);
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
    setFormCategory(PENALTY_GUIDES[0].id);
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

  const tabs: { key: TabKey; label: string; icon: typeof BookOpen }[] = [
    { key: 'guide', label: '대응 가이드', icon: BookOpen },
    { key: 'tracker', label: '내 페널티', icon: BarChart3 },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <FeatureTutorial featureKey="penalty" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-[#E31837]" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">페널티 트래커</h1>
            <p className="text-sm text-gray-500">
              쿠팡 셀러 페널티 유형별 실전 대응 가이드 및 현황 관리
            </p>
          </div>
        </div>
        {activeTab === 'tracker' && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition"
          >
            <Plus className="w-4 h-4" />
            자가 신고
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-[#E31837] text-[#E31837]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 text-red-600 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ═══ 대응 가이드 탭 ═══ */}
      {activeTab === 'guide' && (
        <div className="space-y-8">
          {(Object.keys(PENALTY_GROUPS) as PenaltyGroup[]).map((groupKey) => {
            const group = PENALTY_GROUPS[groupKey];
            const guides = getGuidesByGroup(groupKey);

            return (
              <div key={groupKey}>
                <div className="flex items-center gap-2 mb-4">
                  {groupKey === 'brand_claim' ? (
                    <Shield className="w-5 h-5 text-red-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-orange-600" />
                  )}
                  <h2 className="text-lg font-bold text-gray-900">{group.label}</h2>
                </div>

                <div className="space-y-3">
                  {guides.map((guide) => (
                    <GuideCard
                      key={guide.id}
                      guide={guide}
                      isExpanded={expandedGuide === guide.id}
                      onToggle={() =>
                        setExpandedGuide(expandedGuide === guide.id ? null : guide.id)
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ 내 페널티 탭 ═══ */}
      {activeTab === 'tracker' && (
        <div className="space-y-6">
          {loading ? (
            <Card>
              <div className="py-8 text-center text-gray-400">불러오는 중...</div>
            </Card>
          ) : (
            <>
              {/* Risk Score Card */}
              <Card>
                <div className="flex flex-col sm:flex-row items-center gap-6">
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

                  <div className="flex-1 text-center sm:text-left">
                    <div className="flex items-center justify-center sm:justify-start gap-2 mb-3">
                      <span
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${riskInfo.bgColor} text-white`}
                      >
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
                      const guide = PENALTY_GUIDES.find((g) => g.id === record.penalty_category);
                      return (
                        <div
                          key={record.id}
                          className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              {guide && (
                                <Badge label={guide.label} colorClass={guide.badgeColor} />
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
                                  <p className="text-[10px] text-gray-400">
                                    {formatDate(record.resolved_at)}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setExpandedGuide(record.penalty_category);
                                  setActiveTab('guide');
                                }}
                                className="flex items-center gap-1 text-orange-500 hover:text-[#E31837] transition"
                              >
                                <BookOpen className="w-4 h-4" />
                                <p className="text-xs font-medium">대응 가이드</p>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* Self-Report Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="페널티 자가 신고">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">페널티 유형</label>
            <select
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
            >
              {(Object.keys(PENALTY_GROUPS) as PenaltyGroup[]).map((groupKey) => {
                const group = PENALTY_GROUPS[groupKey];
                const guides = getGuidesByGroup(groupKey);
                return (
                  <optgroup key={groupKey} label={group.label}>
                    {guides.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label} ({g.severityLabel} / {g.scoreImpact}점)
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="페널티 사유를 간단히 입력하세요"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">상세 설명</label>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={3}
              placeholder="상세 내용을 작성해주세요 (선택)"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">발생일</label>
            <input
              type="date"
              value={formOccurredAt}
              onChange={(e) => setFormOccurredAt(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              증빙 URL <span className="text-gray-400">(선택)</span>
            </label>
            <input
              type="url"
              value={formEvidenceUrl}
              onChange={(e) => setFormEvidenceUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
            />
          </div>

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

// ── Guide Card Component ────────────────────────────────

function GuideCard({
  guide,
  isExpanded,
  onToggle,
}: {
  guide: PenaltyGuide;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const sev = getSeverityColor(guide.severity);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition">
      {/* Header (always visible) */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${sev.badge}`}>
            {guide.severityLabel}
          </span>
          <h3 className="font-bold text-gray-900">{guide.label}</h3>
          <span className="text-xs text-gray-400">-{guide.scoreImpact}점</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Short description (always visible) */}
      {!isExpanded && (
        <div className="px-4 pb-3 -mt-1">
          <p className="text-sm text-gray-500 line-clamp-2">{guide.shortDescription}</p>
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-100 p-4 space-y-6 bg-gray-50/50">
          {/* Description */}
          <div>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
              {guide.detailedDescription}
            </p>
          </div>

          {/* Response Steps */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-blue-600" />
              <h4 className="font-bold text-gray-900 text-sm">대응 절차</h4>
            </div>
            <div className="space-y-3">
              {guide.responseSteps.map((step) => (
                <div key={step.step} className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#E31837] text-white flex items-center justify-center text-xs font-bold mt-0.5">
                    {step.step}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{step.title}</p>
                    <p className="text-sm text-gray-600 mt-0.5 leading-relaxed whitespace-pre-line">
                      {step.description}
                    </p>
                    {step.deadline && (
                      <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {step.deadline}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Required Documents */}
          {guide.requiredDocuments.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-green-600" />
                <h4 className="font-bold text-gray-900 text-sm">필요 서류</h4>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                {guide.requiredDocuments.map((doc, i) => (
                  <div key={i} className="flex items-start gap-3 px-3 py-2.5">
                    {doc.required ? (
                      <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded bg-red-100 text-red-600 flex items-center justify-center text-[10px] font-bold">
                        필수
                      </span>
                    ) : (
                      <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-bold">
                        선택
                      </span>
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{doc.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Common Mistakes */}
          {guide.commonMistakes.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="w-4 h-4 text-red-500" />
                <h4 className="font-bold text-gray-900 text-sm">흔한 실수</h4>
              </div>
              <div className="bg-red-50 rounded-lg p-3 space-y-2">
                {guide.commonMistakes.map((mistake, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                    <span className="text-red-800">{mistake}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pro Tips */}
          {guide.proTips.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-4 h-4 text-yellow-500" />
                <h4 className="font-bold text-gray-900 text-sm">실전 팁</h4>
              </div>
              <div className="bg-yellow-50 rounded-lg p-3 space-y-2">
                {guide.proTips.map((tip, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <Lightbulb className="w-3.5 h-3.5 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <span className="text-yellow-900">{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Real Cases */}
          {guide.realCases.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4 text-indigo-500" />
                <h4 className="font-bold text-gray-900 text-sm">실제 사례</h4>
              </div>
              <div className="space-y-2">
                {guide.realCases.map((c, i) => (
                  <div
                    key={i}
                    className={`rounded-lg p-3 border ${
                      c.result === 'success'
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {c.result === 'success' ? (
                        <Badge label="성공" colorClass="bg-green-100 text-green-700" />
                      ) : (
                        <Badge label="실패" colorClass="bg-gray-200 text-gray-600" />
                      )}
                      <span className="text-sm font-semibold text-gray-900">{c.title}</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{c.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contact Info & Deadline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Deadline */}
            <div className="bg-orange-50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-xs font-bold text-orange-700">기한/제재</span>
              </div>
              <p className="text-sm text-orange-800">{guide.deadline}</p>
            </div>

            {/* Contacts */}
            {guide.contactInfo.length > 0 && (
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Phone className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-bold text-blue-700">연락처/제출처</span>
                </div>
                <div className="space-y-1">
                  {guide.contactInfo.map((c, i) => (
                    <ContactItem key={i} channel={c.channel} value={c.value} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Contact Item (copyable) ─────────────────────────────

function ContactItem({ channel, value }: { channel: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isLink = value.startsWith('http') || value.includes('.') && !value.includes('@') && !value.match(/^\d/);
  const isEmail = value.includes('@');

  return (
    <div className="flex items-center justify-between text-sm group">
      <span className="text-blue-700">
        <span className="text-blue-500 text-xs">{channel}:</span>{' '}
        {isEmail ? (
          <a href={`mailto:${value}`} className="hover:underline font-medium">
            {value}
          </a>
        ) : isLink ? (
          <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" className="hover:underline font-medium">
            {value}
          </a>
        ) : (
          <span className="font-medium">{value}</span>
        )}
      </span>
      <button
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 transition p-0.5 text-blue-400 hover:text-blue-600"
        title="복사"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}
