import { ExternalLink, Lightbulb, AlertTriangle } from 'lucide-react';
import type { TutorialSubStep } from '@/lib/data/onboarding-tutorials';

interface TutorialSubStepViewProps {
  subStep: TutorialSubStep;
  index: number;
}

export default function TutorialSubStepView({ subStep, index }: TutorialSubStepViewProps) {
  return (
    <div className="space-y-3">
      {/* 제목 + 설명 */}
      <div>
        <h4 className="text-sm font-bold text-gray-900">
          {index + 1}. {subStep.title}
        </h4>
        <p className="text-sm text-gray-600 mt-1">{subStep.description}</p>
      </div>

      {/* 상세 안내 (번호 리스트) */}
      <ol className="space-y-1.5 pl-4">
        {subStep.detailedInstructions.map((instruction, i) => (
          <li key={i} className="text-sm text-gray-700 list-decimal">
            {instruction}
          </li>
        ))}
      </ol>

      {/* 외부 링크 버튼 */}
      {subStep.externalLink && (
        <a
          href={subStep.externalLink.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition"
        >
          <ExternalLink className="w-4 h-4" />
          {subStep.externalLink.label}
        </a>
      )}

      {/* 팁 박스 */}
      {subStep.tip && (
        <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <Lightbulb className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">{subStep.tip}</p>
        </div>
      )}

      {/* 주의사항 박스 */}
      {subStep.warning && (
        <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">{subStep.warning}</p>
        </div>
      )}
    </div>
  );
}
