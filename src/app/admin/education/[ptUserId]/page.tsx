'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, Circle, Lock, Loader2, PlayCircle, ClipboardEdit,
  ExternalLink, AlertCircle, RotateCcw, X,
} from 'lucide-react';

interface SubModule { key: string; title: string }
interface Module {
  key: string;
  title: string;
  category: string;
  external_link: string | null;
  sub_modules: SubModule[];
  trigger_condition: { type: string; event?: string; metric?: string; threshold?: number };
  display_order: number;
  trigger_hint: string | null;
}

type ProgressStatus = 'locked' | 'triggered' | 'in_progress' | 'completed' | 'needs_review';

interface Progress {
  id: string;
  pt_user_id: string;
  module_key: string;
  status: ProgressStatus;
  sub_progress: Record<string, boolean>;
  triggered_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  resume_point: string | null;
}

interface PtUserInfo {
  id: string;
  status: string;
  profile: { id: string; full_name: string; email: string; phone: string | null } | { id: string; full_name: string; email: string; phone: string | null }[];
}

const STATUS_LABELS: Record<ProgressStatus, { label: string; tone: string }> = {
  locked: { label: '잠금', tone: 'bg-gray-100 text-gray-500 border-gray-200' },
  triggered: { label: '진행전', tone: 'bg-red-50 text-red-700 border-red-200' },
  in_progress: { label: '진행중', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  needs_review: { label: '검토', tone: 'bg-purple-50 text-purple-700 border-purple-200' },
  completed: { label: '완료', tone: 'bg-green-50 text-green-700 border-green-200' },
};

const CATEGORY_LABELS: Record<string, string> = {
  upfront: '입점 전',
  operation: '운영 기본',
  event: '이벤트 트리거',
  milestone: '마일스톤',
  reactive: '대응',
  optional: '선택',
};

export default function StudentEducationPage() {
  const params = useParams<{ ptUserId: string }>();
  const router = useRouter();
  const ptUserId = params?.ptUserId;
  const [ptUser, setPtUser] = useState<PtUserInfo | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ module: Module; progress: Progress | null } | null>(null);

  const fetchData = useCallback(async () => {
    if (!ptUserId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/education/students/${ptUserId}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || '조회 실패'); return; }
      setPtUser(data.ptUser);
      setModules(data.modules || []);
      setProgress(data.progress || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [ptUserId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const progressByKey = useMemo(() => {
    const map = new Map<string, Progress>();
    for (const p of progress) map.set(p.module_key, p);
    return map;
  }, [progress]);

  const groupedModules = useMemo(() => {
    const groups: Record<string, Module[]> = {};
    for (const m of modules) {
      if (!groups[m.category]) groups[m.category] = [];
      groups[m.category].push(m);
    }
    return groups;
  }, [modules]);

  const stats = useMemo(() => {
    const total = modules.length;
    let completed = 0, inProgress = 0, triggered = 0;
    for (const p of progress) {
      if (p.status === 'completed') completed++;
      else if (p.status === 'in_progress') inProgress++;
      else if (p.status === 'triggered') triggered++;
    }
    return { total, completed, inProgress, triggered, pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }, [modules, progress]);

  // 재개 지점 = 진행중 첫 모듈 또는 트리거된 첫 모듈
  const resumeKey = useMemo(() => {
    for (const m of modules) {
      const p = progressByKey.get(m.key);
      if (p?.status === 'in_progress' || p?.status === 'triggered') return m.key;
    }
    return null;
  }, [modules, progressByKey]);

  const handleScrollToResume = () => {
    if (!resumeKey) return;
    const el = document.getElementById(`module-${resumeKey}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleQuickStatusChange = async (moduleKey: string, status: ProgressStatus) => {
    try {
      const res = await fetch(`/api/admin/education/students/${ptUserId}/${moduleKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setError(e.error || '저장 실패');
        return;
      }
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        교육 현황 불러오는 중…
      </div>
    );
  }

  const profile = ptUser?.profile && (Array.isArray(ptUser.profile) ? ptUser.profile[0] : ptUser.profile);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/education" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" />
          교육 관리로 돌아가기
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{profile?.full_name || '학생'}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              <span>{profile?.email}</span>
              {profile?.phone && <span>· {profile.phone}</span>}
            </div>
          </div>
          {resumeKey && (
            <button
              onClick={handleScrollToResume}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition"
            >
              <RotateCcw className="w-4 h-4" />
              여기서부터 재개
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* 진행률 요약 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-gray-700">전체 진행률</div>
          <div className="text-2xl font-bold text-gray-900">
            {stats.completed}<span className="text-base text-gray-400">/{stats.total}</span>
            <span className="text-base text-gray-500 ml-2">({stats.pct}%)</span>
          </div>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${stats.pct}%` }} />
        </div>
        <div className="flex gap-2 mt-3 text-xs">
          <span className="px-2 py-1 bg-green-100 text-green-700 rounded">완료 {stats.completed}</span>
          <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded">진행중 {stats.inProgress}</span>
          <span className="px-2 py-1 bg-red-50 text-red-700 rounded">진행전 {stats.triggered}</span>
        </div>
      </div>

      {/* 시트 모양 매트릭스 */}
      <div className="space-y-5">
        {Object.entries(groupedModules).map(([category, mods]) => (
          <div key={category} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div className="font-semibold text-gray-800">{CATEGORY_LABELS[category] || category}</div>
              <div className="text-xs text-gray-400">{mods.length}개 모듈</div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-100/50 border-b border-gray-200 text-xs text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2 font-medium w-40">시점</th>
                  <th className="text-left px-4 py-2 font-medium">교육</th>
                  <th className="text-left px-4 py-2 font-medium">하위 항목</th>
                  <th className="text-center px-4 py-2 font-medium w-32">상태</th>
                  <th className="text-right px-4 py-2 font-medium w-32">관리</th>
                </tr>
              </thead>
              <tbody>
                {mods.map((m) => {
                  const p = progressByKey.get(m.key);
                  const status: ProgressStatus = p?.status || 'locked';
                  const meta = STATUS_LABELS[status];
                  return (
                    <tr
                      id={`module-${m.key}`}
                      key={m.key}
                      className={`border-b border-gray-100 hover:bg-gray-50 ${status === 'triggered' || status === 'in_progress' ? 'bg-amber-50/30' : ''}`}
                    >
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {m.trigger_hint || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 flex items-center gap-2">
                          {m.title}
                          {m.external_link && (
                            <a
                              href={m.external_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-700"
                              title="외부 가이드"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        {p?.notes && (
                          <div className="text-[11px] text-gray-500 mt-1 flex items-start gap-1">
                            <ClipboardEdit className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span className="line-clamp-2">{p.notes}</span>
                          </div>
                        )}
                        {p?.resume_point && (
                          <div className="text-[11px] text-amber-700 mt-1 bg-amber-50 px-2 py-1 rounded inline-block">
                            🔖 {p.resume_point}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {m.sub_modules.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {m.sub_modules.map((sm) => {
                              const done = p?.sub_progress?.[sm.key];
                              return (
                                <span
                                  key={sm.key}
                                  className={`px-2 py-0.5 text-[11px] rounded border ${
                                    done
                                      ? 'bg-green-50 text-green-700 border-green-200'
                                      : 'bg-gray-50 text-gray-500 border-gray-200'
                                  }`}
                                >
                                  {done ? '✓ ' : ''}{sm.title}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2.5 py-1 text-xs rounded border ${meta.tone}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {status !== 'completed' && (
                            <button
                              onClick={() => handleQuickStatusChange(m.key,
                                status === 'locked' || status === 'triggered' ? 'in_progress' : 'completed',
                              )}
                              className="px-2 py-1 text-[11px] bg-blue-500 hover:bg-blue-600 text-white rounded font-medium"
                              title={status === 'locked' || status === 'triggered' ? '진행 시작' : '완료 처리'}
                            >
                              {status === 'locked' || status === 'triggered' ? '시작' : '완료'}
                            </button>
                          )}
                          {status === 'completed' && (
                            <button
                              onClick={() => handleQuickStatusChange(m.key, 'in_progress')}
                              className="px-2 py-1 text-[11px] bg-gray-200 hover:bg-gray-300 text-gray-700 rounded font-medium"
                              title="다시 진행"
                            >
                              재진행
                            </button>
                          )}
                          <button
                            onClick={() => setEditing({ module: m, progress: p || null })}
                            className="px-2 py-1 text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-medium"
                            title="상세 편집"
                          >
                            <ClipboardEdit className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {editing && (
        <EditModal
          module={editing.module}
          progress={editing.progress}
          ptUserId={ptUserId!}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchData(); }}
        />
      )}
    </div>
  );
}

function EditModal({
  module,
  progress,
  ptUserId,
  onClose,
  onSaved,
}: {
  module: Module;
  progress: Progress | null;
  ptUserId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<ProgressStatus>(progress?.status || 'triggered');
  const [subProgress, setSubProgress] = useState<Record<string, boolean>>(progress?.sub_progress || {});
  const [notes, setNotes] = useState(progress?.notes || '');
  const [resumePoint, setResumePoint] = useState(progress?.resume_point || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setErr('');
    try {
      const res = await fetch(`/api/admin/education/students/${ptUserId}/${module.key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, subProgress, notes: notes || null, resumePoint: resumePoint || null }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || '저장 실패'); setSaving(false); return; }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{module.title}</h2>
            {module.trigger_hint && (
              <div className="text-xs text-gray-500 mt-0.5">{module.trigger_hint}</div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">상태</label>
            <div className="grid grid-cols-5 gap-1.5">
              {(['locked', 'triggered', 'in_progress', 'needs_review', 'completed'] as ProgressStatus[]).map((s) => {
                const meta = STATUS_LABELS[s];
                return (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`px-2 py-2 text-xs rounded border ${
                      status === s ? meta.tone + ' ring-2 ring-offset-1 ring-current/30' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {module.sub_modules.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">하위 항목</label>
              <div className="space-y-1.5">
                {module.sub_modules.map((sm) => (
                  <label key={sm.key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!subProgress[sm.key]}
                      onChange={(e) => setSubProgress({ ...subProgress, [sm.key]: e.target.checked })}
                      className="w-4 h-4 accent-[#E31837]"
                    />
                    <span className="text-sm text-gray-700">{sm.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">트레이너 메모</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="이 학생 특이사항, 다음 액션 등"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              재개 지점 <span className="text-gray-400 font-normal">(다음에 어디부터 시작할지)</span>
            </label>
            <input
              type="text"
              value={resumePoint}
              onChange={(e) => setResumePoint(e.target.value)}
              placeholder="예: 광고비까지 설명 완료, 다음에 ROAS부터"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none"
            />
          </div>

          {err && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {err}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 text-sm bg-[#E31837] hover:bg-[#c01530] text-white rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
