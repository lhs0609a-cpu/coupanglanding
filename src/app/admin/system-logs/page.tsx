'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle2, RefreshCw, Filter } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import StatCard from '@/components/ui/StatCard';

type LogLevel = 'error' | 'warn' | 'info';

interface SystemLog {
  id: string;
  ts: string;
  level: LogLevel;
  category: string;
  source: string;
  message: string;
  context: Record<string, unknown>;
  fingerprint: string;
  occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
  resolution_hint: string | null;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  resolved_note: string | null;
}

interface Stats {
  total: number;
  errors: number;
  warns: number;
  unresolved: number;
  todayErrors: number;
  byCategory: Record<string, number>;
}

const CATEGORIES = [
  { value: 'all', label: '전체' },
  { value: 'coupang_api', label: '쿠팡 API' },
  { value: 'naver_api', label: '네이버 API' },
  { value: 'supabase', label: 'Supabase' },
  { value: 'payment', label: '결제' },
  { value: 'auth', label: '인증' },
  { value: 'cron', label: 'Cron' },
  { value: 'megaload', label: '메가로드' },
  { value: 'admin', label: '관리자' },
  { value: 'network', label: '네트워크' },
  { value: 'build', label: '빌드' },
  { value: 'other', label: '기타' },
];

const LEVEL_LABELS: Record<LogLevel, string> = {
  error: '에러',
  warn: '경고',
  info: '정보',
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  error: 'bg-red-100 text-red-700',
  warn: 'bg-yellow-100 text-yellow-700',
  info: 'bg-blue-100 text-blue-700',
};

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map(c => [c.value, c.label]),
);

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return '방금';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}분 전`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}시간 전`;
  return `${Math.floor(ms / 86_400_000)}일 전`;
}

export default function AdminSystemLogsPage() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [level, setLevel] = useState<'all' | LogLevel>('all');
  const [category, setCategory] = useState('all');
  const [resolved, setResolved] = useState<'all' | 'true' | 'false'>('false');
  const [sinceDays, setSinceDays] = useState(7);
  const [selected, setSelected] = useState<SystemLog | null>(null);
  const [resolvedNote, setResolvedNote] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        level, category, resolved,
        sinceDays: String(sinceDays),
      });
      const res = await fetch(`/api/admin/system-logs?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '조회 실패');
      setLogs(json.data || []);
      setStats(json.stats || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [level, category, resolved, sinceDays]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleResolve = async (log: SystemLog, makeResolved: boolean, note: string) => {
    try {
      const res = await fetch('/api/admin/system-logs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: log.id, resolved: makeResolved, resolved_note: note }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || '업데이트 실패');
      }
      setSelected(null);
      setResolvedNote('');
      fetchLogs();
    } catch (err) {
      alert(err instanceof Error ? err.message : '업데이트 실패');
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">시스템 로그</h1>
          <p className="text-sm text-gray-500 mt-1">관리자 전용 — API/Cron/Payment 등 시스템 전반의 오류와 경고</p>
        </div>
        <button
          type="button"
          onClick={fetchLogs}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 통계 카드 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <StatCard title="오늘 에러" value={String(stats.todayErrors)} subtitle={stats.todayErrors > 0 ? '확인 필요' : ''} trend={stats.todayErrors > 0 ? 'up' : undefined} />
          <StatCard title="미해결" value={String(stats.unresolved)} />
          <StatCard title={`${sinceDays}일 에러`} value={String(stats.errors)} />
          <StatCard title={`${sinceDays}일 경고`} value={String(stats.warns)} />
          <StatCard title={`${sinceDays}일 합계`} value={String(stats.total)} subtitle="발생 횟수" />
        </div>
      )}

      {/* 카테고리 분포 */}
      {stats && Object.keys(stats.byCategory).length > 0 && (
        <Card className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">카테고리별 발생</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byCategory)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, count]) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 text-xs rounded-full transition ${
                    category === cat
                      ? 'bg-[#E31837] text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {CATEGORY_LABELS[cat] || cat} <span className="font-semibold ml-1">{count}</span>
                </button>
              ))}
          </div>
        </Card>
      )}

      {/* 필터 */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">레벨</span>
            {(['all', 'error', 'warn', 'info'] as const).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(l)}
                className={`px-3 py-1 text-xs rounded-full transition ${
                  level === l ? 'bg-[#E31837] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {l === 'all' ? '전체' : LEVEL_LABELS[l]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">상태</span>
            {([
              { v: 'all', label: '전체' },
              { v: 'false', label: '미해결' },
              { v: 'true', label: '해결' },
            ] as const).map(s => (
              <button
                key={s.v}
                type="button"
                onClick={() => setResolved(s.v)}
                className={`px-3 py-1 text-xs rounded-full transition ${
                  resolved === s.v ? 'bg-[#E31837] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">기간</span>
            {[1, 7, 30].map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setSinceDays(d)}
                className={`px-3 py-1 text-xs rounded-full transition ${
                  sinceDays === d ? 'bg-[#E31837] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {d === 1 ? '오늘' : `${d}일`}
              </button>
            ))}
          </div>
          {category !== 'all' && (
            <button
              type="button"
              onClick={() => setCategory('all')}
              className="px-3 py-1 text-xs rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100"
            >
              {CATEGORY_LABELS[category] || category} ✕
            </button>
          )}
        </div>
      </Card>

      {/* 로그 테이블 */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">레벨</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">카테고리</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">소스</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">메시지</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">횟수</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">최근</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">상태</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                    조건에 맞는 로그가 없습니다.
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr
                    key={log.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${log.resolved ? 'opacity-60' : ''}`}
                    onClick={() => { setSelected(log); setResolvedNote(log.resolved_note || ''); }}
                  >
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${LEVEL_COLORS[log.level]}`}>
                        {log.level === 'error' && <AlertCircle className="w-3 h-3" />}
                        {log.level === 'warn' && <AlertTriangle className="w-3 h-3" />}
                        {log.level === 'info' && <Info className="w-3 h-3" />}
                        {LEVEL_LABELS[log.level]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{CATEGORY_LABELS[log.category] || log.category}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{log.source}</td>
                    <td className="px-4 py-3 text-gray-900 max-w-[400px] truncate">{log.message}</td>
                    <td className="px-4 py-3 text-center">
                      {log.occurrences > 1 ? (
                        <Badge label={`${log.occurrences}회`} colorClass="bg-orange-100 text-orange-700" />
                      ) : (
                        <span className="text-gray-400 text-xs">1</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{relTime(log.last_seen_at)}</td>
                    <td className="px-4 py-3 text-center">
                      {log.resolved ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* 상세 modal */}
      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="로그 상세" maxWidth="max-w-3xl">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${LEVEL_COLORS[selected.level]}`}>
                {LEVEL_LABELS[selected.level]}
              </span>
              <Badge label={CATEGORY_LABELS[selected.category] || selected.category} colorClass="bg-gray-100 text-gray-700" />
              {selected.occurrences > 1 && (
                <Badge label={`${selected.occurrences}회 발생`} colorClass="bg-orange-100 text-orange-700" />
              )}
              {selected.resolved && (
                <Badge label="해결됨" colorClass="bg-green-100 text-green-700" />
              )}
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">소스</div>
              <code className="text-sm text-gray-800 bg-gray-50 px-2 py-1 rounded">{selected.source}</code>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">메시지</div>
              <div className="text-sm text-gray-900 bg-gray-50 p-3 rounded whitespace-pre-wrap break-all">
                {selected.message}
              </div>
            </div>

            {selected.resolution_hint && (
              <div>
                <div className="text-xs text-blue-600 font-medium mb-1">💡 해결 가이드</div>
                <div className="text-sm text-blue-900 bg-blue-50 p-3 rounded">{selected.resolution_hint}</div>
              </div>
            )}

            <div>
              <div className="text-xs text-gray-500 mb-1">발생 시각</div>
              <div className="text-sm text-gray-700">
                처음: {new Date(selected.first_seen_at).toLocaleString('ko-KR')}
                {selected.first_seen_at !== selected.last_seen_at && (
                  <> · 최근: {new Date(selected.last_seen_at).toLocaleString('ko-KR')}</>
                )}
              </div>
            </div>

            {selected.context && Object.keys(selected.context).length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">컨텍스트</div>
                <pre className="text-xs text-gray-700 bg-gray-50 p-3 rounded overflow-auto max-h-60">
                  {JSON.stringify(selected.context, null, 2)}
                </pre>
              </div>
            )}

            <div>
              <div className="text-xs text-gray-500 mb-1">해결 메모</div>
              <textarea
                value={resolvedNote}
                onChange={e => setResolvedNote(e.target.value)}
                rows={3}
                placeholder="해결한 방법을 메모하세요..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#E31837]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              {selected.resolved ? (
                <button
                  type="button"
                  onClick={() => handleResolve(selected, false, resolvedNote)}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  미해결로 되돌리기
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleResolve(selected, true, resolvedNote)}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
                >
                  해결됨으로 표시
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
