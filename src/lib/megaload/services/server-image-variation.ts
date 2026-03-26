// ============================================================
// 서버사이드 이미지 미세 변형 (P1)
//
// 셀러 시드 기반으로 결정적 변형 파라미터를 생성하여
// 파일 해시를 바꾸되 인간 눈에는 동일해 보이는 이미지를 만든다.
// 쿠팡의 퍼셉추얼 해시 매칭을 회피하기 위함.
//
// 라이브러리: jimp (pure JS, native 의존성 없음, Vercel 호환)
// npm install jimp 필요 — 미설치 시 원본 이미지 그대로 반환
// ============================================================

import { createSeededRandom, stringToSeed } from './seeded-random';

/** 변형 파라미터 */
export interface VariationParams {
  /** 밝기 조정 (-0.02 ~ +0.02) */
  brightness: number;
  /** JPEG 품질 (80~94) */
  quality: number;
  /** 크롭 방향 (top/bottom/left/right/center) */
  cropDirection: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** 크롭 비율 (0.01 ~ 0.02, 즉 1~2%) */
  cropRatio: number;
  /** 흰색 보더 패딩 (0~3px) */
  borderPadding: number;
  /** 채도 조정 (-0.05 ~ +0.05) */
  saturation: number;
  /** 픽셀 노이즈 강도 (0~2, 각 채널 ±N) */
  noiseIntensity: number;
  /** 감마 보정 (0.97~1.03) */
  gamma: number;
  /** 색온도 시프트 (-3~+3, 양수=따뜻) */
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

const CROP_DIRECTIONS = ['top', 'bottom', 'left', 'right', 'center'] as const;

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * 셀러 시드 + 이미지 인덱스로 결정적 변형 파라미터 생성
 */
export function generateVariationParams(sellerSeed: string, imageIndex: number): VariationParams {
  const seed = stringToSeed(`${sellerSeed}:img:${imageIndex}`);
  const rng = createSeededRandom(seed);

  return {
    brightness: (rng() * 0.04) - 0.02,              // -0.02 ~ +0.02
    quality: Math.floor(rng() * 15) + 80,            // 80 ~ 94
    cropDirection: CROP_DIRECTIONS[Math.floor(rng() * 5)],
    cropRatio: 0.01 + rng() * 0.01,                  // 1% ~ 2%
    borderPadding: Math.floor(rng() * 4),             // 0 ~ 3px
    saturation: (rng() * 0.10) - 0.05,               // -0.05 ~ +0.05
    noiseIntensity: Math.floor(rng() * 3),            // 0, 1, 2
    gamma: 0.97 + rng() * 0.06,                      // 0.97 ~ 1.03
    colorTempShift: Math.floor(rng() * 7) - 3,       // -3 ~ +3
    microResizeX: Math.floor(rng() * 9) - 4,         // -4 ~ +4
    microResizeY: Math.floor(rng() * 9) - 4,         // -4 ~ +4
    channelOffsetR: Math.floor(rng() * 5) - 2,       // -2 ~ +2
    channelOffsetG: Math.floor(rng() * 5) - 2,       // -2 ~ +2
    channelOffsetB: Math.floor(rng() * 5) - 2,       // -2 ~ +2
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
    const image = await Jimp.read(buffer);
    const w: number = image.getWidth();
    const h: number = image.getHeight();

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

    // 2. 밝기 조정
    if (params.brightness !== 0) {
      image.brightness(params.brightness);
    }

    // 3. 채도 조정
    if (params.saturation !== 0) {
      image.color([{ apply: 'saturate', params: [params.saturation * 100] }]);
    }

    // 4. 픽셀 단일 순회: 감마 + 색온도 + 채널 오프셋 + 노이즈 일괄 적용
    const needsPixelPass =
      params.gamma !== 1.0 ||
      params.colorTempShift !== 0 ||
      params.channelOffsetR !== 0 || params.channelOffsetG !== 0 || params.channelOffsetB !== 0 ||
      params.noiseIntensity > 0;

    if (needsPixelPass) {
      const data = image.bitmap.data;
      const invGamma = 1 / params.gamma;
      const applyGamma = Math.abs(invGamma - 1) > 0.001;

      // 노이즈용 별도 시드 RNG
      const noiseRng = params.noiseIntensity > 0
        ? createSeededRandom(stringToSeed(noiseSeed || 'noise-default'))
        : null;

      for (let i = 0; i < data.length; i += 4) {
        let r = data[i], g = data[i + 1], b = data[i + 2];

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

    // 5. 마이크로 리사이즈
    if (params.microResizeX !== 0 || params.microResizeY !== 0) {
      const curW = image.getWidth();
      const curH = image.getHeight();
      const newW = Math.max(1, curW + params.microResizeX);
      const newH = Math.max(1, curH + params.microResizeY);
      image.resize(newW, newH);
    }

    // 6. 흰색 보더 (이미지 크기 미세 변경)
    if (params.borderPadding > 0) {
      const pad = params.borderPadding;
      const newW = image.getWidth() + pad * 2;
      const newH = image.getHeight() + pad * 2;
      const canvas = new Jimp(newW, newH, 0xFFFFFFFF);
      canvas.composite(image, pad, pad);
      const MIME_JPEG = Jimp.MIME_JPEG || 'image/jpeg';
      return await canvas.quality(params.quality).getBufferAsync(MIME_JPEG);
    }

    // 7. JPEG 품질 설정 후 버퍼 반환
    const MIME_JPEG = Jimp.MIME_JPEG || 'image/jpeg';
    return await image.quality(params.quality).getBufferAsync(MIME_JPEG);
  } catch (err) {
    console.warn('[image-variation] 변형 실패 — 원본 반환:', err instanceof Error ? err.message : err);
    return buffer;
  }
}
