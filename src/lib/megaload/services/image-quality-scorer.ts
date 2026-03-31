// ============================================================
// 이미지 품질 스코어링 서비스
// Canvas API로 대표이미지 후보를 분석하여 최적 이미지를 선택
//
// ★ 대표이미지 기준: 흰배경 누끼 + 정면 + 썸네일 크기 최적화
//
// 분석 항목 (50x50 축소 기준):
//  - 배경 밝기 (20%): 흰색/밝은 배경 선호 ★★★ 최우선
//  - 배경 채도 (12%): 컬러 배경 → 하드필터 (로고/배너/포장재 차단) ★★
//  - 단일상품 집중도 (15%): 번들/세트 이미지 감점 — 누끼딴 단일 상품 ★★
//  - 프레임 점유율 (12%): 상품이 이미지를 얼마나 채우는지 — 썸네일 가시성 ★
//  - 가장자리 잘림 (10%): 제품이 이미지 경계에서 잘린 이미지 감점 ★
//  - 좌우 대칭도 (10%): 정면 촬영 = 높은 대칭 → 대표이미지 우선 ★
//  - 선명도 (7%): Laplacian 분산 — 흐릿한 이미지 감점 (↑ 썸네일 축소 시 중요)
//  - 중심 집중도 (4%): 피사체가 중앙에 있을수록 고점
//  - 컨텐츠 충분도 (4%): 비백색 픽셀 5% 미만 → 하드필터 (빈 이미지 차단)
//  - 피부톤 비율 (3%): 피부색 픽셀 15%+ → 하드필터 (모델 사진 차단)
//  - 텍스트 밀도 (2%): 엣지 과다(텍스트/워터마크) 감점
//  - 종횡비 (0.5%): 1:1에 가까울수록 고점
//  - 색상 다양성 (0.5%): 색상 분포가 너무 단순하면 로고/아이콘 의심
//
// 자동 크롭 (autoCropToFill):
//  - 점유율 55% 이하 + 원본 600px 이상 → 바운딩박스 기준 정사각형 크롭
//  - 여백 12% 유지, 크롭 후 500px 이상 보장
//  - 쿠팡 썸네일에서 상품이 크게 보이도록 최적화
//
// 하드필터 (해당 시 overall 강제 0):
//  - 피부톤 ≥ 15% (모델/인물 사진)
//  - 컨텐츠 < 5% (빈 이미지)
//  - 배경 채도 > 20% AND 밝기 < 220 (컬러 배경: 로고/배너/포장재)
//  - 배경 채도 > 35% (밝기 무관 — 밝은 노란/연두/분홍 배경도 차단)
//  - 텍스트 배너 감지 (4단계 Tier: 단색~다색 텍스트/홍보 배너)
//  - 전체 이미지 고채도 > 30% (홍보/이벤트 배너 — 테두리가 흰색이어도 내부 컬러풀)
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
  /** 좌우 대칭도 — 정면 촬영일수록 높은 점수 */
  symmetry: number;
  /** 단일 상품 집중도 — 번들/세트 이미지 감점 */
  productCompactness: number;
  /** 가장자리 잘림 — 제품이 이미지 경계에서 잘리면 감점 */
  edgeCrop: number;
  /** 프레임 점유율 — 상품이 이미지 프레임을 얼마나 채우는지 (썸네일 가시성) */
  fillRatio: number;
  /** 하드필터 사유 (해당 시) */
  hardFilterReason?: string;
}

// 성능 최적화: 200→100→50 (16x 적은 픽셀, 패턴 감지에 충분)
const ANALYSIS_SIZE = 50;
// 히스토그램: 64→32 (4x 적은 픽셀, 이상치 감지에 충분)
const HISTOGRAM_SIZE = 32;
const DEFAULT_MIN_SCORE = 40;

// Canvas 동시성 제한 — 저사양 PC 메모리 보호
const IMAGE_CONCURRENCY = 3;

/** 메인스레드 양보 — UI 멈춤 방지 */
function yieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/** 동시성 제한 워커풀 */
async function runPool<T>(
  items: readonly unknown[],
  concurrency: number,
  fn: (index: number) => Promise<T>,
): Promise<T[]> {
  const results: T[] = new Array(items.length);
  let nextIdx = 0;
  async function worker() {
    while (nextIdx < items.length) {
      const idx = nextIdx++;
      results[idx] = await fn(idx);
      // 매 작업 후 메인스레드 양보
      await yieldToMain();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

// ---- 하드필터 상수 ----
const SKIN_RATIO_HARD = 0.15;        // 피부톤 15%+ → 차단
const CONTENT_RATIO_HARD = 0.05;     // 비백색 5% 미만 → 차단
const BG_SATURATION_HARD = 0.20;     // 배경 채도 20%+ → 차단 (밝기 조건 함께)
const BG_LUMINANCE_CEIL = 200;       // 배경 채도 차단: 밝기 200 미만 (밝은 흰배경 누끼는 통과)
const BG_SATURATION_ABSOLUTE = 0.50; // 채도 50%+ → 밝기 무관 무조건 차단 (진한 컬러 배경만)
const FULL_SAT_RATIO_HARD = 0.40;    // 전체 이미지의 40%+ 고채도(sat>0.30) → 홍보/배너 이미지

const ZERO_SCORE: ImageScore = {
  overall: 0, background: 0, backgroundSaturation: 0, centering: 0,
  aspect: 0, textDensity: 0, sharpness: 0, skinTone: 0,
  contentSufficiency: 0, colorDiversity: 0, symmetry: 0, productCompactness: 0,
  edgeCrop: 0, fillRatio: 0,
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

  const results = await runPool(objectUrls, IMAGE_CONCURRENCY, async (i) => {
    try {
      const score = await scoreImage(objectUrls[i]);
      return { index: i, score };
    } catch {
      return { index: i, score: { ...ZERO_SCORE } };
    }
  });

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

  const results = await runPool(objectUrls, IMAGE_CONCURRENCY, async (i) => {
    try {
      const score = await scoreImage(objectUrls[i]);
      const filtered = score.overall < minScore;
      return { index: i, score, filtered };
    } catch {
      return { index: i, score: { ...ZERO_SCORE }, filtered: true };
    }
  });

  results.sort((a, b) => b.score.overall - a.score.overall);
  return results;
}

/**
 * 리뷰 이미지를 대표사진 후보로 스코어링 + 필터링한다.
 * 공식 상품 이미지 대신 리뷰 사진을 사용하여 지재권 이슈를 방지.
 *
 * scoreImage()와의 차이:
 *  - 배경 흰색 불필요 (리뷰 사진은 다양한 배경)
 *  - 피부톤 하드필터 해제 (손으로 잡고 찍은 사진 허용)
 *  - 컬러 배경 하드필터 해제
 *  - 상품 단일성(productCompactness) + 선명도(sharpness) 가중치 대폭 상향
 *
 * @param objectUrls - 분석할 리뷰 이미지의 Object URL 배열
 * @param minScore - 최소 통과 점수 (기본 25, 리뷰 기준 관대)
 * @returns 점수 내림차순 정렬된 { index, score, filtered } 배열
 */
export async function filterAndScoreReviewImages(
  objectUrls: string[],
  minScore: number = 25,
): Promise<{ index: number; score: ImageScore; filtered: boolean }[]> {
  if (objectUrls.length === 0) return [];

  const results = await runPool(objectUrls, IMAGE_CONCURRENCY, async (i) => {
    try {
      const score = await scoreReviewImage(objectUrls[i]);
      const filtered = score.overall < minScore;
      return { index: i, score, filtered };
    } catch {
      return { index: i, score: { ...ZERO_SCORE }, filtered: true };
    }
  });

  results.sort((a, b) => b.score.overall - a.score.overall);
  return results;
}

/**
 * 상세페이지/리뷰 이미지용 필터링 (대표이미지보다 관대)
 *
 * 명백한 비상품 이미지만 제거:
 * - 텍스트 배너 (배송안내, 이벤트 배너 등)
 * - 진한 컬러/어두운 배경 (광고 배너 스타일)
 * - 빈 이미지
 *
 * 대표이미지와 달리 피부톤/중심집중도/종횡비 등은 체크하지 않음
 * (리뷰 사진은 다양한 환경에서 촬영됨)
 *
 * @param objectUrls - 분석할 이미지의 Object URL 배열
 * @returns { index, filtered, reason }[] 배열
 */
export async function filterDetailPageImages(
  objectUrls: string[],
): Promise<{ index: number; filtered: boolean; reason?: string }[]> {
  if (objectUrls.length === 0) return [];

  return runPool(objectUrls, IMAGE_CONCURRENCY, async (i) => {
    try {
      const result = await analyzeDetailImage(objectUrls[i]);
      return { index: i, ...result };
    } catch {
      return { index: i, filtered: false };
    }
  });
}

/**
 * 단일 상세/리뷰 이미지를 분석하여 비상품 이미지 여부를 판별.
 * 대표이미지 스코어링보다 가벼운 검사만 수행.
 */
async function analyzeDetailImage(
  objectUrl: string,
): Promise<{ filtered: boolean; reason?: string }> {
  const img = await loadImage(objectUrl);

  const canvas = document.createElement('canvas');
  canvas.width = ANALYSIS_SIZE;
  canvas.height = ANALYSIS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { filtered: false };

  ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const data = ctx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE).data;

  // 1. 텍스트 배너 감지 (배송안내, 이벤트 배너 등)
  if (detectTextBanner(data, ANALYSIS_SIZE, ANALYSIS_SIZE)) {
    return { filtered: true, reason: 'text_banner' };
  }

  // 2. 빈 이미지 감지
  const contentSuf = scoreContentSufficiency(data, ANALYSIS_SIZE, ANALYSIS_SIZE);
  if (contentSuf <= 20) {
    return { filtered: true, reason: 'empty_image' };
  }

  // 3. 어두운 배경 (배너/광고 스타일) — 밝기 < 120은 일반 상품 사진이 아님
  const bgResult = scoreBackgroundSaturation(data, ANALYSIS_SIZE, ANALYSIS_SIZE);
  if (bgResult.avgLuminance < 120) {
    return { filtered: true, reason: 'dark_background' };
  }

  // 4. 매우 진한 컬러 배경 (채도 높고 어두운 — 배너/광고)
  if (bgResult.avgSaturation > 0.35 && bgResult.avgLuminance < 160) {
    return { filtered: true, reason: 'colored_banner' };
  }

  // 5. 전체 이미지 고채도 비율 — 홍보/이벤트 배너 (테두리는 흰색이어도 내부가 컬러풀)
  const fullSatRatio = getHighSaturationRatio(data, ANALYSIS_SIZE, ANALYSIS_SIZE);
  if (fullSatRatio > FULL_SAT_RATIO_HARD) {
    return { filtered: true, reason: 'promotional_image' };
  }

  return { filtered: false };
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

  // 히스토그램 빌드 (동시성 제한)
  const histograms = await runPool(objectUrls, IMAGE_CONCURRENCY, async (i) => {
    try {
      return await buildColorHistogram(objectUrls[i]);
    } catch {
      return new Float32Array(64);
    }
  });

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

/**
 * 기준 이미지(대표이미지)와 후보 이미지(상세/리뷰)를 교차 비교하여
 * 색상 분포가 크게 다른 후보를 이상치로 판별한다.
 *
 * 기존 detectOutlierImages는 같은 세트 내 자체 비교(self-referencing)이지만,
 * 이 함수는 이미 선정된 대표이미지를 기준으로 상세/리뷰 이미지를 검증한다.
 *
 * @param referenceUrls - 대표이미지 URLs (기준)
 * @param candidateUrls - 상세/리뷰 이미지 URLs (필터 대상)
 * @param threshold - chi-squared 거리 임계값 (기본 0.8)
 * @returns 각 후보의 { index, isOutlier, distance } 배열
 */
export async function crossReferenceOutlierImages(
  referenceUrls: string[],
  candidateUrls: string[],
  threshold = 0.8,
): Promise<{ index: number; isOutlier: boolean; distance: number }[]> {
  if (candidateUrls.length === 0) return [];

  // 기준 이미지 없으면 비교 불가 — 모든 후보를 통과 처리
  if (referenceUrls.length === 0) {
    return candidateUrls.map((_, i) => ({ index: i, isOutlier: false, distance: 0 }));
  }

  // 1. 기준 이미지 히스토그램 빌드 (동시성 제한)
  const refHistResults = await runPool(referenceUrls, IMAGE_CONCURRENCY, async (i) => {
    try { return await buildColorHistogram(referenceUrls[i]); }
    catch { return null; }
  });
  const refHistograms = refHistResults.filter((h): h is Float32Array => h !== null);

  // 유효한 기준 히스토그램이 없으면 비교 불가
  if (refHistograms.length === 0) {
    return candidateUrls.map((_, i) => ({ index: i, isOutlier: false, distance: 0 }));
  }

  // 2. 기준 히스토그램의 평균 계산 (기준 이미지 수가 적으므로 mean 사용)
  const bins = refHistograms[0].length;
  const meanHist = new Float32Array(bins);
  for (let b = 0; b < bins; b++) {
    let sum = 0;
    for (const h of refHistograms) sum += h[b];
    meanHist[b] = sum / refHistograms.length;
  }

  // 3. 후보 이미지 히스토그램 + 거리 계산 (동시성 제한)
  return runPool(candidateUrls, IMAGE_CONCURRENCY, async (i) => {
    try {
      const candidateHist = await buildColorHistogram(candidateUrls[i]);
      let chi2 = 0;
      for (let b = 0; b < bins; b++) {
        const expected = meanHist[b];
        if (expected > 0.001) {
          chi2 += (candidateHist[b] - expected) ** 2 / expected;
        }
      }
      return { index: i, isOutlier: chi2 > threshold, distance: chi2 };
    } catch {
      return { index: i, isOutlier: true, distance: Infinity };
    }
  });
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
  const symmetry = scoreSymmetry(gray, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const productCompactness = scoreProductCompactness(data, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const edgeCrop = scoreEdgeCrop(data, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const fillRatio = scoreFillRatio(data, ANALYSIS_SIZE, ANALYSIS_SIZE);

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
  } else if (getHighSaturationRatio(data, ANALYSIS_SIZE, ANALYSIS_SIZE) > FULL_SAT_RATIO_HARD) {
    hardFilterReason = 'promotional_image';
  }

  if (hardFilterReason) {
    return {
      overall: 0, background, backgroundSaturation, centering, aspect,
      textDensity, sharpness, skinTone, contentSufficiency, colorDiversity,
      symmetry, productCompactness, edgeCrop, fillRatio, hardFilterReason,
    };
  }

  // ---- 가중 합산 (100%) ----
  // ★ 흰배경이 최우선 — 쿠팡 썸네일에서 흰배경 누끼가 가장 중요
  const overall =
    background * 0.20 +            // 흰배경 ★★★ (최우선)
    backgroundSaturation * 0.12 +  // 무채색 배경 ★★ (컬러 배경 강력 감점)
    productCompactness * 0.15 +    // 누끼 단일상품 ★★
    fillRatio * 0.12 +             // 프레임 점유율 ★ (썸네일 가시성)
    edgeCrop * 0.10 +              // 상품 완전 포함 ★
    symmetry * 0.10 +              // 정면 촬영 ★
    sharpness * 0.07 +             // 선명도
    centering * 0.04 +
    contentSufficiency * 0.04 +
    skinTone * 0.03 +
    textDensity * 0.02 +
    aspect * 0.005 +
    colorDiversity * 0.005;

  return {
    overall, background, backgroundSaturation, centering, aspect,
    textDensity, sharpness, skinTone, contentSufficiency, colorDiversity,
    symmetry, productCompactness, edgeCrop, fillRatio,
  };
}

/**
 * 리뷰 이미지를 대표사진 관점에서 스코어링한다.
 * scoreImage()보다 관대한 기준: 배경 흰색·피부톤·컬러배경 하드필터 없음.
 * 정면 촬영된 선명한 단일 상품 사진에 높은 점수.
 */
async function scoreReviewImage(objectUrl: string): Promise<ImageScore> {
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

  const gray = new Float32Array(ANALYSIS_SIZE * ANALYSIS_SIZE);
  for (let i = 0; i < gray.length; i++) {
    const offset = i * 4;
    gray[i] = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  }

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
  const symmetry = scoreSymmetry(gray, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const productCompactness = scoreProductCompactness(data, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const edgeCrop = scoreEdgeCrop(data, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const fillRatio = scoreFillRatio(data, ANALYSIS_SIZE, ANALYSIS_SIZE);

  // ---- 리뷰용 하드필터 (최소한만) ----
  // 피부톤(손), 컬러 배경 → 허용 (리뷰 사진 특성)
  let hardFilterReason: string | undefined;

  if (contentSufficiency <= 20) {
    hardFilterReason = 'empty_image';
  } else if (detectTextBanner(data, ANALYSIS_SIZE, ANALYSIS_SIZE)) {
    hardFilterReason = 'text_banner';
  } else if (getHighSaturationRatio(data, ANALYSIS_SIZE, ANALYSIS_SIZE) > 0.50) {
    hardFilterReason = 'promotional_image';
  }

  if (hardFilterReason) {
    return {
      overall: 0, background, backgroundSaturation, centering, aspect,
      textDensity, sharpness, skinTone, contentSufficiency, colorDiversity,
      symmetry, productCompactness, edgeCrop, fillRatio, hardFilterReason,
    };
  }

  // ---- 리뷰용 가중치 (상품 단일성 + 선명도 + 정면 + 크기 최우선) ----
  const overall =
    productCompactness * 0.22 +   // 단일 상품 집중도 (최우선)
    sharpness * 0.18 +            // 선명도 (흐릿한 리뷰 사진 제거)
    fillRatio * 0.13 +            // 프레임 점유율 (썸네일 가시성)
    edgeCrop * 0.12 +             // 상품 완전 포함 (잘리지 않음)
    centering * 0.10 +            // 중앙 배치
    symmetry * 0.10 +             // 정면 촬영
    contentSufficiency * 0.07 +   // 상품이 프레임에 충분히 채움
    textDensity * 0.04 +          // 텍스트 없음
    colorDiversity * 0.02 +       // 자연스러운 색상
    background * 0.02;            // 배경은 거의 무시
  // skinTone, backgroundSaturation, aspect → 0% (무시)

  return {
    overall, background, backgroundSaturation, centering, aspect,
    textDensity, sharpness, skinTone, contentSufficiency, colorDiversity,
    symmetry, productCompactness, edgeCrop, fillRatio,
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
  // 1) 채도 > 20% AND 밝기 < 220 → 대부분의 컬러 배경 차단
  // 2) 채도 > 35% → 밝기 무관 차단 (밝은 노란/연두/분홍 배경)
  const isHardFiltered =
    (avgSaturation > BG_SATURATION_HARD && avgLuminance < BG_LUMINANCE_CEIL) ||
    avgSaturation > BG_SATURATION_ABSOLUTE;

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
 * 좌우 대칭도 점수: 이미지의 왼쪽/오른쪽 반을 미러 비교
 * 정면 촬영된 상품 사진은 좌우 대칭이 높고, 비스듬한 촬영은 대칭이 낮다.
 *
 * 알고리즘:
 *  1. 각 행에서 왼쪽 픽셀과 미러 오른쪽 픽셀의 밝기 차이 계산
 *  2. 평균 차이 → 점수 변환 (차이 0 = 100점, 차이 50+ = 0점)
 */
function scoreSymmetry(gray: Float32Array, w: number, h: number): number {
  let diffSum = 0;
  let count = 0;
  const halfW = Math.floor(w / 2);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < halfW; x++) {
      const left = gray[y * w + x];
      const right = gray[y * w + (w - 1 - x)];
      diffSum += Math.abs(left - right);
      count++;
    }
  }

  const avgDiff = count > 0 ? diffSum / count : 50;
  // 차이 0 → 100점, 차이 50+ → 0점 (선형 보간)
  return Math.max(0, Math.min(100, (1 - avgDiff / 50) * 100));
}

/**
 * 단일 상품 집중도: 스캔라인에서 콘텐츠 세그먼트 수로 다중 물체 감지
 * 단일 상품(세그먼트 1개) = 100점, 번들/세트(여러 세그먼트) = 감점
 *
 * 수평 스캔 (60% 비중): 10개 행에서 중앙값 세그먼트 수
 * 수직 스캔 (40% 비중): 7개 열에서 중앙값 세그먼트 수
 */
function scoreProductCompactness(data: Uint8ClampedArray, w: number, h: number): number {
  const CONTENT_LUM = 220;
  const MIN_GAP = Math.max(4, Math.floor(w * 0.02));

  // 스캔라인에서 콘텐츠 세그먼트 수를 카운트하는 헬퍼
  function countSegments(getLum: (pos: number) => number, length: number): number {
    let segments = 0;
    let inContent = false;
    let gapCount = 0;

    for (let i = 0; i < length; i++) {
      const lum = getLum(i);
      const isContent = lum < CONTENT_LUM;

      if (isContent) {
        if (!inContent) {
          segments++;
          inContent = true;
        }
        gapCount = 0;
      } else {
        if (inContent) {
          gapCount++;
          if (gapCount >= MIN_GAP) {
            inContent = false;
          }
        }
      }
    }

    return segments;
  }

  // 중앙값 계산
  function median(arr: number[]): number {
    const sorted = arr.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  // 세그먼트 수 → 점수 변환 (선형 보간)
  function segmentScore(med: number, type: 'h' | 'v'): number {
    if (type === 'h') {
      // 수평: 1→100, 1.5→75, 2→50, 3+→20
      if (med <= 1) return 100;
      if (med <= 2) return 100 - (med - 1) * 50;  // 1→100, 2→50
      return Math.max(20, 50 - (med - 2) * 30);   // 2→50, 3→20
    } else {
      // 수직: 1→100, 2→60, 3+→25
      if (med <= 1) return 100;
      if (med <= 2) return 100 - (med - 1) * 40;  // 1→100, 2→60
      return Math.max(25, 60 - (med - 2) * 35);   // 2→60, 3→25
    }
  }

  // 수평 스캔: 이미지 높이의 여러 위치에서 행 샘플링
  const hPositions = [0.20, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.70, 0.80];
  const hSegments: number[] = [];
  for (const ratio of hPositions) {
    const y = Math.floor(h * ratio);
    if (y < 0 || y >= h) continue;
    const segs = countSegments(
      (x) => {
        const idx = (y * w + x) * 4;
        return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      },
      w,
    );
    hSegments.push(segs);
  }

  // 수직 스캔: 이미지 너비의 여러 위치에서 열 샘플링
  const vPositions = [0.25, 0.33, 0.40, 0.50, 0.60, 0.67, 0.75];
  const vSegments: number[] = [];
  for (const ratio of vPositions) {
    const x = Math.floor(w * ratio);
    if (x < 0 || x >= w) continue;
    const segs = countSegments(
      (y) => {
        const idx = (y * w + x) * 4;
        return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      },
      h,
    );
    vSegments.push(segs);
  }

  const hMedian = hSegments.length > 0 ? median(hSegments) : 1;
  const vMedian = vSegments.length > 0 ? median(vSegments) : 1;

  const hScore = segmentScore(hMedian, 'h');
  const vScore = segmentScore(vMedian, 'v');

  return hScore * 0.6 + vScore * 0.4;
}

/**
 * 가장자리 잘림 점수: 제품이 이미지 경계에서 잘렸는지 감지
 *
 * 각 변(상하좌우)의 가장자리 3px 스트립에서 컨텐츠(비백색) 픽셀 비율을 측정.
 * 제품이 이미지 안에 완전히 들어있으면 가장자리가 흰색 → 고점.
 * 제품이 가장자리에서 잘리면 가장자리에 컨텐츠가 많이 나타남 → 감점.
 *
 * - 4변 모두 깨끗 → 100점 (제품 완전 포함)
 * - 1변 잘림 → 55점
 * - 2변 잘림 → 30점
 * - 3변+ 잘림 → 10점
 */
function scoreEdgeCrop(data: Uint8ClampedArray, w: number, h: number): number {
  const EDGE_DEPTH = Math.max(3, Math.floor(Math.min(w, h) * 0.02));
  const CONTENT_LUM = 225;
  const CROP_THRESHOLD = 0.30; // 가장자리의 30%+ 컨텐츠 → 잘림 판정

  function edgeContentRatio(
    getIdx: (pos: number, depth: number) => number,
    length: number,
  ): number {
    let content = 0;
    let total = 0;
    for (let pos = 0; pos < length; pos++) {
      for (let d = 0; d < EDGE_DEPTH; d++) {
        const idx = getIdx(pos, d) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (lum < CONTENT_LUM) content++;
        total++;
      }
    }
    return total > 0 ? content / total : 0;
  }

  // 상단
  const topRatio = edgeContentRatio((x, d) => d * w + x, w);
  // 하단
  const bottomRatio = edgeContentRatio((x, d) => (h - 1 - d) * w + x, w);
  // 좌측
  const leftRatio = edgeContentRatio((y, d) => y * w + d, h);
  // 우측
  const rightRatio = edgeContentRatio((y, d) => y * w + (w - 1 - d), h);

  const croppedEdges = [topRatio, bottomRatio, leftRatio, rightRatio]
    .filter(r => r > CROP_THRESHOLD).length;

  if (croppedEdges === 0) return 100;
  if (croppedEdges === 1) return 55;
  if (croppedEdges === 2) return 30;
  return 10;
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

  // Tier 4: 다색 홍보/이벤트 배너 — 색상 더 다양하지만 텍스트+그래픽 패턴
  // 상품 사진과 구분: 컨텐츠가 이미지 전체 높이에 걸쳐 퍼짐 (상품은 중앙에 집중)
  const contentRatio = contentCount / totalPixels;
  if (sigBins <= 10 && avgTransitions > 5 && fillRatio < 0.50 && contentRatio > 0.15 && contentRatio < 0.65) {
    // 컨텐츠의 수직 분포: 행 중 5%+ 폭의 컨텐츠가 있는 행 비율
    const minPerRow = w * 0.05;
    let rowsWithSigContent = 0;
    for (let y = 0; y < h; y++) {
      let rowCount = 0;
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (lum < 200) rowCount++;
      }
      if (rowCount >= minPerRow) rowsWithSigContent++;
    }
    const contentSpread = rowsWithSigContent / h;
    // 컨텐츠가 85%+ 행에 퍼져있으면 배너/홍보 (상품은 60-75% 행에만 집중)
    if (contentSpread > 0.85) return true;
  }

  return false;
}

/**
 * 전체 이미지의 고채도 픽셀 비율을 계산한다.
 * 상품 사진: 흰색 배경(무채색) + 상품(중간 채도) → 비율 낮음 (~10-25%)
 * 홍보/배너: 진한 색상 텍스트/그래픽이 넓은 영역 → 비율 높음 (30%+)
 *
 * 배경 채도 체크(테두리 10%)가 놓치는 "테두리는 흰색, 내부는 컬러풀" 이미지를 잡는다.
 */
function getHighSaturationRatio(data: Uint8ClampedArray, w: number, h: number): number {
  const totalPixels = w * h;
  let highSatCount = 0;

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    const r = data[offset] / 255;
    const g = data[offset + 1] / 255;
    const b = data[offset + 2] / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));

    if (s > 0.30) highSatCount++;
  }

  return highSatCount / totalPixels;
}

/**
 * 프레임 점유율 점수: 상품 바운딩박스가 전체 이미지를 얼마나 채우는지 측정
 *
 * 쿠팡 검색 결과 썸네일(~200x200px)에서 상품이 크게 보여야 클릭률이 높다.
 * 흰배경 누끼 사진이라도 상품이 이미지의 30%만 차지하면 썸네일에서 너무 작게 보인다.
 *
 * 알고리즘:
 *  1. 비백색(밝기 < 230) 픽셀의 바운딩박스를 계산
 *  2. 바운딩박스 면적 / 전체 이미지 면적 = 점유율
 *  3. 점유율 기반 점수 변환:
 *     - 70~85% → 100점 (최적: 상품이 크게 + 적절한 여백)
 *     - 55~70% → 85점
 *     - 40~55% → 60점
 *     - 25~40% → 35점 (너무 작음)
 *     - < 25%  → 15점 (매우 작음)
 *     - > 85%  → 75점 (여백 부족, 약간 답답함)
 */
function scoreFillRatio(data: Uint8ClampedArray, w: number, h: number): number {
  const CONTENT_LUM = 230;
  let minX = w, maxX = 0, minY = h, maxY = 0;
  let hasContent = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (lum < CONTENT_LUM) {
        hasContent = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!hasContent) return 0;

  const bboxArea = (maxX - minX + 1) * (maxY - minY + 1);
  const totalArea = w * h;
  const ratio = bboxArea / totalArea;

  if (ratio < 0.25) return 15;
  if (ratio < 0.40) return 15 + (ratio - 0.25) / 0.15 * 20;  // 15→35
  if (ratio < 0.55) return 35 + (ratio - 0.40) / 0.15 * 25;  // 35→60
  if (ratio < 0.70) return 60 + (ratio - 0.55) / 0.15 * 25;  // 60→85
  if (ratio <= 0.85) return 85 + (ratio - 0.70) / 0.15 * 15;  // 85→100
  return Math.max(65, 100 - (ratio - 0.85) / 0.15 * 35);     // 100→65

}

// ---- 자동 크롭 상수 ----
/** 자동 크롭 대상 최소 이미지 원본 크기 (크롭해도 500px 이상 보장) */
const AUTO_CROP_MIN_SRC = 600;
/** 자동 크롭 후 최소 출력 크기 */
const AUTO_CROP_MIN_OUTPUT = 500;
/** 크롭 트리거 점유율 — 이 이하면 자동 크롭 */
const AUTO_CROP_TRIGGER_RATIO = 0.55;
/** 크롭 시 상품 주위 여백 비율 (바운딩박스 대비) */
const AUTO_CROP_PADDING = 0.12;

/**
 * 대표이미지 자동 크롭 — 상품이 프레임을 충분히 채우도록 확대
 *
 * 흰배경 누끼 사진에서 상품이 이미지의 작은 부분만 차지할 경우,
 * 바운딩박스 기준으로 여백을 10-15%만 남기고 크롭하여 새 Object URL을 반환.
 *
 * 조건:
 *  - 원본 이미지 600px 이상 (크롭 후에도 500px 이상 보장)
 *  - 현재 점유율 55% 이하
 *  - 크롭 결과가 500x500 이상
 *
 * @param objectUrl - 원본 이미지의 Object URL
 * @returns { cropped: true, url: string, ratio: number } 또는 { cropped: false }
 */
export async function autoCropToFill(
  objectUrl: string,
): Promise<{ cropped: true; url: string; oldRatio: number; newRatio: number } | { cropped: false }> {
  const img = await loadImage(objectUrl);
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

  // 원본이 너무 작으면 크롭 불가
  if (origW < AUTO_CROP_MIN_SRC || origH < AUTO_CROP_MIN_SRC) {
    return { cropped: false };
  }

  // 바운딩박스 계산 (원본 크기에서 수행 — 정확도 위해)
  // 성능: 200x200으로 축소하여 바운딩박스 감지, 원본에 비율 적용
  const detectSize = 200;
  const detectCanvas = document.createElement('canvas');
  detectCanvas.width = detectSize;
  detectCanvas.height = detectSize;
  const detectCtx = detectCanvas.getContext('2d');
  if (!detectCtx) return { cropped: false };

  detectCtx.drawImage(img, 0, 0, origW, origH, 0, 0, detectSize, detectSize);
  const detectData = detectCtx.getImageData(0, 0, detectSize, detectSize).data;

  const CONTENT_LUM = 230;
  let minX = detectSize, maxX = 0, minY = detectSize, maxY = 0;
  let hasContent = false;

  for (let y = 0; y < detectSize; y++) {
    for (let x = 0; x < detectSize; x++) {
      const idx = (y * detectSize + x) * 4;
      const lum = 0.299 * detectData[idx] + 0.587 * detectData[idx + 1] + 0.114 * detectData[idx + 2];
      if (lum < CONTENT_LUM) {
        hasContent = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!hasContent) return { cropped: false };

  // 점유율 계산
  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;
  const oldRatio = (bboxW * bboxH) / (detectSize * detectSize);

  // 이미 충분히 채우고 있으면 크롭 불필요
  if (oldRatio > AUTO_CROP_TRIGGER_RATIO) return { cropped: false };

  // 바운딩박스를 원본 좌표로 변환
  const scaleX = origW / detectSize;
  const scaleY = origH / detectSize;

  const realMinX = Math.floor(minX * scaleX);
  const realMaxX = Math.ceil(maxX * scaleX);
  const realMinY = Math.floor(minY * scaleY);
  const realMaxY = Math.ceil(maxY * scaleY);

  const realBboxW = realMaxX - realMinX;
  const realBboxH = realMaxY - realMinY;

  // 패딩 추가
  const padX = Math.floor(realBboxW * AUTO_CROP_PADDING);
  const padY = Math.floor(realBboxH * AUTO_CROP_PADDING);

  // 정사각형 크롭 (쿠팡 썸네일 최적화 — 1:1 비율)
  const contentCenterX = (realMinX + realMaxX) / 2;
  const contentCenterY = (realMinY + realMaxY) / 2;
  const cropSide = Math.max(realBboxW + padX * 2, realBboxH + padY * 2);

  let cropX = Math.round(contentCenterX - cropSide / 2);
  let cropY = Math.round(contentCenterY - cropSide / 2);
  let cropW = cropSide;
  let cropH = cropSide;

  // 원본 경계 내로 클램프
  if (cropX < 0) cropX = 0;
  if (cropY < 0) cropY = 0;
  if (cropX + cropW > origW) cropW = origW - cropX;
  if (cropY + cropH > origH) cropH = origH - cropY;

  // 크롭 결과가 너무 작으면 포기
  if (cropW < AUTO_CROP_MIN_OUTPUT || cropH < AUTO_CROP_MIN_OUTPUT) {
    return { cropped: false };
  }

  // Canvas로 크롭 실행
  const outCanvas = document.createElement('canvas');
  outCanvas.width = cropW;
  outCanvas.height = cropH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return { cropped: false };

  // 흰색 배경 채우기 (정사각형 크롭에서 원본 범위 밖 영역)
  outCtx.fillStyle = '#FFFFFF';
  outCtx.fillRect(0, 0, cropW, cropH);
  outCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // Blob → Object URL
  const blob = await new Promise<Blob | null>(resolve =>
    outCanvas.toBlob(resolve, 'image/jpeg', 0.92),
  );
  if (!blob) return { cropped: false };

  const newUrl = URL.createObjectURL(blob);

  // 새 점유율 계산
  const newBboxArea = realBboxW * realBboxH;
  const newTotalArea = cropW * cropH;
  const newRatio = newBboxArea / newTotalArea;

  return { cropped: true, url: newUrl, oldRatio, newRatio };
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
