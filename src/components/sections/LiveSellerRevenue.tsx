'use client';

import { useEffect, useRef, useState } from 'react';
import { TrendingUp } from 'lucide-react';

interface RevenueData {
  totalRevenue: number | null;
  sellerCount: number | null;
}

/**
 * 쿠팡PT 셀러 누적 총매출 실시간 위젯.
 *
 * /api/public/total-revenue(익명 집계, 쿠팡 API 신규 호출 0, 5분 캐시)에서
 * 누적 총매출을 받아 카운트업 애니메이션으로 표시한다. 데이터 로드 실패 시
 * 아무것도 렌더하지 않아 페이지가 깨지지 않는다.
 *
 * variant:
 *  - 'hero' : 다크 배경용 컴팩트 필(SplitHero 상단 중앙)
 *  - 'bar'  : 라이트 배경용 큰 배너(/pt 신뢰 섹션)
 */
export default function LiveSellerRevenue({ variant = 'bar' }: { variant?: 'hero' | 'bar' }) {
  const [data, setData] = useState<RevenueData | null>(null);
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/total-revenue')
      .then((r) => r.json())
      .then((d: RevenueData) => {
        if (!cancelled && typeof d.totalRevenue === 'number' && d.totalRevenue > 0) {
          setData(d);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // 값이 도착하면 0 → 목표로 카운트업 (ease-out)
  useEffect(() => {
    if (!data || typeof data.totalRevenue !== 'number') return;
    const target = data.totalRevenue;
    const duration = 1800;
    let start: number | null = null;

    const step = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(target * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [data]);

  if (!data || typeof data.totalRevenue !== 'number') return null;

  const won = `₩${display.toLocaleString('ko-KR')}`;

  if (variant === 'hero') {
    return (
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-card-light backdrop-blur-md">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        <span className="text-[11px] sm:text-xs font-medium text-white/70">쿠팡PT 셀러 누적 매출</span>
        <span className="text-[11px] sm:text-xs font-extrabold text-white tabular-nums">{won}</span>
      </div>
    );
  }

  // variant === 'bar'
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/80 to-white px-6 py-6 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E31837] opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#E31837]" />
        </span>
        <span className="text-sm font-semibold text-gray-500">실시간 · 쿠팡PT 셀러 누적 매출</span>
      </div>
      <div className="flex items-center gap-2">
        <TrendingUp className="w-6 h-6 text-[#E31837]" />
        <span className="text-3xl sm:text-5xl font-extrabold text-gray-900 tabular-nums">{won}</span>
      </div>
      {typeof data.sellerCount === 'number' && data.sellerCount > 0 && (
        <span className="text-xs text-gray-400 font-medium">
          쿠팡 연동 셀러 {data.sellerCount.toLocaleString('ko-KR')}명이 함께 만든 성과
        </span>
      )}
    </div>
  );
}
