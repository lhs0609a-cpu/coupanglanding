// ============================================================
// 이미지 변형 서비스
// 쿠팡 이미지 해시 매칭을 회피하기 위한 미세 변형 적용
// ============================================================

// ---- 타입 ----

export type CropDirection = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface ImageVariation {
  /** 크롭 비율 (1~5%) */
  cropPercent: number;
  /** 크롭 방향 */
  cropDirection: CropDirection;
  /** 밝기 조정 (0.97~1.03, 1.0 = 원본) */
  brightness: number;
  /** 채도 조정 (0.90~1.10, 1.0 = 원본) */
  saturation: number;
  /** JPEG 출력 품질 (80~94) */
  quality: number;
  /** 생성 시 사용된 시드 (추적용) */
  seed: string;
  /** 픽셀 노이즈 강도 (0~2) */
  noiseIntensity: number;
  /** 감마 보정 (0.97~1.03) */
  gamma: number;
  /** 색온도 시프트 (-3~+3) */
  colorTempShift: number;
  /** 마이크로 리사이즈 X (-4~+4 px) */
  microResizeX: number;
  /** 마이크로 리사이즈 Y (-4~+4 px) */
  microResizeY: number;
  /** 채널 오프셋 R (-2~+2) */
  channelOffsetR: number;
  /** 채널 오프셋 G (-2~+2) */
  channelOffsetG: number;
  /** 채널 오프셋 B (-2~+2) */
  channelOffsetB: number;
}

// ---- 서버사이드: 변형 파라미터 생성 ----

const CROP_DIRECTIONS: CropDirection[] = ['top', 'bottom', 'left', 'right', 'center'];

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * 랜덤하지만 미세한 이미지 변형 파라미터를 생성한다.
 * 이 파라미터를 applyImageVariation()에 전달하면
 * 시각적으로는 동일하지만 파일 해시가 다른 이미지가 생성된다.
 */
export function generateImageVariationParams(): ImageVariation {
  const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    cropPercent: 2 + Math.random() * 6,                         // 2~8% 크롭
    cropDirection: CROP_DIRECTIONS[Math.floor(Math.random() * CROP_DIRECTIONS.length)],
    brightness: 0.92 + Math.random() * 0.16,                    // 92~108% 밝기
    saturation: 0.85 + Math.random() * 0.30,                    // 85~115% 채도
    quality: 80 + Math.floor(Math.random() * 15),                // 80~94 JPEG 품질
    seed,
    noiseIntensity: Math.floor(Math.random() * 3),               // 0, 1, 2
    gamma: 0.97 + Math.random() * 0.06,                         // 0.97~1.03
    colorTempShift: Math.floor(Math.random() * 7) - 3,          // -3~+3
    microResizeX: Math.floor(Math.random() * 9) - 4,            // -4~+4
    microResizeY: Math.floor(Math.random() * 9) - 4,            // -4~+4
    channelOffsetR: Math.floor(Math.random() * 5) - 2,          // -2~+2
    channelOffsetG: Math.floor(Math.random() * 5) - 2,          // -2~+2
    channelOffsetB: Math.floor(Math.random() * 5) - 2,          // -2~+2
  };
}

// ---- 클라이언트사이드: Canvas를 이용한 이미지 변형 적용 ----

/**
 * 브라우저 환경에서 File/Blob 이미지에 미세 변형을 적용한다.
 * Canvas API를 사용하여 crop + brightness + 픽셀 조작 후 새 Blob을 반환한다.
 *
 * @param file - 원본 이미지 파일
 * @param variation - generateImageVariationParams()로 생성된 파라미터
 * @returns 변형이 적용된 새 Blob (JPEG)
 */
export async function applyImageVariation(
  file: File | Blob,
  variation: ImageVariation,
): Promise<Blob> {
  // 1. 이미지를 HTMLImageElement로 로드
  const img = await loadImageFromBlob(file);
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

  // 2. 크롭 영역 계산
  const cropPx = variation.cropPercent / 100;
  const { sx, sy, sw, sh } = calculateCropRect(origW, origH, cropPx, variation.cropDirection);

  // 3. 마이크로 리사이즈 반영한 출력 크기
  const outW = Math.max(1, sw + variation.microResizeX);
  const outH = Math.max(1, sh + variation.microResizeY);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context를 가져올 수 없습니다.');
  }

  // 밝기 + 채도 필터 적용
  const satVal = variation.saturation ?? 1.0;
  ctx.filter = `brightness(${variation.brightness}) saturate(${satVal})`;

  // 크롭된 원본을 출력 크기에 맞게 그리기
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

  // filter를 지원하지 않는 브라우저 폴백
  if (!ctx.filter || ctx.filter === 'none') {
    ctx.filter = 'none';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
    applyBrightnessManual(ctx, outW, outH, variation.brightness);
  }

  // 4. 픽셀 단일 순회: 감마 + 색온도 + 채널 오프셋 + 노이즈
  const needsPixelPass =
    variation.gamma !== 1.0 ||
    variation.colorTempShift !== 0 ||
    variation.channelOffsetR !== 0 || variation.channelOffsetG !== 0 || variation.channelOffsetB !== 0 ||
    variation.noiseIntensity > 0;

  if (needsPixelPass) {
    const imageData = ctx.getImageData(0, 0, outW, outH);
    const data = imageData.data;
    const invGamma = 1 / variation.gamma;
    const applyGamma = Math.abs(invGamma - 1) > 0.001;

    // 간이 시드 RNG (seed 문자열 기반)
    let noiseState = 0;
    if (variation.noiseIntensity > 0) {
      for (let i = 0; i < variation.seed.length; i++) {
        noiseState = ((noiseState << 5) + noiseState + variation.seed.charCodeAt(i)) | 0;
      }
      noiseState = noiseState >>> 0;
    }
    function noiseRng(): number {
      noiseState = (noiseState + 0x6d2b79f5) | 0;
      let t = Math.imul(noiseState ^ (noiseState >>> 15), 1 | noiseState);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i + 1], b = data[i + 2];

      if (applyGamma) {
        r = 255 * Math.pow(r / 255, invGamma);
        g = 255 * Math.pow(g / 255, invGamma);
        b = 255 * Math.pow(b / 255, invGamma);
      }

      r += variation.colorTempShift;
      b -= variation.colorTempShift;

      r += variation.channelOffsetR;
      g += variation.channelOffsetG;
      b += variation.channelOffsetB;

      if (variation.noiseIntensity > 0) {
        const n = variation.noiseIntensity;
        const range = 2 * n + 1;
        r += Math.floor(noiseRng() * range) - n;
        g += Math.floor(noiseRng() * range) - n;
        b += Math.floor(noiseRng() * range) - n;
      }

      data[i]     = clamp(r);
      data[i + 1] = clamp(g);
      data[i + 2] = clamp(b);
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // 5. JPEG Blob으로 변환
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas toBlob 변환 실패'));
        }
      },
      'image/jpeg',
      variation.quality / 100,
    );
  });
}

/**
 * 여러 이미지에 각각 다른 변형을 일괄 적용한다.
 * 각 이미지마다 새로운 변형 파라미터가 자동 생성된다.
 *
 * @param files - 원본 이미지 파일 배열
 * @returns 변형된 Blob과 사용된 파라미터의 배열
 */
export async function applyImageVariationBatch(
  files: (File | Blob)[],
): Promise<{ blob: Blob; variation: ImageVariation }[]> {
  const results: { blob: Blob; variation: ImageVariation }[] = [];

  for (const file of files) {
    const variation = generateImageVariationParams();
    try {
      const blob = await applyImageVariation(file, variation);
      results.push({ blob, variation });
    } catch (err) {
      // 실패 시 원본을 그대로 반환
      console.warn('이미지 변형 실패, 원본 사용:', err);
      const fallbackBlob = file instanceof Blob ? file : new Blob([file]);
      results.push({ blob: fallbackBlob, variation });
    }
  }

  return results;
}

// ---- 내부 헬퍼 함수 ----

/**
 * Blob을 HTMLImageElement로 로드
 */
function loadImageFromBlob(blob: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지 로드 실패'));
    };
    img.src = url;
  });
}

/**
 * 크롭 방향에 따른 source rect 계산
 */
function calculateCropRect(
  w: number,
  h: number,
  cropRatio: number,
  direction: CropDirection,
): { sx: number; sy: number; sw: number; sh: number } {
  const cropW = Math.round(w * cropRatio);
  const cropH = Math.round(h * cropRatio);

  switch (direction) {
    case 'top':
      return { sx: 0, sy: cropH, sw: w, sh: h - cropH };
    case 'bottom':
      return { sx: 0, sy: 0, sw: w, sh: h - cropH };
    case 'left':
      return { sx: cropW, sy: 0, sw: w - cropW, sh: h };
    case 'right':
      return { sx: 0, sy: 0, sw: w - cropW, sh: h };
    case 'center':
    default: {
      const halfW = Math.round(cropW / 2);
      const halfH = Math.round(cropH / 2);
      return { sx: halfW, sy: halfH, sw: w - cropW, sh: h - cropH };
    }
  }
}

/**
 * Canvas pixel manipulation으로 밝기 수동 조정
 * (ctx.filter를 지원하지 않는 브라우저용 폴백)
 */
function applyBrightnessManual(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  brightness: number,
): void {
  if (Math.abs(brightness - 1.0) < 0.001) return; // 변경 불필요

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, Math.round(data[i] * brightness)));       // R
    data[i + 1] = Math.min(255, Math.max(0, Math.round(data[i + 1] * brightness))); // G
    data[i + 2] = Math.min(255, Math.max(0, Math.round(data[i + 2] * brightness))); // B
    // Alpha (data[i+3]) 유지
  }

  ctx.putImageData(imageData, 0, 0);
}
