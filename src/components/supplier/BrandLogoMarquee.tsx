'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

interface Brand { name: string; logo_url: string | null; verified: boolean }
interface Stats { brandCount: number; networkGmv: number; month: string }

/**
 * 흐르는 브랜드 로고 월 — "이 브랜드들이 맡기고, 우리 셀러망이 판매를 일으킨다".
 * 두 줄 반대 방향 무한 스크롤. 마우스 올리면 정지. 실판매 검증 브랜드는 뱃지.
 */
export default function BrandLogoMarquee() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch('/api/brands/wall').then((r) => r.json()).then((d) => {
      setBrands(d.brands || []);
      setStats(d.stats || null);
    }).catch(() => {});
  }, []);

  if (brands.length === 0) return null;

  const half = Math.ceil(brands.length / 2);
  const rowA = brands.slice(0, half);
  const rowB = brands.slice(half).length ? brands.slice(half) : rowA;

  return (
    <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-b from-white to-gray-50/60 py-8 mb-6">
      <style>{`
        @keyframes brandScrollL { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes brandScrollR { from { transform: translateX(-50%); } to { transform: translateX(0); } }
        .brand-track { display: flex; gap: 2.5rem; width: max-content; }
        .brand-row-a { animation: brandScrollL 32s linear infinite; }
        .brand-row-b { animation: brandScrollR 36s linear infinite; }
        .brand-marquee:hover .brand-track { animation-play-state: paused; }
      `}</style>

      {/* 헤드라인 */}
      <div className="text-center mb-6 px-4">
        <p className="text-lg sm:text-xl font-bold text-gray-900">
          이미 <span className="text-[#E31837]">{stats?.brandCount ?? brands.length}개 브랜드</span>가 맡기고,
          {stats && stats.networkGmv > 0 && (
            <> 우리 셀러망이 <span className="text-[#E31837]">₩{formatKRW(stats.networkGmv)}</span> 판매를 일으켰습니다</>
          )}
        </p>
        <div className="flex items-center justify-center gap-4 mt-2 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 실판매 검증 브랜드</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-300" /> 신규 입점</span>
        </div>
      </div>

      {/* 두 줄 마퀴 */}
      <div className="brand-marquee space-y-4">
        <div className="overflow-hidden"><div className="brand-track brand-row-a">{[...rowA, ...rowA].map((b, i) => <LogoChip key={`a${i}`} b={b} />)}</div></div>
        <div className="overflow-hidden"><div className="brand-track brand-row-b">{[...rowB, ...rowB].map((b, i) => <LogoChip key={`b${i}`} b={b} />)}</div></div>
      </div>

      {/* 좌우 페이드 */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-white to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-gray-50 to-transparent" />
    </section>
  );
}

function LogoChip({ b }: { b: Brand }) {
  return (
    <div className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-white border shadow-sm">
      {b.logo_url
        ? <img src={b.logo_url} alt={b.name} className="h-7 max-w-[100px] object-contain grayscale hover:grayscale-0 transition" />
        : <span className="text-sm font-medium text-gray-700">{b.name}</span>}
      {b.verified && <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />}
    </div>
  );
}

function formatKRW(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}
