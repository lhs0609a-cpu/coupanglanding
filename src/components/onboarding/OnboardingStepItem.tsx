'use client';

import { useState, useRef } from 'react';
import {
  Circle, Clock, CheckCircle2, XCircle, Upload,
  ChevronDown, ChevronUp, Lock, ChevronLeft, ChevronRight, PartyPopper,
} from 'lucide-react';
import type { OnboardingStepDefinition } from '@/lib/supabase/types';
import type { ComputedStepStatus } from './onboarding-utils';
import type { TutorialStepContent } from '@/lib/data/onboarding-tutorials';
import Badge from '@/components/ui/Badge';
import { ONBOARDING_STATUS_LABELS, ONBOARDING_STATUS_COLORS } from '@/lib/utils/constants';
import SubStepProgress from './SubStepProgress';
import TutorialSubStepView from './TutorialSubStepView';
import LegalQuiz from './LegalQuiz';

interface OnboardingStepItemProps {
  definition: OnboardingStepDefinition;
  status: ComputedStepStatus;
  adminNote: string | null;
  evidenceUrl: string | null;
  onSelfCheck: () => Promise<void>;
  onEvidenceSubmit: (file: File) => Promise<void>;
  onQuizComplete?: () => Promise<void>;
  ptUserId?: string;
  loading?: boolean;
  tutorialContent?: TutorialStepContent;
  isLocked: boolean;
}

const statusIcons: Record<ComputedStepStatus, React.ReactNode> = {
  pending: <Circle className="w-5 h-5 text-gray-400" />,
  submitted: <Clock className="w-5 h-5 text-blue-500" />,
  approved: <CheckCircle2 className="w-5 h-5 text-green-500" />,
  rejected: <XCircle className="w-5 h-5 text-red-500" />,
  completed: <CheckCircle2 className="w-5 h-5 text-green-500" />,
};

export default function OnboardingStepItem({
  definition,
  status,
  adminNote,
  evidenceUrl,
  onSelfCheck,
  onEvidenceSubmit,
  onQuizComplete,
  ptUserId,
  loading = false,
  tutorialContent,
  isLocked,
}: OnboardingStepItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [currentSubStep, setCurrentSubStep] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isCompleted = status === 'completed' || status === 'approved';
  const canExpand = !isLocked && !isCompleted;
  const showAction = definition.verificationType !== 'auto_linked' && !isCompleted;
  const hasTutorial = tutorialContent && tutorialContent.subSteps.length > 0;
  const totalSubSteps = tutorialContent?.subSteps.length ?? 0;
  const isLastSubStep = currentSubStep === totalSubSteps - 1;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;
    await onEvidenceSubmit(selectedFile);
    setSelectedFile(null);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = '';
    triggerCelebration();
  };

  const handleSelfCheckClick = async () => {
    await onSelfCheck();
    triggerCelebration();
  };

  const triggerCelebration = () => {
    setShowCelebration(true);
    setTimeout(() => setShowCelebration(false), 3000);
  };

  const handleToggle = () => {
    if (isLocked) return;
    if (canExpand || isCompleted) {
      setExpanded(!expanded);
      if (!expanded) setCurrentSubStep(0);
    }
  };

  return (
    <div
      className={`border rounded-lg transition ${
        isLocked
          ? 'border-gray-200 bg-gray-50/50 opacity-60'
          : isCompleted
            ? 'border-green-200 bg-green-50/50'
            : status === 'rejected'
              ? 'border-red-200 bg-red-50/30'
              : 'border-gray-200'
      }`}
    >
      {/* Header row */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={isLocked}
        className="w-full flex items-center gap-3 p-4 text-left disabled:cursor-not-allowed"
      >
        <span className="shrink-0">
          {isLocked ? <Lock className="w-5 h-5 text-gray-300" /> : statusIcons[status]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {tutorialContent && (
              <span className="text-base mr-0.5">{tutorialContent.icon}</span>
            )}
            <span className={`text-sm font-medium ${isLocked ? 'text-gray-400' : isCompleted ? 'text-green-700' : 'text-gray-900'}`}>
              {definition.order}. {definition.label}
            </span>
            {!isLocked && (
              <Badge
                label={ONBOARDING_STATUS_LABELS[status]}
                colorClass={ONBOARDING_STATUS_COLORS[status]}
              />
            )}
          </div>
          {isLocked && (
            <p className="text-xs text-gray-400 mt-0.5">이전 단계를 완료해주세요</p>
          )}
        </div>
        {!isLocked && (
          <span className="shrink-0 text-gray-400">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        )}
      </button>

      {/* Celebration banner */}
      {showCelebration && tutorialContent && (
        <div className="mx-4 mb-3 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2 animate-pulse">
          <PartyPopper className="w-5 h-5 text-green-600" />
          <p className="text-sm font-medium text-green-700">{tutorialContent.completionMessage}</p>
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 space-y-4 border-t border-gray-100">
          {/* Tutorial overview */}
          {tutorialContent && (
            <div className="bg-gray-50 rounded-lg p-3 mt-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{tutorialContent.icon}</span>
                <span className="text-sm font-bold text-gray-900">{tutorialContent.tagline}</span>
              </div>
              <p className="text-sm text-gray-600">{tutorialContent.overview}</p>
              <p className="text-xs text-gray-400 mt-1">예상 소요시간: {tutorialContent.estimatedTotalTime}</p>
            </div>
          )}

          {/* Sub-step wizard */}
          {hasTutorial && (
            <div className="space-y-3">
              {/* Progress dots */}
              <SubStepProgress current={currentSubStep} total={totalSubSteps} />

              {/* Current sub-step content */}
              <div className="bg-white border border-gray-100 rounded-lg p-4">
                <TutorialSubStepView
                  subStep={tutorialContent.subSteps[currentSubStep]}
                  index={currentSubStep}
                />
              </div>

              {/* Navigation buttons */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentSubStep((s) => Math.max(0, s - 1))}
                  disabled={currentSubStep === 0}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                  이전
                </button>
                {!isLastSubStep ? (
                  <button
                    type="button"
                    onClick={() => setCurrentSubStep((s) => Math.min(totalSubSteps - 1, s + 1))}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-[#E31837] hover:text-[#c01530] transition"
                  >
                    다음
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <span className="text-xs text-gray-400">마지막 단계</span>
                )}
              </div>
            </div>
          )}

          {/* 반려 사유 */}
          {status === 'rejected' && adminNote && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700 font-medium">반려 사유</p>
              <p className="text-sm text-red-600 mt-1">{adminNote}</p>
            </div>
          )}

          {/* 기존 증빙 표시 */}
          {evidenceUrl && status === 'submitted' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-600">증빙이 제출되었습니다. 관리자 검토를 기다려주세요.</p>
            </div>
          )}

          {/* 셀프 체크 */}
          {definition.verificationType === 'self_check' && showAction && (
            <button
              type="button"
              onClick={handleSelfCheckClick}
              disabled={loading}
              className="w-full py-2.5 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {loading ? '처리 중...' : '확인 완료'}
            </button>
          )}

          {/* 퀴즈 */}
          {definition.verificationType === 'quiz' && showAction && isLastSubStep && onQuizComplete && ptUserId && (
            <LegalQuiz
              ptUserId={ptUserId}
              onComplete={onQuizComplete}
              loading={loading}
            />
          )}

          {/* 증빙 업로드 */}
          {definition.verificationType === 'evidence_upload' && showAction && (
            <div className="space-y-3">
              {previewUrl && (
                <div className="relative border border-gray-200 rounded-lg overflow-hidden">
                  <img src={previewUrl} alt="미리보기" className="w-full h-40 object-contain bg-gray-50" />
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {selectedFile ? selectedFile.name : '파일 선택'}
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {selectedFile && (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    className="px-4 py-2.5 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition disabled:opacity-50"
                  >
                    {loading ? '제출 중...' : '제출'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 자동 연동 */}
          {definition.verificationType === 'auto_linked' && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-sm text-gray-500">
                {tutorialContent && (
                  <span className="block mb-1 text-gray-700">{tutorialContent.overview}</span>
                )}
                {definition.autoLinkSource === 'contract'
                  ? '계약서 서명이 완료되면 자동으로 반영됩니다.'
                  : '첫 매출 보고가 제출되면 자동으로 반영됩니다.'
                }
              </p>
            </div>
          )}

          {/* Completed state view */}
          {isCompleted && tutorialContent && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <p className="text-sm font-medium text-green-700">{tutorialContent.completionMessage}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
