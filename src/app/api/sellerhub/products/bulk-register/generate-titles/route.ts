import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateProductTitlesBatch, type ProductTitleInput } from '@/lib/sellerhub/services/ai.service';

/**
 * POST — AI 상품 제목 일괄 생성 (미리보기 + 실제 등록용)
 *
 * body: { products: ProductTitleInput[] } (최대 100개)
 *
 * 아이템위너 회피:
 * - 매 호출마다 variation seed가 달라져서 같은 입력이어도 다른 제목 생성
 * - 키워드 순서, 수식어, 문장 구조가 매번 변경됨
 *
 * 속도: 10개/API호출 → 100개 = 10회 호출 = ~30초
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as { products: ProductTitleInput[] };
    if (!body.products || body.products.length === 0) {
      return NextResponse.json({ error: '상품 목록이 필요합니다.' }, { status: 400 });
    }
    if (body.products.length > 200) {
      return NextResponse.json({ error: '한 번에 최대 200개까지 가능합니다.' }, { status: 400 });
    }

    const results = await generateProductTitlesBatch(body.products);

    return NextResponse.json({
      results,
      totalCount: results.length,
      generatedCount: results.filter(r => r.displayName !== r.displayName).length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '제목 생성 실패' },
      { status: 500 },
    );
  }
}
