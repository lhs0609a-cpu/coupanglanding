import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


/**
 * GET /api/naver-shopping/extract-product-image?url=...
 * URL에서 상품 이미지 스크래핑 (og:image)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return NextResponse.json({ error: 'url 파라미터가 필요합니다.' }, { status: 400 });
    }

    // SSRF 방지: https만 허용, 내부 IP 차단
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== 'https:') {
        return NextResponse.json({ error: 'https URL만 허용됩니다.' }, { status: 400 });
      }
      const host = parsed.hostname;
      if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.') || host === '0.0.0.0') {
        return NextResponse.json({ error: '내부 네트워크 URL은 허용되지 않습니다.' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: '유효하지 않은 URL입니다.' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return NextResponse.json({ error: `페이지 요청 실패 (${res.status})` }, { status: 400 });
      }

      const html = await res.text();

      // Try og:image
      const ogMatch = html.match(/<meta\s+(?:property|name)="og:image"\s+content="([^"]+)"/i)
        || html.match(/<meta\s+content="([^"]+)"\s+(?:property|name)="og:image"/i);
      if (ogMatch) {
        return NextResponse.json({ image: ogMatch[1].trim() });
      }

      return NextResponse.json({ image: '' });
    } catch (err) {
      clearTimeout(timeout);
      if ((err as Error).name === 'AbortError') {
        return NextResponse.json({ error: '요청 시간 초과' }, { status: 504 });
      }
      throw err;
    }
  } catch (err) {
    console.error('extract-product-image error:', err);
    void logSystemError({ source: 'naver-shopping/extract-product-image', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
