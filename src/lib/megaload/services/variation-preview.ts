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
export type VariationIntensity = 'low' | 'mid' | 'high';

export interface PreviewVariationParams {
  brightness: number;
  quality: number;
  cropDirection: CropDirection;
  cropRatio: number;
  borderPadding: number;
  saturation: number;
  noiseIntensity: number;
  gamma: number;
  colorTempShift: number;
  microResizeX: number;
  microResizeY: number;
  channelOffsetR: number;
  channelOffsetG: number;
  channelOffsetB: number;
}

const CROP_DIRECTIONS: CropDirection[] = ['top', 'bottom', 'left', 'right', 'center'];

// --- 강도별 범위 테이블 ---

const INTENSITY_RANGES: Record<VariationIntensity, {
  brightnessRange: number;
  qualityBase: number;
  qualityRange: number;
  cropMin: number;
  cropRange: number;
  borderMax: number;
  saturationRange: number;
  noiseMin: number;
  noiseRange: number;
  gammaMin: number;
  gammaRange: number;
  colorTempRange: number;
  microResizeRange: number;
  channelOffsetRange: number;
}> = {
  low: {
    brightnessRange: 0.01, qualityBase: 90, qualityRange: 6,
    cropMin: 0.005, cropRange: 0.01, borderMax: 2, saturationRange: 0.03,
    noiseMin: 0, noiseRange: 2,           // 0~1
    gammaMin: 0.99, gammaRange: 0.02,     // 0.99~1.01
    colorTempRange: 1,                     // -1~+1
    microResizeRange: 0,                   // 0
    channelOffsetRange: 1,                 // -1~+1
  },
  mid: {
    brightnessRange: 0.02, qualityBase: 80, qualityRange: 15,
    cropMin: 0.01, cropRange: 0.01, borderMax: 4, saturationRange: 0.05,
    noiseMin: 0, noiseRange: 3,           // 0~2
    gammaMin: 0.97, gammaRange: 0.06,     // 0.97~1.03
    colorTempRange: 3,                     // -3~+3
    microResizeRange: 4,                   // -4~+4
    channelOffsetRange: 2,                 // -2~+2
  },
  high: {
    brightnessRange: 0.04, qualityBase: 75, qualityRange: 18,
    cropMin: 0.02, cropRange: 0.04, borderMax: 8, saturationRange: 0.10,
    noiseMin: 1, noiseRange: 3,           // 1~3
    gammaMin: 0.95, gammaRange: 0.10,     // 0.95~1.05
    colorTempRange: 5,                     // -5~+5
    microResizeRange: 6,                   // -6~+6
    channelOffsetRange: 3,                 // -3~+3
  },
};

// --- 파라미터 생성 (서버와 동일 로직) ---

export function generatePreviewVariationParams(
  sellerSeed: string,
  imageIndex: number,
  intensity: VariationIntensity = 'mid',
): PreviewVariationParams {
  const seed = stringToSeed(`${sellerSeed}:img:${imageIndex}`);
  const rng = createSeededRandom(seed);
  const r = INTENSITY_RANGES[intensity];

  return {
    brightness: (rng() * r.brightnessRange * 2) - r.brightnessRange,
    quality: Math.floor(rng() * r.qualityRange) + r.qualityBase,
    cropDirection: CROP_DIRECTIONS[Math.floor(rng() * 5)],
    cropRatio: r.cropMin + rng() * r.cropRange,
    borderPadding: Math.floor(rng() * r.borderMax),
    saturation: (rng() * r.saturationRange * 2) - r.saturationRange,
    noiseIntensity: r.noiseMin + Math.floor(rng() * r.noiseRange),
    gamma: r.gammaMin + rng() * r.gammaRange,
    colorTempShift: Math.floor(rng() * (r.colorTempRange * 2 + 1)) - r.colorTempRange,
    microResizeX: r.microResizeRange === 0 ? 0 : Math.floor(rng() * (r.microResizeRange * 2 + 1)) - r.microResizeRange,
    microResizeY: r.microResizeRange === 0 ? 0 : Math.floor(rng() * (r.microResizeRange * 2 + 1)) - r.microResizeRange,
    channelOffsetR: Math.floor(rng() * (r.channelOffsetRange * 2 + 1)) - r.channelOffsetRange,
    channelOffsetG: Math.floor(rng() * (r.channelOffsetRange * 2 + 1)) - r.channelOffsetRange,
    channelOffsetB: Math.floor(rng() * (r.channelOffsetRange * 2 + 1)) - r.channelOffsetRange,
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

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Canvas로 crop → brightness → saturation → 픽셀조작 적용 후 dataURL 반환
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

  // 마이크로 리사이즈 반영한 출력 크기
  const outW = Math.max(1, size + params.microResizeX);
  const outH = Math.max(1, size + params.microResizeY);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;

  // 2. 밝기 + 채도 CSS 필터
  const brightnessVal = 1 + params.brightness;
  const saturateVal = 1 + params.saturation;
  ctx.filter = `brightness(${brightnessVal}) saturate(${saturateVal})`;

  // 3. 크롭된 원본을 출력 크기에 맞게 그리기
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

  // 4. 픽셀 단일 순회: 감마 + 색온도 + 채널 오프셋 + 노이즈
  const needsPixelPass =
    params.gamma !== 1.0 ||
    params.colorTempShift !== 0 ||
    params.channelOffsetR !== 0 || params.channelOffsetG !== 0 || params.channelOffsetB !== 0 ||
    params.noiseIntensity > 0;

  if (needsPixelPass) {
    const imageData = ctx.getImageData(0, 0, outW, outH);
    const data = imageData.data;
    const invGamma = 1 / params.gamma;
    const applyGamma = Math.abs(invGamma - 1) > 0.001;

    // 노이즈용 시드 RNG (미리보기는 고정 시드)
    const noiseRng = params.noiseIntensity > 0
      ? createSeededRandom(stringToSeed(imgSrc))
      : null;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i + 1], b = data[i + 2];

      if (applyGamma) {
        r = 255 * Math.pow(r / 255, invGamma);
        g = 255 * Math.pow(g / 255, invGamma);
        b = 255 * Math.pow(b / 255, invGamma);
      }

      r += params.colorTempShift;
      b -= params.colorTempShift;

      r += params.channelOffsetR;
      g += params.channelOffsetG;
      b += params.channelOffsetB;

      if (noiseRng) {
        const n = params.noiseIntensity;
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
  lines.push(`감마 ${params.gamma.toFixed(3)}`);
  lines.push(`품질 ${params.quality}%`);
  if (params.noiseIntensity > 0) {
    lines.push(`노이즈 ±${params.noiseIntensity}`);
  }
  if (params.colorTempShift !== 0) {
    lines.push(`색온도 ${params.colorTempShift > 0 ? '+' : ''}${params.colorTempShift}`);
  }
  if (params.channelOffsetR !== 0 || params.channelOffsetG !== 0 || params.channelOffsetB !== 0) {
    lines.push(`채널 R${params.channelOffsetR >= 0 ? '+' : ''}${params.channelOffsetR} G${params.channelOffsetG >= 0 ? '+' : ''}${params.channelOffsetG} B${params.channelOffsetB >= 0 ? '+' : ''}${params.channelOffsetB}`);
  }
  if (params.microResizeX !== 0 || params.microResizeY !== 0) {
    lines.push(`리사이즈 ${params.microResizeX >= 0 ? '+' : ''}${params.microResizeX}×${params.microResizeY >= 0 ? '+' : ''}${params.microResizeY}px`);
  }
  if (params.borderPadding > 0) {
    lines.push(`보더 ${params.borderPadding}px`);
  }
  return lines;
}
