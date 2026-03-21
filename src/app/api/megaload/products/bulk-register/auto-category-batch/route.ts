import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { matchCategoryBatch, type CategoryMatchResult } from '@/lib/megaload/services/category-matcher';

/**
 * POST — 다수 상품명에 대한 일괄 카테고리 자동매칭
 * body: { productNames: string[] }  (최대 200개씩)
 *
 * 카테고리 매칭은 로컬 DB만으로 가능하므로
 * megaload 계정/채널 연동이 없어도 Tier 0/1 매칭 수행
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as { productNames: string[]; naverCategoryIds?: (string | undefined)[] };
    if (!body.productNames || body.productNames.length === 0) {
      return NextResponse.json({ error: '상품명 목록이 필요합니다.' }, { status: 400 });
    }
    if (body.productNames.length > 200) {
      return NextResponse.json({ error: '한 번에 최대 200개까지 가능합니다.' }, { status: 400 });
    }

    // adapter는 Tier 1.5/2 (쿠팡 API) 호출에만 필요 — 선택적
    // megaload 계정이나 채널 연동이 없어도 Tier 0/1 로컬 매칭으로 충분
    let coupangAdapter: CoupangAdapter | undefined;
    try {
      const { data: shUser } = await supabase
        .from('megaload_users')
        .select('id')
        .eq('profile_id', user.id)
        .single();
      if (shUser) {
        const shUserId = (shUser as Record<string, unknown>).id as string;
        const serviceClient = await createServiceClient();
        const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
        coupangAdapter = adapter as CoupangAdapter;
      }
    } catch {
      // megaload 계정 없거나 채널 미연동 — Tier 0/1만 사용
    }

    // 배치 매칭 — 네이버 카테고리 ID가 있으면 매핑 테이블 우선 조회
    const batchResults = await matchCategoryBatch(body.productNames, coupangAdapter, body.naverCategoryIds);

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
