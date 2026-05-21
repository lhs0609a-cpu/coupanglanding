/**
 * 배치 루트에서 product_* / main_images 구조를 걸어 대표 썸네일 후보를 수집.
 * (브라우저 client-folder-scanner 와 동일한 규칙: 정렬 첫 장 = 쿠팡 대표이미지)
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const IMAGE_RE = /\.(jpg|jpeg|png|webp)$/i;
// 광고/배지/UI 이미지 — scanner 의 AD_PATTERN 과 동일
const AD_RE = /(?:^|[_\-.])(npay|naverpay|naver_|naver-|smartstore|kakaopay|tosspay|payco|banner|badge|icon|logo|watermark|stamp|popup|event_banner|coupon|ad_|promotion|btn_|button_|shopping_|store_|delivery_info|return_info|guide_|notice_ban|footer|header)/i;

const numericSort = (a, b) => a.localeCompare(b, undefined, { numeric: true });

async function listImages(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && IMAGE_RE.test(e.name) && !AD_RE.test(e.name))
    .map((e) => e.name)
    .sort(numericSort);
}

/**
 * @param {string} root 배치 루트 (product_* 들을 포함)
 * @param {boolean} allMain true면 대표후보 전체, false면 정렬 첫 장만(대표 썸네일)
 * @returns {Promise<Array<{productCode, dir, mainImagesDir, images: string[]}>>}
 */
export async function collectTargets(root, allMain = false) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (err) {
    throw new Error(`배치 루트를 읽을 수 없습니다: ${root}\n${err.message}`);
  }
  const productDirs = entries
    .filter((e) => e.isDirectory() && e.name.startsWith('product_'))
    .map((e) => e.name)
    .sort(numericSort);

  const targets = [];
  for (const name of productDirs) {
    const dir = join(root, name);
    const mainImagesDir = join(dir, 'main_images');
    const imgs = await listImages(mainImagesDir);
    if (imgs.length === 0) continue;
    targets.push({
      productCode: name.replace('product_', ''),
      dir,
      mainImagesDir,
      images: allMain ? imgs : [imgs[0]],
    });
  }
  return targets;
}
