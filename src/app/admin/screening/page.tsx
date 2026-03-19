'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ScreeningLink } from '@/lib/supabase/types';
import {
  SCREENING_STATUS_LABELS,
  SCREENING_STATUS_COLORS,
  SCREENING_GRADE_LABELS,
  SCREENING_GRADE_COLORS,
  SCREENING_DECISION_LABELS,
  SCREENING_DECISION_COLORS,
  SCREENING_CATEGORY_LABELS,
} from '@/lib/utils/constants';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from 'recharts';
import {
  Plus, Copy, Eye, Check, X, Clock, Link2,
} from 'lucide-react';

interface CategoryScoreData {
  category: string;
  label: string;
  rawScore: number;
  weightedScore: number;
  maxWeighted: number;
  percentage: number;
}

interface FlagData {
  type: string;
  severity: string;
  label: string;
  description: string;
}

interface ConsistencyData {
  questionIds: string[];
  message: string;
}

export default function AdminScreeningPage() {
  const [links, setLinks] = useState<ScreeningLink[]>([]);
  const [loading, setLoading] = useState(true);

  // 생성 모달
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createMemo, setCreateMemo] = useState('');
  const [createDays, setCreateDays] = useState(7);
  const [creating, setCreating] = useState(false);

  // 상세 모달
  const [selectedLink, setSelectedLink] = useState<ScreeningLink | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // 판정
  const [decision, setDecision] = useState('');
  const [decisionMemo, setDecisionMemo] = useState('');
  const [saving, setSaving] = useState(false);

  // 복사 확인
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/screening');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLinks(data.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  // 통계
  const stats = useMemo(() => {
    const total = links.length;
    const pending = links.filter((l) => l.status === 'pending').length;
    const completed = links.filter((l) => l.status === 'completed').length;
    const scores = links
      .map((l) => l.screening_result?.total_score)
      .filter((s): s is number => s !== undefined && s !== null);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : 0;
    return { total, pending, completed, avgScore };
  }, [links]);

  // 링크 생성
  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/screening', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_name: createName.trim(),
          candidate_phone: createPhone.trim() || undefined,
          candidate_memo: createMemo.trim() || undefined,
          expires_days: createDays,
        }),
      });
      if (!res.ok) throw new Error();
      setShowCreate(false);
      setCreateName('');
      setCreatePhone('');
      setCreateMemo('');
      setCreateDays(7);
      fetchLinks();
    } catch {
      alert('생성에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  // 상세 보기
  const openDetail = async (link: ScreeningLink) => {
    setSelectedLink(link);
    setDecision(link.screening_result?.admin_decision || 'pending');
    setDecisionMemo(link.screening_result?.admin_memo || '');
    setShowDetail(true);

    // 최신 데이터 다시 로드
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/screening/${link.id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedLink(data.data);
        setDecision(data.data.screening_result?.admin_decision || 'pending');
        setDecisionMemo(data.data.screening_result?.admin_memo || '');
      }
    } catch {
      // ignore
    } finally {
      setDetailLoading(false);
    }
  };

  // 판정 저장
  const saveDecision = async () => {
    if (!selectedLink) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/screening/${selectedLink.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_decision: decision, admin_memo: decisionMemo }),
      });
      if (!res.ok) throw new Error();
      setShowDetail(false);
      fetchLinks();
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 링크 복사
  const copyLink = (token: string, linkId: string) => {
    const url = `${window.location.origin}/screening/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(linkId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const result = selectedLink?.screening_result;
  const categoryScores = (result?.category_scores || []) as unknown as CategoryScoreData[];
  const redFlags = (result?.red_flags || []) as unknown as FlagData[];
  const yellowFlags = (result?.yellow_flags || []) as unknown as FlagData[];
  const greenFlags = (result?.green_flags || []) as unknown as FlagData[];
  const consistencyWarnings = (result?.consistency_warnings || []) as unknown as ConsistencyData[];

  // 레이더 차트 데이터
  const radarData = categoryScores.map((c) => ({
    subject: SCREENING_CATEGORY_LABELS[c.category] || c.label,
    score: c.percentage,
    fullMark: 100,
  }));

  // 바 차트 데이터
  const barData = categoryScores.map((c) => ({
    name: SCREENING_CATEGORY_LABELS[c.category] || c.label,
    score: c.weightedScore,
    max: c.maxWeighted,
  }));

  const barColors = ['#E31837', '#FF6B6B', '#FFA07A', '#FFD700', '#87CEEB', '#90EE90', '#9B59B6'];

  const gradeColor = (g?: string) => {
    if (!g) return 'text-gray-400';
    const map: Record<string, string> = { S: 'text-purple-600', A: 'text-green-600', B: 'text-blue-600', C: 'text-yellow-600', D: 'text-red-600' };
    return map[g] || 'text-gray-400';
  };

  const gradeBg = (g?: string) => {
    if (!g) return 'bg-gray-100';
    const map: Record<string, string> = { S: 'bg-purple-50', A: 'bg-green-50', B: 'bg-blue-50', C: 'bg-yellow-50', D: 'bg-red-50' };
    return map[g] || 'bg-gray-100';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">파트너 스크리닝</h1>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#E31837] text-white rounded-lg text-sm font-medium hover:bg-[#C41530] transition"
        >
          <Plus className="w-4 h-4" />
          새 링크 생성
        </button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: '총 링크', value: stats.total, icon: Link2, color: 'text-blue-600 bg-blue-50' },
          { label: '대기중', value: stats.pending, icon: Clock, color: 'text-yellow-600 bg-yellow-50' },
          { label: '완료', value: stats.completed, icon: Check, color: 'text-green-600 bg-green-50' },
          { label: '평균 점수', value: stats.avgScore, icon: Eye, color: 'text-purple-600 bg-purple-50' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                <s.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className="text-xl font-bold text-gray-900">{s.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 링크 목록 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">로딩 중...</div>
        ) : links.length === 0 ? (
          <div className="p-8 text-center text-gray-400">스크리닝 링크가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">이름</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">상태</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">등급</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">점수</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">판정</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">생성일</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {links.map((link) => {
                  const r = link.screening_result;
                  return (
                    <tr key={link.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{link.candidate_name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${SCREENING_STATUS_COLORS[link.status] || ''}`}>
                          {SCREENING_STATUS_LABELS[link.status] || link.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {r?.grade ? (
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${SCREENING_GRADE_COLORS[r.grade] || ''}`}>
                            {SCREENING_GRADE_LABELS[r.grade] || r.grade}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r?.total_score != null ? (
                          <span className="font-semibold">{r.total_score}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r?.admin_decision ? (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${SCREENING_DECISION_COLORS[r.admin_decision] || ''}`}>
                            {SCREENING_DECISION_LABELS[r.admin_decision] || r.admin_decision}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(link.created_at).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            type="button"
                            onClick={() => copyLink(link.token, link.id)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                            title="링크 복사"
                          >
                            {copiedId === link.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                          {link.status === 'completed' && (
                            <button
                              type="button"
                              onClick={() => openDetail(link)}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                              title="결과 보기"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 생성 모달 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">새 스크리닝 링크</h2>
              <button type="button" onClick={() => setShowCreate(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">후보자 이름 *</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-[#E31837] focus:ring-0 outline-none"
                  placeholder="김파트너"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
                <input
                  type="text"
                  value={createPhone}
                  onChange={(e) => setCreatePhone(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-[#E31837] focus:ring-0 outline-none"
                  placeholder="010-1234-5678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
                <textarea
                  value={createMemo}
                  onChange={(e) => setCreateMemo(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-[#E31837] focus:ring-0 outline-none resize-none"
                  placeholder="비고 사항"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">만료 기한</label>
                <select
                  value={createDays}
                  onChange={(e) => setCreateDays(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value={3}>3일</option>
                  <option value={7}>7일</option>
                  <option value={14}>14일</option>
                  <option value={30}>30일</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!createName.trim() || creating}
                className="flex-1 py-2.5 bg-[#E31837] text-white rounded-lg text-sm font-medium hover:bg-[#C41530] disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {creating ? '생성 중...' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 결과 상세 모달 */}
      {showDetail && selectedLink && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8">
          <div className="bg-white rounded-2xl w-full max-w-3xl mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">
                {selectedLink.candidate_name} — 스크리닝 결과
              </h2>
              <button type="button" onClick={() => setShowDetail(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {detailLoading ? (
              <div className="py-8 text-center text-gray-400">로딩 중...</div>
            ) : result ? (
              <div className="space-y-6">
                {/* 등급 + 점수 */}
                <div className={`flex items-center gap-6 rounded-xl p-6 ${gradeBg(result.grade)}`}>
                  <div className="text-center">
                    <div className={`text-5xl font-black ${gradeColor(result.grade)}`}>{result.grade}</div>
                    <div className="text-xs text-gray-500 mt-1">{SCREENING_GRADE_LABELS[result.grade]}</div>
                  </div>
                  <div className="flex-1">
                    <div className="text-3xl font-bold text-gray-900">{result.total_score}<span className="text-lg text-gray-400">/100</span></div>
                    <div className="text-sm text-gray-500 mt-1">
                      응시 시간: {Math.floor(result.time_spent_seconds / 60)}분 {result.time_spent_seconds % 60}초
                    </div>
                    {(result.knockout_reasons as unknown as string[])?.length > 0 && (
                      <div className="mt-2 text-xs text-red-600 font-medium">
                        녹아웃: {(result.knockout_reasons as unknown as string[]).join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* 레이더 차트 + 바 차트 */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">카테고리별 레이더</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <RadarChart data={radarData}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                        <Radar name="점수" dataKey="score" stroke="#E31837" fill="#E31837" fillOpacity={0.3} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">카테고리별 가중 점수</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={barData} layout="vertical" margin={{ left: 10 }}>
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                        <Tooltip />
                        <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                          {barData.map((_, i) => (
                            <Cell key={i} fill={barColors[i % barColors.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 플래그 */}
                <div className="grid md:grid-cols-3 gap-4">
                  {redFlags.length > 0 && (
                    <div className="border border-red-200 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-red-700 mb-2">🚩 위험 ({redFlags.length})</h3>
                      <div className="space-y-2">
                        {redFlags.map((f, i) => (
                          <div key={i} className="text-xs">
                            <span className="font-medium text-red-800">{f.label}</span>
                            <p className="text-red-600">{f.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {yellowFlags.length > 0 && (
                    <div className="border border-yellow-200 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-yellow-700 mb-2">⚠ 주의 ({yellowFlags.length})</h3>
                      <div className="space-y-2">
                        {yellowFlags.map((f, i) => (
                          <div key={i} className="text-xs">
                            <span className="font-medium text-yellow-800">{f.label}</span>
                            <p className="text-yellow-600">{f.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {greenFlags.length > 0 && (
                    <div className="border border-green-200 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-green-700 mb-2">✅ 강점 ({greenFlags.length})</h3>
                      <div className="space-y-2">
                        {greenFlags.map((f, i) => (
                          <div key={i} className="text-xs">
                            <span className="font-medium text-green-800">{f.label}</span>
                            <p className="text-green-600">{f.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 일관성 경고 */}
                {consistencyWarnings.length > 0 && (
                  <div className="border border-orange-200 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-orange-700 mb-2">🔍 일관성 경고</h3>
                    <div className="space-y-2">
                      {consistencyWarnings.map((w, i) => (
                        <p key={i} className="text-xs text-orange-700">{w.message}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* 자유 서술 */}
                {result.free_text_answer && (
                  <div className="border border-gray-200 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">📝 자유 서술 답변</h3>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{result.free_text_answer}</p>
                  </div>
                )}

                {/* 판정 */}
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">관리자 판정</h3>
                  <div className="flex gap-2 mb-3">
                    {(['approved', 'hold', 'rejected'] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDecision(d)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                          decision === d
                            ? d === 'approved' ? 'bg-green-600 text-white'
                            : d === 'hold' ? 'bg-orange-500 text-white'
                            : 'bg-red-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {SCREENING_DECISION_LABELS[d]}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={decisionMemo}
                    onChange={(e) => setDecisionMemo(e.target.value)}
                    rows={2}
                    placeholder="판정 메모 (선택)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:border-[#E31837] focus:ring-0 outline-none resize-none"
                  />
                  <button
                    type="button"
                    onClick={saveDecision}
                    disabled={saving || decision === 'pending'}
                    className="px-6 py-2.5 bg-[#E31837] text-white rounded-lg text-sm font-medium hover:bg-[#C41530] disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {saving ? '저장 중...' : '판정 저장'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-gray-400">결과 데이터가 없습니다.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
