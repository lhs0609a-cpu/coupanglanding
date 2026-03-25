'use client';

import { useState, useEffect, useRef } from 'react';

// --- 타입 ---

interface ImageItem {
  id: string;
  url: string;
}

export interface VariationImagePreview {
  id: string;
  originalUrl: string;
  variedDataUrl: string | null; // null = 아직 생성 중
  paramsText: string[];         // formatVariationParams 결과
}

export interface SellerVariationPreview {
  sellerLabel: string;
  images: VariationImagePreview[];
  loading: boolean;
}

// --- 훅 ---

export function useVariationPreviews(
  imageItems: ImageItem[],
  productCode: string,
  enabled: boolean,
): SellerVariationPreview[] {
  const [previews, setPreviews] = useState<SellerVariationPreview[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // 이전 작업 취소
    if (abortRef.current) {
      abortRef.current.abort();
    }

    if (!enabled || imageItems.length <= 1) {
      setPreviews([]);
      return;
    }

    const abort = new AbortController();
    abortRef.current = abort;

    const sellerLabels = ['셀러A', '셀러B', '셀러C'];

    // 초기 상태: 모든 셀러 loading
    setPreviews(
      sellerLabels.map((sellerLabel) => ({
        sellerLabel,
        images: imageItems.map((img) => ({
          id: img.id,
          originalUrl: img.url,
          variedDataUrl: null,
          paramsText: [],
        })),
        loading: true,
      })),
    );

    // 비동기 생성 — 셀러별 프로그레시브 렌더링
    (async () => {
      // dynamic import로 비활성 시 번들 미포함
      const { generatePreviewVariationParams, generateVariedThumbnail, formatVariationParams } =
        await import('@/lib/megaload/services/variation-preview');
      const { shuffleWithSeed } = await import('@/lib/megaload/services/item-winner-prevention');

      for (let si = 0; si < sellerLabels.length; si++) {
        if (abort.signal.aborted) return;

        const sellerLabel = sellerLabels[si];
        const seed = `${sellerLabel}:${productCode}`;
        const shuffled = shuffleWithSeed(imageItems, seed);

        const generatedImages: VariationImagePreview[] = [];

        for (let ii = 0; ii < shuffled.length; ii++) {
          if (abort.signal.aborted) return;

          const img = shuffled[ii];
          const params = generatePreviewVariationParams(seed, ii);
          const paramsText = formatVariationParams(params);

          let variedDataUrl: string | null = null;
          try {
            variedDataUrl = await generateVariedThumbnail(img.url, params, 96);
          } catch {
            // 이미지 로드 실패 시 원본 URL 사용
            variedDataUrl = null;
          }

          generatedImages.push({
            id: img.id,
            originalUrl: img.url,
            variedDataUrl,
            paramsText,
          });
        }

        if (abort.signal.aborted) return;

        // 이 셀러 완료 → 프로그레시브 업데이트
        setPreviews((prev) =>
          prev.map((p, idx) =>
            idx === si ? { ...p, images: generatedImages, loading: false } : p,
          ),
        );
      }
    })();

    return () => {
      abort.abort();
    };
  }, [imageItems, productCode, enabled]);

  return previews;
}
