// 네이버 페이지 fetch + 상태/가격 파싱 (Electron net — 가정 IP라 차단 거의 0%).
// apps/desktop-monitor/naver-fetcher.ts 포팅(권위 __PRELOADED_STATE__ 파서 포함).
import { net } from 'electron';

const REMOVED_PATTERNS = [/상품을\s*찾을\s*수\s*없|판매가\s*종료|deleted|removed|<title>404/i];
const SOLDOUT_PATTERNS = [/일시\s*품절|품절\s*상태|sold[\s-]?out|재고\s*없|재고가\s*없/i];
const IN_STOCK_PATTERNS = [/구매하기|장바구니|orderQty|stockQuantity"\s*:\s*[1-9]/i];

function fetchWithElectron(url) {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'GET', url, redirect: 'follow' });
    req.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    req.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    req.setHeader('Accept-Language', 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7');
    let body = ''; let status = 0;
    const timeout = setTimeout(() => { try { req.abort(); } catch { /* */ } reject(new Error('timeout')); }, 25000);
    req.on('response', (response) => {
      status = response.statusCode;
      response.on('data', (chunk) => { if (body.length < 500_000) body += chunk.toString('utf-8'); });
      response.on('end', () => { clearTimeout(timeout); resolve({ status, body }); });
    });
    req.on('error', (err) => { clearTimeout(timeout); reject(err); });
    req.end();
  });
}

function parseNaverOptions(html) {
  const m = html.match(/"optionCombinations"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
  if (!m) return null;
  try {
    const combos = JSON.parse(m[1]);
    if (!combos.length) return null;
    return combos.map((c) => ({
      name: [c.optionName1, c.optionName2].filter(Boolean).join(' / '),
      soldOut: (c.stockQuantity !== undefined && c.stockQuantity <= 0) || c.usable === false,
      price: c.price ?? c.priceRelative ?? undefined,
    }));
  } catch { return null; }
}

// __PRELOADED_STATE__ 권위 상태 (난독화 CSS/텍스트 비의존)
function parseNaverState(html) {
  const disp = html.match(/"channelProductDisplayStatusType"\s*:\s*"([A-Z_]+)"/)?.[1];
  if (disp && disp !== 'ON') return 'removed';
  const st = html.match(/"productStatusType"\s*:\s*"([A-Z_]+)"/)?.[1];
  if (!st) return undefined;
  if (st === 'SALE') return 'in_stock';
  if (st === 'OUTOFSTOCK' || st === 'EXHAUSTION') return 'sold_out';
  return 'removed';
}

function parseNaverMainPrice(html) {
  const fields = ['dispDiscountedSalePrice', 'salePrice', 'dispSalePrice', 'dispPrice', 'productSalePrice', 'productPrice', 'discountedSalePrice', 'discountedPrice', 'price'];
  for (const f of fields) {
    const m = html.match(new RegExp(`"${f}"\\s*:\\s*"?(\\d{2,10})"?`));
    if (m) { const v = parseInt(m[1], 10); if (v > 0) return v; }
  }
  const ld = html.match(/"@type"\s*:\s*"Product"[\s\S]*?"price"\s*:\s*"?(\d{2,10})/);
  if (ld) { const v = parseInt(ld[1], 10); if (v > 0) return v; }
  return undefined;
}

/** @returns {Promise<{status,matchedPattern?,errorClass?,options?,mainPrice?}>} */
export async function fetchNaverProduct(url) {
  try {
    const { status, body } = await fetchWithElectron(url);
    if (status === 404 || status === 410) return { status: 'removed', matchedPattern: `HTTP ${status}` };
    if (status === 429) return { status: 'error', matchedPattern: 'HTTP 429 (속도제한)', errorClass: 'transient' };
    if (status === 403) return { status: 'error', matchedPattern: 'HTTP 403 (접근 차단)', errorClass: 'naver' };
    if (status < 200 || status >= 400) return { status: 'error', matchedPattern: `HTTP ${status}`, errorClass: 'naver' };

    for (const p of REMOVED_PATTERNS) if (p.test(body)) return { status: 'removed', matchedPattern: p.source };

    let options, mainPrice, state;
    if (/smartstore\.naver|shop\.naver/i.test(url)) {
      options = parseNaverOptions(body) || undefined;
      mainPrice = parseNaverMainPrice(body);
      state = parseNaverState(body);
    }
    if (state) {
      if (state === 'in_stock' && options && options.length > 0 && options.every((o) => o.soldOut)) {
        return { status: 'sold_out', matchedPattern: 'PRELOADED_STATE+옵션전체품절', options, mainPrice };
      }
      return { status: state, matchedPattern: 'PRELOADED_STATE', options, mainPrice };
    }

    let soldOut = null;
    for (const p of SOLDOUT_PATTERNS) if (p.test(body)) { soldOut = p.source; break; }
    let inStock = false;
    for (const p of IN_STOCK_PATTERNS) if (p.test(body)) { inStock = true; break; }
    if (soldOut && !inStock) return { status: 'sold_out', matchedPattern: soldOut, options, mainPrice };
    if (inStock) return { status: 'in_stock', options, mainPrice };
    return { status: 'unknown', options, mainPrice };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return { status: 'error', matchedPattern: msg.slice(0, 80), errorClass: msg === 'timeout' ? 'transient' : 'naver' };
  }
}
