import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import type { NoticeCategoryMeta } from '@/lib/megaload/services/notice-field-filler';
import type { AttributeMeta } from '@/lib/megaload/services/coupang-product-builder';
import {
  validateProductDeep,
  validateDryRun,
  type ProductValidationResult,
  type CategoryMetadata,
  type DryRunResult,
} from '@/lib/megaload/services/product-validator';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 20;

interface ValidateProduct {
  uid: string;
  editedName: string;
  editedBrand: string;
  editedSellingPrice: number;
  editedCategoryCode: string;
  sourcePrice: number;
  mainImageCount: number;
  detailImageCount?: number;
  infoImageCount?: number;
  reviewImageCount?: number;
}

interface ValidateBatchBody {
  products: ValidateProduct[];
  contactNumber?: string;
  dryRun?: boolean;
  deliveryInfo?: {
    outboundShippingPlaceCode: string;
    returnCenterCode: string;
    deliveryChargeType: string;
    deliveryCharge: number;
    returnCharge: number;
  };
  stock?: number;
}

interface CategoryMetaMap {
  [categoryCode: string]: {
    noticeMeta: NoticeCategoryMeta[];
    attributeMeta: AttributeMeta[];
  };
}

/**
 * POST — 딥 검증 + Dry-Run (카테고리 메타 기반)
 *
 * 최적화:
 * - 카테고리 메타 병렬 조회 (5개 동시)
 * - dryRun=true 시 페이로드 구조 사전 검증
 * - 100개 상품도 수초 내 처리
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    try {
      await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Megaload 계정이 없습니다.' }, { status: 404 });
    }

    const body = (await req.json()) as ValidateBatchBody;

    if (!body.products || body.products.length === 0) {
      return NextResponse.json({ error: '검증할 상품이 없습니다.' }, { status: 400 });
    }

    // 1. 고유 카테고리 코드 추출
    const uniqueCodes = [...new Set(
      body.products
        .map((p) => p.editedCategoryCode?.trim())
        .filter((c): c is string => !!c && c !== '0' && c !== 'NaN'),
    )];

    // 2. 카테고리별 메타 — Supabase 캐시 single SELECT 만 사용.
    // (이전: Coupang 어댑터로 라이브 fetch — 첫 호출 시 5~15s 소요 + init-job 과 중복.
    //  이제: 캐시 hit 분만 즉시 사용, miss 분은 init-job 단계(Step 3 등록 시)에서 채워짐.
    //  Dry-Run 검증은 캐시된 메타만으로 진행 — 미캐시 카테고리는 빈 메타로 통과시키고 등록 단계에서 강제 검증.)
    const categoryMeta: CategoryMetaMap = {};

    if (uniqueCodes.length > 0) {
      try {
        const { data: noticeRows } = await serviceClient
          .from('coupang_notice_category_cache')
          .select('category_code, notice_categories, is_empty')
          .in('category_code', uniqueCodes);

        if (Array.isArray(noticeRows)) {
          for (const row of noticeRows as Array<{ category_code: string; notice_categories: NoticeCategoryMeta[]; is_empty: boolean }>) {
            categoryMeta[row.category_code] = {
              noticeMeta: row.is_empty ? [] : (row.notice_categories ?? []),
              attributeMeta: [], // attributes 캐시는 별도 — init-job 에서 채워짐
            };
          }
        }
      } catch {
        // 캐시 조회 실패 — 빈 메타로 진행 (validation 통과, 등록 단계 검증)
      }
    }

    // 3. 각 상품별 검증 실행
    const results: Record<string, ProductValidationResult | DryRunResult> = {};

    for (const p of body.products) {
      const meta: CategoryMetadata | undefined = categoryMeta[p.editedCategoryCode];

      if (body.dryRun && body.deliveryInfo) {
        // Dry-Run 검증 (페이로드 수준)
        results[p.uid] = validateDryRun(
          {
            editedName: p.editedName,
            editedSellingPrice: p.editedSellingPrice,
            editedCategoryCode: p.editedCategoryCode,
            editedBrand: p.editedBrand,
            sourcePrice: p.sourcePrice,
            mainImageCount: p.mainImageCount,
            detailImageCount: p.detailImageCount,
            infoImageCount: p.infoImageCount,
            reviewImageCount: p.reviewImageCount,
            outboundShippingPlaceCode: body.deliveryInfo.outboundShippingPlaceCode,
            returnCenterCode: body.deliveryInfo.returnCenterCode,
            deliveryChargeType: body.deliveryInfo.deliveryChargeType,
            deliveryCharge: body.deliveryInfo.deliveryCharge,
            returnCharge: body.deliveryInfo.returnCharge,
            contactNumber: body.contactNumber,
            stock: body.stock,
          },
          meta,
        );
      } else {
        // 기존 딥 검증
        results[p.uid] = validateProductDeep(
          {
            editedName: p.editedName,
            editedSellingPrice: p.editedSellingPrice,
            editedCategoryCode: p.editedCategoryCode,
            editedBrand: p.editedBrand,
            sourcePrice: p.sourcePrice,
            mainImageCount: p.mainImageCount,
          },
          meta,
          body.contactNumber,
        );
      }
    }

    return NextResponse.json({ results, categoryMeta });
  } catch (err) {
    await logSystemError({
      source: 'megaload/bulk-register/validate-batch',
      error: err,
      context: { productCount: 0 },
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '검증 실패' },
      { status: 500 },
    );
  }
}
