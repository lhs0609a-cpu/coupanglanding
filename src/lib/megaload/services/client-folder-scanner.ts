/**
 * 클라이언트 측 폴더 스캐너
 * File System Access API (showDirectoryPicker)를 사용하여
 * 브라우저에서 직접 폴더를 읽고 상품 데이터를 추출
 */

import { detectVisualOutliers } from './image-outlier-detector';

/** 자동 제외 사유 — 스코어링/이상치 검출 단계에서 태그됨 */
export type AutoExcludeReason =
  | 'hard_filter'      // detectTextBanner / scoreFillRatio 등 하드필터 적중
  | 'low_score'        // overall 스코어가 임계값 미만
  | 'color_outlier'    // 그룹 색상 분포 대비 격차 (chi²)
  | 'unrelated_to_main' // 1번 대표이미지와 색상 분포 격차
  | 'duplicate'        // 다른 이미지와 색상/구도 거의 동일 (중복)
  | 'text_banner'      // 광고/이벤트 텍스트 배너
  | 'empty_image';     // 빈 이미지 / 콘텐츠 부족

export interface ScannedImageFile {
  name: string;
  handle: FileSystemFileHandle;
  /** 스캔 시점에 생성된 objectURL — 핸들 만료와 무관하게 이미지 표시 가능 */
  objectUrl?: string;
  /** 자동 제외 권장 사유 (스코어링 단계에서 태그) */
  autoExcludeReason?: AutoExcludeReason;
  /** 자동 제외 사유 디버그 정보 (optional) */
  autoExcludeDetail?: string;
  /**
   * scannedReviewImages 의 인덱스 — 사용자가 리뷰 이미지를 대표 이미지로 promote 한 경우.
   * 동일 ScannedImageFile 의 복사본이 scannedMainImages 끝에 추가되며, 이 필드로 식별.
   * 등록 파이프라인은 scannedMainImages 만 보면 되고, 별도 분기 없이 그대로 업로드.
   */
  promotedFromReview?: number;
}

export interface ScannedProduct {
  productCode: string;
  folderName: string;
  /** product_summary.txt에서 추출한 원본 상품 URL */
  sourceUrl?: string;
  productJson: {
    name?: string;
    title?: string;
    price?: number;
    brand?: string;
    tags?: string[];
    description?: string;
    [key: string]: unknown;
  };
  mainImages: ScannedImageFile[];
  detailImages: ScannedImageFile[];
  infoImages: ScannedImageFile[];
  reviewImages: ScannedImageFile[];
  /** product_* 디렉토리 핸들 (main_images 리스캔용) */
  dirHandle?: FileSystemDirectoryHandle;
}

const IMAGE_PATTERN = /\.(jpg|jpeg|png|webp)$/i;
// 대표이미지: main_images 폴더 내 모든 이미지 허용 (누끼 포함)
// 광고/배지는 AD_PATTERN으로 별도 제외
const MAIN_IMAGE_PATTERN = IMAGE_PATTERN;

/**
 * showDirectoryPicker()로 사용자가 폴더를 선택하도록 하고,
 * product_* 하위 폴더를 스캔하여 상품 목록을 반환
 */
export interface ScanProgress {
  current: number;
  total: number;
  currentName?: string;
  phase: 'listing' | 'scanning' | 'finalizing';
}

export type ScanProgressCallback = (progress: ScanProgress) => void;

/** 이 규모 이상이면 dHash 군집 이탈치 감지 스킵 (메인스레드 부담 회피) */
const DHASH_SKIP_THRESHOLD = 30;

/**
 * 배치 단위 폴더명 캐시 — 처음 발견한 성공 폴더명을 슬롯별로 기억해
 * 후속 상품에서는 6~9개 후보 시도 대신 1~2회로 단축.
 * scanDirectoryHandle 진입 시 reset, 한 배치 내에서만 유효.
 */
type FolderSlot = 'review' | 'detail' | 'info';
const folderNameCache: Record<FolderSlot, string | null> = {
  review: null, detail: null, info: null,
};
function resetFolderNameCache() {
  folderNameCache.review = null;
  folderNameCache.detail = null;
  folderNameCache.info = null;
}

export async function pickAndScanFolder(onProgress?: ScanProgressCallback): Promise<{
  dirName: string;
  products: ScannedProduct[];
  thirdPartyImages: ScannedImageFile[];
}> {
  // showDirectoryPicker 지원 확인
  if (!('showDirectoryPicker' in window)) {
    throw new Error('이 브라우저는 폴더 선택을 지원하지 않습니다. Chrome 또는 Edge를 사용해주세요.');
  }

  const dirHandle = await (window as unknown as { showDirectoryPicker: (opts?: object) => Promise<FileSystemDirectoryHandle> })
    .showDirectoryPicker({ mode: 'read' });

  return scanDirectoryHandle(dirHandle, onProgress);
}

/**
 * FileSystemDirectoryHandle을 받아 product_* 하위 폴더를 스캔
 *
 * P1-3: 폴더 병렬 스캔 (SCAN_CONCURRENCY=10)
 * P1-4: objectURL 지연 생성 (main_images만 즉시, 나머지 lazy)
 */
export async function scanDirectoryHandle(
  dirHandle: FileSystemDirectoryHandle,
  onProgress?: ScanProgressCallback,
): Promise<{
  dirName: string;
  products: ScannedProduct[];
  thirdPartyImages: ScannedImageFile[];
}> {
  onProgress?.({ current: 0, total: 0, phase: 'listing' });

  // 새 배치 시작 — 폴더명 캐시 리셋
  resetFolderNameCache();

  // Phase 1: product_* 디렉토리 핸들 수집 (순차 — 빠름)
  const productDirs: { name: string; handle: FileSystemDirectoryHandle }[] = [];
  for await (const [name, handle] of dirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (handle.kind !== 'directory') continue;
    if (!name.startsWith('product_')) continue;
    productDirs.push({ name, handle: handle as FileSystemDirectoryHandle });
  }

  // 대량 배치에서 dHash는 메인스레드를 막으므로 스킵 (파일명 필터 + AI 필터로 대체)
  const skipDhash = productDirs.length > DHASH_SKIP_THRESHOLD;
  if (skipDhash) {
    console.info(`[scan] 상품 ${productDirs.length}개 — dHash 이탈치 감지 스킵 (임계 ${DHASH_SKIP_THRESHOLD})`);
  }

  onProgress?.({ current: 0, total: productDirs.length, phase: 'scanning' });

  // Phase 2: 워커 풀 — 12 → 6 으로 하향 (FS API 동시 호출 폭주 방지).
  // 12 워커가 동시에 collectImagesFromSubdir을 부르면 각자 5 getFile = 60 동시 호출 → 35개 이후 throttle.
  // 6 워커로 줄이면 30 동시 호출 — 브라우저 FS 큐 한계 내.
  // 추가: 매 상품 처리 후 setTimeout(0) yield 로 메인스레드 starvation 방지 (UI 응답성 + GC 기회 확보).
  const SCAN_CONCURRENCY = 10;
  const products: ScannedProduct[] = new Array(productDirs.length);
  let nextProductIdx = 0;
  let doneCount = 0;
  async function productWorker() {
    while (nextProductIdx < productDirs.length) {
      const idx = nextProductIdx++;
      const { name, handle } = productDirs[idx];
      products[idx] = await scanSingleProduct(name, handle, { skipDhash });
      doneCount++;
      onProgress?.({ current: doneCount, total: productDirs.length, currentName: name, phase: 'scanning' });
      // 메인스레드에 작은 호흡 — 5상품마다 한 번
      if (doneCount % 5 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SCAN_CONCURRENCY, productDirs.length) }, () => productWorker()),
  );

  onProgress?.({ current: productDirs.length, total: productDirs.length, phase: 'finalizing' });

  // 상품코드 순 정렬
  products.sort((a, b) => a.productCode.localeCompare(b.productCode, undefined, { numeric: true }));

  // 제3자 이미지 폴더 스캔 (배치 루트 하위 폴더)
  let thirdPartyImages: ScannedImageFile[] = [];
  const tpFolderNames = ['제3자이미지', '제3자 이미지', '제3자', 'third_party', 'third-party', 'thirdparty', '제삼자이미지', '제삼자 이미지'];
  for (const subName of tpFolderNames) {
    try {
      thirdPartyImages = await collectImagesFromSubdir(dirHandle, subName, IMAGE_PATTERN, true);
      if (thirdPartyImages.length > 0) {
        console.info(`[scan] 제3자 이미지 ${thirdPartyImages.length}장 발견 (${subName}/)`);
        break;
      }
    } catch { /* 폴더 없음 — 무시 */ }
  }
  if (thirdPartyImages.length === 0) {
    // 디버그: 배치 루트 하위 폴더 목록 출력 (제3자 이미지 폴더 찾기 도움)
    const subdirs: string[] = [];
    try {
      for await (const [name, handle] of dirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
        if (handle.kind === 'directory' && !name.startsWith('product_')) subdirs.push(name);
      }
    } catch { /* ignore */ }
    console.warn(`[scan] 제3자 이미지 폴더를 찾지 못했습니다. 인식 가능 폴더명: ${tpFolderNames.join(', ')}`);
    if (subdirs.length > 0) console.warn(`[scan] 현재 루트 하위 폴더: ${subdirs.join(', ')}`);
  }

  return { dirName: dirHandle.name, products, thirdPartyImages };
}

/**
 * 단일 product_* 폴더를 스캔
 */
async function scanSingleProduct(
  name: string,
  productDirHandle: FileSystemDirectoryHandle,
  options: { skipDhash?: boolean } = {},
): Promise<ScannedProduct> {
  const productCode = name.replace('product_', '');

  // product.json 읽기
  let productJson: ScannedProduct['productJson'] = {};
  try {
    const jsonHandle = await productDirHandle.getFileHandle('product.json');
    const file = await jsonHandle.getFile();
    const text = await file.text();
    productJson = JSON.parse(text);
  } catch {
    // product.json 없거나 파싱 실패
  }

  // product_summary.txt에서 원본 URL 추출
  let sourceUrl: string | undefined;
  try {
    const summaryHandle = await productDirHandle.getFileHandle('product_summary.txt');
    const summaryFile = await summaryHandle.getFile();
    const summaryText = await summaryFile.text();
    const urlMatch = summaryText.match(/URL:\s*(https?:\/\/\S+)/i);
    if (urlMatch) sourceUrl = urlMatch[1];
  } catch {
    // product_summary.txt 없음
  }

  // P1-4: main_images만 objectURL 즉시 생성, 나머지는 핸들만 수집 (lazy)
  // (이전엔 productDirHandle 전체를 for await로 pre-enumerate 했으나,
  //  병렬 워커 12개가 동시에 열거 시 브라우저 FS API가 지연 → 원래 방식으로 복원)
  const rawMainImages = await collectImagesFromSubdir(productDirHandle, 'main_images', MAIN_IMAGE_PATTERN, true, true);
  // 대량 배치에서는 dHash(메인스레드 O(N²)) 스킵 — 파일명 기반 광고 필터로 대체
  const mainImages = options.skipDhash ? rawMainImages : await filterMainImageOutliers(rawMainImages, name);

  // 폴백: 사용자 폴더 구조가 표준 이름과 다를 수 있으므로 여러 후보 검사.
  // 배치 단위 캐시 적용 — 첫 상품에서 성공한 폴더명을 후속 상품에서 우선 시도.
  // 150개 일괄 시 후속 149개 상품은 8회 시도 → 1회로 단축 (배치 95% 단축).
  const collectFirstMatch = async (
    slot: FolderSlot,
    names: string[],
    eagerObjectUrls: boolean,
    applyAdFilter: boolean,
  ): Promise<ScannedImageFile[]> => {
    // 캐시된 폴더명 우선 시도
    const cached = folderNameCache[slot];
    const ordered = cached ? [cached, ...names.filter((n) => n !== cached)] : names;
    for (const n of ordered) {
      const imgs = await collectImagesFromSubdir(productDirHandle, n, IMAGE_PATTERN, eagerObjectUrls, applyAdFilter);
      if (imgs.length > 0) {
        if (folderNameCache[slot] !== n) folderNameCache[slot] = n;
        return imgs;
      }
    }
    return [];
  };

  let reviewImages = await collectFirstMatch(
    'review',
    ['review_images', 'reviews', 'review', '리뷰이미지', '리뷰 이미지', '리뷰', 'customer_reviews'],
    false, false,
  );
  let detailImages = await collectFirstMatch(
    'detail',
    ['detail_images', 'details', 'detail', 'detail-images', 'detailImages', '상세이미지', '상세 이미지', '상세', 'description_images'],
    false, false,
  );
  const infoImages = await collectFirstMatch(
    'info',
    ['product_info', 'info', 'product-info', 'productInfo', '상품정보', '정보', 'info_images'],
    true, false,
  );

  // 상세페이지 본문 이미지 소스 폴백 (우선순위):
  //   1. detail_images 폴더 (명시적 상세이미지)
  //   2. review_images 폴더 (쿠팡PT 관행: 상세용 이미지가 여기에 있는 구조)
  //   3. main_images 오버플로우: 대표이미지 첫 3장을 제외한 나머지를 상세로 사용
  //      (쿠팡 스크랩 데이터는 main_images에 20+장이 있고 상세/리뷰 폴더가 없는 케이스가 일반적)
  if (detailImages.length === 0 && reviewImages.length > 0) {
    detailImages = reviewImages;
    reviewImages = [];
  }
  if (detailImages.length < 3 && mainImages.length > 3) {
    // 대표이미지로 쓸 첫 3장을 제외한 나머지를 상세이미지에 추가
    const mainOverflow = mainImages.slice(3);
    const existingNames = new Set(detailImages.map(img => img.name));
    const additions = mainOverflow.filter(img => !existingNames.has(img.name));
    if (additions.length > 0) {
      detailImages = [...detailImages, ...additions];
    }
  }

  // (이전: detail/info 미발견 시 진단용 추가 enumerate. 150개 배치 시 누적 비용 큼 → 제거)
  // 사용자가 폴더 구조 확인 필요한 경우 collectImagesFromSubdir 의 totalFiles=0 로그로 충분.

  return {
    productCode,
    folderName: name,
    sourceUrl,
    productJson,
    mainImages,
    detailImages,
    infoImages,
    reviewImages,
    dirHandle: productDirHandle,
  };
}

/**
 * 하위 디렉토리에서 패턴에 맞는 이미지 파일 핸들을 수집
 *
 * @param eagerObjectUrls - true이면 즉시 objectURL 생성 (main_images용), false이면 핸들만 수집
 * @param applyAdFilter - true이면 파일명 기반 광고/배지 제외 (main_images/third_party용)
 */
async function collectImagesFromSubdir(
  parentHandle: FileSystemDirectoryHandle,
  subdirName: string,
  pattern: RegExp,
  eagerObjectUrls = true,
  applyAdFilter = true,
): Promise<ScannedImageFile[]> {
  try {
    const subHandle = await parentHandle.getDirectoryHandle(subdirName);

    // 비상품 파일명 패턴 (광고/배지/아이콘/네이버 UI — 서버 collectImages와 동일)
    const AD_PATTERN = /(?:^|[_\-.])(npay|naverpay|naver_|naver\-|smartstore|kakaopay|tosspay|payco|banner|badge|icon|logo|watermark|stamp|popup|event_banner|coupon|ad_|promotion|btn_|button_|shopping_|store_|delivery_info|return_info|guide_|notice_ban|footer|header)/i;

    // Phase 1: 핸들만 빠르게 수집 (디렉토리 이터레이션 — I/O 가벼움)
    // 150개 일괄 시 collectImagesFromSubdir이 600+회 호출되므로 per-call console.* 은 모두 제거.
    // (DevTools 열려있을 때 console 출력은 메인스레드 직렬화 비용 발생)
    const accepted: { name: string; handle: FileSystemFileHandle }[] = [];
    for await (const [name, handle] of subHandle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind !== 'file') continue;
      if (!pattern.test(name)) continue;
      if (applyAdFilter && AD_PATTERN.test(name)) continue;
      accepted.push({ name, handle: handle as FileSystemFileHandle });
    }

    // Phase 2: eagerObjectUrls면 getFile() + createObjectURL.
    // 이전: Promise.all 로 모든 이미지 동시 호출 → 12 워커 × N 이미지 = 100+ 동시 getFile → FS API 큐 막힘
    // 이후: bounded worker pool (5 동시)로 제한 — 이미지 많은 상품도 안정적
    let files: ScannedImageFile[];
    if (eagerObjectUrls && accepted.length > 0) {
      files = new Array(accepted.length);
      let next = 0;
      const GETFILE_CONCURRENCY = 10;
      async function getFileWorker() {
        while (next < accepted.length) {
          const i = next++;
          const { name, handle } = accepted[i];
          try {
            const file = await handle.getFile();
            files[i] = { name, handle, objectUrl: URL.createObjectURL(file) };
          } catch {
            files[i] = { name, handle, objectUrl: undefined };
          }
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(GETFILE_CONCURRENCY, accepted.length) }, () => getFileWorker()),
      );
    } else {
      files = accepted.map(({ name, handle }) => ({ name, handle, objectUrl: undefined }));
    }

    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return files;
  } catch {
    return [];
  }
}

/**
 * 저장된 dirHandle로 main_images를 다시 스캔 (이탈치 제거 포함)
 * 코드 업데이트 후 폴더 재선택 없이 누락 이미지 복구용
 */
export async function rescanMainImages(dirHandle: FileSystemDirectoryHandle): Promise<ScannedImageFile[]> {
  const raw = await collectImagesFromSubdir(dirHandle, 'main_images', MAIN_IMAGE_PATTERN, true);
  return filterMainImageOutliers(raw, dirHandle.name);
}

/**
 * dHash 군집 이탈치 필터 — 텍스트 배너/로고 등 비상품 이미지 자동 제외
 */
async function filterMainImageOutliers(
  images: ScannedImageFile[],
  label: string,
): Promise<ScannedImageFile[]> {
  try {
    const { outlierIndices, debug } = await detectVisualOutliers(images);
    if (outlierIndices.size === 0) {
      if (images.length >= 5) console.info(`[outlier] ${label}: 이탈치 없음 (${debug})`);
      return images;
    }
    const excluded = images.filter((_, i) => outlierIndices.has(i)).map(f => f.name);
    console.warn(`[outlier] ${label}: ${outlierIndices.size}장 제외 → ${excluded.join(', ')}`);
    console.info(`[outlier] ${label}: ${debug}`);
    return images.filter((_, i) => !outlierIndices.has(i));
  } catch (err) {
    console.warn(`[outlier] ${label}: 감지 실패 (원본 유지)`, err instanceof Error ? err.message : err);
    return images;
  }
}

/**
 * P1-4: objectURL 지연 생성 유틸 — 필요할 때 lazy 생성
 */
export async function ensureObjectUrl(img: ScannedImageFile): Promise<string | undefined> {
  if (img.objectUrl) return img.objectUrl;
  try {
    const file = await img.handle.getFile();
    img.objectUrl = URL.createObjectURL(file);
    return img.objectUrl;
  } catch {
    return undefined;
  }
}

/**
 * ScannedImageFile[]의 File 객체를 읽어 FormData로 변환
 * (업로드용)
 */
export async function imageFilesToFormData(
  images: ScannedImageFile[],
  fieldName: string,
): Promise<{ formData: FormData; count: number }> {
  const formData = new FormData();
  let count = 0;

  for (const img of images) {
    const file = await img.handle.getFile();
    formData.append(fieldName, file, img.name);
    count++;
  }

  return { formData, count };
}

// ---- 클라이언트 이미지 압축/리사이즈 (업로드 전) ----
const UPLOAD_MAX_DIMENSION = 1000; // 쿠팡 권장: 1000px이면 충분 (크기 초과 방지)
const UPLOAD_MIN_DIMENSION = 500;  // 쿠팡 필수: 최소 500×500
const UPLOAD_JPEG_QUALITY = 0.75;  // 파일 크기 제한 (Supabase 5MB, Vercel 4.5MB)

// ─── Web Worker Pool — 메인스레드 freezing 완전 해소 ──────────────
// 인라인 Blob Worker로 빌드 설정 영향 없음. OffscreenCanvas 지원 브라우저에서만 활성.
// 4개 워커 = 4개 압축 동시 실행 (메인스레드는 자유)
const COMPRESS_WORKER_CODE = `
const MIN_DIM = 500;
const MAX_DIM = 1200;
const QUALITY = 0.75;

async function compress(file, sellerBrand) {
  if (!sellerBrand && file.size >= 100*1024 && file.size <= 3*1024*1024) return file;

  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch (e) { return renderEmpty(); }

  const w = bitmap.width, h = bitmap.height;
  let tw = w, th = h, render = false;
  if (w < MIN_DIM || h < MIN_DIM) {
    const s = MIN_DIM / Math.min(w, h);
    tw = Math.max(MIN_DIM, Math.round(w * s));
    th = Math.max(MIN_DIM, Math.round(h * s));
    render = true;
  } else if (w > MAX_DIM || h > MAX_DIM) {
    const s = MAX_DIM / Math.max(w, h);
    tw = Math.round(w * s); th = Math.round(h * s);
    render = true;
  } else if (file.size > 3*1024*1024) {
    render = true;
  }
  if (sellerBrand) render = true;

  if (!render) { bitmap.close(); return file; }

  const canvas = new OffscreenCanvas(tw, th);
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); return file; }
  ctx.drawImage(bitmap, 0, 0, tw, th);
  if (sellerBrand) {
    const fs = Math.max(14, Math.round(tw * 0.028));
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.font = 'bold ' + fs + 'px sans-serif';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(sellerBrand, tw - 8, th - 8);
    ctx.restore();
  }
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
}

async function renderEmpty() {
  const c = new OffscreenCanvas(MIN_DIM, MIN_DIM);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, MIN_DIM, MIN_DIM);
  return c.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
}

self.addEventListener('message', async (e) => {
  const { id, file, sellerBrand } = e.data;
  try {
    const blob = await compress(file, sellerBrand);
    self.postMessage({ id, blob });
  } catch (err) {
    self.postMessage({ id, error: (err && err.message) || 'compress failed' });
  }
});
`;

interface CompressJob {
  resolve: (b: Blob) => void;
  reject: (e: Error) => void;
}

class CompressWorkerPool {
  private workers: Worker[] = [];
  private pending = new Map<number, CompressJob>();
  private nextId = 0;
  private rrIdx = 0;

  constructor(size: number) {
    const blob = new Blob([COMPRESS_WORKER_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    for (let i = 0; i < size; i++) {
      const w = new Worker(url);
      w.onmessage = (e: MessageEvent<{ id: number; blob?: Blob; error?: string }>) => {
        const { id, blob: result, error } = e.data;
        const handler = this.pending.get(id);
        if (!handler) return;
        this.pending.delete(id);
        if (error) handler.reject(new Error(error));
        else if (result) handler.resolve(result);
        else handler.reject(new Error('worker returned no blob'));
      };
      w.onerror = (err) => {
        console.warn('[compress-worker] error', err);
      };
      this.workers.push(w);
    }
    URL.revokeObjectURL(url);
  }

  compress(file: Blob, sellerBrand?: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      const worker = this.workers[this.rrIdx];
      this.rrIdx = (this.rrIdx + 1) % this.workers.length;
      worker.postMessage({ id, file, sellerBrand });
    });
  }
}

let _workerPool: CompressWorkerPool | null = null;
const WORKER_POOL_SIZE = 4;

function getWorkerPool(): CompressWorkerPool | null {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  if (_workerPool) return _workerPool;
  try {
    _workerPool = new CompressWorkerPool(WORKER_POOL_SIZE);
    return _workerPool;
  } catch (e) {
    console.warn('[compressImage] Worker 풀 생성 실패, 메인스레드 폴백', e);
    return null;
  }
}

/**
 * 이미지를 canvas로 리사이즈 (최소 500x500, 최대 1200px)
 *
 * 성능 계층 (빠른 순):
 *   1) 휴리스틱 조기 탈출 (디코드 0): 워터마크 없고 100KB~3MB → pass-through
 *   2) Web Worker 풀 (4 worker): 메인스레드 freezing 0
 *   3) OffscreenCanvas 메인스레드 폴백
 *   4) HTMLCanvasElement (구 브라우저 폴백)
 *
 * sellerBrand가 제공되면 반투명 워터마크를 삽입하여 CNN 임베딩 차별화
 */
export async function compressImage(file: File | Blob, sellerBrand?: string): Promise<Blob> {
  // 1) 휴리스틱 조기 탈출 — 디코드 비용 0
  if (!sellerBrand && file.size >= 100 * 1024 && file.size <= 3 * 1024 * 1024) {
    return file;
  }

  // 2) Web Worker 풀 시도
  const pool = getWorkerPool();
  if (pool) {
    try {
      return await pool.compress(file, sellerBrand);
    } catch (e) {
      console.warn('[compressImage] worker 실패, 메인스레드 폴백', e);
      // fallthrough → 메인스레드 처리
    }
  }

  // 3-4) 메인스레드 폴백
  return compressInMain(file, sellerBrand);
}

async function compressInMain(file: File | Blob, sellerBrand?: string): Promise<Blob> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    console.warn('[compressImage] createImageBitmap 실패 — 500x500 흰 캔버스 폴백');
    return await renderEmptyCanvas();
  }

  const { width, height } = bitmap;
  let targetW = width;
  let targetH = height;
  let needsRender = false;

  if (width < UPLOAD_MIN_DIMENSION || height < UPLOAD_MIN_DIMENSION) {
    const scale = UPLOAD_MIN_DIMENSION / Math.min(width, height);
    targetW = Math.max(UPLOAD_MIN_DIMENSION, Math.round(width * scale));
    targetH = Math.max(UPLOAD_MIN_DIMENSION, Math.round(height * scale));
    needsRender = true;
  } else if (width > UPLOAD_MAX_DIMENSION || height > UPLOAD_MAX_DIMENSION) {
    const scale = UPLOAD_MAX_DIMENSION / Math.max(width, height);
    targetW = Math.round(width * scale);
    targetH = Math.round(height * scale);
    needsRender = true;
  } else if (file.size > 3 * 1024 * 1024) {
    needsRender = true;
  }

  if (sellerBrand) needsRender = true;

  if (!needsRender) {
    bitmap.close();
    return file;
  }

  const useOffscreen = typeof OffscreenCanvas !== 'undefined';
  let blob: Blob | null;

  if (useOffscreen) {
    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    if (sellerBrand) drawWatermark(ctx, targetW, targetH, sellerBrand);
    bitmap.close();
    try {
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: UPLOAD_JPEG_QUALITY });
    } catch {
      blob = null;
    }
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    if (sellerBrand) drawWatermark(ctx, targetW, targetH, sellerBrand);
    bitmap.close();
    blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', UPLOAD_JPEG_QUALITY),
    );
  }

  return blob || file;
}

function drawWatermark(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  _h: number,
  text: string,
): void {
  const fontSize = Math.max(14, Math.round(w * 0.028));
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(text, w - 8, _h - 8);
  ctx.restore();
}

async function renderEmptyCanvas(): Promise<Blob> {
  const useOffscreen = typeof OffscreenCanvas !== 'undefined';
  if (useOffscreen) {
    const canvas = new OffscreenCanvas(UPLOAD_MIN_DIMENSION, UPLOAD_MIN_DIMENSION);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, UPLOAD_MIN_DIMENSION, UPLOAD_MIN_DIMENSION);
      try { return await canvas.convertToBlob({ type: 'image/jpeg', quality: UPLOAD_JPEG_QUALITY }); }
      catch { /* fallthrough */ }
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = UPLOAD_MIN_DIMENSION;
  canvas.height = UPLOAD_MIN_DIMENSION;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, UPLOAD_MIN_DIMENSION, UPLOAD_MIN_DIMENSION);
  return new Promise<Blob>(resolve => {
    canvas.toBlob(
      blob => resolve(blob || new Blob([], { type: 'image/jpeg' })),
      'image/jpeg',
      UPLOAD_JPEG_QUALITY,
    );
  });
}

// ---- Supabase 직접 업로드 (Vercel 경유 없음) ----
// 브라우저 → Supabase Storage 직접 업로드: 인증 0회, 네트워크 홉 1단계
const DIRECT_CONCURRENCY = 20; // 직접 업로드 동시성

import { createClient as createBrowserSupabase } from '@/lib/supabase/client';

let _supabaseClient: ReturnType<typeof createBrowserSupabase> | null = null;
function getSupabaseClient() {
  if (!_supabaseClient) {
    try {
      _supabaseClient = createBrowserSupabase();
    } catch {
      return null;
    }
  }
  return _supabaseClient;
}

function generateStoragePath(name: string, userId?: string): string {
  const ext = name.match(/\.(jpg|jpeg|png|webp|gif)$/i)?.[1]?.toLowerCase() || 'jpg';
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  // userId 가 있으면 "megaload/${userId}/browser/" 사용 — 추후 path-based RLS 강화에도 호환
  // 없으면 "megaload/browser/" — 현재 RLS 정책(bucket_id 체크만)에서도 동작
  const prefix = userId ? `megaload/${userId}/browser` : `megaload/browser`;
  return `${prefix}/${id}.${ext}`;
}

/** 인증된 유저의 megaload_user_id 캐시 — 직접 업로드 path 에 포함 */
let _cachedUserId: string | null | undefined;
async function getCachedUserId(): Promise<string | null> {
  if (_cachedUserId !== undefined) return _cachedUserId;
  const supabase = getSupabaseClient();
  if (!supabase) { _cachedUserId = null; return null; }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    _cachedUserId = user?.id ?? null;
  } catch {
    _cachedUserId = null;
  }
  return _cachedUserId;
}

const SLEEP = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function uploadSingleImage(blob: Blob, name: string): Promise<string> {
  const supabase = getSupabaseClient();

  // ── 1차: Supabase Storage 직접 업로드 (재시도 2회 + 지수 백오프) ──
  if (supabase) {
    const userId = (await getCachedUserId()) || undefined;
    const ext = name.match(/\.(png|gif|webp)$/i)?.[1]?.toLowerCase();
    const contentType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const storagePath = generateStoragePath(name, userId);
        const { data, error } = await supabase.storage
          .from('product-images')
          .upload(storagePath, blob, { contentType, cacheControl: '31536000', upsert: false });

        if (!error && data) {
          const { data: pub } = supabase.storage.from('product-images').getPublicUrl(storagePath);
          if (pub?.publicUrl) return pub.publicUrl;
        }

        // 413/file size 에러는 재시도해도 동일 → 즉시 폴백
        if (error?.message && /too\s*large|exceed|size limit|413/i.test(error.message)) {
          console.warn(`[uploadSingleImage] 사이즈 초과 (size=${blob.size}) — 재시도 skip`);
          break;
        }
        // 그 외 에러는 짧게 백오프 후 재시도
        if (attempt < 2) {
          await SLEEP(200 * (attempt + 1) + Math.random() * 200);
          continue;
        }
        if (error) {
          console.warn(`[uploadSingleImage] Supabase 직접 업로드 실패 (시도 ${attempt + 1}): ${error.message} (size=${blob.size})`);
        }
      } catch (e) {
        if (attempt < 2) {
          await SLEEP(200 * (attempt + 1) + Math.random() * 200);
          continue;
        }
        console.warn(`[uploadSingleImage] Supabase 직접 업로드 예외:`, e);
      }
    }
  }

  // ── 2차: 서버 API 폴백 (재시도 2회) ──
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const formData = new FormData();
      formData.append('file', blob, name);
      const res = await fetch('/api/megaload/products/bulk-register/upload-image', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.url) return data.url;
      }
      // 4xx 는 재시도 불필요 (사이즈/형식 에러)
      if (res.status >= 400 && res.status < 500) {
        const errBody = await res.text().catch(() => '');
        console.warn(`[uploadSingleImage] 서버 폴백 4xx (재시도 skip): ${res.status} ${errBody.slice(0, 200)}`);
        break;
      }
      // 5xx / 빈 응답은 재시도
      if (attempt < 2) await SLEEP(300 * (attempt + 1));
    } catch (e) {
      if (attempt < 2) {
        await SLEEP(300 * (attempt + 1));
        continue;
      }
      console.warn(`[uploadSingleImage] 서버 폴백 fetch 실패 (최종):`, e);
    }
  }
  return '';
}

/**
 * 여러 이미지 파일을 Supabase에 직접 업로드 (Vercel 경유 없음)
 * 압축 + 동시 15개 업로드
 */
export async function uploadScannedImages(
  images: ScannedImageFile[],
  concurrency = DIRECT_CONCURRENCY,
  sellerBrand?: string,
): Promise<string[]> {
  if (images.length === 0) return [];

  const results: string[] = new Array(images.length).fill('');
  const failures: string[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < images.length) {
      const idx = nextIndex++;
      try {
        const file = await images[idx].handle.getFile();
        const compressed = await compressImage(file, sellerBrand);
        results[idx] = await uploadSingleImage(compressed, images[idx].name);
        if (!results[idx]) {
          failures.push(images[idx].name);
          console.warn(`[upload] 업로드 실패 (빈 응답): ${images[idx].name}`);
        }
      } catch (err) {
        results[idx] = '';
        failures.push(images[idx].name);
        console.warn(`[upload] 업로드 실패: ${images[idx].name}`, err instanceof Error ? err.message : err);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, images.length) }, () => worker()),
  );

  if (failures.length > 0) {
    console.error(`[upload] ${images.length}개 중 ${failures.length}개 실패: ${failures.slice(0, 5).join(', ')}${failures.length > 5 ? ` 외 ${failures.length - 5}개` : ''}`);
  }

  return results;
}

/**
 * 이미지 업로드 (하위호환 래퍼 — 변형 파라미터 무시, uploadScannedImages로 위임)
 */
export async function uploadScannedImagesWithVariation(
  images: ScannedImageFile[],
  _applyVariation: boolean,
  concurrency = DIRECT_CONCURRENCY,
  sellerBrand?: string,
): Promise<string[]> {
  return uploadScannedImages(images, concurrency, sellerBrand);
}
