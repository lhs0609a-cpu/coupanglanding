// 네이버 페이지 fetch + 상태/가격 파싱.
// ⚠️ 전송: 1차 = 내장 크롬(CDP 탭) 실제 로드 — 네이버 안티봇이 undici(Node fetch)를 진짜 크롬과
//    구분해 즉시 429를 던지므로(헤더·쿠키로도 안 풀림, 실측), 진짜 크롬으로 페이지를 실제 렌더해
//    진짜 브라우저 핑거프린트+쿠키+JS 로 통과시킨다. 2차(폴백) = undici 직접 fetch(크롬 미가용/실패 시).
//    둘 다 사용자 PC(=가정 IP)에서 나가므로 "가정 IP" 이점 유지.
// __PRELOADED_STATE__ 권위 파서 포함.
//
// ★ 전역 예산 게이트(naver-gate)를 통과한다 — 이 프로세스에서 네이버로 나가는 요청은 품절 감시와
//   소싱 수집 두 갈래인데, 같은 PC·같은 가정 IP 를 쓰므로 합쳐서 페이싱하지 않으면 수집이
//   품절 감시를 굶겨 죽인다. 우선순위는 'monitor'(여기)가 'ingest'(수집)보다 높다.
//   429 를 만나면 게이트에 알려 **양쪽 모두** 멈춘다(한쪽만 쉬면 IP 밴만 깊어진다).
import naverGate from '../../naver-gate.mjs';
// ★ 세션(쿠키·로그인)은 소싱 수집과 **공유한다** — main/naver-session.mjs 가 단일 출처.
//   비로그인으로는 smartstore.naver.com 이 429 로 막힌다(실측: brand 3/3 성공, smartstore 0/5).
//   사람이 소싱 화면에서 네이버 로그인을 한 번 해 두면 품절 감시도 그 세션으로 조회한다.
import { loginState } from '../../naver-session.mjs';

const REMOVED_PATTERNS = [/상품을\s*찾을\s*수\s*없|상품이\s*존재하지\s*않|판매가\s*종료|deleted|removed|<title>404/i];
const SOLDOUT_PATTERNS = [/일시\s*품절|품절\s*상태|sold[\s-]?out|재고\s*없|재고가\s*없/i];
const IN_STOCK_PATTERNS = [/구매하기|장바구니|orderQty|stockQuantity"\s*:\s*[1-9]/i];

// 본문 캡: 네이버 상품 state JSON 이 늦게 나올 수 있어 넉넉히(2.5MB). 과거 500KB 캡이 state 를 잘라 파싱 실패.
const MAX_BODY = 2_500_000;

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

// ─── 진짜 크롬(CDP) 페처 ───
// 네이버 안티봇이 undici(Node fetch)를 진짜 크롬과 구분해 즉시 429를 던진다(헤더·쿠키로도 안 풀림, 실측).
// 진짜 브라우저로 페이지를 실제 로드하면 핑거프린트+쿠키+JS 로 안티봇을 통과한다.
//
// ⭐ 2026-08-27 — 일렉트론 BrowserWindow 에서 **크롬 탭**으로 옮겼다. 앱에서 네이버로 나가는
//   경로를 하나로 모으기 위해서다. 예전에는 여기가 일렉트론 파티션(persist:naveringest)의
//   쿠키를 보고, 소싱 수집은 크롬 프로필을 봐서 **로그인 상태가 둘로 갈렸다** — 사람이 소싱
//   화면에서 로그인해도 품절 감시는 비로그인으로 돌던 문제가 그것이다.
//
// ★ 탭 1장을 재사용하고 직렬화하는 구조는 그대로다(_chain). 풀에 넣지 않는 이유:
//   품절 감시는 셀러에게 바로 영향이 가는 상시 기능이라, 수집이 탭을 다 쓰는 동안 굶으면 안 된다.
//   총량은 어차피 naverGate 가 'monitor' 우선순위로 제어한다.
let _tab = null;
let _chain = Promise.resolve();

async function getTab() {
  if (_tab) return _tab;
  const { newTab } = await import('../naver-ingest/chrome-session.mjs');
  _tab = await newTab();
  // 이미지/미디어/폰트 차단 → 페이지당 속도↑. 여기는 사람이 볼 화면이 아니라 부작용이 없다
  // (로그인·캡차 탭은 별개이고 거기서는 차단하지 않는다).
  await _tab.setMediaBlocked(true).catch(() => {});
  return _tab;
}

/** 지금 이 PC 가 네이버에 로그인돼 있는가 — 조회 실패 원인 진단·UI 안내용. 요청 0회(쿠키 판정). */
export async function naverLoginState() { return loginState(); }

async function loadInTab(url) {
  let tab;
  try {
    tab = await getTab();
  } catch (e) {
    return { status: 0, body: '', title: '', error: 'no-chrome: ' + (e?.message || e) };
  }

  /**
   * 상태코드는 응답을 직접 들어서 잡는다 — CDP 의 Page.navigate 는 상태코드를 안 준다.
   * ★ 리다이렉트를 타면 Document 응답이 여러 번 온다(smartstore /main/products/ → 302 → 스토어).
   *   마지막 값을 쓰되, 도중에 429 가 한 번이라도 있었으면 그게 진실이다 — IP 단위 신호라
   *   최종 200 에 묻히면 서킷브레이커가 배치를 못 멈춘다.
   */
  let status = 0;
  let saw429 = false;
  const unwatch = tab.watchResponses(({ status: s, type }) => {
    if (type !== 'Document') return;
    status = s;
    if (s === 429) saw429 = true;
  });

  try {
    await tab.goto(url, { timeoutMs: 25000, settleMs: 1200 });
    // ★ window.__PRELOADED_STATE__ 객체를 직접 직렬화해 추출 — 렌더된 outerHTML 은 너무 커서
    //   2.5MB 캡에 benefitsView(가격)가 잘려나가 가격을 못 읽던 문제 해결(상태는 앞쪽이라 살아남음).
    //   state 가 없으면(드묾) outerHTML 로 폴백.
    // ★ 제목도 같이 가져온다. state JSON 만 받으면 "상품이 존재하지 않습니다" 같은
    //   **삭제 신호가 통째로 안 보인다**(실측: 삭제된 상품이 품절로 기록됐다).
    //   제목은 수십 바이트라 비용이 없고, 판정의 마지막 안전망이 된다.
    const raw = await tab.evaluate(
      '(function(){var t="";try{t=document.title||""}catch(e){}'
      + 'try{var s=window.__PRELOADED_STATE__;return JSON.stringify({t:t,b:s?JSON.stringify(s):document.documentElement.outerHTML})}'
      + 'catch(e){return JSON.stringify({t:t,b:document.documentElement.outerHTML})}})()',
      { timeoutMs: 25000 },
    );
    let body = raw; let pageTitle = '';
    try { const env = JSON.parse(raw); body = env.b || ''; pageTitle = env.t || ''; } catch { /* 구형 응답은 그대로 */ }
    return {
      status: saw429 ? 429 : (status || 200),
      body: body ? String(body).slice(0, MAX_BODY) : '',
      title: pageTitle,
      error: null,
    };
  } catch (e) {
    // 탭이 죽었으면(크롬 종료 등) 다음 호출이 새로 만들게 놓아 준다.
    try { await _tab?.close(); } catch { /* ignore */ }
    _tab = null;
    return { status: saw429 ? 429 : status, body: '', title: '', error: String(e?.message || e) };
  } finally {
    unwatch();
  }
}

const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let _warmedUp = false;

/** 직렬화된 크롬 탭 로드(탭 1장 재사용). 크롬 미가용/실패 시 throw 로 폴백 유도. */
async function fetchPageViaBrowser(url) {
  const run = _chain.then(async () => {
    // 최초 1회: 네이버 쇼핑 진입으로 세션 쿠키(NNB 등)를 시드한다. smartstore 는 brand 보다 게이트가
    // 엄격해 쿠키없는 첫 방문을 429로 막는다(brand 는 통과). 쿠키가 있으면 상품 페이지가 통과한다.
    if (!_warmedUp) {
      _warmedUp = true;
      try { await loadInTab('https://shopping.naver.com/'); await _sleep(800); } catch { /* best-effort */ }
    }
    let r = await loadInTab(url);
    // 429 면 잠깐 뒤 1회 재시도 — 직전 429 응답이 쿠키를 심어 재시도 시 통과하는 경우가 있다.
    if (r.status === 429) { await _sleep(3000); r = await loadInTab(url); }
    return r;
  });
  _chain = run.then(() => {}, () => {});
  const r = await run;
  if (r.error && !r.body) throw new Error(r.error);
  return { status: r.status, body: r.body, title: r.title || '' };
}

// 가정 IP가 네이버에 지속적으로 429를 맞으면(이 PC IP가 차단됨) 크롬 탭으로 매번 11초씩
// 헛수고하지 말고 GT(구글 IP) 경로를 먼저 탄다. 가끔 크롬 탭을 재탐색해 회복 시 복귀.
let _browser429Streak = 0;

/**
 * 페이지 본문 가져오기(외부 공개) — 올인원 "원본 상품명 가져오기"가 같은 경로를 쓴다.
 * 네이버 안티봇은 Node fetch 를 즉시 429 로 막으므로(실측: 직접 429 / GT 403),
 * 내장 크롬 → GT → undici 순서의 이 파이프라인을 반드시 재사용해야 한다.
 */
export async function fetchNaverPage(url) {
  return fetchPage(url);
}

async function fetchPage(url) {
  // 전역 슬롯 확보 — 수집기가 돌고 있어도 품절 감시가 먼저 통과한다. 쿨다운 중이면 여기서 대기.
  await naverGate.acquire('monitor');

  const gt = toGoogleTranslateUrl(url);
  const preferGT = gt && _browser429Streak >= 3;

  // 가정 IP가 막힌 상태면 GT(구글 IP) 우선 — 빠른 경로.
  if (preferGT) {
    try {
      const r = await fetchPageDirect(gt);
      if (r.status >= 200 && r.status < 400 && r.body) return r;
    } catch { /* GT 실패 → 아래에서 크롬 탭 재탐색 */ }
  }

  // 1차(기본): 진짜 크롬(CDP 탭) — 가정 IP, 안티봇 통과 시 가장 정확.
  try {
    const r = await fetchPageViaBrowser(url);
    if (r.status === 429) {
      _browser429Streak++;
      // IP 단위 신호다 — 게이트에 알려 소싱 수집까지 함께 멈춘다.
      naverGate.triggerCooldown(true);
    } else if (r.status) {
      _browser429Streak = 0;
      naverGate.recordSuccess();   // 정상 응답 → 적응형 속도가 한 단계씩 회복된다
      return r;
    }
  } catch { /* 크롬 미가용/로드 실패 → 폴백 */ }

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

/**
 * __PRELOADED_STATE__ 에서 **본 상품 노드만** 꺼낸다.
 * ---------------------------------------------------------------------------
 * ★ 왜 정규식을 버렸나(실측 2026-08-18): body 는 JSON.stringify(__PRELOADED_STATE__) 인데,
 *   그 안에는 추천·연관·카테고리·보관함 상품이 **함께** 들어 있다. 본 상품(product)은 최상위
 *   키 110개 중 80번째라 한참 뒤다. 전체 문자열에서 첫 "productStatusType" 을 집으면 남의
 *   상품 상태를 읽고, "salePrice" 첫 매치는 남의 가격이다.
 *   실제로 삭제된 상품(yoomifriends/1239)이 "품절 3,650원"으로 기록돼 있었다 — 상태도 가격도
 *   다른 상품 것이었다.
 */
function collectProductNodes(root) {
  // 권위 필드(productStatusType)를 들고 있는 객체를 전부 모은다. 깊이·개수를 묶어 폭주를 막는다.
  const found = [];
  const stack = [[root, 0]];
  while (stack.length && found.length < 40) {
    const [node, depth] = stack.pop();
    if (!node || typeof node !== 'object' || depth > 6) continue;
    if (Array.isArray(node)) {
      for (const v of node.slice(0, 60)) stack.push([v, depth + 1]);
      continue;
    }
    if (typeof node.productStatusType === 'string' && node.productStatusType) found.push(node);
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === 'object') stack.push([v, depth + 1]);
    }
  }
  return found;
}

/**
 * 이 URL 이 가리키는 **바로 그 상품 노드**를 찾는다.
 * ---------------------------------------------------------------------------
 * ★ 경로를 하드코딩하지 않는 이유(실측 2026-08-18): state.product 는 키만 있고 값이 전부 null 인
 *   껍데기였다(복숭아 상품, 최상위 키 121개). 진짜 값은 다른 자리에 있었다. 경로를 박아 두면
 *   네이버가 자리를 옮길 때마다 **살아 있는 상품이 통째로 "삭제"로 뒤집힌다.**
 * ★ 그래서 자리 대신 **신원**으로 찾는다: URL 의 상품번호와 일치하는 노드. 번호로 못 고르면
 *   후보가 하나일 때만 쓰고, 여럿이면 포기한다(모르면 모른다고 하는 편이 안전하다).
 */
function pickProductNode(body, wantNo) {
  if (!body || body[0] !== '{') return null;      // outerHTML 폴백이면 state 가 아니다
  let state;
  try { state = JSON.parse(body); } catch { return null; }
  if (!state || typeof state !== 'object') return null;

  const nodes = collectProductNodes(state);
  if (!nodes.length) {
    // 권위 필드가 아무 데도 없다 — 삭제 페이지이거나 아직 안 실렸다. 판정은 호출부에 맡긴다.
    return null;
  }
  if (wantNo) {
    const same = (v) => v != null && String(v) === String(wantNo);
    const hit = nodes.find((n) => same(n.productNo) || same(n.id) || same(n.channelProductNo)
      || same(n.originProductNo) || same(n.channelProductId));
    if (hit) return hit;
  }
  return nodes.length === 1 ? nodes[0] : null;    // 애매하면 쓰지 않는다
}

/** URL 에서 상품번호 — 신원 대조의 기준. */
function productNoOf(url) {
  const m = String(url || '').match(/\/products\/(\d+)/) || String(url || '').match(/\/(\d{6,})(?:[/?#]|$)/);
  return m ? m[1] : null;
}

/** 본 상품 노드 기준 권위 상태. 노드를 못 찾으면 undefined 를 돌려 폴백에 맡긴다. */
function stateFromNode(prod) {
  if (!prod) return undefined;
  // ★ 값이 비어 있다고 **삭제로 단정하지 않는다**. 페이지가 덜 실렸을 뿐일 수 있고, 그때 삭제로
  //   찍으면 살아 있는 상품이 통째로 뒤집힌다. 삭제는 페이지 제목으로만 확정한다(위 fetchNaverProduct).
  if (!prod.productStatusType && !prod.channelProductDisplayStatusType) return undefined;
  const disp = prod.channelProductDisplayStatusType;
  if (disp && disp !== 'ON') return 'removed';
  const st = prod.productStatusType;
  if (!st) return undefined;
  if (st === 'SALE') return 'in_stock';
  if (st === 'OUTOFSTOCK' || st === 'EXHAUSTION') return 'sold_out';
  return 'removed';
}

function priceFromNode(prod) {
  if (!prod) return undefined;
  for (const f of ['dispDiscountedSalePrice', 'discountedSalePrice', 'salePrice', 'dispSalePrice', 'price']) {
    const v = parseInt(prod[f], 10);
    if (v > 0) return v;
  }
  return undefined;
}

function optionsFromNode(prod) {
  const combos = prod && (prod.optionCombinations
    || (prod.optionCombinationGroupNames && prod.optionCombinations)
    || (prod.productOption && prod.productOption.optionCombinations));
  if (!Array.isArray(combos) || !combos.length) return null;
  return combos.map((c) => ({
    name: [c.optionName1, c.optionName2].filter(Boolean).join(' / '),
    soldOut: (c.stockQuantity !== undefined && c.stockQuantity <= 0) || c.usable === false,
    price: c.price ?? c.priceRelative ?? undefined,
  }));
}

// 옛 정규식 경로 — **본 상품 노드의 JSON 에만** 돌린다(전체 state 에 돌리면 남의 상품이 섞인다).
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

/**
 * 배치 시작 전 세션 워밍업 — www.naver.com 을 한 번 열어 NNB 쿠키를 갱신한다.
 * "방금 네이버를 쓰던 브라우저"로 보이게 해 스마트스토어 첫 요청의 429 확률을 낮춘다.
 * smartstore rate 예산을 쓰지 않으므로 부작용이 없고, 실패해도 무시한다.
 */
export async function warmUpSession() {
  try {
    await loadInTab('https://www.naver.com/');
  } catch { /* 워밍업 실패는 무시 — 본 조회에 영향 없음 */ }
}

/** @returns {Promise<{status,matchedPattern?,errorClass?,rateLimited?,options?,mainPrice?}>} */
export async function fetchNaverProduct(url) {
  try {
    const { status, body, title } = await fetchPage(url);
    // 삭제/미존재는 제목 한 줄이 가장 확실하다 — state 안에는 이 문구가 없다.
    if (title && /상품이\s*존재하지\s*않|상품을\s*찾을\s*수\s*없|페이지를\s*찾을\s*수\s*없/.test(title)) {
      return { status: 'removed', matchedPattern: `제목: ${title.slice(0, 40)}` };
    }
    if (status === 404 || status === 410) return { status: 'removed', matchedPattern: `HTTP ${status}` };
    // rateLimited 는 "IP 단위 속도제한" 신호 — 호출자(서킷브레이커)가 배치를 통째로 멈추는 근거다.
    // 단순 타임아웃(transient)과 구분해야 한다: 타임아웃은 상품 하나 문제라 계속 진행해야 하고,
    // 429 는 IP 문제라 계속 조회하면 차단만 깊어진다.
    if (status === 429) return { status: 'error', matchedPattern: 'HTTP 429 (속도제한)', errorClass: 'transient', rateLimited: true };
    if (status === 503) return { status: 'error', matchedPattern: 'HTTP 503', errorClass: 'transient', rateLimited: true };
    if (status === 403) return { status: 'error', matchedPattern: 'HTTP 403 (접근 차단)', errorClass: 'naver' };
    if (status < 200 || status >= 400) return { status: 'error', matchedPattern: `HTTP ${status}`, errorClass: 'naver' };

    // GT 지역차단 — 본문에 region 안내만 있고 네이버 데이터 없음(드묾, KR IP면 거의 없음). transient 처리.
    if (/translation\s*service\s*isn'?t\s*available\s*in\s*your\s*region/i.test(body)
        && !/__PRELOADED_STATE__|productStatusType|optionCombinations/i.test(body)) {
      return { status: 'error', matchedPattern: 'GT region block', errorClass: 'transient' };
    }

    // ★ 이 패턴들도 **렌더된 HTML 에만** 쓴다. state JSON 에 돌리면 "deleted"/"removed" 가
    //   키 이름(예: "deleted":false)에 걸려 멀쩡한 상품이 삭제로 찍힌다. 삭제 판정의 1순위는
    //   아래 본 상품 노드다(권위 필드가 통째로 비어 있으면 삭제).
    if (!body || body[0] !== '{') {
      for (const p of REMOVED_PATTERNS) if (p.test(body)) return { status: 'removed', matchedPattern: p.source };
    }

    let options, mainPrice, state, source = null;
    if (/smartstore\.naver|shop\.naver/i.test(url)) {
      // ① 본 상품 노드에서 직접 — 여기서 답이 나오면 다른 상품이 섞일 여지가 없다.
      const prod = pickProductNode(body, productNoOf(url));
      if (prod) {
        state = stateFromNode(prod);
        mainPrice = priceFromNode(prod);
        options = optionsFromNode(prod) || undefined;
        source = 'product 노드';
      }
      // ② 노드를 못 찾았을 때만 옛 경로. 단 **노드 JSON 범위로 좁혀서** 돌린다.
      if (!state) {
        const scoped = prod ? JSON.stringify(prod) : body;
        options = options || parseNaverOptions(scoped) || undefined;
        mainPrice = mainPrice ?? parseNaverMainPrice(scoped);
        state = parseNaverState(scoped);
        if (state) source = 'PRELOADED_STATE';
      }
    }
    if (state) {
      if (state === 'in_stock' && options && options.length > 0 && options.every((o) => o.soldOut)) {
        return { status: 'sold_out', matchedPattern: source + '+옵션전체품절', options, mainPrice };
      }
      return { status: state, matchedPattern: source, options, mainPrice };
    }

    // ★ 텍스트 패턴은 **렌더된 HTML 에만** 쓴다. body 가 state JSON 일 때 돌리면
    //   /sold[\s-]?out/i 가 다른 상품 목록의 JSON 키 `soldOut` 에 그대로 걸린다.
    //   실측: 삭제된 상품이 이 경로로 "품절"이 됐다(가격은 남의 상품 것이었다).
    const isStateJson = !!body && body[0] === '{';
    if (isStateJson) return { status: 'unknown', matchedPattern: '권위 데이터 없음', options, mainPrice };

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
