'use client';

import { useState, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Modal from '@/components/ui/Modal';
import FileUpload from '@/components/ui/FileUpload';
import { CONTRACT_ARTICLES, renderArticleText } from '@/lib/data/contract-terms';
import type { Contract, MonthlyReport } from '@/lib/supabase/types';
import { PAYMENT_STATUS_LABELS } from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/format';
import { AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, FileText, Upload, MessageSquare, Shield } from 'lucide-react';

interface WithdrawalWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  contract: Contract;
}

const STEP_TITLES = [
  '제10조 확인',
  '제11조 확인',
  '제12조 확인',
  '미정산 내역',
  '상품 철거 증빙',
  '탈퇴 사유',
  '최종 확인',
];

const TOTAL_STEPS = STEP_TITLES.length;

export default function WithdrawalWizard({
  isOpen,
  onClose,
  onSubmitted,
  contract,
}: WithdrawalWizardProps) {
  const [step, setStep] = useState(0);
  const [checks, setChecks] = useState([false, false, false]);
  const [unsettledReports, setUnsettledReports] = useState<MonthlyReport[]>([]);
  const [unsettledLoaded, setUnsettledLoaded] = useState(false);
  const [unsettledConfirmed, setUnsettledConfirmed] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreviewUrl, setEvidencePreviewUrl] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [finalCheck, setFinalCheck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const supabase = useMemo(() => createClient(), []);

  const contractVars = useMemo(() => ({
    share_percentage: contract.share_percentage,
    start_date: contract.start_date,
    end_date: contract.end_date,
  }), [contract]);

  // 미정산 내역 로드
  const loadUnsettled = useCallback(async () => {
    if (unsettledLoaded) return;
    const { data } = await supabase
      .from('monthly_reports')
      .select('*')
      .eq('pt_user_id', contract.pt_user_id)
      .neq('payment_status', 'confirmed')
      .order('year_month', { ascending: false });
    setUnsettledReports((data as MonthlyReport[]) || []);
    setUnsettledLoaded(true);
  }, [supabase, contract.pt_user_id, unsettledLoaded]);

  const canProceed = (): boolean => {
    switch (step) {
      case 0: return checks[0];
      case 1: return checks[1];
      case 2: return checks[2];
      case 3: return unsettledConfirmed;
      case 4: return !!evidenceFile;
      case 5: return reason.trim().length >= 10;
      case 6: return finalCheck;
      default: return false;
    }
  };

  const handleNext = async () => {
    if (step === 2) {
      // 미정산 내역 사전 로드
      await loadUnsettled();
    }
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    }
  };

  const handlePrev = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    try {
      // 1. 증빙 파일 업로드
      let evidenceUrl: string | null = null;
      if (evidenceFile) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setError('인증이 필요합니다.'); setSubmitting(false); return; }
        const { data: ptUser } = await supabase
          .from('pt_users')
          .select('id')
          .eq('profile_id', user.id)
          .maybeSingle();
        if (!ptUser) { setError('사용자 정보를 찾을 수 없습니다.'); setSubmitting(false); return; }

        const formData = new FormData();
        formData.append('file', evidenceFile);
        formData.append('ptUserId', ptUser.id);
        formData.append('yearMonth', 'withdrawal');
        formData.append('type', 'revenue');
        const uploadRes = await fetch('/api/upload-screenshot', {
          method: 'POST',
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          setError(uploadData.error || '파일 업로드에 실패했습니다.');
          setSubmitting(false);
          return;
        }
        evidenceUrl = uploadData.url;
      }

      // 2. 탈퇴 요청
      const res = await fetch('/api/contracts/request-withdrawal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason.trim(),
          evidenceUrl,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '탈퇴 요청에 실패했습니다.');
        setSubmitting(false);
        return;
      }

      onSubmitted();
      handleClose();
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep(0);
    setChecks([false, false, false]);
    setUnsettledReports([]);
    setUnsettledLoaded(false);
    setUnsettledConfirmed(false);
    setEvidenceFile(null);
    setEvidencePreviewUrl(null);
    setReason('');
    setFinalCheck(false);
    setError('');
    onClose();
  };

  const renderArticle = (articleIndex: number) => {
    const article = CONTRACT_ARTICLES[articleIndex];
    if (!article) return null;
    return (
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 max-h-[40vh] overflow-y-auto text-sm leading-relaxed text-gray-700">
        <h4 className="font-bold text-gray-900 mb-2">
          제{article.number}조 ({article.title})
        </h4>
        {article.paragraphs.map((p, i) => (
          <p key={i} className={i > 0 ? 'mt-1.5' : ''}>
            {renderArticleText(p, contractVars)}
          </p>
        ))}
        {article.subItems && (
          <ul className="list-disc pl-5 mt-2 space-y-1">
            {article.subItems.map((item, i) => (
              <li key={i}>
                {item.label !== String(i + 1) && (
                  <span className="font-medium">{item.label}: </span>
                )}
                {renderArticleText(item.text, contractVars)}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">계약 해지 조건을 반드시 확인하세요.</p>
            </div>
            {renderArticle(9)}
            <label className="flex items-start gap-3 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={checks[0]}
                onChange={(e) => setChecks([e.target.checked, checks[1], checks[2]])}
                className="w-5 h-5 rounded border-gray-300 text-[#E31837] focus:ring-[#E31837] mt-0.5"
              />
              <span className="text-sm text-gray-700">제10조 (계약 해지) 내용을 확인했습니다.</span>
            </label>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-orange-700 bg-orange-50 px-3 py-2 rounded-lg">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">계약 종료 후 14일 이내 상품 철거 의무가 있습니다.</p>
            </div>
            {renderArticle(10)}
            <label className="flex items-start gap-3 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={checks[1]}
                onChange={(e) => setChecks([checks[0], e.target.checked, checks[2]])}
                className="w-5 h-5 rounded border-gray-300 text-[#E31837] focus:ring-[#E31837] mt-0.5"
              />
              <span className="text-sm text-gray-700">제11조 (계약 종료 시 의무) 내용을 확인했습니다.</span>
            </label>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-red-700 bg-red-50 px-3 py-2 rounded-lg">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">상품 철거 미이행 시 수수료율 2배의 위약금이 부과됩니다.</p>
            </div>
            {renderArticle(11)}
            <label className="flex items-start gap-3 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={checks[2]}
                onChange={(e) => setChecks([checks[0], checks[1], e.target.checked])}
                className="w-5 h-5 rounded border-gray-300 text-[#E31837] focus:ring-[#E31837] mt-0.5"
              />
              <span className="text-sm text-gray-700">제12조 (위약금) 내용을 확인했습니다.</span>
            </label>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-blue-700 bg-blue-50 px-3 py-2 rounded-lg">
              <FileText className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">미정산 내역을 확인해주세요.</p>
            </div>

            {!unsettledLoaded ? (
              <div className="text-center py-8 text-gray-400">불러오는 중...</div>
            ) : unsettledReports.length === 0 ? (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700">미정산 내역이 없습니다.</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <p className="text-sm text-orange-700">
                    <strong>{unsettledReports.length}건</strong>의 미정산 내역이 있습니다.
                    계약 종료 후 30일 이내에 정산이 필요합니다.
                  </p>
                </div>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left py-2 px-3 font-medium text-gray-600">월</th>
                        <th className="text-right py-2 px-3 font-medium text-gray-600">매출</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-600">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unsettledReports.map((r) => (
                        <tr key={r.id} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-gray-900">{r.year_month}</td>
                          <td className="py-2 px-3 text-right text-gray-700">
                            {r.reported_revenue.toLocaleString()}원
                          </td>
                          <td className="py-2 px-3">
                            <span className="text-xs font-medium text-gray-600">
                              {PAYMENT_STATUS_LABELS[r.payment_status] || r.payment_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={unsettledConfirmed}
                onChange={(e) => setUnsettledConfirmed(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-[#E31837] focus:ring-[#E31837] mt-0.5"
              />
              <span className="text-sm text-gray-700">미정산 내역을 확인했습니다.</span>
            </label>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-blue-700 bg-blue-50 px-3 py-2 rounded-lg">
              <Upload className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">쿠팡 Wing 상품 목록 스크린샷을 업로드해주세요.</p>
            </div>
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 space-y-1">
              <p>- 쿠팡 Wing에 로그인하여 상품 목록 페이지를 캡처해주세요.</p>
              <p>- <strong>현재 날짜가 보이도록</strong> 캡처해주세요.</p>
              <p>- 탈퇴 승인 후 14일 이내 모든 상품 비활성화가 필요합니다.</p>
            </div>
            <FileUpload
              label="상품 목록 스크린샷"
              onFileSelect={(file) => {
                setEvidenceFile(file);
                setEvidencePreviewUrl(URL.createObjectURL(file));
              }}
              onClear={() => {
                setEvidenceFile(null);
                setEvidencePreviewUrl(null);
              }}
              previewUrl={evidencePreviewUrl}
            />
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-gray-700 bg-gray-50 px-3 py-2 rounded-lg">
              <MessageSquare className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">탈퇴 사유를 작성해주세요.</p>
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={5}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent resize-none"
              placeholder="탈퇴 사유를 최소 10자 이상 입력해주세요."
            />
            <p className={`text-xs ${reason.trim().length >= 10 ? 'text-green-600' : 'text-gray-400'}`}>
              {reason.trim().length}/10자 이상
            </p>
          </div>
        );

      case 6:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-red-700 bg-red-50 px-3 py-2 rounded-lg">
              <Shield className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">최종 확인</p>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2">
                {/* 조항 확인 요약 */}
                {[10, 11, 12].map((num, i) => (
                  <div key={num} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                    <span className="text-sm text-gray-700">제{num}조 확인 완료</span>
                    {checks[i] && <span className="text-xs text-green-600 ml-auto">확인됨</span>}
                  </div>
                ))}

                {/* 미정산 내역 */}
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                  <span className="text-sm text-gray-700">
                    미정산 내역: {unsettledReports.length > 0 ? `${unsettledReports.length}건` : '없음'}
                  </span>
                </div>

                {/* 증빙 */}
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                  <span className="text-sm text-gray-700">상품 목록 증빙 첨부됨</span>
                </div>

                {/* 사유 */}
                <div className="px-3 py-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                    <span className="text-sm text-gray-700">탈퇴 사유</span>
                  </div>
                  <p className="text-sm text-gray-600 pl-6 line-clamp-3">{reason}</p>
                </div>
              </div>
            </div>

            {/* 증빙 미리보기 */}
            {evidencePreviewUrl && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <img src={evidencePreviewUrl} alt="증빙" className="w-full h-32 object-contain bg-gray-50" />
              </div>
            )}

            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">
                탈퇴 요청을 제출하면 관리자 승인 후 계약이 해지됩니다.
                승인 후 14일 이내 모든 상품 비활성화 의무가 있습니다.
              </p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={finalCheck}
                onChange={(e) => setFinalCheck(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-[#E31837] focus:ring-[#E31837] mt-0.5"
              />
              <span className="text-sm text-gray-700 font-medium">
                위 내용을 모두 확인하였으며, 계약 탈퇴를 요청합니다.
              </span>
            </label>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="계약 탈퇴 요청"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-1.5">
          {STEP_TITLES.map((title, i) => (
            <div key={title} className="flex items-center gap-1.5">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
                  i < step
                    ? 'bg-green-500 text-white'
                    : i === step
                    ? 'bg-[#E31837] text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              {i < TOTAL_STEPS - 1 && (
                <div className={`w-4 h-0.5 ${i < step ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Title */}
        <div className="text-center">
          <p className="text-xs text-gray-500">
            {step + 1}/{TOTAL_STEPS}단계
          </p>
          <h3 className="text-sm font-bold text-gray-900">{STEP_TITLES[step]}</h3>
        </div>

        {/* Step Content */}
        <div className="min-h-[200px]">
          {renderStepContent()}
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2 border-t border-gray-200">
          <button
            type="button"
            onClick={step === 0 ? handleClose : handlePrev}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 0 ? '취소' : '이전'}
          </button>

          {step < TOTAL_STEPS - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canProceed() || submitting}
              className="flex items-center gap-1.5 px-5 py-2.5 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  요청 중...
                </>
              ) : (
                '탈퇴 요청 제출'
              )}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
