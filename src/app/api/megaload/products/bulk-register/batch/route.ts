import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { uploadLocalImagesParallel } from '@/lib/megaload/services/local-product-reader';
import type { DeliveryInfo, ReturnInfo, AttributeMeta, CertificationInfo, OptionVariant } from '@/lib/megaload/services/coupang-product-builder';
import type { NoticeCategoryMeta } from '@/lib/megaload/services/notice-field-filler';
import { generateProductStoriesBatch, type StoryBatchInput } from '@/lib/megaload/services/ai.service';
import { buildProductPayload } from '@/lib/megaload/services/preflight-builder';
import { withRetry } from '@/lib/megaload/services/retry';
import { checkBrandProtection } from '@/lib/megaload/services/brand-checker';
import { classifyError } from '@/lib/megaload/services/error-classifier';
import type { DetailedError } from '@/components/megaload/bulk/types';
import type { PreventionConfig } from '@/lib/megaload/services/item-winner-prevention';
import { generateVariationParams, type VariationParams } from '@/lib/megaload/services/server-image-variation';
import { detectImageFormat, getImageDimensions } from '@/lib/megaload/services/image-processor';
import { randomUUID } from 'crypto';

/**
 * 서버사이드 이미지 규격 게이트 — 쿠팡 전송 전 최종 방어
 * 쿠팡: 최소 500×500, 최대 5000×5000, 최대 10MB
 * 규격 밖이면 jimp로 리사이징 + 재업로드, 규격 내면 원본 URL 반환
 */
async function ensureImageSpec(
  url: string,
  megaloadUserId: string,
  serviceClient: { storage: { from: (b: string) => { upload: (p: string, body: Buffer, opts?: Record<string, unknown>) => Promise<{ data: { path: string } | null; error: { message: string } | null }>; getPublicUrl: (p: string) => { data: { publicUrl: string } } } } },
): Promise<string> {
  if (!url || url.startsWith('preflight-placeholder://')) return url;

  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    let buffer = Buffer.from(await res.arrayBuffer());

    const format = detectImageFormat(buffer);
    const dims = getImageDimensions(buffer, format);

    const dimUnknown = dims.width === 0 || dims.height === 0;
    const needsUpscale = !dimUnknown && (dims.width < 500 || dims.height < 500);
    const needsDownscale = dims.width > 5000 || dims.height > 5000;
    const needsCompress = buffer.length > 10 * 1024 * 1024;

    if (!dimUnknown && !needsUpscale && !needsDownscale && !needsCompress) {
      return url; // 규격 내 — 원본 유지
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let Jimp: any;
    try {
      Jimp = (await import('jimp')).default || (await import('jimp'));
    } catch {
      console.warn('[ensureImageSpec] jimp 미설치 — 원본 반환');
      return url;
    }

    let image = await Jimp.read(buffer);
    const jW: number = image.getWidth?.() ?? image.bitmap?.width ?? 0;
    const jH: number = image.getHeight?.() ?? image.bitmap?.height ?? 0;
    const w = dims.width || jW;
    const h = dims.height || jH;

    if (w > 0 && h > 0 && (w < 500 || h < 500)) {
      const scale = Math.max(800 / w, 800 / h);
      image = image.resize(Math.round(w * scale), Math.round(h * scale));
    } else if (w > 5000 || h > 5000) {
      const scale = Math.min(4500 / w, 4500 / h);
      image = image.resize(Math.round(w * scale), Math.round(h * scale));
    }

    const MIME_JPEG = Jimp.MIME_JPEG || 'image/jpeg';
    let quality = 92;
    let outBuf = await image.quality(quality).getBufferAsync(MIME_JPEG);
    while (outBuf.length > 10 * 1024 * 1024 && quality > 40) {
      quality -= 10;
      outBuf = await image.quality(quality).getBufferAsync(MIME_JPEG);
    }

    // 리사이징된 이미지 재업로드
    const newBuffer = Buffer.from(outBuf);
    const storagePath = `megaload/${megaloadUserId}/resized/${randomUUID()}.jpg`;
    const bucket = serviceClient.storage.from('product-images');
    const { data, error } = await bucket.upload(storagePath, newBuffer, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
      upsert: false,
    });

    if (error || !data) {
      console.warn(`[ensureImageSpec] 재업로드 실패: ${error?.message} — 원본 반환`);
      return url;
    }

    const { data: pub } = bucket.getPublicUrl(storagePath);
    console.log(`[ensureImageSpec] 리사이징: ${w}×${h} → 규격 내 (${pub.publicUrl})`);
    return pub.publicUrl;
  } catch (err) {
    console.warn(`[ensureImageSpec] 실패 — 원본 반환:`, err instanceof Error ? err.message : err);
    return url;
  }
}

/** mainImageUrls 전체를 병렬 검증+리사이징 */
async function ensureAllImageSpecs(
  urls: string[],
  megaloadUserId: string,
  serviceClient: Parameters<typeof ensureImageSpec>[2],
): Promise<string[]> {
  return Promise.all(urls.map(url => ensureImageSpec(url, megaloadUserId, serviceClient)));
}

interface BatchProduct {
  uid?: string;
  productCode: string;
  folderPath: string;
  name: string;
  sourceName?: string;  // 원본 상품명 (옵션 추출용)
  sourceUrl?: string;   // 원본 상품 URL (product_summary.txt에서 추출)
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
  categoryPath?: string;        // 카테고리 경로 (예: "뷰티>스킨>크림>넥크림")
  // per-product 오버라이드 (상세패널에서 수정한 값)
  displayProductNameOverride?: string;
  manufacturerOverride?: string;
  itemNameOverride?: string;
  unitCountOverride?: number;
  stockOverride?: number;
  maxBuyPerPersonOverride?: number;
  shippingDaysOverride?: number;
  noticeValuesOverride?: Record<string, string>;
  attributeValuesOverride?: Record<string, string>;
  // 상세페이지 콘텐츠 오버라이드
  descriptionOverride?: string;
  storyParagraphsOverride?: string[];
  reviewTextsOverride?: string[];
  contentBlocksOverride?: import('@/lib/megaload/services/persuasion-engine').ContentBlock[];
  // OCR 추출 상품정보 스펙 (Layer 3)
  ocrSpecs?: Record<string, string>;
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
  preventionConfig?: PreventionConfig;
  products: BatchProduct[];
  thirdPartyImageUrls?: string[];
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

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Megaload 계정이 없습니다.' }, { status: 404 });
    }

    const body = (await req.json()) as BatchRegisterBody;

    const {
      jobId,
      deliveryInfo,
      returnInfo,
      stock = 999,
      generateAiContent = false,
      includeReviewImages = true,
      noticeOverrides,
      preventionConfig,
      products,
    } = body;

    if (!jobId) return NextResponse.json({ error: 'jobId가 필요합니다.' }, { status: 400 });
    if (!products || products.length === 0) return NextResponse.json({ error: '상품이 없습니다.' }, { status: 400 });
    if (!deliveryInfo?.outboundShippingPlaceCode) return NextResponse.json({ error: '출고지가 필요합니다.' }, { status: 400 });
    if (!returnInfo?.returnCenterCode) return NextResponse.json({ error: '반품지가 필요합니다.' }, { status: 400 });
    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
    const coupangAdapter = adapter as CoupangAdapter;
    const vendorId = coupangAdapter.getVendorId();

    // Wing ID (vendorUserId) 조회 — pt_users.coupang_seller_id
    let wingUserId = '';
    try {
      const { data: ptUser } = await supabase
        .from('pt_users')
        .select('coupang_seller_id')
        .eq('profile_id', user.id)
        .single();
      wingUserId = (ptUser as Record<string, unknown>)?.coupang_seller_id as string || '';
    } catch { /* pt_users 없으면 빈 문자열 */ }

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
    async function registerSingleProduct(product: BatchProduct, batchIndex?: number): Promise<ProductResult> {
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
      const preventionEnabled = preventionConfig?.enabled ?? false;
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

        // 아이템위너 방지: prevention 활성 시 변형 파라미터 생성 (강도 반영)
        let variationParamsList: (VariationParams | undefined)[] | undefined;
        if (preventionEnabled && preventionConfig?.imageVariation) {
          const imgSeed = `${shUserId}:${product.productCode}`;
          const intensity = preventionConfig.variationIntensity || 'mid';
          variationParamsList = allPaths.map((_, idx) => generateVariationParams(imgSeed, idx, intensity));
        }

        const allUrls = await uploadLocalImagesParallel(allPaths, shUserId, 10, true, variationParamsList);

        let offset = 0;
        mainImageUrls = allUrls.slice(offset, offset + product.mainImages.length).filter(Boolean);
        offset += product.mainImages.length;
        detailImageUrls = allUrls.slice(offset, offset + product.detailImages.length).filter(Boolean);
        offset += product.detailImages.length;
        reviewImageUrls = allUrls.slice(offset, offset + reviewPaths.length).filter(Boolean);
        offset += reviewPaths.length;
        infoImageUrls = allUrls.slice(offset, offset + product.infoImages.length).filter(Boolean);
      }

      // 서버사이드 이미지 규격 게이트 — 쿠팡 전송 전 최종 방어 (모든 경로 100% 커버)
      mainImageUrls = await ensureAllImageSpecs(mainImageUrls, shUserId, serviceClient);
      mainImageUrls = mainImageUrls.filter(Boolean);

      console.log(`[batch] ${product.productCode} 이미지 URL: main=${mainImageUrls.length}, detail=${detailImageUrls.length}, review=${reviewImageUrls.length}, info=${infoImageUrls.length}, preUploaded=${!!product.preUploadedUrls}`);

      // 대표이미지 최소 1장 필요
      if (mainImageUrls.length === 0) {
        const error = '대표이미지 업로드 실패 — 최소 1장 필요';
        return {
          uid: product.uid, productCode: product.productCode, name: product.name,
          success: false, error, duration: Date.now() - productStart,
          detailedError: { message: error, category: 'image', field: 'images', step: '이미지 업로드', suggestion: '이미지 파일을 확인해주세요. 대표이미지가 최소 1장 필요합니다.' },
        };
      }

      // 5. AI 스토리 (사용자 편집 값 우선)
      let aiStoryParagraphs: string[] = [];
      let aiReviewTexts: string[] = [];
      let aiStoryHtml = '';

      const hasUserStory = Array.isArray(product.storyParagraphsOverride) && product.storyParagraphsOverride.length > 0;
      const hasUserReview = Array.isArray(product.reviewTextsOverride) && product.reviewTextsOverride.length > 0;

      if (!hasUserStory || !hasUserReview) {
        const aiStoryRaw = batchAiStories.get(product.uid || product.productCode) || '';
        try {
          const parsed = JSON.parse(aiStoryRaw);
          if (!hasUserStory) aiStoryParagraphs = Array.isArray(parsed.paragraphs) ? parsed.paragraphs : [];
          if (!hasUserReview) aiReviewTexts = Array.isArray(parsed.reviewTexts) ? parsed.reviewTexts : [];
        } catch {
          if (!hasUserStory) aiStoryHtml = aiStoryRaw;
        }
      }

      // 5.5 noticeMeta가 비어있으면 쿠팡 API에서 직접 재조회
      if (!product.noticeMeta || product.noticeMeta.length === 0) {
        try {
          console.log(`[batch] noticeMeta 비어있음 → 재조회: category=${product.categoryCode}`);
          const noticeResult = await coupangAdapter.getNoticeCategoryFields(product.categoryCode);
          if (noticeResult.items.length > 0) {
            product.noticeMeta = noticeResult.items.map((item) => ({
              noticeCategoryName: item.noticeCategoryName,
              fields: item.noticeCategoryDetailNames.map((d) => ({
                name: d.name,
                required: d.required,
              })),
            }));
            console.log(`[batch] noticeMeta 재조회 성공: ${product.noticeMeta[0].noticeCategoryName} (${product.noticeMeta[0].fields.length}개 필드)`);
          }
        } catch (e) {
          console.warn(`[batch] noticeMeta 재조회 실패:`, e);
        }
      }

      // 6~9. 공유 빌더로 페이로드 빌드 (옵션 추출, 고시정보, 아이템위너 방지 포함)
      const { payload } = await buildProductPayload({
        product,
        vendorId,
        deliveryInfo,
        returnInfo,
        stock,
        noticeOverrides,
        preventionConfig,
        shUserId,
        mainImageUrls,
        detailImageUrls,
        reviewImageUrls,
        infoImageUrls,
        aiStoryHtml,
        aiStoryParagraphs,
        aiReviewTexts,
        contentBlocks: product.contentBlocksOverride,
        thirdPartyImageUrls: body.thirdPartyImageUrls,
        productIndexInBatch: batchIndex,
        totalProductsInBatch: products.length,
        vendorUserId: wingUserId || undefined,
      });

      // 10. 쿠팡 API 호출 (고시정보 에러 시 notices 제거 후 자동 재시도)
      let result: { channelProductId: string };
      try {
        result = await withRetry(
          () => coupangAdapter.createProduct(payload),
          { maxRetries: 2, initialDelayMs: 1000, retryableErrors: ['timeout', 'econnreset', 'socket hang up', '429', '503', '502'] },
        );
      } catch (apiErr) {
        const errMsg = apiErr instanceof Error ? apiErr.message : '쿠팡 API 등록 실패';
        const isNoticeError = /고시정보|notices|subschemas?\s*matched/i.test(errMsg);

        if (isNoticeError) {
          // 진단 정보
          const diagItems = payload.items as Record<string, unknown>[] | undefined;
          const diagFirst = diagItems?.[0] || {};
          const diagNotices = diagFirst.notices;
          const metaNames = (product.noticeMeta as { noticeCategoryName: string }[] | undefined)?.map(n => n.noticeCategoryName).join(',') || 'empty';
          const diagInfo = `[v13-diag] notices=${JSON.stringify(diagNotices ?? null).slice(0, 300)} meta=[${metaNames}] category=${product.categoryCode}`;
          console.log(`[batch] 고시정보 에러 → noticeMeta 재조회 시도: ${diagInfo}`);

          // noticeMeta 재조회 후 notices를 올바르게 채워 재시도
          try {
            const freshNotice = await coupangAdapter.getNoticeCategoryFields(product.categoryCode);
            if (freshNotice.items.length > 0 && diagItems) {
              // fillNoticeFields 호출하여 올바른 notices 생성
              const { fillNoticeFields } = await import('@/lib/megaload/services/notice-field-filler');
              const freshMeta = freshNotice.items.map((item) => ({
                noticeCategoryName: item.noticeCategoryName,
                fields: item.noticeCategoryDetailNames.map((d) => ({ name: d.name, required: d.required })),
              }));
              const filledNotices = fillNoticeFields(
                freshMeta,
                { name: product.name, brand: product.brand, tags: product.tags || [], description: product.description || '' },
              );
              // flattenNotices: FilledNoticeCategory[] → flat array
              const flatNotices = filledNotices.flatMap(nc =>
                nc.noticeCategoryDetailName.map(d => ({
                  noticeCategoryName: nc.noticeCategoryName,
                  noticeCategoryDetailName: d.noticeCategoryDetailName,
                  content: d.content,
                }))
              );
              for (const item of diagItems) {
                item.notices = flatNotices;
              }
              console.log(`[batch] notices 재구성 완료: ${freshMeta[0].noticeCategoryName} (${flatNotices.length}개 필드)`);
            }
            result = await withRetry(
              () => coupangAdapter.createProduct(payload),
              { maxRetries: 2, initialDelayMs: 1000, retryableErrors: ['timeout', 'econnreset', 'socket hang up', '429', '503', '502'] },
            );
          } catch (retryErr) {
            const retryMsg = retryErr instanceof Error ? retryErr.message : '쿠팡 API 등록 실패 (재시도)';
            return {
              uid: product.uid, productCode: product.productCode, name: product.name,
              success: false, error: `${diagInfo} | retry: ${retryMsg}`, duration: Date.now() - productStart, brandWarning,
              detailedError: classifyError(retryMsg, 'API 등록', retryMsg),
            };
          }
        } else {
          return {
            uid: product.uid, productCode: product.productCode, name: product.name,
            success: false, error: `[v5] ${errMsg}`, duration: Date.now() - productStart, brandWarning,
            detailedError: classifyError(errMsg, 'API 등록', errMsg),
          };
        }
      }

      // 10.5. 승인 요청 (임시저장 → 판매승인)
      try {
        const approval = await coupangAdapter.approveProduct(result.channelProductId);
        if (!approval.success) {
          console.warn(`[batch] 승인요청 실패 (${result.channelProductId}): ${approval.message} — 수동 승인 필요`);
        }
      } catch (e) {
        console.warn(`[batch] 승인요청 에러 (${result.channelProductId}):`, e instanceof Error ? e.message : e);
      }

      // 11. DB 저장 (트랜잭션 보장 — 실패 시 쿠팡 상품 정보를 orphan 테이블에 기록)
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
            status: 'active',
            raw_data: {
              sourceFolder: product.folderPath, sourcePrice: product.sourcePrice, productCode: product.productCode,
              sourceUrl: product.sourceUrl || undefined,
              categoryCode: product.categoryCode,
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

    const PARALLEL_REGISTER = 10;
    for (let i = 0; i < products.length; i += PARALLEL_REGISTER) {
      const chunk = products.slice(i, i + PARALLEL_REGISTER);
      const chunkResults = await Promise.allSettled(chunk.map((p, j) => registerSingleProduct(p, i + j)));

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
