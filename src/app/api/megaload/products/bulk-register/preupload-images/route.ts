import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { uploadLocalImagesParallel } from '@/lib/megaload/services/local-product-reader';

interface PreuploadProduct {
  uid: string;
  productCode: string;
  mainImages: string[];
  detailImages: string[];
  reviewImages: string[];
  infoImages: string[];
}

interface PreuploadBody {
  products: PreuploadProduct[];
  includeReviewImages?: boolean;
  preventionSeed?: string;
  sellerBrand?: string;
}

/**
 * POST — 이미지 사전 업로드 (파이프라인)
 *
 * Step 2 검증 중 백그라운드에서 호출되어
 * 모든 이미지를 CDN에 미리 업로드한다.
 *
 * 결과 URL은 클라이언트에서 캐시하여
 * Step 3 등록 시 preUploadedUrls로 전달.
 *
 * 최적화:
 * - 상품당 15개 이미지 동시 업로드
 * - 상품 간 5개 동시 처리
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Megaload 계정이 없습니다.' }, { status: 404 });
    }
    const body = (await req.json()) as PreuploadBody;

    if (!body.products || body.products.length === 0) {
      return NextResponse.json({ error: '상품이 없습니다.' }, { status: 400 });
    }

    const includeReviewImages = body.includeReviewImages ?? true;
    const IMAGE_CONCURRENCY = 15;
    const PRODUCT_CONCURRENCY = 5;

    const allResults: Record<string, {
      mainImageUrls: string[];
      detailImageUrls: string[];
      reviewImageUrls: string[];
      infoImageUrls: string[];
      success: boolean;
      error?: string;
    }> = {};

    for (let i = 0; i < body.products.length; i += PRODUCT_CONCURRENCY) {
      const chunk = body.products.slice(i, i + PRODUCT_CONCURRENCY);

      const chunkResults = await Promise.allSettled(
        chunk.map(async (product) => {
          const reviewPaths = includeReviewImages ? product.reviewImages : [];
          const allPaths = [
            ...product.mainImages,
            ...product.detailImages,
            ...reviewPaths,
            ...product.infoImages,
          ];

          if (allPaths.length === 0) {
            return {
              uid: product.uid,
              mainImageUrls: [] as string[],
              detailImageUrls: [] as string[],
              reviewImageUrls: [] as string[],
              infoImageUrls: [] as string[],
            };
          }

          const allUrls = await uploadLocalImagesParallel(allPaths, shUserId, IMAGE_CONCURRENCY, false, body.sellerBrand || undefined);

          let offset = 0;
          const mainImageUrls = allUrls.slice(offset, offset + product.mainImages.length);
          offset += product.mainImages.length;
          const detailImageUrls = allUrls.slice(offset, offset + product.detailImages.length);
          offset += product.detailImages.length;
          const reviewImageUrls = allUrls.slice(offset, offset + reviewPaths.length);
          offset += reviewPaths.length;
          const infoImageUrls = allUrls.slice(offset, offset + product.infoImages.length);

          return { uid: product.uid, mainImageUrls, detailImageUrls, reviewImageUrls, infoImageUrls };
        }),
      );

      for (let k = 0; k < chunkResults.length; k++) {
        const result = chunkResults[k];
        const product = chunk[k];
        if (result.status === 'fulfilled') {
          const { uid, ...urls } = result.value;
          allResults[uid] = { ...urls, success: true };
        } else {
          allResults[product.uid] = {
            mainImageUrls: [],
            detailImageUrls: [],
            reviewImageUrls: [],
            infoImageUrls: [],
            success: false,
            error: result.reason instanceof Error ? result.reason.message : '이미지 업로드 실패',
          };
        }
      }
    }

    return NextResponse.json({
      results: allResults,
      totalProducts: body.products.length,
      successCount: Object.values(allResults).filter((r) => r.success).length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '이미지 사전 업로드 실패' },
      { status: 500 },
    );
  }
}
