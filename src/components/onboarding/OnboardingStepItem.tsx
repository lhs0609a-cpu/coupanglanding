'use client';

import { useState, useRef } from 'react';
import { Circle, Clock, CheckCircle2, XCircle, Upload, ChevronDown, ChevronUp } from 'lucide-react';
import type { OnboardingStepDefinition } from '@/lib/supabase/types';
import type { ComputedStepStatus } from './onboarding-utils';
import Badge from '@/components/ui/Badge';
import { ONBOARDING_STATUS_LABELS, ONBOARDING_STATUS_COLORS } from '@/lib/utils/constants';

interface OnboardingStepItemProps {
  definition: OnboardingStepDefinition;
  status: ComputedStepStatus;
  adminNote: string | null;
  evidenceUrl: string | null;
  onSelfCheck: () => Promise<void>;
  onEvidenceSubmit: (file: File) => Promise<void>;
  loading?: boolean;
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
  loading = false,
}: OnboardingStepItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isCompleted = status === 'completed' || status === 'approved';
  const canExpand = !isCompleted || status === 'completed';
  const showAction = definition.verificationType !== 'auto_linked' && !isCompleted;

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
  };

  return (
    <div className={`border rounded-lg transition ${isCompleted ? 'border-green-200 bg-green-50/50' : status === 'rejected' ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}`}>
      {/* Header row */}
      <button
        type="button"
        onClick={() => canExpand && setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <span className="shrink-0">{statusIcons[status]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${isCompleted ? 'text-green-700' : 'text-gray-900'}`}>
              {definition.order}. {definition.label}
            </span>
            <Badge
              label={ONBOARDING_STATUS_LABELS[status]}
              colorClass={ONBOARDING_STATUS_COLORS[status]}
            />
          </div>
        </div>
        {canExpand && !isCompleted && (
          <span className="shrink-0 text-gray-400">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        )}
      </button>

      {/* Expandable detail */}
      {expanded && !isCompleted && (
        <div className="px-4 pb-4 pt-0 space-y-3 border-t border-gray-100">
          <p className="text-sm text-gray-600">{definition.description}</p>

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
              onClick={onSelfCheck}
              disabled={loading}
              className="w-full py-2.5 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {loading ? '처리 중...' : '확인 완료'}
            </button>
          )}

          {/* 증빙 업로드 */}
          {definition.verificationType === 'evidence_upload' && showAction && (
            <div className="space-y-3">
              {/* 미리보기 */}
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
                {definition.autoLinkSource === 'contract'
                  ? '계약서 서명이 완료되면 자동으로 반영됩니다.'
                  : '첫 매출 보고가 제출되면 자동으로 반영됩니다.'
                }
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
