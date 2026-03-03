'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatKRW, getCurrentYearMonth, formatYearMonth } from '@/lib/utils/format';
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, REVENUE_SOURCES, SETTLEMENT_STATUS_LABELS, SETTLEMENT_STATUS_COLORS } from '@/lib/utils/constants';
import { getReportTargetMonth, getFirstEligibleMonth, isEligibleForMonth, getSettlementStatus, getSettlementDDay, formatDDay, getDDayColorClass, formatDeadline } from '@/lib/utils/settlement';
import MonthPicker from '@/components/ui/MonthPicker';
import StatCard from '@/components/ui/StatCard';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { TrendingUp, TrendingDown, Wallet, AlertCircle, CheckCircle2, UserPlus, XCircle, Search, Clock, Banknote, Calendar } from 'lucide-react';
import type { MonthlyReport, RevenueEntry, ExpenseEntry, PtUser } from '@/lib/supabase/types';

type ReportWithUser = MonthlyReport & { pt_user: { profile: { full_name: string } } };

export default function AdminDashboardPage() {
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth());
  const [revenues, setRevenues] = useState<RevenueEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [submittedReports, setSubmittedReports] = useState<ReportWithUser[]>([]);
  const [reviewedReports, setReviewedReports] = useState<ReportWithUser[]>([]);
  const [depositedReports, setDepositedReports] = useState<ReportWithUser[]>([]);
  const [pendingUsers, setPendingUsers] = useState<{ id: string; full_name: string; email: string; created_at: string }[]>([]);
  const [allPtUsers, setAllPtUsers] = useState<(PtUser & { profile: { full_name: string } })[]>([]);
  const [allReportsForMonth, setAllReportsForMonth] = useState<MonthlyReport[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [revRes, expRes, submittedRes, reviewedRes, depositedRes, pendingUsersRes, ptUsersRes, allReportsRes] = await Promise.all([
      supabase.from('revenue_entries').select('*').eq('year_month', yearMonth),
      supabase.from('expense_entries').select('*').eq('year_month', yearMonth),
      supabase
        .from('monthly_reports')
        .select('*, pt_user:pt_users(profile:profiles(full_name))')
        .eq('year_month', yearMonth)
        .eq('payment_status', 'submitted'),
      supabase
        .from('monthly_reports')
        .select('*, pt_user:pt_users(profile:profiles(full_name))')
        .eq('year_month', yearMonth)
        .eq('payment_status', 'reviewed'),
      supabase
        .from('monthly_reports')
        .select('*, pt_user:pt_users(profile:profiles(full_name))')
        .eq('year_month', yearMonth)
        .eq('payment_status', 'deposited'),
      supabase
        .from('profiles')
        .select('id, full_name, email, created_at')
        .eq('is_active', false)
        .order('created_at', { ascending: false }),
      supabase
        .from('pt_users')
        .select('*, profile:profiles(full_name)')
        .eq('status', 'active'),
      supabase
        .from('monthly_reports')
        .select('*')
        .eq('year_month', yearMonth),
    ]);

    setRevenues((revRes.data as RevenueEntry[]) || []);
    setExpenses((expRes.data as ExpenseEntry[]) || []);
    setSubmittedReports((submittedRes.data as ReportWithUser[]) || []);
    setReviewedReports((reviewedRes.data as ReportWithUser[]) || []);
    setDepositedReports((depositedRes.data as ReportWithUser[]) || []);
    setPendingUsers((pendingUsersRes.data as typeof pendingUsers) || []);
    setAllPtUsers((ptUsersRes.data as typeof allPtUsers) || []);
    setAllReportsForMonth((allReportsRes.data as MonthlyReport[]) || []);
    setLoading(false);
  }, [yearMonth, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalRevenue = revenues.reduce((sum, r) => sum + r.amount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalRevenue - totalExpenses;

  const revenueBySource = REVENUE_SOURCES.map((src) => {
    const amount = revenues
      .filter((r) => r.source === src.value)
      .reduce((sum, r) => sum + r.amount, 0);
    return { ...src, amount, percentage: totalRevenue > 0 ? Math.round((amount / totalRevenue) * 100) : 0 };
  });

  // 정산 현황 계산
  const reportTargetMonth = getReportTargetMonth();
  const settlementStats = (() => {
    const reportMap = new Map<string, MonthlyReport>();
    allReportsForMonth.forEach((r) => reportMap.set(r.pt_user_id, r));

    let eligible = 0;
    let inProgress = 0;
    let completed = 0;
    const overdueUsers: { name: string; dday: number }[] = [];

    allPtUsers.forEach((u) => {
      if (!isEligibleForMonth(u.created_at, yearMonth)) return;
      eligible++;
      const report = reportMap.get(u.id);
      const status = getSettlementStatus(u.created_at, report?.payment_status || null, yearMonth);
      if (status === 'completed') completed++;
      else if (status === 'submitted') inProgress++;
      else if (status === 'overdue') {
        overdueUsers.push({
          name: u.profile?.full_name || '이름 없음',
          dday: getSettlementDDay(yearMonth),
        });
      }
    });

    return { eligible, inProgress, completed, overdueUsers };
  })();

  const handleApproveUser = async (userId: string) => {
    // 프로필 활성화
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ is_active: true, role: 'pt_user' })
      .eq('id', userId);

    if (profileError) {
      alert(`프로필 활성화 실패: ${profileError.message}`);
      return;
    }

    // pt_users 테이블에 레코드 생성 (이미 있으면 무시)
    const { data: existingPtUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', userId)
      .maybeSingle();

    if (!existingPtUser) {
      const { error: insertError } = await supabase.from('pt_users').insert({
        profile_id: userId,
        share_percentage: 30,
        status: 'active',
        program_access_active: false,
      });

      if (insertError) {
        alert(`PT 사용자 생성 실패: ${insertError.message}`);
        return;
      }
    }

    fetchData();
  };

  const handleRejectUser = async (userId: string) => {
    if (!confirm('이 유저를 거절하고 삭제하시겠습니까?')) return;
    await fetch('/api/auth/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    fetchData();
  };

  const handleQuickConfirmDeposit = async (report: ReportWithUser) => {
    const ptUserId = report.pt_user_id;
    const userName = report.pt_user?.profile?.full_name || '이름없음';
    const depositAmount = report.admin_deposit_amount || report.calculated_deposit;

    await supabase
      .from('monthly_reports')
      .update({
        payment_status: 'confirmed',
        payment_confirmed_at: new Date().toISOString(),
      })
      .eq('id', report.id);

    if (ptUserId) {
      await supabase
        .from('pt_users')
        .update({ program_access_active: true })
        .eq('id', ptUserId);
    }

    // revenue_entries 자동 생성 (중복 방지)
    if (ptUserId) {
      const { data: existing } = await supabase
        .from('revenue_entries')
        .select('id')
        .eq('year_month', report.year_month)
        .ilike('description', `PT:${ptUserId}%`)
        .maybeSingle();

      if (!existing) {
        await supabase.from('revenue_entries').insert({
          year_month: report.year_month,
          source: 'pt',
          description: `PT:${ptUserId}:${userName}`,
          amount: depositAmount,
          main_partner_id: null,
        });
      }
    }

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

          {/* 정산 현황 */}
          {settlementStats.eligible > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-[#E31837]" />
                <h2 className="text-lg font-bold text-gray-900">
                  {formatYearMonth(yearMonth)} 정산 현황
                </h2>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-700">{settlementStats.eligible}</p>
                  <p className="text-xs text-blue-600">대상자</p>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-700">{settlementStats.inProgress}</p>
                  <p className="text-xs text-yellow-600">처리중</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-700">{settlementStats.completed}</p>
                  <p className="text-xs text-green-600">완료</p>
                </div>
              </div>

              {settlementStats.overdueUsers.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span className="text-sm font-medium text-red-700">
                      지연 사용자 ({settlementStats.overdueUsers.length}명)
                    </span>
                  </div>
                  <div className="space-y-1">
                    {settlementStats.overdueUsers.map((u, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-red-700">{u.name}</span>
                        <span className="text-red-800 font-medium">{formatDDay(u.dday)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* 가입 승인 대기 */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-bold text-gray-900">
                가입 승인 대기 ({pendingUsers.length})
              </h2>
            </div>

            {pendingUsers.length === 0 ? (
              <p className="text-gray-400 text-sm">대기 중인 가입 요청이 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {pendingUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {user.full_name || '이름 없음'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {user.email} · {new Date(user.created_at).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleApproveUser(user.id)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                        title="승인"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectUser(user.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                        title="거절"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 매출 확인 대기 (submitted) */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Search className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-bold text-gray-900">
                매출 확인 대기 ({submittedReports.length})
              </h2>
            </div>

            {submittedReports.length === 0 ? (
              <p className="text-gray-400 text-sm">매출 확인 대기 중인 보고가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {submittedReports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border-l-4 border-l-blue-500"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {report.pt_user?.profile?.full_name || '사용자'}
                      </p>
                      <p className="text-sm text-gray-500">
                        매출 {formatKRW(report.reported_revenue)} → 입금 {formatKRW(report.calculated_deposit)}
                      </p>
                    </div>
                    <Badge
                      label={PAYMENT_STATUS_LABELS[report.payment_status]}
                      colorClass={PAYMENT_STATUS_COLORS[report.payment_status]}
                    />
                  </div>
                ))}
                <p className="text-xs text-gray-400">PT 사용자 관리 페이지에서 매출을 확인하세요.</p>
              </div>
            )}
          </Card>

          {/* 입금 대기중 (reviewed) */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-purple-500" />
              <h2 className="text-lg font-bold text-gray-900">
                입금 대기중 ({reviewedReports.length})
              </h2>
            </div>

            {reviewedReports.length === 0 ? (
              <p className="text-gray-400 text-sm">입금 대기 중인 보고가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {reviewedReports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border-l-4 border-l-purple-500"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {report.pt_user?.profile?.full_name || '사용자'}
                      </p>
                      <p className="text-sm text-gray-500">
                        확정 입금액: {formatKRW(report.admin_deposit_amount || report.calculated_deposit)}
                      </p>
                    </div>
                    <Badge
                      label={PAYMENT_STATUS_LABELS[report.payment_status]}
                      colorClass={PAYMENT_STATUS_COLORS[report.payment_status]}
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 입금 확인 대기 (deposited) */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Banknote className="w-5 h-5 text-yellow-600" />
              <h2 className="text-lg font-bold text-gray-900">
                입금 확인 대기 ({depositedReports.length})
              </h2>
            </div>

            {depositedReports.length === 0 ? (
              <p className="text-gray-400 text-sm">입금 확인 대기 중인 보고가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {depositedReports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border-l-4 border-l-yellow-500"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {report.pt_user?.profile?.full_name || '사용자'}
                      </p>
                      <p className="text-sm text-gray-500">
                        입금액: {formatKRW(report.admin_deposit_amount || report.calculated_deposit)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        label={PAYMENT_STATUS_LABELS[report.payment_status]}
                        colorClass={PAYMENT_STATUS_COLORS[report.payment_status]}
                      />
                      <button
                        type="button"
                        onClick={() => handleQuickConfirmDeposit(report)}
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
