import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { uploadLocalImagesParallel } from '@/lib/megaload/services/local-product-reader';
import { buildCoupangProductPayload, type DeliveryInfo, type ReturnInfo, type AttributeMeta, type CertificationInfo, type OptionVariant } from '@/lib/megaload/services/coupang-product-builder';
import { fillNoticeFields, type NoticeCategoryMeta, type ExtractedNoticeHints } from '@/lib/megaload/services/notice-field-filler';
import { generateProductStoriesBatch, type StoryBatchInput } from '@/lib/megaload/services/ai.service';
import { extractOptions } from '@/lib/megaload/services/option-extractor';
import { withRetry } from '@/lib/megaload/services/retry';
import { checkBrandProtection } from '@/lib/megaload/services/brand-checker';
import { classifyError } from '@/lib/megaload/services/error-classifier';
import type { DetailedError } from '@/components/megaload/bulk/types';

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
  preUploadedUrls?: {
    mainImageUrls: string[];
    detailImageUrls: string[];
    reviewImageUrls: string[];
    infoImageUrls: string[];
  };
  aiDisplayName?: string;
  aiSellerName?: string;
  // 추가 필드 (선택)
  originalPrice?: number;         // 정가 (할인가 표시용)
  barcode?: string;               // 바코드
  certifications?: CertificationInfo[];  // KC인증 등
  optionVariants?: OptionVariant[];      // 멀티옵션
  taxType?: 'TAX' | 'FREE' | 'ZERO';
  adultOnly?: 'EVERYONE' | 'ADULT_ONLY';
  categoryConfidence?: number;  // 카테고리 매칭 confidence (0~1)
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
  detailedError?: DetailedError;
  duration?: number;
  brandWarning?: string;
}

/**
 * POST — 배치 등록 처리 (5개씩 병렬)
 *
 * 개선사항:
 *  - 중복 등록 방지 (productCode + channel 체크)
 *  - 서버사이드 가격 검증
 *  - 브랜드 상표권 체크
 *  - DB 트랜잭션 보장 (쿠팡 성공 → DB 실패 시 보상)
 *  - Race condition 방지 (순차 카운트 업데이트)
 *  - 쿠팡 API retry
 *  - sh_product_images 저장
 *  - 부분 이미지 실패 허용
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

    // ---- 중복 등록 방지: 이미 등록된 productCode 조회 ----
    const productCodes = products.map((p) => p.productCode);
    const { data: existingProducts } = await serviceClient
      .from('sh_products')
      .select('raw_data')
      .eq('megaload_user_id', shUserId)
      .in('raw_data->>productCode', productCodes);

    const registeredCodes = new Set(
      (existingProducts || []).map((p) => {
        const raw = p.raw_data as Record<string, unknown> | null;
        return raw?.productCode as string;
      }).filter(Boolean),
    );

    // ---- AI 스토리 배치 생성 ----
    const batchAiStories = new Map<string, string>();
    if (generateAiContent) {
      try {
        const storyInputs: StoryBatchInput[] = products.map((p) => ({
          productName: p.aiDisplayName || p.name,
          category: p.categoryCode,
          features: p.tags || [],
          description: p.description,
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

      // 1. 중복 등록 체크
      if (registeredCodes.has(product.productCode)) {
        const error = `이미 등록된 상품입니다 (productCode: ${product.productCode})`;
        return {
          uid: product.uid, productCode: product.productCode, name: product.name,
          success: false, error, duration: 0,
          detailedError: { message: error, category: 'duplicate', step: '중복 검사', suggestion: '상품 관리에서 확인하거나 선택 해제 후 다시 등록하세요.' },
        };
      }

      // 2. 서버사이드 가격 검증
      if (!product.sellingPrice || product.sellingPrice < 100) {
        const error = `판매가가 유효하지 않습니다 (${product.sellingPrice}원). 최소 100원`;
        return {
          uid: product.uid, productCode: product.productCode, name: product.name,
          success: false, error, duration: 0,
          detailedError: { message: error, category: 'price', field: 'sellingPrice', step: '가격 검증', suggestion: '판매가를 확인해주세요. (100원 ~ 1억원)' },
        };
      }
      if (product.sellingPrice > 100_000_000) {
        const error = '판매가가 1억원을 초과합니다.';
        return {
          uid: product.uid, productCode: product.productCode, name: product.name,
          success: false, error, duration: 0,
          detailedError: { message: error, category: 'price', field: 'sellingPrice', step: '가격 검증', suggestion: '판매가를 확인해주세요. (100원 ~ 1억원)' },
        };
      }

      // 2-2. 카테고리 코드 유효성 검증
      const catNum = Number(product.categoryCode);
      if (!product.categoryCode || isNaN(catNum) || catNum <= 0) {
        const error = `카테고리 코드 유효하지 않음: "${product.categoryCode}"`;
        return {
          uid: product.uid, productCode: product.productCode, name: product.name,
          success: false, error, duration: 0,
          detailedError: { message: error, category: 'category', field: 'displayCategoryCode', step: '카테고리 검증', suggestion: 'Step 2에서 카테고리를 다시 선택해주세요.' },
        };
      }

      // 3. 브랜드 상표권 체크
      let brandWarning: string | undefined;
      const brandCheck = checkBrandProtection(product.name, product.description);
      if (brandCheck.result === 'blocked') {
        return {
          uid: product.uid, productCode: product.productCode, name: product.name,
          success: false, error: brandCheck.message, duration: 0,
          detailedError: { message: brandCheck.message, category: 'brand', field: 'brand', step: '브랜드 검사', suggestion: '브랜드 관련 상표권 문제입니다. 상품명과 브랜드를 확인해주세요.' },
        };
      }
      if (brandCheck.result === 'warning') {
        brandWarning = brandCheck.message;
      }

      // 3-2. 카테고리 confidence 검증
      if (product.categoryConfidence !== undefined && product.categoryConfidence < 0.5) {
        const error = `카테고리 매칭 신뢰도 부족 (${Math.round(product.categoryConfidence * 100)}%). 수동으로 카테고리를 확인해주세요.`;
        return {
          uid: product.uid, productCode: product.productCode, name: product.name,
          success: false, error, duration: 0,
          detailedError: { message: error, category: 'category', field: 'categoryConfidence', step: '카테고리 검증', suggestion: '카테고리 매칭 신뢰도가 낮습니다. 수동으로 카테고리를 지정해주세요.' },
        };
      }

      // 4. 이미지 처리 (부분 실패 허용)
      let mainImageUrls: string[];
      let detailImageUrls: string[];
      let reviewImageUrls: string[];
      let infoImageUrls: string[];

      if (product.preUploadedUrls) {
        mainImageUrls = product.preUploadedUrls.mainImageUrls.filter(Boolean);
        detailImageUrls = product.preUploadedUrls.detailImageUrls.filter(Boolean);
        reviewImageUrls = includeReviewImages ? product.preUploadedUrls.reviewImageUrls.filter(Boolean) : [];
        infoImageUrls = product.preUploadedUrls.infoImageUrls.filter(Boolean);
      } else {
        const reviewPaths = includeReviewImages ? product.reviewImages : [];
        const allPaths = [...product.mainImages, ...product.detailImages, ...reviewPaths, ...product.infoImages];
        const allUrls = await uploadLocalImagesParallel(allPaths, shUserId, 10, true);

        let offset = 0;
        mainImageUrls = allUrls.slice(offset, offset + product.mainImages.length).filter(Boolean);
        offset += product.mainImages.length;
        detailImageUrls = allUrls.slice(offset, offset + product.detailImages.length).filter(Boolean);
        offset += product.detailImages.length;
        reviewImageUrls = allUrls.slice(offset, offset + reviewPaths.length).filter(Boolean);
        offset += reviewPaths.length;
        infoImageUrls = allUrls.slice(offset, offset + product.infoImages.length).filter(Boolean);
      }

      // 대표이미지 최소 1장 필요
      if (mainImageUrls.length === 0) {
        const error = '대표이미지 업로드 실패 — 최소 1장 필요';
        return {
          uid: product.uid, productCode: product.productCode, name: product.name,
          success: false, error, duration: Date.now() - productStart,
          detailedError: { message: error, category: 'image', field: 'images', step: '이미지 업로드', suggestion: '이미지 파일을 확인해주세요. 대표이미지가 최소 1장 필요합니다.' },
        };
      }

      // 5. AI 스토리
      const aiStoryRaw = batchAiStories.get(product.uid || product.productCode) || '';
      let aiStoryParagraphs: string[] = [];
      let aiReviewTexts: string[] = [];
      let aiStoryHtml = '';
      try {
        const parsed = JSON.parse(aiStoryRaw);
        aiStoryParagraphs = Array.isArray(parsed.paragraphs) ? parsed.paragraphs : [];
        aiReviewTexts = Array.isArray(parsed.reviewTexts) ? parsed.reviewTexts : [];
      } catch {
        aiStoryHtml = aiStoryRaw;
      }

      // 6. 구매옵션 자동 추출 (notices보다 먼저 → hints 생성)
      const extracted = await extractOptions(product.name, product.categoryCode);
      if (extracted.warnings.length > 0) {
        console.warn(`[batch] 옵션 추출 경고 [${product.name}]:`, extracted.warnings.join(', '));
      }

      // 추출된 옵션값을 notices용 hints로 변환
      const noticeHints: ExtractedNoticeHints = {};
      for (const opt of extracted.buyOptions) {
        if (opt.unit === 'ml' || opt.name.includes('용량')) noticeHints.volume = `${opt.value}${opt.unit || 'ml'}`;
        if (opt.unit === 'g' || opt.name.includes('중량')) noticeHints.weight = `${opt.value}${opt.unit || 'g'}`;
        if (opt.name.includes('색상') || opt.name.includes('컬러')) noticeHints.color = opt.value;
        if (opt.name.includes('사이즈') || opt.name.includes('크기')) noticeHints.size = opt.value;
        if (opt.name === '수량') noticeHints.count = `${opt.value}${opt.unit || '개'}`;
      }

      // 7. notices 자동채움 (추출된 hints 연동 + 카테고리 힌트)
      const filledNotices = fillNoticeFields(
        product.noticeMeta || [],
        { name: product.name, brand: product.brand, tags: product.tags, description: product.description },
        returnInfo.afterServiceContactNumber,
        noticeOverrides,
        noticeHints,
        product.name,
      );

      // 8. 페이로드 빌드
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
        aiStoryHtml, aiStoryParagraphs, aiReviewTexts,
        extractedBuyOptions: extracted.buyOptions,
        totalUnitCount: extracted.totalUnitCount,
        displayProductName: product.aiDisplayName,
        sellerProductName: product.aiSellerName,
        // 추가: 할인가, 바코드, KC인증, 멀티옵션, 세금/성인
        originalPrice: product.originalPrice,
        barcode: product.barcode,
        certifications: product.certifications,
        optionVariants: product.optionVariants,
        taxType: product.taxType,
        adultOnly: product.adultOnly,
      });

      // 9. 쿠팡 API 호출 (retry 적용)
      let result: { channelProductId: string };
      try {
        result = await withRetry(
          () => coupangAdapter.createProduct(payload),
          { maxRetries: 2, initialDelayMs: 1000, retryableErrors: ['timeout', 'econnreset', 'socket hang up', '429', '503', '502'] },
        );
      } catch (apiErr) {
        const errMsg = apiErr instanceof Error ? apiErr.message : '쿠팡 API 등록 실패';
        return {
          uid: product.uid, productCode: product.productCode, name: product.name,
          success: false, error: errMsg, duration: Date.now() - productStart, brandWarning,
          detailedError: classifyError(errMsg, 'API 등록', errMsg),
        };
      }

      // 10. DB 저장 (트랜잭션 보장 — 실패 시 쿠팡 상품 정보를 orphan 테이블에 기록)
      let savedId: string | null = null;
      try {
        const { data: savedProduct } = await serviceClient
          .from('sh_products')
          .insert({
            megaload_user_id: shUserId,
            coupang_product_id: result.channelProductId,
            product_name: product.name,
            display_name: product.aiDisplayName || product.name,
            brand: product.brand || '',
            category_id: product.categoryCode,
            status: 'active',
            raw_data: {
              sourceFolder: product.folderPath, sourcePrice: product.sourcePrice, productCode: product.productCode,
              mainImageUrls, detailImageUrls, reviewImageUrls, infoImageUrls,
              aiStoryHtml: aiStoryHtml || undefined,
            },
          })
          .select('id')
          .single();

        savedId = (savedProduct as Record<string, unknown>)?.id as string;

        if (savedId) {
          // 채널 + 옵션 저장
          await serviceClient.from('sh_product_channels').insert({
            product_id: savedId, megaload_user_id: shUserId, channel: 'coupang',
            channel_product_id: result.channelProductId, status: 'active', last_synced_at: new Date().toISOString(),
          });
          await serviceClient.from('sh_product_options').insert({
            product_id: savedId, megaload_user_id: shUserId, option_name: '기본',
            sku: product.productCode, sale_price: product.sellingPrice, cost_price: product.sourcePrice, stock,
          });

          // sh_product_images 저장
          const imageInserts: { product_id: string; image_url: string; cdn_url: string; image_type: string; sort_order: number }[] = [];
          mainImageUrls.forEach((url, i) => imageInserts.push({ product_id: savedId!, image_url: url, cdn_url: url, image_type: 'main', sort_order: i }));
          detailImageUrls.forEach((url, i) => imageInserts.push({ product_id: savedId!, image_url: url, cdn_url: url, image_type: 'detail', sort_order: i }));
          reviewImageUrls.forEach((url, i) => imageInserts.push({ product_id: savedId!, image_url: url, cdn_url: url, image_type: 'description', sort_order: i }));
          infoImageUrls.forEach((url, i) => imageInserts.push({ product_id: savedId!, image_url: url, cdn_url: url, image_type: 'option', sort_order: i }));
          if (imageInserts.length > 0) {
            await serviceClient.from('sh_product_images').insert(imageInserts);
          }
        }
      } catch (dbErr) {
        // DB 실패 시 보상 로직: 고아 상품 정보를 sh_sync_jobs.result에 기록
        console.error(`[batch] DB 저장 실패 — 쿠팡 상품 ID ${result.channelProductId} 고아 발생:`, dbErr);
        try {
          await serviceClient.from('sh_sync_jobs').update({
            result: {
              orphanProducts: [{
                channelProductId: result.channelProductId,
                productCode: product.productCode,
                name: product.name,
                error: dbErr instanceof Error ? dbErr.message : 'DB 저장 실패',
              }],
            },
          }).eq('id', jobId);
        } catch {
          // 보상 로직도 실패하면 최소한 로그 남김
        }

        const dbError = `쿠팡 등록 성공(${result.channelProductId})이나 DB 저장 실패 — 관리자 확인 필요`;
        return {
          uid: product.uid, productCode: product.productCode, name: product.name,
          success: false, channelProductId: result.channelProductId,
          error: dbError, duration: Date.now() - productStart, brandWarning,
          detailedError: { message: dbError, category: 'unknown' as const, step: 'DB 저장', suggestion: '관리자에게 문의하세요. 쿠팡에는 등록되었으나 DB 동기화에 실패했습니다.' },
        };
      }

      return {
        uid: product.uid, productCode: product.productCode, name: product.name,
        success: true, channelProductId: result.channelProductId,
        duration: Date.now() - productStart, brandWarning,
      };
    }

    // ---- 병렬 배치 실행 ----
    const results: ProductResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    const PARALLEL_REGISTER = 5;
    for (let i = 0; i < products.length; i += PARALLEL_REGISTER) {
      const chunk = products.slice(i, i + PARALLEL_REGISTER);
      const chunkResults = await Promise.allSettled(chunk.map((p) => registerSingleProduct(p)));

      // 순차적으로 카운트 업데이트 (race condition 방지)
      for (let j = 0; j < chunkResults.length; j++) {
        const result = chunkResults[j];
        const product = chunk[j];
        const isSuccess = result.status === 'fulfilled' && result.value.success;

        if (result.status === 'fulfilled') {
          results.push(result.value);
          if (result.value.success) successCount++;
          else errorCount++;
        } else {
          const errMsg = result.reason instanceof Error ? result.reason.message : '알 수 없는 오류';
          results.push({
            uid: product.uid, productCode: product.productCode, name: product.name,
            success: false, error: errMsg, duration: 0,
            detailedError: classifyError(errMsg, 'API 등록'),
          });
          errorCount++;
        }

        // sh_sync_jobs 카운트 업데이트 (atomic RPC → fallback with retry)
        try {
          const { error: rpcError } = await serviceClient.rpc('increment_sync_job_counts', {
            p_job_id: jobId, p_processed: 1,
            p_errors: isSuccess ? 0 : 1,
          });
          if (rpcError) throw rpcError;
        } catch {
          // RPC 실패 시 직접 increment (SQL 수준 atomic)
          try {
            await serviceClient.rpc('increment_sync_job_counts_fallback', {
              p_job_id: jobId,
              p_add_processed: 1,
              p_add_errors: isSuccess ? 0 : 1,
            });
          } catch {
            // 최종 fallback: 현재 배치 종료 후 complete-job에서 최종 보정됨
            console.warn(`[batch] Job counter 업데이트 실패 — complete-job에서 보정 예정`);
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
