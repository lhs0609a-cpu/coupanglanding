'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Lightbulb, AlertTriangle } from 'lucide-react';
import type { GuideStep } from '@/lib/data/guides';
import GuideCopyBlock from './GuideCopyBlock';

interface GuideStepSectionProps {
  steps: GuideStep[];
}

export default function GuideStepSection({ steps }: GuideStepSectionProps) {
  const [openSteps, setOpenSteps] = useState<Set<number>>(() => new Set([0]));

  const toggle = (index: number) => {
    setOpenSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const isOpen = openSteps.has(i);
        return (
          <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* 헤더 */}
            <button
              type="button"
              onClick={() => toggle(i)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition"
            >
              <span className="flex items-center justify-center w-7 h-7 bg-[#E31837] text-white text-sm font-bold rounded-full shrink-0">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-gray-900">{step.title}</h4>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{step.description}</p>
              </div>
              {isOpen ? (
                <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              )}
            </button>

            {/* 내용 */}
            {isOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                {/* 번호 리스트 */}
                <ol className="space-y-1.5 pl-4">
                  {step.detailedInstructions.map((instruction, j) => (
                    <li key={j} className="text-sm text-gray-700 list-decimal">
                      {instruction}
                    </li>
                  ))}
                </ol>

                {/* 외부 링크 */}
                {step.externalLink && (
                  <a
                    href={step.externalLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition"
                  >
                    <ExternalLink className="w-4 h-4" />
                    {step.externalLink.label}
                  </a>
                )}

                {/* 팁 */}
                {step.tip && (
                  <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <Lightbulb className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-blue-700">{step.tip}</p>
                  </div>
                )}

                {/* 경고 */}
                {step.warning && (
                  <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-700">{step.warning}</p>
                  </div>
                )}

                {/* 복사 템플릿 */}
                {step.copyableTemplates && step.copyableTemplates.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {step.copyableTemplates.map((tpl, k) => (
                      <GuideCopyBlock key={k} template={tpl} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
