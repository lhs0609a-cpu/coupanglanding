'use client';

import { useState, useEffect, useCallback, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatKRW, formatYearMonth, formatPercent, formatDate } from '@/lib/utils/format';
import { calculateDeposit, calculateNetProfit, totalCosts, calculateDepositWithVat } from '@/lib/calculations/deposit';
import type { CostBreakdown } from '@/lib/calculations/deposit';
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  PT_STATUS_LABELS,
  PT_STATUS_COLORS,
  ONBOARDING_STEPS,
  ONBOARDING_STATUS_LABELS,
  ONBOARDING_STATUS_COLORS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_COLORS,
  COST_CATEGORIES,
  DEFAULT_COST_RATES,
  MANUAL_COST_KEY,
} from '@/lib/utils/constants';
import { computeStepStates, countCompleted } from '@/components/onboarding/onboarding-utils';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import PaymentProgress from '@/components/ui/PaymentProgress';
import NumberInput from '@/components/ui/NumberInput';
import { calculateListingDiscount } from '@/lib/calculations/listing-discount';
import { ArrowLeft, Eye, Check, X, Undo2, User, ClipboardList, FileText, Banknote, Search, ExternalLink, Plug, Shield, Award } from 'lucide-react';
import type { PtUser, MonthlyReport, Profile, OnboardingStep, Contract } from '@/lib/supabase/types';

interface PtUserWithProfile extends PtUser {
  profile: Profile;
}

function getReportCosts(report: MonthlyReport): CostBreakdown {
  return {
    cost_product: report.cost_product || 0,
    cost_commission: report.cost_commission || 0,
    cost_advertising: report.cost_advertising || 0,
    cost_returns: report.cost_returns || 0,
    cost_shipping: report.cost_shipping || 0,
    cost_tax: report.cost_tax || 0,
  };
}

interface ReviewModalData {
  report: MonthlyReport;
  adjustedAmount: number;
}

export default function PtUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [ptUser, setPtUser] = useState<PtUserWithProfile | null>(null);
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [onboardingSteps, setOnboardingSteps] = useState<OnboardingStep[]>([]);
  const [contract, setContract] = useState<Contract | null>(null);
  const [hasAnyReport, setHasAnyReport] = useState(false);
  const [loading, setLoading] = useState(true);

  // Screenshot modal
  const [screenshotModal, setScreenshotModal] = useState<{ url: string; title: string } | null>(null);

  // Review modal (submitted -> reviewed)
  const [reviewModalData, setReviewModalData] = useState<ReviewModalData | null>(null);

  // Reject modal with required reason
  const [rejectModal, setRejectModal] = useState<{ reportId: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [totalListings, setTotalListings] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Fetch PT user with profile
    const { data: userData } = await supabase
      .from('pt_users')
      .select('*, profile:profiles(*)')
      .eq('id', id)
      .single();

    if (!userData) {
      setLoading(false);
      return;
    }

    const user = userData as PtUserWithProfile;
    setPtUser(user);

    // Fetch all monthly reports for this user
    const { data: reportsData } = await supabase
      .from('monthly_reports')
      .select('*')
      .eq('pt_user_id', id)
      .order('year_month', { ascending: false });

    setReports((reportsData as MonthlyReport[]) || []);
    setHasAnyReport((reportsData || []).length > 0);

    // Fetch onboarding steps
    const { data: stepsData } = await supabase
      .from('onboarding_steps')
      .select('*')
      .eq('pt_user_id', id);

    setOnboardingSteps((stepsData as OnboardingStep[]) || []);

    // Fetch contract
    const { data: contractData } = await supabase
      .from('contracts')
      .select('*')
      .eq('pt_user_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    setContract(contractData as Contract | null);

    // Fetch seller_points for listing discount
    const { data: sellerPoints } = await supabase
      .from('seller_points')
      .select('total_listings')
      .eq('pt_user_id', id)
      .single();
    setTotalListings(sellerPoints?.total_listings ?? 0);

    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Review: submitted -> reviewed
  const handleOpenReviewModal = (report: MonthlyReport) => {
    if (!ptUser) return;
    const costs = getReportCosts(report);
    const autoDeposit = calculateDeposit(report.reported_revenue, costs, ptUser.share_percentage);
    const netProfit = calculateNetProfit(report.reported_revenue, costs);
    const discount = calculateListingDiscount(totalListings, netProfit);
    setReviewModalData({ report, adjustedAmount: autoDeposit + discount.discountAmount });
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

  // Confirm deposit: deposited -> confirmed
  const handleConfirmDeposit = async (report: MonthlyReport) => {
    if (!ptUser) return;
    const userName = ptUser.profile?.full_name || '이름없음';
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
        .eq('id', ptUser.id),
    ]);

    // Prevent duplicate revenue_entries
    const { data: existing } = await supabase
      .from('revenue_entries')
      .select('id')
      .eq('year_month', report.year_month)
      .ilike('description', `PT:${ptUser.id}%`)
      .maybeSingle();

    if (!existing) {
      await supabase.from('revenue_entries').insert({
        year_month: report.year_month,
        source: 'pt',
        description: `PT:${ptUser.id}:${userName}`,
        amount: depositAmount,
        main_partner_id: null,
      });
    }

    fetchData();
  };

  // Undo deposit: deposited -> reviewed
  const handleUndoDeposit = async (reportId: string) => {
    if (!confirm('송금완료 상태를 취소하고 송금대기중 상태로 되돌리시겠습니까?')) return;

    await supabase
      .from('monthly_reports')
      .update({
        payment_status: 'reviewed',
        deposited_at: null,
      })
      .eq('id', reportId);

    fetchData();
  };

  // Reject with required reason
  const handleOpenRejectModal = (reportId: string) => {
    setRejectModal({ reportId });
    setRejectReason('');
    setRejectError('');
  };

  const handleConfirmReject = async () => {
    if (!rejectModal) return;
    if (!rejectReason.trim()) {
      setRejectError('거절 사유를 입력해주세요.');
      return;
    }

    await supabase
      .from('monthly_reports')
      .update({
        payment_status: 'rejected',
        reject_reason: rejectReason.trim(),
        admin_note: rejectReason.trim(),
      })
      .eq('id', rejectModal.reportId);

    setRejectModal(null);
    setRejectReason('');
    setRejectError('');
    fetchData();
  };

  // Computed onboarding steps
  const hasSignedContract = contract?.status === 'signed';
  const computedSteps = computeStepStates(ONBOARDING_STEPS, onboardingSteps, hasSignedContract, hasAnyReport);
  const completedCount = countCompleted(computedSteps);
  const totalSteps = ONBOARDING_STEPS.length;
  const onboardingPercent = Math.round((completedCount / totalSteps) * 100);

  if (loading) {
    return (
      <div className="py-12 text-center text-gray-400">불러오는 중...</div>
    );
  }

  if (!ptUser) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => router.push('/admin/pt-users')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          PT 사용자 목록으로
        </button>
        <Card>
          <div className="py-8 text-center text-gray-400">사용자를 찾을 수 없습니다.</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.push('/admin/pt-users')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            목록
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {ptUser.profile?.full_name || '이름 없음'}
              </h1>
              <Badge
                label={PT_STATUS_LABELS[ptUser.status]}
                colorClass={PT_STATUS_COLORS[ptUser.status]}
              />
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{ptUser.profile?.email}</p>
          </div>
        </div>
      </div>

      {/* Profile Info Card */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-[#E31837]" />
          <h2 className="text-lg font-bold text-gray-900">사용자 정보</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Profile Info */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">프로필</h3>
            <div className="space-y-2">
              <div>
                <span className="text-xs text-gray-400">이름</span>
                <p className="text-sm font-medium text-gray-900">{ptUser.profile?.full_name || '-'}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400">이메일</span>
                <p className="text-sm font-medium text-gray-900">{ptUser.profile?.email || '-'}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400">전화번호</span>
                <p className="text-sm font-medium text-gray-900">{ptUser.profile?.phone || '-'}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400">가입일</span>
                <p className="text-sm font-medium text-gray-900">{formatDate(ptUser.created_at)}</p>
              </div>
            </div>
          </div>

          {/* PT Settings */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">PT 설정</h3>
            <div className="space-y-2">
              <div>
                <span className="text-xs text-gray-400">수수료율</span>
                <p className="text-sm font-medium text-gray-900">{formatPercent(ptUser.share_percentage)}</p>
              </div>
              {totalListings > 0 && (() => {
                const d = calculateListingDiscount(totalListings, 1000000);
                return (
                  <div>
                    <span className="text-xs text-gray-400">상품등록 할인</span>
                    <p className="text-sm font-medium text-gray-900">
                      {d.tierName ? (
                        <span className="flex items-center gap-1">
                          <Award className="w-3.5 h-3.5 text-green-600" />
                          {d.tierName} (+{d.discountRatePercent}, 누적 {totalListings.toLocaleString()}개)
                        </span>
                      ) : (
                        <span className="text-gray-500">미달성 ({totalListings.toLocaleString()}개)</span>
                      )}
                    </p>
                  </div>
                );
              })()}
              <div>
                <span className="text-xs text-gray-400">상태</span>
                <div className="mt-0.5">
                  <Badge
                    label={PT_STATUS_LABELS[ptUser.status]}
                    colorClass={PT_STATUS_COLORS[ptUser.status]}
                  />
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-400">프로그램 접근</span>
                <div className="mt-0.5">
                  <Badge
                    label={ptUser.program_access_active ? '활성' : '비활성'}
                    colorClass={ptUser.program_access_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Coupang Seller Info */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">쿠팡 셀러</h3>
            <div className="space-y-2">
              <div>
                <span className="text-xs text-gray-400">셀러 ID</span>
                <p className="text-sm font-mono font-medium text-gray-900">{ptUser.coupang_seller_id || '-'}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400">Vendor ID</span>
                <p className="text-sm font-mono font-medium text-gray-900">{ptUser.coupang_vendor_id || '-'}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400">API 상태</span>
                <div className="mt-0.5 flex items-center gap-2">
                  {ptUser.coupang_api_connected ? (
                    <Badge label="연동됨" colorClass="bg-green-100 text-green-700" />
                  ) : (
                    <Badge label="미연동" colorClass="bg-gray-100 text-gray-500" />
                  )}
                </div>
              </div>
              {ptUser.coupang_api_key_expires_at && (
                <div>
                  <span className="text-xs text-gray-400">API 만료일</span>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(ptUser.coupang_api_key_expires_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Onboarding Progress */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList className="w-5 h-5 text-[#E31837]" />
          <h2 className="text-lg font-bold text-gray-900">온보딩 진행률</h2>
          <span className="text-sm text-gray-400 ml-1">{completedCount}/{totalSteps}</span>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-[#E31837] h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${onboardingPercent}%` }}
            />
          </div>
          <span className="text-sm font-medium text-gray-600 w-10 text-right">{onboardingPercent}%</span>
        </div>

        {/* Steps list */}
        <div className="space-y-2">
          {computedSteps.map((step) => {
            const statusLabel = step.status === 'completed'
              ? '완료'
              : ONBOARDING_STATUS_LABELS[step.status] || step.status;
            const statusColor = step.status === 'completed'
              ? 'bg-green-100 text-green-700'
              : ONBOARDING_STATUS_COLORS[step.status] || 'bg-gray-100 text-gray-500';

            return (
              <div
                key={step.definition.key}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  step.status === 'completed' ? 'bg-green-50' :
                  step.status === 'submitted' ? 'bg-blue-50' :
                  step.status === 'rejected' ? 'bg-red-50' :
                  'bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    step.status === 'completed'
                      ? 'bg-green-500 text-white'
                      : step.status === 'submitted'
                        ? 'bg-blue-500 text-white'
                        : step.status === 'rejected'
                          ? 'bg-red-500 text-white'
                          : 'bg-gray-200 text-gray-500'
                  }`}>
                    {step.status === 'completed' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      step.definition.order
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{step.definition.label}</p>
                    <p className="text-xs text-gray-500">{step.definition.description}</p>
                  </div>
                </div>
                <Badge label={statusLabel} colorClass={statusColor} />
              </div>
            );
          })}
        </div>
      </Card>

      {/* Monthly Reports */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Banknote className="w-5 h-5 text-[#E31837]" />
          <h2 className="text-lg font-bold text-gray-900">월별 매출 정산</h2>
          <span className="text-sm text-gray-400 ml-1">{reports.length}건</span>
        </div>

        {reports.length === 0 ? (
          <div className="py-6 text-center text-gray-400 text-sm">제출된 매출 정산이 없습니다.</div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => {
              const costs = getReportCosts(report);
              const netProfit = calculateNetProfit(report.reported_revenue, costs);
              const costTotal = totalCosts(costs);
              const depositAmount = report.admin_deposit_amount || report.calculated_deposit;

              return (
                <div
                  key={report.id}
                  className={`border rounded-lg p-4 ${
                    report.payment_status === 'submitted' ? 'border-l-4 border-l-blue-500' :
                    report.payment_status === 'reviewed' ? 'border-l-4 border-l-purple-500' :
                    report.payment_status === 'deposited' ? 'border-l-4 border-l-yellow-500' :
                    report.payment_status === 'confirmed' ? 'border-l-4 border-l-green-500' :
                    report.payment_status === 'rejected' ? 'border-l-4 border-l-red-500' :
                    'border-gray-200'
                  }`}
                >
                  {/* Report header */}
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-bold text-gray-900">
                        {formatYearMonth(report.year_month)}
                      </h3>
                      <Badge
                        label={PAYMENT_STATUS_LABELS[report.payment_status]}
                        colorClass={PAYMENT_STATUS_COLORS[report.payment_status]}
                      />
                      {report.api_verified && (
                        <Badge
                          label="API 검증됨"
                          colorClass="bg-green-100 text-green-700"
                        />
                      )}
                    </div>

                    {/* Screenshot buttons */}
                    <div className="flex items-center gap-1.5">
                      {report.screenshot_url && (
                        <button
                          type="button"
                          onClick={() => setScreenshotModal({ url: report.screenshot_url!, title: '매출 스크린샷' })}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                          title="매출 스크린샷 보기"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          매출
                        </button>
                      )}
                      {report.ad_screenshot_url && (
                        <button
                          type="button"
                          onClick={() => setScreenshotModal({ url: report.ad_screenshot_url!, title: '광고비 스크린샷' })}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                          title="광고비 스크린샷 보기"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          광고비
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar for active statuses */}
                  {report.payment_status !== 'pending' && report.payment_status !== 'rejected' && (
                    <div className="mb-3">
                      <PaymentProgress currentStatus={report.payment_status} />
                    </div>
                  )}

                  {/* Report financials */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">총 매출</p>
                      <p className="text-sm font-bold text-gray-900">{formatKRW(report.reported_revenue)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">총 비용</p>
                      <p className="text-sm font-bold text-gray-700">{formatKRW(costTotal)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">순수익</p>
                      <p className={`text-sm font-bold ${netProfit > 0 ? 'text-gray-900' : 'text-red-600'}`}>
                        {formatKRW(netProfit)}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">송금액</p>
                      <p className="text-sm font-bold text-[#E31837]">{formatKRW(depositAmount)}</p>
                    </div>
                  </div>

                  {/* Cost breakdown */}
                  <details className="mb-3">
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 transition">
                      비용 상세 보기
                    </summary>
                    <div className="mt-2 bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
                      {COST_CATEGORIES.map((cat) => {
                        const val = costs[cat.key as keyof CostBreakdown] || 0;
                        const rateInfo = cat.key !== MANUAL_COST_KEY ? DEFAULT_COST_RATES[cat.key] : null;
                        return (
                          <div key={cat.key} className="flex justify-between">
                            <span className="text-gray-500">
                              {cat.label}
                              {rateInfo && (
                                <span className="text-xs text-gray-400 ml-1">
                                  ({Math.round(rateInfo.rate * 100)}%)
                                </span>
                              )}
                            </span>
                            <span className={val > 0 ? 'text-gray-700' : 'text-gray-400'}>
                              {val > 0 ? formatKRW(val) : '-'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </details>

                  {/* Reject reason */}
                  {report.payment_status === 'rejected' && report.reject_reason && (
                    <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-xs font-medium text-red-700 mb-1">거절 사유</p>
                      <p className="text-sm text-red-600">{report.reject_reason}</p>
                    </div>
                  )}

                  {/* Admin note */}
                  {report.admin_note && report.payment_status !== 'rejected' && (
                    <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">관리자 메모: {report.admin_note}</p>
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
                    {report.reviewed_at && (
                      <span>확인: {formatDate(report.reviewed_at)}</span>
                    )}
                    {report.deposited_at && (
                      <span>송금: {formatDate(report.deposited_at)}</span>
                    )}
                    {report.payment_confirmed_at && (
                      <span>정산: {formatDate(report.payment_confirmed_at)}</span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* submitted: Review + Reject */}
                    {report.payment_status === 'submitted' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenReviewModal(report)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition"
                        >
                          <Search className="w-4 h-4" />
                          매출 확인
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenRejectModal(report.id)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition"
                        >
                          <X className="w-4 h-4" />
                          거절
                        </button>
                      </>
                    )}

                    {/* reviewed: 송금대기중 info */}
                    {report.payment_status === 'reviewed' && (
                      <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-700 w-full">
                        송금 대기중 (확정액: <span className="font-bold">{formatKRW(report.admin_deposit_amount || report.calculated_deposit)}</span>)
                      </div>
                    )}

                    {/* deposited: 송금확인 + 취소 */}
                    {report.payment_status === 'deposited' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleConfirmDeposit(report)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition"
                        >
                          <Check className="w-4 h-4" />
                          송금 확인
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUndoDeposit(report.id)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition"
                        >
                          <Undo2 className="w-4 h-4" />
                          송금 취소
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Contract Info */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-[#E31837]" />
          <h2 className="text-lg font-bold text-gray-900">계약 정보</h2>
        </div>

        {contract ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <span className="text-xs text-gray-400">계약 상태</span>
                <div className="mt-1">
                  <Badge
                    label={CONTRACT_STATUS_LABELS[contract.status]}
                    colorClass={CONTRACT_STATUS_COLORS[contract.status]}
                  />
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-400">계약 유형</span>
                <p className="text-sm font-medium text-gray-900 mt-0.5">{contract.contract_type || '-'}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400">시작일</span>
                <p className="text-sm font-medium text-gray-900 mt-0.5">{formatDate(contract.start_date)}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400">서명일</span>
                <p className="text-sm font-medium text-gray-900 mt-0.5">
                  {contract.signed_at ? formatDate(contract.signed_at) : '-'}
                </p>
              </div>
            </div>
            {contract.admin_note && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">관리자 메모: {contract.admin_note}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="py-6 text-center text-gray-400 text-sm">등록된 계약이 없습니다.</div>
        )}
      </Card>

      {/* Review Modal (submitted -> reviewed) */}
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
          const autoDeposit = calculateDeposit(
            reviewModalData.report.reported_revenue,
            rCosts,
            ptUser?.share_percentage || 30,
          );
          const rDiscount = calculateListingDiscount(totalListings, rNetProfit);
          const rVat = calculateDepositWithVat(
            reviewModalData.report.reported_revenue,
            rCosts,
            ptUser?.share_percentage || 30,
          );

          return (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  사용자: <span className="font-medium text-gray-900">{ptUser?.profile?.full_name}</span>
                </p>
                <p className="text-sm text-gray-600">
                  기간: <span className="font-medium text-gray-900">{formatYearMonth(reviewModalData.report.year_month)}</span>
                </p>
              </div>

              {/* Cost breakdown */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">총 매출</span>
                  <span className="font-medium text-gray-900">{formatKRW(reviewModalData.report.reported_revenue)}</span>
                </div>
                {COST_CATEGORIES.map((cat) => {
                  const val = rCosts[cat.key as keyof CostBreakdown] || 0;
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
                      <span className={val > 0 ? 'text-gray-700' : 'text-gray-400'}>
                        {val > 0 ? `-${formatKRW(val)}` : '-'}
                      </span>
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
                    <span className={`font-bold ${rNetProfit > 0 ? 'text-gray-900' : 'text-red-600'}`}>
                      {formatKRW(rNetProfit)}
                    </span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="font-medium text-[#E31837]">
                      기본 공급가액 (수수료 {ptUser?.share_percentage || 30}%)
                    </span>
                    <span className="font-bold text-[#E31837]">{formatKRW(autoDeposit)}</span>
                  </div>
                  {rDiscount.discountAmount > 0 && (
                    <div className="flex justify-between mt-1">
                      <span className="text-green-600 font-medium flex items-center gap-1">
                        <Award className="w-3.5 h-3.5" />
                        상품등록 할인 ({rDiscount.tierName} +{rDiscount.discountRatePercent})
                        {rDiscount.capped && <span className="text-xs text-gray-400 font-normal ml-1">캡</span>}
                      </span>
                      <span className="font-bold text-green-600">+{formatKRW(rDiscount.discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between mt-1">
                    <span className="text-gray-500">부가가치세 (10%)</span>
                    <span className="text-gray-700">{formatKRW(rVat.vatAmount)}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="font-medium text-gray-700">납부 합계 (VAT 포함)</span>
                    <span className="font-bold text-gray-900">{formatKRW(rVat.totalWithVat)}</span>
                  </div>
                </div>
              </div>

              {/* Screenshots in review modal */}
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
                label="확정 송금액"
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

      {/* Reject Modal with required reason */}
      <Modal
        isOpen={!!rejectModal}
        onClose={() => { setRejectModal(null); setRejectReason(''); setRejectError(''); }}
        title="매출 정산 거절"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            거절 사유를 입력해주세요. 사용자에게 사유가 전달됩니다.
          </p>
          <div>
            <label htmlFor="rejectReason" className="block text-sm font-medium text-gray-700 mb-1">
              거절 사유 <span className="text-red-500">*</span>
            </label>
            <textarea
              id="rejectReason"
              value={rejectReason}
              onChange={(e) => { setRejectReason(e.target.value); setRejectError(''); }}
              rows={3}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837] ${
                rejectError ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="거절 사유를 입력하세요..."
            />
            {rejectError && (
              <p className="mt-1 text-xs text-red-600">{rejectError}</p>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setRejectModal(null); setRejectReason(''); setRejectError(''); }}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirmReject}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition flex items-center justify-center gap-2"
            >
              <X className="w-4 h-4" />
              거절
            </button>
          </div>
        </div>
      </Modal>

      {/* Screenshot Preview Modal */}
      <Modal
        isOpen={!!screenshotModal}
        onClose={() => setScreenshotModal(null)}
        title={screenshotModal?.title || '스크린샷'}
        maxWidth="max-w-2xl"
      >
        {screenshotModal && (
          <div>
            <img
              src={screenshotModal.url}
              alt={screenshotModal.title}
              className="w-full rounded-lg"
            />
            <a
              href={screenshotModal.url}
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
    </div>
  );
}
