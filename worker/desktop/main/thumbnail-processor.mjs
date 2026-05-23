// ============================================================
// 썸네일 처리 (1단계: 누끼 + 흰배경 + 1:1 무크롭 패딩)
//
// 생성형(SDXL) 이 아니라 "배경 제거(누끼) + 합성" 이라 상품 픽셀을 그대로 보존한다(완벽 재현).
//   1) @imgly/background-removal-node 로 배경 제거 → 투명(RGBA) 누끼
//   2) sharp 로 투명 여백 트림 → 상품 바운딩박스
//   3) 1:1 캔버스 안쪽(여백 제외)에 비율 유지로 맞춤 (fit:inside → 절대 안 잘림)
//   4) 순백(#FFFFFF) 정사각 캔버스 중앙에 합성 → PNG
//
// ⚠️ 잘린 상품(프레임에 걸쳐 잘림)은 여기선 그대로 누끼만 됨 — 2단계에서 아웃페인팅으로 완성 예정.
// 비용: 모델은 최초 1회 CDN 다운로드(무료), 이후 로컬. 외부 유료 호출 없음.
// ============================================================

import sharp from 'sharp';
import { removeBackground } from '@imgly/background-removal-node';

const CANVAS = 1000;     // 출력 정사각 px (쿠팡 권장 1000~)
const PAD_RATIO = 0.06;  // 가장자리 여백 비율 — 상품이 프레임에 닿아 잘려보이지 않게

/**
 * @param {Buffer} inputBuffer  원본 이미지
 * @param {{canvas?:number, padRatio?:number}} [opts]
 * @returns {Promise<Buffer>}   순백 1:1 PNG
 */
export async function processCutoutThumbnail(inputBuffer, { canvas = CANVAS, padRatio = PAD_RATIO } = {}) {
  // 1) 배경 제거(누끼) → RGBA Blob
  const blob = await removeBackground(new Blob([inputBuffer]));
  const cutout = Buffer.from(await blob.arrayBuffer());

  // 2) 투명 여백 트림 → 상품 바운딩박스만 남김
  let trimmed;
  try {
    trimmed = await sharp(cutout).trim().png().toBuffer();
  } catch {
    // 트림 실패(전부 투명 등) 시 원본 누끼 그대로 사용
    trimmed = cutout;
  }

  // 3) 캔버스 안쪽(여백 제외)에 비율 유지로 맞춤 — fit:inside 이므로 어떤 부분도 잘리지 않음
  const inner = Math.max(1, Math.round(canvas * (1 - padRatio * 2)));
  const resized = await sharp(trimmed)
    .resize(inner, inner, { fit: 'inside' })
    .png()
    .toBuffer();
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
