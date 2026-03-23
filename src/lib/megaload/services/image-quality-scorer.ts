// ============================================================
// 이미지 품질 스코어링 서비스
// Canvas API로 대표이미지 후보를 분석하여 최적 이미지를 선택
//
// 분석 항목 (200x200 축소 기준):
//  - 배경 밝기 (20%): 흰색/밝은 배경 선호
//  - 중심 집중도 (15%): 피사체가 중앙에 있을수록 고점
//  - 종횡비 (5%): 1:1에 가까울수록 고점
//  - 텍스트 밀도 (15%): 엣지 과다(텍스트/워터마크) 감점
//  - 선명도 (10%): Laplacian 분산 — 흐릿한 이미지 감점
//  - 피부톤 비율 (20%): 피부색 픽셀 15%+ → 0점 (모델 사진 차단)
//  - 컨텐츠 충분도 (15%): 비백색 픽셀 5% 미만 → 감점 (빈 이미지 차단)
// ============================================================

export interface ImageScore {
  overall: number;
  background: number;
  centering: number;
  aspect: number;
  textDensity: number;
  sharpness: number;
  skinTone: number;
  contentSufficiency: number;
}

const ANALYSIS_SIZE = 200;
const DEFAULT_MIN_SCORE = 35;

/**
 * 여러 이미지를 스코어링하여 점수 순으로 정렬된 결과를 반환한다.
 * @param objectUrls - 분석할 이미지의 Object URL 배열
 * @returns 점수 내림차순 정렬된 { index, score } 배열
 */
export async function scoreMainImages(
  objectUrls: string[],
): Promise<{ index: number; score: ImageScore }[]> {
  if (objectUrls.length === 0) return [];

  const results: { index: number; score: ImageScore }[] = [];

  for (let i = 0; i < objectUrls.length; i++) {
    try {
      const score = await scoreImage(objectUrls[i]);
      results.push({ index: i, score });
    } catch {
      // 분석 실패 시 최저점
      results.push({
        index: i,
        score: { overall: 0, background: 0, centering: 0, aspect: 0, textDensity: 0, sharpness: 0, skinTone: 0, contentSufficiency: 0 },
      });
    }
  }

  // 점수 내림차순 정렬
  results.sort((a, b) => b.score.overall - a.score.overall);
  return results;
}

/**
 * 여러 이미지를 스코어링 + 필터링하여 부적합 이미지를 제거한다.
 * - overall < minScore → filtered: true
 * - 피부톤 15%+ → 하드 필터 (overall 강제 0)
 * @param objectUrls - 분석할 이미지의 Object URL 배열
 * @param minScore - 최소 통과 점수 (기본 35)
 * @returns 점수 내림차순 정렬된 { index, score, filtered } 배열
 */
export async function filterAndScoreMainImages(
  objectUrls: string[],
  minScore: number = DEFAULT_MIN_SCORE,
): Promise<{ index: number; score: ImageScore; filtered: boolean }[]> {
  if (objectUrls.length === 0) return [];

  const results: { index: number; score: ImageScore; filtered: boolean }[] = [];

  for (let i = 0; i < objectUrls.length; i++) {
    try {
      const score = await scoreImage(objectUrls[i]);
      const filtered = score.overall < minScore;
      results.push({ index: i, score, filtered });
    } catch {
      results.push({
        index: i,
        score: { overall: 0, background: 0, centering: 0, aspect: 0, textDensity: 0, sharpness: 0, skinTone: 0, contentSufficiency: 0 },
        filtered: true,
      });
    }
  }

  // 점수 내림차순 정렬
  results.sort((a, b) => b.score.overall - a.score.overall);
  return results;
}

/**
 * 단일 이미지를 분석하여 0~100 점수를 반환한다.
 */
async function scoreImage(objectUrl: string): Promise<ImageScore> {
  const img = await loadImage(objectUrl);
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

  // 200x200으로 축소하여 Canvas에 그리기
  const canvas = document.createElement('canvas');
  canvas.width = ANALYSIS_SIZE;
  canvas.height = ANALYSIS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  ctx.drawImage(img, 0, 0, origW, origH, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const imageData = ctx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const { data } = imageData;

  // 그레이스케일 변환 (분석용)
  const gray = new Float32Array(ANALYSIS_SIZE * ANALYSIS_SIZE);
  for (let i = 0; i < gray.length; i++) {
    const offset = i * 4;
    gray[i] = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  }

  // 1. 배경 밝기 (20%)
  const background = scoreBackground(data, ANALYSIS_SIZE, ANALYSIS_SIZE);

  // 2. 중심 집중도 (15%)
  const centering = scoreCentering(data, ANALYSIS_SIZE, ANALYSIS_SIZE);

  // 3. 종횡비 (5%)
  const aspect = scoreAspect(origW, origH);

  // 4. 텍스트 밀도 (15%) — Sobel 엣지
  const textDensity = scoreTextDensity(gray, ANALYSIS_SIZE, ANALYSIS_SIZE);

  // 5. 선명도 (10%) — Laplacian 분산
  const sharpness = scoreSharpness(gray, ANALYSIS_SIZE, ANALYSIS_SIZE);

  // 6. 피부톤 비율 (20%) — RGB heuristic
  const skinTone = scoreSkinTone(data, ANALYSIS_SIZE, ANALYSIS_SIZE);

  // 7. 컨텐츠 충분도 (15%) — 비백색 픽셀 비율
  const contentSufficiency = scoreContentSufficiency(data, ANALYSIS_SIZE, ANALYSIS_SIZE);

  const overall =
    background * 0.20 +
    centering * 0.15 +
    aspect * 0.05 +
    textDensity * 0.15 +
    sharpness * 0.10 +
    skinTone * 0.20 +
    contentSufficiency * 0.15;

  return { overall, background, centering, aspect, textDensity, sharpness, skinTone, contentSufficiency };
}

/**
 * 배경 밝기 점수: 상하좌우 10% 테두리 영역의 평균 밝기
 * 흰색(255)에 가까울수록 100점
 */
function scoreBackground(data: Uint8ClampedArray, w: number, h: number): number {
  const border = Math.floor(Math.min(w, h) * 0.1);
  let sum = 0;
  let count = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const isBorder = x < border || x >= w - border || y < border || y >= h - border;
      if (!isBorder) continue;
      const idx = (y * w + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      sum += lum;
      count++;
    }
  }

  const avgLum = count > 0 ? sum / count : 128;
  // 200+ → 100점, 100 이하 → 낮은 점수
  return Math.min(100, Math.max(0, (avgLum / 255) * 100));
}

/**
 * 중심 집중도: 중앙 40% vs 가장자리 색상 대비
 * 중앙에 피사체(어두운)가 있고 주변이 밝으면 고점
 */
function scoreCentering(data: Uint8ClampedArray, w: number, h: number): number {
  const cx = w / 2;
  const cy = h / 2;
  const innerR = Math.min(w, h) * 0.2; // 중앙 40% 반경
  const outerR = Math.min(w, h) * 0.45;

  let innerSum = 0, innerCount = 0;
  let outerSum = 0, outerCount = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const idx = (y * w + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

      if (dist <= innerR) {
        innerSum += lum;
        innerCount++;
      } else if (dist >= outerR) {
        outerSum += lum;
        outerCount++;
      }
    }
  }

  const innerAvg = innerCount > 0 ? innerSum / innerCount : 128;
  const outerAvg = outerCount > 0 ? outerSum / outerCount : 128;

  // 중앙과 가장자리의 색상 차이가 클수록 좋음 (피사체 존재)
  const diff = Math.abs(outerAvg - innerAvg);
  // diff 50+ → 100점, 0 → 30점 (차이 없어도 기본점)
  return Math.min(100, 30 + (diff / 50) * 70);
}

/**
 * 종횡비 점수: 1:1에 가까울수록 100점
 */
function scoreAspect(w: number, h: number): number {
  const ratio = Math.min(w, h) / Math.max(w, h);
  // ratio 1.0 → 100, 0.5 → 50, 0.5 미만 → 페널티
  if (ratio < 0.5) return ratio * 60; // 0.3 → 18점
  return ratio * 100;
}

/**
 * 텍스트 밀도 점수: Sobel 엣지 밀도
 * 엣지가 너무 많으면(텍스트/워터마크) 감점
 */
function scoreTextDensity(gray: Float32Array, w: number, h: number): number {
  let edgeCount = 0;
  const threshold = 50;
  const totalPixels = (w - 2) * (h - 2);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      // Sobel X
      const gx =
        -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)] +
        -2 * gray[y * w + (x - 1)] + 2 * gray[y * w + (x + 1)] +
        -gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)];
      // Sobel Y
      const gy =
        -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)] +
        gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      if (magnitude > threshold) edgeCount++;
    }
  }

  const edgeDensity = edgeCount / totalPixels;
  // 적절한 엣지(5~15%) → 100점, 30%+ (텍스트 과다) → 감점
  if (edgeDensity < 0.03) return 60; // 너무 단조로운 이미지
  if (edgeDensity <= 0.15) return 100; // 적절한 디테일
  if (edgeDensity <= 0.30) return 100 - (edgeDensity - 0.15) * 400; // 선형 감점
  return Math.max(0, 40 - (edgeDensity - 0.30) * 200); // 30%+ 강한 감점
}

/**
 * 선명도 점수: Laplacian 분산
 * 분산이 높을수록 선명, 낮으면 흐릿
 */
function scoreSharpness(gray: Float32Array, w: number, h: number): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      // Laplacian kernel: [0,1,0; 1,-4,1; 0,1,0]
      const lap =
        gray[(y - 1) * w + x] +
        gray[y * w + (x - 1)] +
        -4 * gray[y * w + x] +
        gray[y * w + (x + 1)] +
        gray[(y + 1) * w + x];

      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;

  // variance 500+ → 100점, 50 이하 → 낮은 점수
  return Math.min(100, Math.max(0, (variance / 500) * 100));
}

/**
 * 피부톤 비율 점수: RGB heuristic으로 피부색 픽셀 비율 측정
 * 모델/인물 사진 차단용
 *
 * 피부톤 판별:
 *   R > 95 && G > 40 && B > 20 &&
 *   R > G && R > B &&
 *   max(R,G,B) - min(R,G,B) > 15 &&
 *   |R - G| > 15
 *
 * - 15%+ → 0점 (하드 필터, overall도 0으로 강제)
 * - 10~15% → 50점 (경계)
 * - 10% 미만 → 100점
 */
function scoreSkinTone(data: Uint8ClampedArray, w: number, h: number): number {
  const totalPixels = w * h;
  let skinCount = 0;

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];

    if (
      r > 95 && g > 40 && b > 20 &&
      r > g && r > b &&
      Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
      Math.abs(r - g) > 15
    ) {
      skinCount++;
    }
  }

  const skinRatio = skinCount / totalPixels;

  if (skinRatio >= 0.15) return 0;   // 하드 필터: 모델 사진
  if (skinRatio >= 0.10) return 50;  // 경계
  return 100;
}

/**
 * 컨텐츠 충분도 점수: 비백색 픽셀(밝기 < 230) 비율
 * 빈 이미지/부품 클로즈업(화면 대부분 백색) 차단용
 *
 * - 5% 미만 → 20점 (거의 빈 이미지, 펌프 노즐 등)
 * - 5~15% → 60점
 * - 15~60% → 100점 (적절한 제품 크기)
 * - 60%+ → 80점 (배경 없이 꽉 찬 이미지)
 */
function scoreContentSufficiency(data: Uint8ClampedArray, w: number, h: number): number {
  const totalPixels = w * h;
  let nonWhiteCount = 0;

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    const lum = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
    if (lum < 230) {
      nonWhiteCount++;
    }
  }

  const contentRatio = nonWhiteCount / totalPixels;

  if (contentRatio < 0.05) return 20;   // 거의 빈 이미지
  if (contentRatio < 0.15) return 60;   // 부족
  if (contentRatio <= 0.60) return 100;  // 적절
  return 80;                             // 꽉 참
}

/**
 * Object URL로부터 HTMLImageElement를 로드
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`이미지 로드 실패: ${url}`));
    img.src = url;
  });
}
