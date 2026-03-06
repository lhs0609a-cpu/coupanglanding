'use client';

import { useState } from 'react';
import type { OnboardingStepDefinition } from '@/lib/supabase/types';
import type { TutorialStepContent } from '@/lib/data/onboarding-tutorials';
import type { ComputedStepStatus } from '@/components/onboarding/onboarding-utils';
import ModuleProgressBar from './ModuleProgressBar';
import ModuleNavButtons from './ModuleNavButtons';
import ModuleSlideCard from './ModuleSlideCard';
import ModuleVerificationSlide from './ModuleVerificationSlide';

interface ModuleSlideViewProps {
  definition: OnboardingStepDefinition;
  tutorial: TutorialStepContent;
  status: ComputedStepStatus;
  adminNote: string | null;
  evidenceUrl: string | null;
  ptUserId: string;
  onSelfCheck: () => Promise<void>;
  onEvidenceSubmit: (file: File) => Promise<void>;
  onQuizComplete: () => Promise<void>;
  loading: boolean;
}

export default function ModuleSlideView({
  definition,
  tutorial,
  status,
  adminNote,
  evidenceUrl,
  ptUserId,
  onSelfCheck,
  onEvidenceSubmit,
  onQuizComplete,
  loading,
}: ModuleSlideViewProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  // Slides: [overview] + [substeps...] + [verification]
  const subStepCount = tutorial.subSteps.length;
  const totalSlides = 1 + subStepCount + 1; // overview + substeps + verification

  const handlePrev = () => setCurrentSlide((s) => Math.max(0, s - 1));
  const handleNext = () => setCurrentSlide((s) => Math.min(totalSlides - 1, s + 1));

  const renderSlide = () => {
    // Slide 0: Overview
    if (currentSlide === 0) {
      return (
        <div className="bg-white border border-gray-200 rounded-xl p-6 min-h-[300px]">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">{tutorial.icon}</span>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{definition.label}</h2>
              <p className="text-sm text-[#E31837] font-medium">{tutorial.tagline}</p>
            </div>
          </div>
          <p className="text-gray-600 mb-4">{tutorial.overview}</p>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>예상 소요시간: {tutorial.estimatedTotalTime}</span>
            <span>학습 단계: {subStepCount}개</span>
          </div>
        </div>
      );
    }

    // Last slide: Verification
    if (currentSlide === totalSlides - 1) {
      return (
        <ModuleVerificationSlide
          definition={definition}
          status={status}
          adminNote={adminNote}
          evidenceUrl={evidenceUrl}
          ptUserId={ptUserId}
          onSelfCheck={onSelfCheck}
          onEvidenceSubmit={onEvidenceSubmit}
          onQuizComplete={onQuizComplete}
          loading={loading}
        />
      );
    }

    // Middle slides: SubSteps
    const subStepIndex = currentSlide - 1;
    return (
      <ModuleSlideCard
        subStep={tutorial.subSteps[subStepIndex]}
        index={subStepIndex}
      />
    );
  };

  return (
    <div className="space-y-4">
      <ModuleProgressBar current={currentSlide + 1} total={totalSlides} />

      {renderSlide()}

      <ModuleNavButtons
        currentSlide={currentSlide}
        totalSlides={totalSlides}
        onPrev={handlePrev}
        onNext={handleNext}
      />
    </div>
  );
}
