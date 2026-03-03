'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ONBOARDING_STEPS, ONBOARDING_STATUS_LABELS, ONBOARDING_STATUS_COLORS } from '@/lib/utils/constants';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import type { OnboardingStep } from '@/lib/supabase/types';

interface OnboardingReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  ptUserName: string;
  steps: OnboardingStep[];
  onUpdated: () => void;
}

export default function OnboardingReviewModal({
  isOpen,
  onClose,
  ptUserName,
  steps,
  onUpdated,
}: OnboardingReviewModalProps) {
  const [rejectNote, setRejectNote] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const supabase = createClient();

  const stepLabelMap = new Map(ONBOARDING_STEPS.map((s) => [s.key, s]));

  const handleApprove = async (step: OnboardingStep) => {
    setLoading(step.id);
    await supabase
      .from('onboarding_steps')
      .update({
        status: 'approved',
        completed_at: new Date().toISOString(),
        admin_note: null,
      })
      .eq('id', step.id);

    setLoading(null);
    onUpdated();
  };

  const handleReject = async (stepId: string) => {
    if (!rejectNote.trim()) return;
    setLoading(stepId);

    await supabase
      .from('onboarding_steps')
      .update({
        status: 'rejected',
        admin_note: rejectNote.trim(),
        completed_at: null,
      })
      .eq('id', stepId);

    setLoading(null);
    setRejectingId(null);
    setRejectNote('');
    onUpdated();
  };

  // 검토 대기 단계만 우선 표시, 나머지도 표시
  const submittedSteps = steps.filter((s) => s.status === 'submitted');
  const otherSteps = steps.filter((s) => s.status !== 'submitted');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${ptUserName} - 온보딩 검토`} maxWidth="max-w-2xl">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        {/* 검토 대기 */}
        {submittedSteps.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-blue-700 mb-2">검토 대기 ({submittedSteps.length}건)</h3>
            <div className="space-y-3">
              {submittedSteps.map((step) => {
                const def = stepLabelMap.get(step.step_key);
                return (
                  <div key={step.id} className="border border-blue-200 bg-blue-50/50 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-900">
                          {def ? `${def.order}. ${def.label}` : step.step_key}
                        </span>
                        <Badge
                          label={ONBOARDING_STATUS_LABELS[step.status]}
                          colorClass={ONBOARDING_STATUS_COLORS[step.status]}
                        />
                      </div>
                      {step.submitted_at && (
                        <span className="text-xs text-gray-400">
                          {new Date(step.submitted_at).toLocaleDateString('ko-KR')}
                        </span>
                      )}
                    </div>

                    {/* 증빙 미리보기 */}
                    {step.evidence_url && (
                      <div>
                        {step.evidence_url.endsWith('.pdf') ? (
                          <a
                            href={step.evidence_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-sm text-[#E31837] hover:underline"
                          >
                            <ExternalLink className="w-4 h-4" />
                            PDF 증빙 보기
                          </a>
                        ) : (
                          <div className="space-y-2">
                            <img
                              src={step.evidence_url}
                              alt="증빙"
                              className="w-full max-h-48 object-contain bg-white rounded border border-gray-200"
                            />
                            <a
                              href={step.evidence_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-[#E31837] hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              원본 보기
                            </a>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 반려 사유 입력 */}
                    {rejectingId === step.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={rejectNote}
                          onChange={(e) => setRejectNote(e.target.value)}
                          placeholder="반려 사유를 입력해주세요..."
                          className="w-full border border-gray-300 rounded-lg p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setRejectingId(null); setRejectNote(''); }}
                            className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(step.id)}
                            disabled={!rejectNote.trim() || loading === step.id}
                            className="px-3 py-1.5 text-xs text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                          >
                            {loading === step.id ? '처리 중...' : '반려 확정'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleApprove(step)}
                          disabled={loading === step.id}
                          className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {loading === step.id ? '처리 중...' : '승인'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejectingId(step.id)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition"
                        >
                          <XCircle className="w-4 h-4" />
                          반려
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 기타 단계 */}
        {otherSteps.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">전체 단계</h3>
            <div className="space-y-2">
              {otherSteps.map((step) => {
                const def = stepLabelMap.get(step.step_key);
                return (
                  <div key={step.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-700">
                      {def ? `${def.order}. ${def.label}` : step.step_key}
                    </span>
                    <Badge
                      label={ONBOARDING_STATUS_LABELS[step.status]}
                      colorClass={ONBOARDING_STATUS_COLORS[step.status]}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {steps.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">아직 온보딩 데이터가 없습니다.</p>
        )}
      </div>
    </Modal>
  );
}
