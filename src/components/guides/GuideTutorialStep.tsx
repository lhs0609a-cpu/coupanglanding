'use client';

import { useState, useRef, useCallback } from 'react';
import { ExternalLink, Lightbulb, AlertTriangle, ZoomIn, ChevronLeft, ChevronRight } from 'lucide-react';
import type { GuideStep } from '@/lib/data/guides';
import GuideCopyBlock from './GuideCopyBlock';

interface StepImage {
  key: string;
  src: string;
  alt: string;
  caption?: string | null;
}

interface GuideTutorialStepProps {
  step: GuideStep;
  stepIndex: number;
  images: StepImage[];
  direction: 'left' | 'right' | 'none';
}

export default function GuideTutorialStep({
  step,
  stepIndex,
  images,
  direction,
}: GuideTutorialStepProps) {
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const touchStartX = useRef(0);

  const slideAnim =
    direction === 'none'
      ? 'animate-fade-in-up'
      : direction === 'right'
        ? 'animate-slide-in-right'
        : 'animate-slide-in-left';

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const diff = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(diff) > 50) {
        if (diff < 0 && carouselIdx < images.length - 1) {
          setCarouselIdx((p) => p + 1);
        } else if (diff > 0 && carouselIdx > 0) {
          setCarouselIdx((p) => p - 1);
        }
      }
    },
    [carouselIdx, images.length],
  );

  return (
    <>
      {/* 이미지 확대 모달 */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full">
            <img
              src={zoomedImage}
              alt="확대 이미지"
              className="w-full h-auto max-h-[85vh] object-contain rounded-lg"
            />
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white text-gray-700 rounded-full shadow-lg flex items-center justify-center hover:bg-gray-100 transition text-lg font-bold"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      <div className={`space-y-5 ${slideAnim}`}>
        {/* 스텝 번호 + 제목 */}
        <div className="text-center space-y-2">
          <span className="inline-flex items-center justify-center w-12 h-12 bg-[#E31837] text-white text-xl font-bold rounded-full animate-bounce-in">
            {stepIndex + 1}
          </span>
          <h2 className="text-xl font-bold text-gray-900">{step.title}</h2>
          <p className="text-sm text-gray-500">{step.description}</p>
        </div>

        {/* 이미지 영역 (캐러셀) */}
        {images.length > 0 && (
          <div className="relative">
            <div
              className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
              style={{ minHeight: '200px', maxHeight: '60vh' }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <button
                type="button"
                onClick={() => setZoomedImage(images[carouselIdx].src)}
                className="w-full cursor-zoom-in group"
              >
                <img
                  src={images[carouselIdx].src}
                  alt={images[carouselIdx].alt}
                  className="w-full h-auto max-h-[60vh] object-contain transition-opacity duration-300"
                  loading="lazy"
                />
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition bg-black/50 text-white p-2 rounded-lg">
                  <ZoomIn className="w-5 h-5" />
                </div>
              </button>
            </div>

            {/* 캐러셀 좌우 버튼 */}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setCarouselIdx((p) => Math.max(0, p - 1))}
                  disabled={carouselIdx === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 rounded-full shadow flex items-center justify-center disabled:opacity-30 hover:bg-white transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCarouselIdx((p) => Math.min(images.length - 1, p + 1))}
                  disabled={carouselIdx === images.length - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 rounded-full shadow flex items-center justify-center disabled:opacity-30 hover:bg-white transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                {/* 점 인디케이터 */}
                <div className="flex justify-center gap-1.5 mt-3">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCarouselIdx(i)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        i === carouselIdx
                          ? 'bg-[#E31837] w-4'
                          : 'bg-gray-300 hover:bg-gray-400'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}

            {/* 캡션 */}
            {images[carouselIdx]?.caption && (
              <p className="text-xs text-gray-500 mt-2 text-center">
                {images[carouselIdx].caption}
              </p>
            )}
          </div>
        )}

        {/* 설명 (fade-in 애니메이션) */}
        <ol className="space-y-2 pl-4">
          {step.detailedInstructions.map((instruction, j) => (
            <li
              key={j}
              className="text-sm text-gray-700 list-decimal animate-instruction-reveal"
              style={{ animationDelay: `${j * 0.1}s` }}
            >
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
          <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <Lightbulb className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">{step.tip}</p>
          </div>
        )}

        {/* 경고 */}
        {step.warning && (
          <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">{step.warning}</p>
          </div>
        )}

        {/* 복사 템플릿 */}
        {step.copyableTemplates && step.copyableTemplates.length > 0 && (
          <div className="space-y-2">
            {step.copyableTemplates.map((tpl, k) => (
              <GuideCopyBlock key={k} template={tpl} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
