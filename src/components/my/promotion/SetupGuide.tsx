'use client';

import { CheckCircle, Circle } from 'lucide-react';
import { SETUP_GUIDE_STEPS } from '@/lib/data/promotion-constants';

interface SetupGuideProps {
  completedSteps: number; // 0~4
}

export default function SetupGuide({ completedSteps }: SetupGuideProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-bold text-gray-900 mb-4">설정 가이드</h3>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#E31837] rounded-full transition-all duration-500"
            style={{ width: `${(completedSteps / 4) * 100}%` }}
          />
        </div>
        <span className="text-xs font-medium text-gray-500">{completedSteps}/4</span>
      </div>
      <div className="space-y-3">
        {SETUP_GUIDE_STEPS.map((step) => {
          const done = step.step <= completedSteps;
          return (
            <div key={step.step} className="flex items-start gap-3">
              {done ? (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`text-sm font-medium ${done ? 'text-gray-900' : 'text-gray-500'}`}>
                  {step.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{step.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
