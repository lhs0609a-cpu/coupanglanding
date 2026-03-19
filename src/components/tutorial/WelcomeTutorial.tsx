'use client';

import { useState, useEffect, useCallback } from 'react';
import { isWelcomeSeen, markWelcomeSeen } from '@/lib/utils/tutorial-progress';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

const WELCOME_SLIDES = [
  {
    emoji: '👋',
    title: '환영합니다!',
    description: '쿠팡 메가로드 PT 코칭 대시보드에 오신 것을 환영합니다. 이곳에서 셀러 활동의 모든 것을 관리할 수 있습니다.',
  },
  {
    emoji: '🎓',
    title: '먼저 교육부터!',
    description: '12단계 교육 과정을 완료하면 쿠팡 셀러의 핵심 역량을 갖출 수 있습니다. 교육 완료 후 정산 및 기타 기능이 활성화됩니다.',
  },
  {
    emoji: '📱',
    title: '대시보드 구성',
    description: '좌측 사이드바에서 15개의 기능 메뉴를 이용할 수 있습니다. 매출 정산, 교육, 트렌드, 운영 가이드 등 다양한 도구가 준비되어 있어요.',
  },
  {
    emoji: '🎮',
    title: '게임처럼 즐기세요!',
    description: '각 기능의 튜토리얼을 완료하면 XP를 획득합니다. 총 365 XP를 모아 모든 기능을 마스터하세요! 오른쪽 하단 ? 버튼으로 언제든 튜토리얼을 다시 볼 수 있어요.',
  },
  {
    emoji: '🚀',
    title: '시작할 준비 되셨나요?',
    description: '교육 센터에서 첫 번째 교육을 시작해보세요. 단계별로 안내해드리겠습니다!',
    cta: true,
  },
];

export default function WelcomeTutorial() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;

    if (!isWelcomeSeen()) {
      const timer = setTimeout(() => setIsOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    markWelcomeSeen();
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep < WELCOME_SLIDES.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleClose();
    }
  }, [currentStep, handleClose]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

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

  if (!mounted || !isOpen) return null;

  const slide = WELCOME_SLIDES[currentStep];
  const isLast = currentStep === WELCOME_SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* 배경 딤 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* 모달 */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in-up">
        {/* 상단 그라디언트 바 */}
        <div className="h-1 bg-gradient-to-r from-[#E31837] via-[#ff4d6a] to-[#f97316]" />

        {/* 닫기 */}
        <div className="flex justify-end px-5 pt-4">
          <button
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="px-8 pb-4 pt-2 flex flex-col items-center text-center min-h-[280px] justify-center">
          <div className="text-5xl mb-5 animate-float">{slide.emoji}</div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">{slide.title}</h3>
          <p className="text-gray-600 text-sm leading-relaxed max-w-md mb-6">
            {slide.description}
          </p>

          {/* 마지막 슬라이드: 교육 시작 CTA */}
          {slide.cta && (
            <Link
              href="/my/education"
              onClick={handleClose}
              className="btn-cta px-6 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2"
            >
              🎓 교육 시작하기
            </Link>
          )}

          {/* 진행 dots */}
          <div className="flex items-center gap-1.5 mt-4">
            {WELCOME_SLIDES.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? 'w-6 bg-[#E31837]'
                    : i < currentStep
                      ? 'w-1.5 bg-[#E31837]/40'
                      : 'w-1.5 bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* 네비게이션 */}
        <div className="flex items-center justify-between px-8 pb-6">
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            이전
          </button>

          <span className="text-xs text-gray-400">
            {currentStep + 1} / {WELCOME_SLIDES.length}
          </span>

          {!isLast ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-1 text-sm font-bold text-[#E31837] hover:text-[#c41230] transition-colors"
            >
              다음
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleClose}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              건너뛰기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
