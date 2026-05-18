'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  GraduationCap, CheckCircle2, Lock, Clock, ExternalLink,
  Sparkles, Loader2, AlertCircle, ArrowRight,
} from 'lucide-react';

interface SubModule { key: string; title: string }
interface Module {
  key: string;
  title: string;
  category: string;
  external_link: string | null;
  sub_modules: SubModule[];
  display_order: number;
  trigger_hint: string | null;
}

type ProgressStatus = 'locked' | 'triggered' | 'in_progress' | 'completed' | 'needs_review';

interface Progress {
  module_key: string;
  status: ProgressStatus;
  sub_progress: Record<string, boolean>;
  triggered_at: string | null;
  completed_at: string | null;
  resume_point: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  upfront: '입점 전 준비',
  operation: '운영 기본',
  event: '실전 운영 (사건 발생 시)',
  milestone: '성장 단계',
  reactive: '문제 대응',
  optional: '선택 옵션',
};

const STATUS_META: Record<ProgressStatus, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  locked: { label: '아직 시작 안 함', icon: Lock, tone: 'text-gray-400' },
  triggered: { label: '시작하세요!', icon: Sparkles, tone: 'text-red-600' },
  in_progress: { label: '진행중', icon: Clock, tone: 'text-amber-600' },
  needs_review: { label: '검토 대기', icon: Clock, tone: 'text-purple-600' },
  completed: { label: '완료', icon: CheckCircle2, tone: 'text-green-600' },
};

export default function MyCurriculumPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/education/me');
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(data.error || '조회 실패'); return; }
        setModules(data.modules || []);
        setProgress(data.progress || []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '조회 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const progressByKey = useMemo(() => {
    const map = new Map<string, Progress>();
    for (const p of progress) map.set(p.module_key, p);
    return map;
  }, [progress]);

  const stats = useMemo(() => {
    const total = modules.length;
    let completed = 0, active = 0, locked = 0;
    for (const m of modules) {
      const p = progressByKey.get(m.key);
      if (p?.status === 'completed') completed++;
      else if (p?.status === 'in_progress' || p?.status === 'triggered') active++;
      else if (!p || p.status === 'locked') locked++;
    }
    return { total, completed, active, locked, pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }, [modules, progressByKey]);

  const todayTasks = useMemo(() => {
    return modules
      .filter(m => {
        const p = progressByKey.get(m.key);
        return p?.status === 'triggered' || p?.status === 'in_progress';
      })
      .slice(0, 5);
  }, [modules, progressByKey]);

  const grouped = useMemo(() => {
    const groups: Record<string, Module[]> = {};
    for (const m of modules) {
      if (!groups[m.category]) groups[m.category] = [];
      groups[m.category].push(m);
    }
    return groups;
  }, [modules]);

  if (loading) {
    return (
      <div className="py-16 text-center text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        교육 현황 불러오는 중…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">쿠팡 PT 교육 현황</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          진행 상황을 확인하고 다음에 배울 내용을 살펴보세요. 트레이너가 진도를 함께 관리합니다.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-gradient-to-br from-red-500 to-rose-500 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm opacity-90">전체 진행률</div>
          <div className="text-xs opacity-75">완료 {stats.completed} · 진행중 {stats.active} · 대기 {stats.locked}</div>
        </div>
        <div className="text-4xl font-bold mb-3">
          {stats.completed}<span className="text-2xl opacity-75">/{stats.total}</span>
          <span className="text-lg opacity-75 ml-2">({stats.pct}%)</span>
        </div>
        <div className="h-3 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-white transition-all" style={{ width: `${stats.pct}%` }} />
        </div>
      </div>

      {todayTasks.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-amber-600" />
            <div className="font-semibold text-amber-900">지금 배울 차례입니다</div>
          </div>
          <div className="space-y-2">
            {todayTasks.map((m) => {
              const p = progressByKey.get(m.key);
              return (
                <div key={m.key} className="flex items-center justify-between bg-white rounded-lg p-3">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                      {m.title}
                      <span className={`px-2 py-0.5 text-[11px] rounded ${
                        p?.status === 'in_progress'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {p?.status === 'in_progress' ? '진행중' : '시작'}
                      </span>
                    </div>
                    {m.trigger_hint && (
                      <div className="text-xs text-gray-500 mt-0.5">{m.trigger_hint}</div>
                    )}
                    {p?.resume_point && (
                      <div className="text-[11px] text-amber-700 mt-1">🔖 {p.resume_point}</div>
                    )}
                  </div>
                  {m.external_link && (
                    <a
                      href={m.external_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium"
                    >
                      가이드 보기 <ArrowRight className="w-3 h-3" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-5">
        {Object.entries(grouped).map(([category, mods]) => (
          <div key={category} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <div className="font-semibold text-gray-800">{CATEGORY_LABELS[category] || category}</div>
            </div>
            <div className="divide-y divide-gray-100">
              {mods.map((m) => {
                const p = progressByKey.get(m.key);
                const status: ProgressStatus = p?.status || 'locked';
                const meta = STATUS_META[status];
                const Icon = meta.icon;
                return (
                  <div key={m.key} className="px-5 py-3 flex items-center gap-3">
                    <Icon className={`w-5 h-5 flex-shrink-0 ${meta.tone}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{m.title}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        <span className={meta.tone}>{meta.label}</span>
                        {m.trigger_hint && <span className="ml-2">· {m.trigger_hint}</span>}
                        {p?.completed_at && (
                          <span className="ml-2">· {new Date(p.completed_at).toLocaleDateString('ko-KR')} 완료</span>
                        )}
                      </div>
                      {m.sub_modules.length > 0 && status !== 'locked' && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {m.sub_modules.map((sm) => {
                            const done = p?.sub_progress?.[sm.key];
                            return (
                              <span
                                key={sm.key}
                                className={`px-1.5 py-0.5 text-[10px] rounded border ${
                                  done
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : 'bg-gray-50 text-gray-400 border-gray-200'
                                }`}
                              >
                                {done && '✓ '}{sm.title}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {m.external_link && (
                      <a
                        href={m.external_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-[#E31837] p-1"
                        title="외부 가이드"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
