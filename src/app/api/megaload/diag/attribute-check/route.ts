import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { getCategoryDetails } from '@/lib/megaload/services/category-matcher';

/**
 * GET /api/megaload/diag/attribute-check?code=58920
 *
 * 진단: 쿠팡 API의 실제 attributeTypeName과 로컬 JSON의 buyOptions 이름을 비교
 */
export async function GET(req: NextRequest) {
  const categoryCode = req.nextUrl.searchParams.get('code') || '58920';

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
    const coupangAdapter = adapter as CoupangAdapter;

    // 1. 쿠팡 API에서 실제 attributes 조회
    const apiResult = await coupangAdapter.getCategoryAttributes(categoryCode);
    const apiAttributes = apiResult.items;

    // 2. 로컬 JSON에서 buyOptions 조회
    const localDetails = await getCategoryDetails(categoryCode);
    const localBuyOptions = localDetails?.buyOptions || [];

    // 3. 비교 분석
    const apiNames = apiAttributes
      .filter(a => a.required)
      .map(a => ({
        name: a.attributeTypeName,
        dataType: a.dataType,
        hasEnum: !!a.attributeValues && a.attributeValues.length > 0,
        enumCount: a.attributeValues?.length || 0,
      }));

    const localNames = localBuyOptions.map(o => ({
      name: o.name,
      unit: o.unit,
      required: o.required,
      choose1: o.choose1,
    }));

    // 4. 이름 불일치 찾기
    const mismatches: { localName: string; matchedApiName: string | null; type: string }[] = [];
    for (const local of localBuyOptions) {
      const exactMatch = apiAttributes.find(a => a.attributeTypeName === local.name);
      if (!exactMatch) {
        // 부분 매칭 시도
        const partialMatch = apiAttributes.find(a => {
          const apiN = a.attributeTypeName.toLowerCase();
          const localN = local.name.toLowerCase();
          return apiN.includes('개당') && localN.includes('개당') && apiN !== localN;
        });
        mismatches.push({
          localName: local.name,
          matchedApiName: partialMatch?.attributeTypeName || null,
          type: partialMatch ? 'NAME_CHANGED' : 'NOT_FOUND_IN_API',
        });
      }
    }

    // 5. API에만 있는 구매옵션형 속성 (로컬에 없는 것)
    const apiOnlyBuyOpts = apiAttributes
      .filter(a => {
        const n = a.attributeTypeName.toLowerCase();
        const isBuyOpt = n.includes('개당') || n === '수량' || n === '총 수량';
        return isBuyOpt && !localBuyOptions.some(l => l.name === a.attributeTypeName);
      })
      .map(a => a.attributeTypeName);

    return NextResponse.json({
      categoryCode,
      categoryPath: localDetails?.path || 'unknown',
      apiAttributeCount: apiAttributes.length,
      apiRequiredAttributes: apiNames,
      localBuyOptions: localNames,
      mismatches,
      apiOnlyBuyOptions: apiOnlyBuyOpts,
      diagnosis: mismatches.length > 0
        ? `⚠️ ${mismatches.length}개 이름 불일치 발견! 이것이 옵션 미입력의 원인입니다.`
        : '✅ 이름 일치 — 다른 원인을 확인하세요.',
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
