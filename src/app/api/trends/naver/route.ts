import { NextRequest, NextResponse } from 'next/server';
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

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

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

    const naverData = {
      relKeyword: matchData.relKeyword,
      monthlyPcQcCnt: typeof matchData.monthlyPcQcCnt === 'number' ? matchData.monthlyPcQcCnt : 0,
      monthlyMobileQcCnt: typeof matchData.monthlyMobileQcCnt === 'number' ? matchData.monthlyMobileQcCnt : 0,
      monthlyAvePcClkCnt: typeof matchData.monthlyAvePcClkCnt === 'number' ? matchData.monthlyAvePcClkCnt : 0,
      monthlyAveMobileClkCnt: typeof matchData.monthlyAveMobileClkCnt === 'number' ? matchData.monthlyAveMobileClkCnt : 0,
      compIdx: matchData.compIdx || '낮음',
      plAvgDepth: typeof matchData.plAvgDepth === 'number' ? matchData.plAvgDepth : 0,
    };

    const trendScore = calculateTrendScore(naverData.monthlyPcQcCnt, naverData.monthlyMobileQcCnt);

    // DB 업데이트
    if (keywordId) {
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

    // 연관 키워드 (최대 10개)
    const relatedKeywords = keywordList
      .filter((item: Record<string, unknown>) => (item.relKeyword as string)?.toLowerCase() !== keyword.toLowerCase())
      .slice(0, 10)
      .map((item: Record<string, unknown>) => ({
        relKeyword: item.relKeyword,
        monthlyPcQcCnt: typeof item.monthlyPcQcCnt === 'number' ? item.monthlyPcQcCnt : 0,
        monthlyMobileQcCnt: typeof item.monthlyMobileQcCnt === 'number' ? item.monthlyMobileQcCnt : 0,
        compIdx: item.compIdx || '낮음',
      }));

    return NextResponse.json({
      data: naverData,
      trendScore,
      relatedKeywords,
    });
  } catch (err) {
    console.error('naver trend error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
