/**
 * 클라이언트 측 폴더 스캐너
 * File System Access API (showDirectoryPicker)를 사용하여
 * 브라우저에서 직접 폴더를 읽고 상품 데이터를 추출
 */

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
}

const IMAGE_PATTERN = /\.(jpg|jpeg|png|webp)$/i;
// 대표이미지: 모든 jpg/jpeg/png/webp 파일 허용 (product_숫자 패턴 제한 해제)
const MAIN_IMAGE_PATTERN = /\.(jpg|jpeg|png|webp)$/i;

/**
 * showDirectoryPicker()로 사용자가 폴더를 선택하도록 하고,
 * product_* 하위 폴더를 스캔하여 상품 목록을 반환
 */
export async function pickAndScanFolder(): Promise<{
  dirName: string;
  products: ScannedProduct[];
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
}> {
  // Phase 1: product_* 디렉토리 핸들 수집 (순차 — 빠름)
  const productDirs: { name: string; handle: FileSystemDirectoryHandle }[] = [];
  for await (const [name, handle] of dirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (handle.kind !== 'directory') continue;
    if (!name.startsWith('product_')) continue;
    productDirs.push({ name, handle: handle as FileSystemDirectoryHandle });
  }

  // Phase 2: 10개씩 병렬 처리
  const SCAN_CONCURRENCY = 10;
  const products: ScannedProduct[] = [];

  for (let i = 0; i < productDirs.length; i += SCAN_CONCURRENCY) {
    const batch = productDirs.slice(i, i + SCAN_CONCURRENCY);
    const results = await Promise.all(batch.map(({ name, handle }) =>
      scanSingleProduct(name, handle),
    ));
    products.push(...results);
  }

  // 상품코드 순 정렬
  products.sort((a, b) => a.productCode.localeCompare(b.productCode, undefined, { numeric: true }));

  return { dirName: dirHandle.name, products };
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

  // P1-4: main_images만 objectURL 즉시 생성, 나머지는 핸들만 수집 (lazy)
  const mainImages = await collectImagesFromSubdir(productDirHandle, 'main_images', MAIN_IMAGE_PATTERN, true);
  let reviewImages = await collectImagesFromSubdir(productDirHandle, 'review_images', IMAGE_PATTERN, false);
  if (reviewImages.length === 0) reviewImages = await collectImagesFromSubdir(productDirHandle, 'reviews', IMAGE_PATTERN, false);
  const detailImages = [...reviewImages];
  const infoImages = await collectImagesFromSubdir(productDirHandle, 'product_info', IMAGE_PATTERN, false);

  return {
    productCode,
    folderName: name,
    sourceUrl,
    productJson,
    mainImages,
    detailImages,
    infoImages,
    reviewImages,
  };
}

/**
 * 하위 디렉토리에서 패턴에 맞는 이미지 파일 핸들을 수집
 *
 * @param eagerObjectUrls - true이면 즉시 objectURL 생성 (main_images용), false이면 핸들만 수집
 */
async function collectImagesFromSubdir(
  parentHandle: FileSystemDirectoryHandle,
  subdirName: string,
  pattern: RegExp,
  eagerObjectUrls = true,
): Promise<ScannedImageFile[]> {
  try {
    const subHandle = await parentHandle.getDirectoryHandle(subdirName);
    const files: ScannedImageFile[] = [];

    for await (const [name, handle] of subHandle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind !== 'file') continue;
      if (!pattern.test(name)) continue;
      let objectUrl: string | undefined;
      // P1-4: eagerObjectUrls가 true일 때만 즉시 생성
      if (eagerObjectUrls) {
        try {
          const file = await (handle as FileSystemFileHandle).getFile();
          objectUrl = URL.createObjectURL(file);
        } catch { /* 파일 읽기 실패 시 핸들만 저장 */ }
      }
      files.push({ name, handle: handle as FileSystemFileHandle, objectUrl });
    }

    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return files;
  } catch {
    return [];
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

// ---- 클라이언트 이미지 압축 (업로드 전) ----
const UPLOAD_MAX_DIMENSION = 1200; // 쿠팡 권장: 500×500 이상, 1200px이면 충분
const UPLOAD_JPEG_QUALITY = 0.85;

async function compressImage(file: File): Promise<Blob> {
  // 이미 작으면 그대로 반환 (100KB 이하)
  if (file.size < 100 * 1024) return file;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      // 이미 작으면 그대로
      if (width <= UPLOAD_MAX_DIMENSION && height <= UPLOAD_MAX_DIMENSION) {
        resolve(file);
        return;
      }
      const scale = UPLOAD_MAX_DIMENSION / Math.max(width, height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(blob || file),
        'image/jpeg',
        UPLOAD_JPEG_QUALITY,
      );
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

// ---- 배치 업로드 (인증 1회, 최대 10장씩) ----
const BATCH_SIZE = 10; // 한 번에 업로드할 이미지 수

async function uploadBatch(blobs: { blob: Blob; name: string }[]): Promise<string[]> {
  const formData = new FormData();
  for (let i = 0; i < blobs.length; i++) {
    formData.append(`file_${i}`, blobs[i].blob, blobs[i].name);
  }
  const res = await fetch('/api/megaload/products/bulk-register/upload-images-batch', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    // 배치 API 없으면 개별 업로드로 폴백
    if (res.status === 404) return uploadIndividually(blobs);
    throw new Error(`배치 업로드 실패: ${res.status}`);
  }
  const data = await res.json();
  return data.urls || [];
}

async function uploadIndividually(blobs: { blob: Blob; name: string }[]): Promise<string[]> {
  const results = await Promise.all(
    blobs.map(async ({ blob, name }) => {
      const formData = new FormData();
      formData.append('file', blob, name);
      const res = await fetch('/api/megaload/products/bulk-register/upload-image', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) return '';
      const data = await res.json();
      return data.url || '';
    }),
  );
  return results;
}

/**
 * 여러 이미지 파일을 일괄 업로드 (배치 API + 압축)
 */
export async function uploadScannedImages(
  images: ScannedImageFile[],
  concurrency = 10,
): Promise<string[]> {
  if (images.length === 0) return [];

  const results: string[] = new Array(images.length).fill('');

  // 배치 단위로 처리 (동시 2배치)
  for (let i = 0; i < images.length; i += BATCH_SIZE * 2) {
    const batchPromises: Promise<void>[] = [];

    for (let b = 0; b < 2; b++) {
      const start = i + b * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, images.length);
      if (start >= images.length) break;

      const batchImages = images.slice(start, end);
      batchPromises.push(
        (async () => {
          // 병렬 압축
          const blobs = await Promise.all(
            batchImages.map(async (img) => {
              const file = await img.handle.getFile();
              const compressed = await compressImage(file);
              return { blob: compressed, name: img.name };
            }),
          );
          const urls = await uploadBatch(blobs);
          urls.forEach((url, idx) => { results[start + idx] = url; });
        })(),
      );
    }

    await Promise.all(batchPromises);
  }

  return results;
}

/**
 * 이미지 변형을 적용한 후 업로드 (배치 API + 압축)
 */
export async function uploadScannedImagesWithVariation(
  images: ScannedImageFile[],
  applyVariation: boolean,
  concurrency = 10,
): Promise<string[]> {
  if (images.length === 0) return [];
  if (!applyVariation) return uploadScannedImages(images, concurrency);

  const { generateImageVariationParams, applyImageVariation } = await import('./image-variation');
  const results: string[] = new Array(images.length).fill('');

  // 배치 단위로 처리 (동시 2배치)
  for (let i = 0; i < images.length; i += BATCH_SIZE * 2) {
    const batchPromises: Promise<void>[] = [];

    for (let b = 0; b < 2; b++) {
      const start = i + b * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, images.length);
      if (start >= images.length) break;

      const batchImages = images.slice(start, end);
      batchPromises.push(
        (async () => {
          // 병렬 압축 + 변형
          const blobs = await Promise.all(
            batchImages.map(async (img) => {
              const file = await img.handle.getFile();
              let uploadBlob: Blob = file;
              try {
                const variation = generateImageVariationParams();
                uploadBlob = await applyImageVariation(file, variation);
              } catch {
                // 변형 실패 시 원본 사용
              }
              const compressed = await compressImage(uploadBlob as File);
              const ext = img.name.replace(/.*\./, '');
              const variedName = img.name.replace(/\.[^.]+$/, `_v.${ext === 'png' ? 'jpg' : ext}`);
              return { blob: compressed, name: variedName };
            }),
          );
          const urls = await uploadBatch(blobs);
          urls.forEach((url, idx) => { results[start + idx] = url; });
        })(),
      );
    }

    await Promise.all(batchPromises);
  }

  return results;
}
