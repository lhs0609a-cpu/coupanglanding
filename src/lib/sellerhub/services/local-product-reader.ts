// ============================================================
// 로컬 소싱 폴더 스캔 + 이미지 업로드 유틸리티
// ============================================================

import fs from 'fs';
import path from 'path';
import { createServiceClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';
import { detectImageFormat } from './image-processor';

export interface LocalProductJson {
  name?: string;
  title?: string;
  price?: number;
  brand?: string;
  tags?: string[];
  description?: string;
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

    // output/ 내 상세페이지 이미지
    const outputDir = path.join(productPath, 'output');
    const detailImages = collectImages(outputDir, /\.(jpg|jpeg|png)$/i);

    // product_info/ 내 상품정보 이미지
    const infoDir = path.join(productPath, 'product_info');
    const infoImages = collectImages(infoDir, /\.(jpg|jpeg|png)$/i);

    // reviews/ 내 리뷰 이미지
    const reviewsDir = path.join(productPath, 'reviews');
    const reviewImages = collectImages(reviewsDir, /\.(jpg|jpeg|png)$/i);

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
 */
export async function uploadLocalImage(
  filePath: string,
  sellerhubUserId: string,
): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const format = detectImageFormat(buffer);
  const ext = format === 'unknown' ? 'jpg' : format;
  const contentType =
    format === 'png' ? 'image/png'
    : format === 'gif' ? 'image/gif'
    : format === 'webp' ? 'image/webp'
    : 'image/jpeg';

  const supabase = await createServiceClient();
  const storagePath = `sellerhub/${sellerhubUserId}/bulk/${randomUUID()}.${ext}`;

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
}

/**
 * 여러 로컬 이미지를 일괄 업로드
 */
export async function uploadLocalImages(
  filePaths: string[],
  sellerhubUserId: string,
): Promise<string[]> {
  const urls: string[] = [];
  for (const fp of filePaths) {
    const url = await uploadLocalImage(fp, sellerhubUserId);
    urls.push(url);
  }
  return urls;
}

/**
 * 여러 로컬 이미지를 병렬로 업로드 (concurrency 제한)
 * 기존 uploadLocalImages 대비 ~80% 시간 단축
 */
export async function uploadLocalImagesParallel(
  filePaths: string[],
  sellerhubUserId: string,
  concurrency = 5,
): Promise<string[]> {
  if (filePaths.length === 0) return [];

  const results: (string | Error)[] = new Array(filePaths.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < filePaths.length) {
      const idx = nextIndex++;
      try {
        results[idx] = await uploadLocalImage(filePaths[idx], sellerhubUserId);
      } catch (err) {
        results[idx] = err instanceof Error ? err : new Error(String(err));
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, filePaths.length) }, () => worker()),
  );

  return results.map((r, i) => {
    if (r instanceof Error) {
      throw new Error(`이미지 업로드 실패 (${path.basename(filePaths[i])}): ${r.message}`);
    }
    return r as string;
  });
}
