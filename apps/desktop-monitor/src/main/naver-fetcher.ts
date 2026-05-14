// ============================================================
// 네이버 페이지 fetch + 옵션/가격 파싱
//
// 사용자 PC에서 직접 호출 — 가정 IP 라 차단 거의 0%.
// 동일 로직은 src/lib/megaload/services/stock-monitor-engine.ts (서버) 와 호환.
// ============================================================

import { net } from 'electron';

export interface FetchResult {
  status: 'in_stock' | 'sold_out' | 'unknown' | 'removed' | 'error';
  matchedPattern?: string;
  errorClass?: 'transient' | 'naver';
  options?: { name: string; soldOut: boolean; price?: number }[];
  mainPrice?: number;
}

const REMOVED_PATTERNS = [
  /상품을\s*찾을\s*수\s*없|판매가\s*종료|deleted|removed|<title>404/i,
];

const SOLDOUT_PATTERNS = [
  /일시\s*품절|품절\s*상태|sold[\s-]?out|재고\s*없|재고가\s*없/i,
];

const IN_STOCK_PATTERNS = [
  /구매하기|장바구니|orderQty|stockQuantity"\s*:\s*[1-9]/i,
];

/** Electron net 모듈 사용 — Chromium 네트워크 스택 (TLS fingerprint 사람 모방) */
async function fetchWithElectron(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = net.request({
      method: 'GET',
      url,
      redirect: 'follow',
    });
    req.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    req.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8');
    req.setHeader('Accept-Language', 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7');

    let body = '';
    let status = 0;
    const timeout = setTimeout(() => {
      try { req.abort(); } catch { /* skip */ }
      reject(new Error('timeout'));
    }, 25000);

    req.on('response', (response) => {
      status = response.statusCode;
      response.on('data', (chunk) => {
        if (body.length < 500_000) body += chunk.toString('utf-8');
      });
      response.on('end', () => {
        clearTimeout(timeout);
        resolve({ status, body });
      });
    });
    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    req.end();
  });
}

/** 네이버 스마트스토어 옵션 파싱 (서버 stock-monitor-engine 과 동일 로직) */
function parseNaverOptions(html: string): { name: string; soldOut: boolean; price?: number }[] | null {
  const preloadMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/);
  if (!preloadMatch) return null;
  try {
    const optCombMatch = preloadMatch[1].match(/"optionCombinations"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
    if (!optCombMatch) return null;
    const combos = JSON.parse(optCombMatch[1]) as {
      optionName1?: string; optionName2?: string;
      stockQuantity?: number; usable?: boolean;
      price?: number; priceRelative?: number;
    }[];
    if (combos.length === 0) return null;
    return combos.map(c => {
      const name = [c.optionName1, c.optionName2].filter(Boolean).join(' / ');
      const soldOut = (c.stockQuantity !== undefined && c.stockQuantity <= 0) || c.usable === false;
      const price = c.price ?? c.priceRelative ?? undefined;
      return { name, soldOut, price };
    });
  } catch { return null; }
}

/** 네이버 메인 가격 파싱 */
function parseNaverMainPrice(html: string): number | undefined {
  // dispDiscountedSalePrice 우선
  const dispMatch = html.match(/"dispDiscountedSalePrice"\s*:\s*(\d+)/);
  if (dispMatch) return parseInt(dispMatch[1], 10);
  const saleMatch = html.match(/"salePrice"\s*:\s*(\d+)/);
  if (saleMatch) return parseInt(saleMatch[1], 10);
  return undefined;
}

/** 메인 fetch + 분류 함수 */
export async function fetchNaverProduct(url: string): Promise<FetchResult> {
  try {
    const { status, body } = await fetchWithElectron(url);

    if (status === 404 || status === 410) {
      return { status: 'removed', matchedPattern: `HTTP ${status}` };
    }
    if (status === 429) {
      return { status: 'error', matchedPattern: 'HTTP 429 (속도제한)', errorClass: 'transient' };
    }
    if (status === 403) {
      return { status: 'error', matchedPattern: 'HTTP 403 (접근 차단)', errorClass: 'naver' };
    }
    if (status < 200 || status >= 400) {
      return { status: 'error', matchedPattern: `HTTP ${status}`, errorClass: 'naver' };
    }

    for (const p of REMOVED_PATTERNS) {
      if (p.test(body)) return { status: 'removed', matchedPattern: p.source };
    }

    let options: FetchResult['options'];
    let mainPrice: number | undefined;
    if (/smartstore\.naver|shop\.naver/i.test(url)) {
      const parsed = parseNaverOptions(body);
      if (parsed) options = parsed;
      mainPrice = parseNaverMainPrice(body);
    }

    let soldOut: string | null = null;
    for (const p of SOLDOUT_PATTERNS) {
      if (p.test(body)) { soldOut = p.source; break; }
    }
    let inStock = false;
    for (const p of IN_STOCK_PATTERNS) {
      if (p.test(body)) { inStock = true; break; }
    }

    if (soldOut && !inStock) return { status: 'sold_out', matchedPattern: soldOut, options, mainPrice };
    if (inStock) return { status: 'in_stock', options, mainPrice };
    return { status: 'unknown', options, mainPrice };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return {
      status: 'error',
      matchedPattern: msg.slice(0, 80),
      errorClass: msg === 'timeout' ? 'transient' : 'naver',
    };
  }
}
