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

    // Hobby 플랜 하루 1회 → 가장 오래된 2개 카테고리 수집 (6일에 전체 순환)
    const categoriesToCollect: string[] = [targetCategory];
    const sortedByAge = allCategories
      .filter((c) => c !== targetCategory)
      .sort((a, b) => (categoryLastCollected.get(a) || '1970').localeCompare(categoryLastCollected.get(b) || '1970'));
    if (sortedByAge.length > 0) categoriesToCollect.push(sortedByAge[0]);

    const results = [];
    for (const cat of categoriesToCollect) {
      const seedKeywords = TREND_SEED_KEYWORDS[cat];
      if (!seedKeywords || seedKeywords.length === 0) continue;

      console.log(`[cron/trends] 카테고리 "${cat}" 수집 시작 (시드 ${seedKeywords.length}개)`);
      try {
        const result = await collectTrendKeywords(cat, seedKeywords);
        console.log(`[cron/trends] 완료: ${result.message}`);
        results.push(result);
      } catch (catErr) {
        console.error(`[cron/trends] ${cat} 수집 실패:`, catErr instanceof Error ? catErr.message : catErr);
        results.push({ category: cat, collected: 0, message: `실패: ${catErr instanceof Error ? catErr.message : '알 수 없는 오류'}` });
      }
    }

    return NextResponse.json({
      success: true,
      categoriesProcessed: results.length,
      results,
    });
  } catch (err) {
    console.error('[cron/trends] error:', err);
    const message = err instanceof Error ? err.message : '서버 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
