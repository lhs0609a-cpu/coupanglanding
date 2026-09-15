'use client';

import { useEffect, useState } from 'react';
import { X, Play, ImageOff } from 'lucide-react';

/**
 * 답변에 딸려오는 화면 캡처 / 교육 영상 렌더러.
 *
 * - 이미지: 썸네일로 깔고, 클릭하면 전체 화면 라이트박스. 로드 실패하면 조용히 자리만 차지하지 않고 사라진다.
 * - 유튜브: 썸네일 + 재생 버튼 → 클릭해야 iframe 을 붙인다.
 *   (상담 패널이 열릴 때마다 iframe 여러 개를 미리 붙이면 느려지고, 자동재생이 사용자를 놀래킨다.)
 * - mp4: 클릭 후 <video controls>.
 *
 * next/image 를 쓰지 않는 이유 — 캡처 URL 호스트가 가이드마다 제각각이고
 * next.config 의 remotePatterns 에 전부 등록돼 있지 않다. 여기서는 원본을 그대로 띄운다.
 */

export interface MediaItem {
  kind: 'image' | 'youtube' | 'video';
  src: string;
  caption?: string;
  alt?: string;
}

export default function MediaBlock({ items }: { items: MediaItem[] }) {
  const [lightbox, setLightbox] = useState<MediaItem | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const visible = items.filter((m) => !broken.has(m.src));
  if (!visible.length) return null;

  return (
    <>
      <div className="space-y-2">
        {visible.map((m, i) => {
          if (m.kind === 'image') {
            return (
              <button
                key={`${m.src}-${i}`}
                type="button"
                onClick={() => setLightbox(m)}
                className="block w-full overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition hover:border-[#E31837]/40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.src}
                  alt={m.alt || m.caption || '화면 캡처'}
                  loading="lazy"
                  onError={() => setBroken((prev) => new Set(prev).add(m.src))}
                  className="max-h-56 w-full object-contain bg-gray-50"
                />
                {m.caption && (
                  <div className="px-2.5 py-1.5 text-[11.5px] text-gray-600">{m.caption}</div>
                )}
              </button>
            );
          }

          const isPlaying = playing === m.src;

          if (m.kind === 'youtube') {
            return (
              <div key={`${m.src}-${i}`} className="overflow-hidden rounded-xl border border-gray-200 bg-black">
                {isPlaying ? (
                  <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${m.src}?autoplay=1&rel=0`}
                      title={m.caption || '교육 영상'}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="absolute inset-0 h-full w-full"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPlaying(m.src)}
                    className="group relative block w-full"
                    aria-label={`${m.caption || '교육 영상'} 재생`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://i.ytimg.com/vi/${m.src}/hqdefault.jpg`}
                      alt={m.caption || '교육 영상'}
                      loading="lazy"
                      onError={() => setBroken((prev) => new Set(prev).add(m.src))}
                      className="w-full object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition group-hover:bg-black/15">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 shadow-lg">
                        <Play className="ml-0.5 h-5 w-5 fill-[#E31837] text-[#E31837]" />
                      </span>
                    </span>
                  </button>
                )}
                {m.caption && (
                  <div className="bg-white px-2.5 py-1.5 text-[11.5px] text-gray-600">{m.caption}</div>
                )}
              </div>
            );
          }

          // mp4 등 직접 재생
          return (
            <div key={`${m.src}-${i}`} className="overflow-hidden rounded-xl border border-gray-200 bg-black">
              {isPlaying ? (
                <video src={m.src} controls autoPlay className="w-full" />
              ) : (
                <button
                  type="button"
                  onClick={() => setPlaying(m.src)}
                  className="flex w-full items-center justify-center gap-2 bg-gray-900 py-7 text-sm font-medium text-white"
                >
                  <Play className="h-4 w-4 fill-white" />
                  영상 재생
                </button>
              )}
              {m.caption && (
                <div className="bg-white px-2.5 py-1.5 text-[11.5px] text-gray-600">{m.caption}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* 라이트박스 */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightbox(null)}
          role="presentation"
        >
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <figure className="max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.src}
              alt={lightbox.alt || lightbox.caption || '화면 캡처'}
              className="max-h-[80vh] w-auto rounded-lg object-contain"
            />
            {lightbox.caption && (
              <figcaption className="mt-2 text-center text-sm text-white/80">{lightbox.caption}</figcaption>
            )}
          </figure>
        </div>
      )}
    </>
  );
}

/** 이미지가 전부 깨졌을 때 자리표시 (현재는 사용처 없음 — 확장 대비) */
export function MediaFallback() {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-2 text-[11.5px] text-gray-400">
      <ImageOff className="h-3.5 w-3.5" /> 이미지를 불러오지 못했습니다.
    </div>
  );
}
