'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CHANNELS, CHANNEL_SHORT_LABELS, CHANNEL_COLORS, CHANNEL_BG_COLORS } from '@/lib/sellerhub/constants';
import type { Channel, Settlement } from '@/lib/sellerhub/types';
import { Receipt, Calendar, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';

export default function SettlementPage() {
  const supabase = useMemo(() => createClient(), []);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const fetchSettlements = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) return;

    const { data: shUser } = await supabase
      .from('sellerhub_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return;

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

    const { data } = await supabase
      .from('sh_settlements')
      .select('*')
      .eq('sellerhub_user_id', (shUser as Record<string, unknown>).id)
      .gte('settlement_date', startDate)
      .lte('settlement_date', endDate)
      .order('settlement_date', { ascending: true });

    setSettlements((data as unknown as Settlement[]) || []);
    setLoading(false);
  }, [supabase, year, month]);

  useEffect(() => { fetchSettlements(); }, [fetchSettlements]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  // 채널별 합계 계산
  const channelTotals = CHANNELS.reduce((acc, ch) => {
    const channelData = settlements.filter((s) => s.channel === ch);
    acc[ch] = {
      totalSales: channelData.reduce((s, d) => s + d.total_sales, 0),
      commission: channelData.reduce((s, d) => s + d.commission, 0),
      netAmount: channelData.reduce((s, d) => s + d.net_amount, 0),
      orderCount: channelData.reduce((s, d) => s + d.order_count, 0),
    };
    return acc;
  }, {} as Record<string, { totalSales: number; commission: number; netAmount: number; orderCount: number }>);

  const grandTotal = Object.values(channelTotals).reduce(
    (acc, v) => ({
      totalSales: acc.totalSales + v.totalSales,
      commission: acc.commission + v.commission,
      netAmount: acc.netAmount + v.netAmount,
      orderCount: acc.orderCount + v.orderCount,
    }),
    { totalSales: 0, commission: 0, netAmount: 0, orderCount: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">정산</h1>
          <p className="text-sm text-gray-500 mt-1">채널별 정산 현황</p>
        </div>
        <button
          onClick={fetchSettlements}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          <RefreshCw className="w-4 h-4" />
          새로고침
        </button>
      </div>

      {/* 월 선택 */}
      <div className="flex items-center justify-center gap-4 bg-white rounded-xl border border-gray-200 py-4">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-gray-900">{year}년 {month}월</h2>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* 합계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">총 매출</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">₩{grandTotal.totalSales.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">수수료</p>
          <p className="text-2xl font-bold text-red-600 mt-1">-₩{grandTotal.commission.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">정산액</p>
          <p className="text-2xl font-bold text-green-600 mt-1">₩{grandTotal.netAmount.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">주문 수</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{grandTotal.orderCount.toLocaleString()}건</p>
        </div>
      </div>

      {/* 채널별 정산 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">채널</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">매출</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">수수료</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">정산액</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">주문수</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">불러오는 중...</td></tr>
            ) : CHANNELS.map((ch) => {
              const t = channelTotals[ch];
              if (t.orderCount === 0 && t.totalSales === 0) return null;
              return (
                <tr key={ch} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHANNEL_BG_COLORS[ch] }} />
                      <span className="text-sm font-medium text-gray-900">{CHANNEL_SHORT_LABELS[ch]}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900">₩{t.totalSales.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-sm text-red-600">-₩{t.commission.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-green-600">₩{t.netAmount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500">{t.orderCount}건</td>
                </tr>
              );
            })}
            {!loading && grandTotal.totalSales === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                <Receipt className="w-8 h-8 mx-auto mb-2" />정산 내역이 없습니다
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
