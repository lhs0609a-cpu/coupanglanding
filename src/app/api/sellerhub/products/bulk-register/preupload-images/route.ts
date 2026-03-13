import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { uploadLocalImagesParallel } from '@/lib/sellerhub/services/local-product-reader';

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
 * - 상품 간 2개 동시 처리 (총 30개 이미지 동시)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: shUser } = await supabase
      .from('sellerhub_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'SellerHub 계정이 없습니다.' }, { status: 404 });

    const shUserId = (shUser as Record<string, unknown>).id as string;
    const body = (await req.json()) as PreuploadBody;

    if (!body.products || body.products.length === 0) {
      return NextResponse.json({ error: '상품이 없습니다.' }, { status: 400 });
    }

    const includeReviewImages = body.includeReviewImages ?? true;
    const IMAGE_CONCURRENCY = 15;
    const PRODUCT_CONCURRENCY = 2;

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

          const allUrls = await uploadLocalImagesParallel(allPaths, shUserId, IMAGE_CONCURRENCY);

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

      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          const { uid, ...urls } = result.value;
          allResults[uid] = { ...urls, success: true };
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
