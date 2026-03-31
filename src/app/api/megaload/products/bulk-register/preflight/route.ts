import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { buildProductPayload, type BuildPayloadProduct } from '@/lib/megaload/services/preflight-builder';
import { validatePayloadStructure, type CategoryMetadata } from '@/lib/megaload/services/product-validator';
import type { PreflightProductResult, PreflightIssue } from '@/lib/megaload/types';
import type { DeliveryInfo, ReturnInfo, AttributeMeta } from '@/lib/megaload/services/coupang-product-builder';
import type { NoticeCategoryMeta } from '@/lib/megaload/services/notice-field-filler';
import type { PreventionConfig } from '@/lib/megaload/services/item-winner-prevention';

interface PreflightRequestProduct {
  uid: string;
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
  noticeMeta?: NoticeCategoryMeta[];
  attributeMeta?: AttributeMeta[];
  aiDisplayName?: string;
  aiSellerName?: string;
  categoryConfidence?: number;
  categoryPath?: string;
  mainImageCount?: number;  // 클라이언트에서 확인된 이미지 수 (preUploadedUrls 없을 때 폴백)
  displayProductNameOverride?: string;
  manufacturerOverride?: string;
  unitCountOverride?: number;
  stockOverride?: number;
  noticeValuesOverride?: Record<string, string>;
  attributeValuesOverride?: Record<string, string>;
  descriptionOverride?: string;
  storyParagraphsOverride?: string[];
  reviewTextsOverride?: string[];
  contentBlocksOverride?: import('@/lib/megaload/services/persuasion-engine').ContentBlock[];
  // 사전업로드 이미지 URL
  preUploadedUrls?: {
    mainImageUrls: string[];
    detailImageUrls: string[];
    reviewImageUrls: string[];
    infoImageUrls: string[];
  };
}

interface PreflightRequestBody {
  products: PreflightRequestProduct[];
  deliveryInfo: DeliveryInfo;
  returnInfo: ReturnInfo;
  stock?: number;
  contactNumber?: string;
  noticeOverrides?: Record<string, string>;
  preventionConfig?: PreventionConfig;
  categoryMetaCache?: Record<string, CategoryMetadata>;
  imageTimestamps?: Record<string, number>;
  thirdPartyImageUrls?: string[];
}

/**
 * POST — 프리플라이트 검사
 * 실제 쿠팡 API 페이로드를 빌드하고 구조적으로 엄격 검증.
 * API 호출 없이 클라이언트에서 1-2초 내 결과를 받음.
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();

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

    const body = (await req.json()) as PreflightRequestBody;
    const {
      products,
      deliveryInfo,
      returnInfo,
      stock = 999,
      noticeOverrides,
      preventionConfig,
      categoryMetaCache = {},
      imageTimestamps = {},
    } = body;

    if (!products || products.length === 0) {
      return NextResponse.json({ error: '상품이 없습니다.' }, { status: 400 });
    }

    // 배송/반품 설정 검증 — 전체 등록에 영향을 미치는 공통 설정
    const deliveryWarnings: PreflightIssue[] = [];
    if (!deliveryInfo?.outboundShippingPlaceCode) {
      deliveryWarnings.push({ code: 'NO_OUTBOUND', field: 'outboundShippingPlaceCode', message: '출고지가 설정되지 않았습니다. Step 1에서 출고지를 선택해주세요.' });
    }
    if (!returnInfo?.returnCenterCode) {
      deliveryWarnings.push({ code: 'NO_RETURN_CENTER', field: 'returnCenterCode', message: '반품지가 설정되지 않았습니다. Step 1에서 반품지를 선택해주세요.' });
    }
    if (!deliveryInfo?.deliveryCompanyCode) {
      deliveryWarnings.push({ code: 'NO_DELIVERY_COMPANY', field: 'deliveryCompanyCode', message: '배송사 코드가 설정되지 않았습니다.' });
    }
    if (!returnInfo?.companyContactNumber && !returnInfo?.afterServiceContactNumber) {
      deliveryWarnings.push({ code: 'NO_CONTACT', field: 'contactNumber', message: 'A/S 연락처가 설정되지 않았습니다. 고시정보에 빈 값이 들어갑니다.' });
    }

    // vendorId 획득 (연결 안 되어 있어도 프리플라이트는 계속 진행)
    let vendorId = 'PREFLIGHT_PLACEHOLDER';
    try {
      const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
      const coupangAdapter = adapter as CoupangAdapter;
      vendorId = coupangAdapter.getVendorId();
    } catch {
      // 쿠팡 채널 미연결 시에도 프리플라이트 구조 검증은 가능
    }

    // 유니크 카테고리 코드별 메타 조회 (캐시 우선)
    const uniqueCategoryCodes = [...new Set(products.map(p => p.categoryCode).filter(Boolean))];
    const uncachedCodes = uniqueCategoryCodes.filter(c => !categoryMetaCache[c]);
    const categoryMeta: Record<string, CategoryMetadata> = { ...categoryMetaCache };

    if (uncachedCodes.length > 0) {
      try {
        const metaRes = await fetch(
          `${req.nextUrl.origin}/api/megaload/products/bulk-register/init-job`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: req.headers.get('cookie') || '' },
            body: JSON.stringify({ totalCount: 0, categoryCodes: uncachedCodes, preflightOnly: true }),
          },
        );
        if (metaRes.ok) {
          const metaData = await metaRes.json();
          if (metaData.categoryMeta) {
            Object.assign(categoryMeta, metaData.categoryMeta);
          }
        }
      } catch {
        // 메타 조회 실패는 치명적이지 않음 — product-level 메타로 대체
      }
    }

    // 상품별 병렬 처리 (10개 동시)
    const PARALLEL = 10;
    const results: Record<string, PreflightProductResult> = {};
    let passCount = 0;
    let failCount = 0;
    let warnCount = 0;

    for (let i = 0; i < products.length; i += PARALLEL) {
      const chunk = products.slice(i, i + PARALLEL);
      const chunkResults = await Promise.allSettled(
        chunk.map(async (product) => {
          const meta = categoryMeta[product.categoryCode] || {
            noticeMeta: product.noticeMeta || [],
            attributeMeta: product.attributeMeta || [],
          };

          // 이미지 URL 확인 — 사전업로드 URL 또는 플레이스홀더
          let mainImageUrls = product.preUploadedUrls?.mainImageUrls?.filter(Boolean) || [];
          let detailImageUrls = product.preUploadedUrls?.detailImageUrls?.filter(Boolean) || [];
          let reviewImageUrls = product.preUploadedUrls?.reviewImageUrls?.filter(Boolean) || [];
          let infoImageUrls = product.preUploadedUrls?.infoImageUrls?.filter(Boolean) || [];

          // 폴백: preUploadedUrls가 없지만 클라이언트에서 이미지 수를 알려준 경우
          // (브라우저 모드 등 사전업로드가 안 된 경우)
          if (mainImageUrls.length === 0 && (product.mainImageCount ?? 0) > 0) {
            const cnt = product.mainImageCount!;
            mainImageUrls = Array.from({ length: cnt }, (_, i) => `preflight-local://main/${product.uid}/${i}`);
          }
          if (mainImageUrls.length === 0 && product.mainImages && product.mainImages.length > 0) {
            mainImageUrls = product.mainImages.map((_, i) => `preflight-local://main/${product.uid}/${i}`);
          }

          // 이미지 상태 판정
          let imageStatus: 'fresh' | 'stale' | 'missing' = 'missing';
          if (mainImageUrls.length > 0) {
            const uploadedAt = imageTimestamps[product.uid];
            if (uploadedAt) {
              const ageMin = (Date.now() - uploadedAt) / 60_000;
              imageStatus = ageMin > 25 ? 'stale' : 'fresh';
            } else {
              imageStatus = 'fresh'; // 타임스탬프 없으면 fresh로 가정
            }
          }

          // 페이로드 빌드
          const buildProduct: BuildPayloadProduct = {
            uid: product.uid,
            productCode: product.productCode,
            folderPath: product.folderPath,
            name: product.name,
            brand: product.brand,
            sellingPrice: product.sellingPrice,
            sourcePrice: product.sourcePrice,
            categoryCode: product.categoryCode,
            tags: product.tags,
            description: product.description,
            mainImages: product.mainImages,
            detailImages: product.detailImages,
            reviewImages: product.reviewImages,
            infoImages: product.infoImages,
            noticeMeta: meta.noticeMeta as NoticeCategoryMeta[],
            attributeMeta: meta.attributeMeta as AttributeMeta[],
            aiDisplayName: product.aiDisplayName,
            aiSellerName: product.aiSellerName,
            categoryConfidence: product.categoryConfidence,
            categoryPath: product.categoryPath,
            displayProductNameOverride: product.displayProductNameOverride,
            manufacturerOverride: product.manufacturerOverride,
            unitCountOverride: product.unitCountOverride,
            stockOverride: product.stockOverride,
            noticeValuesOverride: product.noticeValuesOverride,
            attributeValuesOverride: product.attributeValuesOverride,
            descriptionOverride: product.descriptionOverride,
            storyParagraphsOverride: product.storyParagraphsOverride,
            reviewTextsOverride: product.reviewTextsOverride,
            contentBlocksOverride: product.contentBlocksOverride,
          };

          const { payload, filledNotices } = await buildProductPayload({
            product: buildProduct,
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
            thirdPartyImageUrls: body.thirdPartyImageUrls,
          });

          // 구조 검증
          const validation = validatePayloadStructure({
            payload,
            categoryMeta: meta,
            imageTimestamp: imageTimestamps[product.uid],
          });

          // 페이로드 스냅샷
          const payloadJson = JSON.stringify(payload);
          const items = ((payload.items || payload.sellerProductItemList) as Record<string, unknown>[]) || [];
          const firstItem = items[0] || {};
          const imageArr = (firstItem.images as unknown[]) || [];

          const payloadSnapshot = {
            sellerProductName: (payload.sellerProductName as string) || '',
            displayProductName: (payload.displayProductName as string) || '',
            imageCount: imageArr.length,
            noticeCategoryCount: filledNotices.length,
            attributeCount: (meta.attributeMeta as { required: boolean }[]).filter(a => a.required).length,
            hasDetailPage: !!payload.content && (payload.content as string).length > 50,
            payloadSizeKB: Math.round(payloadJson.length / 1024 * 10) / 10,
          };

          const pass = validation.errors.length === 0;

          return {
            uid: product.uid,
            result: {
              pass,
              errors: validation.errors,
              warnings: validation.warnings,
              payloadSnapshot,
              imageStatus,
            } as PreflightProductResult,
          };
        }),
      );

      for (const settled of chunkResults) {
        if (settled.status === 'fulfilled') {
          const { uid, result } = settled.value;
          results[uid] = result;
          if (result.pass) passCount++;
          else failCount++;
          if (result.warnings.length > 0) warnCount++;
        } else {
          // Promise rejected — 빌드 자체 실패
          const errMsg = settled.reason instanceof Error ? settled.reason.message : '빌드 실패';
          // chunk에서 어떤 상품인지 식별 어려움 → skip
          console.error('[preflight] Product build error:', errMsg);
        }
      }
    }

    return NextResponse.json({
      overallPass: failCount === 0 && deliveryWarnings.filter(w => w.code === 'NO_OUTBOUND' || w.code === 'NO_RETURN_CENTER').length === 0,
      stats: { total: products.length, pass: passCount, fail: failCount, warn: warnCount },
      results,
      deliveryWarnings,
      categoryMeta,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '프리플라이트 검사 실패' },
      { status: 500 },
    );
  }
}
