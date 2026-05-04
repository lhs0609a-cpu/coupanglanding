'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CHANNEL_SHORT_LABELS, CHANNEL_LABELS } from '@/lib/megaload/constants';
import type { Channel } from '@/lib/megaload/types';
import {
  Copy, CheckCircle2, AlertTriangle, Clock, Loader2, RefreshCw,
  ChevronLeft, XCircle, Package,
} from 'lucide-react';

interface JobRow {
  id: string;
  source_channel: string;
  target_channels: string[];
  product_ids: string[];
  margin_settings: Record<string, number>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  error_log: Array<{ product_id: string; channel: string; error: string; at: string }>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<JobRow['status'], string> = {
  pending: '대기 중',
  running: '진행 중',
  completed: '완료',
  failed: '실패',
  cancelled: '취소됨',
};

const STATUS_STYLES: Record<JobRow['status'], string> = {
  pending: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '-';
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const sec = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}분 ${s}초`;
  const h = Math.floor(m / 60);
  return `${h}시간 ${m % 60}분`;
}

export default function ReplicationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const router = useRouter();
  const focusJobId = searchParams.get('job');

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(focusJobId);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const { data: shUser } = await supabase
      .from('megaload_users')
      .select('id')
      .eq('profile_id', session.user.id)
      .single();
    if (!shUser) { setLoading(false); return; }

    const { data } = await supabase
      .from('sh_replication_jobs')
      .select('*')
      .eq('megaload_user_id', (shUser as Record<string, unknown>).id)
      .order('created_at', { ascending: false })
      .limit(100);

    setJobs((data || []) as unknown as JobRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // focus job 자동 펼침 + 진행 중 폴링
  useEffect(() => {
    if (focusJobId) setExpandedId(focusJobId);
  }, [focusJobId]);

  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === 'pending' || j.status === 'running');
    if (!hasRunning) return;
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [jobs, fetchJobs]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/megaload/products')}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="상품관리로"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Copy className="w-6 h-6 text-[#E31837]" />
              복제 히스토리
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              쿠팡 상품을 다른 채널에 복제한 작업 이력
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchJobs}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* 목록 */}
      {loading && jobs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          불러오는 중...
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">
          <Package className="w-10 h-10 mx-auto mb-2" />
          <p>복제 이력이 없습니다.</p>
          <button
            onClick={() => router.push('/megaload/products')}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700"
          >
            <Copy className="w-4 h-4" />
            상품관리로 이동
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const isExpanded = expandedId === job.id;
            const pct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;
            return (
              <div
                key={job.id}
                className={`bg-white rounded-xl border transition ${
                  isExpanded ? 'border-[#E31837]/30 shadow-sm' : 'border-gray-200'
                }`}
              >
                {/* 헤더 */}
                <button
                  type="button"
                  onClick={() => toggleExpand(job.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50/60 transition"
                >
                  <StatusIcon status={job.status} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_STYLES[job.status]}`}>
                        {STATUS_LABELS[job.status]}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {job.product_ids.length}개 상품 × {job.target_channels.length}개 채널
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>생성: {formatDate(job.created_at)}</span>
                      <span>·</span>
                      <span>소요: {formatDuration(job.started_at, job.completed_at)}</span>
                    </div>
                    {/* 진행률 (진행 중만) */}
                    {(job.status === 'pending' || job.status === 'running') && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#E31837] to-red-400 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-gray-600 w-10 text-right">{pct}%</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs font-medium flex-shrink-0">
                    <span className="text-green-600 tabular-nums">성공 {job.succeeded}</span>
                    {job.failed > 0 && (
                      <span className="text-red-600 tabular-nums">실패 {job.failed}</span>
                    )}
                    {job.skipped > 0 && (
                      <span className="text-gray-500 tabular-nums">건너뜀 {job.skipped}</span>
                    )}
                    <span className="text-gray-400 tabular-nums">/ {job.total}</span>
                  </div>
                </button>

                {/* 상세 */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-gray-100 space-y-4">
                    {/* 대상 채널 + 마진 */}
                    <div>
                      <div className="text-xs text-gray-500 mb-2">대상 채널 / 마진율</div>
                      <div className="flex flex-wrap gap-2">
                        {job.target_channels.map((ch) => (
                          <span
                            key={ch}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-gray-200 bg-gray-50 text-xs"
                          >
                            <span className="font-medium text-gray-900">{CHANNEL_SHORT_LABELS[ch as Channel] || ch}</span>
                            <span className="text-gray-500 tabular-nums">
                              {job.margin_settings?.[ch] ? `+${job.margin_settings[ch]}%` : '0%'}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* 타임스탬프 */}
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <div className="text-gray-500">생성</div>
                        <div className="text-gray-900 mt-0.5">{formatDate(job.created_at)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">시작</div>
                        <div className="text-gray-900 mt-0.5">{formatDate(job.started_at)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">완료</div>
                        <div className="text-gray-900 mt-0.5">{formatDate(job.completed_at)}</div>
                      </div>
                    </div>

                    {/* 실패 로그 */}
                    {job.error_log && job.error_log.length > 0 && (
                      <div className="rounded-lg border border-gray-200">
                        <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-700">
                          실패 로그 ({job.error_log.length}건{job.error_log.length >= 50 ? ', 최대 50건 표시' : ''})
                        </div>
                        <div className="max-h-60 overflow-y-auto divide-y divide-gray-100">
                          {job.error_log.map((e, i) => (
                            <div key={i} className="px-3 py-2 text-xs">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="inline-block px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
                                  {CHANNEL_SHORT_LABELS[e.channel as Channel] || e.channel}
                                </span>
                                <span className="font-mono text-gray-500">{e.product_id.slice(0, 8)}</span>
                                <span className="text-gray-400 ml-auto">{formatDate(e.at)}</span>
                              </div>
                              <div className="text-gray-700 leading-snug">{e.error}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 성공 예시 링크 */}
                    {job.status === 'completed' && job.failed === 0 && (
                      <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <CheckCircle2 className="w-4 h-4" />
                        모든 상품이 대상 채널에 성공적으로 등록되었습니다.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: JobRow['status'] }) {
  switch (status) {
    case 'completed':
      return (
        <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
        </div>
      );
    case 'failed':
      return (
        <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
          <XCircle className="w-5 h-5 text-red-600" />
        </div>
      );
    case 'cancelled':
      return (
        <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
          <XCircle className="w-5 h-5 text-gray-400" />
        </div>
      );
    case 'running':
      return (
        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
        </div>
      );
    default:
      return (
        <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
          <Clock className="w-5 h-5 text-gray-400" />
        </div>
      );
  }
}

// (unused helper, kept for future retry feature)
void AlertTriangle;
