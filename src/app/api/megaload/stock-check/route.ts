import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ─── 품절 감지 패턴 (플랫폼별) ──────────────────────────────
// HTML 텍스트에서 매칭하므로 대소문자 무시
const SOLDOUT_PATTERNS = [
  // 한국 공통
  /품절/,
  /일시\s*품절/,
  /매진/,
  /구매\s*불가/,
  /판매\s*종료/,
  /판매\s*중지/,
  /재입고\s*알림/,
  /soldout/i,
  /sold[\s-]*out/i,
  /out[\s-]*of[\s-]*stock/i,
  // 쿠팡 특화
  /class="[^"]*sold[\s-]?out[^"]*"/i,
  /class="[^"]*oos[^"]*"/i,
  /prod-not-find/i,     // 쿠팡 상품 미존재 페이지
  // 네이버
  /SOLD_OUT/,
  /"soldOut"\s*:\s*true/i,
  /not_sale/i,
  /data-soldout="?true"?/i,
  // G마켓/옥션
  /ItemNoStock/i,
  /item_soldout/i,
  // 11번가
  /btnSoldOut/i,
];

// 상품 삭제/미존재 패턴
const REMOVED_PATTERNS = [
  /존재하지\s*않는\s*상품/,
  /삭제된\s*상품/,
  /페이지를?\s*찾을\s*수\s*없/,
  /This item is no longer available/i,
  /요청하신\s*페이지를?\s*찾을\s*수/,
  /더\s*이상\s*판매하지\s*않/,
];

// 정상 판매 중 긍정 패턴 (품절 오탐 방지)
const IN_STOCK_PATTERNS = [
  /"inStock"\s*:\s*true/i,
  /availability.*InStock/i,
  /add[\s-]?to[\s-]?cart/i,
  /장바구니/,
  /바로\s*구매/,
];

export type StockStatus = 'in_stock' | 'sold_out' | 'removed' | 'unknown' | 'error';

export interface OptionStockStatus {
  optionName: string;
  status: 'in_stock' | 'sold_out';
}

export interface StockCheckResult {
  url: string;
  status: StockStatus;
  statusLabel: string;
  httpStatus?: number;
  matchedPattern?: string;
  checkedAt: string;
  // 옵션별 품절 정보
  options?: OptionStockStatus[];
  isOptionProduct?: boolean;
  soldOutOptionCount?: number;
  totalOptionCount?: number;
}

interface StockCheckBatchRequest {
  urls: { uid: string; url: string }[];
}

interface StockCheckBatchResponse {
  results: Record<string, StockCheckResult>;
  stats: { total: number; inStock: number; soldOut: number; removed: number; unknown: number; error: number };
}

const STATUS_LABELS: Record<StockStatus, string> = {
  in_stock: '판매중',
  sold_out: '품절',
  removed: '삭제됨',
  unknown: '확인불가',
  error: '접속오류',
};

// Vercel 데이터센터 IP는 네이버가 403 차단하므로 Fly.io 고정 IP 프록시 경유
// Fly.io 측의 PROXY_SECRET은 COUPANG_PROXY_SECRET과 동일 값 — coupang-api-client와 같은 fallback 규칙 사용
const NAVER_PROXY_URL = process.env.COUPANG_PROXY_URL || '';
const NAVER_PROXY_SECRET = process.env.COUPANG_PROXY_SECRET || process.env.PROXY_SECRET || '';
const NAVER_URL_RE = /smartstore\.naver|shop\.naver|brand\.naver|shopping\.naver/;

// SSRF 방지
function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('10.') ||
        host.startsWith('192.168.') || host.startsWith('169.254.') || host === '0.0.0.0') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * 네이버 스마트스토어 HTML에서 옵션별 품절 상태 파싱
 * 3가지 패턴을 순서대로 시도:
 *  1. __PRELOADED_STATE__ 내 optionCombinations (SSR JSON)
 *  2. JSON-LD offers[].availability
 *  3. data-shp-contents-id 속성 + (품절) 텍스트
 */
function parseNaverOptions(html: string): OptionStockStatus[] | null {
  // 패턴 1: window.__PRELOADED_STATE__ → optionCombinations
  const preloadMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/);
  if (preloadMatch) {
    try {
      // JSON 안에 optionCombinations 배열 추출
      const optCombMatch = preloadMatch[1].match(/"optionCombinations"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
      if (optCombMatch) {
        const combos = JSON.parse(optCombMatch[1]) as { optionName1?: string; optionName2?: string; stockQuantity?: number; usable?: boolean }[];
        if (combos.length > 0) {
          return combos.map(c => {
            const name = [c.optionName1, c.optionName2].filter(Boolean).join(' / ');
            const isSoldOut = (c.stockQuantity !== undefined && c.stockQuantity <= 0) || c.usable === false;
            return { optionName: name || '기본', status: isSoldOut ? 'sold_out' : 'in_stock' };
          });
        }
      }
    } catch { /* JSON 파싱 실패 — 다음 패턴으로 */ }
  }

  // 패턴 2: JSON-LD offers[].availability
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatch) {
    for (const script of jsonLdMatch) {
      try {
        const jsonStr = script.replace(/<\/?script[^>]*>/gi, '');
        const ld = JSON.parse(jsonStr) as { offers?: { name?: string; availability?: string }[] | { name?: string; availability?: string } };
        if (ld.offers && Array.isArray(ld.offers) && ld.offers.length > 1) {
          return ld.offers.map(offer => ({
            optionName: offer.name || '기본',
            status: offer.availability?.includes('OutOfStock') ? 'sold_out' : 'in_stock',
          }));
        }
      } catch { /* continue */ }
    }
  }

  // 패턴 3: 드롭다운 옵션에서 (품절) 텍스트
  const optionPattern = /data-shp-contents-id="[^"]*"[^>]*>([^<]+)</g;
  const options: OptionStockStatus[] = [];
  let match: RegExpExecArray | null;
  while ((match = optionPattern.exec(html)) !== null) {
    const text = match[1].trim();
    if (!text) continue;
    const isSoldOut = /\(품절\)|품절|sold\s*out/i.test(text);
    const cleanName = text.replace(/\s*\(품절\)\s*/g, '').trim();
    options.push({ optionName: cleanName, status: isSoldOut ? 'sold_out' : 'in_stock' });
  }
  if (options.length > 0) return options;

  return null;
}

async function checkSingleUrl(url: string): Promise<StockCheckResult> {
  const checkedAt = new Date().toISOString();

  if (!validateUrl(url)) {
    return { url, status: 'error', statusLabel: STATUS_LABELS.error, checkedAt, matchedPattern: 'invalid_url' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    let httpStatus: number;
    let sample: string;

    const isNaver = NAVER_URL_RE.test(url);
    if (isNaver && NAVER_PROXY_URL) {
      // Naver는 Vercel IP를 403 차단하므로 Fly.io 프록시로 우회
      const proxyBase = NAVER_PROXY_URL.replace(/\/proxy\/?$/, '');
      const proxyRes = await fetch(`${proxyBase}/naver-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Proxy-Secret': NAVER_PROXY_SECRET },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!proxyRes.ok) {
        const errData = await proxyRes.json().catch(() => ({}));
        return {
          url, status: 'error', statusLabel: STATUS_LABELS.error, checkedAt,
          matchedPattern: `proxy ${proxyRes.status}: ${(errData as Record<string, string>).error || ''}`.trim(),
        };
      }
      const data = await proxyRes.json() as { statusCode: number; html: string };
      httpStatus = data.statusCode;
      sample = (data.html || '').slice(0, 500_000);
    } else {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        redirect: 'follow',
      });
      clearTimeout(timeout);
      httpStatus = res.status;
      const html = await res.text();
      sample = html.slice(0, 500_000);
    }

    // HTTP 에러 판정 (프록시/직접 공통)
    if (httpStatus === 404 || httpStatus === 410) {
      return { url, status: 'removed', statusLabel: STATUS_LABELS.removed, httpStatus, checkedAt, matchedPattern: `HTTP ${httpStatus}` };
    }
    if (httpStatus < 200 || httpStatus >= 400) {
      return { url, status: 'error', statusLabel: STATUS_LABELS.error, httpStatus, checkedAt, matchedPattern: `HTTP ${httpStatus}` };
    }

    // 1차: 삭제/미존재 체크
    for (const pattern of REMOVED_PATTERNS) {
      if (pattern.test(sample)) {
        return { url, status: 'removed', statusLabel: STATUS_LABELS.removed, httpStatus, checkedAt, matchedPattern: pattern.source };
      }
    }

    // 옵션별 품절 파싱 (네이버 스마트스토어) — isNaver는 위에서 이미 판정
    let options: OptionStockStatus[] | null = null;
    if (isNaver) {
      options = parseNaverOptions(sample);
    }

    // 2차: 품절 체크
    let soldOutMatch: string | null = null;
    for (const pattern of SOLDOUT_PATTERNS) {
      if (pattern.test(sample)) {
        soldOutMatch = pattern.source;
        break;
      }
    }

    // 3차: 정상 판매 긍정 패턴 (품절 오탐 방지)
    let inStockMatch = false;
    for (const pattern of IN_STOCK_PATTERNS) {
      if (pattern.test(sample)) {
        inStockMatch = true;
        break;
      }
    }

    // 옵션 정보 빌드
    const optionInfo: Partial<StockCheckResult> = {};
    if (options && options.length > 0) {
      const soldOutOpts = options.filter(o => o.status === 'sold_out');
      optionInfo.options = options;
      optionInfo.isOptionProduct = true;
      optionInfo.soldOutOptionCount = soldOutOpts.length;
      optionInfo.totalOptionCount = options.length;

      // 전체 옵션이 품절이면 상품 전체 품절로 판단
      if (soldOutOpts.length === options.length) {
        return {
          url, status: 'sold_out', statusLabel: STATUS_LABELS.sold_out, httpStatus, checkedAt,
          matchedPattern: 'all_options_sold_out',
          ...optionInfo,
        };
      }
    }

    // 판단 로직: 품절 패턴 매치 + 정상 패턴 미매치 → 품절
    if (soldOutMatch && !inStockMatch) {
      return {
        url, status: 'sold_out', statusLabel: STATUS_LABELS.sold_out, httpStatus, checkedAt,
        matchedPattern: soldOutMatch,
        ...optionInfo,
      };
    }

    // 정상 판매 패턴 매치 → 판매중
    if (inStockMatch) {
      return {
        url, status: 'in_stock', statusLabel: STATUS_LABELS.in_stock, httpStatus, checkedAt,
        ...optionInfo,
      };
    }

    // 둘 다 없으면 확인불가
    return { url, status: 'unknown', statusLabel: STATUS_LABELS.unknown, httpStatus, checkedAt, ...optionInfo };

  } catch (err) {
    clearTimeout(timeout);
    const isAbort = (err as Error).name === 'AbortError';
    return {
      url,
      status: 'error',
      statusLabel: STATUS_LABELS.error,
      checkedAt,
      matchedPattern: isAbort ? 'timeout' : (err as Error).message?.slice(0, 100),
    };
  }
}

/**
 * POST /api/megaload/stock-check
 * 배치 품절 체크 — 최대 50개 URL 동시 체크
 */
export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json() as StockCheckBatchRequest;
    const { urls } = body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: 'urls 배열이 필요합니다.' }, { status: 400 });
    }

    if (urls.length > 50) {
      return NextResponse.json({ error: '한 번에 최대 50개까지 체크 가능합니다.' }, { status: 400 });
    }

    // 5개씩 병렬 처리 (서버 부하 방지)
    const CONCURRENCY = 5;
    const results: Record<string, StockCheckResult> = {};

    for (let i = 0; i < urls.length; i += CONCURRENCY) {
      const batch = urls.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(({ uid, url }) =>
          checkSingleUrl(url).then(result => ({ uid, result })),
        ),
      );
      for (const { uid, result } of batchResults) {
        results[uid] = result;
      }
    }

    // 통계 계산
    const stats = { total: urls.length, inStock: 0, soldOut: 0, removed: 0, unknown: 0, error: 0 };
    for (const r of Object.values(results)) {
      switch (r.status) {
        case 'in_stock': stats.inStock++; break;
        case 'sold_out': stats.soldOut++; break;
        case 'removed': stats.removed++; break;
        case 'unknown': stats.unknown++; break;
        case 'error': stats.error++; break;
      }
    }

    return NextResponse.json({ results, stats } satisfies StockCheckBatchResponse);

  } catch (err) {
    console.error('stock-check error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
