'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTutorialByKey } from '@/lib/data/feature-tutorials';
import {
  isFirstVisit,
  markVisited,
  isTutorialCompleted,
  completeTutorial,
} from '@/lib/utils/tutorial-progress';
import TutorialSlide from './TutorialSlide';
import TutorialCelebration from './TutorialCelebration';
import TutorialHelpButton from './TutorialHelpButton';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface FeatureTutorialProps {
  featureKey: string;
}

export default function FeatureTutorial({ featureKey }: FeatureTutorialProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [mounted, setMounted] = useState(false);

  const tutorial = getTutorialByKey(featureKey);

  useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;

    setCompleted(isTutorialCompleted(featureKey));

    // 첫 방문 시 자동 표시
    if (isFirstVisit(featureKey)) {
      const timer = setTimeout(() => {
        setIsOpen(true);
        markVisited(featureKey);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [featureKey]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setCurrentStep(0);
    setShowCelebration(false);
  }, []);

  const handleNext = useCallback(() => {
    if (!tutorial) return;

    if (currentStep < tutorial.steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // 마지막 스텝 → 완료
      if (!isTutorialCompleted(featureKey)) {
        completeTutorial(featureKey, tutorial.xp);
        setCompleted(true);
        setShowCelebration(true);
      } else {
        handleClose();
      }
    }
  }, [currentStep, tutorial, featureKey, handleClose]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleReopen = useCallback(() => {
    setCurrentStep(0);
    setShowCelebration(false);
    setIsOpen(true);
  }, []);

  // ESC 키로 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose, handleNext, handlePrev]);

  if (!tutorial || !mounted) return null;

  const isLastStep = currentStep === tutorial.steps.length - 1;

  return (
    <>
      {/* 플로팅 도움말 버튼 */}
      <TutorialHelpButton onClick={handleReopen} />

      {/* 모달 오버레이 */}
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* 배경 딤 */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* 모달 */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in-up">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 pt-5 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{tutorial.icon}</span>
                <span className="text-sm font-bold text-gray-700">{tutorial.name}</span>
                {completed && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    ✓ 완료
                  </span>
                )}
              </div>
              <button
                onClick={handleClose}
                className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 콘텐츠 */}
            <div className="px-6 py-6 min-h-[280px] flex items-center justify-center">
              {showCelebration ? (
                <TutorialCelebration
                  xp={tutorial.xp}
                  featureName={tutorial.name}
                  onClose={handleClose}
                />
              ) : (
                <TutorialSlide
                  step={tutorial.steps[currentStep]}
                  current={currentStep}
                  total={tutorial.steps.length}
                />
              )}
            </div>

            {/* 하단 네비게이션 */}
            {!showCelebration && (
              <div className="flex items-center justify-between px-6 pb-5">
                <button
                  onClick={handlePrev}
                  disabled={currentStep === 0}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  이전
                </button>

                <span className="text-xs text-gray-400">
                  {currentStep + 1} / {tutorial.steps.length}
                </span>

                <button
                  onClick={handleNext}
                  className="flex items-center gap-1 text-sm font-bold text-[#E31837] hover:text-[#c41230] transition-colors"
                >
                  {isLastStep ? (completed ? '닫기' : '완료하기 ✨') : '다음'}
                  {!isLastStep && <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
