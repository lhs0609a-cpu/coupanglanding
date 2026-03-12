'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CHANNELS, CHANNEL_SHORT_LABELS, CHANNEL_BG_COLORS } from '@/lib/sellerhub/constants';
import type { Channel, DailySalesStats } from '@/lib/sellerhub/types';
import { BarChart3, TrendingUp, ChevronLeft, ChevronRight, Download } from 'lucide-react';

export default function AnalyticsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState<DailySalesStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: shUser } = await supabase
      .from('sellerhub_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return;

    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data } = await supabase
      .from('sh_daily_sales_stats')
      .select('*')
      .eq('sellerhub_user_id', (shUser as Record<string, unknown>).id)
      .gte('stat_date', startDate.toISOString().slice(0, 10))
      .order('stat_date', { ascending: true });

    setStats((data as unknown as DailySalesStats[]) || []);
    setLoading(false);
  }, [supabase, period]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // 채널별 합계
  const channelSummary = CHANNELS.map((ch) => {
    const channelStats = stats.filter((s) => s.channel === ch);
    return {
      channel: ch,
      totalSales: channelStats.reduce((s, d) => s + d.total_sales, 0),
      orderCount: channelStats.reduce((s, d) => s + d.order_count, 0),
      cancelCount: channelStats.reduce((s, d) => s + d.cancel_count, 0),
    };
  }).filter((c) => c.totalSales > 0 || c.orderCount > 0)
    .sort((a, b) => b.totalSales - a.totalSales);

  const totalSales = channelSummary.reduce((s, c) => s + c.totalSales, 0);
  const totalOrders = channelSummary.reduce((s, c) => s + c.orderCount, 0);

  // 일별 합계 (차트용)
  const dateMap = new Map<string, number>();
  stats.forEach((s) => {
    dateMap.set(s.stat_date, (dateMap.get(s.stat_date) || 0) + s.total_sales);
  });
  const dailyData = Array.from(dateMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const maxDailySales = Math.max(...dailyData.map((d) => d[1]), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">판매 통계</h1>
          <p className="text-sm text-gray-500 mt-1">채널별 매출 분석</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-300 p-0.5">
            {(['7d', '30d', '90d'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  period === p ? 'bg-[#E31837] text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {p === '7d' ? '7일' : p === '30d' ? '30일' : '90일'}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">
            <Download className="w-4 h-4" />
            엑셀
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">총 매출</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">₩{totalSales.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">총 주문</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalOrders.toLocaleString()}건</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">일 평균 매출</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            ₩{dailyData.length > 0 ? Math.round(totalSales / dailyData.length).toLocaleString() : '0'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">객단가</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            ₩{totalOrders > 0 ? Math.round(totalSales / totalOrders).toLocaleString() : '0'}
          </p>
        </div>
      </div>

      {/* 일별 매출 차트 (간단한 바 차트) */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">일별 매출 추이</h2>
        {loading ? (
          <div className="h-48 flex items-center justify-center text-gray-400">불러오는 중...</div>
        ) : dailyData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-gray-400">
            <BarChart3 className="w-8 h-8 mx-auto mb-2" />
          </div>
        ) : (
          <div className="flex items-end gap-1 h-48">
            {dailyData.map(([date, sales]) => (
              <div key={date} className="flex-1 flex flex-col items-center justify-end h-full group">
                <div className="relative w-full">
                  <div
                    className="w-full bg-[#E31837]/80 rounded-t hover:bg-[#E31837] transition min-h-[2px]"
                    style={{ height: `${(sales / maxDailySales) * 160}px` }}
                  />
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                    {date}: ₩{sales.toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 채널별 매출 비교 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">채널별 매출 비교</h2>
        {channelSummary.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">통계 데이터가 없습니다</p>
        ) : (
          <div className="space-y-3">
            {channelSummary.map((ch) => {
              const percentage = totalSales > 0 ? Math.round((ch.totalSales / totalSales) * 100) : 0;
              return (
                <div key={ch.channel}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHANNEL_BG_COLORS[ch.channel] }} />
                      <span className="text-sm font-medium text-gray-900">{CHANNEL_SHORT_LABELS[ch.channel]}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-500">{ch.orderCount}건</span>
                      <span className="font-medium text-gray-900">₩{ch.totalSales.toLocaleString()}</span>
                      <span className="text-gray-400 text-xs w-10 text-right">{percentage}%</span>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${percentage}%`, backgroundColor: CHANNEL_BG_COLORS[ch.channel] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
