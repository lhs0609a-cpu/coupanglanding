'use client';

import { useState } from 'react';

/**
 * 가이드 캡처 위에 번호 배지(핫스팟)를 얹는 이미지 뷰어.
 *
 * 왜 필요한가: 캡처에 빨간 박스는 구워져 있지만 "어느 것부터 누르는지"를 나타낼 수 없다.
 * 초보자는 박스가 두 개 이상이면 순서를 모른다. 번호 배지를 좌표로 얹어 ①②③ 를 만든다.
 *
 * 좌표는 이미지 기준 백분율(0~100)이라 이미지 크기가 바뀌어도 따라간다.
 * 배지를 누르면 해당 설명이 뜨고, 이미지를 누르면 확대된다.
 */

export interface Hotspot {
  /** 배지에 찍힐 번호 */
  n: number;
  /** 이미지 좌상단 기준 가로 위치 (0~100 %) */
  x: number;
  /** 이미지 좌상단 기준 세로 위치 (0~100 %) */
  y: number;
  /** 배지를 눌렀을 때 뜨는 설명 */
  label: string;
}

interface Props {
  src: string;
  alt: string;
  hotspots?: Hotspot[];
  /** 캡처 출처 표기 (없으면 문구 자체를 생략한다) */
  source?: string;
  /** 이미지 최대 높이 (기본 520px) */
  maxHeight?: number;
}

export default function GuideImageWithHotspots({
  src, alt, hotspots = [], source, maxHeight = 520,
}: Props) {
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  if (error) return null;

  const activeSpot = hotspots.find((h) => h.n === active) ?? null;

  return (
    <figure className="m-0">
      <div className="relative inline-block w-full">
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="block w-full cursor-zoom-in"
          title="크게 보기"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            loading="lazy"
            onError={() => setError(true)}
            className="w-full object-contain bg-gray-50 rounded-lg"
            style={{ maxHeight }}
          />
        </button>

        {/* 번호 배지 — 이미지 위에 절대 위치 */}
        {hotspots.map((h) => (
          <button
            key={h.n}
            type="button"
            onClick={(e) => { e.stopPropagation(); setActive(active === h.n ? null : h.n); }}
            aria-label={`${h.n}번: ${h.label}`}
            className={`absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-xs font-bold
              flex items-center justify-center shadow-lg ring-2 ring-white transition
              ${active === h.n ? 'bg-blue-600 text-white scale-110' : 'bg-[#E31837] text-white hover:scale-110'}`}
            style={{ left: `${h.x}%`, top: `${h.y}%` }}
          >
            {h.n}
          </button>
        ))}
      </div>

      {/* 선택된 배지 설명 */}
      {activeSpot && (
        <p className="mt-2 flex items-start gap-2 p-2.5 bg-blue-50 rounded-lg text-xs text-blue-900">
          <span className="shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
            {activeSpot.n}
          </span>
          {activeSpot.label}
        </p>
      )}

      {/* 배지가 있으면 목록으로도 제공 — 모바일·스크린리더에서 좌표만으로는 읽히지 않는다 */}
      {hotspots.length > 0 && (
        <ol className="mt-2 space-y-1">
          {hotspots.map((h) => (
            <li key={h.n} className="flex items-start gap-2 text-xs text-gray-700">
              <span className="shrink-0 w-4 h-4 rounded-full bg-[#E31837] text-white text-[10px] flex items-center justify-center font-bold">
                {h.n}
              </span>
              {h.label}
            </li>
          ))}
        </ol>
      )}

      {source && (
        <figcaption className="mt-1 text-[10px] text-gray-400 text-center">
          실제 화면 예시 · 출처: {source} (마켓 UI 버전에 따라 다를 수 있어요)
        </figcaption>
      )}

      {zoom && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoom(false)}
        >
          <div className="relative max-w-full max-h-[90vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
            {hotspots.map((h) => (
              <span
                key={h.n}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#E31837] text-white
                  text-sm font-bold flex items-center justify-center shadow-lg ring-2 ring-white"
                style={{ left: `${h.x}%`, top: `${h.y}%` }}
              >
                {h.n}
              </span>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}
