// ============================================================
// 클라이언트 이미지 변형 미리보기 엔진
//
// 서버 server-image-variation.ts와 동일한 시드 → 동일 파라미터를 생성하되
// Canvas API로 썸네일을 렌더링한다.
// 서버 전용 import(jimp) 없이 브라우저에서 동작.
// ============================================================

// --- seeded-random 로직 인라인 (서버 모듈 import 방지) ---

function stringToSeed(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

function createSeededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- 타입 ---

export type CropDirection = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface PreviewVariationParams {
  brightness: number;
  quality: number;
  cropDirection: CropDirection;
  cropRatio: number;
  borderPadding: number;
  saturation: number;
  rotation: number;
}

const CROP_DIRECTIONS: CropDirection[] = ['top', 'bottom', 'left', 'right', 'center'];

// --- 파라미터 생성 (서버와 동일 로직) ---

export function generatePreviewVariationParams(
  sellerSeed: string,
  imageIndex: number,
): PreviewVariationParams {
  const seed = stringToSeed(`${sellerSeed}:img:${imageIndex}`);
  const rng = createSeededRandom(seed);

  return {
    brightness: (rng() * 0.04) - 0.02,
    quality: Math.floor(rng() * 14) + 82,
    cropDirection: CROP_DIRECTIONS[Math.floor(rng() * 5)],
    cropRatio: 0.01 + rng() * 0.02,
    borderPadding: Math.floor(rng() * 5),
    saturation: (rng() * 0.10) - 0.05,
    rotation: (rng() * 3.0) - 1.5,
  };
}

// --- Canvas 썸네일 렌더링 ---

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`이미지 로드 실패: ${src}`));
    img.src = src;
  });
}

/**
 * Canvas로 crop → brightness → saturation → rotation 적용 후 dataURL 반환
 */
export async function generateVariedThumbnail(
  imgSrc: string,
  params: PreviewVariationParams,
  size = 96,
): Promise<string> {
  const img = await loadImage(imgSrc);
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

  // 1. 크롭 영역 계산
  const cropPx = Math.max(1, Math.round(Math.min(origW, origH) * params.cropRatio));
  let sx = 0, sy = 0, sw = origW, sh = origH;
  switch (params.cropDirection) {
    case 'top':    sy = cropPx; sh = origH - cropPx; break;
    case 'bottom': sh = origH - cropPx; break;
    case 'left':   sx = cropPx; sw = origW - cropPx; break;
    case 'right':  sw = origW - cropPx; break;
    case 'center':
      sx = Math.floor(cropPx / 2);
      sy = Math.floor(cropPx / 2);
      sw = origW - cropPx;
      sh = origH - cropPx;
      break;
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // 2. 회전 적용
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate((params.rotation * Math.PI) / 180);
  ctx.translate(-size / 2, -size / 2);

  // 3. 밝기 + 채도 CSS 필터
  const brightnessVal = 1 + params.brightness; // -0.02~+0.02 → 0.98~1.02
  const saturateVal = 1 + params.saturation;   // -0.05~+0.05 → 0.95~1.05
  ctx.filter = `brightness(${brightnessVal}) saturate(${saturateVal})`;

  // 4. 크롭된 원본을 size×size에 맞게 그리기
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
  ctx.restore();

  return canvas.toDataURL('image/jpeg', params.quality / 100);
}

// --- 파라미터 포맷팅 ---

const CROP_DIRECTION_KR: Record<CropDirection, string> = {
  top: '상단',
  bottom: '하단',
  left: '좌측',
  right: '우측',
  center: '중앙',
};

export function formatVariationParams(params: PreviewVariationParams): string[] {
  const lines: string[] = [];
  lines.push(`크롭 ${(params.cropRatio * 100).toFixed(1)}% (${CROP_DIRECTION_KR[params.cropDirection]})`);
  lines.push(`밝기 ${params.brightness >= 0 ? '+' : ''}${(params.brightness * 100).toFixed(1)}%`);
  lines.push(`채도 ${params.saturation >= 0 ? '+' : ''}${(params.saturation * 100).toFixed(1)}%`);
  lines.push(`회전 ${params.rotation >= 0 ? '+' : ''}${params.rotation.toFixed(1)}°`);
  lines.push(`품질 ${params.quality}%`);
  if (params.borderPadding > 0) {
    lines.push(`보더 ${params.borderPadding}px`);
  }
  return lines;
}
