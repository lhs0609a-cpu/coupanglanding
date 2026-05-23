// ============================================================
// 썸네일 처리 (1단계: 누끼 + 흰배경 + 1:1 무크롭 패딩)
//
// 생성형(SDXL) 이 아니라 "배경 제거(누끼)+합성" 이라 상품 픽셀을 그대로 보존(완벽 재현).
//   1) BiRefNet_lite(transformers.js)로 배경 제거 → 투명(RGBA) 누끼
//   2) sharp 로 투명 여백 트림 → 상품 바운딩박스
//   3) 1:1 캔버스 안쪽(여백 제외)에 비율 유지로 맞춤 (fit:inside → 절대 안 잘림)
//   4) 순백(#FFFFFF) 정사각 캔버스 중앙에 합성 → PNG
//
// 모델: onnx-community/BiRefNet_lite — **MIT 라이선스(상업적 사용 가능)**. 상품 누끼 품질 우수.
//   (RMBG-1.4 는 품질 좋으나 BRIA 비상업 라이선스라 판매용엔 부적합 → 사용 안 함)
//   최초 1회 HuggingFace 에서 다운로드 후 cacheDir(userData)에 영구 캐시. 외부 유료 호출 없음.
//   CPU 기준 장당 약 6초(백그라운드 처리이므로 허용). q8 양자화는 swin 미지원이라 fp32 사용.
//
// ⚠️ 잘린 상품(프레임에 걸쳐 잘림)은 여기선 누끼만 됨 — 2단계에서 아웃페인팅으로 완성 예정.
// ============================================================

import sharp from 'sharp';
import { pipeline, env, RawImage } from '@huggingface/transformers';

const MODEL = 'onnx-community/BiRefNet_lite';
const CANVAS = 1000;     // 출력 정사각 px
const PAD_RATIO = 0.06;  // 가장자리 여백 — 상품이 프레임에 닿아 잘려보이지 않게

// 파이프라인은 1회 로드 후 재사용(로드 ~5초). 매 작업마다 재로드 금지.
let _removerPromise = null;
function getRemover(cacheDir) {
  if (!_removerPromise) {
    env.allowLocalModels = false;
    if (cacheDir) env.cacheDir = cacheDir; // 모델을 userData 에 캐시(최초 1회 다운로드 후 영구)
    _removerPromise = pipeline('background-removal', MODEL, { dtype: 'fp32' });
  }
  return _removerPromise;
}

/**
 * @param {Buffer} inputBuffer  원본 이미지
 * @param {{canvas?:number, padRatio?:number, cacheDir?:string}} [opts]
 * @returns {Promise<Buffer>}   순백 1:1 PNG
 */
export async function processCutoutThumbnail(inputBuffer, { canvas = CANVAS, padRatio = PAD_RATIO, cacheDir } = {}) {
  const remove = await getRemover(cacheDir);

  // 1) 배경 제거(누끼) → RGBA RawImage
  const out = await remove(await RawImage.fromBlob(new Blob([inputBuffer])));
  const fg = Array.isArray(out) ? out[0] : out;
  const cutout = await sharp(Buffer.from(fg.data), {
    raw: { width: fg.width, height: fg.height, channels: fg.channels },
  }).png().toBuffer();

  // 2) 투명 여백 트림 → 상품 바운딩박스만
  let trimmed;
  try { trimmed = await sharp(cutout).trim().png().toBuffer(); }
  catch { trimmed = cutout; }

  // 3) 캔버스 안쪽(여백 제외)에 비율 유지로 맞춤 — fit:inside 이므로 어떤 부분도 잘리지 않음
  const inner = Math.max(1, Math.round(canvas * (1 - padRatio * 2)));
  const resized = await sharp(trimmed).resize(inner, inner, { fit: 'inside' }).png().toBuffer();
  const meta = await sharp(resized).metadata();

  // 4) 순백 1:1 캔버스 중앙 합성
  const left = Math.max(0, Math.round((canvas - (meta.width || inner)) / 2));
  const top = Math.max(0, Math.round((canvas - (meta.height || inner)) / 2));
  return sharp({
    create: { width: canvas, height: canvas, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();
}
