'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  GraduationCap, Users, AlertTriangle, CheckCircle2, Clock,
  ChevronRight, Search, Loader2,
} from 'lucide-react';

interface StudentRow {
  ptUserId: string;
  profileId: string | null;
  fullName: string;
  email: string;
  status: string;
  progress: {
    completed: number;
    inProgress: number;
    triggered: number;
    needsReview: number;
    stale: number;
    total: number;
  };
}

type FilterTab = 'all' | 'stale' | 'active' | 'review' | 'completed';

export default function AdminEducationPage() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/education/students');
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(data.error || '조회 실패'); return; }
        setStudents(data.students || []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '조회 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => ({
    all: students.length,
    stale: students.filter(s => s.progress.stale > 0).length,
    active: students.filter(s => s.progress.inProgress > 0 || s.progress.triggered > 0).length,
    review: students.filter(s => s.progress.needsReview > 0).length,
    completed: students.filter(s => s.progress.total > 0 && s.progress.completed === s.progress.total).length,
  }), [students]);

  const filtered = useMemo(() => {
    let list = students;
    if (tab === 'stale') list = list.filter(s => s.progress.stale > 0);
    else if (tab === 'active') list = list.filter(s => s.progress.inProgress > 0 || s.progress.triggered > 0);
    else if (tab === 'review') list = list.filter(s => s.progress.needsReview > 0);
    else if (tab === 'completed') list = list.filter(s => s.progress.total > 0 && s.progress.completed === s.progress.total);

    if (keyword.trim()) {
      const kw = keyword.toLowerCase();
      list = list.filter(s =>
        s.fullName.toLowerCase().includes(kw) ||
        s.email.toLowerCase().includes(kw),
      );
    }
    return list;
  }, [students, tab, keyword]);

  if (loading) {
    return (
      <div className="py-16 text-center text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        교육 현황 불러오는 중…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-[#E31837]" />
            <h1 className="text-2xl font-bold text-gray-900">교육 관리</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            쿠팡 PT 회원들의 교육 진행 상황 · 시트의 "쿠팡PT 회원님들 교육 현황판" 디지털 전환
          </p>
        </div>
        <Link
          href="/admin/education/import"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
        >
          시트 데이터 import
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="전체 학생" value={counts.all} icon={Users}
          active={tab === 'all'} onClick={() => setTab('all')}
          tone="gray"
        />
        <StatCard
          label="정체 (7일+)" value={counts.stale} icon={AlertTriangle}
          active={tab === 'stale'} onClick={() => setTab('stale')}
          tone="red"
        />
        <StatCard
          label="진행중" value={counts.active} icon={Clock}
          active={tab === 'active'} onClick={() => setTab('active')}
          tone="amber"
        />
        <StatCard
          label="검토 대기" value={counts.review} icon={ChevronRight}
          active={tab === 'review'} onClick={() => setTab('review')}
          tone="blue"
        />
        <StatCard
          label="완료" value={counts.completed} icon={CheckCircle2}
          active={tab === 'completed'} onClick={() => setTab('completed')}
          tone="green"
        />
      </div>

      {/* 검색 */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="이름 또는 이메일 검색…"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none"
        />
      </div>

      {/* 학생 목록 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            {keyword ? `"${keyword}" 검색 결과 없음` : '학생이 없습니다'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">학생</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-72">진행률</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">상태</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 w-24">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const pct = s.progress.total > 0 ? Math.round((s.progress.completed / s.progress.total) * 100) : 0;
                return (
                  <tr key={s.ptUserId} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{s.fullName}</div>
                      <div className="text-xs text-gray-400">{s.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-16 text-right">
                          {s.progress.completed}/{s.progress.total} ({pct}%)
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {s.progress.stale > 0 && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[11px] rounded font-medium">
                            정체 {s.progress.stale}
                          </span>
                        )}
                        {s.progress.inProgress > 0 && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[11px] rounded font-medium">
                            진행중 {s.progress.inProgress}
                          </span>
                        )}
                        {s.progress.triggered > 0 && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[11px] rounded font-medium">
                            대기 {s.progress.triggered}
                          </span>
                        )}
                        {s.progress.needsReview > 0 && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[11px] rounded font-medium">
                            검토 {s.progress.needsReview}
                          </span>
                        )}
                        {s.progress.completed === s.progress.total && s.progress.total > 0 && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[11px] rounded font-medium">
                            완료
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/education/${s.ptUserId}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-[#E31837] hover:bg-[#c01530] text-white rounded-lg font-medium transition"
                      >
                        보기
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label, value, icon: Icon, active, onClick, tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
  tone: 'gray' | 'red' | 'amber' | 'blue' | 'green';
}) {
  const tones: Record<typeof tone, string> = {
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
  };
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-1 p-4 rounded-xl border text-left transition ${
        active ? `${tones[tone]} ring-2 ring-offset-1 ring-current/30` : 'bg-white border-gray-200 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </button>
  );
}
