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
// (폴더명 캐시 제거 — 상품 폴더 1회 열거 + 인메모리 조회로 대체하여 실패 probe 자체를 없앰)

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

  // Phase 2: 워커 풀.
  //   상품당 FS 왕복이 "폴더 1회 열거 + product.json 1회 + 존재하는 서브폴더 열거"로 줄어(실패 probe 제거),
  //   워커당 동시 FS ≈ 5. 느린 네트워크 드라이브(구글드라이브)는 지연 은폐가 관건이라 동시성을 높인다.
  //   16 워커 × ~5 = 80 — Chromium FS 큐(보통 100+) 안쪽.
  const SCAN_CONCURRENCY = 16;
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
 *
 * 성능 (2026-05-13 개선):
 *   - 상품 안의 모든 독립 I/O 를 Promise.all 로 동시 진행
 *     (이전: json → summary → main → review → detail → info 6단계 sequential await)
 *   - review/detail/info 폴더명 후보 probe 도 슬롯 간 병렬 (캐시 hit 후엔 1회 probe)
 *   - info 폴더 objectURL 도 lazy 로 전환 (필요 시점에 ensureObjectUrl)
 *   - 한 워커 안 동시 FS 호출 ≈ 5 (json+summary+main+review+detail+info 중 동시진행 슬롯)
 *     SCAN_CONCURRENCY 7 × 워커 내 5 = 35 동시 FS — 브라우저 FS 큐 한계 안쪽.
 */
async function scanSingleProduct(
  name: string,
  productDirHandle: FileSystemDirectoryHandle,
  options: { skipDhash?: boolean } = {},
): Promise<ScannedProduct> {
  const productCode = name.replace('product_', '');

  // ── 상품 폴더 엔트리를 1회만 열거 → 인메모리 인덱스 ──────────────────────────
  //   느린 드라이브(네트워크/구글드라이브)에서 서브폴더 후보명을 getDirectoryHandle 로
  //   하나씩 probe(대부분 실패 throw — 상품당 20+회)하던 비용을 제거. 서버 스캐너와 동일 전략.
  const fileHandles = new Map<string, FileSystemFileHandle>();
  const dirHandles = new Map<string, FileSystemDirectoryHandle>();
  try {
    for await (const [entryName, handle] of productDirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind === 'file') fileHandles.set(entryName.toLowerCase(), handle as FileSystemFileHandle);
      else dirHandles.set(entryName.toLowerCase(), handle as FileSystemDirectoryHandle);
    }
  } catch { /* 접근 불가/빈 폴더 → 빈 결과로 폴백 */ }

  /** 후보명 중 실제 존재하는 첫 서브디렉토리 핸들 (FS 호출 없음 — 맵 조회) */
  const pickDir = (cands: string[]): FileSystemDirectoryHandle | null => {
    for (const c of cands) { const h = dirHandles.get(c.toLowerCase()); if (h) return h; }
    return null;
  };
  const mainDir = dirHandles.get('main_images');
  const reviewDir = pickDir(['review_images', 'reviews', 'review', '리뷰이미지', '리뷰 이미지', '리뷰', 'customer_reviews']);
  const detailDir = pickDir(['detail_images', 'details', 'detail', 'detail-images', 'detailimages', '상세이미지', '상세 이미지', '상세', 'description_images']);
  const infoDir = pickDir(['product_info', 'info', 'product-info', 'productinfo', '상품정보', '정보', 'info_images']);
  const jsonHandle = fileHandles.get('product.json');

  // 존재하는 것만 동시 로드 (이미지 objectURL 은 lazy — 썸네일은 useThumbnailCache 가 재생성).
  const [productJson, rawMainImages, reviewImagesInit, detailImagesInit, infoImages] = await Promise.all([
    (async () => {
      if (!jsonHandle) return {} as ScannedProduct['productJson'];
      try { return JSON.parse(await (await jsonHandle.getFile()).text()) as ScannedProduct['productJson']; }
      catch { return {} as ScannedProduct['productJson']; }
    })(),
    mainDir ? collectImagesFromDirHandle(mainDir, MAIN_IMAGE_PATTERN, false, true) : Promise.resolve([] as ScannedImageFile[]),
    reviewDir ? collectImagesFromDirHandle(reviewDir, IMAGE_PATTERN, false, false) : Promise.resolve([] as ScannedImageFile[]),
    detailDir ? collectImagesFromDirHandle(detailDir, IMAGE_PATTERN, false, false) : Promise.resolve([] as ScannedImageFile[]),
    infoDir ? collectImagesFromDirHandle(infoDir, IMAGE_PATTERN, false, false) : Promise.resolve([] as ScannedImageFile[]),
  ]);

  // sourceUrl: product.json 의 url 우선(추출 포맷에 포함) → 없을 때만 product_summary.txt 읽기(파일 I/O 절약).
  let sourceUrl: string | undefined = typeof (productJson as { url?: unknown })?.url === 'string'
    ? (productJson as { url?: string }).url : undefined;
  if (!sourceUrl) {
    const summaryHandle = fileHandles.get('product_summary.txt');
    if (summaryHandle) {
      try {
        const m = (await (await summaryHandle.getFile()).text()).match(/URL:\s*(https?:\/\/\S+)/i);
        sourceUrl = m ? m[1] : undefined;
      } catch { /* 없음 */ }
    }
  }

  // dHash 는 rawMainImages 준비 후. 대량 배치(>30)는 스킵(메인스레드 O(N²)) — 파일명 광고 필터로 대체.
  const mainImages = options.skipDhash ? rawMainImages : await filterMainImageOutliers(rawMainImages, name);

  let reviewImages = reviewImagesInit;
  let detailImages = detailImagesInit;

  // 상세페이지 본문 이미지 소스 폴백 (우선순위):
  //   1. detail_images 폴더 (명시적 상세이미지)
  //   2. review_images 폴더 (쿠팡PT 관행: 상세용 이미지가 여기에 있는 구조)
  //   3. main_images 오버플로우: 대표이미지 첫 3장을 제외한 나머지를 상세로 사용
  //      (쿠팡 스크랩 데이터는 main_images에 20+장이 있고 상세/리뷰 폴더가 없는 케이스가 일반적)
  // ★ review를 detail로 "복사"만 (이동 X). 그래야 review 폴더 이미지가
  //   대표이미지 후보로도 자동 promote 될 수 있음.
  if (detailImages.length === 0 && reviewImages.length > 0) {
    detailImages = [...reviewImages];
    // reviewImages 보존 — useBulkRegisterActions 가 main 후보로 promote.
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
    return await collectImagesFromDirHandle(subHandle, pattern, eagerObjectUrls, applyAdFilter);
  } catch {
    return [];
  }
}

/**
 * 이미 확보한 디렉토리 핸들에서 직접 이미지 수집 (getDirectoryHandle probe 없음).
 * 스캔 고속화: 상품 폴더 1회 열거로 얻은 서브폴더 핸들을 그대로 넘겨 실패 probe 를 제거.
 */
async function collectImagesFromDirHandle(
  subHandle: FileSystemDirectoryHandle,
  pattern: RegExp,
  eagerObjectUrls = true,
  applyAdFilter = true,
): Promise<ScannedImageFile[]> {
  try {
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
// egress/스토리지 비용 절감 (2026-05-18):
//   MAX 1000→900 + QUALITY 0.75→0.72 — 시각적 차이 거의 없으면서 파일 크기 ~30% 감소
//   쿠팡 모바일/PC 표시는 600~900px이라 900px 압축 결과로 충분
const UPLOAD_MAX_DIMENSION = 900;  // 쿠팡 권장: 900px이면 충분 (이전 1000)
const UPLOAD_MIN_DIMENSION = 500;  // 쿠팡 필수: 최소 500×500
const UPLOAD_JPEG_QUALITY = 0.72;  // 파일 크기 ~30% 감소 (이전 0.75)

// ─── Web Worker Pool — 메인스레드 freezing 완전 해소 ──────────────
// 인라인 Blob Worker로 빌드 설정 영향 없음. OffscreenCanvas 지원 브라우저에서만 활성.
// 4개 워커 = 4개 압축 동시 실행 (메인스레드는 자유)
const COMPRESS_WORKER_CODE = `
const MIN_DIM = 500;
const MAX_DIM = 900;
const QUALITY = 0.72;

async function compress(file, sellerBrand, forceReencode) {
  if (!sellerBrand && !forceReencode && file.size >= 100*1024 && file.size <= 3*1024*1024) return file;

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
  if (forceReencode) render = true; // 대용량 PNG → JPEG 재인코딩 강제

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
  const { id, file, sellerBrand, forceReencode } = e.data;
  try {
    const blob = await compress(file, sellerBrand, forceReencode);
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

  compress(file: Blob, sellerBrand?: string, forceReencode?: boolean): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      const worker = this.workers[this.rrIdx];
      this.rrIdx = (this.rrIdx + 1) % this.workers.length;
      worker.postMessage({ id, file, sellerBrand, forceReencode });
    });
  }
}

let _workerPool: CompressWorkerPool | null = null;
// hardwareConcurrency 기반 동적 풀 크기 (4~12 worker).
// 워터마크(아이템위너 방지) 모드에서는 모든 이미지가 디코드+재인코딩되어 CPU 바운드 →
// 워커 수가 곧 압축 처리량. 업로드는 네트워크 I/O라 메인스레드 CPU를 거의 안 쓰므로
// 코어를 1개만 양보하고 나머지를 압축에 투입(로컬 CPU만 사용 — 서버/비용 영향 0).
//   8코어: 7 worker (이전 6), 12코어: 11, 16코어+: 12 cap.
function getOptimalWorkerCount(): number {
  if (typeof navigator === 'undefined') return 4;
  const cores = navigator.hardwareConcurrency || 4;
  return Math.max(4, Math.min(12, cores - 1));
}

function getWorkerPool(): CompressWorkerPool | null {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  if (_workerPool) return _workerPool;
  try {
    _workerPool = new CompressWorkerPool(getOptimalWorkerCount());
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
  // 대용량 PNG 는 무압축 통과를 막고 JPEG 로 재인코딩한다.
  //   PNG 원본은 압축률이 낮아 1~3MB 가 흔하고, 그대로 32병렬 업로드하면 Storage 가 503 으로 과부하됨(실측).
  //   재인코딩은 업로드 용량·egress·Storage 사용량·시간을 모두 줄이고, 비용은 클라 CPU 뿐(서버 무관).
  const fileName = typeof (file as File).name === 'string' ? (file as File).name : '';
  const isPng = file.type === 'image/png' || /\.png$/i.test(fileName);
  const forceReencode = isPng && file.size > 1024 * 1024; // PNG & >1MB

  // 1) 휴리스틱 조기 탈출 — 디코드 비용 0
  // 워터마크 미사용 + 30KB~3MB 사이 파일은 그대로 통과 (대부분 정상 JPEG).
  // 30KB 미만이면 작은 아이콘일 가능성 — 차원 검증 위해 디코드.
  if (!sellerBrand && !forceReencode && file.size >= 30 * 1024 && file.size <= 3 * 1024 * 1024) {
    return file;
  }

  // 2) Web Worker 풀 시도
  const pool = getWorkerPool();
  if (pool) {
    try {
      return await pool.compress(file, sellerBrand, forceReencode);
    } catch (e) {
      console.warn('[compressImage] worker 실패, 메인스레드 폴백', e);
      // fallthrough → 메인스레드 처리
    }
  }

  // 3-4) 메인스레드 폴백
  return compressInMain(file, sellerBrand, forceReencode);
}

async function compressInMain(file: File | Blob, sellerBrand?: string, forceReencode?: boolean): Promise<Blob> {
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
  if (forceReencode) needsRender = true; // 대용량 PNG → JPEG 재인코딩 강제

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
//
// 동시성 정책 (2026-06-28 재설계):
//   과거 고정 32 는 단일 세션 버스트가 Supabase Storage 를 503(Service Unavailable)으로 몰아넣고,
//   그 실패분이 비용 드는 서버 폴백(upload-image 라우트)으로 흘러가 [500] 을 유발했다(실측 로그 확인).
//   → 고정값 추측 대신 "적응형 한도(AIMD)" 로 전환: Storage 가 버티는 만큼만 보낸다.
//   상한을 16 으로 낮춰 버스트 피크를 억제(직접 경로라 서버/비용과 무관, 손해 없음).
const DIRECT_CONCURRENCY = 16;     // 직접 업로드 동시성 상한 (적응형 한도의 최대치). 이전 32 → 16.
const DIRECT_CONCURRENCY_START = 12; // 초기 동시성 (성공 누적 시 상한까지 +1 복원)
const DIRECT_CONCURRENCY_MIN = 4;   // 503/429 누적 시 최소치 (이 밑으로는 안 떨어뜨림)

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

/** 인증된 유저의 megaload_user_id 캐시 — 직접 업로드 path 에 포함. 5분 TTL */
const USER_ID_CACHE_TTL_MS = 5 * 60 * 1000;
let _cachedUserId: string | null | undefined;
let _cachedUserIdAt = 0;
async function getCachedUserId(): Promise<string | null> {
  const now = Date.now();
  if (_cachedUserId !== undefined && (now - _cachedUserIdAt) < USER_ID_CACHE_TTL_MS) {
    return _cachedUserId;
  }
  const supabase = getSupabaseClient();
  if (!supabase) { _cachedUserId = null; _cachedUserIdAt = now; return null; }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    _cachedUserId = user?.id ?? null;
  } catch {
    _cachedUserId = null;
  }
  _cachedUserIdAt = now;
  return _cachedUserId;
}

/**
 * 업로드 시작 전 세션 신선도 보장 — access token 이 60초 이내 만료되면 refresh.
 * 만료된 채로 직접 업로드(400) + 서버 폴백(401) 둘 다 실패하는 시나리오 차단.
 * 호출 빈도 제어를 위해 30초 TTL 로 throttle.
 */
const SESSION_CHECK_TTL_MS = 30 * 1000;
let _lastSessionCheckAt = 0;
async function ensureFreshSession(): Promise<void> {
  const now = Date.now();
  if ((now - _lastSessionCheckAt) < SESSION_CHECK_TTL_MS) return;
  _lastSessionCheckAt = now;
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    if (expiresAt > 0 && (expiresAt - now) < 60_000) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed?.user) {
        _cachedUserId = refreshed.user.id;
        _cachedUserIdAt = now;
      }
    }
  } catch {
    /* 실패해도 업로드는 진행 — 정확한 사유는 업로드 응답으로 분류됨 */
  }
}

const SLEEP = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// 서버 폴백(Vercel `upload-image` 라우트) 전용 동시성 제한 — 직접 업로드(DIRECT_CONCURRENCY=32)와 별개.
//  직접 업로드는 Supabase 로 직접 가서 서버 메모리와 무관하지만, 폴백은 Vercel 함수에서 jimp 디코딩을 한다.
//  폴백이 32개 동시에 한 인스턴스로 몰리면 (formData 버퍼 + jimp 디코딩) 메모리가 누적돼 프로세스가
//  강제종료됨 → try/catch 로도 못 잡는 500. 폴백 동시성만 4 로 제한해 인스턴스당 피크를 억제한다.
const SERVER_FALLBACK_CONCURRENCY = 4;
let _serverFallbackActive = 0;
const _serverFallbackQueue: Array<() => void> = [];
async function acquireServerFallbackSlot(): Promise<() => void> {
  await new Promise<void>((resolve) => {
    if (_serverFallbackActive < SERVER_FALLBACK_CONCURRENCY) {
      _serverFallbackActive++;
      resolve();
    } else {
      _serverFallbackQueue.push(() => { _serverFallbackActive++; resolve(); });
    }
  });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    _serverFallbackActive--;
    const next = _serverFallbackQueue.shift();
    if (next) next();
  };
}

/**
 * 업로드 실패 사유 — 호출자가 사용자에게 정확한 원인을 보여주기 위해
 * 마지막 시도의 reason 을 메시지에 포함해서 throw.
 */
export class ImageUploadError extends Error {
  reason: 'oversize' | 'bad_extension' | 'network' | 'permission' | 'rate_limited' | 'server_5xx' | 'server_4xx' | 'supabase_error' | 'unknown';
  size?: number;
  constructor(reason: ImageUploadError['reason'], message: string, size?: number) {
    super(message);
    this.name = 'ImageUploadError';
    this.reason = reason;
    this.size = size;
  }
}

function classifySupabaseError(msg: string): ImageUploadError['reason'] {
  const m = msg.toLowerCase();
  if (/too\s*large|exceed|size\s*limit|413/.test(m)) return 'oversize';
  // RLS 위반 / 인증 만료 / 권한 부족 — Supabase Storage 가 흔히 400 으로 반환하는 메시지 패턴
  if (/permission|denied|not\s*allowed|unauthorized|forbidden|rls|row[-\s]level\s*security|jwt|invalid\s*token|expired/.test(m)) return 'permission';
  if (/rate|429|throttle/.test(m)) return 'rate_limited';
  // 503/Service Unavailable/과부하 — Storage 백엔드 과부하. 'rate_limited' 로 묶어 동시성 백오프 트리거.
  if (/503|service\s*unavailable|temporarily\s*unavailable|overload/.test(m)) return 'rate_limited';
  if (/network|fetch|aborted|timeout|econnreset|socket/.test(m)) return 'network';
  return 'supabase_error';
}

// ─── 적응형 업로드 동시성 (AIMD) ──────────────────────────────────
// Storage 503/429 가 보이면 동시성을 절반으로 줄이고(곱셈 감소), 연속 성공이 쌓이면 +1 복원(가산 증가).
// 고정 동시성 추측을 없애고 "Storage 가 버티는 만큼만" 보내 503 버스트를 자가-억제한다.
// 전부 브라우저 측 로직 — Vercel 서버/비용과 무관.
class AdaptiveUploadLimiter {
  private limit: number;
  private active = 0;
  private readonly min: number;
  private readonly max: number;
  private streak = 0;
  private readonly waiters: Array<() => void> = [];
  private static readonly GROW_AFTER = 8; // 연속 성공 8회마다 +1

  constructor(start: number, min: number, max: number) {
    this.min = min;
    this.max = max;
    this.limit = Math.max(min, Math.min(start, max));
  }

  async acquire(): Promise<void> {
    // limit 가 동적으로 줄 수 있으므로 매 깨어남마다 재확인 (while)
    while (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active++;
  }

  release(): void {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
  }

  /** 503/429 감지 — 동시성 절반(최소 min)으로 즉시 축소 */
  onOverload(): void {
    this.streak = 0;
    this.limit = Math.max(this.min, Math.floor(this.limit / 2));
  }

  /** 성공 — 누적 시 상한까지 천천히 복원 */
  onSuccess(): void {
    if (this.limit >= this.max) return;
    this.streak++;
    if (this.streak >= AdaptiveUploadLimiter.GROW_AFTER) {
      this.streak = 0;
      this.limit++;
      const next = this.waiters.shift(); // 늘어난 슬롯만큼 대기자 깨움
      if (next) next();
    }
  }
}

export async function uploadSingleImage(
  blob: Blob,
  name: string,
  opts?: { onOverload?: () => void },
): Promise<string> {
  const supabase = getSupabaseClient();
  // 마지막 실패 사유 — 양쪽 경로(direct + server) 다 실패하면 이걸로 throw
  let lastReason: ImageUploadError['reason'] = 'unknown';
  let lastMsg = '';
  // 직접 경로에서 503/429 가 한 번이라도 보이면(최종 성공 여부와 무관하게) 호출자에게 과부하 신호.
  //  적응형 한도가 동시성을 줄여 후속 업로드의 503 을 선제 차단한다.
  const signalOverload = () => { try { opts?.onOverload?.(); } catch { /* noop */ } };
  // 직접 경로 백오프 — 일반 실패는 짧게(200~), 과부하(rate_limited/503)는 지수(1s→2s→4s)로 길게.
  const directBackoff = (attempt: number) =>
    lastReason === 'rate_limited'
      ? 1000 * Math.pow(2, attempt) + Math.random() * 500  // 1s, 2s, 4s (+jitter)
      : 200 * (attempt + 1) + Math.random() * 200;

  // 사전 검증: 확장자
  if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(name)) {
    throw new ImageUploadError('bad_extension', `확장자 미지원: ${name}`, blob.size);
  }

  // 세션 만료 직전이면 미리 refresh — 200개 업로드 중간에 토큰 만료로 전부 실패하는 케이스 차단
  await ensureFreshSession();

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
          lastReason = 'supabase_error';
          lastMsg = 'public URL 조회 실패';
        }

        if (error) {
          lastMsg = error.message;
          lastReason = classifySupabaseError(error.message);
          // 413/file size 에러는 재시도해도 동일 → 즉시 폴백 시도
          if (lastReason === 'oversize') {
            console.warn(`[uploadSingleImage] 사이즈 초과 (size=${blob.size}) — 재시도 skip`);
            break;
          }
          // 503/429 — Storage 과부하. 호출자 동시성 백오프 트리거.
          if (lastReason === 'rate_limited') signalOverload();
          // RLS/세션 만료 — 1회만 강제 refresh 시도 (다음 attempt 에서 효과)
          if (lastReason === 'permission' && attempt === 0) {
            _lastSessionCheckAt = 0; // throttle 해제
            await ensureFreshSession();
          }
        }

        if (attempt < 2) {
          await SLEEP(directBackoff(attempt));
          continue;
        }
        console.warn(`[uploadSingleImage] Supabase 직접 업로드 최종 실패: ${lastMsg} (size=${blob.size})`);
      } catch (e) {
        lastMsg = e instanceof Error ? e.message : String(e);
        lastReason = classifySupabaseError(lastMsg);
        if (lastReason === 'rate_limited') signalOverload();
        if (attempt < 2) {
          await SLEEP(directBackoff(attempt));
          continue;
        }
        console.warn(`[uploadSingleImage] Supabase 직접 업로드 예외:`, e);
      }
    }
  }

  // ── 2차: 서버 API 폴백 (재시도 2회) ──
  // 서버 jimp 디코딩이 메모리 집약적이라 동시성 제한(4) 하에서만 호출 → 인스턴스 OOM 500 차단.
  const releaseSlot = await acquireServerFallbackSlot();
  try {
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
          lastReason = 'server_5xx';
          lastMsg = '서버가 url 미반환';
        } else if (res.status >= 400 && res.status < 500) {
          // 4xx — 재시도 불필요 (사이즈/형식/권한/인증)
          const errBody = await res.text().catch(() => '');
          lastMsg = `${res.status} ${errBody.slice(0, 200)}`;
          // 401/403 은 세션 만료/권한 — 'permission' 으로 분리해 정확한 안내 노출
          lastReason =
            res.status === 413 ? 'oversize'
            : res.status === 401 || res.status === 403 ? 'permission'
            : 'server_4xx';
          console.warn(`[uploadSingleImage] 서버 폴백 ${res.status} (재시도 skip): ${lastMsg}`);
          break;
        } else {
          // 5xx — 재시도
          lastReason = 'server_5xx';
          lastMsg = `서버 ${res.status}`;
          // 503 = 서버 라우트가 Storage 과부하/타임아웃을 명시적으로 보고한 것 → 동시성 백오프.
          if (res.status === 503) signalOverload();
          if (attempt < 2) {
            await SLEEP((res.status === 503 ? 1000 : 300) * (attempt + 1));
            continue;
          }
        }
      } catch (e) {
        lastMsg = e instanceof Error ? e.message : String(e);
        lastReason = 'network';
        if (attempt < 2) {
          await SLEEP(300 * (attempt + 1));
          continue;
        }
        console.warn(`[uploadSingleImage] 서버 폴백 fetch 실패 (최종):`, e);
      }
    }
  } finally {
    releaseSlot();
  }

  // 모든 경로 실패 — 구체적 사유로 throw (호출자가 사용자에게 표시)
  throw new ImageUploadError(lastReason, lastMsg || '업로드 실패', blob.size);
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

  // 호출자가 넘긴 concurrency 는 "희망 상한"으로만 취급하고 적응형 한도로 캡한다.
  //   일부 호출부가 concurrency=images.length(무제한) 로 부르는데, 이게 Storage 503 버스트의 주범.
  //   상한을 DIRECT_CONCURRENCY(16) 로 강제하고, 503/429 가 보이면 자동으로 더 줄인다.
  const cap = Math.max(DIRECT_CONCURRENCY_MIN, Math.min(concurrency, DIRECT_CONCURRENCY));
  const limiter = new AdaptiveUploadLimiter(
    Math.min(DIRECT_CONCURRENCY_START, cap),
    DIRECT_CONCURRENCY_MIN,
    cap,
  );

  async function worker() {
    while (nextIndex < images.length) {
      const idx = nextIndex++;
      try {
        // 압축(클라 CPU)은 한도 밖에서 — 업로드 슬롯을 점유하지 않고 미리 파이프라인.
        const file = await images[idx].handle.getFile();
        const compressed = await compressImage(file, sellerBrand);
        // 실제 네트워크 업로드만 적응형 한도로 게이트.
        await limiter.acquire();
        try {
          results[idx] = await uploadSingleImage(compressed, images[idx].name, {
            onOverload: () => limiter.onOverload(),
          });
        } finally {
          limiter.release();
        }
        if (results[idx]) {
          limiter.onSuccess();
        } else {
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
    Array.from({ length: Math.min(cap, images.length) }, () => worker()),
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
