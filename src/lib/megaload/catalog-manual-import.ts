import type { ScannedImageFile, ScannedProduct } from './services/client-folder-scanner';

export interface CatalogExportProduct {
  id: string;
  productNo: string;
  url: string;
  title: string;
  price: number;
  brand: string;
  categoryId: string;
  categoryPath: string;
  options: unknown[];
  detailText: string;
  notice: unknown;
  reviewTexts: Array<{ text: string; score: number; best: boolean }>;
  images: { main: string[]; detail: string[]; review: string[] };
}

export const CATALOG_MANUAL_KEY = 'megaload.catalogManual.';
export const CATALOG_MANUAL_TTL = 30 * 60 * 1000;

/** Same-origin URLs keep canvas inspection and the existing multipart uploader usable. */
export function catalogImage(productId: string, group: 'main' | 'detail' | 'review', index: number): ScannedImageFile {
  const url = `/api/megaload/naver-sourcing/products/image?id=${encodeURIComponent(productId)}&group=${group}&index=${index}`;
  const name = `${group}_${index + 1}.jpg`;
  return {
    name,
    objectUrl: url,
    handle: {
      async getFile() {
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`카탈로그 이미지 불러오기 실패 (${res.status})`);
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) throw new Error('이미지 응답이 아닙니다.');
        return new File([blob], name, { type: blob.type });
      },
    },
  };
}

export function catalogToScan(products: CatalogExportProduct[], batchId: string) {
  const scanned: ScannedProduct[] = products.map((p) => {
    if (!p.id || !/^\d+$/.test(p.productNo) || !p.images?.main?.length) {
      throw new Error(`${p.title || '상품'}: 상품번호 또는 대표이미지가 없습니다.`);
    }
    const images = (group: 'main' | 'detail' | 'review') =>
      (p.images[group] || []).map((_, index) => catalogImage(p.id, group, index));
    return {
      productCode: p.productNo,
      folderName: `product_${p.productNo}`,
      sourceUrl: p.url,
      productJson: {
        name: p.title, title: p.title, price: p.price, brand: p.brand,
        description: p.detailText, naverCategoryId: p.categoryId,
        sourceCategory: { categoryId: p.categoryId, categoryPath: p.categoryPath },
        options: p.options, providedNotice: p.notice, sourceReviews: p.reviewTexts,
        catalogSource: { id: p.id, categoryPath: p.categoryPath, options: p.options, notice: p.notice },
      },
      mainImages: images('main'), detailImages: images('detail'),
      reviewImages: images('review'), infoImages: [],
    };
  });
  return { dirName: `naver-catalog-${batchId}`, products: scanned, thirdPartyImages: [] as ScannedImageFile[] };
}
