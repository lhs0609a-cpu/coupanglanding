// ============================================================
// 썸네일 처리
//   기본(cutout): BiRefNet 누끼 + 흰배경 1:1 무크롭 — 상품 픽셀 보존(완벽 재현)
//   재생성(regenerate, PT 원클릭): 누끼 → 파임 prefill → SDXL img2img(전체 균일 재생성)
//                                  → 재누끼 → 흰배경 1:1
//     · 잘림/지저분/흐림 대표사진을 "깨끗한 스튜디오 컷"으로. 인페인트와 달리 패치 경계 없음.
//     · img2img 는 ComfyUI(GPU) 가 수행(img2imgFn 주입). 실패 시 누끼 결과로 폴백.
//     · 생성이라 실물과 미세 차이 → PT 가 확인 후 사용(원클릭 옵션).
//
// 모델: onnx-community/BiRefNet_lite (MIT). userData/hf-cache 에 최초 1회 캐시.
// ============================================================

import sharp from 'sharp';
import { pipeline, env, RawImage } from '@huggingface/transformers';

const MODEL = 'onnx-community/BiRefNet_lite';
const CANVAS = 1000;
const PAD_RATIO = 0.06;
const WORK = 1024;        // img2img 작업 해상도 (SDXL 친화)

let _removerPromise = null;
function getRemover(cacheDir) {
  if (!_removerPromise) {
    env.allowLocalModels = false;
    if (cacheDir) env.cacheDir = cacheDir;
    _removerPromise = pipeline('background-removal', MODEL, { dtype: 'fp32' });
  }
  return _removerPromise;
}

/** 누끼 → 투명 트림된 RGBA PNG */
async function cutout(inputBuffer, cacheDir) {
  const remove = await getRemover(cacheDir);
  const out = await remove(await RawImage.fromBlob(new Blob([inputBuffer])));
  const fg = Array.isArray(out) ? out[0] : out;
  const png = await sharp(Buffer.from(fg.data), { raw: { width: fg.width, height: fg.height, channels: fg.channels } }).png().toBuffer();
  try { return await sharp(png).trim().png().toBuffer(); } catch { return png; }
}

/** 누끼 RGBA → 순백 1:1 무크롭 */
async function composeWhite(cutoutPng, canvas = CANVAS, padRatio = PAD_RATIO) {
  const inner = Math.max(1, Math.round(canvas * (1 - padRatio * 2)));
  const resized = await sharp(cutoutPng).resize(inner, inner, { fit: 'inside' }).png().toBuffer();
  const m = await sharp(resized).metadata();
  return sharp({ create: { width: canvas, height: canvas, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: resized, left: Math.max(0, Math.round((canvas - (m.width || inner)) / 2)), top: Math.max(0, Math.round((canvas - (m.height || inner)) / 2)) }])
    .png().toBuffer();
}

/** 누끼 RGBA → WORK 정사각 RGB(흰배경). 파인 부분(볼록껍질)은 상품 평균색으로 prefill → 둥근 실루엣 */
async function prefillOnWhite(cutoutPng) {
  const S = WORK;
  const sq = await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp(cutoutPng).resize(Math.round(S * 0.9), Math.round(S * 0.9), { fit: 'inside' }).toBuffer(), gravity: 'center' }])
    .png().toBuffer();
  const raw = await sharp(sq).raw().toBuffer(); // RGBA
  const alpha = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) alpha[i] = raw[i * 4 + 3];

  // 상품 평균색
  let ar = 0, ag = 0, ab = 0, ac = 0;
  for (let i = 0; i < S * S; i++) if (alpha[i] > 128) { ar += raw[i * 4]; ag += raw[i * 4 + 1]; ab += raw[i * 4 + 2]; ac++; }
  if (!ac) return null;
  ar = ar / ac | 0; ag = ag / ac | 0; ab = ab / ac | 0;

  // 볼록껍질 (행별 좌/우 극점 → monotone chain)
  const pts = [];
  for (let y = 0; y < S; y++) { let l = -1, r = -1; for (let x = 0; x < S; x++) if (alpha[y * S + x] > 128) { if (l < 0) l = x; r = x; } if (l >= 0) { pts.push([l, y]); pts.push([r, y]); } }
  if (pts.length < 3) return null;
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  const up = []; for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  const hull = lo.slice(0, -1).concat(up.slice(0, -1));
  const inP = (px, py) => { let c = false; for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) { const xi = hull[i][0], yi = hull[i][1], xj = hull[j][0], yj = hull[j][1]; if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) c = !c; } return c; };

  // RGB: 상품=원본, 파임(껍질 안 & 투명)=평균색, 그 외=흰색
  const rgb = Buffer.alloc(S * S * 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    if (alpha[i] > 128) { rgb[i * 3] = raw[i * 4]; rgb[i * 3 + 1] = raw[i * 4 + 1]; rgb[i * 3 + 2] = raw[i * 4 + 2]; }
    else if (inP(x, y)) { rgb[i * 3] = ar; rgb[i * 3 + 1] = ag; rgb[i * 3 + 2] = ab; }
    else { rgb[i * 3] = 255; rgb[i * 3 + 1] = 255; rgb[i * 3 + 2] = 255; }
  }
  return sharp(rgb, { raw: { width: S, height: S, channels: 3 } }).png().toBuffer();
}

/**
 * @param {Buffer} inputBuffer
 * @param {{canvas?:number,padRatio?:number,cacheDir?:string,
 *          mode?:'cutout'|'regenerate', img2imgFn?:(rgbPng:Buffer)=>Promise<Buffer>}} [opts]
 */
export async function processCutoutThumbnail(inputBuffer, { canvas = CANVAS, padRatio = PAD_RATIO, cacheDir, mode = 'cutout', img2imgFn } = {}) {
  const cut = await cutout(inputBuffer, cacheDir);

  if (mode === 'regenerate' && img2imgFn) {
    try {
      const prefilled = await prefillOnWhite(cut);            // 파임 채운 흰배경 입력
      if (prefilled) {
        const regen = await img2imgFn(prefilled);             // ComfyUI SDXL img2img(전체 균일 재생성)
        const recut = await cutout(regen, cacheDir);          // 재누끼
        return composeWhite(recut, canvas, padRatio);
      }
    } catch (e) {
      console.warn('[thumb] 재생성 실패 → 누끼 폴백:', e?.message || e);
    }
  }

  return composeWhite(cut, canvas, padRatio);
}
