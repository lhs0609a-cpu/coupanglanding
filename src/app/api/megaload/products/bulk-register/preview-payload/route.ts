import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { buildCoupangProductPayload, type DeliveryInfo, type ReturnInfo, type AttributeMeta } from '@/lib/megaload/services/coupang-product-builder';
import { fillNoticeFields, type NoticeCategoryMeta, type ExtractedNoticeHints } from '@/lib/megaload/services/notice-field-filler';
import { extractOptionsEnhanced } from '@/lib/megaload/services/option-extractor';
import type { ContentBlock } from '@/lib/megaload/services/persuasion-engine';

export const maxDuration = 30;


interface PreviewRequestBody {
  product: {
    productCode: string;
    folderPath: string;
    name: string;
    sourceName?: string;
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
    // 사용자가 카테고리 수동 변경 후 클라이언트에서 재생성한 본문/제목/리뷰를
    // 그대로 미리보기에 반영하기 위한 override 필드들.
    // (등록 경로 preflight-builder.ts:46-58 과 동일 필드명/시맨틱)
    displayProductNameOverride?: string;
    descriptionOverride?: string;
    storyParagraphsOverride?: string[];
    reviewTextsOverride?: string[];
    contentBlocksOverride?: ContentBlock[];
    noticeValuesOverride?: Record<string, string>;
  };
  deliveryInfo: DeliveryInfo;
  returnInfo: ReturnInfo;
  stock: number;
  includeReviewImages: boolean;
  noticeOverrides?: Record<string, string>;
  preUploadedUrls?: {
    mainImageUrls: string[];
    detailImageUrls: string[];
    reviewImageUrls: string[];
    infoImageUrls: string[];
  };
}

/**
 * POST — 단일 상품의 쿠팡 API 페이로드를 빌드하여 반환 (실제 등록하지 않음)
 */
export async function POST(req: NextRequest) {
  try {
    // 1. 인증
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

    const body = (await req.json()) as PreviewRequestBody;
    const { product, deliveryInfo, returnInfo, stock = 999, includeReviewImages = true, noticeOverrides } = body;

    if (!product?.categoryCode) {
      return NextResponse.json({ error: '카테고리 코드가 필요합니다.' }, { status: 400 });
    }

    // 2. 어댑터 + vendorId
    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
    const coupangAdapter = adapter as CoupangAdapter;
    const vendorId = coupangAdapter.getVendorId();

    // 3. 카테고리 메타 조회 (noticeMeta + attributeMeta)
    let noticeMeta: NoticeCategoryMeta[] = [];
    let attributeMeta: AttributeMeta[] = [];

    try {
      const { getNoticeCategoryWithCache } = await import('@/lib/megaload/services/notice-category-cache');
      noticeMeta = await getNoticeCategoryWithCache(serviceClient, coupangAdapter, product.categoryCode);
    } catch {
      // notices 조회 실패 → 빈 배열
    }

    try {
      const attrResult = await coupangAdapter.getCategoryAttributes(product.categoryCode);
      attributeMeta = attrResult.items;
    } catch {
      // attributes 조회 실패 → 빈 배열
    }

    // 4. 구매옵션 자동 추출 — 원본 상품명에서 추출 (가공된 이름엔 수량 정보 없음)
    const optionSourceName = product.sourceName || product.name;
    // 사용자가 편집한 description 우선 — 옵션 추출/고시 채움에 일관성 부여
    const effectiveDescription = product.descriptionOverride ?? product.description;
    const extracted = await extractOptionsEnhanced({
      productName: optionSourceName,
      categoryCode: product.categoryCode,
      brand: product.brand,
      tags: product.tags,
      description: effectiveDescription,
    });

    // 추출된 옵션값을 notices용 hints로 변환
    const noticeHints: ExtractedNoticeHints = {};
    for (const opt of extracted.buyOptions) {
      if (opt.unit === 'ml' || opt.name.includes('용량')) noticeHints.volume = `${opt.value}${opt.unit || 'ml'}`;
      if (opt.unit === 'g' || opt.name.includes('중량')) noticeHints.weight = `${opt.value}${opt.unit || 'g'}`;
      if (opt.name.includes('색상') || opt.name.includes('컬러')) noticeHints.color = opt.value;
      if (opt.name.includes('사이즈') || opt.name.includes('크기')) noticeHints.size = opt.value;
      if (opt.name === '수량') noticeHints.count = `${opt.value}${opt.unit || '개'}`;
    }

    // categoryPath 조회 (노출고시 매칭에 categoryPath가 상품명보다 정확)
    const { getCategoryDetails } = await import('@/lib/megaload/services/category-matcher');
    const categoryDetails = await getCategoryDetails(product.categoryCode);
    const categoryPath = categoryDetails?.path || '';

    // 5. notices 자동채움 — categoryPath + 상품명을 모두 hint로 전달 (path 우선)
    // 글로벌 noticeOverrides 와 상품별 noticeValuesOverride 병합 (상품별 우선)
    const mergedNoticeOverrides = {
      ...(noticeOverrides || {}),
      ...(product.noticeValuesOverride || {}),
    };
    const noticeHint = categoryPath || product.name;
    const filledNotices = fillNoticeFields(
      noticeMeta,
      { name: product.name, brand: product.brand, tags: product.tags, description: effectiveDescription },
      returnInfo.afterServiceContactNumber,
      Object.keys(mergedNoticeOverrides).length > 0 ? mergedNoticeOverrides : undefined,
      noticeHints,
      noticeHint,
    );

    // 6. 이미지 URL (사전 업로드된 URL 사용, 없으면 원본 경로)
    const mainImageUrls = body.preUploadedUrls?.mainImageUrls?.filter(Boolean) || product.mainImages;
    const detailImageUrls = body.preUploadedUrls?.detailImageUrls?.filter(Boolean) || product.detailImages;
    const reviewImageUrls = includeReviewImages
      ? (body.preUploadedUrls?.reviewImageUrls?.filter(Boolean) || product.reviewImages)
      : [];
    const infoImageUrls = body.preUploadedUrls?.infoImageUrls?.filter(Boolean) || product.infoImages;

    // 제3자(스톡) 이미지 자동 삽입 제거 — 풀에서 랜덤 선정되어 'CS CENTER 위탁배송 안내' 등이
    // 자동으로 본문에 들어가던 동작 비활성. 미리보기 페이로드도 실제 등록 동작과 일치시킨다.
    const selectedThirdPartyUrls: string[] = [];

    // 7. 페이로드 빌드 — 클라이언트에서 카테고리 변경 후 재생성된 본문/제목/리뷰를 그대로 사용
    const payload = buildCoupangProductPayload({
      vendorId,
      product: {
        folderPath: product.folderPath,
        productCode: product.productCode,
        productJson: { name: optionSourceName, brand: product.brand, tags: product.tags, description: effectiveDescription, price: product.sourcePrice },
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
      attributeMeta,
      reviewImageUrls,
      infoImageUrls,
      thirdPartyImageUrls: selectedThirdPartyUrls,
      extractedBuyOptions: extracted.buyOptions,
      totalUnitCount: extracted.totalUnitCount,
      // ★ 카테고리 변경 → 본문/제목/리뷰 재생성 결과를 미리보기에 즉시 반영.
      // 등록 경로(preflight/canary/batch)와 동일하게 displayProductName/aiStory* 사용.
      displayProductName: product.displayProductNameOverride,
      aiStoryParagraphs: product.storyParagraphsOverride,
      aiReviewTexts: product.reviewTextsOverride,
      contentBlocks: product.contentBlocksOverride,
      categoryPath: categoryPath || undefined,
    });

    const payloadJson = JSON.stringify(payload);

    // 8. 메타 정보 구성
    const meta = {
      extractedOptions: extracted.buyOptions,
      optionConfidence: extracted.confidence,
      optionWarnings: extracted.warnings,
      totalUnitCount: extracted.totalUnitCount,
      noticeCategories: filledNotices.map((nc) => ({
        name: nc.noticeCategoryName,
        fieldCount: nc.noticeCategoryDetailName.length,
        fields: nc.noticeCategoryDetailName,
      })),
      attributeCount: attributeMeta.length,
      attributes: attributeMeta.map((a) => ({
        name: a.attributeTypeName,
        required: a.required,
        dataType: a.dataType,
        attributeValues: a.attributeValues,
      })),
      imageCount: mainImageUrls.length + detailImageUrls.length + reviewImageUrls.length + infoImageUrls.length,
      estimatedPayloadSize: new TextEncoder().encode(payloadJson).length,
    };

    return NextResponse.json({ payload, meta });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '페이로드 미리보기 실패' },
      { status: 500 },
    );
  }
}
