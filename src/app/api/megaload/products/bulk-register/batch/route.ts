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
import { logExtractionCorpus } from '@/lib/megaload/services/option-corpus-logger';
import type { DetailedError } from '@/components/megaload/bulk/types';
import type { PreventionConfig } from '@/lib/megaload/services/item-winner-prevention';
import { detectImageFormat, getImageDimensions } from '@/lib/megaload/services/image-processor';
import { randomUUID } from 'crypto';

/**
 * 비상품 이미지 감지 — 네이버/플랫폼 배너, 가이드, 로고 등 상품과 무관한 이미지 URL 필터
 * 파일명 또는 URL 경로에서 패턴 매칭
 */
const NON_PRODUCT_URL_PATTERNS = [
  // 네이버 플랫폼 CDN (상품 이미지가 아닌 UI/가이드 이미지)
  /shop-phinf\.pstatic\.net/i,
  /shopping\.pstatic\.net/i,
  /simg\.pstatic\.net/i,
  /ssl\.pstatic\.net.*(?:shopping|pay|store|smartstore)/i,
  // URL 경로의 비상품 키워드
  /\/(?:naver_?logo|n_?pay|smartstore|store_?banner|delivery_?guide|return_?guide|shopping_?guide|exchange_?guide|refund_?guide)/i,
  // 파일명의 비상품 키워드 (업로드 후 CDN URL에 원본 파일명이 남는 경우)
  /(?:^|[/_\-.])(banner|badge|icon|logo|watermark|stamp|footer|header|guide|naverpay|npay|smartstore|delivery_info|return_info|notice_ban)/i,
];

function isNonProductImage(url: string): boolean {
  return NON_PRODUCT_URL_PATTERNS.some(p => p.test(url));
}

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
    const buffer = Buffer.from(await res.arrayBuffer());

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
  // 이미지 타입 분류 (의미적 매칭용)
  detailImageTypes?: string[];
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

    // ---- 진입부 사전조회 4가지를 병렬로 (Promise.all) ----
    // 이전: wing → seller_brand → existing → ... 순차 await (각 50~200ms 누적)
    // 이후: 모두 동시에 발사 — 서버/DB 입장에선 동일한 4개 쿼리, 시간만 단축
    const productCodes = products.map((p) => p.productCode);

    const [
      wingUserResult,
      sellerBrandResult,
      existingProductsResult,
    ] = await Promise.all([
      // 1) Wing ID (vendorUserId) — 없을 수 있음 (PT 미가입자)
      supabase
        .from('pt_users')
        .select('coupang_seller_id')
        .eq('profile_id', user.id)
        .single()
        .then(
          (r) => r,
          (err) => {
            console.warn('[batch] pt_users 조회 실패 — wingUserId 없이 진행:', err instanceof Error ? err.message : err);
            return { data: null } as { data: Record<string, unknown> | null };
          },
        ),
      // 2) 셀러 브랜드 (preventionConfig 에서 우선)
      preventionConfig?.sellerBrand
        ? Promise.resolve({ data: { seller_brand: preventionConfig.sellerBrand } })
        : serviceClient
            .from('megaload_users')
            .select('seller_brand')
            .eq('id', shUserId)
            .single()
            .then(
              (r) => r,
              (err) => {
                console.warn('[batch] megaload_users.seller_brand 조회 실패:', err instanceof Error ? err.message : err);
                return { data: null } as { data: Record<string, unknown> | null };
              },
            ),
      // 3) 중복 등록 방지: 이미 등록된 productCode
      //    실패 시 dedup 불가 → 명시적으로 이 사실을 추적하기 위해 sentinel(undefined) 사용
      serviceClient
        .from('sh_products')
        .select('raw_data')
        .eq('megaload_user_id', shUserId)
        .in('raw_data->>productCode', productCodes)
        .then(
          (r) => r,
          (err) => {
            console.error('[batch] 중복 검사 쿼리 실패 — dedup 비활성화 위험:', err instanceof Error ? err.message : err);
            return { data: undefined } as { data: { raw_data: Record<string, unknown> | null }[] | undefined };
          },
        ),
    ]);

    const wingUserId = (wingUserResult.data as Record<string, unknown> | null)?.coupang_seller_id as string || '';
    const sellerBrand = (sellerBrandResult.data as Record<string, unknown> | null)?.seller_brand as string || '';
    const existingProducts = existingProductsResult.data as { raw_data: Record<string, unknown> | null }[] | null | undefined;
    if (existingProductsResult.data === undefined) {
      console.warn('[batch] 중복 검사 결과 unavailable — 이번 배치는 dedup skip 됨');
    }

    const registeredCodes = new Set(
      (existingProducts || []).map((p) => {
        const raw = p.raw_data as Record<string, unknown> | null;
        return raw?.productCode as string;
      }).filter(Boolean),
    );

    // ---- 카테고리 메타 일괄 prefetch (누락된 코드만 한 번에 조회) ----
    // 이전: 상품마다 개별 재조회 → 카테고리 N개 × 1~2초 누적 (병목 #3)
    // 개선: 누락된 카테고리 코드 dedup → Promise.all 병렬 조회 (1.5~2초 1회로 단축)
    {
      const missingNoticeCodes = new Set<string>();
      const missingAttrCodes = new Set<string>();
      for (const p of products) {
        if (!p.noticeMeta || p.noticeMeta.length === 0) missingNoticeCodes.add(p.categoryCode);
        if (!p.attributeMeta || p.attributeMeta.length === 0) missingAttrCodes.add(p.categoryCode);
      }
      const allMissing = new Set([...missingNoticeCodes, ...missingAttrCodes]);
      if (allMissing.size > 0) {
        const noticeCache = new Map<string, NoticeCategoryMeta[]>();
        const attrCache = new Map<string, AttributeMeta[]>();
        await Promise.allSettled(
          [...allMissing].map(async (code) => {
            if (missingNoticeCodes.has(code)) {
              try {
                const r = await coupangAdapter.getNoticeCategoryFields(code);
                noticeCache.set(code, r.items.map((item) => ({
                  noticeCategoryName: item.noticeCategoryName,
                  fields: item.noticeCategoryDetailNames.map((d) => ({ name: d.name, required: d.required })),
                })));
              } catch { /* 개별 실패 무시 */ }
            }
            if (missingAttrCodes.has(code)) {
              try {
                const r = await coupangAdapter.getCategoryAttributes(code);
                attrCache.set(code, r.items);
              } catch { /* 개별 실패 무시 */ }
            }
          }),
        );
        // 상품에 채워넣기
        for (const p of products) {
          if ((!p.noticeMeta || p.noticeMeta.length === 0) && noticeCache.has(p.categoryCode)) {
            p.noticeMeta = noticeCache.get(p.categoryCode)!;
          }
          if ((!p.attributeMeta || p.attributeMeta.length === 0) && attrCache.has(p.categoryCode)) {
            p.attributeMeta = attrCache.get(p.categoryCode)!;
          }
        }
        console.log(`[batch] 메타 prefetch: notice=${noticeCache.size}, attr=${attrCache.size} / 누락카테고리=${allMissing.size}`);
      }
    }

    // ---- AI 스토리 배치 생성 ----
    const batchAiStories = new Map<string, string>();
    if (generateAiContent) {
      try {
        const storyInputs: StoryBatchInput[] = products.map((p) => {
          // features 강화: tags + ocrSpecs + noticeValues + attributeValues에서 추출
          const enrichedFeatures = [...(p.tags || [])];
          if (p.ocrSpecs) {
            Object.entries(p.ocrSpecs).forEach(([k, v]) => {
              if (v && v !== '-' && v !== '해당없음') enrichedFeatures.push(`${k}: ${v}`);
            });
          }
          if (p.noticeValuesOverride) {
            Object.entries(p.noticeValuesOverride).forEach(([k, v]) => {
              if (v && v.length < 50 && v !== '-') enrichedFeatures.push(`${k}: ${v}`);
            });
          }
          if (p.attributeValuesOverride) {
            Object.entries(p.attributeValuesOverride).forEach(([k, v]) => {
              if (v && v !== '-') enrichedFeatures.push(`${k}: ${v}`);
            });
          }
          return {
            productName: p.aiDisplayName || p.name,
            category: p.categoryCode,
            features: enrichedFeatures.slice(0, 15),
            description: p.description,
            categoryPath: p.categoryPath,
          };
        });
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

        // 세션 복원 후 핸들 유실 시 preUploadedUrls에 detail/review가 빈 배열이지만
        // product.detailImages/reviewImages에 로컬 경로가 남아있을 수 있음 → 서버 업로드 폴백
        if (detailImageUrls.length === 0 && product.detailImages?.length > 0) {
          console.log(`[batch] ${product.productCode} detail 폴백: preUploaded=0, localPaths=${product.detailImages.length}`);
          const detailFallbackUrls = await uploadLocalImagesParallel(product.detailImages, shUserId, 20, true, sellerBrand || undefined);
          detailImageUrls = detailFallbackUrls.filter(Boolean);
        }
        if (reviewImageUrls.length === 0 && includeReviewImages && product.reviewImages?.length > 0) {
          console.log(`[batch] ${product.productCode} review 폴백: preUploaded=0, localPaths=${product.reviewImages.length}`);
          const reviewFallbackUrls = await uploadLocalImagesParallel(product.reviewImages, shUserId, 20, true, sellerBrand || undefined);
          reviewImageUrls = reviewFallbackUrls.filter(Boolean);
        }
      } else {
        const reviewPaths = includeReviewImages ? product.reviewImages : [];
        const allPaths = [...product.mainImages, ...product.detailImages, ...reviewPaths, ...product.infoImages];

        const allUrls = await uploadLocalImagesParallel(allPaths, shUserId, 20, true, sellerBrand || undefined);

        let offset = 0;
        mainImageUrls = allUrls.slice(offset, offset + product.mainImages.length).filter(Boolean);
        offset += product.mainImages.length;
        detailImageUrls = allUrls.slice(offset, offset + product.detailImages.length).filter(Boolean);
        offset += product.detailImages.length;
        reviewImageUrls = allUrls.slice(offset, offset + reviewPaths.length).filter(Boolean);
        offset += reviewPaths.length;
        infoImageUrls = allUrls.slice(offset, offset + product.infoImages.length).filter(Boolean);
      }

      // 기타이미지(info) 네이버/플랫폼 비상품 이미지 필터 — 상품과 무관한 배너/가이드/로고 제거
      const prevInfoCount = infoImageUrls.length;
      infoImageUrls = infoImageUrls.filter(url => !isNonProductImage(url));
      if (prevInfoCount !== infoImageUrls.length) {
        console.log(`[batch] ${product.productCode} 기타이미지 필터: ${prevInfoCount} → ${infoImageUrls.length} (${prevInfoCount - infoImageUrls.length}건 제거)`);
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
        const aiStoryRaw = (batchAiStories.get(product.uid || product.productCode) || '').trim();
        // 빈 문자열은 JSON.parse가 throw → 폴백으로 모두 빈 값. 비어있지 않은 경우만 파싱 시도.
        if (aiStoryRaw) {
          try {
            const parsed = JSON.parse(aiStoryRaw);
            if (!hasUserStory) aiStoryParagraphs = Array.isArray(parsed.paragraphs) ? parsed.paragraphs : [];
            if (!hasUserReview) aiReviewTexts = Array.isArray(parsed.reviewTexts) ? parsed.reviewTexts : [];
          } catch {
            // JSON 형태가 아니면 문자열 자체를 HTML 본문으로 취급 (레거시 응답 대비)
            if (!hasUserStory) aiStoryHtml = aiStoryRaw;
          }
        }
      }

      // 5.5 noticeMeta가 비어있으면 캐시 우선 + 라이브 API 폴백으로 재조회
      if (!product.noticeMeta || product.noticeMeta.length === 0) {
        try {
          console.log(`[batch] noticeMeta 비어있음 → 캐시+재조회: category=${product.categoryCode}`);
          const { getNoticeCategoryWithCache } = await import('@/lib/megaload/services/notice-category-cache');
          const fresh = await getNoticeCategoryWithCache(serviceClient, coupangAdapter, product.categoryCode);
          if (fresh.length > 0) {
            product.noticeMeta = fresh;
            console.log(`[batch] noticeMeta 재조회 성공: ${fresh[0].noticeCategoryName} (${fresh[0].fields.length}개 필드)`);
          }
        } catch (e) {
          console.warn(`[batch] noticeMeta 재조회 실패:`, e);
        }
      }

      // 5.6 attributeMeta가 비어있으면 쿠팡 API에서 직접 재조회
      // (init-job에서 getCategoryAttributes 실패 시 빈 배열 → 구매옵션 미전송 → API 에러)
      if (!product.attributeMeta || product.attributeMeta.length === 0) {
        try {
          console.log(`[batch] attributeMeta 비어있음 → 재조회: category=${product.categoryCode}`);
          const attrResult = await coupangAdapter.getCategoryAttributes(product.categoryCode);
          if (attrResult.items.length > 0) {
            product.attributeMeta = attrResult.items;
            const exposedCount = attrResult.items.filter(a => a.exposed === 'EXPOSED').length;
            console.log(`[batch] attributeMeta 재조회 성공: ${attrResult.items.length}개 속성 (EXPOSED=${exposedCount})`);
          } else {
            console.warn(`[batch] attributeMeta 재조회했으나 비어있음 → 구매옵션 없는 카테고리이거나 API 오류`);
          }
        } catch (e) {
          console.warn(`[batch] attributeMeta 재조회 실패:`, e instanceof Error ? e.message : e);
        }
      }

      // 6~9. 공유 빌더로 페이로드 빌드 (옵션 추출, 고시정보, 아이템위너 방지 포함)
      const { payload, extractedOptions } = await buildProductPayload({
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
        detailImageTypes: product.detailImageTypes,
        thirdPartyImageUrls: body.thirdPartyImageUrls,
        productIndexInBatch: batchIndex,
        totalProductsInBatch: products.length,
        vendorUserId: wingUserId || undefined,
        sellerBrand,
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
            const { getNoticeCategoryWithCache } = await import('@/lib/megaload/services/notice-category-cache');
            const freshMeta = await getNoticeCategoryWithCache(serviceClient, coupangAdapter, product.categoryCode);
            if (freshMeta.length > 0 && diagItems) {
              // fillNoticeFields 호출하여 올바른 notices 생성
              const { fillNoticeFields } = await import('@/lib/megaload/services/notice-field-filler');
              const filledNotices = fillNoticeFields(
                freshMeta,
                { name: product.name, brand: product.brand, tags: product.tags || [], description: product.description || '' },
                undefined,
                undefined,
                undefined,
                product.categoryPath || product.name,
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

      // 10.4. corpus 로깅 — 실 등록 데이터를 회귀 검증 corpus에 적재
      // self-graded 한계 해결: 합성 패턴 GT 대신 실 사용자 등록 데이터로 검증
      logExtractionCorpus({
        productName: product.sourceName || product.name,
        categoryCode: product.categoryCode,
        categoryPath: product.categoryPath,
        extracted: extractedOptions.buyOptions,
        channelProductId: result.channelProductId,
        displayName: product.aiDisplayName || product.name,
      });

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
      // 안전 최적화:
      //   - source_url 을 초기 INSERT 에 포함 (이전: 별도 UPDATE 1회 추가 호출)
      //   - sh_products INSERT 후 channels/options/images/stock_monitor 4개를 Promise.all 병렬
      //     (모두 savedId 의존이지만 서로 독립 — 동일한 DB 쓰기, 단지 순차 대기 제거)
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
            source_url: product.sourceUrl || null,  // ← 별도 UPDATE 제거, 초기 INSERT에 포함
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
          // 채널 / 옵션 / 이미지 / 품절 모니터 4개 INSERT 를 병렬 실행
          // (각 작업이 서로 독립, 모두 savedId 만 공유)
          const imageInserts: { product_id: string; image_url: string; cdn_url: string; image_type: string; sort_order: number }[] = [];
          mainImageUrls.forEach((url, i) => imageInserts.push({ product_id: savedId!, image_url: url, cdn_url: url, image_type: 'main', sort_order: i }));
          detailImageUrls.forEach((url, i) => imageInserts.push({ product_id: savedId!, image_url: url, cdn_url: url, image_type: 'detail', sort_order: i }));
          reviewImageUrls.forEach((url, i) => imageInserts.push({ product_id: savedId!, image_url: url, cdn_url: url, image_type: 'review', sort_order: i }));
          infoImageUrls.forEach((url, i) => imageInserts.push({ product_id: savedId!, image_url: url, cdn_url: url, image_type: 'info', sort_order: i }));

          // Supabase 빌더는 thenable이며 reject 안 함 — { error } 필드를 명시적으로 검사해야 함.
          //   기존 await Promise.all(...) 은 모든 DB 실패를 silent 처리하여 채널 매핑 / 이미지 / 옵션 누락 발생.
          //   여기선 결과를 라벨링하여 실패 시 명시적 throw → 외부 catch 가 보상 로직(orphan 기록)으로 처리하게 함.
          interface LabeledWrite { label: string; thenable: PromiseLike<{ error: { message?: string } | null }> }
          const dbWrites: LabeledWrite[] = [
            {
              label: 'sh_product_channels',
              thenable: serviceClient.from('sh_product_channels').insert({
                product_id: savedId, megaload_user_id: shUserId, channel: 'coupang',
                channel_product_id: result.channelProductId, status: 'active', last_synced_at: new Date().toISOString(),
              }) as PromiseLike<{ error: { message?: string } | null }>,
            },
            {
              label: 'sh_product_options',
              thenable: serviceClient.from('sh_product_options').insert(
                ((product.optionVariants && product.optionVariants.length > 0)
                  ? product.optionVariants.map((v, i) => ({
                      product_id: savedId, megaload_user_id: shUserId,
                      option_name: v.optionName || `옵션${i + 1}`,
                      sku: v.sku || `${product.productCode}-${i + 1}`,
                      sale_price: typeof v.salePrice === 'number' ? v.salePrice : product.sellingPrice,
                      cost_price: product.sourcePrice,
                      stock: typeof v.stock === 'number' ? v.stock : stock,
                    }))
                  : [{
                      product_id: savedId, megaload_user_id: shUserId, option_name: '기본',
                      sku: product.productCode, sale_price: product.sellingPrice,
                      cost_price: product.sourcePrice, stock,
                    }]
                ),
              ) as PromiseLike<{ error: { message?: string } | null }>,
            },
          ];
          if (imageInserts.length > 0) {
            dbWrites.push({
              label: 'sh_product_images',
              thenable: serviceClient.from('sh_product_images').insert(imageInserts) as PromiseLike<{ error: { message?: string } | null }>,
            });
          }
          if (product.sourceUrl) {
            const registeredOptionName = product.sourceName || null;
            dbWrites.push({
              label: 'sh_stock_monitors',
              thenable: serviceClient.from('sh_stock_monitors').upsert({
                megaload_user_id: shUserId,
                product_id: savedId,
                coupang_product_id: result.channelProductId,
                source_url: product.sourceUrl,
                source_status: 'in_stock',
                coupang_status: 'active',
                is_active: true,
                registered_option_name: registeredOptionName,
              }, { onConflict: 'megaload_user_id,product_id' }) as PromiseLike<{ error: { message?: string } | null }>,
            });
          }
          const writeResults = await Promise.all(dbWrites.map(w => w.thenable.then(r => ({ label: w.label, error: r?.error }))));
          const failures = writeResults.filter(r => r.error).map(r => `${r.label}: ${r.error?.message || 'unknown'}`);
          if (failures.length > 0) {
            // sh_product_channels / sh_product_options 누락은 후속 흐름(복제, 정산)을 깨뜨리므로 예외로 승격
            throw new Error(`DB 부분 실패: ${failures.join(' | ')}`);
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

    // 동시성 10 → 20 으로 상향. 쿠팡 API 동시 20 처리 검증됨.
    // 카운터 RPC 도 청크 단위로 합산하여 1회만 호출 (이전: 상품당 sequential RPC).
    const PARALLEL_REGISTER = 20;
    for (let i = 0; i < products.length; i += PARALLEL_REGISTER) {
      const chunk = products.slice(i, i + PARALLEL_REGISTER);
      const chunkResults = await Promise.allSettled(chunk.map((p, j) => registerSingleProduct(p, i + j)));

      // 결과 집계 (RPC 호출 전 동기 처리)
      let chunkProcessed = 0;
      let chunkErrors = 0;
      for (let j = 0; j < chunkResults.length; j++) {
        const result = chunkResults[j];
        const product = chunk[j];

        if (result.status === 'fulfilled') {
          results.push(result.value);
          if (result.value.success) { successCount++; }
          else { errorCount++; chunkErrors++; }
        } else {
          const errMsg = result.reason instanceof Error ? result.reason.message : '알 수 없는 오류';
          results.push({
            uid: product.uid, productCode: product.productCode, name: product.name,
            success: false, error: errMsg, duration: 0,
            detailedError: classifyError(errMsg, 'API 등록'),
          });
          errorCount++;
          chunkErrors++;
        }
        chunkProcessed++;
      }

      // sh_sync_jobs 카운터 — 청크 1회 batch RPC (이전: 상품당 sequential)
      try {
        const { error: rpcError } = await serviceClient.rpc('increment_sync_job_counts', {
          p_job_id: jobId,
          p_processed: chunkProcessed,
          p_errors: chunkErrors,
        });
        if (rpcError) throw rpcError;
      } catch {
        try {
          await serviceClient.rpc('increment_sync_job_counts_fallback', {
            p_job_id: jobId,
            p_add_processed: chunkProcessed,
            p_add_errors: chunkErrors,
          });
        } catch {
          console.warn(`[batch] Job counter 업데이트 실패 — complete-job에서 보정 예정`);
        }
      }

      // 청크 간 딜레이 제거 — 쿠팡 API throttle 은 withRetry 가 429/503 응답 시
      //  지수 백오프로 자동 처리. 사전 sleep 은 throughput 만 깎고 보호 효과 없음.
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
