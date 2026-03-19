import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { uploadLocalImagesParallel } from '@/lib/megaload/services/local-product-reader';
import { generateVariationParams, type VariationParams } from '@/lib/megaload/services/server-image-variation';

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
  preventionSeed?: string;  // 아이템위너 방지 시드 (셀러 ID)
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
      .from('megaload_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'Megaload 계정이 없습니다.' }, { status: 404 });

    const shUserId = (shUser as Record<string, unknown>).id as string;
    const body = (await req.json()) as PreuploadBody;

    if (!body.products || body.products.length === 0) {
      return NextResponse.json({ error: '상품이 없습니다.' }, { status: 400 });
    }

    const includeReviewImages = body.includeReviewImages ?? true;
    // preventionSeed가 truthy이면 shUserId를 실제 시드로 사용
    const preventionSeed = body.preventionSeed ? shUserId : undefined;
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

          // 아이템위너 방지: preventionSeed가 있으면 각 이미지에 변형 파라미터 생성
          let variationParamsList: (VariationParams | undefined)[] | undefined;
          if (preventionSeed) {
            const imgSeed = `${preventionSeed}:${product.productCode}`;
            variationParamsList = allPaths.map((_, idx) => generateVariationParams(imgSeed, idx));
          }

          const allUrls = await uploadLocalImagesParallel(allPaths, shUserId, IMAGE_CONCURRENCY, false, variationParamsList);

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
          // rejected 상품도 에러 정보와 함께 기록
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
