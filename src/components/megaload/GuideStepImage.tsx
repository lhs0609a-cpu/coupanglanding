'use client';

import { useState } from 'react';

/**
 * 가이드 단계의 실제 화면 캡처 (클릭 시 확대).
 *
 * ChannelConnectWizard 는 자체 StepMockup(윈도우 프레임 + 목업 폴백)을 쓰고,
 * ChannelSetupGuide 는 이미지를 아예 안 그리고 있었다 — 같은 가이드 데이터인데
 * 경로에 따라 캡처가 보였다 안 보였다 해서 이 컴포넌트로 메운다.
 * 로드 실패(경로 오타·파일 누락) 시 조용히 숨긴다.
 */
export default function GuideStepImage({ src, alt }: { src: string; alt: string }) {
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(false);

  if (error) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setZoom(true)}
        className="block w-full mb-2 rounded-lg border border-gray-200 overflow-hidden cursor-zoom-in hover:border-gray-300 transition"
        title="크게 보기"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setError(true)}
          className="w-full max-h-[320px] object-contain bg-gray-50"
        />
      </button>
      {zoom && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoom(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
        </div>
      )}
    </>
  );
}
