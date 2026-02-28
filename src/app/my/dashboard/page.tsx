'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { calculateDeposit } from '@/lib/calculations/deposit';
import { formatKRW, getCurrentYearMonth, formatYearMonth } from '@/lib/utils/format';
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from '@/lib/utils/constants';
import MonthPicker from '@/components/ui/MonthPicker';
import NumberInput from '@/components/ui/NumberInput';
import FileUpload from '@/components/ui/FileUpload';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import StatCard from '@/components/ui/StatCard';
import { Send, Calculator, Shield, CheckCircle2 } from 'lucide-react';
import type { MonthlyReport, PtUser } from '@/lib/supabase/types';

export default function MyDashboardPage() {
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth());
  const [revenue, setRevenue] = useState(0);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [ptUser, setPtUser] = useState<PtUser | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setMessage(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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
        setReport(reportData as MonthlyReport);
        setRevenue(reportData.reported_revenue);
        setPreviewUrl(reportData.screenshot_url);
      } else {
        setReport(null);
        setRevenue(0);
        setPreviewUrl(null);
        setScreenshotFile(null);
      }
    }

    setLoading(false);
  }, [yearMonth, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sharePercentage = ptUser?.share_percentage ?? 30;
  const depositAmount = calculateDeposit(revenue, sharePercentage);

  const handleFileSelect = (file: File) => {
    setScreenshotFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!ptUser) return;
    if (revenue <= 0) {
      setMessage({ type: 'error', text: '매출 금액을 입력해주세요.' });
      return;
    }

    setSubmitLoading(true);
    setMessage(null);

    let screenshotUrl = report?.screenshot_url || null;

    // 스크린샷 업로드
    if (screenshotFile) {
      const fileExt = screenshotFile.name.split('.').pop();
      const filePath = `${ptUser.id}/${yearMonth}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('revenue-screenshots')
        .upload(filePath, screenshotFile, { upsert: true });

      if (uploadError) {
        setMessage({ type: 'error', text: '스크린샷 업로드에 실패했습니다.' });
        setSubmitLoading(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('revenue-screenshots')
        .getPublicUrl(filePath);

      screenshotUrl = urlData.publicUrl;
    }

    const reportData = {
      pt_user_id: ptUser.id,
      year_month: yearMonth,
      reported_revenue: revenue,
      screenshot_url: screenshotUrl,
      calculated_deposit: depositAmount,
      payment_status: 'submitted' as const,
    };

    if (report) {
      // 기존 보고 수정
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
      // 새 보고 제출
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

  const isEditable = !report || report.payment_status === 'pending' || report.payment_status === 'rejected';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">매출 보고</h1>
        <MonthPicker value={yearMonth} onChange={setYearMonth} />
      </div>

      {/* 상태 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="이번 달 매출"
          value={revenue > 0 ? formatKRW(revenue) : '-'}
          icon={<Calculator className="w-5 h-5" />}
        />
        <StatCard
          title={`입금액 (${sharePercentage}%)`}
          value={revenue > 0 ? formatKRW(depositAmount) : '-'}
          icon={<Send className="w-5 h-5" />}
        />
        <StatCard
          title="프로그램 접근"
          value={ptUser?.program_access_active ? '활성' : '비활성'}
          subtitle={ptUser?.program_access_active ? '정상 이용 가능' : '입금 확인 후 활성화'}
          icon={<Shield className="w-5 h-5" />}
          trend={ptUser?.program_access_active ? 'up' : 'down'}
        />
      </div>

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
          {report.admin_note && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">관리자 메모: {report.admin_note}</p>
            </div>
          )}
        </Card>
      )}

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
            />

            {/* 실시간 계산 결과 */}
            {revenue > 0 && (
              <div className="bg-[#FFF5F5] border border-[#E31837]/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calculator className="w-4 h-4 text-[#E31837]" />
                  <span className="text-sm font-medium text-[#E31837]">입금액 계산</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-gray-600">
                    {formatKRW(revenue)} × {sharePercentage}% =
                  </span>
                  <span className="text-xl font-bold text-[#E31837]">
                    {formatKRW(depositAmount)}
                  </span>
                </div>
              </div>
            )}

            <FileUpload
              label="매출 스크린샷"
              onFileSelect={handleFileSelect}
              onClear={() => { setScreenshotFile(null); setPreviewUrl(null); }}
              previewUrl={previewUrl}
            />

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
              disabled={submitLoading || !isEditable}
              className="w-full py-3 bg-[#E31837] text-white font-semibold rounded-lg hover:bg-[#c01530] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {submitLoading
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
