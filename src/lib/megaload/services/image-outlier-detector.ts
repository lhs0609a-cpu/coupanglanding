// ============================================================
// dHash 기반 대표이미지 이탈치 감지
//
// 같은 상품의 main_images 폴더에는 실제 상품 사진들이 시각적으로
// 비슷한 군집을 형성하지만, 크롤링 결과에 텍스트 배너/로고/광고
// 이미지가 섞여 들어오는 경우가 있다. 파일명으로는 식별이
// 불가능(예: image_2.jpg)하므로 픽셀 기반 분석이 필요하다.
//
// 알고리즘:
//  1. 각 이미지의 64-bit dHash(9x8 grayscale) 계산
//  2. medoid(다른 모든 해시와의 합 거리가 최소인 해시) 탐색
//  3. medoid에서의 해밍 거리 분포로 임계값 산정 (MAD 기반)
//  4. 임계값 초과 이미지를 이탈치로 반환 (최대 N/2로 캡)
//
// 성능: 이미지당 ~3ms (9x8 canvas 렌더 + 64-bit 해시)
// ============================================================

import type { ScannedImageFile } from './client-folder-scanner';

const DHASH_W = 9;
const DHASH_H = 8;
const MIN_IMAGES = 5; // 이보다 적으면 군집 통계가 무의미
const HASH_CONCURRENCY = 8;
const DIST_FLOOR = 22; // medoid 거리가 이보다 작으면 이탈치 아님 (절대 임계)
const MAD_K = 2.5;     // median + K*MAD 위면 이탈치

export interface OutlierResult {
  outlierIndices: Set<number>;
  debug: string;
}

/**
 * dHash(difference hash): 9x8 grayscale로 축소하여 가로 인접 픽셀
 * 밝기 비교로 64-bit 지문을 만든다. 색상/해상도 변화에 강건하며
 * 이미지의 구조적 특징(텍스트 vs 사진)을 잘 포착한다.
 */
async function computeDHash(objectUrl: string): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = DHASH_W;
        canvas.height = DHASH_H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        // 투명 PNG는 흰 배경으로 합성 (로고 감지 일관성)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, DHASH_W, DHASH_H);
        ctx.drawImage(img, 0, 0, DHASH_W, DHASH_H);
        const { data } = ctx.getImageData(0, 0, DHASH_W, DHASH_H);

        const hash = new Uint8Array(DHASH_H);
        for (let y = 0; y < DHASH_H; y++) {
          let byte = 0;
          for (let x = 0; x < DHASH_H; x++) {
            const iL = (y * DHASH_W + x) * 4;
            const iR = iL + 4;
            const gL = 0.299 * data[iL] + 0.587 * data[iL + 1] + 0.114 * data[iL + 2];
            const gR = 0.299 * data[iR] + 0.587 * data[iR + 1] + 0.114 * data[iR + 2];
            if (gL < gR) byte |= 1 << (7 - x);
          }
          hash[y] = byte;
        }
        resolve(hash);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = objectUrl;
  });
}

function hamming(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = a[i] ^ b[i];
    while (x) { x &= x - 1; d++; }
  }
  return d;
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

/**
 * 대표이미지 군집에서 이탈치를 탐지한다.
 *
 * - 이미지가 5장 미만이면 통계가 불안정하므로 건너뛴다.
 * - 이탈치는 전체의 절반을 넘지 않도록 캡(cap)을 걸어
 *   실제 상품이 소수인 경우의 오탐을 방지한다.
 */
export async function detectVisualOutliers(images: ScannedImageFile[]): Promise<OutlierResult> {
  if (images.length < MIN_IMAGES) {
    return { outlierIndices: new Set(), debug: `skipped n=${images.length}<${MIN_IMAGES}` };
  }

  const hashes = await runPool(images, HASH_CONCURRENCY, (img) =>
    img.objectUrl ? computeDHash(img.objectUrl) : Promise.resolve(null),
  );

  const valid = hashes
    .map((h, i) => ({ h, i }))
    .filter((x): x is { h: Uint8Array; i: number } => x.h !== null);

  if (valid.length < MIN_IMAGES) {
    return { outlierIndices: new Set(), debug: `skipped valid=${valid.length}<${MIN_IMAGES}` };
  }

  // medoid: 다른 모든 해시와의 합 해밍 거리가 최소인 원소
  let medoidI = valid[0].i;
  let medoidTotal = Infinity;
  for (const { h: hi, i } of valid) {
    let sum = 0;
    for (const { h: hj } of valid) sum += hamming(hi, hj);
    if (sum < medoidTotal) { medoidTotal = sum; medoidI = i; }
  }
  const medoid = hashes[medoidI]!;

  const dists = valid.map(({ h, i }) => ({ i, d: hamming(medoid, h) }));
  const sorted = dists.map(x => x.d).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const devs = sorted.map(d => Math.abs(d - median)).sort((a, b) => a - b);
  const mad = devs[Math.floor(devs.length / 2)];
  const threshold = Math.max(DIST_FLOOR, median + MAD_K * mad);

  const candidates = dists.filter(x => x.d > threshold).sort((a, b) => b.d - a.d);
  const cap = Math.floor(images.length / 2);
  const outlierIndices = new Set(candidates.slice(0, cap).map(c => c.i));

  const outlierDesc = [...outlierIndices]
    .map(i => `#${i + 1}(${images[i].name},d=${dists.find(x => x.i === i)!.d})`)
    .join(', ') || 'none';
  const debug = `medoid=#${medoidI + 1}(${images[medoidI].name}) median=${median} MAD=${mad} th=${threshold.toFixed(1)} outliers=${outlierDesc}`;

  return { outlierIndices, debug };
}
