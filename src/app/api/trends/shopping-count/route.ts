import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


/**
 * POST /api/trends/shopping-count
 * Batch fetch product counts from Naver Shopping Search API
 * Body: { keywords: string[] }
 * Returns: { [keyword]: number }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const keywords: string[] = body.keywords;

    if (!Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: '키워드 목록이 필요합니다.' }, { status: 400 });
    }

    // Limit to 30 keywords per request
    const limitedKeywords = keywords.slice(0, 30);

    const clientId = process.env.NAVER_DATALAB_CLIENT_ID;
    const clientSecret = process.env.NAVER_DATALAB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: '네이버 API 키가 설정되지 않았습니다.' }, { status: 500 });
    }

    // Fetch product counts in parallel batches of 5
    const results: Record<string, number> = {};
    const batchSize = 5;

    for (let i = 0; i < limitedKeywords.length; i += batchSize) {
      const batch = limitedKeywords.slice(i, i + batchSize);

      const promises = batch.map(async (kw) => {
        try {
          const params = new URLSearchParams({
            query: kw,
            display: '1',
          });

          const res = await fetch(
            `https://openapi.naver.com/v1/search/shop.json?${params.toString()}`,
            {
              headers: {
                'X-Naver-Client-Id': clientId,
                'X-Naver-Client-Secret': clientSecret,
              },
            }
          );

          if (res.ok) {
            const data = await res.json();
            return { keyword: kw, count: data.total || 0 };
          }
          return { keyword: kw, count: 0 };
        } catch {
          return { keyword: kw, count: 0 };
        }
      });

      const batchResults = await Promise.all(promises);
      for (const r of batchResults) {
        results[r.keyword] = r.count;
      }

      // Rate limit: small delay between batches
      if (i + batchSize < limitedKeywords.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    console.error('shopping-count error:', err);
    void logSystemError({ source: 'trends/shopping-count', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
