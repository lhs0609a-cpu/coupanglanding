import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { PERIOD_OPTIONS, getDateRange, transformDatalabResponse } from '@/lib/utils/trend-chart';
import type { PeriodOption } from '@/lib/utils/trend-chart';
import type { TrendDataPoint } from '@/lib/supabase/types';

/**
 * Naver DataLab Shopping Insight API 프록시 + Supabase 캐시
 *
 * POST /api/trends/datalab
 * Body: { keyword: string, period: '1m' | '3m' | '6m' | '1y', categoryId?: string }
 *
 * Returns: { data: TrendDataPoint[], cached: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { keyword, period = '3m', categoryId } = body as {
      keyword: string;
      period?: PeriodOption;
      categoryId?: string;
    };

    if (!keyword?.trim()) {
      return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 });
    }

    if (!PERIOD_OPTIONS[period]) {
      return NextResponse.json({ error: '잘못된 기간입니다.' }, { status: 400 });
    }

    const config = PERIOD_OPTIONS[period];
    const { startDate, endDate } = getDateRange(period);

    // 1. 캐시 확인
    const serviceClient = await createServiceClient();
    const { data: cached } = await serviceClient
      .from('keyword_trend_history')
      .select('*')
      .eq('keyword', keyword.trim())
      .eq('period_type', config.periodType)
      .eq('start_date', startDate)
      .eq('end_date', endDate)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (cached) {
      return NextResponse.json({
        data: cached.data_points as TrendDataPoint[],
        cached: true,
        period: { startDate, endDate, type: config.periodType },
      });
    }

    // 2. DataLab API 호출
    const clientId = process.env.NAVER_DATALAB_CLIENT_ID;
    const clientSecret = process.env.NAVER_DATALAB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: '네이버 DataLab API 키가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // DataLab Shopping Insight 카테고리별 트렌드
    const timeUnit = config.periodType === 'day' ? 'date' : config.periodType === 'week' ? 'week' : 'month';

    const datalabBody = {
      startDate,
      endDate,
      timeUnit,
      category: categoryId || '',
      keyword: [
        { name: keyword.trim(), param: [keyword.trim()] },
      ],
    };

    const response = await fetch('https://openapi.naver.com/v1/datalab/shopping', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      body: JSON.stringify(datalabBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('DataLab API error:', response.status, errText);
      return NextResponse.json(
        { error: `DataLab API 오류: ${response.status}` },
        { status: 502 }
      );
    }

    const result = await response.json();

    // DataLab 응답 구조: { results: [{ title, keyword, data: [{ period, ratio }] }] }
    const rawData = result.results?.[0]?.data || [];
    const dataPoints = transformDatalabResponse(rawData);

    // 3. 캐시 저장 (upsert)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + config.cacheTTLHours);

    await serviceClient
      .from('keyword_trend_history')
      .upsert(
        {
          keyword: keyword.trim(),
          period_type: config.periodType,
          start_date: startDate,
          end_date: endDate,
          data_points: dataPoints,
          fetched_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        },
        { onConflict: 'keyword,period_type,start_date,end_date' }
      );

    return NextResponse.json({
      data: dataPoints,
      cached: false,
      period: { startDate, endDate, type: config.periodType },
    });
  } catch (err) {
    console.error('DataLab proxy error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
