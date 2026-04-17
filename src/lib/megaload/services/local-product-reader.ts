// ============================================================
// 로컬 소싱 폴더 스캔 + 이미지 업로드 유틸리티
// ============================================================

import fs from 'fs';
import path from 'path';
import { createServiceClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';
import { detectImageFormat, getImageDimensions } from './image-processor';
import { withRetry } from './retry';

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

    // main_images/ 내 모든 이미지 파일 (누끼 포함)
    const mainImagesDir = path.join(productPath, 'main_images');
    const mainImages = collectImages(mainImagesDir, /\.(jpg|jpeg|png|webp)$/i);

    // 상세이미지 = 리뷰 폴더에서만 가져옴 (review_images/ → reviews/)
    let reviewImages = collectImages(path.join(productPath, 'review_images'), /\.(jpg|jpeg|png)$/i);
    if (reviewImages.length === 0) {
      reviewImages = collectImages(path.join(productPath, 'reviews'), /\.(jpg|jpeg|png)$/i);
    }
    const detailImages = collectImages(path.join(productPath, 'detail_images'), /\.(jpg|jpeg|png|webp)$/i);

    // product_info/ 내 상품정보 이미지
    const infoDir = path.join(productPath, 'product_info');
    const infoImages = collectImages(infoDir, /\.(jpg|jpeg|png)$/i);

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
/** 비상품 이미지 파일명 패턴 (광고/배지/아이콘/네이버 UI 등) */
const AD_FILENAME_PATTERNS = /(?:^|[_\-.])(npay|naverpay|naver_|naver\-|smartstore|kakaopay|tosspay|payco|banner|badge|icon|logo|watermark|stamp|popup|event_banner|coupon|ad_|promotion|btn_|button_|shopping_|store_|delivery_info|return_info|guide_|notice_ban|footer|header)/i;

/** 네이버/플랫폼 비상품 이미지 URL 패턴 — CDN URL에서 감지 */
const NAVER_NONPRODUCT_URL_PATTERNS = [
  /shop-phinf\.pstatic\.net/i,       // 네이버 스마트스토어 공통 이미지
  /shopping\.pstatic\.net/i,          // 네이버 쇼핑 CDN
  /simg\.pstatic\.net/i,              // 네이버 스마트이미지
  /ssl\.pstatic\.net.*(?:shopping|pay|store|smartstore)/i,
  /\/(?:naver_?logo|n_?pay|smartstore|store_?banner|delivery_?guide|return_?guide|shopping_?guide)/i,
];

function collectImages(dirPath: string, pattern: RegExp): string[] {
  if (!fs.existsSync(dirPath)) return [];
  try {
    const files = fs.readdirSync(dirPath)
      .filter((f) => pattern.test(f))
      .filter((f) => {
        if (AD_FILENAME_PATTERNS.test(f)) {
          console.log(`[이미지 필터] 광고/비상품 파일명 제외: ${f}`);
          return false;
        }
        return true;
      })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return files.map((f) => path.join(dirPath, f));
  } catch {
    return [];
  }
}

/**
 * 로컬 이미지 파일을 Supabase Storage에 업로드하고 CDN URL을 반환
 * sellerBrand가 제공되면 jimp로 워터마크를 삽입하여 CNN 임베딩 차별화
 */
export async function uploadLocalImage(
  filePath: string,
  megaloadUserId: string,
  sellerBrand?: string,
): Promise<string> {
  // 파일 크기 검증
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`이미지 크기 초과 (${path.basename(filePath)}): ${(stat.size / 1024 / 1024).toFixed(1)}MB > 10MB`);
  }

  let buffer: Buffer = fs.readFileSync(filePath);

  let format = detectImageFormat(buffer);
  let ext = format === 'unknown' ? 'jpg' : format;

  // ---- 이미지 품질 게이트: 명백한 비상품 이미지만 차단 (누끼 등 정상 이미지 통과 보장) ----
  const fileName = path.basename(filePath);

  if (format === 'unknown') {
    console.warn(`[이미지 필터] 포맷 불명 — jpg 폴백 처리: ${fileName}`);
  }

  // 이미지 해상도 검증 + 자동 리사이징 (쿠팡: 최소 500×500, 최대 5000×5000, 최대 10MB)
  let dims = getImageDimensions(buffer, format);

  if (dims.width > 0 && dims.height > 0) {
    const minSide = Math.min(dims.width, dims.height);

    if (minSide < 50) {
      throw new Error(`[이미지 필터] 아이콘/배지 ${dims.width}×${dims.height}: ${fileName}`);
    }
  }

  // 차원 감지 실패(webp/gif 등) 또는 규격 초과 → jimp로 안전 리사이징
  const dimUnknown = dims.width === 0 || dims.height === 0;
  const needsUpscale = !dimUnknown && (dims.width < 500 || dims.height < 500);
  const needsDownscale = dims.width > 5000 || dims.height > 5000;
  const needsCompress = buffer.length > 10 * 1024 * 1024;
  const needsJimp = dimUnknown || needsUpscale || needsDownscale || needsCompress;

  if (needsJimp) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let Jimp: any;
      try {
        Jimp = (await import('jimp')).default || (await import('jimp'));
      } catch {
        Jimp = null;
      }

      if (Jimp) {
        let image = await Jimp.read(buffer);
        const jimpW: number = image.getWidth?.() ?? image.bitmap?.width ?? 0;
        const jimpH: number = image.getHeight?.() ?? image.bitmap?.height ?? 0;

        // 차원 감지 실패 시 jimp가 읽은 실제 차원으로 보정
        if (dimUnknown && jimpW > 0 && jimpH > 0) {
          dims = { width: jimpW, height: jimpH };
          console.log(`[이미지 차원 보정] ${fileName}: jimp → ${jimpW}×${jimpH}`);
        }

        const actualW = dims.width || jimpW;
        const actualH = dims.height || jimpH;
        const actualNeedsUpscale = actualW > 0 && actualH > 0 && (actualW < 500 || actualH < 500);
        const actualNeedsDownscale = actualW > 5000 || actualH > 5000;

        if (actualNeedsUpscale) {
          const scale = Math.max(800 / actualW, 800 / actualH);
          const newW = Math.round(actualW * scale);
          const newH = Math.round(actualH * scale);
          image = image.resize(newW, newH);
          console.log(`[이미지 리사이즈] ${fileName}: ${actualW}×${actualH} → ${newW}×${newH} (업스케일)`);
        } else if (actualNeedsDownscale) {
          const scale = Math.min(4500 / actualW, 4500 / actualH);
          const newW = Math.round(actualW * scale);
          const newH = Math.round(actualH * scale);
          image = image.resize(newW, newH);
          console.log(`[이미지 리사이즈] ${fileName}: ${actualW}×${actualH} → ${newW}×${newH} (다운스케일)`);
        }

        // 품질 단계적 압축 (10MB 이하가 될 때까지)
        const MIME_JPEG = Jimp.MIME_JPEG || 'image/jpeg';
        let quality = 92;
        let outBuf = await image.quality(quality).getBufferAsync(MIME_JPEG);
        while (outBuf.length > 10 * 1024 * 1024 && quality > 40) {
          quality -= 10;
          outBuf = await image.quality(quality).getBufferAsync(MIME_JPEG);
          console.log(`[이미지 압축] ${fileName}: quality=${quality}, size=${(outBuf.length / 1024 / 1024).toFixed(1)}MB`);
        }

        // 셀러 워터마크 삽입 (CNN 임베딩 차별화 — jimp 로드 상태에서만)
        if (sellerBrand) {
          try {
            const imgW: number = image.getWidth?.() ?? image.bitmap?.width ?? 0;
            const imgH: number = image.getHeight?.() ?? image.bitmap?.height ?? 0;
            if (imgW > 0 && imgH > 0) {
              // 셀러 브랜드 해시 기반 고유 색상 생성
              const { stringToSeed: s2s } = await import('./seeded-random');
              const brandSeed = s2s(sellerBrand);
              const r = (brandSeed >> 16) & 0xFF;
              const g = (brandSeed >> 8) & 0xFF;
              const b = brandSeed & 0xFF;
              const barH = Math.max(3, Math.round(imgH * 0.005));
              const startY = imgH - barH;
              // 반투명 컬러 바 합성 (alpha=30/255 ≈ 12%)
              image.scan(0, startY, imgW, barH, function(this: { bitmap: { data: Buffer } }, _x: number, _y: number, idx: number) {
                const orig_r = this.bitmap.data[idx];
                const orig_g = this.bitmap.data[idx + 1];
                const orig_b = this.bitmap.data[idx + 2];
                const alpha = 0.12;
                this.bitmap.data[idx] = Math.round(orig_r * (1 - alpha) + r * alpha);
                this.bitmap.data[idx + 1] = Math.round(orig_g * (1 - alpha) + g * alpha);
                this.bitmap.data[idx + 2] = Math.round(orig_b * (1 - alpha) + b * alpha);
              });
              // 재압축
              outBuf = await image.quality(quality).getBufferAsync(MIME_JPEG);
            }
          } catch (wmErr) {
            console.warn(`[워터마크] jimp 워터마크 실패: ${wmErr instanceof Error ? wmErr.message : wmErr}`);
          }
        }

        buffer = Buffer.from(outBuf);
        format = 'jpg';
        ext = 'jpg';
      } else if (needsUpscale) {
        throw new Error(`[이미지 필터] 업스케일 필요하나 jimp 미설치 — 500×500 미만 이미지 제외: ${fileName}`);
      } else if (needsDownscale || dimUnknown) {
        throw new Error(`[이미지 필터] 리사이징 필요하나 jimp 미설치 — 규격 미확인 이미지 제외: ${fileName}`);
      }
    } catch (resizeErr) {
      if (needsUpscale || needsDownscale || dimUnknown) {
        throw new Error(`[이미지 필터] 리사이징 실패 — 이미지 제외 (${fileName}): ${resizeErr instanceof Error ? resizeErr.message : resizeErr}`);
      }
      console.warn(`[이미지 리사이즈 실패] ${fileName}:`, resizeErr instanceof Error ? resizeErr.message : resizeErr);
    }
  }

  // jimp 리사이징 불필요했으나 워터마크는 적용해야 하는 경우
  if (!needsJimp && sellerBrand) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let Jimp: any;
      try {
        Jimp = (await import('jimp')).default || (await import('jimp'));
      } catch { Jimp = null; }
      if (Jimp) {
        const image = await Jimp.read(buffer);
        const imgW: number = image.getWidth?.() ?? image.bitmap?.width ?? 0;
        const imgH: number = image.getHeight?.() ?? image.bitmap?.height ?? 0;
        if (imgW > 0 && imgH > 0) {
          const { stringToSeed: s2s } = await import('./seeded-random');
          const brandSeed = s2s(sellerBrand);
          const r = (brandSeed >> 16) & 0xFF;
          const g = (brandSeed >> 8) & 0xFF;
          const b = brandSeed & 0xFF;
          const barH = Math.max(3, Math.round(imgH * 0.005));
          const startY = imgH - barH;
          image.scan(0, startY, imgW, barH, function(this: { bitmap: { data: Buffer } }, _x: number, _y: number, idx: number) {
            const orig_r = this.bitmap.data[idx];
            const orig_g = this.bitmap.data[idx + 1];
            const orig_b = this.bitmap.data[idx + 2];
            const alpha = 0.12;
            this.bitmap.data[idx] = Math.round(orig_r * (1 - alpha) + r * alpha);
            this.bitmap.data[idx + 1] = Math.round(orig_g * (1 - alpha) + g * alpha);
            this.bitmap.data[idx + 2] = Math.round(orig_b * (1 - alpha) + b * alpha);
          });
          const MIME_JPEG = Jimp.MIME_JPEG || 'image/jpeg';
          const outBuf = await image.quality(92).getBufferAsync(MIME_JPEG);
          buffer = Buffer.from(outBuf);
          format = 'jpg';
          ext = 'jpg';
        }
      }
    } catch (wmErr) {
      console.warn(`[워터마크] 별도 워터마크 실패: ${wmErr instanceof Error ? wmErr.message : wmErr}`);
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

    if (!publicData?.publicUrl) {
      throw new Error(`공개 URL 생성 실패 (${path.basename(filePath)}): storagePath=${storagePath}`);
    }

    return publicData.publicUrl;
  }, { maxRetries: 2, initialDelayMs: 500 });
}

/**
 * 여러 로컬 이미지를 일괄 업로드
 */
export async function uploadLocalImages(
  filePaths: string[],
  megaloadUserId: string,
  sellerBrand?: string,
): Promise<string[]> {
  const urls: string[] = [];
  for (const fp of filePaths) {
    const url = await uploadLocalImage(fp, megaloadUserId, sellerBrand);
    urls.push(url);
  }
  return urls;
}

/**
 * 여러 로컬 이미지를 병렬로 업로드 (concurrency 제한)
 * 기존 uploadLocalImages 대비 ~80% 시간 단축
 *
 * allowPartialFailure=true: 일부 이미지 실패해도 성공한 것만 반환 (빈 문자열로 대체)
 */
export async function uploadLocalImagesParallel(
  filePaths: string[],
  megaloadUserId: string,
  concurrency = 5,
  allowPartialFailure = false,
  sellerBrand?: string,
): Promise<string[]> {
  if (filePaths.length === 0) return [];

  const results: (string | Error)[] = new Array(filePaths.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < filePaths.length) {
      const idx = nextIndex++;
      try {
        results[idx] = await uploadLocalImage(filePaths[idx], megaloadUserId, sellerBrand);
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
