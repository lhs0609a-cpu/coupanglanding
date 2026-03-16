import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { TREND_SEED_KEYWORDS } from '@/lib/data/trend-seed-keywords';
import { collectTrendKeywords, CollectResult } from '@/lib/utils/trend-collect';

export const maxDuration = 300; // 5분 (11개 카테고리 순차 처리)

export async function POST() {
  try {
    // 관리자 인증
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const categories = Object.keys(TREND_SEED_KEYWORDS);
    const results: CollectResult[] = [];
    const errors: { category: string; error: string }[] = [];

    for (const category of categories) {
      try {
        const seedKeywords = TREND_SEED_KEYWORDS[category];
        const result = await collectTrendKeywords(category, seedKeywords);
        results.push(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : '수집 실패';
        errors.push({ category, error: message });
      }
    }

    const totalCollected = results.reduce((sum, r) => sum + r.collected, 0);

    return NextResponse.json({
      success: true,
      totalCategories: categories.length,
      completedCategories: results.length,
      failedCategories: errors.length,
      totalCollected,
      results,
      errors: errors.length > 0 ? errors : undefined,
      message: `${results.length}/${categories.length} 카테고리에서 총 ${totalCollected}개 키워드를 수집했습니다.${errors.length > 0 ? ` (${errors.length}개 실패)` : ''}`,
    });
  } catch (err) {
    console.error('collect-all error:', err);
    const message = err instanceof Error ? err.message : '서버 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
