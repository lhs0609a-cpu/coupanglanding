'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { calculateDistribution } from '@/lib/calculations/distribution';
import { formatKRW, getCurrentYearMonth, formatYearMonth } from '@/lib/utils/format';
import MonthPicker from '@/components/ui/MonthPicker';
import Card from '@/components/ui/Card';
import StatCard from '@/components/ui/StatCard';
import { PieChart, TrendingUp, TrendingDown, Wallet, Lock, CheckCircle2 } from 'lucide-react';
import type { Partner, RevenueEntry, ExpenseEntry, DistributionSnapshot } from '@/lib/supabase/types';

export default function AdminDistributionPage() {
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth());
  const [partners, setPartners] = useState<Partner[]>([]);
  const [revenues, setRevenues] = useState<RevenueEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [snapshot, setSnapshot] = useState<DistributionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [partnerRes, revRes, expRes, snapRes] = await Promise.all([
      supabase.from('partners').select('*').order('share_ratio', { ascending: false }),
      supabase.from('revenue_entries').select('*').eq('year_month', yearMonth),
      supabase.from('expense_entries').select('*').eq('year_month', yearMonth),
      supabase.from('distribution_snapshots').select('*').eq('year_month', yearMonth).single(),
    ]);

    setPartners((partnerRes.data as Partner[]) || []);
    setRevenues((revRes.data as RevenueEntry[]) || []);
    setExpenses((expRes.data as ExpenseEntry[]) || []);
    setSnapshot(snapRes.data as DistributionSnapshot | null);
    setLoading(false);
  }, [yearMonth, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const result = calculateDistribution({ partners, revenues, expenses });

  const handleConfirmDistribution = async () => {
    if (!confirm(`${formatYearMonth(yearMonth)} 정산을 확정하시겠습니까? 확정 후에는 수정할 수 없습니다.`)) return;

    setConfirming(true);

    await supabase.from('distribution_snapshots').upsert({
      year_month: yearMonth,
      total_revenue: result.totalRevenue,
      total_expenses: result.totalExpenses,
      net_profit: result.netProfit,
      distribution_data: result.distributions,
    });

    fetchData();
    setConfirming(false);
  };

  const ratioLabels = ['메인(5)', '서브1(3)', '서브2(2)'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <PieChart className="w-6 h-6 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">수익 분배</h1>
        </div>
        <MonthPicker value={yearMonth} onChange={setYearMonth} />
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400">불러오는 중...</div>
      ) : (
        <>
          {/* 확정 상태 */}
          {snapshot && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
              <Lock className="w-5 h-5 text-green-600" />
              <p className="text-sm text-green-700 font-medium">
                {formatYearMonth(yearMonth)} 정산이 확정되었습니다. (확정일: {new Date(snapshot.created_at).toLocaleDateString('ko-KR')})
              </p>
            </div>
          )}

          {/* 전체 요약 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              title="총 수익"
              value={formatKRW(result.totalRevenue)}
              icon={<TrendingUp className="w-5 h-5" />}
            />
            <StatCard
              title="총 비용"
              value={formatKRW(result.totalExpenses)}
              icon={<TrendingDown className="w-5 h-5" />}
            />
            <StatCard
              title="순이익"
              value={formatKRW(result.netProfit)}
              icon={<Wallet className="w-5 h-5" />}
              trend={result.netProfit >= 0 ? 'up' : 'down'}
            />
          </div>

          {/* 파트너별 분배 카드 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {result.distributions.map((dist, idx) => (
              <Card key={dist.partner_id} className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{ratioLabels[idx] || `비율 ${dist.share_ratio}`}</p>
                    <h3 className="text-lg font-bold text-gray-900">{dist.partner_name}</h3>
                  </div>
                  <span className="text-2xl font-bold text-[#E31837]">{dist.share_ratio}</span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">수익 배분</span>
                    <span className="font-medium text-gray-900">{formatKRW(dist.revenue_share)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">비용 지불액</span>
                    <span className="text-gray-700">{formatKRW(dist.expense_paid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">비용 의무분</span>
                    <span className="text-gray-700">{formatKRW(dist.expense_obligation)}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-2">
                    <span className="text-gray-500">비용 정산</span>
                    <span className={`font-medium ${dist.expense_settlement >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {dist.expense_settlement >= 0 ? '+' : ''}{formatKRW(dist.expense_settlement)}
                    </span>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="font-bold text-gray-900">최종 금액</span>
                    <span className="text-xl font-bold text-[#E31837]">{formatKRW(dist.final_amount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">연간 예상 세금</span>
                    <span className="text-gray-700">{formatKRW(dist.estimated_tax)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">연간 세후 수익</span>
                    <span className="font-medium text-green-600">{formatKRW(dist.after_tax)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* 검증: 합계 확인 */}
          {result.distributions.length > 0 && (
            <Card>
              <h3 className="font-bold text-gray-900 mb-3">분배 검증</h3>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-500">파트너 최종금액 합계:</span>
                <span className="font-medium text-gray-900">
                  {formatKRW(result.distributions.reduce((sum, d) => sum + d.final_amount, 0))}
                </span>
                <span className="text-gray-400">/</span>
                <span className="text-gray-500">순이익:</span>
                <span className="font-medium text-gray-900">{formatKRW(result.netProfit)}</span>
                {Math.abs(result.distributions.reduce((sum, d) => sum + d.final_amount, 0) - result.netProfit) <= 10 ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <span className="text-red-500 text-xs">(반올림 오차 있음)</span>
                )}
              </div>
            </Card>
          )}

          {/* 정산 확정 버튼 */}
          {!snapshot && result.distributions.length > 0 && (
            <button
              type="button"
              onClick={handleConfirmDistribution}
              disabled={confirming}
              className="w-full py-3 bg-[#E31837] text-white font-semibold rounded-lg hover:bg-[#c01530] transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              {confirming ? '확정 중...' : `${formatYearMonth(yearMonth)} 정산 확정`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
