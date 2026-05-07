import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;


/**
 * GET /api/naver-shopping/google-sheets-proxy?sheetId=...&gid=0
 * Google Sheets CSV 프록시 (CORS 우회)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sheetId = searchParams.get('sheetId');
    const gid = searchParams.get('gid') || '0';

    if (!sheetId) {
      return NextResponse.json({ error: 'sheetId 파라미터가 필요합니다.' }, { status: 400 });
    }

    // sheetId 형식 검증 (영숫자, 하이픈, 언더스코어만 허용)
    if (!/^[a-zA-Z0-9_-]+$/.test(sheetId)) {
      return NextResponse.json({ error: '유효하지 않은 sheetId 형식입니다.' }, { status: 400 });
    }

    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(csvUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        return NextResponse.json(
          { error: `Google Sheets 요청 실패 (${res.status})` },
          { status: res.status },
        );
      }

      const csv = await res.text();
      return new NextResponse(csv, {
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      });
    } catch (err) {
      clearTimeout(timeout);
      if ((err as Error).name === 'AbortError') {
        return NextResponse.json({ error: '요청 시간이 초과되었습니다.' }, { status: 504 });
      }
      throw err;
    }
  } catch (err) {
    console.error('google-sheets-proxy error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
