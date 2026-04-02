// ============================================================
// 서버사이드 이미지 미세 변형 (P1)
//
// 셀러 시드 기반으로 결정적 변형 파라미터를 생성하여
// 파일 해시를 바꾸되 인간 눈에는 동일해 보이는 이미지를 만든다.
// 쿠팡의 퍼셉추얼 해시 매칭을 회피하기 위함.
//
// 변형 기법 (17종):
//  기존: crop, brightness, saturation, quality, noise, gamma,
//        colorTemp, microResize, channelOffset, borderPadding,
//        horizontalFlip, rotation, bgColorShift, paddingRatio
//  신규: bgPattern(배경 미세 패턴), zoomLevel(줌 변형),
//        sharpenBlur(샤프닝/블러)
//
// 라이브러리: jimp (pure JS, native 의존성 없음, Vercel 호환)
// npm install jimp 필요 — 미설치 시 원본 이미지 그대로 반환
// ============================================================

import { createSeededRandom, stringToSeed } from './seeded-random';

export type VariationIntensity = 'low' | 'mid' | 'high';

/** 변형 파라미터 */
export interface VariationParams {
  /** 밝기 조정 */
  brightness: number;
  /** JPEG 품질 */
  quality: number;
  /** 크롭 방향 */
  cropDirection: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** 크롭 비율 */
  cropRatio: number;
  /** 흰색 보더 패딩 (px) */
  borderPadding: number;
  /** 채도 조정 */
  saturation: number;
  /** 픽셀 노이즈 강도 (각 채널 ±N) */
  noiseIntensity: number;
  /** 감마 보정 */
  gamma: number;
  /** 색온도 시프트 (양수=따뜻) */
  colorTempShift: number;
  /** 마이크로 리사이즈 X (px) — 종횡비 미세 조정용 (±1~2px) */
  microResizeX: number;
  /** 마이크로 리사이즈 Y (px) — 종횡비 미세 조정용 (±1~2px) */
  microResizeY: number;
  /** 균일 스케일 (1.0 = 원본, 0.95 = 5% 축소, 1.05 = 5% 확대) */
  uniformScale: number;
  /** 채널 오프셋 R */
  channelOffsetR: number;
  /** 채널 오프셋 G */
  channelOffsetG: number;
  /** 채널 오프셋 B */
  channelOffsetB: number;
  /** 좌우 반전 */
  horizontalFlip: boolean;
  /** 미세 회전 (degrees) */
  rotation: number;
  /** 배경색 시프트 (RGB, 밝은 픽셀만 적용) */
  bgColorShift: { r: number; g: number; b: number };
  /** 종횡비 패딩 비율 (0 = 없음) */
  paddingRatio: number;
  /** 배경 미세 패턴 — 밝은 픽셀에 시드 기반 도트/그리드 패턴 삽입 */
  bgPattern: {
    type: 'dots' | 'grid' | 'diagonal' | 'none';
    intensity: number;   // 밝기 변화량 (1~4)
    spacing: number;     // 패턴 간격 (px, 3~12)
  };
  /** 줌 변형 — 중앙 기준 확대 후 원래 해상도 복원 (0 = 없음, 0.01~0.08) */
  zoomLevel: number;
  /** 샤프닝/블러 — 양수=샤프닝, 음수=블러 (±0.1~0.5) */
  sharpenBlur: number;
}

const CROP_DIRECTIONS = ['top', 'bottom', 'left', 'right', 'center'] as const;
const BG_PATTERN_TYPES = ['dots', 'grid', 'diagonal', 'none'] as const;

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

// --- 강도별 범위 테이블 (variation-preview.ts와 동일) ---

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
  uniformScaleRange: number;       // 균일 스케일 범위 (0.03 = ±3%)
  channelOffsetRange: number;
  flipProbability: number;
  rotationRange: number;
  bgShiftRange: number;
  paddingMin: number;
  paddingRange: number;
  bgPatternProb: number;       // 배경 패턴 적용 확률
  bgPatternIntensityMin: number;
  bgPatternIntensityRange: number;
  bgPatternSpacingMin: number;
  bgPatternSpacingRange: number;
  zoomMin: number;
  zoomRange: number;
  sharpenBlurRange: number;    // ± 범위
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
    bgPatternProb: 0.5,
    bgPatternIntensityMin: 1, bgPatternIntensityRange: 1,   // 1~2
    bgPatternSpacingMin: 6, bgPatternSpacingRange: 6,       // 6~12px
    zoomMin: 0.005, zoomRange: 0.015,                       // 0.5~2%
    sharpenBlurRange: 0.15,                                  // ±0.15
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
    bgPatternProb: 0.6,
    bgPatternIntensityMin: 1, bgPatternIntensityRange: 2,   // 1~3
    bgPatternSpacingMin: 4, bgPatternSpacingRange: 6,       // 4~10px
    zoomMin: 0.01, zoomRange: 0.03,                         // 1~4%
    sharpenBlurRange: 0.3,                                   // ±0.3
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
    bgPatternProb: 0.7,
    bgPatternIntensityMin: 2, bgPatternIntensityRange: 2,   // 2~4
    bgPatternSpacingMin: 3, bgPatternSpacingRange: 6,       // 3~9px
    zoomMin: 0.02, zoomRange: 0.06,                         // 2~8%
    sharpenBlurRange: 0.5,                                   // ±0.5
  },
};

/**
 * 셀러 시드 + 이미지 인덱스로 결정적 변형 파라미터 생성
 * @param intensity - 변형 강도 (기본 'mid')
 */
export function generateVariationParams(
  sellerSeed: string,
  imageIndex: number,
  intensity: VariationIntensity = 'mid',
): VariationParams {
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
    horizontalFlip: rng() < r.flipProbability,
    rotation: (rng() * r.rotationRange * 2) - r.rotationRange,
    bgColorShift: {
      r: Math.floor(rng() * (r.bgShiftRange * 2 + 1)) - r.bgShiftRange,
      g: Math.floor(rng() * (r.bgShiftRange * 2 + 1)) - r.bgShiftRange,
      b: Math.floor(rng() * (r.bgShiftRange * 2 + 1)) - r.bgShiftRange,
    },
    paddingRatio: r.paddingMin + rng() * r.paddingRange,
    bgPattern: rng() < r.bgPatternProb ? {
      type: BG_PATTERN_TYPES[Math.floor(rng() * 3)] as 'dots' | 'grid' | 'diagonal',  // 'none' 제외
      intensity: r.bgPatternIntensityMin + Math.floor(rng() * r.bgPatternIntensityRange),
      spacing: r.bgPatternSpacingMin + Math.floor(rng() * r.bgPatternSpacingRange),
    } : { type: 'none' as const, intensity: 0, spacing: 0 },
    zoomLevel: r.zoomMin + rng() * r.zoomRange,
    sharpenBlur: (rng() * r.sharpenBlurRange * 2) - r.sharpenBlurRange,
  };
}

/**
 * 이미지 버퍼에 변형을 적용하고 새 버퍼를 반환
 * jimp가 설치되지 않은 경우 원본 버퍼를 그대로 반환한다.
 *
 * @param noiseSeed - 노이즈 RNG용 시드 문자열 (없으면 고정 시드 사용)
 */
export async function applyVariation(buffer: Buffer, params: VariationParams, noiseSeed?: string): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Jimp: any;
  try {
    Jimp = (await import('jimp')).default || (await import('jimp'));
  } catch {
    console.warn('[image-variation] jimp 모듈 로드 실패 — 원본 이미지 반환');
    return buffer;
  }

  try {
    let image = await Jimp.read(buffer);
    let w: number = image.getWidth();
    let h: number = image.getHeight();

    // 0. 종횡비 패딩 — 상품 주변에 흰색 여백 추가
    if (params.paddingRatio > 0.001) {
      const padX = Math.round(w * params.paddingRatio);
      const padY = Math.round(h * params.paddingRatio);
      const padded = new Jimp(w + padX * 2, h + padY * 2, 0xFFFFFFFF);
      padded.composite(image, padX, padY);
      image = padded;
      w = image.getWidth();
      h = image.getHeight();
    }

    // 1. 미세 크롭
    const cropPx = Math.max(1, Math.round(Math.min(w, h) * params.cropRatio));
    let cx = 0, cy = 0, cw = w, ch = h;
    switch (params.cropDirection) {
      case 'top':    cy = cropPx; ch = h - cropPx; break;
      case 'bottom': ch = h - cropPx; break;
      case 'left':   cx = cropPx; cw = w - cropPx; break;
      case 'right':  cw = w - cropPx; break;
      case 'center':
        cx = Math.floor(cropPx / 2);
        cy = Math.floor(cropPx / 2);
        cw = w - cropPx;
        ch = h - cropPx;
        break;
    }
    image.crop(cx, cy, Math.max(1, cw), Math.max(1, ch));

    // 2. 좌우 반전
    if (params.horizontalFlip) {
      image.flip(true, false);
    }

    // 3. 미세 회전
    if (Math.abs(params.rotation) > 0.01) {
      // jimp rotate: 반시계 양수, 흰색 배경으로 채움
      image.rotate(-params.rotation, false);
      // 회전 후 검은 모서리 방지: 흰색 배경 합성
      const rw = image.getWidth();
      const rh = image.getHeight();
      const bgCanvas = new Jimp(rw, rh, 0xFFFFFFFF);
      bgCanvas.composite(image, 0, 0);
      image = bgCanvas;
    }

    // 4. 밝기 조정
    if (params.brightness !== 0) {
      image.brightness(params.brightness);
    }

    // 5. 채도 조정
    if (params.saturation !== 0) {
      image.color([{ apply: 'saturate', params: [params.saturation * 100] }]);
    }

    // 6. 픽셀 단일 순회: 감마 + 색온도 + 채널 오프셋 + 노이즈 + 배경색 시프트 + 배경 패턴
    const hasBgShift = params.bgColorShift.r !== 0 || params.bgColorShift.g !== 0 || params.bgColorShift.b !== 0;
    const hasBgPattern = params.bgPattern.type !== 'none' && params.bgPattern.intensity > 0;
    const needsPixelPass =
      params.gamma !== 1.0 ||
      params.colorTempShift !== 0 ||
      params.channelOffsetR !== 0 || params.channelOffsetG !== 0 || params.channelOffsetB !== 0 ||
      params.noiseIntensity > 0 ||
      hasBgShift ||
      hasBgPattern;

    if (needsPixelPass) {
      const imgW = image.getWidth();
      const data = image.bitmap.data;
      const invGamma = 1 / params.gamma;
      const applyGamma = Math.abs(invGamma - 1) > 0.001;

      // 노이즈용 별도 시드 RNG
      const noiseRng = params.noiseIntensity > 0
        ? createSeededRandom(stringToSeed(noiseSeed || 'noise-default'))
        : null;

      // 배경 패턴 파라미터
      const patSpacing = params.bgPattern.spacing || 8;
      const patIntensity = params.bgPattern.intensity || 2;
      const patType = params.bgPattern.type;

      for (let i = 0; i < data.length; i += 4) {
        let r = data[i], g = data[i + 1], b = data[i + 2];

        // 배경색 시프트 — 밝은 픽셀(배경)만 색조 변경
        if (hasBgShift) {
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum > 230) {
            r += params.bgColorShift.r;
            g += params.bgColorShift.g;
            b += params.bgColorShift.b;
          }
        }

        // 배경 미세 패턴 — 밝은 픽셀(배경)에만 미세 밝기 변화 삽입
        if (hasBgPattern) {
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum > 220) {
            const px = Math.floor((i / 4) % imgW);
            const py = Math.floor((i / 4) / imgW);
            let hit = false;
            if (patType === 'dots') {
              // 도트: spacing 간격으로 점
              hit = (px % patSpacing === 0) && (py % patSpacing === 0);
            } else if (patType === 'grid') {
              // 그리드: spacing 간격으로 수평/수직 선
              hit = (px % patSpacing === 0) || (py % patSpacing === 0);
            } else if (patType === 'diagonal') {
              // 대각선: (x+y) % spacing === 0
              hit = ((px + py) % patSpacing === 0);
            }
            if (hit) {
              // 밝기를 미세하게 낮춤 (눈에 안 보이지만 pHash 변경)
              r -= patIntensity;
              g -= patIntensity;
              b -= patIntensity;
            }
          }
        }

        // 감마 보정
        if (applyGamma) {
          r = 255 * Math.pow(r / 255, invGamma);
          g = 255 * Math.pow(g / 255, invGamma);
          b = 255 * Math.pow(b / 255, invGamma);
        }

        // 색온도 시프트
        r += params.colorTempShift;
        b -= params.colorTempShift;

        // 채널별 오프셋
        r += params.channelOffsetR;
        g += params.channelOffsetG;
        b += params.channelOffsetB;

        // 픽셀 노이즈
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
    }

    // 6b. 줌 변형 — 중앙 기준 확대 후 원래 해상도 복원 (픽셀 재보간 = pHash 변경)
    if (params.zoomLevel > 0.001) {
      const zw = image.getWidth();
      const zh = image.getHeight();
      const insetX = Math.round(zw * params.zoomLevel / 2);
      const insetY = Math.round(zh * params.zoomLevel / 2);
      const cropW = Math.max(1, zw - insetX * 2);
      const cropH = Math.max(1, zh - insetY * 2);
      image.crop(insetX, insetY, cropW, cropH);
      image.resize(zw, zh);   // 원래 크기로 복원 → 미세 보간 발생
    }

    // 6c. 샤프닝/블러 — 미세 커널 컨볼루션
    if (Math.abs(params.sharpenBlur) > 0.05) {
      if (params.sharpenBlur > 0) {
        // 언샤프 마스크: 중앙 강화, 주변 약화
        const s = params.sharpenBlur;   // 0.1~0.5
        const center = 1 + 4 * s;
        image.convolute([
          [0,   -s,    0],
          [-s,  center, -s],
          [0,   -s,    0],
        ]);
      } else {
        // 가우시안 블러 근사: 중앙 약화, 주변 혼합
        const b = Math.abs(params.sharpenBlur);  // 0.1~0.5
        const side = b / 4;
        const corner = b / 8;
        const center = 1 - 4 * side - 4 * corner;
        image.convolute([
          [corner, side,   corner],
          [side,   center, side],
          [corner, side,   corner],
        ]);
      }
    }

    // 7. 균일 스케일 + 마이크로 리사이즈 (종횡비 미세 조정)
    {
      const curW = image.getWidth();
      const curH = image.getHeight();
      const scaledW = Math.round(curW * params.uniformScale);
      const scaledH = Math.round(curH * params.uniformScale);
      const newW = Math.max(1, scaledW + params.microResizeX);
      const newH = Math.max(1, scaledH + params.microResizeY);
      if (newW !== curW || newH !== curH) {
        image.resize(newW, newH);
      }
    }

    // 8. 흰색 보더 (이미지 크기 미세 변경)
    if (params.borderPadding > 0) {
      const pad = params.borderPadding;
      const newW = image.getWidth() + pad * 2;
      const newH = image.getHeight() + pad * 2;
      const canvas = new Jimp(newW, newH, 0xFFFFFFFF);
      canvas.composite(image, pad, pad);
      const MIME_JPEG = Jimp.MIME_JPEG || 'image/jpeg';
      return await canvas.quality(params.quality).getBufferAsync(MIME_JPEG);
    }

    // 9. JPEG 품질 설정 후 버퍼 반환
    const MIME_JPEG = Jimp.MIME_JPEG || 'image/jpeg';
    return await image.quality(params.quality).getBufferAsync(MIME_JPEG);
  } catch (err) {
    console.warn('[image-variation] 변형 실패 — 원본 반환:', err instanceof Error ? err.message : err);
    return buffer;
  }
}
