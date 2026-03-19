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
  /** JPEG 품질 (82~95) */
  quality: number;
  /** 크롭 방향 (top/bottom/left/right/center) */
  cropDirection: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** 크롭 비율 (0.01 ~ 0.03, 즉 1~3%) */
  cropRatio: number;
  /** 흰색 보더 패딩 (0~4px) */
  borderPadding: number;
}

const CROP_DIRECTIONS = ['top', 'bottom', 'left', 'right', 'center'] as const;

/**
 * 셀러 시드 + 이미지 인덱스로 결정적 변형 파라미터 생성
 */
export function generateVariationParams(sellerSeed: string, imageIndex: number): VariationParams {
  const seed = stringToSeed(`${sellerSeed}:img:${imageIndex}`);
  const rng = createSeededRandom(seed);

  return {
    brightness: (rng() * 0.04) - 0.02,           // -0.02 ~ +0.02
    quality: Math.floor(rng() * 14) + 82,         // 82 ~ 95
    cropDirection: CROP_DIRECTIONS[Math.floor(rng() * 5)],
    cropRatio: 0.01 + rng() * 0.02,               // 1% ~ 3%
    borderPadding: Math.floor(rng() * 5),          // 0 ~ 4px
  };
}

/**
 * 이미지 버퍼에 변형을 적용하고 새 버퍼를 반환
 * jimp가 설치되지 않은 경우 원본 버퍼를 그대로 반환한다.
 */
export async function applyVariation(buffer: Buffer, params: VariationParams): Promise<Buffer> {
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

    // 3. 흰색 보더 (이미지 크기 미세 변경)
    if (params.borderPadding > 0) {
      const pad = params.borderPadding;
      const newW = image.getWidth() + pad * 2;
      const newH = image.getHeight() + pad * 2;
      const canvas = new Jimp(newW, newH, 0xFFFFFFFF);
      canvas.composite(image, pad, pad);
      const MIME_JPEG = Jimp.MIME_JPEG || 'image/jpeg';
      return await canvas.quality(params.quality).getBufferAsync(MIME_JPEG);
    }

    // 4. JPEG 품질 설정 후 버퍼 반환
    const MIME_JPEG = Jimp.MIME_JPEG || 'image/jpeg';
    return await image.quality(params.quality).getBufferAsync(MIME_JPEG);
  } catch (err) {
    console.warn('[image-variation] 변형 실패 — 원본 반환:', err instanceof Error ? err.message : err);
    return buffer;
  }
}
