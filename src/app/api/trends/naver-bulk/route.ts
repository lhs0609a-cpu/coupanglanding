import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import crypto from 'crypto';

function generateSignature(timestamp: number, method: string, path: string, secretKey: string): string {
  const message = `${timestamp}.${method}.${path}`;
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

function calculateTrendScore(pcQcCnt: number, mobileQcCnt: number): number {
  const total = pcQcCnt + mobileQcCnt;
  if (total >= 100000) return 95;
  if (total >= 50000) return 85;
  if (total >= 10000) return 75;
  if (total >= 5000) return 65;
  if (total >= 1000) return 55;
  if (total >= 500) return 45;
  if (total >= 100) return 35;
  return 20;
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
              monthlyPcQcCnt: typeof match.monthlyPcQcCnt === 'number' ? match.monthlyPcQcCnt : 0,
              monthlyMobileQcCnt: typeof match.monthlyMobileQcCnt === 'number' ? match.monthlyMobileQcCnt : 0,
              monthlyAvePcClkCnt: typeof match.monthlyAvePcClkCnt === 'number' ? match.monthlyAvePcClkCnt : 0,
              monthlyAveMobileClkCnt: typeof match.monthlyAveMobileClkCnt === 'number' ? match.monthlyAveMobileClkCnt : 0,
              compIdx: match.compIdx || '낮음',
              plAvgDepth: typeof match.plAvgDepth === 'number' ? match.plAvgDepth : 0,
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

    return NextResponse.json({
      success: true,
      total: keywords.length,
      updated: updatedCount,
      errors: errorCount,
    });
  } catch (err) {
    console.error('naver-bulk error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
