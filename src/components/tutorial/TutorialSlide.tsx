'use client';

import type { TutorialStep } from '@/lib/data/feature-tutorials';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface TutorialSlideProps {
  step: TutorialStep;
  current: number;
  total: number;
}

export default function TutorialSlide({ step, current, total }: TutorialSlideProps) {
  return (
    <div className="flex flex-col items-center text-center px-2">
      {/* 이모지 */}
      <div className="text-5xl mb-4 animate-float">{step.emoji}</div>

      {/* 제목 */}
      <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>

      {/* 설명 */}
      <p className="text-gray-600 text-sm leading-relaxed max-w-md mb-4">
        {step.description}
      </p>

      {/* 프로 팁 */}
      {step.proTip && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-4 max-w-md">
          <p className="text-xs text-amber-800">
            <span className="font-bold">💡 Pro Tip:</span> {step.proTip}
          </p>
        </div>
      )}

      {/* 관련 링크 */}
      {step.relatedLink && (
        <Link
          href={step.relatedLink.href}
          className="inline-flex items-center gap-1.5 text-sm text-[#E31837] hover:text-[#c41230] font-medium transition-colors"
        >
          {step.relatedLink.label}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}

      {/* 진행 dots */}
      <div className="flex items-center gap-1.5 mt-6">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === current
                ? 'w-6 bg-[#E31837]'
                : i < current
                  ? 'w-1.5 bg-[#E31837]/40'
                  : 'w-1.5 bg-gray-200'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
