'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatKRW, getCurrentYearMonth, formatYearMonth } from '@/lib/utils/format';
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, REVENUE_SOURCES } from '@/lib/utils/constants';
import MonthPicker from '@/components/ui/MonthPicker';
import StatCard from '@/components/ui/StatCard';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { TrendingUp, TrendingDown, Wallet, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { MonthlyReport, RevenueEntry, ExpenseEntry } from '@/lib/supabase/types';

export default function AdminDashboardPage() {
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth());
  const [revenues, setRevenues] = useState<RevenueEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [pendingReports, setPendingReports] = useState<(MonthlyReport & { pt_user: { profile: { full_name: string } } })[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [revRes, expRes, reportRes] = await Promise.all([
      supabase.from('revenue_entries').select('*').eq('year_month', yearMonth),
      supabase.from('expense_entries').select('*').eq('year_month', yearMonth),
      supabase
        .from('monthly_reports')
        .select('*, pt_user:pt_users(profile:profiles(full_name))')
        .eq('year_month', yearMonth)
        .eq('payment_status', 'submitted'),
    ]);

    setRevenues((revRes.data as RevenueEntry[]) || []);
    setExpenses((expRes.data as ExpenseEntry[]) || []);
    setPendingReports((reportRes.data as typeof pendingReports) || []);
    setLoading(false);
  }, [yearMonth, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalRevenue = revenues.reduce((sum, r) => sum + r.amount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalRevenue - totalExpenses;

  // 수익원별 비율
  const revenueBySource = REVENUE_SOURCES.map((src) => {
    const amount = revenues
      .filter((r) => r.source === src.value)
      .reduce((sum, r) => sum + r.amount, 0);
    return { ...src, amount, percentage: totalRevenue > 0 ? Math.round((amount / totalRevenue) * 100) : 0 };
  });

  const handleQuickConfirm = async (reportId: string) => {
    await supabase
      .from('monthly_reports')
      .update({
        payment_status: 'confirmed',
        payment_confirmed_at: new Date().toISOString(),
      })
      .eq('id', reportId);

    fetchData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <MonthPicker value={yearMonth} onChange={setYearMonth} />
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400">불러오는 중...</div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              title="총 수익"
              value={formatKRW(totalRevenue)}
              icon={<TrendingUp className="w-5 h-5" />}
              trend="up"
            />
            <StatCard
              title="총 비용"
              value={formatKRW(totalExpenses)}
              icon={<TrendingDown className="w-5 h-5" />}
              trend="down"
            />
            <StatCard
              title="순이익"
              value={formatKRW(netProfit)}
              subtitle={totalRevenue > 0 ? `마진율 ${Math.round((netProfit / totalRevenue) * 100)}%` : undefined}
              icon={<Wallet className="w-5 h-5" />}
              trend={netProfit >= 0 ? 'up' : 'down'}
            />
          </div>

          {/* 수익원별 비율 */}
          <Card>
            <h2 className="text-lg font-bold text-gray-900 mb-4">수익원별 비율</h2>
            {totalRevenue === 0 ? (
              <p className="text-gray-400 text-sm">이번 달 수익 데이터가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {revenueBySource.map((src) => (
                  <div key={src.value}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{src.label}</span>
                      <span className="text-gray-500">
                        {formatKRW(src.amount)} ({src.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-[#E31837] h-2 rounded-full transition-all"
                        style={{ width: `${src.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 미확인 입금 */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              <h2 className="text-lg font-bold text-gray-900">
                입금 확인 대기 ({pendingReports.length})
              </h2>
            </div>

            {pendingReports.length === 0 ? (
              <p className="text-gray-400 text-sm">대기 중인 입금이 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {pendingReports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {report.pt_user?.profile?.full_name || '사용자'}
                      </p>
                      <p className="text-sm text-gray-500">
                        매출 {formatKRW(report.reported_revenue)} → 입금 {formatKRW(report.calculated_deposit)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        label={PAYMENT_STATUS_LABELS[report.payment_status]}
                        colorClass={PAYMENT_STATUS_COLORS[report.payment_status]}
                      />
                      <button
                        type="button"
                        onClick={() => handleQuickConfirm(report.id)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                        title="입금 확인"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
