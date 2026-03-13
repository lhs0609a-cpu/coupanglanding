import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/sellerhub/adapters/factory';
import { CoupangAdapter } from '@/lib/sellerhub/adapters/coupang.adapter';
import type { NoticeCategoryMeta } from '@/lib/sellerhub/services/notice-field-filler';
import type { AttributeMeta } from '@/lib/sellerhub/services/coupang-product-builder';
import {
  validateProductDeep,
  type ProductValidationResult,
  type CategoryMetadata,
} from '@/lib/sellerhub/services/product-validator';

interface ValidateProduct {
  uid: string;
  editedName: string;
  editedBrand: string;
  editedSellingPrice: number;
  editedCategoryCode: string;
  sourcePrice: number;
  mainImageCount: number;
}

interface ValidateBatchBody {
  products: ValidateProduct[];
  contactNumber?: string;
}

interface CategoryMetaMap {
  [categoryCode: string]: {
    noticeMeta: NoticeCategoryMeta[];
    attributeMeta: AttributeMeta[];
  };
}

/**
 * POST — 딥 검증 (카테고리 메타 기반)
 * 1. products에서 고유 카테고리 코드 추출
 * 2. 각 코드별 notices/attributes 병렬 조회
 * 3. 각 상품별 validateProductDeep() 실행
 * 4. categoryMeta도 함께 반환 (등록 시 init-job에서 재조회 방지)
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

    // 2. 카테고리별 메타 조회
    const categoryMeta: CategoryMetaMap = {};

    if (uniqueCodes.length > 0) {
      const serviceClient = await createServiceClient();
      const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
      const coupangAdapter = adapter as CoupangAdapter;

      for (const code of uniqueCodes) {
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

        categoryMeta[code] = { noticeMeta, attributeMeta };

        // 레이트 리밋 방지
        if (uniqueCodes.indexOf(code) < uniqueCodes.length - 1) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    }

    // 3. 각 상품별 딥 검증 실행
    const results: Record<string, ProductValidationResult> = {};

    for (const p of body.products) {
      const meta: CategoryMetadata | undefined = categoryMeta[p.editedCategoryCode];
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

    return NextResponse.json({ results, categoryMeta });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '검증 실패' },
      { status: 500 },
    );
  }
}
