// 가격 추출 진단 — 특정 URL 의 HTML 을 Fly 프록시 경유로 fetch 하고
// parseNaverMainPrice 의 4단계 폴백이 어디서 매칭되는지/모두 실패하는지 상세 리포트.
//
// 사용: GET /api/megaload/stock-monitor/probe-price?url=https://smartstore.naver.com/...
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseNaverMainPriceForDiag, type PriceParseTrace } from '@/lib/megaload/services/stock-monitor-engine';

export const maxDuration = 30;

const NAVER_PROXY_URL = process.env.COUPANG_PROXY_URL || '';
const NAVER_PROXY_SECRET = process.env.COUPANG_PROXY_SECRET || process.env.PROXY_SECRET || '';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'auth required' }, { status: 401 });

  const url = request.nextUrl.searchParams.get('url')?.trim();
  if (!url) return NextResponse.json({ error: 'url 파라미터 필요' }, { status: 400 });
  if (!/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: 'http(s):// 로 시작해야 함' }, { status: 400 });
  }

  let statusCode = 0;
  let html = '';
  let fetchMethod: 'proxy' | 'direct' = 'direct';
  let fetchError: string | null = null;

  // Fly 프록시 우선
  if (NAVER_PROXY_URL && /smartstore\.naver|shop\.naver|brand\.naver/i.test(url)) {
    try {
      const base = NAVER_PROXY_URL.replace(/\/proxy\/?$/, '');
      const res = await fetch(`${base}/naver-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Proxy-Secret': NAVER_PROXY_SECRET },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const data = await res.json() as { statusCode: number; html: string };
        statusCode = data.statusCode;
        html = data.html || '';
        fetchMethod = 'proxy';
      } else {
        fetchError = `proxy ${res.status}`;
      }
    } catch (e) {
      fetchError = `proxy exception: ${e instanceof Error ? e.message : 'unknown'}`;
    }
  }

  if (!html) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
        },
      });
      statusCode = res.status;
      html = (await res.text()).slice(0, 500_000);
    } catch (e) {
      fetchError = `direct exception: ${e instanceof Error ? e.message : 'unknown'}`;
    }
  }

  if (!html) {
    return NextResponse.json({
      error: 'HTML fetch 실패',
      statusCode,
      fetchMethod,
      fetchError,
    }, { status: 502 });
  }

  // parser 진단
  const trace: PriceParseTrace = { method: 'none', value: null, attempted: [] };
  const price = parseNaverMainPriceForDiag(html, trace);

  // 추가 컨텍스트
  const ctx = {
    htmlLen: html.length,
    hasPreloadedState: /__PRELOADED_STATE__/.test(html),
    hasNextData: /__NEXT_DATA__/.test(html),
    hasPriceKeyword: /salePrice|상품\s*가격|product:price/i.test(html),
    hasJsonLd: /"@type"\s*:\s*"Product"/.test(html),
    hasOgPrice: /<meta\s+property="product:price:amount"/i.test(html),
    // 가격으로 추정되는 숫자 패턴들 (디버깅용 샘플 3개)
    sampleDigitGroups: Array.from(html.matchAll(/[\d,]{4,15}/g)).slice(0, 20).map(m => m[0]),
    // JSON 필드 미리 보기
    salePriceJsonSnippet: html.match(/"salePrice"\s*:[^,}]{0,30}/)?.[0] || null,
    dispDiscountedJsonSnippet: html.match(/"dispDiscountedSalePrice"\s*:[^,}]{0,30}/)?.[0] || null,
  };

  return NextResponse.json({
    url,
    statusCode,
    fetchMethod,
    fetchError,
    parsedPrice: price,
    parseTrace: trace,
    context: ctx,
  });
}
