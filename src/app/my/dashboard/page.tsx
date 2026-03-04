'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { calculateDeposit, calculateNetProfit, totalCosts, buildCostBreakdown } from '@/lib/calculations/deposit';
import type { CostBreakdown } from '@/lib/calculations/deposit';
import { formatKRW, getCurrentYearMonth, formatYearMonth } from '@/lib/utils/format';
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, COST_CATEGORIES, DEFAULT_COST_RATES, MANUAL_COST_KEY } from '@/lib/utils/constants';
import { getReportTargetMonth, isEligibleForMonth, getFirstEligibleMonth, getSettlementDDay, formatDDay, getDDayColorClass, formatDeadline } from '@/lib/utils/settlement';
import { validateExifMetadata } from '@/lib/utils/exif-validation';
import type { ExifValidationResult } from '@/lib/utils/exif-validation';
import MonthPicker from '@/components/ui/MonthPicker';
import NumberInput from '@/components/ui/NumberInput';
import FileUpload from '@/components/ui/FileUpload';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import StatCard from '@/components/ui/StatCard';
import PaymentProgress from '@/components/ui/PaymentProgress';
import { Send, Calculator, CheckCircle2, ChevronDown, ChevronUp, Banknote, Minus, AlertTriangle } from 'lucide-react';
import type { MonthlyReport, PtUser } from '@/lib/supabase/types';
import OnboardingChecklist from '@/components/onboarding/OnboardingChecklist';

export default function MyDashboardPage() {
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
  const [guideOpen, setGuideOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  // 자동 비용 계산으로 CostBreakdown 파생
  const costs: CostBreakdown = buildCostBreakdown(revenue, advertisingCost);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setMessage(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // PT 사용자 정보
    const { data: ptUserData } = await supabase
      .from('pt_users')
      .select('*')
      .eq('profile_id', user.id)
      .single();

    if (ptUserData) {
      setPtUser(ptUserData as PtUser);

      // 해당 월 보고 조회
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
        // 기존 보고에 스크린샷이 있으면 EXIF 통과 처리
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
      }
    }

    setLoading(false);
  }, [yearMonth, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sharePercentage = ptUser?.share_percentage ?? 30;
  const netProfit = calculateNetProfit(revenue, costs);
  const depositAmount = calculateDeposit(revenue, costs, sharePercentage);

  const handleFileSelect = async (file: File) => {
    setScreenshotFile(file);
    setPreviewUrl(URL.createObjectURL(file));

    // 즉시 EXIF 검사 실행
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

    // 즉시 EXIF 검사 실행
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

  /** 서버 API를 통해 스크린샷 업로드 (EXIF 서버 검증 포함) */
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

    // 매출 스크린샷 EXIF 검증 통과 확인
    if (screenshotFile && (!revenueExifResult || !revenueExifResult.isValid)) {
      setMessage({ type: 'error', text: '매출 스크린샷의 EXIF 검증을 통과해야 합니다. 실제 스크린샷을 업로드해주세요.' });
      return;
    }

    // 광고비 > 0이면 스크린샷 필수
    if (advertisingCost > 0 && !adPreviewUrl) {
      setMessage({ type: 'error', text: '광고비를 입력한 경우 광고비 스크린샷이 필수입니다.' });
      return;
    }

    // 광고비 스크린샷 EXIF 검증 통과 확인
    if (advertisingCost > 0 && adScreenshotFile && (!adExifResult || !adExifResult.isValid)) {
      setMessage({ type: 'error', text: '광고비 스크린샷의 EXIF 검증을 통과해야 합니다. 실제 스크린샷을 업로드해주세요.' });
      return;
    }

    setSubmitLoading(true);
    setMessage(null);

    let screenshotUrl = report?.screenshot_url || null;
    let adScreenshotUrl = report?.ad_screenshot_url || null;

    // 매출 스크린샷 업로드 (서버 경유)
    if (screenshotFile) {
      const result = await uploadScreenshot(screenshotFile, ptUser.id, yearMonth, 'revenue');
      if ('error' in result) {
        setMessage({ type: 'error', text: result.error });
        setSubmitLoading(false);
        return;
      }
      screenshotUrl = result.url;
    }

    // 광고비 스크린샷 업로드 (서버 경유)
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
    };

    if (report) {
      const { error } = await supabase
        .from('monthly_reports')
        .update(reportData)
        .eq('id', report.id);

      if (error) {
        setMessage({ type: 'error', text: '보고 수정에 실패했습니다.' });
      } else {
        setMessage({ type: 'success', text: '매출 보고가 수정되었습니다.' });
        fetchData();
      }
    } else {
      const { error } = await supabase
        .from('monthly_reports')
        .insert(reportData);

      if (error) {
        setMessage({ type: 'error', text: '보고 제출에 실패했습니다.' });
      } else {
        setMessage({ type: 'success', text: '매출 보고가 제출되었습니다.' });
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
      setMessage({ type: 'error', text: '입금완료 처리에 실패했습니다.' });
    } else {
      setMessage({ type: 'success', text: '입금완료 처리되었습니다. 관리자 확인을 기다려주세요.' });
      fetchData();
    }
    setDepositLoading(false);
  };

  const isEditable = !report || report.payment_status === 'pending' || report.payment_status === 'rejected';
  const hasCosts = totalCosts(costs) > 0;

  // 정산 대상 여부 + D-day
  const eligible = ptUser ? isEligibleForMonth(ptUser.created_at, yearMonth) : true;
  const dday = getSettlementDDay(yearMonth);
  const firstEligible = ptUser ? getFirstEligibleMonth(ptUser.created_at) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 온보딩 체크리스트 */}
      {ptUser && <OnboardingChecklist ptUserId={ptUser.id} />}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">매출 보고</h1>
        <MonthPicker value={yearMonth} onChange={setYearMonth} />
      </div>

      {/* D-day 배너 */}
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

      {/* 상태 카드 */}
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
          title={report?.admin_deposit_amount ? '관리자 확정 금액' : `입금액 (${sharePercentage}%)`}
          value={
            report?.admin_deposit_amount
              ? formatKRW(report.admin_deposit_amount)
              : revenue > 0
                ? formatKRW(depositAmount)
                : '-'
          }
          icon={<Send className="w-5 h-5" />}
        />
      </div>

      {/* 4단계 진행바 */}
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

          {/* reviewed 상태: 확정 입금액 표시 + 입금완료 버튼 */}
          {report.payment_status === 'reviewed' && (
            <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-medium text-purple-800">관리자가 매출을 확인했습니다</p>
                  {report.admin_deposit_amount && (
                    <p className="text-lg font-bold text-purple-900 mt-1">
                      확정 입금액: {formatKRW(report.admin_deposit_amount)}
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
                  {depositLoading ? '처리 중...' : '입금완료'}
                </button>
              </div>
            </div>
          )}

          {/* deposited 상태 안내 */}
          {report.payment_status === 'deposited' && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-medium text-yellow-800">
                입금완료 처리되었습니다. 관리자의 최종 확인을 기다려주세요.
              </p>
            </div>
          )}

          {report.admin_note && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">관리자 메모: {report.admin_note}</p>
            </div>
          )}
        </Card>
      )}

      {/* 쿠팡 캡처 가이드 */}
      <Card>
        <button
          type="button"
          onClick={() => setGuideOpen(!guideOpen)}
          className="w-full flex items-center justify-between text-left"
        >
          <h3 className="text-sm font-bold text-gray-900">쿠팡 매출 캡처 가이드</h3>
          {guideOpen ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </button>

        {guideOpen && (
          <div className="mt-4 space-y-3">
            {[
              { step: 1, title: 'Wing 로그인', desc: 'wing.coupang.com에 로그인합니다.' },
              { step: 2, title: '정산관리 이동', desc: '좌측 메뉴에서 "정산관리"를 클릭합니다.' },
              { step: 3, title: '기간 조회', desc: '해당 월의 정산 내역을 조회합니다.' },
              { step: 4, title: '화면 캡처', desc: '매출 합계가 보이는 화면을 캡처합니다.' },
              { step: 5, title: '업로드', desc: '아래 매출 보고 폼에서 캡처 이미지를 업로드합니다.' },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-[#E31837] text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {item.step}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 매출 입력 폼 */}
      <Card>
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          {formatYearMonth(yearMonth)} 매출 보고
        </h2>

        {loading ? (
          <div className="py-8 text-center text-gray-400">불러오는 중...</div>
        ) : (
          <div className="space-y-5">
            <NumberInput
              id="revenue"
              label="이번 달 총 매출"
              value={revenue}
              onChange={setRevenue}
              placeholder="0"
              suffix="원"
              disabled={!isEditable}
            />

            {/* 비용 섹션 (접이식) */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setCostOpen(!costOpen)}
                className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">비용 내역</span>
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
                <div className="p-4 space-y-3 border-t border-gray-200">
                  {/* 자동 비용 항목: 읽기 전용 */}
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

                  {/* 광고비: 직접 입력 */}
                  <div className="pt-2 border-t border-gray-200">
                    <NumberInput
                      id="advertisingCost"
                      label="광고비 (직접 입력)"
                      value={advertisingCost}
                      onChange={setAdvertisingCost}
                      placeholder="0"
                      suffix="원"
                      disabled={!isEditable}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 광고비 스크린샷 섹션 */}
            {advertisingCost > 0 && (
              <div className="space-y-3">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">광고비 스크린샷 필수</p>
                      <ul className="text-xs text-amber-700 mt-1 space-y-0.5 list-disc list-inside">
                        <li>쿠팡 Wing 광고관리에서 캡처해주세요</li>
                        <li>날짜 범위가 보이도록 캡처해주세요</li>
                        <li>AI 생성 이미지는 제출할 수 없습니다</li>
                      </ul>
                    </div>
                  </div>
                </div>

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

            {/* 실시간 정산 내역 */}
            {revenue > 0 && (
              <div className="bg-[#FFF5F5] border border-[#E31837]/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calculator className="w-4 h-4 text-[#E31837]" />
                  <span className="text-sm font-medium text-[#E31837]">정산 내역</span>
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
                      <span className="font-medium text-[#E31837]">
                        입금액 ({sharePercentage}%)
                      </span>
                      <span className="text-xl font-bold text-[#E31837]">
                        {formatKRW(depositAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 매출 스크린샷 섹션 */}
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">매출 스크린샷 주의사항</p>
                    <ul className="text-xs text-amber-700 mt-1 space-y-0.5 list-disc list-inside">
                      <li>쿠팡 Wing 정산관리에서 캡처해주세요</li>
                      <li>매출 합계가 보이도록 캡처해주세요</li>
                      <li>AI 생성 이미지는 제출할 수 없습니다</li>
                    </ul>
                  </div>
                </div>
              </div>

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
                    : '매출 보고 제출'
              }
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
