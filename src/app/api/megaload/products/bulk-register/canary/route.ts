import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { buildProductPayload, type BuildPayloadProduct } from '@/lib/megaload/services/preflight-builder';
import { classifyError } from '@/lib/megaload/services/error-classifier';
import type { CanaryResult } from '@/lib/megaload/types';
import type { DeliveryInfo, ReturnInfo, AttributeMeta } from '@/lib/megaload/services/coupang-product-builder';
import type { NoticeCategoryMeta } from '@/lib/megaload/services/notice-field-filler';
import type { PreventionConfig } from '@/lib/megaload/services/item-winner-prevention';

interface CanaryRequestBody {
  product: {
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
    displayProductNameOverride?: string;
    noticeValuesOverride?: Record<string, string>;
    attributeValuesOverride?: Record<string, string>;
    descriptionOverride?: string;
    storyParagraphsOverride?: string[];
    reviewTextsOverride?: string[];
    contentBlocksOverride?: import('@/lib/megaload/services/persuasion-engine').ContentBlock[];
    preUploadedUrls?: {
      mainImageUrls: string[];
      detailImageUrls: string[];
      reviewImageUrls: string[];
      infoImageUrls: string[];
    };
  };
  deliveryInfo: DeliveryInfo;
  returnInfo: ReturnInfo;
  stock?: number;
  noticeOverrides?: Record<string, string>;
  preventionConfig?: PreventionConfig;
  thirdPartyImageUrls?: string[];
}

/**
 * POST — 카나리 테스트
 * 1개 상품을 실제 쿠팡 API로 등록 → 성공 확인 → 판매중지 → 삭제
 * DB에는 저장하지 않음 (테스트용).
 */
export async function POST(req: NextRequest) {
  const phases: CanaryResult['phases'] = [];

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

    const body = (await req.json()) as CanaryRequestBody;
    const { product, deliveryInfo, returnInfo, stock = 999, noticeOverrides, preventionConfig } = body;

    if (!product) {
      return NextResponse.json({ error: '카나리 대상 상품이 없습니다.' }, { status: 400 });
    }

    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
    const coupangAdapter = adapter as CoupangAdapter;
    const vendorId = coupangAdapter.getVendorId();

    // Phase 1: 페이로드 빌드
    let payload: Record<string, unknown>;
    const buildStart = Date.now();
    try {
      const mainImageUrls = product.preUploadedUrls?.mainImageUrls?.filter(Boolean) || [];
      const detailImageUrls = product.preUploadedUrls?.detailImageUrls?.filter(Boolean) || [];
      const reviewImageUrls = product.preUploadedUrls?.reviewImageUrls?.filter(Boolean) || [];
      const infoImageUrls = product.preUploadedUrls?.infoImageUrls?.filter(Boolean) || [];

      if (mainImageUrls.length === 0) {
        throw new Error('대표이미지가 없습니다. 이미지 사전업로드가 필요합니다.');
      }

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
        noticeMeta: (product.noticeMeta || []) as NoticeCategoryMeta[],
        attributeMeta: (product.attributeMeta || []) as AttributeMeta[],
        aiDisplayName: product.aiDisplayName,
        aiSellerName: product.aiSellerName,
        displayProductNameOverride: product.displayProductNameOverride,
        noticeValuesOverride: product.noticeValuesOverride,
        attributeValuesOverride: product.attributeValuesOverride,
        descriptionOverride: product.descriptionOverride,
        storyParagraphsOverride: product.storyParagraphsOverride,
        reviewTextsOverride: product.reviewTextsOverride,
        contentBlocksOverride: product.contentBlocksOverride,
      };

      const result = await buildProductPayload({
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
      payload = result.payload;
      phases.push({ name: '페이로드 빌드', success: true, durationMs: Date.now() - buildStart });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '페이로드 빌드 실패';
      phases.push({ name: '페이로드 빌드', success: false, durationMs: Date.now() - buildStart, error: errMsg });
      const result: CanaryResult = { success: false, phases, cleanedUp: false, error: errMsg };
      return NextResponse.json(result);
    }

    // Phase 2: 쿠팡 API 등록
    let channelProductId: string;
    const registerStart = Date.now();
    try {
      const createResult = await coupangAdapter.createProduct(payload);
      channelProductId = createResult.channelProductId;
      phases.push({ name: 'API 등록', success: true, durationMs: Date.now() - registerStart });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '쿠팡 API 등록 실패';
      phases.push({ name: 'API 등록', success: false, durationMs: Date.now() - registerStart, error: errMsg });
      const classified = classifyError(errMsg, 'API 등록', errMsg);
      const result: CanaryResult = { success: false, phases, cleanedUp: false, error: classified.suggestion || errMsg };
      return NextResponse.json(result);
    }

    // Phase 3: 판매중지 + 삭제
    let cleanedUp = false;
    const cleanupStart = Date.now();
    try {
      await new Promise(r => setTimeout(r, 500)); // 쿠팡 서버 반영 대기
      await coupangAdapter.suspendProduct(channelProductId);
      await coupangAdapter.deleteProduct(channelProductId);
      cleanedUp = true;
      phases.push({ name: '정리 (중지+삭제)', success: true, durationMs: Date.now() - cleanupStart });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '삭제 실패';
      phases.push({ name: '정리 (중지+삭제)', success: false, durationMs: Date.now() - cleanupStart, error: errMsg });
    }

    const result: CanaryResult = {
      success: true,
      phases,
      channelProductId,
      cleanedUp,
      error: cleanedUp ? undefined : `카나리 상품(${channelProductId})이 삭제되지 않았습니다. 쿠팡 Wing에서 수동 삭제가 필요합니다.`,
    };

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '카나리 테스트 실패' },
      { status: 500 },
    );
  }
}
