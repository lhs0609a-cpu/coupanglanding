'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ArrowLeft, BookOpen } from 'lucide-react';
import type { GuideStep } from '@/lib/data/guides';
import GuideTutorialProgress from './GuideTutorialProgress';
import GuideTutorialStep from './GuideTutorialStep';
import GuideTutorialQuiz from './GuideTutorialQuiz';
import {
  getGuideTutorialState,
  markStepCompleted,
  saveTutorialState,
  getEncouragementMessage,
} from '@/lib/utils/guide-tutorial-progress';

interface DbImage {
  id: string;
  step_index: number;
  image_url: string;
  alt_text: string;
  caption: string | null;
  display_order: number;
}

type Phase = 'tutorial' | 'quiz' | 'complete';

interface GuideTutorialModeProps {
  articleId: string;
  title: string;
  steps: GuideStep[];
  onSwitchToRead: () => void;
}

export default function GuideTutorialMode({
  articleId,
  title,
  steps,
  onSwitchToRead,
}: GuideTutorialModeProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right' | 'none'>('none');
  const [phase, setPhase] = useState<Phase>('tutorial');
  const [encouragement, setEncouragement] = useState<string | null>(null);
  const [resumeMsg, setResumeMsg] = useState<string | null>(null);

  // DB images
  const [dbImages, setDbImages] = useState<DbImage[]>([]);
  const [hiddenSet, setHiddenSet] = useState<Set<string>>(new Set());

  const touchRef = useRef({ startX: 0, startY: 0 });

  // 진행 복원
  useEffect(() => {
    const state = getGuideTutorialState(articleId);
    if (state && state.lastStepIndex > 0 && state.lastStepIndex < steps.length) {
      setCurrentStep(state.lastStepIndex);
      setResumeMsg(`지난번에 ${state.lastStepIndex + 1}단계까지 했어요. 이어서 진행합니다!`);
      setTimeout(() => setResumeMsg(null), 3000);
    }
  }, [articleId, steps.length]);

  // 이미지 로드
  useEffect(() => {
    fetch(`/api/guide-images?articleId=${articleId}`)
      .then((res) => res.json())
      .then((data) => {
        setDbImages(data.images || []);
        const hidden = (data.hiddenStaticImages || []) as { step_index: number; image_index: number }[];
        setHiddenSet(new Set(hidden.map((h) => `${h.step_index}-${h.image_index}`)));
      })
      .catch(() => {
        setDbImages([]);
        setHiddenSet(new Set());
      });
  }, [articleId]);

  const dbImagesByStep = useMemo(() => {
    const map = new Map<number, DbImage[]>();
    dbImages.forEach((img) => {
      const list = map.get(img.step_index) || [];
      list.push(img);
      map.set(img.step_index, list);
    });
    return map;
  }, [dbImages]);

  const getImagesForStep = useCallback(
    (stepIdx: number) => {
      const step = steps[stepIdx];
      const staticImgs = (step.images || []).filter((_, j) => !hiddenSet.has(`${stepIdx}-${j}`));
      const uploadedImgs = dbImagesByStep.get(stepIdx) || [];
      return [
        ...staticImgs.map((img, j) => ({ key: `s-${j}`, src: img.src, alt: img.alt, caption: img.caption })),
        ...uploadedImgs.map((img) => ({ key: `db-${img.id}`, src: img.image_url, alt: img.alt_text, caption: img.caption })),
      ];
    },
    [steps, hiddenSet, dbImagesByStep],
  );

  const hasQuiz = useMemo(
    () => steps.some((s) => s.tip || s.warning),
    [steps],
  );

  const goNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      markStepCompleted(articleId, currentStep);
      const nextStep = currentStep + 1;
      setDirection('right');
      setCurrentStep(nextStep);

      const msg = getEncouragementMessage(nextStep, steps.length);
      if (msg) {
        setEncouragement(msg);
        setTimeout(() => setEncouragement(null), 2500);
      }

      saveTutorialState(articleId, {
        completedSteps: Array.from({ length: nextStep }, (_, i) => i),
        lastStepIndex: nextStep,
        updatedAt: Date.now(),
      });
    } else {
      // 마지막 스텝 완료
      markStepCompleted(articleId, currentStep);
      if (hasQuiz) {
        setPhase('quiz');
      } else {
        setPhase('complete');
      }
    }
  }, [currentStep, steps.length, articleId, hasQuiz]);

  const goPrev = useCallback(() => {
    if (currentStep > 0) {
      setDirection('left');
      setCurrentStep((p) => p - 1);
    }
  }, [currentStep]);

  // 키보드 네비게이션
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phase !== 'tutorial') return;
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, phase]);

  // 모바일 스와이프 (컨테이너 레벨)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (phase !== 'tutorial') return;
      const dx = e.changedTouches[0].clientX - touchRef.current.startX;
      const dy = e.changedTouches[0].clientY - touchRef.current.startY;
      // 가로 스와이프가 세로보다 큰 경우만
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) goNext();
        else goPrev();
      }
    },
    [goNext, goPrev, phase],
  );

  // 완료 화면
  if (phase === 'complete') {
    return (
      <div className="max-w-xl mx-auto text-center py-12 space-y-6 animate-fade-in-up">
        <div className="text-6xl animate-bounce-in">🎉</div>
        <h2 className="text-2xl font-bold text-gray-900">축하합니다!</h2>
        <p className="text-gray-600">
          &ldquo;{title}&rdquo; 가이드를 모두 완료했어요.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={onSwitchToRead}
            className="px-6 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            <BookOpen className="w-4 h-4 inline mr-2" />
            전체 내용 보기
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="px-6 py-3 bg-[#E31837] text-white font-bold rounded-xl hover:bg-[#c01530] transition"
          >
            가이드 목록으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // 퀴즈 화면
  if (phase === 'quiz') {
    return (
      <div className="max-w-xl mx-auto">
        <GuideTutorialQuiz
          steps={steps}
          onComplete={() => setPhase('complete')}
          onSkip={() => setPhase('complete')}
        />
      </div>
    );
  }

  // 튜토리얼 메인
  return (
    <div
      className="max-w-2xl mx-auto space-y-4"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 이어하기 메시지 */}
      {resumeMsg && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm px-4 py-2.5 rounded-lg animate-fade-in-up">
          📌 {resumeMsg}
        </div>
      )}

      {/* 격려 메시지 */}
      {encouragement && (
        <div className="text-center py-2 animate-bounce-in">
          <span className="inline-block bg-gray-900 text-white text-sm px-4 py-2 rounded-full">
            {encouragement}
          </span>
        </div>
      )}

      {/* 진행 바 */}
      <GuideTutorialProgress currentStep={currentStep} totalSteps={steps.length} />

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={currentStep > 0 ? goPrev : () => window.history.back()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          {currentStep > 0 ? '이전' : '뒤로'}
        </button>

        <h3 className="text-sm font-medium text-gray-700 truncate max-w-[50%] text-center">
          {title}
        </h3>

        <button
          type="button"
          onClick={onSwitchToRead}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition"
        >
          <BookOpen className="w-4 h-4" />
          읽기모드
        </button>
      </div>

      {/* 스텝 콘텐츠 */}
      <div key={currentStep}>
        <GuideTutorialStep
          step={steps[currentStep]}
          stepIndex={currentStep}
          images={getImagesForStep(currentStep)}
          direction={direction}
        />
      </div>

      {/* CTA 버튼 */}
      <div className="pt-2 pb-6">
        <button
          type="button"
          onClick={goNext}
          className="w-full py-4 bg-green-500 hover:bg-green-600 text-white text-lg font-bold rounded-2xl transition active:scale-[0.98] shadow-lg shadow-green-500/30 animate-step-complete-pulse"
        >
          {currentStep < steps.length - 1 ? '이해했어요! ✅ →' : '완료! 🎉'}
        </button>
      </div>
    </div>
  );
}
