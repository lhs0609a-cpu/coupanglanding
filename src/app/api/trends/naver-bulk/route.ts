import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import { parseNaverCount, calculateTrendScore } from '@/lib/utils/trend-collect';

export const maxDuration = 30;


function generateSignature(timestamp: number, method: string, path: string, secretKey: string): string {
  const message = `${timestamp}.${method}.${path}`;
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

export async function POST() {
  try {
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

    const customerId = process.env.NAVER_AD_CUSTOMER_ID;
    const accessKey = process.env.NAVER_AD_ACCESS_KEY;
    const secretKey = process.env.NAVER_AD_SECRET_KEY;

    if (!customerId || !accessKey || !secretKey) {
      return NextResponse.json({ error: '네이버 광고 API 키가 설정되지 않았습니다.' }, { status: 500 });
    }

    const serviceClient = await createServiceClient();

    // 활성 키워드 전체 조회
    const { data: keywords, error: fetchError } = await serviceClient
      .from('trending_keywords')
      .select('id, keyword')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (fetchError || !keywords || keywords.length === 0) {
      return NextResponse.json({ error: '활성 키워드가 없습니다.' }, { status: 404 });
    }

    let updatedCount = 0;
    let errorCount = 0;

    // 5개씩 묶어서 API 호출
    for (let i = 0; i < keywords.length; i += 5) {
      const batch = keywords.slice(i, i + 5);
      const hintKeywords = batch.map(k => k.keyword).join(',');

      const timestamp = Date.now();
      const method = 'GET';
      const path = '/keywordstool';
      const signature = generateSignature(timestamp, method, path, secretKey);

      const params = new URLSearchParams({
        hintKeywords,
        showDetail: '1',
      });

      try {
        const response = await fetch(`https://api.searchad.naver.com${path}?${params.toString()}`, {
          method: 'GET',
          headers: {
            'X-API-KEY': accessKey,
            'X-CUSTOMER': customerId,
            'X-Timestamp': String(timestamp),
            'X-Signature': signature,
          },
        });

        if (!response.ok) {
          errorCount += batch.length;
          continue;
        }

        const result = await response.json();
        const keywordList = result.keywordList || [];

        // 각 키워드 매칭 & 업데이트
        for (const kw of batch) {
          const match = keywordList.find(
            (item: Record<string, unknown>) =>
              (item.relKeyword as string)?.toLowerCase() === kw.keyword.toLowerCase()
          );

          if (match) {
            const naverData = {
              relKeyword: match.relKeyword,
              monthlyPcQcCnt: parseNaverCount(match.monthlyPcQcCnt),
              monthlyMobileQcCnt: parseNaverCount(match.monthlyMobileQcCnt),
              monthlyAvePcClkCnt: parseNaverCount(match.monthlyAvePcClkCnt),
              monthlyAveMobileClkCnt: parseNaverCount(match.monthlyAveMobileClkCnt),
              compIdx: match.compIdx || '낮음',
              plAvgDepth: parseNaverCount(match.plAvgDepth),
            };

            const trendScore = calculateTrendScore(naverData.monthlyPcQcCnt, naverData.monthlyMobileQcCnt);

            await serviceClient
              .from('trending_keywords')
              .update({
                naver_trend_data: naverData,
                naver_fetched_at: new Date().toISOString(),
                trend_score: trendScore,
                source: 'naver',
                updated_at: new Date().toISOString(),
              })
              .eq('id', kw.id);

            updatedCount++;
          } else {
            errorCount++;
          }
        }

        // API rate limit 방지 (배치 간 500ms 딜레이)
        if (i + 5 < keywords.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch {
        errorCount += batch.length;
      }
    }

    // Phase 2: 네이버 쇼핑 API로 상품수 + 경쟁강도 업데이트
    let shoppingUpdated = 0;
    const shopClientId = process.env.NAVER_DATALAB_CLIENT_ID;
    const shopClientSecret = process.env.NAVER_DATALAB_CLIENT_SECRET;

    if (shopClientId && shopClientSecret) {
      // 업데이트된 키워드의 검색수 다시 조회
      const { data: updatedKeywords } = await serviceClient
        .from('trending_keywords')
        .select('id, keyword, naver_trend_data')
        .eq('is_active', true);

      if (updatedKeywords) {
        for (let i = 0; i < updatedKeywords.length; i += 5) {
          const batch = updatedKeywords.slice(i, i + 5);

          const promises = batch.map(async (kw) => {
            try {
              const params = new URLSearchParams({ query: kw.keyword, display: '1' });
              const res = await fetch(
                `https://openapi.naver.com/v1/search/shop.json?${params.toString()}`,
                {
                  headers: {
                    'X-Naver-Client-Id': shopClientId,
                    'X-Naver-Client-Secret': shopClientSecret,
                  },
                }
              );
              if (res.ok) {
                const data = await res.json();
                return { id: kw.id, keyword: kw.keyword, productCount: data.total || 0, trendData: kw.naver_trend_data };
              }
              return null;
            } catch {
              return null;
            }
          });

          const results = await Promise.all(promises);

          for (const r of results) {
            if (!r) continue;
            const totalSearch = (r.trendData?.monthlyPcQcCnt || 0) + (r.trendData?.monthlyMobileQcCnt || 0);
            const competitionRatio = totalSearch > 0 ? Math.round((r.productCount / totalSearch) * 100) / 100 : 0;

            await serviceClient
              .from('trending_keywords')
              .update({
                product_count: r.productCount,
                competition_ratio: competitionRatio,
                updated_at: new Date().toISOString(),
              })
              .eq('id', r.id);

            shoppingUpdated++;
          }

          if (i + 5 < updatedKeywords.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      total: keywords.length,
      updated: updatedCount,
      shoppingUpdated,
      errors: errorCount,
    });
  } catch (err) {
    console.error('naver-bulk error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
