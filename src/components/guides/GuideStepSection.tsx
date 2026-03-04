'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Lightbulb, AlertTriangle, ZoomIn } from 'lucide-react';
import type { GuideStep } from '@/lib/data/guides';
import GuideCopyBlock from './GuideCopyBlock';

interface DbImage {
  id: string;
  step_index: number;
  image_url: string;
  alt_text: string;
  caption: string | null;
  display_order: number;
}

interface GuideStepSectionProps {
  steps: GuideStep[];
  articleId?: string;
}

export default function GuideStepSection({ steps, articleId }: GuideStepSectionProps) {
  const [openSteps, setOpenSteps] = useState<Set<number>>(() => new Set([0]));
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [dbImages, setDbImages] = useState<DbImage[]>([]);
  const [hiddenSet, setHiddenSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!articleId) return;
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

                {/* 이미지 (정적 + DB 업로드) */}
                {(() => {
                  const staticImgs = (step.images || []).filter((_, j) => !hiddenSet.has(`${i}-${j}`));
                  const uploadedImgs = dbImagesByStep.get(i) || [];
                  const allImages = [
                    ...staticImgs.map((img, j) => ({ key: `s-${j}`, src: img.src, alt: img.alt, caption: img.caption })),
                    ...uploadedImgs.map((img) => ({ key: `db-${img.id}`, src: img.image_url, alt: img.alt_text, caption: img.caption })),
                  ];
                  if (allImages.length === 0) return null;
                  return (
                    <div className={`grid gap-3 mt-2 ${allImages.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                      {allImages.map((img) => (
                        <div key={img.key} className="group relative">
                          <button
                            type="button"
                            onClick={() => setZoomedImage(img.src)}
                            className="w-full rounded-lg overflow-hidden border border-gray-200 hover:border-gray-400 transition cursor-zoom-in"
                          >
                            <img
                              src={img.src}
                              alt={img.alt}
                              className="w-full h-auto object-contain bg-gray-50"
                              loading="lazy"
                            />
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition bg-black/50 text-white p-1.5 rounded-lg">
                              <ZoomIn className="w-4 h-4" />
                            </div>
                          </button>
                          {img.caption && (
                            <p className="text-xs text-gray-500 mt-1.5 text-center">{img.caption}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}

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
    </>
  );
}
