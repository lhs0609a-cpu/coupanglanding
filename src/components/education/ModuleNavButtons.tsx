import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ModuleNavButtonsProps {
  currentSlide: number;
  totalSlides: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function ModuleNavButtons({
  currentSlide,
  totalSlides,
  onPrev,
  onNext,
}: ModuleNavButtonsProps) {
  const isFirst = currentSlide === 0;
  const isLast = currentSlide === totalSlides - 1;

  return (
    <div className="flex items-center justify-between pt-4">
      <button
        type="button"
        onClick={onPrev}
        disabled={isFirst}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed rounded-lg hover:bg-gray-100 transition"
      >
        <ChevronLeft className="w-4 h-4" />
        이전
      </button>

      {/* Slide dots */}
      <div className="flex items-center gap-1.5">
        {Array.from({ length: totalSlides }, (_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === currentSlide ? 'bg-[#E31837]' : i < currentSlide ? 'bg-[#E31837]/40' : 'bg-gray-300'
            }`}
          />
        ))}
      </div>

      {!isLast ? (
        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[#E31837] hover:text-[#c01530] rounded-lg hover:bg-red-50 transition"
        >
          다음
          <ChevronRight className="w-4 h-4" />
        </button>
      ) : (
        <span className="px-4 py-2 text-xs text-gray-400">마지막 단계</span>
      )}
    </div>
  );
}
