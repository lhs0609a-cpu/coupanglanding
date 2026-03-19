import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import type { NoticeCategoryMeta } from '@/lib/megaload/services/notice-field-filler';
import type { AttributeMeta } from '@/lib/megaload/services/coupang-product-builder';
import {
  validateProductDeep,
  validateDryRun,
  type ProductValidationResult,
  type CategoryMetadata,
  type DryRunResult,
} from '@/lib/megaload/services/product-validator';

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

    const { data: shUser } = await supabase
      .from('megaload_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'Megaload 계정이 없습니다.' }, { status: 404 });

    const shUserId = (shUser as Record<string, unknown>).id as string;
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

    // 2. 카테고리별 메타 병렬 조회 (5개 동시)
    const categoryMeta: CategoryMetaMap = {};

    if (uniqueCodes.length > 0) {
      const serviceClient = await createServiceClient();
      const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
      const coupangAdapter = adapter as CoupangAdapter;

      const fetchCategoryMeta = async (code: string): Promise<{
        code: string;
        noticeMeta: NoticeCategoryMeta[];
        attributeMeta: AttributeMeta[];
      }> => {
        let noticeMeta: NoticeCategoryMeta[] = [];
        let attributeMeta: AttributeMeta[] = [];

        try {
          const noticeResult = await coupangAdapter.getNoticeCategoryFields(code);
          noticeMeta = noticeResult.items.map((item) => ({
            noticeCategoryName: item.noticeCategoryName,
            fields: item.noticeCategoryDetailNames.map((d) => ({
              name: d.name,
              required: d.required,
            })),
          }));
        } catch {
          // notices 조회 실패 → 빈 배열
        }

        try {
          const attrResult = await coupangAdapter.getCategoryAttributes(code);
          attributeMeta = attrResult.items;
        } catch {
          // attributes 조회 실패 → 빈 배열
        }

        return { code, noticeMeta, attributeMeta };
      };

      // 병렬 조회 (5개 동시)
      const CONCURRENT = 5;
      for (let i = 0; i < uniqueCodes.length; i += CONCURRENT) {
        const chunk = uniqueCodes.slice(i, i + CONCURRENT);
        const results = await Promise.allSettled(chunk.map(fetchCategoryMeta));

        for (const result of results) {
          if (result.status === 'fulfilled') {
            const { code, noticeMeta: nm, attributeMeta: am } = result.value;
            categoryMeta[code] = { noticeMeta: nm, attributeMeta: am };
          }
        }

        // 청크 간 짧은 딜레이 (레이트 리밋 방지)
        if (i + CONCURRENT < uniqueCodes.length) {
          await new Promise((r) => setTimeout(r, 300));
        }
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '검증 실패' },
      { status: 500 },
    );
  }
}
