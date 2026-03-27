// ============================================================
// 클라이언트 이미지 변형 미리보기 엔진
//
// 서버 server-image-variation.ts와 동일한 시드 → 동일 파라미터를 생성하되
// Canvas API로 썸네일을 렌더링한다.
// 서버 전용 import(jimp) 없이 브라우저에서 동작.
//
// 변형 기법 (14종):
//  기존: crop, brightness, saturation, quality, noise, gamma,
//        colorTemp, microResize, channelOffset, borderPadding
//  신규: horizontalFlip(좌우 반전), rotation(미세 회전),
//        bgColorShift(배경색 시프트), paddingRatio(종횡비 패딩)
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
  /** 균일 스케일 (1.0 = 원본, 0.95 = 5% 축소, 1.05 = 5% 확대) */
  uniformScale: number;
  channelOffsetR: number;
  channelOffsetG: number;
  channelOffsetB: number;
  /** 좌우 반전 — pHash를 완전히 바꾸는 가장 효과적인 기법 */
  horizontalFlip: boolean;
  /** 미세 회전 (degrees, ±1~3°) */
  rotation: number;
  /** 배경색 시프트 — 흰색 배경을 미세하게 톤 변경 (RGB 오프셋) */
  bgColorShift: { r: number; g: number; b: number };
  /** 종횡비 패딩 비율 — 상품 주변에 여백 추가 (0 = 없음, 0.05 = 5%) */
  paddingRatio: number;
}

const CROP_DIRECTIONS: CropDirection[] = ['top', 'bottom', 'left', 'right', 'center'];

// --- 강도별 범위 테이블 ---

interface IntensityRange {
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
  uniformScaleRange: number;       // 균일 스케일 범위 (0.05 = ±5%)
  channelOffsetRange: number;
  flipProbability: number;
  rotationRange: number;
  bgShiftRange: number;
  paddingMin: number;
  paddingRange: number;
}

const INTENSITY_RANGES: Record<VariationIntensity, IntensityRange> = {
  low: {
    brightnessRange: 0.01, qualityBase: 90, qualityRange: 6,
    cropMin: 0.005, cropRange: 0.01, borderMax: 2, saturationRange: 0.03,
    noiseMin: 0, noiseRange: 2,
    gammaMin: 0.99, gammaRange: 0.02,
    colorTempRange: 1,
    microResizeRange: 1,            // ±1px (종횡비 미세 조정만)
    uniformScaleRange: 0.02,        // ±2% 균일 확대/축소
    channelOffsetRange: 1,
    flipProbability: 0.3,
    rotationRange: 0.5,
    bgShiftRange: 3,
    paddingMin: 0, paddingRange: 0.02,
  },
  mid: {
    brightnessRange: 0.02, qualityBase: 80, qualityRange: 15,
    cropMin: 0.01, cropRange: 0.01, borderMax: 4, saturationRange: 0.05,
    noiseMin: 0, noiseRange: 3,
    gammaMin: 0.97, gammaRange: 0.06,
    colorTempRange: 3,
    microResizeRange: 2,            // ±2px (종횡비 미세 조정만)
    uniformScaleRange: 0.05,        // ±5% 균일 확대/축소
    channelOffsetRange: 2,
    flipProbability: 0.5,
    rotationRange: 1.5,
    bgShiftRange: 5,
    paddingMin: 0.01, paddingRange: 0.03,
  },
  high: {
    brightnessRange: 0.04, qualityBase: 75, qualityRange: 18,
    cropMin: 0.02, cropRange: 0.04, borderMax: 8, saturationRange: 0.10,
    noiseMin: 1, noiseRange: 3,
    gammaMin: 0.95, gammaRange: 0.10,
    colorTempRange: 5,
    microResizeRange: 3,            // ±3px (종횡비 미세 조정만)
    uniformScaleRange: 0.08,        // ±8% 균일 확대/축소
    channelOffsetRange: 3,
    flipProbability: 0.5,
    rotationRange: 3.0,
    bgShiftRange: 8,
    paddingMin: 0.02, paddingRange: 0.05,
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
    uniformScale: 1.0 + (rng() * r.uniformScaleRange * 2) - r.uniformScaleRange,
    channelOffsetR: Math.floor(rng() * (r.channelOffsetRange * 2 + 1)) - r.channelOffsetRange,
    channelOffsetG: Math.floor(rng() * (r.channelOffsetRange * 2 + 1)) - r.channelOffsetRange,
    channelOffsetB: Math.floor(rng() * (r.channelOffsetRange * 2 + 1)) - r.channelOffsetRange,
    // 신규 기법
    horizontalFlip: rng() < r.flipProbability,
    rotation: (rng() * r.rotationRange * 2) - r.rotationRange,
    bgColorShift: {
      r: Math.floor(rng() * (r.bgShiftRange * 2 + 1)) - r.bgShiftRange,
      g: Math.floor(rng() * (r.bgShiftRange * 2 + 1)) - r.bgShiftRange,
      b: Math.floor(rng() * (r.bgShiftRange * 2 + 1)) - r.bgShiftRange,
    },
    paddingRatio: r.paddingMin + rng() * r.paddingRange,
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

/** 배경 픽셀 판별: 밝기 > threshold → 배경으로 간주 */
function isBgPixel(r: number, g: number, b: number, threshold = 230): boolean {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > threshold;
}

/**
 * Canvas로 변형 적용 후 dataURL 반환
 *
 * 적용 순서:
 *  1. 패딩 (종횡비 여백)
 *  2. 크롭
 *  3. 좌우 반전
 *  4. 미세 회전
 *  5. 밝기 + 채도 (CSS filter)
 *  6. 픽셀 조작 (감마, 색온도, 채널오프셋, 노이즈, 배경색 시프트)
 */
export async function generateVariedThumbnail(
  imgSrc: string,
  params: PreviewVariationParams,
  size = 96,
): Promise<string> {
  const img = await loadImage(imgSrc);
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

  // 1. 패딩 적용 — 원본을 패딩된 캔버스에 그림
  let srcCanvas: HTMLCanvasElement | HTMLImageElement = img;
  let srcW = origW;
  let srcH = origH;

  if (params.paddingRatio > 0.001) {
    const padX = Math.round(origW * params.paddingRatio);
    const padY = Math.round(origH * params.paddingRatio);
    const padCanvas = document.createElement('canvas');
    padCanvas.width = origW + padX * 2;
    padCanvas.height = origH + padY * 2;
    const padCtx = padCanvas.getContext('2d')!;
    // 흰색 배경
    padCtx.fillStyle = '#FFFFFF';
    padCtx.fillRect(0, 0, padCanvas.width, padCanvas.height);
    padCtx.drawImage(img, padX, padY, origW, origH);
    srcCanvas = padCanvas;
    srcW = padCanvas.width;
    srcH = padCanvas.height;
  }

  // 2. 크롭 영역 계산
  const cropPx = Math.max(1, Math.round(Math.min(srcW, srcH) * params.cropRatio));
  let sx = 0, sy = 0, sw = srcW, sh = srcH;
  switch (params.cropDirection) {
    case 'top':    sy = cropPx; sh = srcH - cropPx; break;
    case 'bottom': sh = srcH - cropPx; break;
    case 'left':   sx = cropPx; sw = srcW - cropPx; break;
    case 'right':  sw = srcW - cropPx; break;
    case 'center':
      sx = Math.floor(cropPx / 2);
      sy = Math.floor(cropPx / 2);
      sw = srcW - cropPx;
      sh = srcH - cropPx;
      break;
  }

  // 균일 스케일 + 마이크로 리사이즈 반영한 출력 크기
  const scaledSize = Math.round(size * params.uniformScale);
  const outW = Math.max(1, scaledSize + params.microResizeX);
  const outH = Math.max(1, scaledSize + params.microResizeY);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;

  // 3. 배경 흰색 (회전 시 빈 영역이 검정색으로 나오는 문제 방지)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, outW, outH);

  // 4. 밝기 + 채도 CSS 필터
  const brightnessVal = 1 + params.brightness;
  const saturateVal = 1 + params.saturation;
  ctx.filter = `brightness(${brightnessVal}) saturate(${saturateVal})`;

  // 5. 좌우 반전 + 미세 회전 적용
  ctx.save();
  ctx.translate(outW / 2, outH / 2);

  if (params.horizontalFlip) {
    ctx.scale(-1, 1);
  }

  if (Math.abs(params.rotation) > 0.01) {
    ctx.rotate((params.rotation * Math.PI) / 180);
  }

  // 회전 시 모서리 잘림 방지: cos(θ)+sin(θ) 만큼 확대해야 캔버스 전체를 덮음
  const absRot = Math.abs(params.rotation) * Math.PI / 180;
  const finalScale = absRot > 0.001 ? Math.cos(absRot) + Math.sin(absRot) : 1;

  ctx.drawImage(
    srcCanvas,
    sx, sy, sw, sh,
    (-outW / 2) * finalScale, (-outH / 2) * finalScale,
    outW * finalScale, outH * finalScale,
  );
  ctx.restore();

  // 5. 픽셀 단일 순회: 감마 + 색온도 + 채널 오프셋 + 노이즈 + 배경색 시프트
  const hasBgShift = params.bgColorShift.r !== 0 || params.bgColorShift.g !== 0 || params.bgColorShift.b !== 0;
  const needsPixelPass =
    params.gamma !== 1.0 ||
    params.colorTempShift !== 0 ||
    params.channelOffsetR !== 0 || params.channelOffsetG !== 0 || params.channelOffsetB !== 0 ||
    params.noiseIntensity > 0 ||
    hasBgShift;

  if (needsPixelPass) {
    // filter 리셋 후 imageData 읽기 (CSS filter가 이미 적용된 상태)
    ctx.filter = 'none';
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

      // 배경색 시프트 — 밝은 픽셀(배경)만 색조 변경
      if (hasBgShift && isBgPixel(r, g, b)) {
        r += params.bgColorShift.r;
        g += params.bgColorShift.g;
        b += params.bgColorShift.b;
      }

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
  if (params.horizontalFlip) {
    lines.push('좌우 반전');
  }
  if (Math.abs(params.rotation) > 0.01) {
    lines.push(`회전 ${params.rotation >= 0 ? '+' : ''}${params.rotation.toFixed(1)}°`);
  }
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
  if (Math.abs(params.uniformScale - 1.0) > 0.001) {
    const pct = ((params.uniformScale - 1.0) * 100).toFixed(1);
    lines.push(`스케일 ${params.uniformScale > 1 ? '+' : ''}${pct}%`);
  }
  if (params.microResizeX !== 0 || params.microResizeY !== 0) {
    lines.push(`리사이즈 ${params.microResizeX >= 0 ? '+' : ''}${params.microResizeX}×${params.microResizeY >= 0 ? '+' : ''}${params.microResizeY}px`);
  }
  if (params.borderPadding > 0) {
    lines.push(`보더 ${params.borderPadding}px`);
  }
  if (params.paddingRatio > 0.001) {
    lines.push(`여백 ${(params.paddingRatio * 100).toFixed(1)}%`);
  }
  const { bgColorShift: bg } = params;
  if (bg.r !== 0 || bg.g !== 0 || bg.b !== 0) {
    lines.push(`배경색 R${bg.r >= 0 ? '+' : ''}${bg.r} G${bg.g >= 0 ? '+' : ''}${bg.g} B${bg.b >= 0 ? '+' : ''}${bg.b}`);
  }
  return lines;
}
