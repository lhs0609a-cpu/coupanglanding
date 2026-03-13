'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatKRW, getCurrentYearMonth, formatYearMonth } from '@/lib/utils/format';
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, REVENUE_SOURCES } from '@/lib/utils/constants';
import { getReportTargetMonth, isEligibleForMonth, getSettlementStatus, getSettlementDDay, formatDDay, getSettlementDeadline, formatDeadline } from '@/lib/utils/settlement';
import MonthPicker from '@/components/ui/MonthPicker';
import StatCard from '@/components/ui/StatCard';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { TrendingUp, TrendingDown, Wallet, AlertCircle, CheckCircle2, UserPlus, XCircle, Search, Clock, Banknote, Calendar, GraduationCap, Receipt, Building2, AlertTriangle, Check } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { calculateDeposit, getReportCosts } from '@/lib/calculations/deposit';
import { calculateTrainerBonus } from '@/lib/calculations/trainer';
import { lookupAndLinkTrainee } from '@/lib/utils/trainer-link';
import { logActivity } from '@/lib/utils/activity-log';
import { notifyTrainerNewTrainee, notifyTrainerBonusEarned } from '@/lib/utils/notifications';
import type { MonthlyReport, RevenueEntry, ExpenseEntry, PtUser } from '@/lib/supabase/types';

type ReportWithUser = MonthlyReport & {
  pt_user: {
    profile: { full_name: string };
    business_name: string | null;
    business_registration_number: string | null;
    business_representative: string | null;
  };
};

export default function AdminDashboardPage() {
  const [yearMonth, setYearMonth] = useState(getReportTargetMonth());
  const [revenues, setRevenues] = useState<RevenueEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [submittedReports, setSubmittedReports] = useState<ReportWithUser[]>([]);
  const [reviewedReports, setReviewedReports] = useState<ReportWithUser[]>([]);
  const [depositedReports, setDepositedReports] = useState<ReportWithUser[]>([]);
  const [pendingUsers, setPendingUsers] = useState<{ id: string; full_name: string; email: string; created_at: string }[]>([]);
  const [allPtUsers, setAllPtUsers] = useState<(PtUser & { profile: { full_name: string } })[]>([]);
  const [allReportsForMonth, setAllReportsForMonth] = useState<MonthlyReport[]>([]);
  const [trainerStats, setTrainerStats] = useState({ total: 0, approved: 0, totalBonus: 0 });
  const [depositConfirmModal, setDepositConfirmModal] = useState<{ report: ReportWithUser } | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

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
        .select('*, pt_user:pt_users(profile:profiles(full_name), business_name, business_registration_number, business_representative)')
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

    // 트레이너 통계
    const { data: trainersData } = await supabase
      .from('trainers')
      .select('status, total_earnings');

    const trainers = (trainersData || []) as { status: string; total_earnings: number }[];
    setTrainerStats({
      total: trainers.length,
      approved: trainers.filter((t) => t.status === 'approved').length,
      totalBonus: trainers.reduce((sum, t) => sum + (t.total_earnings || 0), 0),
    });

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
    const user = pendingUsers.find((u) => u.id === userId);
    const userEmail = user?.email || '';

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
    let ptUserId: string | null = null;
    const { data: existingPtUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', userId)
      .maybeSingle();

    if (existingPtUser) {
      ptUserId = existingPtUser.id;
    } else {
      const { data: newPtUser, error: insertError } = await supabase
        .from('pt_users')
        .insert({
          profile_id: userId,
          share_percentage: 30,
          status: 'active',
          program_access_active: false,
          coupang_seller_id: null,
          coupang_seller_pw: null,
        })
        .select('id')
        .single();

      if (insertError) {
        alert(`PT 사용자 생성 실패: ${insertError.message}`);
        return;
      }
      ptUserId = newPtUser.id;
    }

    // 추천 코드 확인 + trainer_trainees 생성
    if (ptUserId && userEmail) {
      const linkResult = await lookupAndLinkTrainee(supabase, {
        userEmail,
        ptUserId,
        profileId: userId,
      });

      if (linkResult.isReferred) {
        // 추천 사용자 수수료율 25%로 변경
        await supabase
          .from('pt_users')
          .update({ share_percentage: 25 })
          .eq('id', ptUserId);

        // 트레이너에게 새 교육생 알림
        if (linkResult.trainerProfileId) {
          await notifyTrainerNewTrainee(
            supabase,
            linkResult.trainerProfileId,
            user?.full_name || '이름 없음',
          );
        }
      }
    }

    // 활동 로그
    const { data: { session: adminSession } } = await supabase.auth.getSession();
    const adminUser = adminSession?.user ?? null;
    if (adminUser) {
      await logActivity(supabase, {
        adminId: adminUser.id,
        action: 'approve_user',
        targetType: 'profile',
        targetId: userId,
        details: { user_name: user?.full_name },
      });
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

  // 매출 확인 (submitted → reviewed)
  const handleQuickReview = async (report: ReportWithUser) => {
    const ptUser = allPtUsers.find((u) => u.id === report.pt_user_id);
    const sharePercentage = ptUser?.share_percentage ?? 30;
    const costs = getReportCosts(report);
    const autoDeposit = calculateDeposit(report.reported_revenue, costs, sharePercentage);

    // 수수료 납부 마감일 계산: 정산 마감일 (이미 지났으면 reviewed_at + 7일)
    const now = new Date();
    const [ry, rm] = report.year_month.split('-').map(Number);
    const settlementDeadline = new Date(ry, rm, 0, 23, 59, 59); // 익월 말일
    const feeDeadline = settlementDeadline > now
      ? settlementDeadline.toISOString()
      : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await supabase
      .from('monthly_reports')
      .update({
        payment_status: 'reviewed',
        admin_deposit_amount: autoDeposit,
        reviewed_at: new Date().toISOString(),
        fee_payment_status: 'awaiting_payment',
        fee_payment_deadline: feeDeadline,
      })
      .eq('id', report.id);

    const { data: { session: adminSession } } = await supabase.auth.getSession();
    const adminUser = adminSession?.user ?? null;
    if (adminUser) {
      await logActivity(supabase, {
        adminId: adminUser.id,
        action: 'review_report',
        targetType: 'monthly_report',
        targetId: report.id,
        details: { user_name: report.pt_user?.profile?.full_name, deposit_amount: autoDeposit },
      });
    }

    fetchData();
  };

  const handleQuickReject = async (report: ReportWithUser) => {
    const note = prompt('거절 사유를 입력하세요:');
    if (note === null) return;

    await supabase
      .from('monthly_reports')
      .update({
        payment_status: 'rejected',
        admin_note: note || '거절됨',
      })
      .eq('id', report.id);

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
        fee_payment_status: 'paid',
        fee_confirmed_at: new Date().toISOString(),
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

    // 트레이너 보너스 자동 생성
    if (ptUserId) {
      const { data: traineeLink } = await supabase
        .from('trainer_trainees')
        .select('trainer_id, trainer:trainers(*, pt_user:pt_users(profile_id))')
        .eq('trainee_pt_user_id', ptUserId)
        .eq('is_active', true)
        .maybeSingle();

      if (traineeLink) {
        const trainer = (traineeLink as unknown as { trainer_id: string; trainer: { id: string; status: string; bonus_percentage: number; total_earnings: number; pt_user: { profile_id: string } } }).trainer;
        if (trainer && trainer.status === 'approved') {
          const reportCosts = getReportCosts(report);
          const { netProfit: trainerNetProfit, bonusAmount } = calculateTrainerBonus(
            report.reported_revenue,
            reportCosts,
            trainer.bonus_percentage,
          );

          if (bonusAmount > 0) {
            const { data: existingEarning } = await supabase
              .from('trainer_earnings')
              .select('id')
              .eq('monthly_report_id', report.id)
              .maybeSingle();

            if (!existingEarning) {
              await supabase.from('trainer_earnings').insert({
                trainer_id: trainer.id,
                trainee_pt_user_id: ptUserId,
                monthly_report_id: report.id,
                year_month: report.year_month,
                trainee_net_profit: trainerNetProfit,
                bonus_percentage: trainer.bonus_percentage,
                bonus_amount: bonusAmount,
                payment_status: 'pending',
              });

              await supabase
                .from('trainers')
                .update({ total_earnings: (trainer.total_earnings || 0) + bonusAmount })
                .eq('id', trainer.id);

              // 트레이너에게 보너스 알림
              if (trainer.pt_user?.profile_id) {
                await notifyTrainerBonusEarned(
                  supabase,
                  trainer.pt_user.profile_id,
                  userName,
                  report.year_month,
                  bonusAmount,
                );
              }
            }
          }
        }
      }
    }

    // 활동 로그
    const { data: { session: adminSession } } = await supabase.auth.getSession();
    const adminUser = adminSession?.user ?? null;
    if (adminUser) {
      await logActivity(supabase, {
        adminId: adminUser.id,
        action: 'confirm_deposit',
        targetType: 'monthly_report',
        targetId: report.id,
        details: { user_name: userName, deposit_amount: depositAmount },
      });
    }

    // 세금계산서 자동 발행
    try {
      await fetch('/api/tax-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthly_report_id: report.id,
          pt_user_id: ptUserId,
          year_month: report.year_month,
          supply_amount: report.supply_amount || 0,
          vat_amount: report.vat_amount || 0,
          total_amount: report.total_with_vat || 0,
        }),
      });
    } catch { /* 실패해도 정산 확정은 유지 */ }

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

          {/* VAT 현황 */}
          {(() => {
            const confirmedReports = allReportsForMonth.filter((r) => r.payment_status === 'confirmed');
            const totalVat = confirmedReports.reduce((sum, r) => sum + (r.vat_amount || 0), 0);
            const totalSupply = confirmedReports.reduce((sum, r) => sum + (r.supply_amount || 0), 0);
            const totalWithVat = confirmedReports.reduce((sum, r) => sum + (r.total_with_vat || 0), 0);
            if (totalVat > 0 || confirmedReports.length > 0) {
              return (
                <Card>
                  <div className="flex items-center gap-2 mb-4">
                    <Receipt className="w-5 h-5 text-[#E31837]" />
                    <h2 className="text-lg font-bold text-gray-900">
                      {formatYearMonth(yearMonth)} VAT 현황
                    </h2>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-lg font-bold text-blue-700">{formatKRW(totalSupply)}</p>
                      <p className="text-xs text-blue-600">공급가액</p>
                    </div>
                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                      <p className="text-lg font-bold text-purple-700">{formatKRW(totalVat)}</p>
                      <p className="text-xs text-purple-600">부가세</p>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <p className="text-lg font-bold text-green-700">{formatKRW(totalWithVat)}</p>
                      <p className="text-xs text-green-600">총납부액</p>
                    </div>
                  </div>
                </Card>
              );
            }
            return null;
          })()}

          {/* 트레이너 현황 */}
          {trainerStats.total > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap className="w-5 h-5 text-[#E31837]" />
                <h2 className="text-lg font-bold text-gray-900">트레이너 현황</h2>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-700">{trainerStats.total}</p>
                  <p className="text-xs text-blue-600">전체</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-700">{trainerStats.approved}</p>
                  <p className="text-xs text-green-600">활성</p>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <p className="text-2xl font-bold text-purple-700">{formatKRW(trainerStats.totalBonus)}</p>
                  <p className="text-xs text-purple-600">총 보너스</p>
                </div>
              </div>
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
                    className="p-3 bg-blue-50 rounded-lg border-l-4 border-l-blue-500 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {report.pt_user?.profile?.full_name || '사용자'}
                        </p>
                        <p className="text-sm text-gray-500">
                          매출 {formatKRW(report.reported_revenue)} → 송금 {formatKRW(report.calculated_deposit)}
                        </p>
                      </div>
                      <Badge
                        label={PAYMENT_STATUS_LABELS[report.payment_status]}
                        colorClass={PAYMENT_STATUS_COLORS[report.payment_status]}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleQuickReview(report)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 transition"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        매출 확인
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickReject(report)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        거절
                      </button>
                      {report.screenshot_url && (
                        <a
                          href={report.screenshot_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-white transition"
                        >
                          스크린샷
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 송금 대기중 (reviewed) */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-purple-500" />
              <h2 className="text-lg font-bold text-gray-900">
                송금 대기중 ({reviewedReports.length})
              </h2>
            </div>

            {reviewedReports.length === 0 ? (
              <p className="text-gray-400 text-sm">송금 대기 중인 보고가 없습니다.</p>
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
                        확정 송금액: {formatKRW(report.admin_deposit_amount || report.calculated_deposit)}
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

          {/* 송금 확인 대기 (deposited) */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Banknote className="w-5 h-5 text-yellow-600" />
              <h2 className="text-lg font-bold text-gray-900">
                송금 확인 대기 ({depositedReports.length})
              </h2>
            </div>

            {/* 지연 건수 경고 */}
            {(() => {
              const deadline = getSettlementDeadline(yearMonth);
              const now = new Date();
              const overdueDeposited = depositedReports.filter(() => now > deadline);
              if (overdueDeposited.length > 0) {
                return (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span className="text-sm font-medium text-red-700">
                      {overdueDeposited.length}건의 정산 확인이 마감일을 초과했습니다
                    </span>
                  </div>
                );
              }
              return null;
            })()}

            {depositedReports.length === 0 ? (
              <p className="text-gray-400 text-sm">송금 확인 대기 중인 보고가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {[...depositedReports]
                  .sort((a, b) => {
                    // 지연 건을 최상단으로
                    const deadline = getSettlementDeadline(yearMonth);
                    const now = new Date();
                    const aOverdue = now > deadline ? 1 : 0;
                    const bOverdue = now > deadline ? 1 : 0;
                    return bOverdue - aOverdue;
                  })
                  .map((report) => {
                    const deadline = getSettlementDeadline(yearMonth);
                    const now = new Date();
                    const isOverdue = now > deadline;
                    const overdueDays = isOverdue ? Math.floor((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24)) : 0;

                    return (
                      <div
                        key={report.id}
                        className={`flex items-center justify-between p-3 rounded-lg border-l-4 ${
                          isOverdue
                            ? 'bg-red-50 border-l-red-500'
                            : 'bg-yellow-50 border-l-yellow-500'
                        }`}
                      >
                        <div>
                          <p className="font-medium text-gray-900">
                            {report.pt_user?.profile?.full_name || '사용자'}
                          </p>
                          <p className="text-sm text-gray-500">
                            송금액: {formatKRW(report.admin_deposit_amount || report.calculated_deposit)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isOverdue && (
                            <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                              D+{overdueDays} 지연
                            </span>
                          )}
                          <Badge
                            label={PAYMENT_STATUS_LABELS[report.payment_status]}
                            colorClass={PAYMENT_STATUS_COLORS[report.payment_status]}
                          />
                          <button
                            type="button"
                            onClick={() => setDepositConfirmModal({ report })}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                            title="송금 확인"
                          >
                            <CheckCircle2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Deposit Confirm Modal */}
      <Modal
        isOpen={!!depositConfirmModal}
        onClose={() => setDepositConfirmModal(null)}
        title="송금 확인 및 세금계산서 발행"
        maxWidth="max-w-lg"
      >
        {depositConfirmModal && (() => {
          const report = depositConfirmModal.report;
          const depositAmount = report.admin_deposit_amount || report.calculated_deposit;
          const hasBizInfo = !!report.pt_user?.business_registration_number;

          return (
            <div className="space-y-4">
              {/* 파트너 정보 */}
              <div className="space-y-1">
                <p className="text-sm text-gray-600">
                  파트너: <span className="font-medium text-gray-900">{report.pt_user?.profile?.full_name || '이름 없음'}</span>
                </p>
                <p className="text-sm text-gray-600">
                  기간: <span className="font-medium text-gray-900">{formatYearMonth(report.year_month)}</span>
                </p>
              </div>

              {/* 사업자 정보 */}
              <div className={`p-4 rounded-lg border ${hasBizInfo ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">사업자 정보</span>
                </div>
                {hasBizInfo ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">상호</span>
                      <span className="font-medium text-gray-900">{report.pt_user.business_name || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">사업자번호</span>
                      <span className="font-mono font-medium text-gray-900">{report.pt_user.business_registration_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">대표자명</span>
                      <span className="font-medium text-gray-900">{report.pt_user.business_representative || '-'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span className="text-sm text-red-700 font-medium">
                      사업자 정보가 미등록되어 세금계산서 발행이 불가합니다.
                    </span>
                  </div>
                )}
              </div>

              {/* 금액 정보 */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">확정 송금액</span>
                  <span className="font-bold text-[#E31837]">{formatKRW(depositAmount)}</span>
                </div>
                {(report.supply_amount > 0 || report.vat_amount > 0) && (
                  <div className="border-t border-gray-200 pt-2 mt-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">공급가액</span>
                      <span className="font-medium text-gray-900">{formatKRW(report.supply_amount)}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-gray-500">부가가치세 (10%)</span>
                      <span className="font-medium text-gray-900">{formatKRW(report.vat_amount)}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="font-medium text-gray-700">합계 (VAT 포함)</span>
                      <span className="font-bold text-gray-900">{formatKRW(report.total_with_vat)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDepositConfirmModal(null)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDepositConfirmModal(null);
                    handleQuickConfirmDeposit(report);
                  }}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  확인 후 세금계산서 발행
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
