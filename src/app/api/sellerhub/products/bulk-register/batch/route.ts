import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/sellerhub/adapters/factory';
import { CoupangAdapter } from '@/lib/sellerhub/adapters/coupang.adapter';
import { uploadLocalImagesParallel } from '@/lib/sellerhub/services/local-product-reader';
import { buildCoupangProductPayload, type DeliveryInfo, type ReturnInfo, type AttributeMeta } from '@/lib/sellerhub/services/coupang-product-builder';
import { fillNoticeFields, type NoticeCategoryMeta } from '@/lib/sellerhub/services/notice-field-filler';
import { generateProductStoriesBatch, type StoryBatchInput } from '@/lib/sellerhub/services/ai.service';
import { extractOptions } from '@/lib/sellerhub/services/option-extractor';

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
  // 클라이언트에서 사전 업로드된 이미지 URL (있으면 로컬 파일 업로드 스킵)
  preUploadedUrls?: {
    mainImageUrls: string[];
    detailImageUrls: string[];
    reviewImageUrls: string[];
    infoImageUrls: string[];
  };
  // AI 제목 (클라이언트에서 미리 생성/확인 후 전달)
  aiDisplayName?: string;
  aiSellerName?: string;
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

    // ---- AI 스토리 배치 생성 (개별 호출 대신 10개씩 묶어서) ----
    const batchAiStories = new Map<string, string>();
    if (generateAiContent) {
      try {
        const storyInputs: StoryBatchInput[] = products.map((p) => ({
          productName: p.aiDisplayName || p.name,
          categoryPath: p.categoryCode,
          brand: p.brand,
          keywords: p.tags || [],
        }));
        const stories = await generateProductStoriesBatch(storyInputs);
        for (let i = 0; i < products.length; i++) {
          const key = products[i].uid || products[i].productCode;
          if (stories[i]?.content) {
            batchAiStories.set(key, stories[i].content);
          }
        }
      } catch (err) {
        console.warn('[batch] AI 스토리 배치 생성 실패:', err instanceof Error ? err.message : err);
      }
    }

    // ---- 단일 상품 등록 헬퍼 ----
    async function registerSingleProduct(product: BatchProduct): Promise<ProductResult> {
      const productStart = Date.now();

      let mainImageUrls: string[];
      let detailImageUrls: string[];
      let reviewImageUrls: string[];
      let infoImageUrls: string[];

      if (product.preUploadedUrls) {
        mainImageUrls = product.preUploadedUrls.mainImageUrls;
        detailImageUrls = product.preUploadedUrls.detailImageUrls;
        reviewImageUrls = includeReviewImages ? product.preUploadedUrls.reviewImageUrls : [];
        infoImageUrls = product.preUploadedUrls.infoImageUrls;
      } else {
        const reviewPaths = includeReviewImages ? product.reviewImages : [];
        const allPaths = [...product.mainImages, ...product.detailImages, ...reviewPaths, ...product.infoImages];
        const allUrls = await uploadLocalImagesParallel(allPaths, shUserId, 10);

        let offset = 0;
        mainImageUrls = allUrls.slice(offset, offset + product.mainImages.length);
        offset += product.mainImages.length;
        detailImageUrls = allUrls.slice(offset, offset + product.detailImages.length);
        offset += product.detailImages.length;
        reviewImageUrls = allUrls.slice(offset, offset + reviewPaths.length);
        offset += reviewPaths.length;
        infoImageUrls = allUrls.slice(offset, offset + product.infoImages.length);
      }

      // AI 스토리는 배치 레벨에서 처리 — 블로그 스타일 문단 + 리뷰 텍스트
      const aiStoryRaw = batchAiStories.get(product.uid || product.productCode) || '';
      let aiStoryParagraphs: string[] = [];
      let aiReviewTexts: string[] = [];
      let aiStoryHtml = '';
      try {
        const parsed = JSON.parse(aiStoryRaw);
        aiStoryParagraphs = Array.isArray(parsed.paragraphs) ? parsed.paragraphs : [];
        aiReviewTexts = Array.isArray(parsed.reviewTexts) ? parsed.reviewTexts : [];
      } catch {
        // 기존 형식 (HTML 문자열) 호환
        aiStoryHtml = aiStoryRaw;
      }

      // notices 자동채움
      const filledNotices = fillNoticeFields(
        product.noticeMeta || [],
        { name: product.name, brand: product.brand, tags: product.tags, description: product.description },
        returnInfo.afterServiceContactNumber,
        noticeOverrides,
      );

      // 구매옵션 자동 추출 (상품명 → 수량/용량/중량/색상/사이즈 등)
      const extracted = extractOptions(product.name, product.categoryCode);
      if (extracted.warnings.length > 0) {
        console.warn(`[batch] 옵션 추출 경고 [${product.name}]:`, extracted.warnings.join(', '));
      }

      // 페이로드 빌드
      const payload = buildCoupangProductPayload({
        vendorId,
        product: {
          folderPath: product.folderPath,
          productCode: product.productCode,
          productJson: { name: product.name, brand: product.brand, tags: product.tags, description: product.description, price: product.sourcePrice },
          mainImages: product.mainImages, detailImages: product.detailImages, infoImages: product.infoImages, reviewImages: product.reviewImages,
        },
        sellingPrice: product.sellingPrice, categoryCode: product.categoryCode,
        mainImageUrls, detailImageUrls, deliveryInfo, returnInfo, stock,
        brand: product.brand, filledNotices, attributeMeta: product.attributeMeta || [],
        reviewImageUrls, infoImageUrls,
        aiStoryHtml,
        aiStoryParagraphs,
        aiReviewTexts,
        extractedBuyOptions: extracted.buyOptions,
        displayProductName: product.aiDisplayName,
        sellerProductName: product.aiSellerName,
      });

      // 쿠팡 API 호출
      const result = await coupangAdapter.createProduct(payload);

      // DB 저장
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
            sourceFolder: product.folderPath, sourcePrice: product.sourcePrice, productCode: product.productCode,
            mainImageUrls, detailImageUrls, reviewImageUrls, infoImageUrls, aiStoryHtml: aiStoryHtml || undefined,
          },
        })
        .select('id')
        .single();

      const savedId = (savedProduct as Record<string, unknown>)?.id as string;
      if (savedId) {
        // DB 저장은 순차적으로 (race condition 방지)
        await serviceClient.from('sh_product_channels').insert({
          product_id: savedId, sellerhub_user_id: shUserId, channel: 'coupang',
          channel_product_id: result.channelProductId, status: 'active', last_synced_at: new Date().toISOString(),
        });
        await serviceClient.from('sh_product_options').insert({
          product_id: savedId, sellerhub_user_id: shUserId, option_name: '기본',
          sku: product.productCode, sale_price: product.sellingPrice, cost_price: product.sourcePrice, stock,
        });
      }

      return {
        uid: product.uid, productCode: product.productCode, name: product.name,
        success: true, channelProductId: result.channelProductId, duration: Date.now() - productStart,
      };
    }

    // ---- 병렬 배치 실행 (3개 동시 쿠팡 API 호출) ----
    const results: ProductResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    const PARALLEL_REGISTER = 5; // 쿠팡 API 동시 호출 수 (3→5 성능 개선)
    for (let i = 0; i < products.length; i += PARALLEL_REGISTER) {
      const chunk = products.slice(i, i + PARALLEL_REGISTER);
      const chunkResults = await Promise.allSettled(chunk.map((p) => registerSingleProduct(p)));

      for (let j = 0; j < chunkResults.length; j++) {
        const result = chunkResults[j];
        const product = chunk[j];

        if (result.status === 'fulfilled') {
          results.push(result.value);
          if (result.value.success) successCount++;
          else errorCount++;
        } else {
          const errMsg = result.reason instanceof Error ? result.reason.message : '알 수 없는 오류';
          results.push({
            uid: product.uid, productCode: product.productCode, name: product.name,
            success: false, error: errMsg, duration: 0,
          });
          errorCount++;
        }

        // sh_sync_jobs 카운트 업데이트
        try {
          const { error: rpcError } = await serviceClient.rpc('increment_sync_job_counts', {
            p_job_id: jobId, p_processed: 1,
            p_errors: (result.status === 'fulfilled' && result.value.success) ? 0 : 1,
          });
          if (rpcError) throw rpcError;
        } catch {
          const { data: currentJob } = await serviceClient
            .from('sh_sync_jobs').select('processed_count, error_count').eq('id', jobId).single();
          if (currentJob) {
            const cur = currentJob as Record<string, number>;
            await serviceClient.from('sh_sync_jobs').update({
              processed_count: (cur.processed_count || 0) + 1,
              error_count: (cur.error_count || 0) + ((result.status === 'fulfilled' && result.value.success) ? 0 : 1),
            }).eq('id', jobId);
          }
        }
      }

      // 청크 간 짧은 딜레이 (레이트 리밋)
      if (i + PARALLEL_REGISTER < products.length) {
        await new Promise((r) => setTimeout(r, 100));
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
