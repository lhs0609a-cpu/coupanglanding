'use client';

import { useState, useEffect, useRef } from 'react';
import type { VariationIntensity } from '@/lib/megaload/services/variation-preview';

interface ImageItem {
  id: string;
  url: string;
}

export interface BeforeAfterImage {
  id: string;
  originalUrl: string;
  variedDataUrl: string | null; // null = 생성 중
  paramsText: string[];
}

export function useBeforeAfterPreview(
  imageItems: ImageItem[],
  productCode: string,
  enabled: boolean,
  intensity: VariationIntensity,
  seed: string,
): { images: BeforeAfterImage[]; loading: boolean } {
  const [images, setImages] = useState<BeforeAfterImage[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    if (!enabled || imageItems.length === 0) {
      setImages([]);
      setLoading(false);
      return;
    }

    const abort = new AbortController();
    abortRef.current = abort;

    // 초기 상태: 모두 null
    setImages(
      imageItems.map((img) => ({
        id: img.id,
        originalUrl: img.url,
        variedDataUrl: null,
        paramsText: [],
      })),
    );
    setLoading(true);

    (async () => {
      const { generatePreviewVariationParams, generateVariedThumbnail, formatVariationParams } =
        await import('@/lib/megaload/services/variation-preview');

      for (let idx = 0; idx < imageItems.length; idx++) {
        if (abort.signal.aborted) return;

        const img = imageItems[idx];
        const params = generatePreviewVariationParams(seed, idx, intensity);
        const paramsText = formatVariationParams(params);

        let variedDataUrl: string | null = null;
        try {
          variedDataUrl = await generateVariedThumbnail(img.url, params, 200);
        } catch {
          variedDataUrl = null;
        }

        if (abort.signal.aborted) return;

        setImages((prev) =>
          prev.map((p, i) =>
            i === idx ? { ...p, variedDataUrl, paramsText } : p,
          ),
        );
      }

      if (!abort.signal.aborted) {
        setLoading(false);
      }
    })();

    return () => {
      abort.abort();
    };
  }, [imageItems, productCode, enabled, intensity, seed]);

  return { images, loading };
}
