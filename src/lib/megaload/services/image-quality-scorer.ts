// ============================================================
// 이미지 품질 스코어링 서비스
// Canvas API로 대표이미지 후보를 분석하여 최적 이미지를 선택
//
// 분석 항목 (200x200 축소 기준):
//  - 배경 밝기 (15%): 흰색/밝은 배경 선호
//  - 배경 채도 (15%): 컬러 배경 → 하드필터 (로고/배너/포장재 차단)
//  - 중심 집중도 (10%): 피사체가 중앙에 있을수록 고점
//  - 종횡비 (5%): 1:1에 가까울수록 고점
//  - 텍스트 밀도 (10%): 엣지 과다(텍스트/워터마크) 감점
//  - 선명도 (10%): Laplacian 분산 — 흐릿한 이미지 감점
//  - 피부톤 비율 (15%): 피부색 픽셀 15%+ → 하드필터 (모델 사진 차단)
//  - 컨텐츠 충분도 (10%): 비백색 픽셀 5% 미만 → 하드필터 (빈 이미지 차단)
//  - 색상 다양성 (10%): 색상 분포가 너무 단순하면 로고/아이콘 의심
//
// 하드필터 (해당 시 overall 강제 0):
//  - 피부톤 ≥ 15% (모델/인물 사진)
//  - 컨텐츠 < 5% (빈 이미지)
//  - 배경 채도 > 25% AND 밝기 < 180 (컬러 배경: 로고/배너/포장재)
//
// 이상치 감지 (detectOutlierImages):
//  - 같은 상품의 이미지 세트 내에서 색상 분포가 크게 다른 이미지 감지
//  - 다른 브랜드/상품 이미지 자동 제거
// ============================================================

export interface ImageScore {
  overall: number;
  background: number;
  backgroundSaturation: number;
  centering: number;
  aspect: number;
  textDensity: number;
  sharpness: number;
  skinTone: number;
  contentSufficiency: number;
  colorDiversity: number;
  /** 하드필터 사유 (해당 시) */
  hardFilterReason?: string;
}

const ANALYSIS_SIZE = 200;
const HISTOGRAM_SIZE = 64;
const DEFAULT_MIN_SCORE = 40;

// ---- 하드필터 상수 ----
const SKIN_RATIO_HARD = 0.15;        // 피부톤 15%+ → 차단
const CONTENT_RATIO_HARD = 0.05;     // 비백색 5% 미만 → 차단
const BG_SATURATION_HARD = 0.25;     // 배경 채도 25%+ → 차단
const BG_LUMINANCE_CEIL = 180;       // 배경 채도 차단은 밝기 180 미만일 때만

const ZERO_SCORE: ImageScore = {
  overall: 0, background: 0, backgroundSaturation: 0, centering: 0,
  aspect: 0, textDensity: 0, sharpness: 0, skinTone: 0,
  contentSufficiency: 0, colorDiversity: 0,
};

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
      results.push({ index: i, score: { ...ZERO_SCORE } });
    }
  }

  results.sort((a, b) => b.score.overall - a.score.overall);
  return results;
}

/**
 * 여러 이미지를 스코어링 + 필터링하여 부적합 이미지를 제거한다.
 * - overall < minScore → filtered: true
 * - 하드필터 해당 → overall 강제 0, filtered: true
 * @param objectUrls - 분석할 이미지의 Object URL 배열
 * @param minScore - 최소 통과 점수 (기본 40)
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
      results.push({ index: i, score: { ...ZERO_SCORE }, filtered: true });
    }
  }

  results.sort((a, b) => b.score.overall - a.score.overall);
  return results;
}

/**
 * 같은 상품의 이미지 세트에서 색상 분포가 크게 다른 이상치를 감지한다.
 * 다른 브랜드/상품 이미지를 자동 제거하는 용도.
 *
 * @param objectUrls - 같은 상품의 대표이미지 Object URL 배열
 * @param threshold - 이상치 판별 배수 (기본 2.0 = mean + 2*stddev)
 * @returns { index, isOutlier, distance }[] 배열
 */
export async function detectOutlierImages(
  objectUrls: string[],
  threshold = 2.0,
): Promise<{ index: number; isOutlier: boolean; distance: number }[]> {
  // 4장 이하면 이상치 감지 무의미
  if (objectUrls.length <= 4) {
    return objectUrls.map((_, i) => ({ index: i, isOutlier: false, distance: 0 }));
  }

  // 각 이미지의 색상 히스토그램 빌드
  const histograms: Float32Array[] = [];
  for (const url of objectUrls) {
    try {
      histograms.push(await buildColorHistogram(url));
    } catch {
      // 로드 실패 시 빈 히스토그램 (이상치로 자동 판별됨)
      histograms.push(new Float32Array(64));
    }
  }

  const bins = histograms[0].length;

  // 중앙값 히스토그램 계산
  const medianHist = new Float32Array(bins);
  for (let b = 0; b < bins; b++) {
    const values = histograms.map(h => h[b]).sort((a, c) => a - c);
    medianHist[b] = values[Math.floor(values.length / 2)];
  }

  // 각 이미지의 chi-squared 거리 계산
  const distances = histograms.map(hist => {
    let chi2 = 0;
    for (let b = 0; b < bins; b++) {
      const expected = medianHist[b];
      if (expected > 0.001) {
        chi2 += (hist[b] - expected) ** 2 / expected;
      }
    }
    return chi2;
  });

  // 평균 + 표준편차 기반 이상치 판별
  const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
  const stddev = Math.sqrt(
    distances.reduce((sum, d) => sum + (d - mean) ** 2, 0) / distances.length,
  );
  const cutoff = mean + threshold * stddev;

  return distances.map((d, i) => ({
    index: i,
    isOutlier: stddev > 0.01 && d > cutoff,
    distance: d,
  }));
}

// ================================================================
// 내부 함수
// ================================================================

/**
 * 단일 이미지를 분석하여 0~100 점수를 반환한다.
 * 하드필터 해당 시 overall = 0으로 강제.
 */
async function scoreImage(objectUrl: string): Promise<ImageScore> {
  const img = await loadImage(objectUrl);
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

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

  // 각 차원 스코어
  const background = scoreBackground(data, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const bgSatResult = scoreBackgroundSaturation(data, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const backgroundSaturation = bgSatResult.score;
  const centering = scoreCentering(data, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const aspect = scoreAspect(origW, origH);
  const textDensity = scoreTextDensity(gray, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const sharpness = scoreSharpness(gray, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const skinTone = scoreSkinTone(data, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const contentSufficiency = scoreContentSufficiency(data, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const colorDiversity = scoreColorDiversity(data, ANALYSIS_SIZE, ANALYSIS_SIZE);

  // ---- 하드필터 체크 ----
  let hardFilterReason: string | undefined;

  if (skinTone === 0) {
    hardFilterReason = 'skin_tone';
  } else if (contentSufficiency <= 20) {
    hardFilterReason = 'empty_image';
  } else if (bgSatResult.isHardFiltered) {
    hardFilterReason = 'colored_background';
  } else if (detectTextBanner(data, ANALYSIS_SIZE, ANALYSIS_SIZE)) {
    hardFilterReason = 'text_banner';
  }

  if (hardFilterReason) {
    return {
      overall: 0, background, backgroundSaturation, centering, aspect,
      textDensity, sharpness, skinTone, contentSufficiency, colorDiversity,
      hardFilterReason,
    };
  }

  // ---- 가중 합산 (100%) ----
  const overall =
    background * 0.15 +
    backgroundSaturation * 0.15 +
    centering * 0.10 +
    aspect * 0.05 +
    textDensity * 0.10 +
    sharpness * 0.10 +
    skinTone * 0.15 +
    contentSufficiency * 0.10 +
    colorDiversity * 0.10;

  return {
    overall, background, backgroundSaturation, centering, aspect,
    textDensity, sharpness, skinTone, contentSufficiency, colorDiversity,
  };
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
  return Math.min(100, Math.max(0, (avgLum / 255) * 100));
}

/**
 * 배경 채도 점수: 테두리 영역의 평균 채도(Saturation)를 측정
 * 상품 사진은 흰색/무채색 배경이 일반적 → 채도 낮을수록 고점
 *
 * 하드필터: 채도 > 25% AND 밝기 < 180 → 컬러 배경 (로고/배너/포장재)
 */
function scoreBackgroundSaturation(
  data: Uint8ClampedArray, w: number, h: number,
): { score: number; isHardFiltered: boolean; avgSaturation: number; avgLuminance: number } {
  const border = Math.floor(Math.min(w, h) * 0.1);
  let satSum = 0;
  let lumSum = 0;
  let count = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const isBorder = x < border || x >= w - border || y < border || y >= h - border;
      if (!isBorder) continue;
      const idx = (y * w + x) * 4;
      const r = data[idx] / 255;
      const g = data[idx + 1] / 255;
      const b = data[idx + 2] / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));

      satSum += s;
      lumSum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      count++;
    }
  }

  const avgSaturation = count > 0 ? satSum / count : 0;
  const avgLuminance = count > 0 ? lumSum / count : 128;

  // 하드필터: 컬러 배경
  const isHardFiltered = avgSaturation > BG_SATURATION_HARD && avgLuminance < BG_LUMINANCE_CEIL;

  // 점수: 채도 0% → 100점, 채도 20% → 60점, 채도 40%+ → 10점
  let score: number;
  if (avgSaturation < 0.05) {
    score = 100;
  } else if (avgSaturation < 0.15) {
    score = 100 - (avgSaturation - 0.05) * 400; // 0.05→100, 0.15→60
  } else if (avgSaturation < 0.30) {
    score = 60 - (avgSaturation - 0.15) * 333;  // 0.15→60, 0.30→10
  } else {
    score = Math.max(0, 10 - (avgSaturation - 0.30) * 50);
  }

  return { score: Math.max(0, score), isHardFiltered, avgSaturation, avgLuminance };
}

/**
 * 중심 집중도: 중앙 40% vs 가장자리 색상 대비
 * 중앙에 피사체(어두운)가 있고 주변이 밝으면 고점
 */
function scoreCentering(data: Uint8ClampedArray, w: number, h: number): number {
  const cx = w / 2;
  const cy = h / 2;
  const innerR = Math.min(w, h) * 0.2;
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

  const diff = Math.abs(outerAvg - innerAvg);
  return Math.min(100, 30 + (diff / 50) * 70);
}

/**
 * 종횡비 점수: 1:1에 가까울수록 100점
 */
function scoreAspect(w: number, h: number): number {
  const ratio = Math.min(w, h) / Math.max(w, h);
  if (ratio < 0.5) return ratio * 60;
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
      const gx =
        -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)] +
        -2 * gray[y * w + (x - 1)] + 2 * gray[y * w + (x + 1)] +
        -gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)];
      const gy =
        -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)] +
        gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      if (magnitude > threshold) edgeCount++;
    }
  }

  const edgeDensity = edgeCount / totalPixels;
  if (edgeDensity < 0.03) return 60;
  if (edgeDensity <= 0.15) return 100;
  if (edgeDensity <= 0.30) return 100 - (edgeDensity - 0.15) * 400;
  return Math.max(0, 40 - (edgeDensity - 0.30) * 200);
}

/**
 * 선명도 점수: Laplacian 분산
 */
function scoreSharpness(gray: Float32Array, w: number, h: number): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
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
  return Math.min(100, Math.max(0, (variance / 500) * 100));
}

/**
 * 피부톤 비율 점수
 * - 15%+ → 0점 (하드필터)
 * - 10~15% → 50점
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
  if (skinRatio >= SKIN_RATIO_HARD) return 0;
  if (skinRatio >= 0.10) return 50;
  return 100;
}

/**
 * 컨텐츠 충분도 점수: 비백색 픽셀(밝기 < 230) 비율
 * - 5% 미만 → 20점 (하드필터)
 * - 5~15% → 60점
 * - 15~60% → 100점
 * - 60%+ → 80점
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
  if (contentRatio < CONTENT_RATIO_HARD) return 20;
  if (contentRatio < 0.15) return 60;
  if (contentRatio <= 0.60) return 100;
  return 80;
}

/**
 * 색상 다양성 점수: 이미지 전체의 색상 분포 다양성 측정
 * 로고/아이콘은 색상 수가 매우 적고, 상품 사진은 그라데이션/디테일이 풍부
 *
 * - 유효 색상 빈 3개 이하 → 30점 (단색 로고/아이콘)
 * - 4~8개 → 60점
 * - 9~20개 → 90점
 * - 21개+ → 100점
 */
function scoreColorDiversity(data: Uint8ClampedArray, w: number, h: number): number {
  const totalPixels = w * h;
  // RGB를 4단계씩 양자화 → 4×4×4 = 64빈
  const BINS_PER_CH = 4;
  const TOTAL_BINS = BINS_PER_CH ** 3;
  const bins = new Uint32Array(TOTAL_BINS);

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    const rBin = Math.min(3, Math.floor(data[offset] / 64));
    const gBin = Math.min(3, Math.floor(data[offset + 1] / 64));
    const bBin = Math.min(3, Math.floor(data[offset + 2] / 64));
    bins[rBin * 16 + gBin * 4 + bBin]++;
  }

  // 유효 빈: 전체 픽셀의 2%+ 차지하는 빈 수
  const minCount = totalPixels * 0.02;
  let significantBins = 0;
  for (let i = 0; i < TOTAL_BINS; i++) {
    if (bins[i] >= minCount) significantBins++;
  }

  if (significantBins <= 3) return 30;
  if (significantBins <= 8) return 60;
  if (significantBins <= 20) return 90;
  return 100;
}

/**
 * 이미지의 색상 히스토그램을 빌드한다 (이상치 감지용).
 * 64x64로 축소 후 4×4×4=64빈 히스토그램 생성.
 */
async function buildColorHistogram(objectUrl: string): Promise<Float32Array> {
  const img = await loadImage(objectUrl);

  const canvas = document.createElement('canvas');
  canvas.width = HISTOGRAM_SIZE;
  canvas.height = HISTOGRAM_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, HISTOGRAM_SIZE, HISTOGRAM_SIZE);
  const data = ctx.getImageData(0, 0, HISTOGRAM_SIZE, HISTOGRAM_SIZE).data;

  const BINS_PER_CH = 4;
  const TOTAL_BINS = BINS_PER_CH ** 3;
  const hist = new Float32Array(TOTAL_BINS);
  const totalPixels = HISTOGRAM_SIZE * HISTOGRAM_SIZE;

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    const rBin = Math.min(3, Math.floor(data[offset] / 64));
    const gBin = Math.min(3, Math.floor(data[offset + 1] / 64));
    const bBin = Math.min(3, Math.floor(data[offset + 2] / 64));
    hist[rBin * 16 + gBin * 4 + bBin]++;
  }

  // 정규화
  for (let i = 0; i < TOTAL_BINS; i++) hist[i] /= totalPixels;
  return hist;
}

/**
 * 텍스트/배너 이미지 감지
 *
 * 흰색 배경 위의 텍스트 배너는 배경 채도 필터를 우회하므로 별도 감지 필요.
 * 텍스트 이미지 특징:
 *  - 적은 유효 색상 (배경 + 텍스트색 1~2개)
 *  - 낮은 fill ratio (얇은 글자 획이 바운딩박스를 빈약하게 채움)
 *  - 높은 수평 전환 밀도 (행 스캔 시 content↔background 전환 잦음)
 *
 * 감지 기준 (3단계):
 *  Tier 1: sigBins ≤ 2 AND fillRatio < 0.45 → 확실한 텍스트/로고
 *  Tier 2: sigBins ≤ 4 AND fillRatio < 0.35 AND avgTransitions > 8 → 복합 텍스트
 *  Tier 3: avgTransitions > 15 AND sigBins ≤ 5 → 극단적 전환 밀도
 */
function detectTextBanner(data: Uint8ClampedArray, w: number, h: number): boolean {
  const totalPixels = w * h;

  // 1. 컨텐츠 픽셀 + 바운딩박스
  let minX = w, maxX = 0, minY = h, maxY = 0;
  let contentCount = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (lum < 200) {
        contentCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // 컨텐츠가 너무 적으면 텍스트 판정 불가 (빈 이미지는 별도 필터)
  if (contentCount < totalPixels * 0.03) return false;

  // 2. Fill ratio = content pixels / bounding box area
  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;
  if (bboxW <= 0 || bboxH <= 0) return false;
  const fillRatio = contentCount / (bboxW * bboxH);

  // 3. 색상 다양성 (간단 계산)
  const BINS = 4, TOTAL = BINS ** 3;
  const colorBins = new Uint32Array(TOTAL);
  for (let i = 0; i < totalPixels; i++) {
    const o = i * 4;
    colorBins[
      Math.min(3, data[o] >> 6) * 16 +
      Math.min(3, data[o + 1] >> 6) * 4 +
      Math.min(3, data[o + 2] >> 6)
    ]++;
  }
  let sigBins = 0;
  for (let i = 0; i < TOTAL; i++) {
    if (colorBins[i] >= totalPixels * 0.02) sigBins++;
  }

  // Tier 1: 매우 적은 색상 + 낮은 fill → 확실한 텍스트/로고
  if (sigBins <= 2 && fillRatio < 0.45) return true;

  // 4. 수평 전환 밀도 (행별 content↔background 전환 횟수)
  // 텍스트: 여러 글자를 관통하므로 전환 잦음 (8+/row)
  // 상품: 한 물체만 관통하므로 전환 적음 (2-5/row)
  let totalTransitions = 0;
  let rowsWithContent = 0;

  for (let y = 0; y < h; y++) {
    let transitions = 0;
    let prevContent = false;
    let hasContent = false;

    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      const isContent = lum < 200;
      if (isContent) hasContent = true;
      if (x > 0 && isContent !== prevContent) transitions++;
      prevContent = isContent;
    }

    if (hasContent) {
      totalTransitions += transitions;
      rowsWithContent++;
    }
  }

  const avgTransitions = rowsWithContent > 0 ? totalTransitions / rowsWithContent : 0;

  // Tier 2: 적은 색상 + 적은 fill + 높은 전환 → 복합 텍스트 배너
  if (sigBins <= 4 && fillRatio < 0.35 && avgTransitions > 8) return true;

  // Tier 3: 극단적 전환 밀도 + 적은 색상 → 확실한 텍스트
  if (avgTransitions > 15 && sigBins <= 5) return true;

  return false;
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
