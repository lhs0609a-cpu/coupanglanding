import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { matchCategoryBatch, type CategoryMatchResult, type FailureDiagnostic } from '@/lib/megaload/services/category-matcher';

export const maxDuration = 30;

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

    // Phase 2/3 (쿠팡 Search/Predict API) 일시 비활성화.
    // 쿠팡 API hang 으로 전체 배치가 응답 안 와 진행률 0/N 고정 사례 발생.
    // Tier 0/1 (로컬 DB) 결과만 반환 — 미매칭 건은 UI 에서 수동 선택.
    // 쿠팡 API 안정화 후 adapter 재인입 예정.
    const { results: batchResults, failures } = await matchCategoryBatch(
      body.productNames,
      undefined,
      body.naverCategoryIds,
    );

    const results: (CategoryMatchResult & { index: number })[] = batchResults.map(
      (result, i) => result
        ? { ...result, index: i }
        : { index: i, categoryCode: '', categoryName: '', categoryPath: '', confidence: 0, source: 'ai' as const },
    );

    return NextResponse.json({ results, failures });
  } catch (err) {
    console.error('[auto-category-batch] ERROR:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '일괄 카테고리 매칭 실패' },
      { status: 500 },
    );
  }
}
