'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, ImageOff } from 'lucide-react';

interface ViewerImage {
  url: string;
  name?: string;
}

interface BugReportImageViewerProps {
  images: ViewerImage[];
  /** 큰 이미지를 클릭하면 전체화면 라이트박스로 확대 (선택) */
  onZoom?: (index: number) => void;
}

/**
 * 오류문의 상세에서 첨부 스크린샷을 "내용과 함께" 크게 보여주는 인라인 뷰어.
 * - 큰 메인 프리뷰 + 하단 썸네일 스트립으로 즉시 전환 (X 눌러 라이트박스 닫을 필요 없음)
 * - 메인 이미지를 클릭하면 필요 시 전체화면 확대(onZoom)
 * - report별로 remount 되도록 부모에서 key={report.id} 를 주면 index가 자동 초기화됨
 */
export default function BugReportImageViewer({ images, onZoom }: BugReportImageViewerProps) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});

  if (images.length === 0) return null;

  const safeIndex = Math.min(index, images.length - 1);
  const current = images[safeIndex];

  const go = (next: number) => {
    if (next < 0 || next > images.length - 1) return;
    setIndex(next);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 메인 프리뷰 */}
      <div className="relative flex-1 min-h-[280px] bg-gray-900 rounded-xl overflow-hidden flex items-center justify-center group">
        {failed[safeIndex] ? (
          <div className="flex flex-col items-center gap-2 text-gray-400 text-xs">
            <ImageOff className="w-8 h-8" />
            이미지를 불러올 수 없습니다
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.url}
            alt={current.name || `첨부 ${safeIndex + 1}`}
            className={`max-w-full max-h-[420px] object-contain ${onZoom ? 'cursor-zoom-in' : ''}`}
            onError={() => setFailed(prev => ({ ...prev, [safeIndex]: true }))}
            onClick={() => onZoom?.(safeIndex)}
          />
        )}

        {/* 확대 버튼 */}
        {onZoom && !failed[safeIndex] && (
          <button
            type="button"
            onClick={() => onZoom(safeIndex)}
            className="absolute top-2 right-2 p-1.5 bg-black/40 text-white rounded-lg opacity-0 group-hover:opacity-100 transition hover:bg-black/60"
            title="전체화면으로 크게 보기"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}

        {/* 좌우 네비 */}
        {images.length > 1 && (
          <>
            {safeIndex > 0 && (
              <button
                type="button"
                onClick={() => go(safeIndex - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/40 text-white rounded-full hover:bg-black/60 transition"
                aria-label="이전 이미지"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            {safeIndex < images.length - 1 && (
              <button
                type="button"
                onClick={() => go(safeIndex + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/40 text-white rounded-full hover:bg-black/60 transition"
                aria-label="다음 이미지"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-black/50 text-white/90 text-[11px] rounded-full">
              {safeIndex + 1} / {images.length}
            </div>
          </>
        )}
      </div>

      {/* 썸네일 스트립 */}
      {images.length > 1 && (
        <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
          {images.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => go(idx)}
              className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition ${
                idx === safeIndex ? 'border-[#E31837]' : 'border-transparent opacity-60 hover:opacity-100'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.name || `썸네일 ${idx + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
