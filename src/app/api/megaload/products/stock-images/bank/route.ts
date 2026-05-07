import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { queryBankImages } from '@/lib/megaload/services/stock-image-service';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


/**
 * GET /api/megaload/products/stock-images/bank?category=apple
 *
 * 스왑 모달용 — 해당 카테고리의 모든 뱅크 이미지 반환
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const category = req.nextUrl.searchParams.get('category');
    if (!category) {
      return NextResponse.json({ error: 'category 파라미터가 필요합니다.' }, { status: 400 });
    }

    const images = await queryBankImages(category, supabase);

    return NextResponse.json({ images });
  } catch (err) {
    console.error('[stock-images/bank] Error:', err);
    void logSystemError({ source: 'megaload/products/stock-images/bank', error: err }).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '뱅크 이미지 조회 실패' },
      { status: 500 },
    );
  }
}
