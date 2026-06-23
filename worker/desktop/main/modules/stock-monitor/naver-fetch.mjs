// 네이버 페이지 fetch + 상태/가격 파싱.
// ⚠️ 전송: 1차 = 내장 크롬(BrowserWindow) 실제 로드 — 네이버 안티봇이 undici(Node fetch)를 진짜 크롬과
//    구분해 즉시 429를 던지므로(헤더·쿠키로도 안 풀림, 실측), Electron Chromium 으로 페이지를 실제 렌더해
//    진짜 브라우저 핑거프린트+쿠키+JS 로 통과시킨다. 2차(폴백) = undici 직접 fetch(electron 미가용/실패 시).
//    둘 다 사용자 PC(=가정 IP)에서 나가므로 "가정 IP" 이점 유지. (Electron net 모듈은 ERR_FAILED 라 미사용.)
// __PRELOADED_STATE__ 권위 파서 포함.

const REMOVED_PATTERNS = [/상품을\s*찾을\s*수\s*없|판매가\s*종료|deleted|removed|<title>404/i];
const SOLDOUT_PATTERNS = [/일시\s*품절|품절\s*상태|sold[\s-]?out|재고\s*없|재고가\s*없/i];
const IN_STOCK_PATTERNS = [/구매하기|장바구니|orderQty|stockQuantity"\s*:\s*[1-9]/i];

// 본문 캡: 네이버 상품 state JSON 이 늦게 나올 수 있어 넉넉히(2.5MB). 과거 500KB 캡이 state 를 잘라 파싱 실패.
const MAX_BODY = 2_500_000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ─── Google Translate 우회 URL ───
// 가정 IP가 네이버에 429로 막혀도, translate.goog 는 "구글 서버가 네이버를 대신 fetch" 하므로
// 네이버는 구글 IP를 보고 우리 IP의 레이트리밋과 무관하게 응답한다(서버 엔진에서 검증된 경로).
// 본문에 __PRELOADED_STATE__ JSON(productStatusType/salePrice/optionCombinations)이 그대로 남아
// 기존 파서가 동작한다. 우리 IP→구글 요청은 네이버가 429를 줄 수 없다.
function toGoogleTranslateUrl(url) {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.replace(/\./g, '-') + '.translate.goog';
    u.searchParams.set('_x_tr_sl', 'ko');
    u.searchParams.set('_x_tr_tl', 'en');
    u.searchParams.set('_x_tr_hl', 'en');
    return u.toString();
  } catch { return null; }
}

// ─── 진짜 크롬(BrowserWindow) 페처 ───
// 네이버 안티봇이 undici(Node fetch)를 진짜 크롬과 구분해 즉시 429를 던진다(헤더·쿠키로도 안 풀림, 실측).
// 도우미는 Electron 이라 내장 Chromium 으로 페이지를 실제 로드하면 진짜 브라우저 핑거프린트+쿠키+JS 로
// 안티봇을 통과한다. 창 1개를 재사용하고, 동시 로드 불가라 직렬화한다. electron 없으면(테스트) undici 폴백.
let _win = null;
let _chain = Promise.resolve();
let _imgBlocked = false;

const SCRAPE_PARTITION = 'persist:naverscrape';

async function getWindow() {
  const { BrowserWindow, session } = await import('electron');
  if (_win && !_win.isDestroyed()) return _win;
  // 이미지/미디어/폰트 차단 → 페이지당 속도↑. ★ 전용 파티션 세션에만 적용(앱 UI 아이콘 차단 방지).
  if (!_imgBlocked) {
    try {
      session.fromPartition(SCRAPE_PARTITION).webRequest.onBeforeRequest(
        { urls: ['*://*/*'] },
        (details, cb) => cb({ cancel: ['image', 'media', 'font'].includes(details.resourceType) }),
      );
      _imgBlocked = true;
    } catch { /* best-effort */ }
  }
  _win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: { offscreen: false, backgroundThrottling: false, javascript: true, partition: SCRAPE_PARTITION },
  });
  _win.webContents.setAudioMuted(true);
  return _win;
}

function loadInWindow(url) {
  return new Promise((resolve) => {
    getWindow().then((w) => {
      const wc = w.webContents;
      let status = 0;
      let settled = false;
      const timer = setTimeout(() => finish('timeout'), 25000);
      const onNavigate = (_e, _u, code) => { if (code) status = code; };
      const onFail = (_e, errCode, errDesc, _vurl, isMain) => { if (isMain) finish(`load ${errCode} ${errDesc}`); };
      const onFinish = async () => {
        try {
          // ★ window.__PRELOADED_STATE__ 객체를 직접 직렬화해 추출 — 렌더된 outerHTML 은 너무 커서
          //   2.5MB 캡에 benefitsView(가격)가 잘려나가 가격을 못 읽던 문제 해결(상태는 앞쪽이라 살아남음).
          //   state 가 없으면(드묾) outerHTML 로 폴백.
          const body = await wc.executeJavaScript(
            '(function(){try{var s=window.__PRELOADED_STATE__;return s?JSON.stringify(s):document.documentElement.outerHTML}catch(e){return document.documentElement.outerHTML}})()',
            true,
          );
          finish(null, status || 200, body);
        } catch (e) { finish('extract: ' + (e?.message || e)); }
      };
      function cleanup() {
        clearTimeout(timer);
        wc.removeListener('did-navigate', onNavigate);
        wc.removeListener('did-fail-load', onFail);
        wc.removeListener('did-finish-load', onFinish);
      }
      function finish(err, st, html) {
        if (settled) return; settled = true; cleanup();
        resolve({ status: st || 0, body: html ? html.slice(0, MAX_BODY) : '', error: err || null });
      }
      wc.on('did-navigate', onNavigate);
      wc.on('did-fail-load', onFail);
      wc.on('did-finish-load', onFinish);
      wc.loadURL(url, { userAgent: UA }).catch((e) => finish('loadURL: ' + (e?.message || e)));
    }).catch((e) => resolve({ status: 0, body: '', error: 'no-electron: ' + (e?.message || e) }));
  });
}

const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let _warmedUp = false;

/** 직렬화된 BrowserWindow 로드(창 1개 재사용). electron 미가용/실패 시 throw 로 폴백 유도. */
async function fetchPageViaBrowser(url) {
  const run = _chain.then(async () => {
    // 최초 1회: 네이버 쇼핑 진입으로 세션 쿠키(NNB 등)를 시드한다. smartstore 는 brand 보다 게이트가
    // 엄격해 쿠키없는 첫 방문을 429로 막는다(brand 는 통과). 쿠키가 있으면 상품 페이지가 통과한다.
    if (!_warmedUp) {
      _warmedUp = true;
      try { await loadInWindow('https://shopping.naver.com/'); await _sleep(800); } catch { /* best-effort */ }
    }
    let r = await loadInWindow(url);
    // 429 면 잠깐 뒤 1회 재시도 — 직전 429 응답이 쿠키를 심어 재시도 시 통과하는 경우가 있다.
    if (r.status === 429) { await _sleep(3000); r = await loadInWindow(url); }
    return r;
  });
  _chain = run.then(() => {}, () => {});
  const r = await run;
  if (r.error && !r.body) throw new Error(r.error);
  return { status: r.status, body: r.body };
}

// 가정 IP가 네이버에 지속적으로 429를 맞으면(이 PC IP가 차단됨) BrowserWindow 로 매번 11초씩
// 헛수고하지 말고 GT(구글 IP) 경로를 먼저 탄다. 가끔 BrowserWindow 를 재탐색해 회복 시 복귀.
let _browser429Streak = 0;

async function fetchPage(url) {
  const gt = toGoogleTranslateUrl(url);
  const preferGT = gt && _browser429Streak >= 3;

  // 가정 IP가 막힌 상태면 GT(구글 IP) 우선 — 빠른 경로.
  if (preferGT) {
    try {
      const r = await fetchPageDirect(gt);
      if (r.status >= 200 && r.status < 400 && r.body) return r;
    } catch { /* GT 실패 → 아래에서 BrowserWindow 재탐색 */ }
  }

  // 1차(기본): 진짜 크롬(BrowserWindow) — 가정 IP, 안티봇 통과 시 가장 정확.
  try {
    const r = await fetchPageViaBrowser(url);
    if (r.status === 429) {
      _browser429Streak++;
    } else if (r.status) {
      _browser429Streak = 0;
      return r;
    }
  } catch { /* electron 미가용/로드 실패 → 폴백 */ }

  // 2차: Google Translate 경유(undici) — 가정 IP가 429일 때 구글 IP로 네이버 우회.
  if (gt && !preferGT) {
    try {
      const r = await fetchPageDirect(gt);
      if (r.status >= 200 && r.status < 400 && r.body) return r;
    } catch { /* fall through */ }
  }

  // 3차: undici 직접(원본) — 마지막 시도.
  try {
    return await fetchPageDirect(url);
  } catch {
    return { status: 429, body: '' };
  }
}

async function fetchPageDirect(url) {
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 25000);
  try {
    const res = await fetch(url, {
      method: 'GET', redirect: 'follow', signal: ac.signal, cache: 'no-store',
      headers: {
        // 쿠키없는 헤드리스 요청은 네이버가 봇으로 보고 즉시 429를 던진다. 실제 크롬과
        // 동일한 Sec-Fetch / Sec-Ch-Ua / Referer 를 붙여 일반 브라우저 진입처럼 위장한다.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://shopping.naver.com/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-User': '?1',
        'Sec-Ch-Ua': '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
      },
    });
    let body = await res.text();
    if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY);
    return { status: res.statusCode ?? res.status, body };
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('timeout');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
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
    const { status, body } = await fetchPage(url);
    if (status === 404 || status === 410) return { status: 'removed', matchedPattern: `HTTP ${status}` };
    if (status === 429) return { status: 'error', matchedPattern: 'HTTP 429 (속도제한)', errorClass: 'transient' };
    if (status === 403) return { status: 'error', matchedPattern: 'HTTP 403 (접근 차단)', errorClass: 'naver' };
    if (status < 200 || status >= 400) return { status: 'error', matchedPattern: `HTTP ${status}`, errorClass: 'naver' };

    // GT 지역차단 — 본문에 region 안내만 있고 네이버 데이터 없음(드묾, KR IP면 거의 없음). transient 처리.
    if (/translation\s*service\s*isn'?t\s*available\s*in\s*your\s*region/i.test(body)
        && !/__PRELOADED_STATE__|productStatusType|optionCombinations/i.test(body)) {
      return { status: 'error', matchedPattern: 'GT region block', errorClass: 'transient' };
    }

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
