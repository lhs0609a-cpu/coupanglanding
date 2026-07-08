'use client';

import { useState, useEffect } from 'react';
import {
  Loader2, XCircle, CheckCircle2, MinusCircle, PauseCircle, PlayCircle,
  AlertTriangle, TrendingUp, TrendingDown, ArrowRight, Tag,
} from 'lucide-react';

interface HistoryLog {
  id: string;
  event_type: string;
  source_status_before: string | null;
  source_status_after: string | null;
  coupang_status_before: string | null;
  coupang_status_after: string | null;
  source_price_before: number | null;
  source_price_after: number | null;
  our_price_before: number | null;
  our_price_after: number | null;
  option_name: string | null;
  action_taken: string | null;
  action_success: boolean | null;
  price_skip_reason: string | null;
  error_message: string | null;
  created_at: string;
}

interface MonitorSummary {
  source_status: string;
  coupang_status: string;
  source_price_last: number | null;
  our_price_last: number | null;
  last_checked_at: string | null;
  last_changed_at: string | null;
  price_last_updated_at: string | null;
}

function fmtDateTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function won(n: number | null | undefined): string {
  return n != null ? `₩${n.toLocaleString()}` : '-';
}

// 이벤트별 표시 설정
function eventMeta(ev: string): { label: string; icon: React.ComponentType<{ className?: string }>; color: string } {
  switch (ev) {
    case 'source_sold_out': return { label: '원본 품절 감지', icon: XCircle, color: 'text-red-600 bg-red-50 border-red-200' };
    case 'source_restocked': return { label: '원본 재판매(재입고)', icon: CheckCircle2, color: 'text-green-600 bg-green-50 border-green-200' };
    case 'source_removed': return { label: '원본 삭제', icon: MinusCircle, color: 'text-gray-600 bg-gray-50 border-gray-200' };
    case 'coupang_suspended': return { label: '쿠팡 판매중지', icon: PauseCircle, color: 'text-orange-600 bg-orange-50 border-orange-200' };
    case 'coupang_resumed': return { label: '쿠팡 판매재개', icon: PlayCircle, color: 'text-green-600 bg-green-50 border-green-200' };
    case 'price_changed_source': return { label: '원본가 변동', icon: Tag, color: 'text-blue-600 bg-blue-50 border-blue-200' };
    case 'price_updated_coupang': return { label: '판매가 자동변경', icon: Tag, color: 'text-blue-700 bg-blue-50 border-blue-200' };
    case 'price_update_pending': return { label: '가격변경 승인대기', icon: AlertTriangle, color: 'text-amber-600 bg-amber-50 border-amber-200' };
    case 'price_update_flagged': return { label: '가격변경 검토필요', icon: AlertTriangle, color: 'text-amber-600 bg-amber-50 border-amber-200' };
    case 'price_update_skipped': return { label: '가격변경 건너뜀', icon: MinusCircle, color: 'text-gray-500 bg-gray-50 border-gray-200' };
    case 'price_update_failed': return { label: '가격변경 실패', icon: XCircle, color: 'text-red-600 bg-red-50 border-red-200' };
    case 'price_approved': return { label: '가격변경 승인', icon: CheckCircle2, color: 'text-green-600 bg-green-50 border-green-200' };
    case 'price_rejected': return { label: '가격변경 거부', icon: XCircle, color: 'text-gray-600 bg-gray-50 border-gray-200' };
    case 'check_error': return { label: '조회 오류', icon: AlertTriangle, color: 'text-yellow-700 bg-yellow-50 border-yellow-200' };
    case 'check_ok': return { label: '정상 확인', icon: CheckCircle2, color: 'text-gray-500 bg-gray-50 border-gray-200' };
    default: return { label: ev, icon: AlertTriangle, color: 'text-gray-500 bg-gray-50 border-gray-200' };
  }
}

// 가격 before/after 렌더 (원본가 또는 판매가)
function PriceDelta({ label, before, after }: { label: string; before: number | null; after: number | null }) {
  if (before == null && after == null) return null;
  const up = before != null && after != null && after > before;
  const down = before != null && after != null && after < before;
  const Trend = up ? TrendingUp : down ? TrendingDown : ArrowRight;
  const trendColor = up ? 'text-red-500' : down ? 'text-blue-500' : 'text-gray-400';
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className="text-gray-400">{label}</span>
      <span className="font-mono text-gray-500">{won(before)}</span>
      <Trend className={`w-3 h-3 ${trendColor}`} />
      <span className={`font-mono font-semibold ${up ? 'text-red-600' : down ? 'text-blue-600' : 'text-gray-700'}`}>
        {won(after)}
      </span>
      {before != null && after != null && before !== after && (
        <span className={`text-[10px] ${trendColor}`}>
          ({after > before ? '+' : ''}{(after - before).toLocaleString()})
        </span>
      )}
    </span>
  );
}

export default function StockMonitorHistory({ monitorId }: { monitorId: string }) {
  const [logs, setLogs] = useState<HistoryLog[]>([]);
  const [monitor, setMonitor] = useState<MonitorSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/megaload/stock-monitor/history?monitorId=${monitorId}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(data.error || '이력을 불러오지 못했습니다.'); return; }
        setLogs(data.logs || []);
        setMonitor(data.monitor || null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [monitorId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="ml-2 text-sm">이력 불러오는 중...</span>
      </div>
    );
  }

  if (error) {
    return <div className="py-6 text-center text-sm text-red-500">{error}</div>;
  }

  return (
    <div className="p-4 bg-gray-50/70 space-y-4">
      {/* 현재 상태 요약 — 언제 체크됐는지 명시 */}
      {monitor && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="text-gray-400 mb-1">마지막 점검 시각</div>
            <div className="font-semibold text-gray-800">{fmtDateTime(monitor.last_checked_at)}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">원본·쿠팡 상태를 이 시각에 함께 확인</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="text-gray-400 mb-1">마지막 상태 변화</div>
            <div className="font-semibold text-gray-800">{fmtDateTime(monitor.last_changed_at)}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="text-gray-400 mb-1">현재 원본가</div>
            <div className="font-mono font-semibold text-gray-800">{won(monitor.source_price_last)}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">최근 변동 {fmtDateTime(monitor.price_last_updated_at)}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="text-gray-400 mb-1">현재 판매가(쿠팡)</div>
            <div className="font-mono font-semibold text-gray-800">{won(monitor.our_price_last)}</div>
          </div>
        </div>
      )}

      {/* 타임라인 */}
      <div>
        <div className="text-xs font-semibold text-gray-500 mb-2">변경 이력 (최신순 · 최대 200건)</div>
        {logs.length === 0 ? (
          <div className="py-6 text-center text-xs text-gray-400">
            아직 기록된 변화가 없습니다. 상태·가격이 바뀌면 여기에 시간순으로 쌓입니다.
          </div>
        ) : (
          <ol className="relative border-l border-gray-200 ml-2 space-y-3">
            {logs.map((log) => {
              const meta = eventMeta(log.event_type);
              const Icon = meta.icon;
              const hasSourcePrice = log.source_price_before != null || log.source_price_after != null;
              const hasOurPrice = log.our_price_before != null || log.our_price_after != null;
              const statusChanged = log.source_status_before !== log.source_status_after
                && (log.source_status_before || log.source_status_after);
              const coupangChanged = log.coupang_status_before !== log.coupang_status_after
                && (log.coupang_status_before || log.coupang_status_after);
              return (
                <li key={log.id} className="ml-4">
                  <span className={`absolute -left-[9px] flex items-center justify-center w-4 h-4 rounded-full border ${meta.color}`}>
                    <Icon className="w-2.5 h-2.5" />
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.color}`}>
                      {meta.label}
                    </span>
                    {log.option_name && (
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        옵션: {log.option_name}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400">{fmtDateTime(log.created_at)}</span>
                  </div>
                  <div className="mt-1 space-y-0.5 pl-0.5">
                    {hasSourcePrice && (
                      <div><PriceDelta label="원본가" before={log.source_price_before} after={log.source_price_after} /></div>
                    )}
                    {hasOurPrice && (
                      <div><PriceDelta label="판매가" before={log.our_price_before} after={log.our_price_after} /></div>
                    )}
                    {statusChanged && (
                      <div className="text-[11px] text-gray-500">
                        원본상태: {log.source_status_before || '?'} → <span className="font-medium text-gray-700">{log.source_status_after || '?'}</span>
                      </div>
                    )}
                    {coupangChanged && (
                      <div className="text-[11px] text-gray-500">
                        쿠팡상태: {log.coupang_status_before || '?'} → <span className="font-medium text-gray-700">{log.coupang_status_after || '?'}</span>
                      </div>
                    )}
                    {log.action_taken && (
                      <div className="text-[11px] text-gray-500">
                        조치: {log.action_taken}
                        {log.action_success === false && <span className="text-red-500 ml-1">(실패)</span>}
                      </div>
                    )}
                    {log.price_skip_reason && (
                      <div className="text-[11px] text-gray-400">사유: {log.price_skip_reason}</div>
                    )}
                    {log.error_message && (
                      <div className="text-[11px] text-red-500">오류: {log.error_message}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
