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
// 하드필터 (hardFilterReason 표기만, overall 점수 유지 — 정렬용):
//  ★ 메인이미지는 절대 제거 안 함, 점수 순 정렬만
//  ★ 누끼 면역: 테두리 흰색 픽셀 40%+ OR (밝기>210 AND 채도<18%) → 빈 이미지 외 면제
//  - 피부톤 ≥ 15% (모델/인물 사진) — 누끼 면제
//  - 컨텐츠 < 5% (빈 이미지) — 누끼도 적용
//  - 배경 채도 > 20% AND 밝기 < 220 (컬러 배경) — 누끼 면제
//  - 배경 채도 > 35% (밝기 무관) — 누끼 면제
//  - 텍스트 배너 감지 — 누끼 면제
//  - 전체 이미지 고채도 > 30% — 누끼 면제
//
// 이상치 감지 (detectOutlierImages):
//  - 같은 상품의 이미지 세트 내에서 색상 분포가 크게 다른 이미지 감지
//  - 다른 브랜드/상품 이미지 자동 제거
//
// 다양성 기반 이미지 선택 (selectDiverseImages):
//  - 이미지 특징 벡터 추출 (색상 히스토그램 + 공간 레이아웃 + 에지 방향)
//  - 이미지 유형 자동 분류 (nukki/lifestyle/packaging/ingredient/detail_shot/infographic)
//  - K-Medoids 클러스터링 → 유형별 쿼터 보충 → greedy maximin 순서 정렬
//  - 워터마크 시각 감지 (코너 로고 + 대각선 반투명)
//  - 모델 사진 차단 강화 (상단 중앙 피부톤 집중만 차단)
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

/** 이미지 유형 분류 */
export type ImageType =
  | 'nukki'        // 흰배경 누끼
  | 'lifestyle'    // 라이프스타일 (사용 장면)
  | 'packaging'    // 패키징/포장재
  | 'ingredient'   // 성분표/텍스트 정보
  | 'usage'        // 사용법
  | 'detail_shot'  // 디테일 샷 (클로즈업)
  | 'infographic'  // 인포그래픽
  | 'unknown';

/** 이미지 특징 벡터 — 다양성 비교용 */
export interface ImageFeatures {
  /** 64빈 색상 히스토그램 (4x4x4 RGB 양자화, 정규화) */
  colorHist: Float32Array;
  /** 3x3 공간 레이아웃 (9영역 평균 밝기, 0~1 정규화) */
  spatialLayout: Float32Array;
  /** 8빈 에지 방향 히스토그램 (Sobel 기반, 정규화) */
  edgeOrientHist: Float32Array;
  /** 밝기 분포 4구간 (어두운~밝은, 정규화) */
  brightnessDist: Float32Array;
  /** 자동 분류된 이미지 유형 */
  imageType: ImageType;
  /** 워터마크 감지 신뢰도 (0~1) */
  watermarkScore: number;
  /** 원본 인덱스 */
  originalIndex: number;
}

/** 상품 dominant color */
interface DominantColor {
  r: number; g: number; b: number;
  weight: number;  // 0~1, 해당 색상의 비중
}

/** 상품 관련성 점수 */
export interface ProductRelevanceScore {
  index: number;       // 원본 이미지 인덱스
  score: number;       // 0~1 종합 관련성 (1 = 완벽 매칭)
  colorOverlap: number;  // 0~1 dominant color 겹침률
  histSimilarity: number; // 0~1 chi² 히스토그램 유사도
  edgeSimilarity: number; // 0~1 에지 방향 코사인 유사도
}

/** selectDiverseImages 결과 */
export interface DiverseSelectionResult {
  /** 선택된 이미지 인덱스 (다양성 순서로 정렬) */
  selectedIndices: number[];
  /** 다양성 점수 0~100 */
  diversityScore: number;
  /** 선택된 이미지의 유형 목록 */
  imageTypes: ImageType[];
  /** 클러스터 수 */
  clusterCount: number;
  /** 각 이미지의 워터마크 점수 */
  watermarkScores: { index: number; score: number }[];
  /** 상품 관련성 점수 (메인 이미지 대비) */
  relevanceScores?: ProductRelevanceScore[];
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
// 리뷰 이미지 종합 분석 (품질 + 상품 관련성)
// ================================================================

/** 리뷰 이미지 거부 사유 */
export type ReviewRejectionReason =
  | 'empty_image'        // 빈 이미지
  | 'text_banner'        // 텍스트 배너
  | 'promotional_image'  // 홍보/이벤트 이미지
  | 'unrelated'          // 상품과 무관 (색상 분포 outlier)
  | 'low_quality';       // 품질 낮음 (흐림/번들/잘림 등)

/** 개별 리뷰 이미지 분석 결과 */
export interface ReviewImageAnalysis {
  /** 원본 배열에서의 인덱스 */
  index: number;
  /** 품질 점수 0~100 (scoreReviewImage 기준) */
  qualityScore: number;
  /** 품질 하드필터 사유 (있을 경우) */
  hardFilterReason?: string;
  /** 대표이미지 기준 chi² 색상 거리 */
  relevanceDistance: number;
  /** 관련성 이상치 여부 (상품과 무관한 이미지) */
  isRelevanceOutlier: boolean;
  /** 추천 여부 (모든 필터 통과) */
  isRecommended: boolean;
  /** 거부 사유 (isRecommended=false일 때) */
  rejectionReason?: ReviewRejectionReason;
}

/** analyzeReviewImages 결과 */
export interface ReviewImageAnalysisResult {
  /** 원본 인덱스 순서로 정렬된 분석 결과 */
  analyses: ReviewImageAnalysis[];
  /** 추천 이미지 인덱스 (품질 스코어 내림차순) */
  recommendedIndices: number[];
  /** 통계 */
  stats: {
    total: number;
    recommended: number;
    rejectedLowQuality: number;
    rejectedUnrelated: number;
    rejectedBanner: number;
  };
}

/**
 * 리뷰 이미지의 품질 + 상품 관련성을 종합 분석하여 추천 이미지를 반환한다.
 *
 * 분석 단계:
 *  1. 품질 스코어링 — filterAndScoreReviewImages()
 *     단일 상품성, 선명도, 정면 촬영, 프레임 점유율 기반
 *  2. 관련성 검사 — crossReferenceOutlierImages()
 *     대표이미지(referenceUrls)의 평균 색상 히스토그램과 chi² 거리 비교
 *
 * 거부 우선순위: hardFilterReason(banner/empty/promo) > unrelated > low_quality
 *
 * @param reviewUrls - 분석할 리뷰 이미지 Object URL 배열 (원본 순서 유지)
 * @param referenceUrls - 기준 이미지(대표이미지) URL 배열. 비어있으면 관련성 검사 생략.
 * @param options.minQualityScore - 품질 통과 최소 점수 (기본 25)
 * @param options.relevanceThreshold - 관련성 chi² 임계값 (기본 0.8, 낮을수록 엄격)
 * @param options.maxRecommended - 추천 인덱스 최대 개수 (기본 10)
 */
export async function analyzeReviewImages(
  reviewUrls: string[],
  referenceUrls: string[],
  options?: {
    minQualityScore?: number;
    relevanceThreshold?: number;
    maxRecommended?: number;
  },
): Promise<ReviewImageAnalysisResult> {
  const total = reviewUrls.length;
  if (total === 0) {
    return {
      analyses: [],
      recommendedIndices: [],
      stats: { total: 0, recommended: 0, rejectedLowQuality: 0, rejectedUnrelated: 0, rejectedBanner: 0 },
    };
  }

  const minQualityScore = options?.minQualityScore ?? 25;
  const relevanceThreshold = options?.relevanceThreshold ?? 0.8;
  const maxRecommended = options?.maxRecommended ?? 10;

  // 품질 + 관련성 병렬 실행
  const [qualityResults, relevanceResults] = await Promise.all([
    filterAndScoreReviewImages(reviewUrls, minQualityScore),
    crossReferenceOutlierImages(referenceUrls, reviewUrls, relevanceThreshold),
  ]);

  // 원본 인덱스 기반으로 재정렬 (filterAndScoreReviewImages는 점수 내림차순)
  const qualityByIdx = new Map<number, { score: ImageScore; filtered: boolean }>();
  for (const r of qualityResults) qualityByIdx.set(r.index, { score: r.score, filtered: r.filtered });
  const relevanceByIdx = new Map<number, { isOutlier: boolean; distance: number }>();
  for (const r of relevanceResults) relevanceByIdx.set(r.index, { isOutlier: r.isOutlier, distance: r.distance });

  const bannerReasons = new Set(['empty_image', 'text_banner', 'promotional_image']);

  const analyses: ReviewImageAnalysis[] = [];
  for (let i = 0; i < total; i++) {
    const q = qualityByIdx.get(i);
    const r = relevanceByIdx.get(i);

    const qualityScore = q?.score.overall ?? 0;
    const hardFilterReason = q?.score.hardFilterReason;
    const qualityFiltered = q?.filtered ?? true;
    const relevanceDistance = r?.distance ?? 0;
    const isRelevanceOutlier = r?.isOutlier ?? false;

    // 우선순위: 배너/빈/광고 > 관련성 > 품질
    let rejectionReason: ReviewRejectionReason | undefined;
    if (hardFilterReason && bannerReasons.has(hardFilterReason)) {
      rejectionReason = hardFilterReason as ReviewRejectionReason;
    } else if (isRelevanceOutlier) {
      rejectionReason = 'unrelated';
    } else if (qualityFiltered) {
      rejectionReason = 'low_quality';
    }

    analyses.push({
      index: i,
      qualityScore,
      hardFilterReason,
      relevanceDistance,
      isRelevanceOutlier,
      isRecommended: !rejectionReason,
      rejectionReason,
    });
  }

  // 추천 인덱스: 품질 스코어 내림차순, 상위 N개
  const recommendedIndices = analyses
    .filter(a => a.isRecommended)
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .slice(0, maxRecommended)
    .map(a => a.index);

  const stats = {
    total,
    recommended: recommendedIndices.length,
    rejectedLowQuality: analyses.filter(a => a.rejectionReason === 'low_quality').length,
    rejectedUnrelated: analyses.filter(a => a.rejectionReason === 'unrelated').length,
    rejectedBanner: analyses.filter(a => a.rejectionReason && bannerReasons.has(a.rejectionReason)).length,
  };

  return { analyses, recommendedIndices, stats };
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

  // ★ 누끼 면역: 테두리 픽셀 중 흰색(밝기>230, 채도<0.10) 비율 기반 판정
  // 상품이 테두리까지 뻗어 평균을 오염시켜도, 개별 흰색 픽셀이 40%+ 있으면 누끼로 판정
  // 평균 기반 폴백: avgLuminance > 210 AND avgSaturation < 0.18 (완화)
  const isWhiteBackground =
    bgSatResult.whiteBorderRatio > 0.40 ||
    (bgSatResult.avgLuminance > 210 && bgSatResult.avgSaturation < 0.18);

  if (isWhiteBackground) {
    // 누끼 이미지: 빈 이미지만 체크 (다른 하드필터 전부 면제)
    if (contentSufficiency <= 20) {
      hardFilterReason = 'empty_image';
    }
  } else {
    // 비누끼 이미지: 기존 하드필터 전체 적용
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

  // 하드필터: hardFilterReason만 표기, overall 점수는 유지 (정렬용)
  // → useBulkRegisterActions에서 하드필터 무시하고 점수 순 정렬
  return {
    overall, background, backgroundSaturation, centering, aspect,
    textDensity, sharpness, skinTone, contentSufficiency, colorDiversity,
    symmetry, productCompactness, edgeCrop, fillRatio,
    ...(hardFilterReason ? { hardFilterReason } : {}),
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
): { score: number; isHardFiltered: boolean; avgSaturation: number; avgLuminance: number; whiteBorderRatio: number } {
  const border = Math.floor(Math.min(w, h) * 0.1);
  let satSum = 0;
  let lumSum = 0;
  let count = 0;
  let whiteBorderCount = 0;

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

      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      satSum += s;
      lumSum += lum;
      count++;

      // 개별 픽셀이 흰색인지 판정 (밝기 > 230, 채도 < 0.10)
      if (lum > 230 && s < 0.10) whiteBorderCount++;
    }
  }

  const avgSaturation = count > 0 ? satSum / count : 0;
  const avgLuminance = count > 0 ? lumSum / count : 128;
  const whiteBorderRatio = count > 0 ? whiteBorderCount / count : 0;

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

  return { score: Math.max(0, score), isHardFiltered, avgSaturation, avgLuminance, whiteBorderRatio };
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

// ================================================================
// 다양성 기반 이미지 선택 시스템
// ================================================================

/**
 * 이미지 특징 벡터를 추출한다 (기존 50x50 Canvas에서 값 재사용).
 * 새 Canvas 로드 없이 기존 분석 데이터에서 추가 특징만 추출.
 */
function extractImageFeatures(
  data: Uint8ClampedArray,
  gray: Float32Array,
  w: number,
  h: number,
  originalIndex: number,
): ImageFeatures {
  // 1. 64빈 색상 히스토그램 (4x4x4 RGB 양자화)
  const BINS_PER_CH = 4;
  const TOTAL_BINS = BINS_PER_CH ** 3; // 64
  const colorHist = new Float32Array(TOTAL_BINS);
  const totalPixels = w * h;

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    const rBin = Math.min(3, data[offset] >> 6);
    const gBin = Math.min(3, data[offset + 1] >> 6);
    const bBin = Math.min(3, data[offset + 2] >> 6);
    colorHist[rBin * 16 + gBin * 4 + bBin]++;
  }
  for (let i = 0; i < TOTAL_BINS; i++) colorHist[i] /= totalPixels;

  // 2. 3x3 공간 레이아웃 (9영역 평균 밝기, 0~1 정규화)
  const spatialLayout = new Float32Array(9);
  const cellCounts = new Float32Array(9);
  const cellW = Math.floor(w / 3);
  const cellH = Math.floor(h / 3);

  for (let y = 0; y < h; y++) {
    const row = Math.min(2, Math.floor(y / cellH));
    for (let x = 0; x < w; x++) {
      const col = Math.min(2, Math.floor(x / cellW));
      const cellIdx = row * 3 + col;
      spatialLayout[cellIdx] += gray[y * w + x];
      cellCounts[cellIdx]++;
    }
  }
  for (let i = 0; i < 9; i++) {
    spatialLayout[i] = cellCounts[i] > 0 ? (spatialLayout[i] / cellCounts[i]) / 255 : 0.5;
  }

  // 3. 8빈 에지 방향 히스토그램 (Sobel 기반)
  const edgeOrientHist = new Float32Array(8);
  let edgeTotal = 0;
  const EDGE_THRESH = 30;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)] +
        -2 * gray[y * w + (x - 1)] + 2 * gray[y * w + (x + 1)] +
        -gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)];
      const gy =
        -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)] +
        gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];

      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > EDGE_THRESH) {
        // atan2 → 0~2π → 8빈
        let angle = Math.atan2(gy, gx);
        if (angle < 0) angle += Math.PI * 2;
        const bin = Math.min(7, Math.floor(angle / (Math.PI / 4)));
        edgeOrientHist[bin] += mag;
        edgeTotal += mag;
      }
    }
  }
  if (edgeTotal > 0) {
    for (let i = 0; i < 8; i++) edgeOrientHist[i] /= edgeTotal;
  }

  // 4. 밝기 분포 4구간 (0~63, 64~127, 128~191, 192~255)
  const brightnessDist = new Float32Array(4);
  for (let i = 0; i < totalPixels; i++) {
    const bin = Math.min(3, Math.floor(gray[i] / 64));
    brightnessDist[bin]++;
  }
  for (let i = 0; i < 4; i++) brightnessDist[i] /= totalPixels;

  // 5. 이미지 유형 분류
  const imageType = classifyImageType(data, gray, w, h, colorHist);

  // 6. 워터마크 감지
  const watermarkScore = detectVisualWatermark(data, gray, w, h);

  return {
    colorHist,
    spatialLayout,
    edgeOrientHist,
    brightnessDist,
    imageType,
    watermarkScore,
    originalIndex,
  };
}

/**
 * 이미지 유형을 자동 분류한다.
 * 기존 분석값(배경밝기, 채도, 텍스트밀도, fillRatio)만으로 판별 — 추가 비용 0.
 */
function classifyImageType(
  data: Uint8ClampedArray,
  gray: Float32Array,
  w: number,
  h: number,
  colorHist: Float32Array,
): ImageType {
  const totalPixels = w * h;

  // 기본 수치 계산 (기존 함수 재사용)
  const bgSat = scoreBackgroundSaturation(data, w, h);
  const fillRatioScore = scoreFillRatio(data, w, h);

  // 텍스트 밀도 (에지 밀도)
  let edgeCount = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)] +
        -2 * gray[y * w + (x - 1)] + 2 * gray[y * w + (x + 1)] +
        -gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)];
      const gy =
        -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)] +
        gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];
      if (Math.sqrt(gx * gx + gy * gy) > 50) edgeCount++;
    }
  }
  const edgeDensity = edgeCount / ((w - 2) * (h - 2));

  // 컬러 다양성: significant bins 계산
  const minBinCount = totalPixels * 0.02;
  let sigBins = 0;
  for (let i = 0; i < 64; i++) {
    if (colorHist[i] * totalPixels >= minBinCount) sigBins++;
  }

  // 피부톤 비율
  let skinCount = 0;
  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    const r = data[off], g = data[off + 1], b = data[off + 2];
    if (r > 95 && g > 40 && b > 20 && r > g && r > b &&
        Math.max(r, g, b) - Math.min(r, g, b) > 15 && Math.abs(r - g) > 15) {
      skinCount++;
    }
  }
  const skinRatio = skinCount / totalPixels;

  // 흰배경 비율 (밝기 > 230)
  let whiteBgCount = 0;
  for (let i = 0; i < totalPixels; i++) {
    if (gray[i] > 230) whiteBgCount++;
  }
  const whiteBgRatio = whiteBgCount / totalPixels;

  // 세그먼트 수 (단일상품 집중도 관련 — 중앙 행 스캔)
  const midY = Math.floor(h / 2);
  let segments = 0;
  let inContent = false;
  for (let x = 0; x < w; x++) {
    const lum = gray[midY * w + x];
    const isContent = lum < 220;
    if (isContent && !inContent) { segments++; inContent = true; }
    if (!isContent) inContent = false;
  }

  // 가장자리 잘림 (scoreEdgeCrop 로직 간소화)
  let croppedEdges = 0;
  const EDGE_D = Math.max(2, Math.floor(Math.min(w, h) * 0.02));
  const checkEdge = (getIdx: (p: number, d: number) => number, len: number) => {
    let content = 0, total = 0;
    for (let p = 0; p < len; p++) {
      for (let d = 0; d < EDGE_D; d++) {
        if (gray[getIdx(p, d)] < 225) content++;
        total++;
      }
    }
    return total > 0 && content / total > 0.30;
  };
  if (checkEdge((x, d) => d * w + x, w)) croppedEdges++;
  if (checkEdge((x, d) => (h - 1 - d) * w + x, w)) croppedEdges++;
  if (checkEdge((y, d) => y * w + d, h)) croppedEdges++;
  if (checkEdge((y, d) => y * w + (w - 1 - d), h)) croppedEdges++;

  // ---- 분류 규칙 ----

  // 1. 누끼: 흰배경 40%+ + 중앙집중(세그먼트 1) + fill < 90
  if (whiteBgRatio > 0.40 && segments <= 1 && fillRatioScore < 90) {
    return 'nukki';
  }

  // 2. 성분표/텍스트 정보: 텍스트 밀도 높음
  if (edgeDensity > 0.25 && sigBins <= 8) {
    return 'ingredient';
  }

  // 3. 인포그래픽: 높은 채도 비율 + 다양한 색상
  const highSatRatio = getHighSaturationRatio(data, w, h);
  if (highSatRatio > 0.25 && sigBins > 6) {
    return 'infographic';
  }

  // 4. 라이프스타일: 피부톤 5~15% OR (높은 색상 다양성 + 낮은 흰배경)
  if ((skinRatio >= 0.05 && skinRatio < 0.15) ||
      (sigBins > 10 && whiteBgRatio < 0.20)) {
    return 'lifestyle';
  }

  // 5. 패키징: 에지잘림 2변+ + 높은 fill
  if (croppedEdges >= 2 && fillRatioScore >= 60) {
    return 'packaging';
  }

  // 6. 디테일 샷: 높은 fill + 높은 선명도 + 세그먼트 1
  if (fillRatioScore >= 85 && edgeDensity > 0.10 && segments <= 1) {
    return 'detail_shot';
  }

  return 'unknown';
}

/**
 * 시각적 워터마크를 감지한다.
 * - 코너 로고: 4코너(15%) 엣지밀도가 중앙 대비 1.5배 + 색상 2~5개
 * - 대각선 반투명 텍스트: 대각선 스캔 → 평탄 영역 내 미세 주기 변화
 *
 * @returns 워터마크 신뢰도 0~1 (0.5+ = 워터마크 가능성 높음)
 */
function detectVisualWatermark(
  data: Uint8ClampedArray,
  gray: Float32Array,
  w: number,
  h: number,
): number {
  let score = 0;

  // (A) 코너 로고 감지
  const cornerSize = Math.floor(Math.min(w, h) * 0.15);
  const centerX1 = Math.floor(w * 0.3);
  const centerX2 = Math.floor(w * 0.7);
  const centerY1 = Math.floor(h * 0.3);
  const centerY2 = Math.floor(h * 0.7);

  // 중앙 에지 밀도
  let centerEdges = 0, centerTotal = 0;
  for (let y = centerY1; y < centerY2; y++) {
    for (let x = centerX1; x < centerX2; x++) {
      if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
        const gx = Math.abs(gray[y * w + (x + 1)] - gray[y * w + (x - 1)]);
        const gy = Math.abs(gray[(y + 1) * w + x] - gray[(y - 1) * w + x]);
        if (gx + gy > 30) centerEdges++;
        centerTotal++;
      }
    }
  }
  const centerEdgeDensity = centerTotal > 0 ? centerEdges / centerTotal : 0;

  // 4코너 중 가장 높은 에지밀도
  const corners = [
    { x0: 0, y0: 0 },                          // 좌상
    { x0: w - cornerSize, y0: 0 },              // 우상
    { x0: 0, y0: h - cornerSize },              // 좌하
    { x0: w - cornerSize, y0: h - cornerSize }, // 우하
  ];

  for (const corner of corners) {
    let cornerEdges = 0, cornerTotal2 = 0;
    const uniqueColors = new Set<number>();

    for (let y = corner.y0; y < corner.y0 + cornerSize && y < h; y++) {
      for (let x = corner.x0; x < corner.x0 + cornerSize && x < w; x++) {
        if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
          const gx = Math.abs(gray[y * w + (x + 1)] - gray[y * w + (x - 1)]);
          const gy = Math.abs(gray[(y + 1) * w + x] - gray[(y - 1) * w + x]);
          if (gx + gy > 30) cornerEdges++;
          cornerTotal2++;
        }
        // 양자화된 색상 카운트
        const off = (y * w + x) * 4;
        const qr = data[off] >> 5;
        const qg = data[off + 1] >> 5;
        const qb = data[off + 2] >> 5;
        uniqueColors.add(qr * 64 + qg * 8 + qb);
      }
    }

    const cornerDensity = cornerTotal2 > 0 ? cornerEdges / cornerTotal2 : 0;
    const colorCount = uniqueColors.size;

    // 코너에 에지밀도가 높고 + 색상 수가 적으면(2~5) → 로고 가능
    if (centerEdgeDensity > 0.01 && cornerDensity > centerEdgeDensity * 1.5 && colorCount >= 2 && colorCount <= 8) {
      score = Math.max(score, 0.4 + Math.min(0.3, (cornerDensity / centerEdgeDensity - 1.5) * 0.3));
    }
  }

  // (B) 대각선 반투명 텍스트 감지
  // 대각선 라인에서 주기적 밝기 변화 패턴 감지
  const diagLen = Math.min(w, h);
  const diagValues: number[] = [];
  for (let i = 0; i < diagLen; i++) {
    diagValues.push(gray[i * w + i]);
  }

  if (diagValues.length > 10) {
    // 고주파 에너지 비율 (미세 주기 변화)
    let totalVariance = 0;
    let highFreqVariance = 0;
    const windowSize = 5;

    for (let i = windowSize; i < diagValues.length - windowSize; i++) {
      // 로컬 평균 대비 차이
      let localSum = 0;
      for (let j = -windowSize; j <= windowSize; j++) localSum += diagValues[i + j];
      const localMean = localSum / (windowSize * 2 + 1);

      const diff = diagValues[i] - localMean;
      totalVariance += diff * diff;

      // 인접 차이 (고주파)
      const hfDiff = diagValues[i] - diagValues[i - 1];
      highFreqVariance += hfDiff * hfDiff;
    }

    // 반투명 워터마크: 평탄한 배경에 미세한 주기적 패턴
    const avgTotalVar = totalVariance / Math.max(1, diagLen - windowSize * 2);
    const avgHFVar = highFreqVariance / Math.max(1, diagLen - windowSize);

    if (avgTotalVar < 100 && avgHFVar > 5 && avgHFVar < 50) {
      score = Math.max(score, 0.3 + Math.min(0.3, avgHFVar / 50));
    }
  }

  return Math.min(1, score);
}

/**
 * 모델/인물 사진 감지 강화 — 상단 중앙에 피부톤이 집중된 경우만 차단.
 * 기존: 피부톤 15%이면 무조건 차단
 * 개선: 피부톤 공간 분포 분석 → 상단 중앙 집중(얼굴)만 차단, 하단/가장자리(손)은 허용
 *
 * @returns true = 모델 사진 (차단 대상), false = 허용
 */
export function detectFaceRegion(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): boolean {
  const totalPixels = w * h;
  let totalSkin = 0;

  // 상단 중앙 (상위 40%, 좌우 중앙 60%)
  let upperCenterSkin = 0;
  let upperCenterTotal = 0;

  const topBound = Math.floor(h * 0.4);
  const leftBound = Math.floor(w * 0.2);
  const rightBound = Math.floor(w * 0.8);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      const r = data[off], g = data[off + 1], b = data[off + 2];

      const isSkin = r > 95 && g > 40 && b > 20 && r > g && r > b &&
        Math.max(r, g, b) - Math.min(r, g, b) > 15 && Math.abs(r - g) > 15;

      if (isSkin) totalSkin++;

      if (y < topBound && x >= leftBound && x < rightBound) {
        upperCenterTotal++;
        if (isSkin) upperCenterSkin++;
      }
    }
  }

  const totalSkinRatio = totalSkin / totalPixels;
  if (totalSkinRatio < 0.08) return false; // 피부톤 너무 적으면 무조건 허용

  const upperCenterRatio = upperCenterTotal > 0 ? upperCenterSkin / upperCenterTotal : 0;

  // 상단 중앙에 피부톤 20%+ 집중 → 얼굴 가능성 높음
  return upperCenterRatio >= 0.20;
}

/**
 * 두 특징 벡터 간의 복합 거리를 계산한다.
 * 색상 chi² 40% + 공간 유클리드 25% + 에지 코사인 20% + 유형 불일치 15%
 */
function featureDistance(a: ImageFeatures, b: ImageFeatures): number {
  // (1) 색상 히스토그램 chi-squared 거리 (0~∞, 보통 0~2)
  let chi2 = 0;
  for (let i = 0; i < 64; i++) {
    const sum = a.colorHist[i] + b.colorHist[i];
    if (sum > 0.001) {
      chi2 += (a.colorHist[i] - b.colorHist[i]) ** 2 / sum;
    }
  }
  const colorDist = Math.min(1, chi2 / 2); // 정규화 0~1

  // (2) 공간 레이아웃 유클리드 거리 (0~√9 ≈ 3, 보통 0~1)
  let spatialSq = 0;
  for (let i = 0; i < 9; i++) {
    spatialSq += (a.spatialLayout[i] - b.spatialLayout[i]) ** 2;
  }
  const spatialDist = Math.min(1, Math.sqrt(spatialSq) / 1.5);

  // (3) 에지 방향 코사인 거리 (0~2, 보통 0~1)
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < 8; i++) {
    dotProduct += a.edgeOrientHist[i] * b.edgeOrientHist[i];
    normA += a.edgeOrientHist[i] ** 2;
    normB += b.edgeOrientHist[i] ** 2;
  }
  const cosSim = (normA > 0 && normB > 0) ? dotProduct / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
  const edgeDist = 1 - cosSim; // 0(동일) ~ 1(반대)

  // (4) 유형 불일치 (0 또는 1)
  const typeDist = a.imageType !== b.imageType ? 1 : 0;

  return colorDist * 0.40 + spatialDist * 0.25 + edgeDist * 0.20 + typeDist * 0.15;
}

/**
 * K-Medoids 클러스터링 (PAM 알고리즘 간소화).
 * 거리 행렬 기반으로 k개의 대표 이미지(medoid)를 선택한다.
 */
function kMedoids(
  distMatrix: number[][],
  k: number,
  maxIter = 30,
): { medoids: number[]; clusters: number[][] } {
  const n = distMatrix.length;
  if (k >= n) {
    return {
      medoids: Array.from({ length: n }, (_, i) => i),
      clusters: Array.from({ length: n }, (_, i) => [i]),
    };
  }

  // 초기 medoid: 가장 중심적인 k개 포인트 (다른 포인트와의 평균 거리가 가장 작은)
  const avgDists = distMatrix.map(row => row.reduce((a, b) => a + b, 0) / n);
  const sortedByDist = avgDists.map((d, i) => ({ i, d })).sort((a, b) => a.d - b.d);
  const medoids = sortedByDist.slice(0, k).map(e => e.i);

  for (let iter = 0; iter < maxIter; iter++) {
    // 할당: 각 포인트를 가장 가까운 medoid에 배정
    const clusters: number[][] = Array.from({ length: k }, () => []);
    for (let i = 0; i < n; i++) {
      let bestCluster = 0;
      let bestDist = Infinity;
      for (let m = 0; m < k; m++) {
        if (distMatrix[i][medoids[m]] < bestDist) {
          bestDist = distMatrix[i][medoids[m]];
          bestCluster = m;
        }
      }
      clusters[bestCluster].push(i);
    }

    // 업데이트: 각 클러스터에서 총 거리가 최소인 포인트를 새 medoid로
    let changed = false;
    for (let m = 0; m < k; m++) {
      const cluster = clusters[m];
      if (cluster.length === 0) continue;

      let bestMedoid = medoids[m];
      let bestCost = Infinity;
      for (const candidate of cluster) {
        let cost = 0;
        for (const point of cluster) cost += distMatrix[candidate][point];
        if (cost < bestCost) {
          bestCost = cost;
          bestMedoid = candidate;
        }
      }
      if (bestMedoid !== medoids[m]) {
        medoids[m] = bestMedoid;
        changed = true;
      }
    }

    if (!changed) break;
  }

  // 최종 할당
  const finalClusters: number[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < n; i++) {
    let bestCluster = 0;
    let bestDist = Infinity;
    for (let m = 0; m < k; m++) {
      if (distMatrix[i][medoids[m]] < bestDist) {
        bestDist = distMatrix[i][medoids[m]];
        bestCluster = m;
      }
    }
    finalClusters[bestCluster].push(i);
  }

  return { medoids, clusters: finalClusters };
}

// ================================================================
// 상품 관련성 스코어링 엔진
// ================================================================

/**
 * 50×50 Canvas 픽셀 데이터에서 dominant colors를 추출한다.
 * 전경 픽셀만 사용 (밝기 < 230 AND 채도 > 8%).
 * 간단한 k-means (k=5, max 15 iterations).
 */
function extractDominantColors(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  k = 5,
): DominantColor[] {
  const totalPixels = w * h;

  // 전경 픽셀 추출
  const fgPixels: { r: number; g: number; b: number }[] = [];
  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    const r = data[off], g = data[off + 1], b = data[off + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
    const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
    if (lum < 230 && sat > 0.08) {
      fgPixels.push({ r, g, b });
    }
  }

  if (fgPixels.length < 10) return [];

  // k-means 초기화: 균등 간격 샘플링
  const step = Math.max(1, Math.floor(fgPixels.length / k));
  const centroids: { r: number; g: number; b: number }[] = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.min(i * step, fgPixels.length - 1);
    centroids.push({ ...fgPixels[idx] });
  }

  const assignments = new Int32Array(fgPixels.length);

  for (let iter = 0; iter < 15; iter++) {
    // Assign
    let changed = false;
    for (let i = 0; i < fgPixels.length; i++) {
      const px = fgPixels[i];
      let bestDist = Infinity, bestC = 0;
      for (let c = 0; c < centroids.length; c++) {
        const d = (px.r - centroids[c].r) ** 2 + (px.g - centroids[c].g) ** 2 + (px.b - centroids[c].b) ** 2;
        if (d < bestDist) { bestDist = d; bestC = c; }
      }
      if (assignments[i] !== bestC) { assignments[i] = bestC; changed = true; }
    }
    if (!changed) break;

    // Update
    const sumR = new Float64Array(k), sumG = new Float64Array(k), sumB = new Float64Array(k);
    const counts = new Int32Array(k);
    for (let i = 0; i < fgPixels.length; i++) {
      const c = assignments[i];
      sumR[c] += fgPixels[i].r;
      sumG[c] += fgPixels[i].g;
      sumB[c] += fgPixels[i].b;
      counts[c]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centroids[c] = { r: sumR[c] / counts[c], g: sumG[c] / counts[c], b: sumB[c] / counts[c] };
      }
    }
  }

  // 결과: weight 기준 내림차순
  const result: DominantColor[] = [];
  const totalFg = fgPixels.length;
  const counts = new Int32Array(k);
  for (let i = 0; i < fgPixels.length; i++) counts[assignments[i]]++;
  for (let c = 0; c < k; c++) {
    if (counts[c] > 0) {
      result.push({
        r: Math.round(centroids[c].r),
        g: Math.round(centroids[c].g),
        b: Math.round(centroids[c].b),
        weight: counts[c] / totalFg,
      });
    }
  }
  result.sort((a, b) => b.weight - a.weight);
  return result;
}

/**
 * 후보 이미지의 전경 픽셀이 기준 dominant colors와 얼마나 겹치는지 계산.
 * RGB 유클리드 거리 < 45 → "매칭" 픽셀.
 * @returns matchingPixels / totalForegroundPixels (0~1)
 */
function matchDominantColors(
  candidateData: Uint8ClampedArray,
  w: number,
  h: number,
  dominantColors: DominantColor[],
): number {
  if (dominantColors.length === 0) return 0;

  const MATCH_DIST_SQ = 45 * 45; // 45 in 255 scale, squared for perf
  const totalPixels = w * h;
  let fgCount = 0;
  let matchCount = 0;

  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    const r = candidateData[off], g = candidateData[off + 1], b = candidateData[off + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
    const sat = maxC > 0 ? (maxC - minC) / maxC : 0;

    if (lum < 230 && sat > 0.08) {
      fgCount++;
      // 가장 가까운 dominant color까지 거리 확인
      for (const dc of dominantColors) {
        const distSq = (r - dc.r) ** 2 + (g - dc.g) ** 2 + (b - dc.b) ** 2;
        if (distSq < MATCH_DIST_SQ) { matchCount++; break; }
      }
    }
  }

  return fgCount > 0 ? matchCount / fgCount : 0;
}

/**
 * 기준 이미지(메인/누끼)의 dominant color를 기반으로
 * 후보 이미지의 상품 관련성을 0~1 연속 점수로 평가한다.
 *
 * score = colorOverlap * 0.50 + histSimilarity * 0.30 + edgeSimilarity * 0.20
 *
 * @param referenceUrls - 기준 이미지(메인) URL 배열
 * @param candidateUrls - 후보 이미지 URL 배열
 * @returns 각 후보의 관련성 점수 배열
 */
export async function scoreProductRelevance(
  referenceUrls: string[],
  candidateUrls: string[],
): Promise<ProductRelevanceScore[]> {
  if (candidateUrls.length === 0) return [];
  if (referenceUrls.length === 0) {
    return candidateUrls.map((_, i) => ({
      index: i, score: 1, colorOverlap: 1, histSimilarity: 1, edgeSimilarity: 1,
    }));
  }

  // 1. 기준 이미지 분석: dominant colors + 평균 히스토그램 + 평균 에지 방향
  const refAnalyses = await runPool(referenceUrls, IMAGE_CONCURRENCY, async (i) => {
    try {
      const img = await loadImage(referenceUrls[i]);
      const canvas = document.createElement('canvas');
      canvas.width = ANALYSIS_SIZE;
      canvas.height = ANALYSIS_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
      const imageData = ctx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
      const { data } = imageData;
      const gray = new Float32Array(ANALYSIS_SIZE * ANALYSIS_SIZE);
      for (let p = 0; p < gray.length; p++) {
        const off = p * 4;
        gray[p] = 0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2];
      }
      const features = extractImageFeatures(data, gray, ANALYSIS_SIZE, ANALYSIS_SIZE, i);
      const dominantColors = extractDominantColors(data, ANALYSIS_SIZE, ANALYSIS_SIZE);
      return { features, dominantColors };
    } catch {
      return null;
    }
  });

  const validRefs = refAnalyses.filter((r): r is NonNullable<typeof r> => r !== null);
  if (validRefs.length === 0) {
    return candidateUrls.map((_, i) => ({
      index: i, score: 1, colorOverlap: 1, histSimilarity: 1, edgeSimilarity: 1,
    }));
  }

  // 모든 기준 이미지의 dominant colors 통합
  const allDominantColors: DominantColor[] = [];
  for (const ref of validRefs) {
    allDominantColors.push(...ref.dominantColors);
  }

  // 평균 히스토그램 계산
  const bins = 64;
  const avgHist = new Float32Array(bins);
  for (const ref of validRefs) {
    for (let b = 0; b < bins; b++) avgHist[b] += ref.features.colorHist[b];
  }
  for (let b = 0; b < bins; b++) avgHist[b] /= validRefs.length;

  // 평균 에지 방향 히스토그램 계산
  const avgEdge = new Float32Array(8);
  for (const ref of validRefs) {
    for (let b = 0; b < 8; b++) avgEdge[b] += ref.features.edgeOrientHist[b];
  }
  for (let b = 0; b < 8; b++) avgEdge[b] /= validRefs.length;

  // 2. 각 후보 이미지 분석
  return runPool(candidateUrls, IMAGE_CONCURRENCY, async (i) => {
    try {
      const img = await loadImage(candidateUrls[i]);
      const canvas = document.createElement('canvas');
      canvas.width = ANALYSIS_SIZE;
      canvas.height = ANALYSIS_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { index: i, score: 0, colorOverlap: 0, histSimilarity: 0, edgeSimilarity: 0 };

      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
      const imageData = ctx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
      const { data } = imageData;
      const gray = new Float32Array(ANALYSIS_SIZE * ANALYSIS_SIZE);
      for (let p = 0; p < gray.length; p++) {
        const off = p * 4;
        gray[p] = 0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2];
      }

      // colorOverlap (50% 가중)
      const colorOverlap = matchDominantColors(data, ANALYSIS_SIZE, ANALYSIS_SIZE, allDominantColors);

      // chi² 히스토그램 유사도 (30% 가중): 1 - min(chi2 / 1.5, 1)
      const candidateFeatures = extractImageFeatures(data, gray, ANALYSIS_SIZE, ANALYSIS_SIZE, i);
      let chi2 = 0;
      for (let b = 0; b < bins; b++) {
        const expected = avgHist[b];
        if (expected > 0.001) {
          chi2 += (candidateFeatures.colorHist[b] - expected) ** 2 / expected;
        }
      }
      const histSimilarity = 1 - Math.min(chi2 / 1.5, 1);

      // 에지 방향 코사인 유사도 (20% 가중)
      let dotProduct = 0, normA = 0, normB = 0;
      for (let b = 0; b < 8; b++) {
        dotProduct += candidateFeatures.edgeOrientHist[b] * avgEdge[b];
        normA += candidateFeatures.edgeOrientHist[b] ** 2;
        normB += avgEdge[b] ** 2;
      }
      const edgeSimilarity = (normA > 0 && normB > 0) ? dotProduct / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;

      const score = colorOverlap * 0.50 + histSimilarity * 0.30 + edgeSimilarity * 0.20;
      return { index: i, score, colorOverlap, histSimilarity, edgeSimilarity };
    } catch {
      return { index: i, score: 0, colorOverlap: 0, histSimilarity: 0, edgeSimilarity: 0 };
    }
  });
}

/**
 * 다양성 기반 이미지 선택 — 상세/리뷰 이미지용.
 *
 * 1. 모든 이미지 특징 벡터 추출 (동시성 3)
 * 2. 기존 filterDetailPageImages + crossReferenceOutlierImages 적용
 * 2.5. 상품 관련성 점수 계산 (dominant color + chi² + 에지 방향)
 * 3. 거리 행렬 계산 (색상 chi² 40% + 공간 유클리드 25% + 에지 코사인 20% + 유형 불일치 15%)
 * 4. K-Medoids 클러스터링 → 각 클러스터 대표 1개 선택
 * 5. 유형별 쿼터 보충 (누끼 1~2, 라이프스타일 1~2, 디테일 1, 성분표 0~1)
 * 6. Greedy maximin 순서 정렬 (상위 N장만 봐도 다양한 뷰)
 *
 * @param objectUrls - 분석할 이미지의 Object URL 배열
 * @param options.maxCount - 최대 선택 수 (기본 10)
 * @param options.referenceUrls - 대표이미지 URLs (이상치 비교 기준)
 */
export async function selectDiverseImages(
  objectUrls: string[],
  options: {
    maxCount?: number;
    referenceUrls?: string[];
    /** 사용자가 큐레이션한 폴더 내용 — filterDetailPageImages(품질필터) 건너뛰기.
     *  리뷰 사진 특성상 어두운 배경/고채도/배너 스타일이 빈번해 과도 필터링됨. */
    trustFolderContents?: boolean;
  } = {},
): Promise<DiverseSelectionResult> {
  const maxCount = options.maxCount ?? 10;
  const trustFolder = options.trustFolderContents ?? false;
  /** 필터 후 최소 보장 장수 — 어떤 필터든 이 아래로 떨어지면 점수순 보충 */
  const MIN_KEEP = 5;

  if (objectUrls.length === 0) {
    return { selectedIndices: [], diversityScore: 0, imageTypes: [], clusterCount: 0, watermarkScores: [] };
  }

  const minKeep = Math.min(MIN_KEEP, objectUrls.length); // 전체가 5장 미만이면 전체가 최소

  // 이미지가 maxCount 이하면 필터만 적용하고 전부 반환
  if (objectUrls.length <= maxCount) {
    // 기본 필터 (trustFolder=true면 전부 통과 처리)
    const basicFilter = trustFolder
      ? objectUrls.map((_, i) => ({ index: i, filtered: false }))
      : await filterDetailPageImages(objectUrls);
    let passed = basicFilter.filter(r => !r.filtered);

    // 최소 보장: 필터 통과 장수 < minKeep이면 탈락 이미지를 원본순으로 보충
    if (passed.length < minKeep) {
      const passedSet = new Set(passed.map(r => r.index));
      const rejected = basicFilter.filter(r => r.filtered && !passedSet.has(r.index));
      for (const r of rejected) {
        if (passed.length >= minKeep) break;
        passed.push({ ...r, filtered: false });
      }
      passed.sort((a, b) => a.index - b.index);
      console.warn(`[selectDiverseImages] 품질필터 후 ${basicFilter.filter(r => !r.filtered).length}장 → 최소 ${minKeep}장 보충 → ${passed.length}장`);
    }

    // 특징 벡터 추출
    const features = await extractFeaturesForUrls(
      passed.map(p => objectUrls[p.index]),
      passed.map(p => p.index),
    );

    const indices = features.length > 0
      ? features.map(f => f.originalIndex)
      : passed.map(p => p.index);
    const types = features.length > 0
      ? features.map(f => f.imageType)
      : indices.map(() => 'unknown' as ImageType);
    const uniqueTypes = new Set(types.filter(t => t !== 'unknown'));
    const watermarkScores = features.map(f => ({ index: f.originalIndex, score: f.watermarkScore }));

    return {
      selectedIndices: indices,
      diversityScore: features.length > 0 ? computeDiversityScore(features, uniqueTypes.size) : 0,
      imageTypes: types,
      clusterCount: uniqueTypes.size || 1,
      watermarkScores,
    };
  }

  // Step 1: 기본 품질 필터 (trustFolder=true면 전부 통과 처리)
  const detailFilter = trustFolder
    ? objectUrls.map((_, i) => ({ index: i, filtered: false }))
    : await filterDetailPageImages(objectUrls);
  let passedEntries = detailFilter
    .filter(r => !r.filtered)
    .map(r => ({ origIdx: r.index, url: objectUrls[r.index] }));

  // 최소 보장: 품질필터 후 minKeep 미만이면 탈락 이미지를 원본순으로 보충
  if (passedEntries.length < minKeep) {
    const passedSet = new Set(passedEntries.map(e => e.origIdx));
    const rejected = detailFilter
      .filter(r => r.filtered && !passedSet.has(r.index))
      .map(r => ({ origIdx: r.index, url: objectUrls[r.index] }));
    for (const r of rejected) {
      if (passedEntries.length >= minKeep) break;
      passedEntries.push(r);
    }
    passedEntries.sort((a, b) => a.origIdx - b.origIdx);
    console.warn(`[selectDiverseImages] 품질필터 후 최소 ${minKeep}장 보충 → ${passedEntries.length}장`);
  }

  // Step 2: 이상치 제거 (대표이미지 대비)
  if (options.referenceUrls && options.referenceUrls.length > 0 && passedEntries.length > 3) {
    const crossRef = await crossReferenceOutlierImages(
      options.referenceUrls,
      passedEntries.map(e => e.url),
      0.9,
    );
    const kept = crossRef.filter(r => !r.isOutlier);
    if (kept.length >= minKeep) {
      passedEntries = kept.map(r => passedEntries[r.index]);
    } else {
      // 최소 보장: 거리 낮은 순(덜 이상한 순)으로 보충
      const sorted = [...crossRef].sort((a, b) => a.distance - b.distance);
      const resultSet = new Set<number>();
      // 통과한 것 먼저 추가
      for (const r of kept) resultSet.add(r.index);
      // 거리 낮은 순으로 보충
      for (const r of sorted) {
        if (resultSet.size >= minKeep) break;
        resultSet.add(r.index);
      }
      passedEntries = [...resultSet].sort((a, b) => a - b).map(i => passedEntries[i]);
      console.warn(`[selectDiverseImages] 이상치필터 후 ${kept.length}장 → 최소 ${minKeep}장 보충 → ${passedEntries.length}장`);
    }
  }

  // Step 2.5: 상품 관련성 점수 계산
  let relevanceResults: ProductRelevanceScore[] | undefined;
  if (options.referenceUrls && options.referenceUrls.length > 0) {
    relevanceResults = await scoreProductRelevance(
      options.referenceUrls,
      passedEntries.map(e => e.url),
    );
    // 관련성 < 0.3 → 자동 제외 (하드필터)
    const beforeCount = passedEntries.length;
    // 점수 높은 순 정렬 인덱스 (최소 보장 보충용)
    const scoredIndices = relevanceResults
      .map((r, i) => ({ i, score: r.score }))
      .sort((a, b) => b.score - a.score);
    const aboveThreshold = passedEntries.filter((_, i) => relevanceResults![i].score >= 0.3);

    if (aboveThreshold.length >= minKeep) {
      // 충분히 남음 — 0.3 미만만 제외
      const filteredRelevance: ProductRelevanceScore[] = [];
      for (let i = 0; i < passedEntries.length; i++) {
        if (relevanceResults[i].score >= 0.3) {
          filteredRelevance.push({ ...relevanceResults[i], index: passedEntries[i].origIdx });
        }
      }
      passedEntries = aboveThreshold;
      relevanceResults = filteredRelevance;
    } else {
      // 최소 보장: 점수 높은 순으로 minKeep장 확보
      const keepSet = new Set<number>();
      for (const { i } of scoredIndices) {
        if (keepSet.size >= minKeep) break;
        keepSet.add(i);
      }
      const keptEntries: typeof passedEntries = [];
      const keptRelevance: ProductRelevanceScore[] = [];
      for (const i of [...keepSet].sort((a, b) => a - b)) {
        keptEntries.push(passedEntries[i]);
        keptRelevance.push({ ...relevanceResults[i], index: passedEntries[i].origIdx });
      }
      passedEntries = keptEntries;
      relevanceResults = keptRelevance;
      console.warn(`[selectDiverseImages] 관련성필터 후 ${aboveThreshold.length}장 → 점수순 ${minKeep}장 보충 → ${passedEntries.length}장`);
    }
    if (beforeCount !== passedEntries.length) {
      console.info(`[relevance-filter] ${beforeCount - passedEntries.length}장 관련성 제외 (최소 ${minKeep}장 보장)`);
    }
  }

  // Step 3: 특징 벡터 추출
  const features = await extractFeaturesForUrls(
    passedEntries.map(e => e.url),
    passedEntries.map(e => e.origIdx),
  );

  if (features.length === 0) {
    // 특징 추출 실패 → passedEntries 전체 포함 (최소 보장 이미 적용됨)
    console.warn(`[selectDiverseImages] 특징 추출 실패 — ${passedEntries.length}장 전체 포함`);
    const allIndices = passedEntries.map(e => e.origIdx);
    return { selectedIndices: allIndices, diversityScore: 0, imageTypes: allIndices.map(() => 'unknown' as ImageType), clusterCount: 1, watermarkScores: [], relevanceScores: relevanceResults };
  }

  // 이미지 수가 maxCount 이하면 전부 반환
  if (features.length <= maxCount) {
    const indices = greedyMaximinOrder(features);
    const types = indices.map(i => features.find(f => f.originalIndex === i)!.imageType);
    const uniqueTypes = new Set(types.filter(t => t !== 'unknown'));
    const watermarkScores = features.map(f => ({ index: f.originalIndex, score: f.watermarkScore }));

    return {
      selectedIndices: indices,
      diversityScore: computeDiversityScore(features, uniqueTypes.size),
      imageTypes: types,
      clusterCount: uniqueTypes.size || 1,
      watermarkScores,
      relevanceScores: relevanceResults,
    };
  }

  // Step 4: 거리 행렬 계산
  const n = features.length;
  const distMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = featureDistance(features[i], features[j]);
      distMatrix[i][j] = d;
      distMatrix[j][i] = d;
    }
  }

  // Step 5: K-Medoids 클러스터링
  const k = Math.min(maxCount, Math.max(3, Math.ceil(n / 3)));
  const { medoids, clusters } = kMedoids(distMatrix, k);

  // Step 6: 각 클러스터 대표 선택 (medoid 우선)
  let selected: number[] = [...medoids];

  // Step 7: 유형별 쿼터 보충
  const typeQuota: Partial<Record<ImageType, { min: number; max: number }>> = {
    nukki: { min: 1, max: 2 },
    lifestyle: { min: 1, max: 2 },
    detail_shot: { min: 0, max: 1 },
    ingredient: { min: 0, max: 1 },
  };

  const selectedSet = new Set(selected);
  const typeCounts: Partial<Record<ImageType, number>> = {};
  for (const idx of selected) {
    const type = features[idx].imageType;
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
  }

  // 부족한 유형 보충
  for (const [type, quota] of Object.entries(typeQuota) as [ImageType, { min: number; max: number }][]) {
    const current = typeCounts[type] ?? 0;
    if (current >= quota.min) continue;

    // 해당 유형의 이미지 중 아직 선택되지 않은 것
    const candidates = features
      .map((f, i) => ({ featureIdx: i, f }))
      .filter(({ featureIdx, f }) => f.imageType === type && !selectedSet.has(featureIdx));

    for (const { featureIdx } of candidates) {
      if (selected.length >= maxCount) break;
      if ((typeCounts[type] ?? 0) >= quota.min) break;
      selected.push(featureIdx);
      selectedSet.add(featureIdx);
      typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    }
  }

  // maxCount까지 남은 슬롯은 거리 기반으로 채움 (선택된 것들과 가장 먼 이미지)
  while (selected.length < maxCount && selected.length < features.length) {
    let bestIdx = -1;
    let bestMinDist = -1;
    for (let i = 0; i < features.length; i++) {
      if (selectedSet.has(i)) continue;
      let minDist = Infinity;
      for (const s of selected) {
        minDist = Math.min(minDist, distMatrix[i][s]);
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    selected.push(bestIdx);
    selectedSet.add(bestIdx);
  }

  // Step 8: Greedy maximin 순서 정렬
  const orderedFeatures = selected.map(i => features[i]);
  const orderedIndices = greedyMaximinOrder(orderedFeatures);

  const finalTypes = orderedIndices.map(i => {
    const feat = features.find(f => f.originalIndex === i);
    return feat?.imageType ?? 'unknown';
  });
  const uniqueTypes = new Set(finalTypes.filter(t => t !== 'unknown'));

  const watermarkScores = features.map(f => ({ index: f.originalIndex, score: f.watermarkScore }));

  return {
    selectedIndices: orderedIndices,
    diversityScore: computeDiversityScoreFromMatrix(selected, distMatrix, uniqueTypes.size),
    imageTypes: finalTypes,
    clusterCount: clusters.filter(c => c.length > 0).length,
    watermarkScores,
    relevanceScores: relevanceResults,
  };
}

/**
 * Object URL 배열에서 특징 벡터를 추출한다 (동시성 제한).
 */
async function extractFeaturesForUrls(
  urls: string[],
  originalIndices: number[],
): Promise<ImageFeatures[]> {
  const results = await runPool(urls, IMAGE_CONCURRENCY, async (i) => {
    try {
      const img = await loadImage(urls[i]);
      const canvas = document.createElement('canvas');
      canvas.width = ANALYSIS_SIZE;
      canvas.height = ANALYSIS_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
      const imageData = ctx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
      const { data } = imageData;

      const gray = new Float32Array(ANALYSIS_SIZE * ANALYSIS_SIZE);
      for (let p = 0; p < gray.length; p++) {
        const offset = p * 4;
        gray[p] = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
      }

      return extractImageFeatures(data, gray, ANALYSIS_SIZE, ANALYSIS_SIZE, originalIndices[i]);
    } catch {
      return null;
    }
  });

  return results.filter((r): r is ImageFeatures => r !== null);
}

/**
 * Greedy maximin 순서 정렬 — 상위 N장만 봐도 다양한 뷰를 보장.
 * 첫 이미지: 누끼가 있으면 누끼 우선, 아니면 첫 번째
 * 이후: 이미 선택된 이미지들과의 최소 거리가 가장 큰 이미지를 선택
 */
function greedyMaximinOrder(features: ImageFeatures[]): number[] {
  if (features.length === 0) return [];
  if (features.length === 1) return [features[0].originalIndex];

  const n = features.length;
  const distMat: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = featureDistance(features[i], features[j]);
      distMat[i][j] = d;
      distMat[j][i] = d;
    }
  }

  // 첫 이미지: 누끼 우선
  let firstIdx = 0;
  const nukkiIdx = features.findIndex(f => f.imageType === 'nukki');
  if (nukkiIdx >= 0) firstIdx = nukkiIdx;

  const order: number[] = [firstIdx];
  const used = new Set([firstIdx]);

  while (order.length < n) {
    let bestIdx = -1;
    let bestMinDist = -1;
    for (let i = 0; i < n; i++) {
      if (used.has(i)) continue;
      let minDist = Infinity;
      for (const s of order) {
        minDist = Math.min(minDist, distMat[i][s]);
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    order.push(bestIdx);
    used.add(bestIdx);
  }

  return order.map(i => features[i].originalIndex);
}

/**
 * 다양성 점수 계산 (0~100) — 특징 벡터 리스트 기반
 */
function computeDiversityScore(features: ImageFeatures[], uniqueTypeCount: number): number {
  if (features.length <= 1) return features.length === 1 ? 30 : 0;

  // 쌍별 평균 거리
  let totalDist = 0;
  let pairs = 0;
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      totalDist += featureDistance(features[i], features[j]);
      pairs++;
    }
  }
  const avgDist = pairs > 0 ? totalDist / pairs : 0;

  // 거리 점수 (0~70): avgDist 0→0, 0.3→50, 0.6+→70
  const distScore = Math.min(70, avgDist * 120);

  // 유형 다양성 점수 (0~30): 1유형→5, 2→15, 3→25, 4+→30
  const typeScore = Math.min(30, uniqueTypeCount * 8 - 3);

  return Math.round(Math.max(0, Math.min(100, distScore + typeScore)));
}

/**
 * 다양성 점수 계산 — 거리 행렬 기반 (이미 계산된 거리 행렬 재사용)
 */
function computeDiversityScoreFromMatrix(
  selectedIndices: number[],
  distMatrix: number[][],
  uniqueTypeCount: number,
): number {
  if (selectedIndices.length <= 1) return selectedIndices.length === 1 ? 30 : 0;

  let totalDist = 0;
  let pairs = 0;
  for (let i = 0; i < selectedIndices.length; i++) {
    for (let j = i + 1; j < selectedIndices.length; j++) {
      totalDist += distMatrix[selectedIndices[i]][selectedIndices[j]];
      pairs++;
    }
  }
  const avgDist = pairs > 0 ? totalDist / pairs : 0;
  const distScore = Math.min(70, avgDist * 120);
  const typeScore = Math.min(30, uniqueTypeCount * 8 - 3);

  return Math.round(Math.max(0, Math.min(100, distScore + typeScore)));
}

/**
 * Object URL로부터 HTMLImageElement를 로드
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        reject(new Error(`이미지 크기를 읽을 수 없습니다: ${url}`));
        return;
      }
      resolve(img);
    };
    img.onerror = () => reject(new Error(`이미지 로드 실패: ${url}`));
    // 외부 CDN 이미지 canvas 보안 에러 방지
    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.src = url;
  });
}
