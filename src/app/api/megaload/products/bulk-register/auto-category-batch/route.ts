import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { matchCategoryBatch, type CategoryMatchResult } from '@/lib/megaload/services/category-matcher';

/**
 * POST — 다수 상품명에 대한 일괄 카테고리 자동매칭
 * body: { productNames: string[] }  (최대 200개씩)
 *
 * 내부에서 키워드 중복제거 → 고유 키워드만 API 호출
 * 100개 비오틴 상품 → API 3~5회로 감소
 *
 * adapter(쿠팡 API 인증)가 실패해도 Tier 0/1 로컬 매칭은 작동
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

    const body = await req.json() as { productNames: string[] };
    if (!body.productNames || body.productNames.length === 0) {
      return NextResponse.json({ error: '상품명 목록이 필요합니다.' }, { status: 400 });
    }
    if (body.productNames.length > 200) {
      return NextResponse.json({ error: '한 번에 최대 200개까지 가능합니다.' }, { status: 400 });
    }

    // adapter는 Tier 1.5/2 (쿠팡 API) 호출에만 필요
    // 실패해도 Tier 0 (DIRECT_CODE_MAP) + Tier 1 (로컬 DB)로 충분히 매칭 가능
    let coupangAdapter: CoupangAdapter | undefined;
    try {
      const serviceClient = await createServiceClient();
      const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
      coupangAdapter = adapter as CoupangAdapter;
    } catch (adapterErr) {
      console.warn('[auto-category-batch] adapter 미사용 (Tier 0/1만 사용):', adapterErr instanceof Error ? adapterErr.message : adapterErr);
    }

    // 배치 매칭 — adapter 없으면 로컬 매칭만 수행
    const batchResults = await matchCategoryBatch(body.productNames, coupangAdapter);

    const results: (CategoryMatchResult & { index: number })[] = batchResults.map(
      (result, i) => result
        ? { ...result, index: i }
        : { index: i, categoryCode: '', categoryName: '', categoryPath: '', confidence: 0, source: 'ai' as const },
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error('[auto-category-batch] ERROR:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '일괄 카테고리 매칭 실패' },
      { status: 500 },
    );
  }
}
