// ============================================================
// Pexels Stock Image Service — 과일 전용
// 과일 상품의 대표이미지를 고품질 스톡 사진으로 교체
// Pexels API: 무료, 저작자 표시 불필요, 상업 사용 OK
//
// 설계 원칙 (v3):
// - 3가지 쿼리 스타일: single(흰배경 단품) + closeup(클로즈업) + cut/pile(단면·모음)
// - 과일이 프레임을 꽉 채우는 사진 선호 (해상도+비율 중심, 밝기 보조)
// - 과일 카테고리만 대상 (채소/수산물/정육 제외)
// ============================================================

import { createSeededRandom, stringToSeed } from './seeded-random';

// ---- Types ----

export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  avg_color: string; // hex (예: "#F5F0EB")
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
  };
  photographer: string;
}

/** 내부 점수가 부여된 사진 */
interface ScoredPhoto {
  photo: PexelsPhoto;
  score: number; // 0~100
  brightness: number;
  aspectScore: number;
  resolutionScore: number;
}

interface PexelsSearchResponse {
  total_results: number;
  page: number;
  per_page: number;
  photos: PexelsPhoto[];
}

interface CacheEntry {
  photos: PexelsPhoto[];
  fetchedAt: number;
}

// ---- Category → Multi-Query Mapping ----
// 각 과일에 대해 3가지 쿼리 스타일:
//   single  — 흰배경 단품 (1개 과일 격리)
//   closeup — 과일 클로즈업/매크로 (프레임 가득)
//   cut/pile — 단면·모음 (잘린 과일 또는 여러 개 쌓임)

interface CategoryQueries {
  queries: string[];
}

const FRUIT_QUERY_MAP: Record<string, CategoryQueries> = {
  '식품>신선식품>과일류>과일>사과': {
    queries: [
      'single red apple fruit isolated white background',
      'red apple closeup macro fresh detail',
      'fresh red apples pile closeup top view',
    ],
  },
  '식품>신선식품>과일류>과일>배': {
    queries: [
      'single pear fruit isolated white background',
      'pear fruit closeup macro fresh detail',
      'pear fruit cut half white background',
    ],
  },
  '식품>신선식품>과일류>과일>감귤': {
    queries: [
      'single mandarin tangerine isolated white background',
      'mandarin orange fruit closeup peel fresh',
      'tangerine orange cut half cross section closeup',
    ],
  },
  '식품>신선식품>과일류>과일>귤': {
    queries: [
      'single mandarin tangerine isolated white background',
      'mandarin orange fruit closeup peel fresh',
      'tangerine citrus fruit pile closeup fresh',
    ],
  },
  '식품>신선식품>과일류>과일>포도': {
    queries: [
      'grape bunch isolated white background',
      'green grapes closeup macro fresh detail',
      'fresh grapes cluster closeup top view',
    ],
  },
  '식품>신선식품>과일류>과일>수박': {
    queries: [
      'whole watermelon isolated white background',
      'watermelon slice red flesh closeup',
      'watermelon cut half cross section fresh',
    ],
  },
  '식품>신선식품>과일류>과일>딸기': {
    queries: [
      'strawberry fruit isolated white background',
      'strawberry closeup macro fresh red detail',
      'fresh strawberries pile closeup top view',
    ],
  },
  '식품>신선식품>과일류>과일>복숭아': {
    queries: [
      'single peach fruit isolated white background',
      'peach fruit closeup macro fresh skin detail',
      'fresh peaches pile closeup top view',
    ],
  },
  '식품>신선식품>과일류>과일>망고': {
    queries: [
      'single mango fruit isolated white background',
      'mango fruit closeup macro fresh detail',
      'mango cut half cross section fresh',
    ],
  },
  '식품>신선식품>과일류>과일>바나나': {
    queries: [
      'banana bunch isolated white background',
      'banana fruit closeup macro fresh yellow',
      'fresh bananas pile closeup top view',
    ],
  },
  '식품>신선식품>과일류>과일>키위': {
    queries: [
      'kiwi fruit isolated white background',
      'kiwi fruit cut half closeup green detail',
      'fresh kiwi pile closeup top view',
    ],
  },
  '식품>신선식품>과일류>과일>참외': {
    queries: [
      'korean melon yellow fruit isolated white background',
      'yellow melon fruit closeup macro fresh',
      'oriental melon whole fruit studio closeup',
    ],
  },
  '식품>신선식품>과일류>과일>체리': {
    queries: [
      'cherries isolated white background',
      'cherry fruit closeup macro red detail',
      'fresh red cherries pile closeup top view',
    ],
  },
  '식품>신선식품>과일류>과일>블루베리': {
    queries: [
      'blueberries isolated white background',
      'blueberry fruit closeup macro detail',
      'fresh blueberries pile closeup top view',
    ],
  },
  // ---- 과일 폴백 ----
  '식품>신선식품>과일류': {
    queries: [
      'fresh fruit isolated white background',
      'fresh fruit closeup macro detail',
      'mixed fruits pile closeup top view',
    ],
  },
};

// 과일 카테고리만 대상
const COMMODITY_PREFIXES = [
  '식품>신선식품>과일류',
];

// ---- Photo Scoring Constants ----
// v3: 해상도+비율 중심, 밝기는 보조
// 과일 클로즈업은 avg_color가 과일색이라 밝기가 낮지만 좋은 사진

// 밝기: 보조 가중치 (15점) — 약간의 선호도만 부여
const BRIGHTNESS_WEIGHT = 15;
const BRIGHTNESS_MIN_THRESHOLD = 100;
const BRIGHTNESS_MAX_OPTIMAL = 220;

// 비율: 정사각형(1:1)에 가까울수록 높은 점수 (35점)
const ASPECT_WEIGHT = 35;
const ASPECT_PERFECT = 1.0;
const ASPECT_TOLERANCE = 0.3;

// 해상도: 핵심 가중치 (50점) — 전문 사진일수록 고해상도
const RESOLUTION_WEIGHT = 50;
const RESOLUTION_MIN = 500;
const RESOLUTION_OPTIMAL = 1200;

// 최종 필터 임계값
const MIN_SCORE_THRESHOLD = 30;

// ---- In-memory cache ----

const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

function getCached(cacheKey: string): PexelsPhoto[] | null {
  const entry = searchCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    searchCache.delete(cacheKey);
    return null;
  }
  return entry.photos;
}

function setCache(cacheKey: string, photos: PexelsPhoto[]) {
  searchCache.set(cacheKey, { photos, fetchedAt: Date.now() });
}

// ---- Scoring Functions ----

/** hex → RGB → 밝기(0~255) */
function hexBrightness(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return 128;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * 과일 사진 적합성 점수 (0~100)
 *
 * v3 점수 기준:
 * 1) 해상도 (50점) — 고해상도 = 전문 촬영
 * 2) 비율 (35점) — 정사각형 = 쿠팡 썸네일 적합
 * 3) 밝기 (15점) — 약간의 보조 선호도
 */
function scoreProductPhoto(photo: PexelsPhoto): ScoredPhoto {
  const brightness = hexBrightness(photo.avg_color || '#808080');

  // 1) 해상도 점수 (핵심)
  const minDim = Math.min(photo.width, photo.height);
  let resolutionScore = 0;
  if (minDim >= RESOLUTION_OPTIMAL) {
    resolutionScore = RESOLUTION_WEIGHT;
  } else if (minDim >= RESOLUTION_MIN) {
    resolutionScore = RESOLUTION_WEIGHT *
      ((minDim - RESOLUTION_MIN) / (RESOLUTION_OPTIMAL - RESOLUTION_MIN));
  }

  // 2) 비율 점수 (1:1이 만점)
  const ratio = photo.width / photo.height;
  const deviation = Math.abs(ratio - ASPECT_PERFECT);
  let aspectScore = 0;
  if (deviation <= ASPECT_TOLERANCE) {
    aspectScore = ASPECT_WEIGHT * (1 - deviation / ASPECT_TOLERANCE);
  }

  // 3) 밝기 점수 (보조)
  let brightnessScore = 0;
  if (brightness >= BRIGHTNESS_MAX_OPTIMAL) {
    brightnessScore = BRIGHTNESS_WEIGHT;
  } else if (brightness >= BRIGHTNESS_MIN_THRESHOLD) {
    brightnessScore = BRIGHTNESS_WEIGHT *
      ((brightness - BRIGHTNESS_MIN_THRESHOLD) / (BRIGHTNESS_MAX_OPTIMAL - BRIGHTNESS_MIN_THRESHOLD));
  }

  const score = resolutionScore + aspectScore + brightnessScore;

  return {
    photo,
    score: Math.round(score * 10) / 10,
    brightness: Math.round(brightness),
    aspectScore: Math.round(aspectScore * 10) / 10,
    resolutionScore: Math.round(resolutionScore * 10) / 10,
  };
}

/**
 * Pexels 검색 결과를 과일 상품사진 기준으로 필터 + 정렬
 */
function filterAndRankPhotos(photos: PexelsPhoto[]): PexelsPhoto[] {
  const scored = photos.map(scoreProductPhoto);

  const passed = scored
    .filter(s => s.score >= MIN_SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  // 필터링 결과가 너무 적으면 완화 (최소 5장 확보)
  if (passed.length < 5 && scored.length >= 5) {
    const relaxed = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(10, photos.length));
    return relaxed.map(s => s.photo);
  }

  return passed.map(s => s.photo);
}

// ---- Public Functions ----

/**
 * 과일 카테고리 판정 (클라이언트/서버 공용)
 */
export function isCommodityCategory(categoryPath: string): boolean {
  if (!categoryPath) return false;
  return COMMODITY_PREFIXES.some(prefix => categoryPath.startsWith(prefix));
}

/**
 * 카테고리 경로 → Pexels 검색 쿼리셋 (longest prefix match)
 */
export function getCategoryQueries(categoryPath: string): CategoryQueries | null {
  if (!categoryPath) return null;

  if (FRUIT_QUERY_MAP[categoryPath]) {
    return FRUIT_QUERY_MAP[categoryPath];
  }

  let bestMatch = '';
  let bestQueries: CategoryQueries | null = null;

  for (const [path, queries] of Object.entries(FRUIT_QUERY_MAP)) {
    if (categoryPath.startsWith(path) && path.length > bestMatch.length) {
      bestMatch = path;
      bestQueries = queries;
    }
  }

  return bestQueries;
}

// 하위 호환
export function getCategorySearchQuery(categoryPath: string): string | null {
  const queries = getCategoryQueries(categoryPath);
  return queries?.queries[0] ?? null;
}

/**
 * 단일 Pexels API 호출
 */
async function fetchPexels(
  query: string,
  apiKey: string,
  perPage: number = 30,
): Promise<PexelsPhoto[]> {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=square`;

  const res = await fetch(url, {
    headers: { Authorization: apiKey },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Pexels API error: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as PexelsSearchResponse;
  return data.photos || [];
}

/**
 * 카테고리용 Pexels 검색 (3-쿼리 병렬 + 스코어링 + 캐싱)
 *
 * 1) single + closeup + cut/pile 쿼리 병렬 실행
 * 2) 결과 합치고 중복 제거 (photo.id 기준)
 * 3) 해상도+비율 스코어링 → 필터 → 정렬
 * 4) 결과를 캐싱 (카테고리 경로 기준)
 */
export async function searchPexels(
  categoryPath: string,
  apiKey: string,
  count: number = 30,
): Promise<PexelsPhoto[]> {
  const cacheKey = `cat:${categoryPath}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const catQueries = getCategoryQueries(categoryPath);
  if (!catQueries) return [];

  // 모든 쿼리 병렬 호출 (쿼리당 15장씩)
  const fetchPromises = catQueries.queries.map(q =>
    fetchPexels(q, apiKey, 15),
  );

  const results = await Promise.allSettled(fetchPromises);
  const allPhotos: PexelsPhoto[] = [];
  const seenIds = new Set<number>();

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const photo of result.value) {
        if (!seenIds.has(photo.id)) {
          seenIds.add(photo.id);
          allPhotos.push(photo);
        }
      }
    }
  }

  const ranked = filterAndRankPhotos(allPhotos);
  const final = ranked.slice(0, count);

  setCache(cacheKey, final);

  console.info(
    `[stock-images] "${categoryPath}" → ${allPhotos.length}장 검색 → ${ranked.length}장 통과 → ${final.length}장 캐시`,
  );

  return final;
}

/**
 * 셀러 시드 기반으로 사진 선택 — 셀러마다 다른 사진 조합 반환
 */
export function selectPhotosForSeller(
  photos: PexelsPhoto[],
  sellerSeed: string,
  count: number = 5,
): PexelsPhoto[] {
  if (photos.length === 0) return [];
  if (photos.length <= count) return [...photos];

  const seed = stringToSeed(sellerSeed);
  const rng = createSeededRandom(seed);

  const topHalf = Math.max(count * 2, Math.ceil(photos.length * 0.6));
  const pool = photos.slice(0, Math.min(topHalf, photos.length));

  const indices = pool.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  return indices.slice(0, count).map(i => pool[i]);
}

/**
 * Pexels 이미지 다운로드 → Supabase Storage 업로드 → CDN URL 반환
 */
export async function downloadAndUploadStockImage(
  photoUrl: string,
  megaloadUserId: string,
  supabaseServiceClient: { storage: { from: (bucket: string) => { upload: (path: string, body: Buffer | Uint8Array, options?: Record<string, unknown>) => Promise<{ data: { path: string } | null; error: { message: string } | null }>; getPublicUrl: (path: string) => { data: { publicUrl: string } } } } },
): Promise<string> {
  const imgRes = await fetch(photoUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to download image: ${imgRes.status}`);
  }

  const arrayBuffer = await imgRes.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const uuid = crypto.randomUUID();
  const storagePath = `megaload/${megaloadUserId}/stock/${uuid}.jpg`;

  const bucket = supabaseServiceClient.storage.from('product-images');
  const { data, error } = await bucket.upload(storagePath, buffer, {
    contentType: 'image/jpeg',
    upsert: false,
  });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data: urlData } = bucket.getPublicUrl(data!.path);
  return urlData.publicUrl;
}

// ---- 큐레이션 뱅크 조회 함수 ----

interface BankImage {
  id: string;
  cdn_url: string;
  original_filename: string;
}

/**
 * DB에서 해당 카테고리 뱅크 이미지 조회
 */
export async function queryBankImages(
  categoryKey: string,
  supabaseClient: { from: (table: string) => { select: (columns: string) => { eq: (col: string, val: string) => { eq: (col: string, val: boolean) => { order: (col: string) => Promise<{ data: BankImage[] | null; error: { message: string } | null }> } } } } },
): Promise<BankImage[]> {
  const { data, error } = await supabaseClient
    .from('stock_image_bank')
    .select('id, cdn_url, original_filename')
    .eq('category_key', categoryKey)
    .eq('is_active', true)
    .order('sort_order');

  if (error) {
    console.error(`[stock-bank] DB query failed for "${categoryKey}":`, error.message);
    return [];
  }

  return data || [];
}

/**
 * 뱅크 CDN URL 배열에 셀러 시드 셔플 적용하여 count개 선택
 */
export function selectBankUrlsForSeller(
  cdnUrls: string[],
  sellerSeed: string,
  count: number = 5,
): string[] {
  if (cdnUrls.length === 0) return [];
  if (cdnUrls.length <= count) return [...cdnUrls];

  const seed = stringToSeed(sellerSeed);
  const rng = createSeededRandom(seed);

  // Fisher-Yates 셔플 (상위 풀)
  const pool = [...cdnUrls];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, count);
}
