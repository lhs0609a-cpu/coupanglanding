// ============================================================
// 썸네일 처리: 누끼 + (파임 보정 인페인팅) + 흰배경 1:1 무크롭
//
// 흐름:
//   ① BiRefNet 누끼 — 배경/손 제거(상품 픽셀 보존)
//   ② 파임 감지 — 누끼 실루엣의 볼록껍질(convex hull) − 현재 상품 = 손/가림으로 파인 영역
//   ③ 파임 채우기:
//        - inpaintFn 주어지면(워커: ComfyUI SDXL 인페인트) → 그 영역을 자연스럽게 생성(티 안 남)
//        - 없으면 누끼 그대로(파인 채로) — 폴백
//   ④ 순백 #FFFFFF, 1:1, 무크롭 패딩
//
// 안전장치: 인페인트 실패/예외 시 ②③ 건너뛰고 누끼 결과로 폴백 → 워커 절대 안 깨짐.
// 보수성: 파임이 너무 크거나(원래 오목한 상품일 수 있음) 너무 작으면 인페인트 안 함.
//   모델: BiRefNet_lite(MIT). 인페인트는 워커가 ComfyUI(SDXL, GPU)로 수행.
// ============================================================

import sharp from 'sharp';
import { pipeline, env, RawImage } from '@huggingface/transformers';

const MODEL = 'onnx-community/BiRefNet_lite';
const CANVAS = 1000;
const PAD_RATIO = 0.06;
const WORK = 1024;             // 인페인트 작업 해상도 (SDXL 친화)
const NOTCH_MIN = 0.004;       // 파임이 상품면적의 0.4% 미만이면 무시(자잘한 잡티)
const NOTCH_MAX = 0.12;        // 12% 초과면 인페인트 안 함(원래 오목한 형태일 수 있음 → 오생성 방지)

let _removerPromise = null;
function getRemover(cacheDir) {
  if (!_removerPromise) {
    env.allowLocalModels = false;
    if (cacheDir) env.cacheDir = cacheDir;
    _removerPromise = pipeline('background-removal', MODEL, { dtype: 'fp32' });
  }
  return _removerPromise;
}

/** RGBA raw 의 알파로 볼록껍질 마스크 + 파임 마스크(팽창) 계산 */
function computeNotch(alpha, S) {
  // 행별 좌/우 극점 → 볼록껍질(monotone chain)
  const pts = [];
  for (let y = 0; y < S; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < S; x++) if (alpha[y * S + x] > 128) { if (l < 0) l = x; r = x; }
    if (l >= 0) { pts.push([l, y]); pts.push([r, y]); }
  }
  if (pts.length < 3) return null;
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  const up = []; for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  const hull = lo.slice(0, -1).concat(up.slice(0, -1));
  const inP = (px, py) => { let c = false; for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) { const xi = hull[i][0], yi = hull[i][1], xj = hull[j][0], yj = hull[j][1]; if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) c = !c; } return c; };
  const hullMask = new Uint8Array(S * S), fill = new Uint8Array(S * S);
  let appleArea = 0, notchArea = 0;
  for (let i = 0; i < S * S; i++) if (alpha[i] > 128) appleArea++;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (inP(x, y)) { hullMask[y * S + x] = 1; if (alpha[y * S + x] <= 128) { fill[y * S + x] = 1; notchArea++; } }
  }
  // 팽창(seam 블렌딩, r=6)
  const dil = new Uint8Array(S * S), R = 6;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!fill[y * S + x]) continue;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const ny = y + dy, nx = x + dx; if (ny >= 0 && ny < S && nx >= 0 && nx < S) dil[ny * S + nx] = 1; }
  }
  return { hullMask, notchMask: dil, appleArea, notchArea };
}

/**
 * @param {Buffer} inputBuffer 원본
 * @param {{canvas?:number,padRatio?:number,cacheDir?:string,
 *          inpaintFn?:(rgbaPng:Buffer)=>Promise<Buffer>}} [opts]
 *   inpaintFn: 마스크(알파=0 영역)를 채워 RGB PNG를 반환. 워커에선 ComfyUI SDXL 인페인트.
 */
export async function processCutoutThumbnail(inputBuffer, { canvas = CANVAS, padRatio = PAD_RATIO, cacheDir, inpaintFn } = {}) {
  const remove = await getRemover(cacheDir);
  const out = await remove(await RawImage.fromBlob(new Blob([inputBuffer])));
  const fg = Array.isArray(out) ? out[0] : out;
  let cutout = await sharp(Buffer.from(fg.data), { raw: { width: fg.width, height: fg.height, channels: fg.channels } }).png().toBuffer();
  try { cutout = await sharp(cutout).trim().png().toBuffer(); } catch { /* keep */ }

  // ── 파임 보정(인페인트) ── inpaintFn 있고, 파임이 적당한 크기일 때만
  if (inpaintFn) {
    try {
      const result = await tryInpaintNotch(cutout, inpaintFn);
      if (result) cutout = result;
    } catch (e) {
      console.warn('[thumb] 파임 인페인트 실패 → 누끼-only 폴백:', e?.message || e);
    }
  }

  // ── 순백 1:1 무크롭 합성 ──
  const inner = Math.max(1, Math.round(canvas * (1 - padRatio * 2)));
  const resized = await sharp(cutout).resize(inner, inner, { fit: 'inside' }).png().toBuffer();
  const meta = await sharp(resized).metadata();
  const left = Math.max(0, Math.round((canvas - (meta.width || inner)) / 2));
  const top = Math.max(0, Math.round((canvas - (meta.height || inner)) / 2));
  return sharp({ create: { width: canvas, height: canvas, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: resized, left, top }]).png().toBuffer();
}

/** 파임 감지 → SDXL 인페인트 입력 RGBA 구성 → inpaintFn → 채워진 상품 RGBA 반환. 부적합 시 null. */
async function tryInpaintNotch(cutoutPng, inpaintFn) {
  // 정사각 작업 캔버스(투명 패딩)
  const sq = await sharp({ create: { width: WORK, height: WORK, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp(cutoutPng).resize(Math.round(WORK * 0.9), Math.round(WORK * 0.9), { fit: 'inside' }).toBuffer(), gravity: 'center' }])
    .png().toBuffer();
  const raw = await sharp(sq).raw().toBuffer(); // RGBA
  const S = WORK;
  const alpha = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) alpha[i] = raw[i * 4 + 3];

  const nm = computeNotch(alpha, S);
  if (!nm) return null;
  const ratio = nm.appleArea ? nm.notchArea / nm.appleArea : 0;
  if (ratio < NOTCH_MIN || ratio > NOTCH_MAX) return null; // 너무 작거나 큼 → 인페인트 안 함

  // 상품 평균색(인페인트 컨텍스트용 배경)
  let ar = 0, ag = 0, ab = 0, ac = 0;
  for (let i = 0; i < S * S; i++) if (alpha[i] > 128) { ar += raw[i * 4]; ag += raw[i * 4 + 1]; ab += raw[i * 4 + 2]; ac++; }
  ar = ar / ac | 0; ag = ag / ac | 0; ab = ab / ac | 0;

  // 인페인트 입력 RGBA: RGB = 상품(실제) 외에는 평균색 / ALPHA = 파임만 0(=ComfyUI mask=1 inpaint), 그 외 255
  const inRgba = Buffer.alloc(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const real = alpha[i] > 128;
    inRgba[i * 4] = real ? raw[i * 4] : ar;
    inRgba[i * 4 + 1] = real ? raw[i * 4 + 1] : ag;
    inRgba[i * 4 + 2] = real ? raw[i * 4 + 2] : ab;
    inRgba[i * 4 + 3] = nm.notchMask[i] ? 0 : 255;
  }
  const inPng = await sharp(inRgba, { raw: { width: S, height: S, channels: 4 } }).png().toBuffer();

  // ComfyUI SDXL 인페인트 (실패 시 throw → 상위에서 폴백)
  const outPng = await inpaintFn(inPng);

  // 결과(RGB)를 볼록껍질 실루엣으로 잘라 RGBA 반환 (껍질=상품, 밖=투명)
  const outRaw = await sharp(outPng).resize(S, S, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const finalRgba = Buffer.alloc(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const keep = nm.hullMask[i];
    finalRgba[i * 4] = outRaw[i * 3]; finalRgba[i * 4 + 1] = outRaw[i * 3 + 1]; finalRgba[i * 4 + 2] = outRaw[i * 3 + 2];
    finalRgba[i * 4 + 3] = keep ? 255 : 0;
  }
  return sharp(finalRgba, { raw: { width: S, height: S, channels: 4 } }).png().trim().toBuffer();
}
