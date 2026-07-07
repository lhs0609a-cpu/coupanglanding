'use client';

import { useEffect, useState } from 'react';
import { Loader2, TrendingUp, TrendingDown, XCircle, CheckCircle2, PauseCircle, PlayCircle, AlertTriangle } from 'lucide-react';

interface LogRow {
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
  error_message: string | null;
  price_skip_reason: string | null;
  created_at: string;
}

function fmtDateTime(s: string): string {
  const d = new Date(s);
  return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtWon(n: number | null | undefined): string {
  return n != null ? `₩${n.toLocaleString()}` : '-';
}

// 이벤트별 표시 메타 (라벨 · 색 · 아이콘)
function eventMeta(e: LogRow): { label: string; tone: 'green' | 'red' | 'orange' | 'blue' | 'gray'; icon: React.ReactNode } | null {
  switch (e.event_type) {
    case 'source_sold_out':
      return { label: '원본 품절', tone: 'red', icon: <XCircle className="w-3.5 h-3.5" /> };
    case 'source_removed':
      return { label: '원본 삭제', tone: 'red', icon: <XCircle className="w-3.5 h-3.5" /> };
    case 'source_restocked':
      return { label: '원본 재입고', tone: 'green', icon: <CheckCircle2 className="w-3.5 h-3.5" /> };
    case 'coupang_suspended':
      return { label: '쿠팡 판매중지', tone: 'orange', icon: <PauseCircle className="w-3.5 h-3.5" /> };
    case 'coupang_resumed':
      return { label: '쿠팡 판매재개', tone: 'green', icon: <PlayCircle className="w-3.5 h-3.5" /> };
    case 'price_changed_source':
      return { label: '원본가 변동', tone: 'blue', icon: (e.source_price_after ?? 0) >= (e.source_price_before ?? 0) ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" /> };
    case 'price_updated_coupang':
      return { label: '쿠팡가 반영', tone: 'green', icon: (e.our_price_after ?? 0) >= (e.our_price_before ?? 0) ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" /> };
    case 'price_update_pending':
      return { label: '가격변경 승인대기', tone: 'orange', icon: <AlertTriangle className="w-3.5 h-3.5" /> };
    case 'price_update_flagged':
      return { label: '급변동 검토필요', tone: 'orange', icon: <AlertTriangle className="w-3.5 h-3.5" /> };
    case 'price_update_failed':
      return { label: '가격반영 실패', tone: 'red', icon: <AlertTriangle className="w-3.5 h-3.5" /> };
    case 'price_approved':
      return { label: '가격변경 승인', tone: 'green', icon: <CheckCircle2 className="w-3.5 h-3.5" /> };
    case 'price_rejected':
      return { label: '가격변경 거절', tone: 'gray', icon: <XCircle className="w-3.5 h-3.5" /> };
    // check_ok / check_error / price_update_skipped 등은 타임라인에서 생략(잡음)
    default:
      return null;
  }
}

const toneClass: Record<string, string> = {
  green: 'text-green-700 bg-green-50 border-green-200',
  red: 'text-red-700 bg-red-50 border-red-200',
  orange: 'text-orange-700 bg-orange-50 border-orange-200',
  blue: 'text-blue-700 bg-blue-50 border-blue-200',
  gray: 'text-gray-600 bg-gray-50 border-gray-200',
};

// 로그에서 가격 시계열 추출 (오래된→최신). source/our 각각의 최신값을 캐리포워드.
function buildSeries(logs: LogRow[]): { t: number; source: number | null; our: number | null }[] {
  const asc = [...logs].reverse();
  const pts: { t: number; source: number | null; our: number | null }[] = [];
  let lastSource: number | null = null;
  let lastOur: number | null = null;
  for (const l of asc) {
    const s = l.source_price_after ?? l.source_price_before;
    const o = l.our_price_after ?? l.our_price_before;
    if (s == null && o == null) continue;
    if (s != null) lastSource = s;
    if (o != null) lastOur = o;
    pts.push({ t: new Date(l.created_at).getTime(), source: lastSource, our: lastOur });
  }
  return pts;
}

// 초경량 SVG 라인차트 (외부 의존성 없음)
function MiniChart({ series }: { series: { t: number; source: number | null; our: number | null }[] }) {
  if (series.length < 2) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-gray-400 bg-gray-50 rounded-lg border border-gray-200">
        추이를 그리려면 가격 변동 이력이 2건 이상 필요합니다
      </div>
    );
  }

  const W = 520, H = 128, padX = 8, padY = 16;
  const ts = series.map(p => p.t);
  const minT = Math.min(...ts), maxT = Math.max(...ts);
  const vals = series.flatMap(p => [p.source, p.our].filter((v): v is number => v != null));
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const spanT = maxT - minT || 1;
  const spanV = maxV - minV || 1;

  const x = (t: number) => padX + ((t - minT) / spanT) * (W - padX * 2);
  const y = (v: number) => padY + (1 - (v - minV) / spanV) * (H - padY * 2);

  const pathFor = (key: 'source' | 'our') => {
    let d = '';
    let started = false;
    for (const p of series) {
      const v = p[key];
      if (v == null) continue;
      d += `${started ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(v).toFixed(1)} `;
      started = true;
    }
    return d.trim();
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32" preserveAspectRatio="none">
        {/* 우리 판매가(쿠팡) — 초록 */}
        <path d={pathFor('our')} fill="none" stroke="#16a34a" strokeWidth="1.5" />
        {/* 원본가(네이버) — 파랑 */}
        <path d={pathFor('source')} fill="none" stroke="#2563eb" strokeWidth="1.5" strokeDasharray="4 3" />
        {series.map((p, i) => (
          <g key={i}>
            {p.source != null && <circle cx={x(p.t)} cy={y(p.source)} r="2" fill="#2563eb" />}
            {p.our != null && <circle cx={x(p.t)} cy={y(p.our)} r="2" fill="#16a34a" />}
          </g>
        ))}
      </svg>
      <div className="flex items-center justify-between text-[10px] text-gray-400 px-1 mt-1">
        <span>{fmtDateTime(new Date(minT).toISOString())}</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="inline-block w-3 border-t-2 border-dashed border-blue-600" />원본가</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 border-t-2 border-green-600" />판매가</span>
        </div>
        <span>{fmtDateTime(new Date(maxT).toISOString())}</span>
      </div>
    </div>
  );
}

export default function MonitorHistoryPanel({ monitorId }: { monitorId: string }) {
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/megaload/stock-monitor/logs?monitorId=${monitorId}`);
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) { setError(data.error || '이력을 불러오지 못했습니다.'); return; }
        setLogs(data.logs || []);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : '이력 조회 실패');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [monitorId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> <span className="text-xs">이력 불러오는 중…</span>
      </div>
    );
  }
  if (error) {
    return <div className="py-6 text-center text-xs text-red-500">{error}</div>;
  }
  if (!logs || logs.length === 0) {
    return <div className="py-6 text-center text-xs text-gray-400">아직 기록된 변동 이력이 없습니다. 점검이 돌면 여기에 가격·품절 변동이 쌓입니다.</div>;
  }

  const series = buildSeries(logs);
  const timeline = logs.map(l => ({ log: l, meta: eventMeta(l) })).filter(x => x.meta !== null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 bg-gray-50/60">
      {/* 좌: 추이 그래프 */}
      <div>
        <div className="text-xs font-semibold text-gray-600 mb-2">가격 추이 (원본가 vs 판매가)</div>
        <MiniChart series={series} />
      </div>

      {/* 우: 변동 타임라인 */}
      <div>
        <div className="text-xs font-semibold text-gray-600 mb-2">변동 타임라인 · 품절/재입고 시점</div>
        {timeline.length === 0 ? (
          <div className="text-xs text-gray-400 py-4">기록된 상태·가격 변동이 없습니다.</div>
        ) : (
          <div className="max-h-56 overflow-y-auto pr-1 space-y-1.5">
            {timeline.map(({ log: l, meta }) => (
              <div key={l.id} className={`flex items-start gap-2 text-[11px] px-2.5 py-1.5 rounded-lg border ${toneClass[meta!.tone]}`}>
                <span className="mt-px shrink-0">{meta!.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{meta!.label}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">{fmtDateTime(l.created_at)}</span>
                  </div>
                  {/* 가격 변동은 before→after 표시 */}
                  {(l.event_type === 'price_changed_source') && (
                    <div className="text-[10px] mt-0.5 font-mono">원본 {fmtWon(l.source_price_before)} → {fmtWon(l.source_price_after)}</div>
                  )}
                  {(l.event_type === 'price_updated_coupang' || l.event_type === 'price_approved') && (
                    <div className="text-[10px] mt-0.5 font-mono">판매 {fmtWon(l.our_price_before)} → {fmtWon(l.our_price_after)}</div>
                  )}
                  {l.option_name && <div className="text-[10px] text-gray-400 mt-0.5">옵션: {l.option_name}</div>}
                  {l.error_message && <div className="text-[10px] text-red-500 mt-0.5 truncate">{l.error_message}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
