import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/sellerhub/adapters/factory';
import { CoupangAdapter } from '@/lib/sellerhub/adapters/coupang.adapter';
import { uploadLocalImagesParallel } from '@/lib/sellerhub/services/local-product-reader';
import { buildCoupangProductPayload, type DeliveryInfo, type ReturnInfo, type AttributeMeta } from '@/lib/sellerhub/services/coupang-product-builder';
import { fillNoticeFields, type NoticeCategoryMeta } from '@/lib/sellerhub/services/notice-field-filler';
import { generateProductStory } from '@/lib/sellerhub/services/ai.service';

interface BatchProduct {
  uid?: string;
  productCode: string;
  folderPath: string;
  name: string;
  brand: string;
  sellingPrice: number;
  sourcePrice: number;
  categoryCode: string;
  tags: string[];
  description: string;
  mainImages: string[];
  detailImages: string[];
  reviewImages: string[];
  infoImages: string[];
  noticeMeta: NoticeCategoryMeta[];
  attributeMeta: AttributeMeta[];
}

interface BatchRegisterBody {
  jobId: string;
  batchIndex: number;
  deliveryInfo: DeliveryInfo;
  returnInfo: ReturnInfo;
  stock?: number;
  generateAiContent?: boolean;
  includeReviewImages?: boolean;
  noticeOverrides?: Record<string, string>;
  products: BatchProduct[];
}

interface ProductResult {
  uid?: string;
  productCode: string;
  name: string;
  success: boolean;
  channelProductId?: string;
  error?: string;
  duration?: number;
}

/**
 * POST — 배치 등록 처리 (3개씩)
 *
 * 각 상품:
 *  1. 전체 이미지 병렬 업로드 (5개 동시)
 *  2. AI 스토리 생성 (옵션)
 *  3. notices 자동채움
 *  4. 페이로드 빌드
 *  5. 쿠팡 createProduct
 *  6. DB 저장
 *  7. sh_sync_jobs 카운트 업데이트
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
    const body = (await req.json()) as BatchRegisterBody;

    const {
      jobId,
      deliveryInfo,
      returnInfo,
      stock = 999,
      generateAiContent = false,
      includeReviewImages = true,
      noticeOverrides,
      products,
    } = body;

    if (!jobId) return NextResponse.json({ error: 'jobId가 필요합니다.' }, { status: 400 });
    if (!products || products.length === 0) return NextResponse.json({ error: '상품이 없습니다.' }, { status: 400 });
    if (!deliveryInfo?.outboundShippingPlaceCode) return NextResponse.json({ error: '출고지가 필요합니다.' }, { status: 400 });
    if (!returnInfo?.returnCenterCode) return NextResponse.json({ error: '반품지가 필요합니다.' }, { status: 400 });

    const serviceClient = await createServiceClient();
    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
    const coupangAdapter = adapter as CoupangAdapter;
    const vendorId = coupangAdapter.getVendorId();

    const results: ProductResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const product of products) {
      const startTime = Date.now();

      try {
        // 1. 전체 이미지를 하나의 풀로 합쳐 병렬 업로드
        const reviewPaths = includeReviewImages ? product.reviewImages : [];
        const allPaths = [
          ...product.mainImages,
          ...product.detailImages,
          ...reviewPaths,
          ...product.infoImages,
        ];

        const allUrls = await uploadLocalImagesParallel(allPaths, shUserId, 5);

        // 인덱스로 분리
        let offset = 0;
        const mainImageUrls = allUrls.slice(offset, offset + product.mainImages.length);
        offset += product.mainImages.length;
        const detailImageUrls = allUrls.slice(offset, offset + product.detailImages.length);
        offset += product.detailImages.length;
        const reviewImageUrls = allUrls.slice(offset, offset + reviewPaths.length);
        offset += reviewPaths.length;
        const infoImageUrls = allUrls.slice(offset, offset + product.infoImages.length);

        // 2. AI 스토리 생성 (옵션)
        let aiStoryHtml = '';
        if (generateAiContent) {
          try {
            const storyResult = await generateProductStory(
              product.name,
              product.categoryCode,
              product.tags || [],
              product.description,
            );
            aiStoryHtml = storyResult.content;
          } catch {
            // AI 실패해도 계속 진행
          }
        }

        // 3. notices 자동채움
        const filledNotices = fillNoticeFields(
          product.noticeMeta || [],
          { name: product.name, brand: product.brand, tags: product.tags, description: product.description },
          returnInfo.afterServiceContactNumber,
          noticeOverrides,
        );

        // 4. 페이로드 빌드
        const payload = buildCoupangProductPayload({
          vendorId,
          product: {
            folderPath: product.folderPath,
            productCode: product.productCode,
            productJson: { name: product.name, brand: product.brand, tags: product.tags, description: product.description, price: product.sourcePrice },
            mainImages: product.mainImages,
            detailImages: product.detailImages,
            infoImages: product.infoImages,
            reviewImages: product.reviewImages,
          },
          sellingPrice: product.sellingPrice,
          categoryCode: product.categoryCode,
          mainImageUrls,
          detailImageUrls,
          deliveryInfo,
          returnInfo,
          stock,
          brand: product.brand,
          filledNotices,
          attributeMeta: product.attributeMeta || [],
          reviewImageUrls,
          infoImageUrls,
          aiStoryHtml,
        });

        // 5. 쿠팡 API 호출
        const result = await coupangAdapter.createProduct(payload);

        // 6. DB 저장
        const { data: savedProduct } = await serviceClient
          .from('sh_products')
          .insert({
            sellerhub_user_id: shUserId,
            coupang_product_id: result.channelProductId,
            product_name: product.name,
            brand: product.brand || '',
            category_id: product.categoryCode,
            status: 'active',
            raw_data: {
              sourceFolder: product.folderPath,
              sourcePrice: product.sourcePrice,
              productCode: product.productCode,
              mainImageUrls,
              detailImageUrls,
              reviewImageUrls,
              infoImageUrls,
              aiStoryHtml: aiStoryHtml || undefined,
            },
          })
          .select('id')
          .single();

        const savedId = (savedProduct as Record<string, unknown>)?.id as string;

        if (savedId) {
          await serviceClient.from('sh_product_channels').insert({
            product_id: savedId,
            sellerhub_user_id: shUserId,
            channel: 'coupang',
            channel_product_id: result.channelProductId,
            status: 'active',
            last_synced_at: new Date().toISOString(),
          });

          await serviceClient.from('sh_product_options').insert({
            product_id: savedId,
            sellerhub_user_id: shUserId,
            option_name: '기본',
            sku: product.productCode,
            sale_price: product.sellingPrice,
            cost_price: product.sourcePrice,
            stock,
          });
        }

        results.push({
          uid: product.uid,
          productCode: product.productCode,
          name: product.name,
          success: true,
          channelProductId: result.channelProductId,
          duration: Date.now() - startTime,
        });
        successCount++;
      } catch (err) {
        results.push({
          uid: product.uid,
          productCode: product.productCode,
          name: product.name,
          success: false,
          error: err instanceof Error ? err.message : '알 수 없는 오류',
          duration: Date.now() - startTime,
        });
        errorCount++;
      }

      // 7. sh_sync_jobs 카운트 업데이트 (매 상품마다)
      try {
        const { error: rpcError } = await serviceClient.rpc('increment_sync_job_counts', {
          p_job_id: jobId,
          p_processed: 1,
          p_errors: errorCount > 0 && results[results.length - 1]?.success === false ? 1 : 0,
        });
        if (rpcError) throw rpcError;
      } catch {
        // rpc 없으면 직접 업데이트 (레이스 컨디션 가능하지만 단일 배치이므로 OK)
        const { data: currentJob } = await serviceClient
          .from('sh_sync_jobs')
          .select('processed_count, error_count')
          .eq('id', jobId)
          .single();
        if (currentJob) {
          const cur = currentJob as Record<string, number>;
          await serviceClient
            .from('sh_sync_jobs')
            .update({
              processed_count: (cur.processed_count || 0) + 1,
              error_count: (cur.error_count || 0) + (results[results.length - 1]?.success === false ? 1 : 0),
            })
            .eq('id', jobId);
        }
      }

      // Rate limit between products
      if (products.indexOf(product) < products.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    return NextResponse.json({
      batchIndex: body.batchIndex,
      results,
      successCount,
      errorCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '배치 등록 실패' },
      { status: 500 },
    );
  }
}
