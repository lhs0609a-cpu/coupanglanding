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
 */
export async function scanDirectoryHandle(dirHandle: FileSystemDirectoryHandle): Promise<{
  dirName: string;
  products: ScannedProduct[];
}> {
  const products: ScannedProduct[] = [];

  // 하위 디렉토리 탐색
  for await (const [name, handle] of dirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (handle.kind !== 'directory') continue;
    if (!name.startsWith('product_')) continue;

    const productDirHandle = handle as FileSystemDirectoryHandle;
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

    // 이미지 파일 수집
    const mainImages = await collectImagesFromSubdir(productDirHandle, 'main_images', MAIN_IMAGE_PATTERN);
    // 상세이미지 = 리뷰 폴더에서만 가져옴 (review_images/ → reviews/)
    let reviewImages = await collectImagesFromSubdir(productDirHandle, 'review_images', IMAGE_PATTERN);
    if (reviewImages.length === 0) reviewImages = await collectImagesFromSubdir(productDirHandle, 'reviews', IMAGE_PATTERN);
    const detailImages = [...reviewImages];
    const infoImages = await collectImagesFromSubdir(productDirHandle, 'product_info', IMAGE_PATTERN);

    products.push({
      productCode,
      folderName: name,
      sourceUrl,
      productJson,
      mainImages,
      detailImages,
      infoImages,
      reviewImages,
    });
  }

  // 상품코드 순 정렬
  products.sort((a, b) => a.productCode.localeCompare(b.productCode, undefined, { numeric: true }));

  return { dirName: dirHandle.name, products };
}

/**
 * 하위 디렉토리에서 패턴에 맞는 이미지 파일 핸들을 수집
 */
async function collectImagesFromSubdir(
  parentHandle: FileSystemDirectoryHandle,
  subdirName: string,
  pattern: RegExp,
): Promise<ScannedImageFile[]> {
  try {
    const subHandle = await parentHandle.getDirectoryHandle(subdirName);
    const files: ScannedImageFile[] = [];

    for await (const [name, handle] of subHandle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind !== 'file') continue;
      if (!pattern.test(name)) continue;
      // 스캔 시점에 objectURL 생성 — 핸들 만료 방지
      let objectUrl: string | undefined;
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        objectUrl = URL.createObjectURL(file);
      } catch { /* 파일 읽기 실패 시 핸들만 저장 */ }
      files.push({ name, handle: handle as FileSystemFileHandle, objectUrl });
    }

    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return files;
  } catch {
    return [];
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

/**
 * 여러 이미지 파일을 일괄 업로드 (API 호출)
 * 반환: 업로드된 공개 URL 배열
 */
export async function uploadScannedImages(
  images: ScannedImageFile[],
  concurrency = 5,
): Promise<string[]> {
  if (images.length === 0) return [];

  const results: string[] = new Array(images.length).fill('');
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < images.length) {
      const idx = nextIndex++;
      const img = images[idx];
      const file = await img.handle.getFile();

      const formData = new FormData();
      formData.append('file', file, img.name);

      const res = await fetch('/api/megaload/products/bulk-register/upload-image', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '업로드 실패' }));
        throw new Error(`${img.name}: ${data.error || '업로드 실패'}`);
      }

      const data = await res.json();
      results[idx] = data.url;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, images.length) }, () => worker()),
  );

  return results;
}

/**
 * 이미지 변형을 적용한 후 업로드한다.
 * applyVariation이 true이면 각 이미지에 Canvas 변형(crop, 밝기, 채도, 회전)을 적용하여
 * 파일 해시가 달라진 Blob을 업로드한다.
 *
 * @param images - 스캔된 이미지 파일 배열
 * @param applyVariation - true이면 변형 적용, false이면 원본 업로드
 * @param concurrency - 동시 업로드 수
 */
export async function uploadScannedImagesWithVariation(
  images: ScannedImageFile[],
  applyVariation: boolean,
  concurrency = 5,
): Promise<string[]> {
  if (images.length === 0) return [];
  if (!applyVariation) return uploadScannedImages(images, concurrency);

  const { generateImageVariationParams, applyImageVariation } = await import('./image-variation');

  const results: string[] = new Array(images.length).fill('');
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < images.length) {
      const idx = nextIndex++;
      const img = images[idx];
      const file = await img.handle.getFile();

      // 변형 적용
      let uploadBlob: Blob = file;
      try {
        const variation = generateImageVariationParams();
        uploadBlob = await applyImageVariation(file, variation);
      } catch (err) {
        console.warn(`[variation] ${img.name} 변형 실패, 원본 사용:`, err);
      }

      const formData = new FormData();
      const ext = img.name.replace(/.*\./, '');
      const variedName = img.name.replace(/\.[^.]+$/, `_v.${ext === 'png' ? 'jpg' : ext}`);
      formData.append('file', uploadBlob, variedName);

      const res = await fetch('/api/megaload/products/bulk-register/upload-image', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '업로드 실패' }));
        throw new Error(`${img.name}: ${data.error || '업로드 실패'}`);
      }

      const data = await res.json();
      results[idx] = data.url;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, images.length) }, () => worker()),
  );

  return results;
}
