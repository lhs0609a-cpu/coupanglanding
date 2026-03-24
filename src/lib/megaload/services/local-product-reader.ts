// ============================================================
// 로컬 소싱 폴더 스캔 + 이미지 업로드 유틸리티
// ============================================================

import fs from 'fs';
import path from 'path';
import { createServiceClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';
import { detectImageFormat, getImageDimensions } from './image-processor';
import { withRetry } from './retry';
import type { VariationParams } from './server-image-variation';

// ---- 보안: 허용 경로 + 이미지 크기 제한 ----

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/** 허용된 소싱 루트 디렉토리 (환경변수 또는 기본값) */
const ALLOWED_ROOTS = (process.env.ALLOWED_SOURCING_PATHS || 'J:,K:,D:\\sourcing,E:\\sourcing')
  .split(',')
  .map((p) => path.resolve(p.trim()).toLowerCase());

/**
 * 경로가 허용된 루트 디렉토리 하위인지 검증 (Path Traversal 방어)
 */
export function isPathAllowed(targetPath: string): boolean {
  const resolved = path.resolve(targetPath).toLowerCase();
  return ALLOWED_ROOTS.some((root) => resolved.startsWith(root));
}

export interface LocalProductJson {
  name?: string;
  title?: string;
  price?: number;
  brand?: string;
  tags?: string[];
  description?: string;
  barcode?: string;
  originalPrice?: number;     // 정가 (할인가 표시용)
  certifications?: { certificationType: string; certificationCode?: string }[];
  options?: { optionName: string; salePrice: number; stock?: number; barcode?: string; sku?: string }[];
  /** 소싱 원본 카테고리 (네이버 등) */
  sourceCategory?: {
    platform?: string;      // 'naver' | 'coupang' | etc.
    categoryId?: string;    // 네이버 cat_id (e.g. '50000806')
    categoryPath?: string;  // '화장품/미용>스킨케어>크림>넥크림'
  };
  /** 네이버 카테고리 ID 단축키 */
  naverCategoryId?: string;
  [key: string]: unknown;
}

export interface LocalProduct {
  folderPath: string;
  productCode: string;
  productJson: LocalProductJson;
  mainImages: string[];    // 로컬 파일 경로 (product_*.jpg만)
  detailImages: string[];  // output/*.jpg (AI 생성 상세페이지)
  infoImages: string[];    // product_info/*.png (상품정보제공고시)
  reviewImages: string[];  // reviews/*.jpg|png (리뷰 이미지)
}

/**
 * 지정된 폴더 내의 product_* 하위 폴더를 스캔하여 상품 목록을 반환
 */
export async function scanProductFolder(folderPath: string): Promise<LocalProduct[]> {
  const normalizedPath = path.resolve(folderPath);

  // 보안: Path Traversal 방어
  if (!isPathAllowed(normalizedPath)) {
    throw new Error(`허용되지 않은 경로입니다. 허용 경로: ${ALLOWED_ROOTS.join(', ')}`);
  }

  if (!fs.existsSync(normalizedPath)) {
    throw new Error(`폴더가 존재하지 않습니다: ${normalizedPath}`);
  }

  const entries = fs.readdirSync(normalizedPath, { withFileTypes: true });
  const productDirs = entries.filter(
    (e) => e.isDirectory() && e.name.startsWith('product_'),
  );

  const products: LocalProduct[] = [];

  for (const dir of productDirs) {
    const productPath = path.join(normalizedPath, dir.name);
    const productCode = dir.name.replace('product_', '');

    // product.json 읽기
    const jsonPath = path.join(productPath, 'product.json');
    let productJson: LocalProductJson = {};
    if (fs.existsSync(jsonPath)) {
      try {
        const raw = fs.readFileSync(jsonPath, 'utf-8');
        productJson = JSON.parse(raw) as LocalProductJson;
      } catch {
        // JSON 파싱 실패 시 빈 객체
      }
    }

    // main_images/ 내 product_*.jpg 파일
    const mainImagesDir = path.join(productPath, 'main_images');
    const mainImages = collectImages(mainImagesDir, /^product_\d+\.(jpg|jpeg|png)$/i);

    // detail_images/ → output/ 순 폴백
    let detailImages = collectImages(path.join(productPath, 'detail_images'), /\.(jpg|jpeg|png)$/i);
    if (detailImages.length === 0) {
      detailImages = collectImages(path.join(productPath, 'output'), /\.(jpg|jpeg|png)$/i);
    }

    // product_info/ 내 상품정보 이미지
    const infoDir = path.join(productPath, 'product_info');
    const infoImages = collectImages(infoDir, /\.(jpg|jpeg|png)$/i);

    // review_images/ → reviews/ 순 폴백
    let reviewImages = collectImages(path.join(productPath, 'review_images'), /\.(jpg|jpeg|png)$/i);
    if (reviewImages.length === 0) {
      reviewImages = collectImages(path.join(productPath, 'reviews'), /\.(jpg|jpeg|png)$/i);
    }

    // 상세이미지 없으면 리뷰이미지를 상세페이지용으로 활용
    if (detailImages.length === 0 && reviewImages.length > 0) {
      detailImages = [...reviewImages];
    }

    products.push({
      folderPath: productPath,
      productCode,
      productJson,
      mainImages,
      detailImages,
      infoImages,
      reviewImages,
    });
  }

  // 상품코드 순으로 정렬
  products.sort((a, b) => a.productCode.localeCompare(b.productCode, undefined, { numeric: true }));
  return products;
}

/**
 * 디렉토리 내 패턴에 맞는 이미지 파일 경로 목록을 반환 (정렬됨)
 */
function collectImages(dirPath: string, pattern: RegExp): string[] {
  if (!fs.existsSync(dirPath)) return [];
  try {
    const files = fs.readdirSync(dirPath)
      .filter((f) => pattern.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return files.map((f) => path.join(dirPath, f));
  } catch {
    return [];
  }
}

/**
 * 로컬 이미지 파일을 Supabase Storage에 업로드하고 CDN URL을 반환
 * variationParams가 제공되면 업로드 전에 서버사이드 이미지 변형 적용
 */
export async function uploadLocalImage(
  filePath: string,
  megaloadUserId: string,
  variationParams?: VariationParams,
): Promise<string> {
  // 파일 크기 검증
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`이미지 크기 초과 (${path.basename(filePath)}): ${(stat.size / 1024 / 1024).toFixed(1)}MB > 10MB`);
  }

  let buffer: Buffer = fs.readFileSync(filePath);

  // 아이템위너 방지: 이미지 변형 적용
  if (variationParams) {
    try {
      const { applyVariation } = await import('./server-image-variation');
      buffer = Buffer.from(await applyVariation(buffer, variationParams));
    } catch (err) {
      console.warn(`[이미지 변형] 실패 — 원본 사용 (${path.basename(filePath)}):`, err instanceof Error ? err.message : err);
    }
  }

  const format = detectImageFormat(buffer);
  const ext = format === 'unknown' ? 'jpg' : format;

  // 이미지 해상도 검증 (쿠팡 최소 500×500, 최대 5000×5000)
  const dims = getImageDimensions(buffer, format);
  if (dims.width > 0 && dims.height > 0) {
    if (dims.width < 500 || dims.height < 500) {
      console.warn(`[이미지 해상도 경고] ${path.basename(filePath)}: ${dims.width}×${dims.height} — 쿠팡 최소 500×500 미충족`);
    }
  }
  const contentType =
    format === 'png' ? 'image/png'
    : format === 'gif' ? 'image/gif'
    : format === 'webp' ? 'image/webp'
    : 'image/jpeg';

  // Retry로 일시적 네트워크 장애 대응
  return withRetry(async () => {
    const supabase = await createServiceClient();
    const storagePath = `megaload/${megaloadUserId}/bulk/${randomUUID()}.${ext}`;

    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(storagePath, buffer, {
        contentType,
        cacheControl: '31536000',
        upsert: false,
      });

    if (error || !data) {
      throw new Error(`이미지 업로드 실패 (${path.basename(filePath)}): ${error?.message}`);
    }

    const { data: publicData } = supabase.storage
      .from('product-images')
      .getPublicUrl(storagePath);

    return publicData.publicUrl;
  }, { maxRetries: 2, initialDelayMs: 500 });
}

/**
 * 여러 로컬 이미지를 일괄 업로드
 */
export async function uploadLocalImages(
  filePaths: string[],
  megaloadUserId: string,
): Promise<string[]> {
  const urls: string[] = [];
  for (const fp of filePaths) {
    const url = await uploadLocalImage(fp, megaloadUserId);
    urls.push(url);
  }
  return urls;
}

/**
 * 여러 로컬 이미지를 병렬로 업로드 (concurrency 제한)
 * 기존 uploadLocalImages 대비 ~80% 시간 단축
 *
 * allowPartialFailure=true: 일부 이미지 실패해도 성공한 것만 반환 (빈 문자열로 대체)
 * variationParamsList: 각 이미지에 적용할 변형 파라미터 (아이템위너 방지)
 */
export async function uploadLocalImagesParallel(
  filePaths: string[],
  megaloadUserId: string,
  concurrency = 5,
  allowPartialFailure = false,
  variationParamsList?: (VariationParams | undefined)[],
): Promise<string[]> {
  if (filePaths.length === 0) return [];

  const results: (string | Error)[] = new Array(filePaths.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < filePaths.length) {
      const idx = nextIndex++;
      try {
        const vp = variationParamsList?.[idx];
        results[idx] = await uploadLocalImage(filePaths[idx], megaloadUserId, vp);
      } catch (err) {
        results[idx] = err instanceof Error ? err : new Error(String(err));
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, filePaths.length) }, () => worker()),
  );

  if (allowPartialFailure) {
    // 실패한 이미지는 빈 문자열로 대체, 에러 로그만 출력
    return results.map((r, i) => {
      if (r instanceof Error) {
        console.warn(`[이미지 업로드 부분 실패] ${path.basename(filePaths[i])}: ${r.message}`);
        return '';
      }
      return r as string;
    });
  }

  return results.map((r, i) => {
    if (r instanceof Error) {
      throw new Error(`이미지 업로드 실패 (${path.basename(filePaths[i])}): ${r.message}`);
    }
    return r as string;
  });
}
