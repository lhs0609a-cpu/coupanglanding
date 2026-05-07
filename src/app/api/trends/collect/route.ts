import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { TREND_SEED_KEYWORDS } from '@/lib/data/trend-seed-keywords';
import { collectTrendKeywords } from '@/lib/utils/trend-collect';

export const maxDuration = 30;


export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { category } = body;

    if (!category || !TREND_SEED_KEYWORDS[category]) {
      return NextResponse.json({ error: '유효하지 않은 카테고리입니다.' }, { status: 400 });
    }

    const seedKeywords = TREND_SEED_KEYWORDS[category];
    const result = await collectTrendKeywords(category, seedKeywords);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('trend collect error:', err);
    const message = err instanceof Error ? err.message : '서버 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
