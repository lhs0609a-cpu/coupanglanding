import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { TREND_SEED_KEYWORDS } from '@/lib/data/trend-seed-keywords';
import { collectTrendKeywords } from '@/lib/utils/trend-collect';

export const maxDuration = 300;

/**
 * GET /api/cron/trends
 *
 * Vercel Cron이 2시간마다 호출
 * 가장 오래된(또는 데이터 없는) 카테고리 1개를 자동 선택하여 트렌드 키워드 수집
 */
export async function GET(request: NextRequest) {
  // Vercel Cron 인증
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const allCategories = Object.keys(TREND_SEED_KEYWORDS);
    const serviceClient = await createServiceClient();

    // 카테고리별 최신 collected_at 조회
    const { data: latestByCategory } = await serviceClient
      .from('trending_keywords')
      .select('category, collected_at')
      .in('category', allCategories)
      .order('collected_at', { ascending: false });

    // 카테고리별 최신 collected_at 맵 구성
    const categoryLastCollected = new Map<string, string>();
    if (latestByCategory) {
      for (const row of latestByCategory) {
        if (!categoryLastCollected.has(row.category)) {
          categoryLastCollected.set(row.category, row.collected_at);
        }
      }
    }

    // 가장 오래된(또는 데이터 없는) 카테고리 선택
    let targetCategory: string | null = null;
    let oldestTime: string | null = null;

    for (const cat of allCategories) {
      const lastCollected = categoryLastCollected.get(cat);
      if (!lastCollected) {
        // 데이터 없는 카테고리 우선
        targetCategory = cat;
        break;
      }
      if (!oldestTime || lastCollected < oldestTime) {
        oldestTime = lastCollected;
        targetCategory = cat;
      }
    }

    if (!targetCategory) {
      return NextResponse.json({ error: '처리할 카테고리가 없습니다.' }, { status: 404 });
    }

    const seedKeywords = TREND_SEED_KEYWORDS[targetCategory];
    console.log(`[cron/trends] 카테고리 "${targetCategory}" 수집 시작 (시드 ${seedKeywords.length}개)`);

    const result = await collectTrendKeywords(targetCategory, seedKeywords);

    console.log(`[cron/trends] 완료: ${result.message}`);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('[cron/trends] error:', err);
    const message = err instanceof Error ? err.message : '서버 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
