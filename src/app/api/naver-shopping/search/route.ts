import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;


/**
 * GET /api/naver-shopping/search?query=...&display=30&sort=sim
 * 네이버 쇼핑 검색 프록시
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const display = searchParams.get('display') || '30';
    const sort = searchParams.get('sort') || 'sim';

    if (!query) {
      return NextResponse.json({ error: 'query 파라미터가 필요합니다.' }, { status: 400 });
    }

    const clientId = process.env.NAVER_DATALAB_CLIENT_ID;
    const clientSecret = process.env.NAVER_DATALAB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: '네이버 API 키가 설정되지 않았습니다.' }, { status: 500 });
    }

    const params = new URLSearchParams({ query, display, sort });
    const res = await fetch(
      `https://openapi.naver.com/v1/search/shop.json?${params.toString()}`,
      {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      },
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `네이버 API 요청 실패 (${res.status}): ${text}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('naver-shopping search error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
