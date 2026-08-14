/**
 * 페이지 컨텍스트에 주입하는 JS 조각 모음.
 * ---------------------------------------------------------------------------
 * 전부 문자열이다 — webContents.executeJavaScript 로 실행한다. 렌더러 안에서 도는 코드라
 * 이 파일의 import/모듈 스코프를 쓸 수 없고, 각자 자기완결적인 IIFE 여야 한다.
 *
 * ⚠️ 여기 있는 셀렉터/문구는 원본 이식 가이드([4][5][6][7])에서 옮긴 것이다.
 *   난독화 클래스명은 유통기한이 있으므로 **1순위 앵커로 쓰지 않는다**. 판정은 항상
 *   URL 패턴 · 접근성 텍스트 · id/name 처럼 잘 안 바뀌는 것부터 본다.
 */

/**
 * URL 직접 이동 금지 — 네이버 안티봇의 1순위 트리거다(실측: 즉시 490/빈 페이지).
 * 대신 현재 네이버 페이지 안에 링크를 만들어 **사람이 클릭한 것과 같은 이벤트 체인**을 쏜다.
 *
 * 세부 규칙(하나라도 빠지면 봇으로 잡힌다):
 *   · display:none 이 아니라 opacity:0.01 + 뷰포트 안. 안 보이는 링크 클릭은 그 자체가 시그널
 *   · pointer/mouse 이벤트를 hover→move→down→up→click 순서로, 사람 반응 속도의 지연을 끼워서
 *   · 좌표(clientX/screenX)를 실제 링크 위치로 채운다
 */
export const navigateViaClickJs = (url) => `
(async () => {
  const url = ${JSON.stringify(url)};
  const link = document.createElement('a');
  link.href = url;
  link.style.cssText = 'opacity:0.01;position:fixed;top:100px;left:100px;width:1px;height:1px;overflow:hidden;pointer-events:auto;z-index:-1;';
  document.body.appendChild(link);

  const rect = link.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const base = {
    bubbles: true, cancelable: true, view: window,
    clientX: cx, clientY: cy,
    screenX: window.screenX + cx, screenY: window.screenY + cy,
    button: 0, buttons: 1,
  };
  const wait = (min, max) => new Promise(r => setTimeout(r, min + Math.random() * (max - min)));

  link.dispatchEvent(new PointerEvent('pointerover', { ...base, pointerId: 1 }));
  link.dispatchEvent(new PointerEvent('pointerenter', { ...base, pointerId: 1, bubbles: false }));
  link.dispatchEvent(new MouseEvent('mouseover', base));
  link.dispatchEvent(new MouseEvent('mouseenter', { ...base, bubbles: false }));
  await wait(30, 80);

  link.dispatchEvent(new PointerEvent('pointermove', { ...base, pointerId: 1 }));
  link.dispatchEvent(new MouseEvent('mousemove', base));
  await wait(50, 150);

  link.dispatchEvent(new PointerEvent('pointerdown', { ...base, pointerId: 1 }));
  link.dispatchEvent(new MouseEvent('mousedown', base));
  await wait(50, 120);
  link.dispatchEvent(new PointerEvent('pointerup', { ...base, pointerId: 1, buttons: 0 }));
  link.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
  await wait(5, 20);
  link.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0 }));

  setTimeout(() => link.remove(), 200);
  return true;
})()
`;

/**
 * SPA 렌더링 완료 판정.
 * 네이버 상품 페이지는 SPA 라 did-finish-load(=status complete)가 데이터 표시를 보장하지 않는다.
 * 이 판정을 건너뛰면 상품명이 통째로 'Unknown' 인 결과가 저장된다.
 */
export const spaReadyJs = `
(() => {
  const body = (document.body && document.body.innerText || '').trim();
  const og = document.querySelector('meta[property="og:title"]');
  const hasOgTitle = !!(og && og.content && og.content !== 'NAVER' && og.content.length > 3);
  let hasJsonLd = false;
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const d = JSON.parse(s.textContent);
      const arr = Array.isArray(d) ? d : [d];
      if (arr.some(x => x && x['@type'] === 'Product')) hasJsonLd = true;
    } catch (e) { /* 깨진 LD 는 무시 */ }
  }
  return { bodyLength: body.length, hasOgTitle, hasJsonLd,
           ready: body.length > 500 || hasOgTitle || hasJsonLd };
})()
`;

/**
 * 차단 / 캡차 판정.
 * ★ 순서가 핵심이다 — **캡차를 먼저** 본다. 캡차를 "차단"으로 처리하면 풀 기회를 날리고,
 *   반대로 정상 상품 페이지를 캡차로 오탐하면 수집이 통째로 멈춘다.
 */
export const detectJs = `
(() => {
  const url = location.href;
  const text = (document.body && document.body.innerText || '');
  const html = (document.body && document.body.innerHTML || '');
  const title = document.title || '';

  const CAPTCHA_URLS = ['/captcha', 'captcha.naver.com', '/antibot', 'nid.naver.com/nidlogin',
    '/verification', 'auth.naver.com', '/bot-check', '/security-check'];
  const CAPTCHA_TEXTS = ['보안 확인을 완료해 주세요', '자동입력 방지', '빈 칸을 채워주세요',
    '보안문자를 입력', '자동 입력 방지문자', '네트워크의 접속을 일시적으로', '쇼핑 서비스 접속이',
    '자동화된 접근이 감지', '비정상적인 트래픽', '로봇이 아닙니다', '사람인지 확인',
    '접속이 일시적으로 제한', '보안 인증을 완료', '자동 접근 방지', '인증을 완료해',
    '본인 확인이 필요', '보안 문자', '문자를 정확히 입력'];
  const CAPTCHA_DOM = ['input#rcpt_answer', 'input[name="captcha"]', '.captcha_img_cover',
    '[class*="captcha"]', '[id*="captcha"]', 'img[src*="captcha"]', '[class*="security_check"]',
    '[class*="bot_check"]', 'iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]',
    '.g-recaptcha', '[data-sitekey]', '[class*="antibot"]'];
  const SAFE_PAGES = ['shopping.naver.com', 'search.shopping.naver.com', 'news.naver.com',
    'naver.com/ns/home', 'naver.com/ns/category'];

  function isCaptcha() {
    // ① 오탐 방지 — 목록/검색 같은 안전 페이지는 '확실한 증거'가 있을 때만 캡차로 본다.
    //    (여기가 없으면 정상 카테고리 페이지를 캡차로 오인해 수집이 영영 멈춘다)
    if (SAFE_PAGES.some(s => url.includes(s))) {
      if (document.querySelector('input#rcpt_answer, input[name="captcha"]')) return true;
      if (text.includes('[?]') && text.includes('빈 칸을 채워주세요')) return true;
      if (text.length < 1000 && ['접속이 일시적으로 제한', '쇼핑 서비스 접속이', '보안 확인을 완료해 주세요']
          .some(s => text.includes(s))) return true;
      return false;
    }
    if (CAPTCHA_URLS.some(p => url.includes(p))) return true;
    if (CAPTCHA_TEXTS.some(p => text.includes(p))) return true;
    if (CAPTCHA_DOM.some(sel => { try { return !!document.querySelector(sel); } catch (e) { return false; } })) return true;
    // ⑤ 스마트스토어 전용 보안 페이지 — 본문이 거의 없고 확인/인증/보안 문구만 있는 형태
    if ((url.includes('smartstore') || url.includes('brand.naver')) && text.length < 500
        && ['확인', '인증', '보안'].some(s => text.includes(s))) return true;
    return false;
  }

  const captcha = isCaptcha();

  function isBlocked() {
    if (captcha) return false;                       // 캡차는 차단이 아니다
    if (text.length < 100) return true;              // 빈 페이지
    if (html.length < 500) return true;
    // 490 차단 신호 — 스토어 페이지인데 SPA 가 아예 안 그려짐
    if ((url.includes('smartstore.naver.com') || url.includes('brand.naver.com'))
        && text.length < 350
        && !document.querySelector('meta[property="og:title"]')
        && !document.querySelector('script[type="application/ld+json"]')) return true;
    // 상품 DOM 전무
    if (!document.querySelector('meta[property="og:title"]')
        && !document.querySelector('script[type="application/ld+json"]')
        && !document.querySelector('[class*="product"], [class*="Product"], h3')) return true;
    const BLOCK_TEXTS = ['비정상적인 접근', '접근이 제한', '차단되었습니다', '잠시 후 다시',
      '보안 정책에 의해', '접속이 일시적으로 제한', '서비스 접속이 불가', '동시에 접속하는 이용자 수가 많'];
    return BLOCK_TEXTS.some(s => text.includes(s));
  }

  return {
    url, captcha,
    blocked: isBlocked(),
    // 429 는 일반 차단보다 훨씬 길게 식혀야 해서 따로 센다.
    is429: title.includes('에러') && text.includes('서비스 접속이 불가'),
    bodyLength: text.length,
  };
})()
`;

/**
 * 최소 추출(상품명·가격) — P0 연결 확인용이자 P1 전체 추출의 씨앗.
 * 폴백 순서를 여기서부터 고정한다: **JSON-LD → og:title → <title> → 헤딩**.
 * 난독화 클래스는 이 단계에 아예 등장하지 않는다(수시로 바뀌므로 최후 폴백 자리에만 둔다).
 */
export const probeJs = `
(() => {
  const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
  // 안티봇이 200 으로 내려주는 에러 제목 — 이게 상품명으로 저장되면 데이터가 통째로 오염된다.
  const isErrorTitle = (s) => /^\\[?에러|시스템\\s*오류|에러\\s*페이지|접근이?\\s*(제한|차단)|잠시\\s*후\\s*다시|not\\s*found|error|forbidden|429|503/i.test(s);
  const ok = (v) => (v && v.length > 3 && !isErrorTitle(v) ? v : null);
  // "상품명 : 스토어명" 형태로 오는 경우가 있어 앞부분만 취한다.
  const head = (s) => (s && s.includes(' : ') ? s.split(' : ')[0] : s);

  let name = null, brand = null, price = 0;

  // ① JSON-LD — 가장 안정적인 권위값
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const d = JSON.parse(s.textContent);
      for (const x of (Array.isArray(d) ? d : [d])) {
        if (!x || x['@type'] !== 'Product') continue;
        name = name || ok(clean(head(x.name)));
        brand = brand || clean(x.brand && x.brand.name) || null;
        const p = x.offers && (x.offers.price ?? (Array.isArray(x.offers) && x.offers[0] && x.offers[0].price));
        if (!price && p) price = parseInt(String(p).replace(/[^0-9]/g, ''), 10) || 0;
      }
    } catch (e) { /* 깨진 LD 는 무시 */ }
  }

  // ② og:title
  if (!name) {
    const og = document.querySelector('meta[property="og:title"]');
    if (og && og.content !== 'NAVER') name = ok(clean(head(og.content)));
  }
  // ③ <title>
  if (!name && !document.title.includes('NAVER')) name = ok(clean(document.title.split(':')[0]));
  // ④ 헤딩
  if (!name) {
    for (const h of document.querySelectorAll('h3, h1, h2')) {
      const t = clean(h.innerText);
      if (t.length > 5 && t.length < 200 && !t.includes('배송') && !t.includes('결제')) { name = t; break; }
    }
  }

  // 가격 — 접근성 라벨(span.blind)이 난독화에 가장 강한 앵커다.
  if (!price) {
    for (const b of document.querySelectorAll('span.blind, .blind')) {
      const label = clean(b.textContent);
      if (!['상품 가격', '상품가격', '판매가', '판매 가격'].includes(label)) continue;
      const parent = clean(b.parentElement && b.parentElement.innerText).replace(label, '');
      const m = parent.match(/([\\d,]{3,})/);
      if (m) { price = parseInt(m[1].replace(/,/g, ''), 10) || 0; if (price > 0) break; }
    }
  }

  return { name: name || null, brand: brand || null, price,
           productCode: (location.href.match(/\\/products\\/(\\d+)/) || [])[1] || null };
})()
`;

/**
 * 사람처럼 굴기 — 상품 페이지 진입 직후 1회.
 * 진입하자마자 데이터만 긁고 나가는 패턴은 그 자체로 봇 시그널이다.
 */
export const humanizeJs = `
(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    window.scrollBy(0, 100 + Math.random() * 300);
    await wait(200 + Math.random() * 300);
  }
  document.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true, clientX: 100 + Math.random() * 500, clientY: 100 + Math.random() * 300,
  }));
  await wait(300);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return true;
})()
`;

/**
 * 418(봇 차단) 감시 설치 — 목록 스크롤 중 네이버가 XHR 로 던지는 신호를 잡는다.
 * ★ try/finally 로 감싸 **에러가 나도 window.fetch 를 반드시 원복**한다. 원복에 실패하면
 *   페이지의 정상 통신까지 망가져 수집이 조용히 실패한다.
 */
export const install418WatcherJs = `
(() => {
  if (window.__mgl418) return true;
  const orig = window.fetch;
  window.__mgl418 = { count: 0, restore: () => { window.fetch = orig; delete window.__mgl418; } };
  window.fetch = async function (...args) {
    try {
      const res = await orig.apply(this, args);
      try { if (res && res.status === 418) window.__mgl418.count++; } catch (e) { /* ignore */ }
      return res;
    } catch (e) {
      throw e;
    }
  };
  return true;
})()
`;

export const read418Js = `(() => (window.__mgl418 ? window.__mgl418.count : 0))()`;
export const reset418Js = `(() => { if (window.__mgl418) window.__mgl418.count = 0; return true; })()`;

/**
 * 카테고리 페이지에 있는 **모든 카테고리 링크를 문서 순서 그대로** 뽑는다.
 *
 * ⚠️ 여기서 "하위 분류만 골라내는" 판단을 하지 않는 이유:
 *   네이버 페이지에는 어느 화면이든 **전체 메뉴(대분류 25개 + 각 중분류)** 가 통째로 깔려 있다.
 *   그래서 링크를 그냥 모으면 어느 카테고리에 들어가든 200개가 넘는 같은 목록이 나온다(실측 —
 *   "신발"에 들어갔는데 여성의류·가전·반려동물이 전부 나왔다). DOM 구조로 부모-자식을 추측하는
 *   방법은 난독화 마크업 때문에 깨지기 쉬우므로, 판단은 **대분류 id 를 아는 Node 쪽**(categories.mjs)
 *   에서 문서 순서를 잘라 한다. 여기는 재료만 정확히 넘긴다.
 *
 * 앵커는 href 의 `/ns/category/{숫자}` 하나뿐이다 — 난독화 클래스에 의존하지 않는다.
 */
export const categoryLinksJs = `
(() => {
  const links = [];
  const seen = new Set();
  let currentId = null;

  for (const a of document.querySelectorAll('a[href*="/ns/category/"]')) {
    const m = (a.getAttribute('href') || '').match(/\\/ns\\/category\\/(\\d+)/);
    if (!m) continue;
    const id = m[1];
    // 링크 텍스트가 곧 카테고리명. 안쪽 span 이 있으면 그게 더 정확하다.
    const span = a.querySelector('span');
    const name = ((span && span.textContent) || a.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!name || name.length > 30) continue;

    if (a.getAttribute('aria-current') === 'true' && !currentId) currentId = id;
    // 같은 카테고리가 메뉴와 사이드바에 두 번 나온다 — 문서 순서상 첫 번째만 남긴다.
    if (seen.has(id)) continue;
    seen.add(id);
    links.push({ id, name });
  }

  return { currentId, links };
})()
`;

/**
 * 목록 페이지의 **상품 카드**를 긁는다 — 상세 페이지를 열지 않고도 리스팅이 되도록.
 * 상세 추출은 상품당 30~90초라 병목이지만, 카드 정보(제목·가격·썸네일)는 목록 한 장에서
 * 수십 개가 한꺼번에 나온다. 그래서 "먼저 넓게 리스팅 → 고른 것만 깊게" 가 가능해진다.
 *
 * 링크에서 위로 올라가며 카드 컨테이너를 찾고, 그 안에서 텍스트·가격·이미지를 뽑는다.
 * (카드 마크업의 클래스는 수시로 바뀌므로 구조만 본다)
 */
export const collectCardsJs = `
(() => {
  const items = [];
  const seen = new Set();
  const PRODUCT_RE = /naver\\.com\\/([^/]+)\\/products\\/(\\d+)/;

  for (const a of document.querySelectorAll('a[href*="/products/"]')) {
    const href = (a.href || '').split('?')[0];
    const m = href.match(PRODUCT_RE);
    if (!m) continue;
    const storeId = m[1], productNo = m[2];
    // 스토어 자리에 오면 안 되는 값 — 목록에서 딸려오는 노이즈
    if (['search', 'products', 'category', 'best', 'new', 'sale', 'event'].includes(storeId)) continue;
    if (seen.has(productNo)) continue;
    seen.add(productNo);

    // 카드 컨테이너 찾기 — 이미지를 품은 가장 가까운 조상(최대 6단계).
    let card = a, img = a.querySelector('img');
    for (let i = 0; i < 6 && card.parentElement; i++) {
      if (img) break;
      card = card.parentElement;
      img = card.querySelector('img');
    }

    const text = (card.innerText || '').replace(/\\s+/g, ' ').trim();
    // 가격: "12,900원" 형태 중 가장 앞의 1000 이상 값(할인가가 먼저 온다)
    let price = 0;
    for (const pm of text.matchAll(/([\\d,]{3,})\\s*원/g)) {
      const v = parseInt(pm[1].replace(/,/g, ''), 10);
      if (v >= 100) { price = v; break; }
    }
    // 제목: 링크 자체 텍스트 우선(카드 전체 텍스트엔 가격·배지가 섞인다)
    let title = (a.innerText || '').replace(/\\s+/g, ' ').trim();
    if (!title || title.length < 4) {
      title = text.split(/\\s원|\\d{1,3}(?:,\\d{3})+원/)[0].slice(0, 120).trim();
    }
    if (title.length > 120) title = title.slice(0, 120);

    let thumb = img ? (img.src || img.getAttribute('data-src') || '') : '';
    if (thumb && !/pstatic\\.net/.test(thumb)) thumb = '';

    // 리뷰수 — 있으면 인기도 판단에 쓴다.
    const rm = text.match(/리뷰\\s*([\\d,]+)/);
    const reviewCount = rm ? parseInt(rm[1].replace(/,/g, ''), 10) : 0;

    items.push({ productNo, storeId, url: href, title, price, thumb, reviewCount });
  }
  return items;
})()
`;

/** 목록 무한스크롤 1회 — 부분 스크롤(20% 확률)을 섞어 기계적 패턴을 흐린다. */
export const scrollStepJs = `
(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  if (Math.random() < 0.2) {
    window.scrollTo(0, document.body.scrollHeight * (0.7 + Math.random() * 0.3));
    await wait(300 + Math.random() * 300);
  }
  window.scrollTo(0, document.body.scrollHeight);
  return document.body.scrollHeight;
})()
`;
