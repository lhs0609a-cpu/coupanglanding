'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { calculateDeposit, calculateNetProfit, totalCosts, buildCostBreakdown, calculateDepositWithVat } from '@/lib/calculations/deposit';
import type { CostBreakdown } from '@/lib/calculations/deposit';
import type { VatCalculation } from '@/lib/calculations/vat';
import { formatKRW, getCurrentYearMonth, formatYearMonth } from '@/lib/utils/format';
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, COST_CATEGORIES, DEFAULT_COST_RATES, MANUAL_COST_KEY } from '@/lib/utils/constants';
import { getReportTargetMonth, isEligibleForMonth, getFirstEligibleMonth, getSettlementDDay, formatDDay, getDDayColorClass, formatDeadline, getAdminSettlementStatus } from '@/lib/utils/settlement';
import type { PaymentStatus as SettlementPaymentStatus } from '@/lib/utils/settlement';
import AdminPendingBanner from '@/components/settlement/AdminPendingBanner';
import ScreenshotGuide, { FraudWarningBanner } from '@/components/settlement/ScreenshotGuide';
import { validateExifMetadata } from '@/lib/utils/exif-validation';
import type { ExifValidationResult } from '@/lib/utils/exif-validation';
import MonthPicker from '@/components/ui/MonthPicker';
import NumberInput from '@/components/ui/NumberInput';
import FileUpload from '@/components/ui/FileUpload';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FeatureTutorial from '@/components/tutorial/FeatureTutorial';
import StatCard from '@/components/ui/StatCard';
import PaymentProgress from '@/components/ui/PaymentProgress';
import { calculateListingDiscount, type ListingDiscountResult } from '@/lib/calculations/listing-discount';
import { Send, Calculator, CheckCircle2, ChevronDown, ChevronUp, Banknote, Minus, Plug, Shield, Edit3, Award } from 'lucide-react';
import ApiConnectionBanner from '@/components/settlement/ApiConnectionBanner';
import type { MonthlyReport, PtUser } from '@/lib/supabase/types';

export default function MyReportPage() {
  const [yearMonth, setYearMonth] = useState(getReportTargetMonth());
  const [revenue, setRevenue] = useState(0);
  const [advertisingCost, setAdvertisingCost] = useState(0);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [adScreenshotFile, setAdScreenshotFile] = useState<File | null>(null);
  const [adPreviewUrl, setAdPreviewUrl] = useState<string | null>(null);
  const [adExifResult, setAdExifResult] = useState<ExifValidationResult | null>(null);
  const [adExifChecking, setAdExifChecking] = useState(false);
  const [revenueExifResult, setRevenueExifResult] = useState<ExifValidationResult | null>(null);
  const [revenueExifChecking, setRevenueExifChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [depositLoading, setDepositLoading] = useState(false);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [ptUser, setPtUser] = useState<PtUser | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [costOpen, setCostOpen] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [apiFetching, setApiFetching] = useState(false);
  const [apiVerified, setApiVerified] = useState(false);
  const [apiSettlementData, setApiSettlementData] = useState<Record<string, unknown> | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [totalListings, setTotalListings] = useState(0);

  const supabase = useMemo(() => createClient(), []);

  const costs: CostBreakdown = buildCostBreakdown(revenue, advertisingCost);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setMessage(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: ptUserData } = await supabase
      .from('pt_users')
      .select('*')
      .eq('profile_id', user.id)
      .single();

    if (ptUserData) {
      setPtUser(ptUserData as PtUser);
      const isConnected = !!(ptUserData as PtUser).coupang_api_connected;
      setApiConnected(isConnected);

      // 누적 상품 등록 수 조회 (할인 계산용)
      const { data: sellerPoints } = await supabase
        .from('seller_points')
        .select('total_listings')
        .eq('pt_user_id', ptUserData.id)
        .single();
      setTotalListings(sellerPoints?.total_listings ?? 0);

      const { data: reportData } = await supabase
        .from('monthly_reports')
        .select('*')
        .eq('pt_user_id', ptUserData.id)
        .eq('year_month', yearMonth)
        .single();

      if (reportData) {
        const r = reportData as MonthlyReport;
        setReport(r);
        setRevenue(r.reported_revenue);
        setPreviewUrl(r.screenshot_url);
        setAdPreviewUrl(r.ad_screenshot_url);
        setAdvertisingCost(r.cost_advertising || 0);
        setApiVerified(r.api_verified || false);
        setApiSettlementData(r.api_settlement_data || null);
        // 기존 보고서 편집 시: API 검증된 보고서면 수동모드 OFF, 아니면 ON
        setManualMode(!r.api_verified);
        // 기존 제출된 스크린샷은 이미 검증 완료 상태로 표시
        // (서버에 저장된 스크린샷 → 재검증 불필요, UI에서 "확인 완료" 배지 표시용)
        if (r.screenshot_url) {
          setRevenueExifResult({ isValid: true, hasSoftware: true, hasDateTime: true, warningMessage: null });
        }
        if (r.ad_screenshot_url) {
          setAdExifResult({ isValid: true, hasSoftware: true, hasDateTime: true, warningMessage: null });
        }
      } else {
        setReport(null);
        setRevenue(0);
        setAdvertisingCost(0);
        setPreviewUrl(null);
        setAdPreviewUrl(null);
        setScreenshotFile(null);
        setAdScreenshotFile(null);
        setAdExifResult(null);
        setRevenueExifResult(null);
        setApiVerified(false);
        setApiSettlementData(null);
        setManualMode(false);
      }
    }

    setLoading(false);
  }, [yearMonth, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sharePercentage = ptUser?.share_percentage ?? 30;
  const netProfit = calculateNetProfit(revenue, costs);
  const baseDepositAmount = calculateDeposit(revenue, costs, sharePercentage);
  const listingDiscount: ListingDiscountResult = calculateListingDiscount(totalListings, netProfit);
  const depositAmount = baseDepositAmount + listingDiscount.discountAmount;
  const vatCalc: VatCalculation = calculateDepositWithVat(revenue, costs, sharePercentage);
  // VAT도 할인 포함 금액 기반으로 재계산
  const finalVatCalc: VatCalculation = listingDiscount.discountAmount > 0
    ? {
        supplyAmount: depositAmount,
        vatAmount: Math.floor(depositAmount * 0.1),
        totalWithVat: depositAmount + Math.floor(depositAmount * 0.1),
      }
    : vatCalc;

  const handleFileSelect = async (file: File) => {
    setScreenshotFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setRevenueExifChecking(true);
    setRevenueExifResult(null);
    const result = await validateExifMetadata(file);
    setRevenueExifResult(result);
    setRevenueExifChecking(false);
  };

  const handleFileClear = () => {
    setScreenshotFile(null);
    setPreviewUrl(null);
    setRevenueExifResult(null);
  };

  const handleAdFileSelect = async (file: File) => {
    setAdScreenshotFile(file);
    setAdPreviewUrl(URL.createObjectURL(file));
    setAdExifChecking(true);
    setAdExifResult(null);
    const result = await validateExifMetadata(file);
    setAdExifResult(result);
    setAdExifChecking(false);
  };

  const handleAdFileClear = () => {
    setAdScreenshotFile(null);
    setAdPreviewUrl(null);
    setAdExifResult(null);
  };

  // API에서 매출 가져오기
  const handleApiFetch = async () => {
    setApiFetching(true);
    setMessage(null);

    try {
      const res = await fetch('/api/coupang-settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yearMonth }),
      });

      const data = await res.json();

      if (!res.ok) {
        // API 키 만료 또는 연동 오류 시 안내
        if (res.status === 400 && data.error?.includes('연동되지 않았')) {
          setMessage({ type: 'error', text: 'API 키가 만료되었거나 미등록 상태입니다. 설정에서 API 키를 다시 등록하거나, 수동 입력 승인을 요청해주세요.' });
        } else {
          setMessage({ type: 'error', text: data.error || 'API 조회에 실패했습니다. 수동 입력 승인을 요청해주세요.' });
        }
        return;
      }

      // 매출 자동 입력
      setRevenue(data.totalSales || 0);
      setApiVerified(true);
      setApiSettlementData(data.settlementData || null);
      setManualMode(false);
      setMessage({ type: 'success', text: `API에서 매출 데이터를 가져왔습니다. (총 ${data.itemCount || 0}건)` });
    } catch {
      setMessage({ type: 'error', text: 'API 조회 중 오류가 발생했습니다. 수동 입력 승인을 요청해주세요.' });
    } finally {
      setApiFetching(false);
    }
  };

  const uploadScreenshot = async (
    file: File,
    ptUserId: string,
    ym: string,
    type: 'revenue' | 'ad',
  ): Promise<{ url: string } | { error: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('ptUserId', ptUserId);
    formData.append('yearMonth', ym);
    formData.append('type', type);

    const res = await fetch('/api/upload-screenshot', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      return { error: data.error || '업로드에 실패했습니다.' };
    }

    return { url: data.url };
  };

  const handleSubmit = async () => {
    if (!ptUser) return;
    if (revenue <= 0) {
      setMessage({ type: 'error', text: '매출 금액을 입력해주세요.' });
      return;
    }

    // 수동 입력 모드일 때 스크린샷 필수 (API 검증 아닐 때)
    if (manualMode && !apiVerified && !previewUrl) {
      setMessage({ type: 'error', text: '수동 입력 시 매출 스크린샷이 필수입니다.' });
      return;
    }

    if (screenshotFile && (!revenueExifResult || !revenueExifResult.isValid)) {
      setMessage({ type: 'error', text: '매출 스크린샷의 EXIF 검증을 통과해야 합니다. 실제 스크린샷을 업로드해주세요.' });
      return;
    }

    if (advertisingCost > 0 && !adPreviewUrl) {
      setMessage({ type: 'error', text: '광고비를 입력한 경우 광고비 스크린샷이 필수입니다.' });
      return;
    }

    if (advertisingCost > 0 && adScreenshotFile && (!adExifResult || !adExifResult.isValid)) {
      setMessage({ type: 'error', text: '광고비 스크린샷의 EXIF 검증을 통과해야 합니다. 실제 스크린샷을 업로드해주세요.' });
      return;
    }

    setSubmitLoading(true);
    setMessage(null);

    let screenshotUrl = report?.screenshot_url || null;
    let adScreenshotUrl = report?.ad_screenshot_url || null;

    if (screenshotFile) {
      const result = await uploadScreenshot(screenshotFile, ptUser.id, yearMonth, 'revenue');
      if ('error' in result) {
        setMessage({ type: 'error', text: result.error });
        setSubmitLoading(false);
        return;
      }
      screenshotUrl = result.url;
    }

    if (adScreenshotFile) {
      const result = await uploadScreenshot(adScreenshotFile, ptUser.id, yearMonth, 'ad');
      if ('error' in result) {
        setMessage({ type: 'error', text: result.error });
        setSubmitLoading(false);
        return;
      }
      adScreenshotUrl = result.url;
    }

    const reportData = {
      pt_user_id: ptUser.id,
      year_month: yearMonth,
      reported_revenue: revenue,
      screenshot_url: screenshotUrl,
      ad_screenshot_url: adScreenshotUrl,
      calculated_deposit: depositAmount,
      payment_status: 'submitted' as const,
      cost_product: costs.cost_product,
      cost_commission: costs.cost_commission,
      cost_advertising: costs.cost_advertising,
      cost_returns: costs.cost_returns,
      cost_shipping: costs.cost_shipping,
      cost_tax: costs.cost_tax,
      api_verified: apiVerified,
      api_settlement_data: apiSettlementData,
      supply_amount: finalVatCalc.supplyAmount,
      vat_amount: finalVatCalc.vatAmount,
      total_with_vat: finalVatCalc.totalWithVat,
      input_source: apiVerified ? 'api' as const : 'manual_approved' as const,
    };

    if (report) {
      const { error } = await supabase
        .from('monthly_reports')
        .update(reportData)
        .eq('id', report.id);

      if (error) {
        setMessage({ type: 'error', text: '보고 수정에 실패했습니다.' });
      } else {
        setMessage({ type: 'success', text: '매출 정산이 수정되었습니다.' });
        fetchData();
      }
    } else {
      const { error } = await supabase
        .from('monthly_reports')
        .insert(reportData);

      if (error) {
        setMessage({ type: 'error', text: '보고 제출에 실패했습니다.' });
      } else {
        setMessage({ type: 'success', text: '매출 정산이 제출되었습니다.' });
        fetchData();
      }
    }

    setSubmitLoading(false);
  };

  const handleDepositComplete = async () => {
    if (!report) return;

    setDepositLoading(true);
    const { error } = await supabase
      .from('monthly_reports')
      .update({
        payment_status: 'deposited',
        deposited_at: new Date().toISOString(),
      })
      .eq('id', report.id);

    if (error) {
      setMessage({ type: 'error', text: '송금완료 신청에 실패했습니다.' });
    } else {
      setMessage({ type: 'success', text: '송금완료 신청되었습니다. 관리자의 송금 확인을 기다려주세요.' });
      fetchData();
    }
    setDepositLoading(false);
  };

  // 수동 입력 승인 요청
  const isEditable = !report || report.payment_status === 'pending' || report.payment_status === 'rejected';
  const hasCosts = totalCosts(costs) > 0;

  const eligible = ptUser ? isEligibleForMonth(ptUser.created_at, yearMonth) : true;
  const dday = getSettlementDDay(yearMonth);
  const firstEligible = ptUser ? getFirstEligibleMonth(ptUser.created_at) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <FeatureTutorial featureKey="report" />
      {/* 1. 헤더 + MonthPicker */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">매출 정산</h1>
        <MonthPicker value={yearMonth} onChange={setYearMonth} />
      </div>

      {/* 2. D-day 배너 */}
      {eligible && (
        <div className={`rounded-lg p-4 flex items-center justify-between flex-wrap gap-2 ${getDDayColorClass(dday)} border`}>
          <div>
            <p className="text-sm font-medium">
              {formatYearMonth(yearMonth)} 매출 정산 마감
            </p>
            <p className="text-xs mt-0.5 opacity-80">
              마감일: {formatDeadline(yearMonth)}
            </p>
          </div>
          <span className="text-lg font-bold">{formatDDay(dday)}</span>
        </div>
      )}

      {/* 미대상월 안내 */}
      {!eligible && ptUser && (
        <div className="rounded-lg p-4 bg-gray-50 border border-gray-200">
          <p className="text-sm font-medium text-gray-700">
            이 월은 정산 대상이 아닙니다
          </p>
          {firstEligible && (
            <p className="text-xs text-gray-500 mt-1">
              첫 정산 대상월: {formatYearMonth(firstEligible)}
            </p>
          )}
        </div>
      )}

      {/* 3. 통계 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="이번 달 매출"
          value={revenue > 0 ? formatKRW(revenue) : '-'}
          icon={<Calculator className="w-5 h-5" />}
        />
        <StatCard
          title="순수익"
          value={revenue > 0 ? formatKRW(netProfit) : '-'}
          subtitle={revenue > 0 && hasCosts ? `비용 ${formatKRW(totalCosts(costs))}` : undefined}
          icon={<Minus className="w-5 h-5" />}
          trend={netProfit > 0 ? 'up' : netProfit < 0 ? 'down' : undefined}
        />
        <StatCard
          title={report?.admin_deposit_amount ? '관리자 확정 금액' : `수수료 (${sharePercentage}%${listingDiscount.tierName ? ` +${listingDiscount.discountRatePercent}` : ''})`}
          value={
            report?.admin_deposit_amount
              ? formatKRW(report.admin_deposit_amount)
              : revenue > 0
                ? formatKRW(depositAmount)
                : '-'
          }
          subtitle={revenue > 0 && finalVatCalc.vatAmount > 0 ? `+VAT ${formatKRW(finalVatCalc.vatAmount)} = ${formatKRW(finalVatCalc.totalWithVat)}` : undefined}
          icon={<Send className="w-5 h-5" />}
        />
      </div>

      {/* 상품등록 할인 배너 */}
      {totalListings > 0 && (
        <div className={`rounded-lg p-4 flex items-center justify-between flex-wrap gap-3 ${
          listingDiscount.tierName ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
        }`}>
          <div className="flex items-center gap-3">
            <Award className={`w-5 h-5 ${listingDiscount.tierName ? 'text-green-600' : 'text-gray-400'}`} />
            <div>
              <p className="text-sm font-medium text-gray-900">
                {listingDiscount.tierName
                  ? `${listingDiscount.tierName} 등급 (누적 ${totalListings.toLocaleString()}개)`
                  : `누적 등록 ${totalListings.toLocaleString()}개`
                }
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {listingDiscount.tierName
                  ? `수수료 +${listingDiscount.discountRatePercent} 할인 적용 (월 최대 ${formatKRW(listingDiscount.monthlyCap)})`
                  : listingDiscount.nextTier
                    ? `${listingDiscount.nextTier.minListings.toLocaleString()}개 달성 시 ${listingDiscount.nextTier.name} 등급 할인`
                    : ''
                }
              </p>
            </div>
          </div>
          {listingDiscount.nextTier && (
            <div className="text-xs text-gray-500">
              다음 등급까지 <span className="font-bold text-gray-700">{listingDiscount.listingsToNextTier.toLocaleString()}개</span>
            </div>
          )}
        </div>
      )}

      {/* 4. 정산 진행 상태 */}
      {report && report.payment_status !== 'pending' && report.payment_status !== 'rejected' && (
        <Card>
          <h3 className="text-sm font-medium text-gray-700 mb-4">{formatYearMonth(yearMonth)} 진행 상태</h3>
          <PaymentProgress currentStatus={report.payment_status} />
        </Card>
      )}

      {/* 현재 보고 상태 */}
      {report && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{formatYearMonth(yearMonth)} 보고 상태</p>
              <div className="flex items-center gap-2 mt-1">
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
                {report.payment_confirmed_at && (
                  <span className="text-xs text-gray-400">
                    확인: {new Date(report.payment_confirmed_at).toLocaleDateString('ko-KR')}
                  </span>
                )}
              </div>
            </div>
            {report.payment_status === 'confirmed' && (
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            )}
          </div>

          {report.payment_status === 'reviewed' && (
            <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-medium text-purple-800">관리자가 매출을 확인했습니다. 송금을 대기 중입니다.</p>
                  {report.admin_deposit_amount && (
                    <p className="text-lg font-bold text-purple-900 mt-1">
                      확정 송금액: {formatKRW(report.admin_deposit_amount)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleDepositComplete}
                  disabled={depositLoading}
                  className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
                >
                  <Banknote className="w-4 h-4" />
                  {depositLoading ? '처리 중...' : '송금완료 신청'}
                </button>
              </div>
            </div>
          )}

          {report.payment_status === 'deposited' && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-medium text-yellow-800">
                송금완료 신청되었습니다. 관리자의 송금 확인을 기다려주세요.
              </p>
            </div>
          )}

          <AdminPendingBanner
            adminStatus={getAdminSettlementStatus(yearMonth, report.payment_status as SettlementPaymentStatus)}
          />

          {report.admin_note && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">관리자 메모: {report.admin_note}</p>
            </div>
          )}
        </Card>
      )}

      {/* 5. API 미연동 시 → 차단 배너 */}
      {!apiConnected && isEditable && (
        <ApiConnectionBanner variant="blocker" />
      )}

      {/* 6. API 연동됨 → 자동 매출 조회 카드 */}
      {apiConnected && isEditable && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Plug className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">쿠팡 Open API 연동됨</p>
                <p className="text-xs text-gray-500">버튼을 눌러 {formatYearMonth(yearMonth)} 매출을 자동으로 가져오세요.</p>
              </div>
            </div>

            {/* API 조회 완료 시: 매출액 + 배지 */}
            {apiVerified && revenue > 0 && (
              <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800">API 검증 매출</span>
                </div>
                <span className="text-lg font-bold text-green-800">{formatKRW(revenue)}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleApiFetch}
              disabled={apiFetching}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition disabled:opacity-50"
            >
              {apiFetching ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Plug className="w-4 h-4" />
              )}
              {apiFetching ? '매출 조회 중...' : '매출 가져오기'}
            </button>
          </div>
        </Card>
      )}

      {/* 7. 수동 매출 입력 (기존 비-API 보고서 편집용) */}
      {manualMode && isEditable && apiConnected && report && !report.api_verified && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-600" />
                <div>
                  <h2 className="text-sm font-bold text-gray-900">매출 수동 입력</h2>
                  <p className="text-xs text-amber-600">기존 보고서 수정 모드</p>
                </div>
              </div>
              {apiConnected && (
                <button
                  type="button"
                  onClick={() => setManualMode(false)}
                  className="text-xs text-green-600 hover:text-green-700 font-medium"
                >
                  API 조회로 돌아가기
                </button>
              )}
            </div>

            <NumberInput
              id="revenue"
              label="이번 달 총 매출"
              value={revenue}
              onChange={setRevenue}
              placeholder="0"
              suffix="원"
              disabled={!isEditable}
            />

            {/* 수동 입력 시 스크린샷 필수 (API 미검증 상태) */}
            {!apiVerified && (
              <div className="space-y-3">
                <FraudWarningBanner />
                <ScreenshotGuide type="revenue" />

                <FileUpload
                  label="매출 스크린샷 (Wing 정산 캡처)"
                  onFileSelect={handleFileSelect}
                  onClear={handleFileClear}
                  previewUrl={previewUrl}
                  warning={revenueExifResult && !revenueExifResult.isValid ? revenueExifResult.warningMessage || undefined : undefined}
                  successMessage={revenueExifResult?.isValid ? '스크린샷 확인 완료' : undefined}
                  error={revenueExifChecking ? '스크린샷 검증 중...' : undefined}
                />
              </div>
            )}

            {/* API 검증됨 상태에서 수동 수정 시 스크린샷 선택 */}
            {apiVerified && (
              <div className="space-y-3">
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Shield className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-800">API로 매출이 검증되었습니다</p>
                      <p className="text-xs text-green-700 mt-0.5">스크린샷은 선택사항입니다.</p>
                    </div>
                  </div>
                </div>

                <FileUpload
                  label="매출 스크린샷 (선택사항)"
                  onFileSelect={handleFileSelect}
                  onClear={handleFileClear}
                  previewUrl={previewUrl}
                  warning={revenueExifResult && !revenueExifResult.isValid ? revenueExifResult.warningMessage || undefined : undefined}
                  successMessage={revenueExifResult?.isValid ? '스크린샷 확인 완료' : undefined}
                  error={revenueExifChecking ? '스크린샷 검증 중...' : undefined}
                />
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 8. 광고비 입력 (항상 표시) */}
      {apiConnected && isEditable && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-gray-600" />
              <div>
                <h2 className="text-sm font-bold text-gray-900">광고비 입력</h2>
                <p className="text-xs text-gray-500">API로 자동 조회되지 않으므로 직접 입력해주세요.</p>
              </div>
            </div>

            <NumberInput
              id="advertisingCost"
              label="광고비"
              value={advertisingCost}
              onChange={setAdvertisingCost}
              placeholder="0"
              suffix="원"
              disabled={!isEditable}
            />

            {/* 광고비 > 0이면 스크린샷 업로드 영역 표시 */}
            {advertisingCost > 0 && (
              <div className="space-y-3">
                <FraudWarningBanner />
                <ScreenshotGuide type="ad" />

                <FileUpload
                  label="광고비 스크린샷"
                  onFileSelect={handleAdFileSelect}
                  onClear={handleAdFileClear}
                  previewUrl={adPreviewUrl}
                  warning={adExifResult && !adExifResult.isValid ? adExifResult.warningMessage || undefined : undefined}
                  successMessage={adExifResult?.isValid ? '스크린샷 확인 완료' : undefined}
                  error={adExifChecking ? '스크린샷 검증 중...' : undefined}
                />
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 9. 비용 내역 (접이식, 자동 계산 항목) */}
      {revenue > 0 && (
        <Card>
          <button
            type="button"
            onClick={() => setCostOpen(!costOpen)}
            className="w-full flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">비용 내역</span>
              {hasCosts && (
                <span className="text-xs text-gray-500">
                  (합계: {formatKRW(totalCosts(costs))})
                </span>
              )}
            </div>
            {costOpen ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {costOpen && (
            <div className="mt-4 space-y-3">
              {COST_CATEGORIES.filter((cat) => cat.key !== MANUAL_COST_KEY).map((cat) => {
                const rateInfo = DEFAULT_COST_RATES[cat.key];
                const val = costs[cat.key];
                return (
                  <div key={cat.key} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                    <div>
                      <span className="text-sm text-gray-700">{cat.label}</span>
                      <span className="text-xs text-gray-400 ml-2">
                        매출 × {Math.round(rateInfo.rate * 100)}%
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {revenue > 0 ? formatKRW(val) : '-'}
                    </span>
                  </div>
                );
              })}

              {advertisingCost > 0 && (
                <div className="flex items-center justify-between py-2 px-3 bg-amber-50 rounded-lg">
                  <span className="text-sm text-gray-700">광고비 (직접 입력)</span>
                  <span className="text-sm font-medium text-gray-900">{formatKRW(advertisingCost)}</span>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* 10. 정산 내역 요약 */}
      {revenue > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="w-4 h-4 text-[#E31837]" />
            <span className="text-sm font-medium text-[#E31837]">정산 내역</span>
            {apiVerified && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                <Shield className="w-3 h-3" />
                API 검증됨
              </div>
            )}
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">총 매출</span>
              <span className="font-medium text-gray-900">{formatKRW(revenue)}</span>
            </div>
            {COST_CATEGORIES.map((cat) => {
              const val = costs[cat.key];
              if (val <= 0) return null;
              const isAuto = cat.key !== MANUAL_COST_KEY;
              const rateInfo = isAuto ? DEFAULT_COST_RATES[cat.key] : null;
              return (
                <div key={cat.key} className="flex justify-between">
                  <span className="text-gray-500">
                    ─ {cat.label}
                    {rateInfo && (
                      <span className="text-gray-400 text-xs ml-1">({Math.round(rateInfo.rate * 100)}%)</span>
                    )}
                  </span>
                  <span className="text-gray-500">-{formatKRW(val)}</span>
                </div>
              );
            })}
            <div className="border-t border-[#E31837]/20 pt-2 mt-2 space-y-1">
              <div className="flex justify-between">
                <span className="font-medium text-gray-700">순수익</span>
                <span className={`font-bold ${netProfit > 0 ? 'text-gray-900' : 'text-red-600'}`}>
                  {formatKRW(netProfit)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-gray-700">
                  기본 공급가액 (수수료 {sharePercentage}%)
                </span>
                <span className="font-bold text-gray-900">
                  {formatKRW(baseDepositAmount)}
                </span>
              </div>
              {listingDiscount.discountAmount > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-green-600 font-medium flex items-center gap-1">
                    <Award className="w-3.5 h-3.5" />
                    상품등록 할인 ({listingDiscount.tierName} +{listingDiscount.discountRatePercent})
                    {listingDiscount.capped && (
                      <span className="text-xs text-gray-400 font-normal ml-1">캡 적용</span>
                    )}
                  </span>
                  <span className="font-bold text-green-600">
                    +{formatKRW(listingDiscount.discountAmount)}
                  </span>
                </div>
              )}
              {listingDiscount.discountAmount > 0 && (
                <div className="flex justify-between">
                  <span className="font-medium text-gray-700">
                    할인 적용 공급가액
                  </span>
                  <span className="font-bold text-gray-900">
                    {formatKRW(depositAmount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">
                  부가가치세 (10%)
                </span>
                <span className="text-gray-700">
                  {formatKRW(finalVatCalc.vatAmount)}
                </span>
              </div>
              <div className="flex justify-between border-t border-[#E31837]/20 pt-1 mt-1">
                <span className="font-medium text-[#E31837]">
                  납부 합계 (공급가액+VAT)
                </span>
                <span className="text-xl font-bold text-[#E31837]">
                  {formatKRW(finalVatCalc.totalWithVat)}
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 메시지 */}
      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-600'
          }`}
          role="alert"
        >
          {message.text}
        </div>
      )}

      {/* 11. 제출 버튼 (API 연동 필수) */}
      {apiConnected && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitLoading || !isEditable || !eligible}
          className="w-full py-3 bg-[#E31837] text-white font-semibold rounded-lg hover:bg-[#c01530] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" />
          {!eligible
            ? '정산 대상이 아닌 월입니다'
            : submitLoading
              ? '제출 중...'
              : report
                ? isEditable ? '보고 수정' : '이미 확인된 보고입니다'
                : '매출 정산 제출'
          }
        </button>
      )}
    </div>
  );
}
