// ============================================================
// 이미지 변형 서비스
// 쿠팡 이미지 해시 매칭을 회피하기 위한 미세 변형 적용
//
// ⚠️ 경고: 이미지 변형 기능은 기본적으로 비활성화되어 있습니다.
// 쿠팡 Open API ToS (이용약관)에 따르면 이미지를 변형하여 해시
// 매칭을 회피하는 행위는 제재 대상이 될 수 있습니다.
// 이 기능을 활성화하기 전에 반드시 ToS를 확인하세요.
// ============================================================

/**
 * 이미지 변형 기능 활성화 플래그
 * 기본값: false (비활성화)
 * ToS를 확인한 후 true로 변경하세요.
 */
let _imageVariationEnabled = false;

/** 이미지 변형 기능 활성화 여부를 설정합니다. */
export function setImageVariationEnabled(enabled: boolean): void {
  _imageVariationEnabled = enabled;
}

/** 이미지 변형 기능이 활성화되어 있는지 확인합니다. */
export function isImageVariationEnabled(): boolean {
  return _imageVariationEnabled;
}

// ---- 타입 ----

export type CropDirection = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface ImageVariation {
  /** 크롭 비율 (1~5%) */
  cropPercent: number;
  /** 크롭 방향 */
  cropDirection: CropDirection;
  /** 밝기 조정 (0.97~1.03, 1.0 = 원본) */
  brightness: number;
  /** JPEG 출력 품질 (85~95) */
  quality: number;
  /** 생성 시 사용된 시드 (추적용) */
  seed: string;
}

// ---- 서버사이드: 변형 파라미터 생성 ----

const CROP_DIRECTIONS: CropDirection[] = ['top', 'bottom', 'left', 'right', 'center'];

/**
 * 랜덤하지만 미세한 이미지 변형 파라미터를 생성한다.
 * 이 파라미터를 applyImageVariation()에 전달하면
 * 시각적으로는 동일하지만 파일 해시가 다른 이미지가 생성된다.
 */
export function generateImageVariationParams(): ImageVariation {
  const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    cropPercent: 1 + Math.random() * 4,                         // 1~5% 크롭
    cropDirection: CROP_DIRECTIONS[Math.floor(Math.random() * CROP_DIRECTIONS.length)],
    brightness: 0.97 + Math.random() * 0.06,                    // 97~103% 밝기
    quality: 85 + Math.floor(Math.random() * 11),                // 85~95 JPEG 품질
    seed,
  };
}

// ---- 클라이언트사이드: Canvas를 이용한 이미지 변형 적용 ----

/**
 * 브라우저 환경에서 File/Blob 이미지에 미세 변형을 적용한다.
 * Canvas API를 사용하여 crop + brightness 조정 후 새 Blob을 반환한다.
 *
 * @param file - 원본 이미지 파일
 * @param variation - generateImageVariationParams()로 생성된 파라미터
 * @returns 변형이 적용된 새 Blob (JPEG)
 */
export async function applyImageVariation(
  file: File | Blob,
  variation: ImageVariation,
): Promise<Blob> {
  // 비활성화 상태면 원본 반환
  if (!_imageVariationEnabled) {
    console.warn('[image-variation] 이미지 변형 기능이 비활성화되어 있습니다. 원본을 반환합니다. (ToS 확인 후 setImageVariationEnabled(true) 호출)');
    return file instanceof Blob ? file : new Blob([file]);
  }

  // 1. 이미지를 HTMLImageElement로 로드
  const img = await loadImageFromBlob(file);
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

  // 2. 크롭 영역 계산
  const cropPx = variation.cropPercent / 100;
  const { sx, sy, sw, sh } = calculateCropRect(origW, origH, cropPx, variation.cropDirection);

  // 3. Canvas에 그리기
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context를 가져올 수 없습니다.');
  }

  // 밝기 필터 적용
  ctx.filter = `brightness(${variation.brightness})`;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  // filter를 지원하지 않는 브라우저 폴백: pixel manipulation
  if (!ctx.filter || ctx.filter === 'none') {
    ctx.filter = 'none';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    applyBrightnessManual(ctx, sw, sh, variation.brightness);
  }

  // 4. JPEG Blob으로 변환
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
