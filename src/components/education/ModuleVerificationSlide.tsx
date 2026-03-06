'use client';

import { useState, useRef } from 'react';
import { CheckCircle2, Upload, ArrowRight, FileCheck } from 'lucide-react';
import type { OnboardingStepDefinition } from '@/lib/supabase/types';
import type { ComputedStepStatus } from '@/components/onboarding/onboarding-utils';
import LegalQuiz from '@/components/onboarding/LegalQuiz';
import Link from 'next/link';

interface ModuleVerificationSlideProps {
  definition: OnboardingStepDefinition;
  status: ComputedStepStatus;
  adminNote: string | null;
  evidenceUrl: string | null;
  ptUserId: string;
  onSelfCheck: () => Promise<void>;
  onEvidenceSubmit: (file: File) => Promise<void>;
  onQuizComplete: () => Promise<void>;
  loading: boolean;
}

export default function ModuleVerificationSlide({
  definition,
  status,
  adminNote,
  evidenceUrl,
  ptUserId,
  onSelfCheck,
  onEvidenceSubmit,
  onQuizComplete,
  loading,
}: ModuleVerificationSlideProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isCompleted = status === 'completed' || status === 'approved';

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

  if (isCompleted) {
    return (
      <div className="bg-white border border-green-200 rounded-xl p-6 min-h-[300px] flex flex-col items-center justify-center text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
        <h3 className="text-lg font-bold text-green-800 mb-1">완료!</h3>
        <p className="text-sm text-green-600">이 모듈을 성공적으로 완료했습니다.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 min-h-[300px]">
      <div className="flex items-center gap-2 mb-4">
        <FileCheck className="w-5 h-5 text-[#E31837]" />
        <h3 className="text-lg font-bold text-gray-900">검증</h3>
      </div>

      {/* 반려 사유 */}
      {status === 'rejected' && adminNote && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700 font-medium">반려 사유</p>
          <p className="text-sm text-red-600 mt-1">{adminNote}</p>
        </div>
      )}

      {/* 제출 완료 대기 */}
      {status === 'submitted' && evidenceUrl && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <p className="text-sm text-blue-700 font-medium">증빙이 제출되었습니다</p>
          <p className="text-xs text-blue-600 mt-1">관리자 검토를 기다려주세요.</p>
        </div>
      )}

      {/* 퀴즈 */}
      {definition.verificationType === 'quiz' && status !== 'submitted' && (
        <div>
          <p className="text-sm text-gray-600 mb-4">
            학습 내용을 확인하는 퀴즈입니다. 통과하면 이 모듈이 완료됩니다.
          </p>
          <LegalQuiz
            ptUserId={ptUserId}
            stepKey={definition.key}
            onComplete={onQuizComplete}
            loading={loading}
          />
        </div>
      )}

      {/* 증빙 업로드 */}
      {definition.verificationType === 'evidence_upload' && status !== 'submitted' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{definition.description}</p>

          {previewUrl && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <img src={previewUrl} alt="미리보기" className="w-full h-48 object-contain bg-gray-50" />
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex-1 py-3 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-2"
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
                className="px-6 py-3 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition disabled:opacity-50"
              >
                {loading ? '제출 중...' : '제출'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 셀프 체크 */}
      {definition.verificationType === 'self_check' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{definition.description}</p>
          <button
            type="button"
            onClick={onSelfCheck}
            disabled={loading}
            className="w-full py-3 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            {loading ? '처리 중...' : '확인 완료'}
          </button>
        </div>
      )}

      {/* 자동 연동 */}
      {definition.verificationType === 'auto_linked' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {definition.autoLinkSource === 'contract'
              ? '계약서 서명이 완료되면 자동으로 반영됩니다.'
              : '첫 매출 정산이 제출되면 자동으로 반영됩니다.'}
          </p>
          <Link
            href={definition.autoLinkSource === 'contract' ? '/my/contract' : '/my/report'}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition"
          >
            {definition.autoLinkSource === 'contract' ? '계약서 페이지로 이동' : '매출 정산 페이지로 이동'}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
