import TutorialSubStepView from '@/components/onboarding/TutorialSubStepView';
import type { TutorialSubStep } from '@/lib/data/onboarding-tutorials';

interface ModuleSlideCardProps {
  subStep: TutorialSubStep;
  index: number;
}

export default function ModuleSlideCard({ subStep, index }: ModuleSlideCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 min-h-[300px]">
      <TutorialSubStepView subStep={subStep} index={index} />
    </div>
  );
}
