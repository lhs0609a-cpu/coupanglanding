'use client';

import { useEffect, useRef, useState } from 'react';
import { Users, TrendingUp, Wallet, Boxes } from 'lucide-react';

interface NetworkStats {
  activeSellerCount: number | null;
  totalRevenue: number | null;
  thisMonthRevenue: number | null;
  totalOrders: number | null;
  growthPct: number | null;
  monthlyTrend: { ym: string; revenue: number }[];
}

const POLL_MS = 45_000;

// 0 → target 카운트업 훅 (ease-out)
function useCountUp(target: number, duration = 1600) {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    const to = target;
    prev.current = target;
    if (from === to) { setVal(to); return; }
    let raf = 0;
    let start: number | null = null;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points);
  const range = max - min || 1;
  const W = 240, H = 48;
  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 6) - 3;
    return [x, y] as const;
  });
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `0,${H} ${line} ${W},${H}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12" preserveAspectRatio="none">
      <polygon points={area} fill="rgba(16,185,129,0.15)" />
      <polyline points={line} fill="none" stroke="rgb(52,211,153)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {coords.length > 0 && (
        <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="3" fill="rgb(52,211,153)" />
      )}
    </svg>
  );
}

function won(n: number): string {
  return `₩${n.toLocaleString('ko-KR')}`;
}

export default function SupplierNetworkStats() {
  const [data, setData] = useState<NetworkStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchStats = () => {
      fetch('/api/public/network-stats')
        .then((r) => r.json())
        .then((d: NetworkStats) => {
          if (!cancelled && typeof d.totalRevenue === 'number' && d.totalRevenue > 0) setData(d);
        })
        .catch(() => {});
    };
    fetchStats();
    const id = setInterval(fetchStats, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') fetchStats(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const sellers = useCountUp(data?.activeSellerCount ?? 0);
  const total = useCountUp(data?.totalRevenue ?? 0);
  const month = useCountUp(data?.thisMonthRevenue ?? 0);
  const orders = useCountUp(data?.totalOrders ?? 0);

  if (!data || typeof data.totalRevenue !== 'number') return null;

  const stats = [
    { icon: Users, label: '이번 달 판매 중인 셀러', value: `${sellers.toLocaleString('ko-KR')}명`, accent: true },
    { icon: Wallet, label: '누적 거래액', value: won(total) },
    { icon: TrendingUp, label: '이번 달 매출', value: won(month) },
    { icon: Boxes, label: '누적 판매 건수', value: `${orders.toLocaleString('ko-KR')}건` },
  ];

  return (
    <section className="relative py-16 sm:py-20 px-5 sm:px-8 bg-gray-950 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(16,185,129,0.16)_0%,transparent_60%)]" />
      <div className="max-w-5xl mx-auto relative z-10">
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          <span className="text-sm font-semibold text-emerald-300 tracking-wide">LIVE · 쿠팡 셀러 네트워크 실시간 현황</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className={`rounded-2xl border p-5 backdrop-blur-sm ${
                s.accent ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-white/10 bg-white/5'
              }`}
            >
              <s.icon className={`w-5 h-5 mb-3 ${s.accent ? 'text-emerald-300' : 'text-white/50'}`} />
              <div className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums leading-tight">{s.value}</div>
              <div className="mt-1.5 text-xs text-white/50">{s.label}</div>
            </div>
          ))}
        </div>

        {(data.monthlyTrend?.length >= 2 || typeof data.growthPct === 'number') && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-white/50">최근 6개월 매출 추이</span>
              {typeof data.growthPct === 'number' && (
                <span className={`text-xs font-bold ${data.growthPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  이번 달 전월 대비 {data.growthPct >= 0 ? '+' : ''}{data.growthPct}%
                </span>
              )}
            </div>
            <Sparkline points={(data.monthlyTrend || []).map((m) => m.revenue)} />
          </div>
        )}

        <p className="mt-6 text-center text-sm text-white/50">
          지금 이 순간에도 셀러들이 팔고 있습니다. <span className="text-white/80 font-medium">당신의 상품을 올릴 판로가 준비돼 있습니다.</span>
        </p>
      </div>
    </section>
  );
}
