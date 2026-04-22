/**
 * 클라이언트 측 폴더 스캐너
 * File System Access API (showDirectoryPicker)를 사용하여
 * 브라우저에서 직접 폴더를 읽고 상품 데이터를 추출
 */

import { detectVisualOutliers } from './image-outlier-detector';

export interface ScannedImageFile {
  name: string;
  handle: FileSystemFileHandle;
  /** 스캔 시점에 생성된 objectURL — 핸들 만료와 무관하게 이미지 표시 가능 */
  objectUrl?: string;
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
export async function pickAndScanFolder(): Promise<{
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

  return scanDirectoryHandle(dirHandle);
}

/**
 * FileSystemDirectoryHandle을 받아 product_* 하위 폴더를 스캔
 *
 * P1-3: 폴더 병렬 스캔 (SCAN_CONCURRENCY=10)
 * P1-4: objectURL 지연 생성 (main_images만 즉시, 나머지 lazy)
 */
export async function scanDirectoryHandle(dirHandle: FileSystemDirectoryHandle): Promise<{
  dirName: string;
  products: ScannedProduct[];
  thirdPartyImages: ScannedImageFile[];
}> {
  // Phase 1: product_* 디렉토리 핸들 수집 (순차 — 빠름)
  const productDirs: { name: string; handle: FileSystemDirectoryHandle }[] = [];
  for await (const [name, handle] of dirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (handle.kind !== 'directory') continue;
    if (!name.startsWith('product_')) continue;
    productDirs.push({ name, handle: handle as FileSystemDirectoryHandle });
  }

  // Phase 2: 연속 워커 풀 — 배치 단위 Promise.all은 head-of-line 블로킹(한 상품이 느리면 동일 배치 9개 대기)을
  // 일으키므로 풀 슬롯이 비는 즉시 다음 상품을 채우는 방식으로 처리량 극대화
  const SCAN_CONCURRENCY = 12;
  const products: ScannedProduct[] = new Array(productDirs.length);
  let nextProductIdx = 0;
  async function productWorker() {
    while (nextProductIdx < productDirs.length) {
      const idx = nextProductIdx++;
      const { name, handle } = productDirs[idx];
      products[idx] = await scanSingleProduct(name, handle);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SCAN_CONCURRENCY, productDirs.length) }, () => productWorker()),
  );

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

  // PERF: 하위 디렉토리를 1회만 열거 → 후보 존재 여부를 Set으로 O(1) 조회
  // (이전엔 collectFirstMatch 에서 후보마다 getDirectoryHandle 호출 → 대부분 reject 대기)
  const productSubdirs = new Set<string>();
  try {
    for await (const [n, h] of productDirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if (h.kind === 'directory') productSubdirs.add(n);
    }
  } catch { /* ignore */ }

  // P1-4: main_images만 objectURL 즉시 생성, 나머지는 핸들만 수집 (lazy)
  const rawMainImages = productSubdirs.has('main_images')
    ? await collectImagesFromSubdir(productDirHandle, 'main_images', MAIN_IMAGE_PATTERN, true, true)
    : [];
  const mainImages = await filterMainImageOutliers(rawMainImages, name);

  // 폴백: 사용자 폴더 구조가 표준 이름과 다를 수 있으므로 여러 후보 검사 (존재하는 폴더만 실제 호출)
  const collectFirstMatch = async (
    names: string[],
    eagerObjectUrls: boolean,
    applyAdFilter: boolean,
  ): Promise<ScannedImageFile[]> => {
    for (const n of names) {
      if (!productSubdirs.has(n)) continue;
      const imgs = await collectImagesFromSubdir(productDirHandle, n, IMAGE_PATTERN, eagerObjectUrls, applyAdFilter);
      if (imgs.length > 0) return imgs;
    }
    return [];
  };

  let reviewImages = await collectFirstMatch(
    ['review_images', 'reviews', 'review', '리뷰이미지', '리뷰 이미지', '리뷰', 'customer_reviews'],
    false, false,
  );
  let detailImages = await collectFirstMatch(
    ['detail_images', 'details', 'detail', 'detail-images', 'detailImages', '상세이미지', '상세 이미지', '상세', 'description_images'],
    false, false,
  );
  const infoImages = await collectFirstMatch(
    ['product_info', 'info', 'product-info', 'productInfo', '상품정보', '정보', 'info_images'],
    true, false,
  );

  // 상세페이지 본문 이미지 소스 폴백 (우선순위):
  //   1. detail_images 폴더 (명시적 상세이미지)
  //   2. review_images 폴더 (쿠팡PT 관행: 상세용 이미지가 여기에 있는 구조)
  //   3. main_images 오버플로우: 대표이미지 첫 3장을 제외한 나머지를 상세로 사용
  //      (쿠팡 스크랩 데이터는 main_images에 20+장이 있고 상세/리뷰 폴더가 없는 케이스가 일반적)
  if (detailImages.length === 0 && reviewImages.length > 0) {
    console.info(`[scan] ${name}: detail_images 폴더 없음 — review_images ${reviewImages.length}장을 상세페이지 본문 이미지로 사용`);
    detailImages = reviewImages;
    reviewImages = [];
  }
  if (detailImages.length < 3 && mainImages.length > 3) {
    // 대표이미지로 쓸 첫 3장을 제외한 나머지를 상세이미지에 추가
    const mainOverflow = mainImages.slice(3);
    // 중복 제거: 이미 detail에 있는 핸들은 제외 (name 기준)
    const existingNames = new Set(detailImages.map(img => img.name));
    const additions = mainOverflow.filter(img => !existingNames.has(img.name));
    if (additions.length > 0) {
      console.info(`[scan] ${name}: main_images 오버플로우 ${additions.length}장을 상세이미지 풀에 추가`);
      detailImages = [...detailImages, ...additions];
    }
  }

  // 진단: 표준 폴더를 모두 못 찾았으면 실제 하위 폴더명을 출력
  if (detailImages.length === 0 || infoImages.length === 0) {
    if (productSubdirs.size > 0) {
      const missing: string[] = [];
      if (detailImages.length === 0) missing.push('상세/리뷰(detail_images·review_images)');
      if (infoImages.length === 0) missing.push('정보(product_info)');
      console.info(`[scan] ${name}: ${missing.join(', ')} 폴더 미발견 — 실제 하위 폴더: ${Array.from(productSubdirs).join(', ')}`);
    }
  }

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

    let totalFiles = 0;
    let patternSkipped = 0;
    let adSkipped = 0;
    let urlFailed = 0;
    const adSkippedNames: string[] = [];
    const patternSkippedNames: string[] = [];

    // Phase 1: 핸들만 빠르게 수집 (디렉토리 이터레이션 — I/O 가벼움)
    const accepted: { name: string; handle: FileSystemFileHandle }[] = [];
    for await (const [name, handle] of subHandle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind !== 'file') continue;
      totalFiles++;
      if (!pattern.test(name)) { patternSkipped++; patternSkippedNames.push(name); continue; }
      if (applyAdFilter && AD_PATTERN.test(name)) { adSkipped++; adSkippedNames.push(name); continue; }
      accepted.push({ name, handle: handle as FileSystemFileHandle });
    }

    // Phase 2: eagerObjectUrls면 getFile() + createObjectURL을 병렬 처리 (직렬 await 회피)
    let files: ScannedImageFile[];
    if (eagerObjectUrls && accepted.length > 0) {
      files = await Promise.all(accepted.map(async ({ name, handle }) => {
        try {
          const file = await handle.getFile();
          return { name, handle, objectUrl: URL.createObjectURL(file) };
        } catch (err) {
          urlFailed++;
          console.warn(`[scan] 파일 읽기 실패 (핸들 만료 가능): ${name}`, err instanceof Error ? err.message : err);
          return { name, handle, objectUrl: undefined };
        }
      }));
    } else {
      files = accepted.map(({ name, handle }) => ({ name, handle, objectUrl: undefined }));
    }

    console.info(`[scan] ${subdirName}: 전체 ${totalFiles}개 → 수집 ${files.length}개 (패턴제외=${patternSkipped}, 광고제외=${adSkipped}, URL실패=${urlFailed})`);
    if (files.length > 0) {
      console.info(`[scan] ${subdirName} 파일: ${files.map(f => f.name).join(', ')}`);
    }
    if (adSkipped > 0) {
      console.warn(`[scan] ${subdirName} 광고제외: ${adSkippedNames.join(', ')}`);
    }
    if (patternSkipped > 0) {
      console.warn(`[scan] ${subdirName} 패턴제외: ${patternSkippedNames.join(', ')}`);
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

/**
 * 이미지를 canvas로 리사이즈 (최소 500x500, 최대 1200px)
 * 모든 이미지를 canvas를 통해 처리하여 쿠팡 최소 크기를 보장
 *
 * sellerBrand가 제공되면 반투명 워터마크를 삽입하여 CNN 임베딩 차별화
 */
export async function compressImage(file: File | Blob, sellerBrand?: string): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const { width, height } = img;

      // 항상 canvas를 통해 처리 — 최소 500x500 보장
      let targetW = width;
      let targetH = height;

      if (width < UPLOAD_MIN_DIMENSION || height < UPLOAD_MIN_DIMENSION) {
        // 업스케일: 짧은 변이 500이 되도록
        const scale = UPLOAD_MIN_DIMENSION / Math.min(width, height);
        targetW = Math.max(UPLOAD_MIN_DIMENSION, Math.round(width * scale));
        targetH = Math.max(UPLOAD_MIN_DIMENSION, Math.round(height * scale));
      } else if (width > UPLOAD_MAX_DIMENSION || height > UPLOAD_MAX_DIMENSION) {
        // 다운스케일: 긴 변이 1200이 되도록
        const scale = UPLOAD_MAX_DIMENSION / Math.max(width, height);
        targetW = Math.round(width * scale);
        targetH = Math.round(height * scale);
      } else if (file.size < 100 * 1024) {
        // 크기 적절 + 파일 작으면 그대로
        resolve(file);
        return;
      } else if (file.size > 3 * 1024 * 1024) {
        // 3MB 초과 → JPEG 재압축 (Supabase/Vercel 크기 제한 방지)
        // 해상도가 이미 작아도 품질 낮춰 재압축해야 413 방지
        const scale = UPLOAD_MAX_DIMENSION / Math.max(width, height);
        if (scale < 1) {
          targetW = Math.round(width * scale);
          targetH = Math.round(height * scale);
        }
        // scale >= 1 이어도 아래 canvas.toBlob으로 재압축 진행 (break through)
      } else {
        // 크기 적절
        resolve(file);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, targetW, targetH);

      // 셀러 워터마크 삽입 — CNN 임베딩 차별화 (반투명, 우하단)
      if (sellerBrand) {
        const fontSize = Math.max(14, Math.round(targetW * 0.028));
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(sellerBrand, targetW - 8, targetH - 8);
        ctx.restore();
      }

      canvas.toBlob(
        (blob) => resolve(blob || file),
        'image/jpeg',
        UPLOAD_JPEG_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      // 이미지 로드 실패 시에도 최소 크기 보장을 위해 빈 캔버스 생성
      console.warn('[compressImage] 이미지 로드 실패 — 500x500 빈 캔버스 폴백');
      const canvas = document.createElement('canvas');
      canvas.width = UPLOAD_MIN_DIMENSION;
      canvas.height = UPLOAD_MIN_DIMENSION;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, UPLOAD_MIN_DIMENSION, UPLOAD_MIN_DIMENSION);
      canvas.toBlob(
        (blob) => resolve(blob || file),
        'image/jpeg',
        UPLOAD_JPEG_QUALITY,
      );
    };

    img.src = objectUrl;
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

function generateStoragePath(name: string): string {
  const ext = name.match(/\.(jpg|jpeg|png|webp|gif)$/i)?.[1]?.toLowerCase() || 'jpg';
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `megaload/browser/${id}.${ext}`;
}

export async function uploadSingleImage(blob: Blob, name: string): Promise<string> {
  // 1차: Supabase 직접 업로드
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const storagePath = generateStoragePath(name);
      const ext = name.match(/\.(png|gif|webp)$/i)?.[1]?.toLowerCase();
      const contentType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

      const { data, error } = await supabase.storage
        .from('product-images')
        .upload(storagePath, blob, { contentType, cacheControl: '31536000', upsert: false });

      if (!error && data) {
        const { data: pub } = supabase.storage.from('product-images').getPublicUrl(storagePath);
        if (pub?.publicUrl) return pub.publicUrl;
      }
      if (error) {
        console.warn(`[uploadSingleImage] Supabase 직접 업로드 실패: ${error.message} (size=${blob.size})`);
      }
    } catch (e) {
      console.warn(`[uploadSingleImage] Supabase 직접 업로드 예외:`, e);
    }
  }

  // 2차: 서버 API 폴백
  const formData = new FormData();
  formData.append('file', blob, name);
  const res = await fetch('/api/megaload/products/bulk-register/upload-image', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) return '';
  const data = await res.json();
  return data.url || '';
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
