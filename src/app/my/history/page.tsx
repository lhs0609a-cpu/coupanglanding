'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatKRW, formatYearMonth, formatDate } from '@/lib/utils/format';
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from '@/lib/utils/constants';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import type { MonthlyReport } from '@/lib/supabase/types';

export default function MyHistoryPage() {
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // PT 사용자 ID 조회
      const { data: ptUser } = await supabase
        .from('pt_users')
        .select('id')
        .eq('profile_id', user.id)
        .single();

      if (!ptUser) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('monthly_reports')
        .select('*')
        .eq('pt_user_id', ptUser.id)
        .order('year_month', { ascending: false });

      setReports((data as MonthlyReport[]) || []);
      setLoading(false);
    }

    fetchHistory();
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">보고 내역</h1>

      <Card>
        {loading ? (
          <div className="py-8 text-center text-gray-400">불러오는 중...</div>
        ) : reports.length === 0 ? (
          <div className="py-8 text-center text-gray-400">아직 보고 내역이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">기간</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">보고 매출</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">입금액</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-500">상태</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">제출일</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="py-3 px-4 font-medium text-gray-900">
                      {formatYearMonth(r.year_month)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-700">
                      {formatKRW(r.reported_revenue)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-[#E31837]">
                      {formatKRW(r.calculated_deposit)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge
                        label={PAYMENT_STATUS_LABELS[r.payment_status]}
                        colorClass={PAYMENT_STATUS_COLORS[r.payment_status]}
                      />
                    </td>
                    <td className="py-3 px-4 text-right text-gray-500">
                      {formatDate(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
