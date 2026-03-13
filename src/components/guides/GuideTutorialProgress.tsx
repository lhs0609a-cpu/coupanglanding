'use client';

interface GuideTutorialProgressProps {
  currentStep: number;
  totalSteps: number;
}

export default function GuideTutorialProgress({
  currentStep,
  totalSteps,
}: GuideTutorialProgressProps) {
  const pct = totalSteps > 0 ? ((currentStep + 1) / totalSteps) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#E31837] rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-semibold text-gray-600 whitespace-nowrap tabular-nums">
        {currentStep + 1}/{totalSteps} 단계
      </span>
    </div>
  );
}
