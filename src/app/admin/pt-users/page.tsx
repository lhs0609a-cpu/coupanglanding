'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatKRW, getCurrentYearMonth, formatYearMonth, formatPercent } from '@/lib/utils/format';
import { calculateDeposit, calculateNetProfit, totalCosts } from '@/lib/calculations/deposit';
import type { CostBreakdown } from '@/lib/calculations/deposit';
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  PT_STATUS_LABELS,
  PT_STATUS_COLORS,
  COST_CATEGORIES,
  DEFAULT_COST_RATES,
  MANUAL_COST_KEY,
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_COLORS,
} from '@/lib/utils/constants';
import { getFirstEligibleMonth, isEligibleForMonth, getSettlementStatus, getSettlementDDay, formatDDay, getDDayColorClass } from '@/lib/utils/settlement';
import MonthPicker from '@/components/ui/MonthPicker';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import NumberInput from '@/components/ui/NumberInput';
import Select from '@/components/ui/Select';
import PaymentProgress from '@/components/ui/PaymentProgress';
import { Users, CheckCircle2, XCircle, ExternalLink, Eye, EyeOff, UserPlus, AlertTriangle, ClipboardList, Search, Banknote, BarChart3, Key } from 'lucide-react';
import type { PtUser, MonthlyReport, Profile, OnboardingStep } from '@/lib/supabase/types';
import OnboardingReviewModal from '@/components/onboarding/OnboardingReviewModal';
import { ONBOARDING_STEPS } from '@/lib/utils/constants';
import { computeStepStates, countCompleted } from '@/components/onboarding/onboarding-utils';

interface PtUserWithProfile extends PtUser {
  profile: Profile;
}

interface ReportWithScreenshot extends MonthlyReport {
  screenshot_url: string | null;
}

interface ReviewModalData {
  report: ReportWithScreenshot;
  ptUser: PtUserWithProfile;
  adjustedAmount: number;
}

function getReportCosts(report: ReportWithScreenshot): CostBreakdown {
  return {
    cost_product: report.cost_product || 0,
    cost_commission: report.cost_commission || 0,
    cost_advertising: report.cost_advertising || 0,
    cost_returns: report.cost_returns || 0,
    cost_shipping: report.cost_shipping || 0,
    cost_tax: report.cost_tax || 0,
  };
}

export default function AdminPtUsersPage() {
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth());
  const [ptUsers, setPtUsers] = useState<PtUserWithProfile[]>([]);
  const [reports, setReports] = useState<Map<string, ReportWithScreenshot>>(new Map());
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [screenshotModal, setScreenshotModal] = useState<string | null>(null);

  // 매출 확인 모달
  const [reviewModalData, setReviewModalData] = useState<ReviewModalData | null>(null);

  // Onboarding
  const [onboardingSteps, setOnboardingSteps] = useState<Map<string, OnboardingStep[]>>(new Map());
  const [onboardingContracts, setOnboardingContracts] = useState<Set<string>>(new Set());
  const [onboardingReports, setOnboardingReports] = useState<Set<string>>(new Set());
  const [obReviewModal, setObReviewModal] = useState<{ userId: string; userName: string } | null>(null);
  const [visiblePwIds, setVisiblePwIds] = useState<Set<string>>(new Set());

  // Add user form
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newSharePercentage, setNewSharePercentage] = useState(30);

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const { data: usersData } = await supabase
      .from('pt_users')
      .select('*, profile:profiles(*)')
      .order('created_at', { ascending: false });

    const users = (usersData as PtUserWithProfile[]) || [];
    setPtUsers(users);

    if (users.length > 0) {
      const userIds = users.map((u) => u.id);
      const { data: reportsData } = await supabase
        .from('monthly_reports')
        .select('*')
        .eq('year_month', yearMonth)
        .in('pt_user_id', userIds);

      const reportMap = new Map<string, ReportWithScreenshot>();
      (reportsData || []).forEach((r) => {
        reportMap.set((r as ReportWithScreenshot).pt_user_id, r as ReportWithScreenshot);
      });
      setReports(reportMap);

      // 온보딩 데이터
      const { data: obSteps } = await supabase
        .from('onboarding_steps')
        .select('*')
        .in('pt_user_id', userIds);

      const stepsMap = new Map<string, OnboardingStep[]>();
      (obSteps || []).forEach((s) => {
        const step = s as OnboardingStep;
        const arr = stepsMap.get(step.pt_user_id) || [];
        arr.push(step);
        stepsMap.set(step.pt_user_id, arr);
      });
      setOnboardingSteps(stepsMap);

      // 계약 서명 여부
      const { data: signedContracts } = await supabase
        .from('contracts')
        .select('pt_user_id')
        .eq('status', 'signed')
        .in('pt_user_id', userIds);

      setOnboardingContracts(new Set((signedContracts || []).map((c) => (c as { pt_user_id: string }).pt_user_id)));

      // 매출 보고 여부
      const { data: anyReports } = await supabase
        .from('monthly_reports')
        .select('pt_user_id')
        .in('pt_user_id', userIds);

      setOnboardingReports(new Set((anyReports || []).map((r) => (r as { pt_user_id: string }).pt_user_id)));
    }

    setLoading(false);
  }, [yearMonth, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 매출 확인 (submitted → reviewed)
  const handleOpenReviewModal = (report: ReportWithScreenshot, ptUser: PtUserWithProfile) => {
    const costs = getReportCosts(report);
    const autoDeposit = calculateDeposit(report.reported_revenue, costs, ptUser.share_percentage);
    setReviewModalData({ report, ptUser, adjustedAmount: autoDeposit });
  };

  const handleConfirmReview = async () => {
    if (!reviewModalData) return;
    const { report, adjustedAmount } = reviewModalData;

    await supabase
      .from('monthly_reports')
      .update({
        payment_status: 'reviewed',
        admin_deposit_amount: adjustedAmount,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', report.id);

    setReviewModalData(null);
    fetchData();
  };

  // 입금 확인 (deposited → confirmed) + revenue_entries 자동 생성
  const handleConfirmDeposit = async (report: ReportWithScreenshot, ptUserId: string) => {
    const ptUser = ptUsers.find((u) => u.id === ptUserId);
    const userName = ptUser?.profile?.full_name || '이름없음';
    const depositAmount = report.admin_deposit_amount || report.calculated_deposit;

    await Promise.all([
      supabase
        .from('monthly_reports')
        .update({
          payment_status: 'confirmed',
          payment_confirmed_at: new Date().toISOString(),
        })
        .eq('id', report.id),
      supabase
        .from('pt_users')
        .update({ program_access_active: true })
        .eq('id', ptUserId),
    ]);

    // 중복 방지: description에 "PT:{ptUserId}" 포맷으로 조회
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

    fetchData();
  };

  const handleReject = async (reportId: string) => {
    const note = prompt('거절 사유를 입력하세요:');
    if (note === null) return;

    await supabase
      .from('monthly_reports')
      .update({
        payment_status: 'rejected',
        admin_note: note || '거절됨',
      })
      .eq('id', reportId);

    fetchData();
  };

  const handleStatusChange = async (ptUserId: string, status: string) => {
    await supabase
      .from('pt_users')
      .update({ status })
      .eq('id', ptUserId);

    fetchData();
  };

  const handleToggleAccess = async (ptUserId: string, current: boolean) => {
    await supabase
      .from('pt_users')
      .update({ program_access_active: !current })
      .eq('id', ptUserId);

    fetchData();
  };

  const handleAddUser = async () => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', newEmail)
      .single();

    if (!profile) {
      alert('해당 이메일로 등록된 사용자가 없습니다. 먼저 Supabase Auth에서 사용자를 생성해주세요.');
      return;
    }

    await supabase.from('pt_users').insert({
      profile_id: profile.id,
      share_percentage: newSharePercentage,
      status: 'active',
      program_access_active: false,
    });

    await supabase
      .from('profiles')
      .update({ role: 'pt_user', full_name: newName || undefined })
      .eq('id', profile.id);

    setAddModalOpen(false);
    setNewEmail('');
    setNewName('');
    setNewSharePercentage(30);
    fetchData();
  };

  const ptStatusOptions = Object.entries(PT_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const getBorderColor = (status?: string) => {
    switch (status) {
      case 'submitted': return 'border-l-4 border-l-blue-500';
      case 'reviewed': return 'border-l-4 border-l-purple-500';
      case 'deposited': return 'border-l-4 border-l-yellow-500';
      case 'confirmed': return 'border-l-4 border-l-green-500';
      default: return '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">PT 사용자 관리</h1>
        </div>
        <div className="flex items-center gap-3">
          <MonthPicker value={yearMonth} onChange={setYearMonth} />
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition"
          >
            <UserPlus className="w-4 h-4" />
            사용자 추가
          </button>
        </div>
      </div>

      {/* 정산 완료율 요약 */}
      {!loading && ptUsers.length > 0 && (() => {
        const reportMap = reports;
        let eligible = 0;
        let submitted = 0;
        let completed = 0;
        let overdue = 0;
        const overdueNames: string[] = [];

        ptUsers.forEach((u) => {
          if (!isEligibleForMonth(u.created_at, yearMonth)) return;
          eligible++;
          const r = reportMap.get(u.id);
          const status = getSettlementStatus(u.created_at, r?.payment_status || null, yearMonth);
          if (status === 'completed') completed++;
          else if (status === 'submitted') submitted++;
          else if (status === 'overdue') {
            overdue++;
            overdueNames.push(u.profile?.full_name || '이름 없음');
          }
        });

        const completionRate = eligible > 0 ? Math.round(((completed + submitted) / eligible) * 100) : 0;
        const dday = getSettlementDDay(yearMonth);

        return eligible > 0 ? (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-[#E31837]" />
              <h2 className="text-lg font-bold text-gray-900">
                {formatYearMonth(yearMonth)} 정산 현황
              </h2>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ml-auto ${getDDayColorClass(dday)}`}>
                {formatDDay(dday)}
              </span>
            </div>

            {/* 완료율 프로그레스 바 */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-gray-600">전체 진행률</span>
                <span className="text-sm font-bold text-gray-900">{completionRate}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className="relative h-3 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-green-500 transition-all duration-500"
                    style={{ width: `${eligible > 0 ? (completed / eligible) * 100 : 0}%` }}
                  />
                  <div
                    className="absolute inset-y-0 bg-yellow-400 transition-all duration-500"
                    style={{
                      left: `${eligible > 0 ? (completed / eligible) * 100 : 0}%`,
                      width: `${eligible > 0 ? (submitted / eligible) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> 완료 {completed}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> 처리중 {submitted}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200 inline-block" /> 미제출 {eligible - completed - submitted}</span>
              </div>
            </div>

            {/* 통계 그리드 */}
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-2.5 bg-blue-50 rounded-lg">
                <p className="text-xl font-bold text-blue-700">{eligible}</p>
                <p className="text-xs text-blue-600">대상자</p>
              </div>
              <div className="text-center p-2.5 bg-yellow-50 rounded-lg">
                <p className="text-xl font-bold text-yellow-700">{submitted}</p>
                <p className="text-xs text-yellow-600">처리중</p>
              </div>
              <div className="text-center p-2.5 bg-green-50 rounded-lg">
                <p className="text-xl font-bold text-green-700">{completed}</p>
                <p className="text-xs text-green-600">완료</p>
              </div>
              <div className={`text-center p-2.5 rounded-lg ${overdue > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                <p className={`text-xl font-bold ${overdue > 0 ? 'text-red-700' : 'text-gray-400'}`}>{overdue}</p>
                <p className={`text-xs ${overdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>지연</p>
              </div>
            </div>

            {/* 지연 경고 */}
            {overdue > 0 && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-700">
                    {overdue}명의 사용자가 정산을 지연하고 있습니다
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">
                    {overdueNames.join(', ')}
                  </p>
                </div>
              </div>
            )}
          </Card>
        ) : null;
      })()}

      {loading ? (
        <div className="py-12 text-center text-gray-400">불러오는 중...</div>
      ) : ptUsers.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-gray-400">등록된 PT 사용자가 없습니다.</div>
        </Card>
      ) : (
        <div className="space-y-4">
          {ptUsers.map((user) => {
            const report = reports.get(user.id);
            const needsExternalActivation = report?.payment_status === 'confirmed' && !user.program_access_active;
            const reportCosts = report ? getReportCosts(report) : null;
            const reportNetProfit = report && reportCosts ? calculateNetProfit(report.reported_revenue, reportCosts) : null;

            // 정산 상태
            const settlementStatus = getSettlementStatus(user.created_at, report?.payment_status || null, yearMonth);
            const firstEligible = getFirstEligibleMonth(user.created_at);
            const dday = getSettlementDDay(yearMonth);
            const isOverdue = settlementStatus === 'overdue';

            return (
              <Card key={user.id} className={`${getBorderColor(report?.payment_status)} ${isOverdue ? 'ring-2 ring-red-300' : ''}`}>
                <div className="space-y-4">
                  {/* 사용자 정보 */}
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {user.profile?.full_name || '이름 없음'}
                      </h3>
                      <p className="text-sm text-gray-500">{user.profile?.email}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge
                          label={PT_STATUS_LABELS[user.status]}
                          colorClass={PT_STATUS_COLORS[user.status]}
                        />
                        <span className="text-xs text-gray-400">
                          수수료율: {formatPercent(user.share_percentage)}
                        </span>
                        <Badge
                          label={user.program_access_active ? '프로그램 활성' : '프로그램 비활성'}
                          colorClass={user.program_access_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
                        />
                        <span className="text-xs text-gray-400">
                          첫 정산월: {formatYearMonth(firstEligible)}
                        </span>
                      </div>
                      {/* 정산 상태 뱃지 */}
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge
                          label={SETTLEMENT_STATUS_LABELS[settlementStatus]}
                          colorClass={SETTLEMENT_STATUS_COLORS[settlementStatus]}
                        />
                        {settlementStatus !== 'not_eligible' && settlementStatus !== 'completed' && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getDDayColorClass(dday)}`}>
                            {formatDDay(dday)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Select
                        value={user.status}
                        onChange={(val) => handleStatusChange(user.id, val)}
                        options={ptStatusOptions}
                      />
                      <button
                        type="button"
                        onClick={() => handleToggleAccess(user.id, user.program_access_active)}
                        className={`px-3 py-2 text-xs font-medium rounded-lg transition ${
                          user.program_access_active
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'bg-green-50 text-green-600 hover:bg-green-100'
                        }`}
                      >
                        {user.program_access_active ? '접근 중지' : '접근 허용'}
                      </button>
                    </div>
                  </div>

                  {/* 쿠팡 계정 정보 */}
                  {(user.coupang_seller_id || user.coupang_seller_pw) && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Key className="w-4 h-4 text-gray-500" />
                        <h4 className="text-sm font-medium text-gray-700">쿠팡 셀러 계정</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-500">ID: </span>
                          <span className="font-mono text-gray-900">{user.coupang_seller_id || '-'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">PW: </span>
                          {user.coupang_seller_pw ? (
                            <>
                              <span className="font-mono text-gray-900">
                                {visiblePwIds.has(user.id)
                                  ? (() => { try { return atob(user.coupang_seller_pw!); } catch { return user.coupang_seller_pw; } })()
                                  : '••••••••'
                                }
                              </span>
                              <button
                                type="button"
                                onClick={() => setVisiblePwIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(user.id)) next.delete(user.id);
                                  else next.add(user.id);
                                  return next;
                                })}
                                className="p-0.5 text-gray-400 hover:text-gray-600 transition"
                                title={visiblePwIds.has(user.id) ? '숨기기' : '보기'}
                              >
                                {visiblePwIds.has(user.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 외부 프로그램 활성화 체크리스트 */}
                  {needsExternalActivation && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-yellow-800">외부 프로그램 활성화 필요</p>
                        <p className="text-xs text-yellow-600 mt-0.5">
                          입금이 확인되었습니다. 외부 프로그램(coupang-sellerhub-new)에서 이 사용자를 수동으로 활성화해주세요.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 온보딩 진행률 */}
                  {(() => {
                    const userSteps = onboardingSteps.get(user.id) || [];
                    const computed = computeStepStates(
                      ONBOARDING_STEPS,
                      userSteps,
                      onboardingContracts.has(user.id),
                      onboardingReports.has(user.id),
                    );
                    const completed = countCompleted(computed);
                    const total = ONBOARDING_STEPS.length;
                    const percent = Math.round((completed / total) * 100);
                    const pendingReview = userSteps.filter((s) => s.status === 'submitted').length;

                    return (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <ClipboardList className="w-4 h-4 text-gray-500" />
                            <h4 className="text-sm font-medium text-gray-700">온보딩 진행률</h4>
                            <span className="text-xs text-gray-400">{completed}/{total}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {pendingReview > 0 && (
                              <button
                                type="button"
                                onClick={() => setObReviewModal({
                                  userId: user.id,
                                  userName: user.profile?.full_name || '이름 없음',
                                })}
                                className="px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition"
                              >
                                {pendingReview}건 검토 대기
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-[#E31837] h-2 rounded-full transition-all duration-500"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 w-8 text-right">{percent}%</span>
                        </div>
                        <div className="flex gap-1 mt-2">
                          {computed.map((step) => (
                            <div
                              key={step.definition.key}
                              title={`${step.definition.order}. ${step.definition.label}: ${step.status}`}
                              className={`w-2 h-2 rounded-full ${
                                step.status === 'completed' ? 'bg-green-500' :
                                step.status === 'submitted' ? 'bg-blue-500' :
                                step.status === 'rejected' ? 'bg-red-500' :
                                'bg-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* 당월 보고 */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      {formatYearMonth(yearMonth)} 보고
                    </h4>

                    {report ? (
                      <div className="space-y-3">
                        {/* 진행 상태 바 */}
                        {report.payment_status !== 'pending' && report.payment_status !== 'rejected' && (
                          <div className="mb-3">
                            <PaymentProgress currentStatus={report.payment_status} />
                          </div>
                        )}

                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="space-y-1">
                            <p className="text-sm text-gray-600">
                              총 매출: <span className="font-medium text-gray-900">{formatKRW(report.reported_revenue)}</span>
                            </p>
                            {reportNetProfit !== null && (
                              <p className="text-sm text-gray-600">
                                순수익: <span className={`font-medium ${reportNetProfit > 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatKRW(reportNetProfit)}</span>
                              </p>
                            )}
                            <p className="text-sm text-gray-600">
                              계산 입금액: <span className="font-bold text-[#E31837]">{formatKRW(report.calculated_deposit)}</span>
                            </p>
                            {report.admin_deposit_amount && (
                              <p className="text-sm text-gray-600">
                                확정 입금액: <span className="font-bold text-purple-700">{formatKRW(report.admin_deposit_amount)}</span>
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge
                              label={PAYMENT_STATUS_LABELS[report.payment_status]}
                              colorClass={PAYMENT_STATUS_COLORS[report.payment_status]}
                            />

                            {report.screenshot_url && (
                              <button
                                type="button"
                                onClick={() => setScreenshotModal(report.screenshot_url)}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white rounded transition"
                                title="매출 스크린샷 보기"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* submitted 상태: 매출 확인 + 거절 */}
                        {report.payment_status === 'submitted' && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenReviewModal(report, user)}
                              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition"
                            >
                              <Search className="w-4 h-4" />
                              매출 확인
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReject(report.id)}
                              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition"
                            >
                              <XCircle className="w-4 h-4" />
                              거절
                            </button>
                          </div>
                        )}

                        {/* reviewed 상태: 입금 대기 정보 표시 */}
                        {report.payment_status === 'reviewed' && (
                          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                            <p className="text-sm text-purple-700">
                              입금 대기중 (확정액: <span className="font-bold">{formatKRW(report.admin_deposit_amount || report.calculated_deposit)}</span>)
                            </p>
                          </div>
                        )}

                        {/* deposited 상태: 입금 확인 버튼 */}
                        {report.payment_status === 'deposited' && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleConfirmDeposit(report, user.id)}
                              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              입금 확인
                            </button>
                          </div>
                        )}

                        {report.admin_note && (
                          <p className="text-xs text-gray-500 bg-white rounded p-2">
                            관리자 메모: {report.admin_note}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-400">
                          {settlementStatus === 'not_eligible'
                            ? `정산 대상 아님 (첫 대상월: ${formatYearMonth(firstEligible)})`
                            : '아직 보고가 제출되지 않았습니다.'
                          }
                        </p>
                        {settlementStatus === 'overdue' && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getDDayColorClass(dday)}`}>
                            {formatDDay(dday)}
                          </span>
                        )}
                        {settlementStatus === 'pending' && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getDDayColorClass(dday)}`}>
                            {formatDDay(dday)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 사용자 추가 모달 */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="PT 사용자 추가"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Supabase Auth에 이미 등록된 사용자만 추가할 수 있습니다.
          </p>
          <Input
            id="newEmail"
            label="이메일"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="user@example.com"
          />
          <Input
            id="newName"
            label="이름"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="홍길동"
          />
          <NumberInput
            id="sharePercentage"
            label="수수료율"
            value={newSharePercentage}
            onChange={setNewSharePercentage}
            suffix="%"
          />

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleAddUser}
              disabled={!newEmail}
              className="flex-1 py-2.5 bg-[#E31837] text-white rounded-lg hover:bg-[#c01530] text-sm font-medium transition disabled:opacity-50"
            >
              추가
            </button>
          </div>
        </div>
      </Modal>

      {/* 매출 확인 모달 */}
      <Modal
        isOpen={!!reviewModalData}
        onClose={() => setReviewModalData(null)}
        title="매출 확인"
        maxWidth="max-w-lg"
      >
        {reviewModalData && (() => {
          const rCosts = getReportCosts(reviewModalData.report);
          const rNetProfit = calculateNetProfit(reviewModalData.report.reported_revenue, rCosts);
          const rTotalCosts = totalCosts(rCosts);
          const autoDeposit = calculateDeposit(reviewModalData.report.reported_revenue, rCosts, reviewModalData.ptUser.share_percentage);

          return (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  사용자: <span className="font-medium text-gray-900">{reviewModalData.ptUser.profile?.full_name}</span>
                </p>
              </div>

              {/* 비용 내역 테이블 */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">총 매출</span>
                  <span className="font-medium text-gray-900">{formatKRW(reviewModalData.report.reported_revenue)}</span>
                </div>
                {COST_CATEGORIES.map((cat) => {
                  const val = rCosts[cat.key];
                  const isAuto = cat.key !== MANUAL_COST_KEY;
                  const rateInfo = isAuto ? DEFAULT_COST_RATES[cat.key] : null;
                  return (
                    <div key={cat.key} className="flex justify-between">
                      <span className="text-gray-500">
                        ─ {cat.label}
                        <span className="text-xs text-gray-400 ml-1">
                          {rateInfo ? `(자동 ${Math.round(rateInfo.rate * 100)}%)` : '(직접 입력)'}
                        </span>
                      </span>
                      <span className={val > 0 ? 'text-gray-700' : 'text-gray-400'}>{val > 0 ? `-${formatKRW(val)}` : '-'}</span>
                    </div>
                  );
                })}
                <div className="border-t border-gray-300 pt-2 mt-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">비용 합계</span>
                    <span className="text-gray-700">{formatKRW(rTotalCosts)}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="font-medium text-gray-700">순수익</span>
                    <span className={`font-bold ${rNetProfit > 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatKRW(rNetProfit)}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="font-medium text-[#E31837]">
                      자동 계산 입금액 ({reviewModalData.ptUser.share_percentage}%)
                    </span>
                    <span className="font-bold text-[#E31837]">{formatKRW(autoDeposit)}</span>
                  </div>
                </div>
              </div>

              {/* 스크린샷 미리보기 */}
              <div className="space-y-3">
                {reviewModalData.report.screenshot_url && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <p className="px-3 pt-2 text-xs font-medium text-gray-500">매출 스크린샷</p>
                    <img
                      src={reviewModalData.report.screenshot_url}
                      alt="매출 스크린샷"
                      className="w-full h-48 object-contain bg-gray-50"
                    />
                    <a
                      href={reviewModalData.report.screenshot_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 p-2 text-sm text-[#E31837] hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      새 탭에서 열기
                    </a>
                  </div>
                )}
                {reviewModalData.report.ad_screenshot_url && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <p className="px-3 pt-2 text-xs font-medium text-gray-500">광고비 스크린샷</p>
                    <img
                      src={reviewModalData.report.ad_screenshot_url}
                      alt="광고비 스크린샷"
                      className="w-full h-48 object-contain bg-gray-50"
                    />
                    <a
                      href={reviewModalData.report.ad_screenshot_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 p-2 text-sm text-[#E31837] hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      새 탭에서 열기
                    </a>
                  </div>
                )}
              </div>

              <NumberInput
                id="adjustedAmount"
                label="확정 입금액"
                value={reviewModalData.adjustedAmount}
                onChange={(val) => setReviewModalData({ ...reviewModalData, adjustedAmount: val })}
                suffix="원"
              />

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewModalData(null)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReview}
                  className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium transition flex items-center justify-center gap-2"
                >
                  <Banknote className="w-4 h-4" />
                  확인 및 전달
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* 스크린샷 미리보기 모달 */}
      <Modal
        isOpen={!!screenshotModal}
        onClose={() => setScreenshotModal(null)}
        title="매출 스크린샷"
        maxWidth="max-w-2xl"
      >
        {screenshotModal && (
          <div>
            <img
              src={screenshotModal}
              alt="매출 스크린샷"
              className="w-full rounded-lg"
            />
            <a
              href={screenshotModal}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 mt-3 text-sm text-[#E31837] hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
              새 탭에서 열기
            </a>
          </div>
        )}
      </Modal>

      {/* 온보딩 검토 모달 */}
      {obReviewModal && (
        <OnboardingReviewModal
          isOpen={true}
          onClose={() => setObReviewModal(null)}
          ptUserName={obReviewModal.userName}
          steps={onboardingSteps.get(obReviewModal.userId) || []}
          onUpdated={fetchData}
        />
      )}
    </div>
  );
}
