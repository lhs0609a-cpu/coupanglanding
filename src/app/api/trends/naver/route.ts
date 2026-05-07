import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import { parseNaverCount, calculateTrendScore } from '@/lib/utils/trend-collect';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


function generateSignature(timestamp: number, method: string, path: string, secretKey: string): string {
  const message = `${timestamp}.${method}.${path}`;
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

export async function POST(request: NextRequest) {
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

    if (!profile?.role || !['admin', 'pt_user', 'partner'].includes(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const isAdmin = profile.role === 'admin';

    const body = await request.json();
    const { keywordId, keyword } = body;

    if (!keyword) {
      return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 });
    }

    const customerId = process.env.NAVER_AD_CUSTOMER_ID;
    const accessKey = process.env.NAVER_AD_ACCESS_KEY;
    const secretKey = process.env.NAVER_AD_SECRET_KEY;

    if (!customerId || !accessKey || !secretKey) {
      return NextResponse.json({ error: '네이버 광고 API 키가 설정되지 않았습니다.' }, { status: 500 });
    }

    const timestamp = Date.now();
    const method = 'GET';
    const path = '/keywordstool';
    const signature = generateSignature(timestamp, method, path, secretKey);

    const params = new URLSearchParams({
      hintKeywords: keyword,
      showDetail: '1',
    });

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
      const errText = await response.text();
      console.error('Naver API error:', response.status, errText);
      void logSystemError({ source: 'trends/naver', error: errText }).catch(() => {});
      return NextResponse.json({ error: `네이버 API 오류: ${response.status}` }, { status: 502 });
    }

    const result = await response.json();
    const keywordList = result.keywordList || [];

    // 입력 키워드와 정확히 일치하는 항목 찾기
    const exactMatch = keywordList.find(
      (item: Record<string, unknown>) => (item.relKeyword as string)?.toLowerCase() === keyword.toLowerCase()
    );

    const matchData = exactMatch || keywordList[0];

    if (!matchData) {
      return NextResponse.json({ error: '검색 결과가 없습니다.' }, { status: 404 });
    }

    // API 응답 디버깅 (raw 값 확인용)
    console.log(`[naver] "${keyword}" raw response:`, {
      monthlyPcQcCnt: matchData.monthlyPcQcCnt,
      monthlyMobileQcCnt: matchData.monthlyMobileQcCnt,
      typeofPc: typeof matchData.monthlyPcQcCnt,
      typeofMobile: typeof matchData.monthlyMobileQcCnt,
    });

    const naverData = {
      relKeyword: matchData.relKeyword,
      monthlyPcQcCnt: parseNaverCount(matchData.monthlyPcQcCnt),
      monthlyMobileQcCnt: parseNaverCount(matchData.monthlyMobileQcCnt),
      monthlyAvePcClkCnt: parseNaverCount(matchData.monthlyAvePcClkCnt),
      monthlyAveMobileClkCnt: parseNaverCount(matchData.monthlyAveMobileClkCnt),
      compIdx: matchData.compIdx || '낮음',
      plAvgDepth: parseNaverCount(matchData.plAvgDepth),
    };

    const trendScore = calculateTrendScore(naverData.monthlyPcQcCnt, naverData.monthlyMobileQcCnt);

    // DB 업데이트 (관리자만)
    if (keywordId && isAdmin) {
      const serviceClient = await createServiceClient();
      await serviceClient
        .from('trending_keywords')
        .update({
          naver_trend_data: naverData,
          naver_fetched_at: new Date().toISOString(),
          trend_score: trendScore,
          source: 'naver',
          updated_at: new Date().toISOString(),
        })
        .eq('id', keywordId);
    }

    // 연관 키워드 (최대 20개, 전체 데이터 포함)
    const relatedKeywords = keywordList
      .filter((item: Record<string, unknown>) => (item.relKeyword as string)?.toLowerCase() !== keyword.toLowerCase())
      .slice(0, 20)
      .map((item: Record<string, unknown>) => ({
        relKeyword: item.relKeyword,
        monthlyPcQcCnt: parseNaverCount(item.monthlyPcQcCnt),
        monthlyMobileQcCnt: parseNaverCount(item.monthlyMobileQcCnt),
        monthlyAvePcClkCnt: parseNaverCount(item.monthlyAvePcClkCnt),
        monthlyAveMobileClkCnt: parseNaverCount(item.monthlyAveMobileClkCnt),
        compIdx: item.compIdx || '낮음',
        plAvgDepth: parseNaverCount(item.plAvgDepth),
      }));

    return NextResponse.json({
      data: naverData,
      trendScore,
      relatedKeywords,
    });
  } catch (err) {
    console.error('naver trend error:', err);
    void logSystemError({ source: 'trends/naver', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
