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
 * 페이지에 **이미 있는 진짜 링크**를 눌러 이동한다.
 *
 * 우리가 만든 가짜 <a> 클릭(navigateViaClickJs)은 진입점이 없을 때의 차선책이다. 페이지 안에
 * 목적지 링크가 실제로 있으면 그걸 누르는 편이 항상 낫다 — referrer·SPA 라우팅·추적 파라미터가
 * 사람이 누른 것과 완전히 같아진다. 목록 페이지처럼 "메뉴 → 목록" 경로가 정해져 있는 곳에서 쓴다.
 */
export const hasPageLinkJs = (sub) => `
(() => {
  const sub = ${JSON.stringify(sub)};
  const a = [...document.querySelectorAll('a[href]')].find(x => (x.href || '').includes(sub));
  return a ? { found: true, href: a.href } : { found: false };
})()
`;

export const clickPageLinkJs = (sub) => `
(async () => {
  const sub = ${JSON.stringify(sub)};
  const link = [...document.querySelectorAll('a[href]')].find(x => (x.href || '').includes(sub));
  if (!link) return { found: false };

  link.scrollIntoView({ block: 'center' });
  await new Promise(r => setTimeout(r, 200 + Math.random() * 300));

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
  link.dispatchEvent(new MouseEvent('mouseover', base));
  await wait(40, 120);
  link.dispatchEvent(new PointerEvent('pointermove', { ...base, pointerId: 1 }));
  link.dispatchEvent(new MouseEvent('mousemove', base));
  await wait(60, 160);
  link.dispatchEvent(new PointerEvent('pointerdown', { ...base, pointerId: 1 }));
  link.dispatchEvent(new MouseEvent('mousedown', base));
  await wait(50, 120);
  link.dispatchEvent(new PointerEvent('pointerup', { ...base, pointerId: 1, buttons: 0 }));
  link.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
  await wait(5, 20);
  link.click();   // SPA 라우터는 합성 click 보다 네이티브 click 을 확실히 받는다
  return { found: true, href: link.href };
})()
`;

/**
 * 로그인 화면의 "로그인 상태 유지"를 대신 켜 준다.
 * ---------------------------------------------------------------------------
 * 왜 필요한가(실측): 이걸 끈 채로 로그인하면 네이버는 NID_AUT/NID_SES 를 **세션 쿠키**로
 * 발급한다. 세션 쿠키는 디스크에 안 남으므로 앱을 껐다 켜는 순간 로그아웃이다. 실제로
 * 파티션의 Cookies 파일에는 NNB(영구)만 있고 NID_AUT/NID_SES 가 아예 없었다.
 * 사람이 매번 체크하는 걸 기억하게 만드는 대신, 로그인 화면을 띄울 때 우리가 켜 둔다.
 * (체크박스만 건드린다 — 아이디·비밀번호에는 손대지 않는다)
 */
export const keepLoginJs = `
(() => {
  const box = document.querySelector('input[name="nvlong"], input#keep, input#keep_check, input[type="checkbox"][id*="keep" i]');
  if (!box) return { found: false };
  const was = !!box.checked;
  if (!was) {
    // 네이티브 click 이어야 리스너(라벨/스위치 UI)까지 같이 반응한다.
    box.click();
    if (!box.checked) {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  return { found: true, was, now: !!box.checked };
})()
`;

/**
 * 자동 로그인 — 로그인 화면의 입력칸을 사람처럼 채우고 제출한다.
 * ---------------------------------------------------------------------------
 * ★ 값을 통째로 꽂지 않고 한 글자씩 친다. 네이버 로그인 폼은 입력 이벤트가 없는 채로 값만
 *   바뀌면 붙여넣기/자동입력으로 보고 캡차를 띄운다. 글자마다 keydown/input/keyup 을 쏘고
 *   사람 타이핑 속도(35~110ms)의 흔들림을 준다.
 * ★ "로그인 상태 유지"를 반드시 켠다 — 안 켜면 세션 쿠키로 발급돼 앱을 끄는 순간 풀린다.
 * ★ 실패를 여기서 판정하지 않는다. 제출까지만 하고, 결과(성공/캡차/2단계/비밀번호 오류)는
 *   loginPageStateJs 와 쿠키로 본다. 화면 문구로 성패를 추측하면 오판한다.
 */
export const naverAutoLoginJs = (id, pw) => `
(async () => {
  const ID = ${JSON.stringify(String(id))};
  const PW = ${JSON.stringify(String(pw))};
  const wait = (a, b) => new Promise(r => setTimeout(r, a + Math.random() * (b - a)));

  const idEl = document.querySelector('input#id, input[name="id"]');
  const pwEl = document.querySelector('input#pw, input[name="pw"]');
  if (!idEl || !pwEl) return { ok: false, reason: 'form-not-found' };

  const type = async (el, text) => {
    el.focus();
    el.click();
    el.value = '';
    for (const ch of text) {
      el.value += ch;
      el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
      await wait(35, 110);
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  };

  await type(idEl, ID);
  await wait(200, 500);
  await type(pwEl, PW);
  await wait(250, 600);

  const keep = document.querySelector('input[name="nvlong"], input#keep, input[type="checkbox"][id*="keep" i]');
  if (keep && !keep.checked) { keep.click(); if (!keep.checked) keep.checked = true; }

  // 로그인 버튼 — 실측(2026-08-18)으로 네이버가 바꿔 놓은 것을 반영한다.
  //   지금: #loginBtn_row(가로 레이아웃, 보임) / #loginBtn_column(세로, 숨김), class=btn_done
  //   옛것: [id="log.login"], .btn_login  ← 더는 없다
  // ★ 'button[type=submit]' 로 폴백하면 안 된다 — 이 페이지의 submit 버튼은 **언어 선택**
  //   (.btn_language)이라 엉뚱한 걸 누른다. 반드시 보이는 로그인 버튼만 고른다.
  // ★ '패스키 로그인'(#passkeyBtn_*)도 같은 btn_done 클래스라 id 로 먼저 거른다.
  const visible = (e) => !!(e && (e.offsetWidth || e.offsetHeight));
  const btn =
    [...document.querySelectorAll('[id^="loginBtn"]')].find(visible)
    || [...document.querySelectorAll('[id="log.login"], .btn_login')].find(visible)
    || [...document.querySelectorAll('button.btn_done')].find((e) => visible(e) && /^로그인$/.test((e.innerText || '').trim()))
    || null;

  await wait(150, 400);
  if (btn) {
    btn.click();
    return { ok: true, keep: !!(keep && keep.checked), via: btn.id || 'text' };
  }
  // 버튼을 못 찾아도 포기하지 않는다 — 사람이 비번칸에서 엔터를 치는 것과 같은 경로.
  // (그래도 실패하면 화면을 띄워 사람에게 넘긴다 — 여기서 추측 재시도는 하지 않는다.)
  const form = pwEl.form || document.querySelector('form');
  if (form) {
    pwEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.submit();
    return { ok: true, keep: !!(keep && keep.checked), via: 'form-submit' };
  }
  return { ok: false, reason: 'submit-not-found' };
})()
`;

/**
 * 로그인 화면의 현재 상태 — 자동 로그인이 어디서 막혔는지 가른다.
 * 넷은 대응이 전부 다르다: 캡차/2단계는 **사람에게 넘겨야** 하고, 비밀번호 오류는
 * **절대 재시도하면 안 된다**(반복 실패는 계정 잠금이다).
 */
export const loginPageStateJs = `
(() => {
  const text = (document.body && document.body.innerText) || '';
  const path = location.pathname;
  const url = location.href;
  const errEl = document.querySelector('.error_message, #err_common, .error_msg, [class*="error_"]');
  const error = ((errEl && errEl.innerText) || '').replace(/\\s+/g, ' ').trim();
  return {
    url: url.slice(0, 200),
    host: location.host,
    onLoginPage: location.host === 'nid.naver.com' && /nidlogin/.test(path),
    captcha: !!document.querySelector('#captcha, .captcha, img[src*="captcha"], input#chptcha, [id*="captcha" i]'),
    // 새 기기 등록 / 2단계 인증 — 사람이 휴대폰을 봐야 넘어간다.
    needHuman: /deviceConfirm|need2|otp|push/i.test(url)
      || text.includes('새로운 기기') || text.includes('기기 등록') || text.includes('일회용 번호')
      || text.includes('2단계 인증') || text.includes('인증번호'),
    // 자격증명 오류 — 재시도 금지 신호.
    badCredential: /아이디\\s*또는\\s*비밀번호|비밀번호가\\s*일치하지|가입되지\\s*않은/.test(text),
    error: error.slice(0, 200),
    textHead: text.replace(/\\s+/g, ' ').slice(0, 300),
  };
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
  const host = location.host;
  const text = (document.body && document.body.innerText || '');
  const html = (document.body && document.body.innerHTML || '');
  const title = document.title || '';

  // 로그인 요구 — 목록 페이지(search.shopping.naver.com)는 로그인 세션이 없으면 여기로 튄다(실측).
  // ★ 차단도 캡차도 아니다. 셋을 섞으면 "쿨다운" 으로 오진해서 아무리 기다려도 안 풀린다.
  const loginRequired = host === 'nid.naver.com' || /\\/nidlogin/.test(location.pathname);

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

  // ★ 판정에는 주소 전체(url)가 아니라 host+path 만 쓴다.
  //   로그인 페이지 주소가 ?url=https://search.shopping.naver.com/... 처럼 **원래 가려던 주소를
  //   쿼리에 달고** 오기 때문에, url.includes 로 보면 로그인 화면을 "안전한 쇼핑 페이지"로
  //   오판한다(실측 — 그래서 로그인 리다이렉트가 그냥 '차단' 으로 찍혔다).
  const where = host + location.pathname;

  function isCaptcha() {
    // ① 오탐 방지 — 목록/검색 같은 안전 페이지는 '확실한 증거'가 있을 때만 캡차로 본다.
    //    (여기가 없으면 정상 카테고리 페이지를 캡차로 오인해 수집이 영영 멈춘다)
    if (SAFE_PAGES.some(s => where.includes(s))) {
      if (document.querySelector('input#rcpt_answer, input[name="captcha"]')) return true;
      if (text.includes('[?]') && text.includes('빈 칸을 채워주세요')) return true;
      if (text.length < 1000 && ['접속이 일시적으로 제한', '쇼핑 서비스 접속이', '보안 확인을 완료해 주세요']
          .some(s => text.includes(s))) return true;
      return false;
    }
    if (CAPTCHA_URLS.some(p => where.includes(p))) return true;
    if (CAPTCHA_TEXTS.some(p => text.includes(p))) return true;
    if (CAPTCHA_DOM.some(sel => { try { return !!document.querySelector(sel); } catch (e) { return false; } })) return true;
    // ⑤ 스마트스토어 전용 보안 페이지 — 본문이 거의 없고 확인/인증/보안 문구만 있는 형태
    if ((url.includes('smartstore') || url.includes('brand.naver')) && text.length < 500
        && ['확인', '인증', '보안'].some(s => text.includes(s))) return true;
    return false;
  }

  const captcha = loginRequired ? false : isCaptcha();

  function isBlocked() {
    if (loginRequired) return false;                 // 로그인 요구는 차단이 아니다(기다려도 안 풀린다)
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
    url, captcha, loginRequired,
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
 * 상세 추출은 상품당 30~90초라 병목이지만, 카드 정보는 목록 한 장에서 수십 개가 한꺼번에
 * 나온다. 그래서 "먼저 넓게 리스팅 → 고른 것만 깊게" 가 가능해진다.
 *
 * ★ 1순위 출처는 화면 텍스트가 아니라 **앵커에 박힌 data-shp-contents-dtl** 이다(실측
 *   2026-08-18). 네이버가 자기 클릭로그용으로 상품명·가격·카테고리·nvMid 를 JSON 으로
 *   심어 둔다. 화면에서 긁으면 난독화 클래스와 배지 텍스트에 휘둘리지만 이건 안 흔들린다.
 *     data-shp-contents-dtl = [{key:'prod_nm',value:'특품 대추방울토마토 …'},{key:'price',…}]
 *     data-shp-contents-id  = nvMid
 *
 * ★ 앵커 텍스트를 제목으로 쓰면 안 된다 — 카드 링크의 innerText 는 접근성 라벨
 *   "새 창에서 열림" 뿐이다(실측: 수집 54건의 제목이 전부 이 문자열이었다).
 *
 * ★ 썸네일은 **data-src** 를 먼저 본다. 화면 밖 카드의 img.src 는 1×1 투명 data: URI
 *   placeholder 라, src 를 먼저 집으면 진짜 주소를 영영 못 본다(실측: 68장 중 67장이 placeholder).
 */
export const collectCardsJs = `
(() => {
  const out = new Map();
  const clean = (s) => String(s == null ? '' : s).replace(/\\s+/g, ' ').trim();
  // 제목 자리에 올 수 없는 접근성/배지 문구.
  const NOISE = /^(새 창에서 열림|광고|찜하기|장바구니|장바구니 담기|무료배송|오늘출발|톡톡)$/;

  /** 상품 URL 판별 — 목록에는 스마트스토어·브랜드·마켓·윈도가 섞여 나온다. */
  const parseProduct = (href) => {
    let u; try { u = new URL(href); } catch (e) { return null; }
    if (!/(^|\\.)naver\\.com$/.test(u.hostname)) return null;
    const p = u.pathname;
    let m;
    if ((m = p.match(/^\\/market\\/([\\w-]+)\\/products\\/(\\d+)/))) return { storeId: m[1], productNo: m[2] };
    if ((m = p.match(/^\\/window-products\\/([\\w-]+)\\/(\\d+)/))) return { storeId: m[1], productNo: m[2] };
    if ((m = p.match(/^\\/([\\w-]+)\\/products\\/(\\d+)/))) return { storeId: m[1], productNo: m[2] };
    return null;
  };

  const shpDetail = (a) => {
    try {
      const raw = a.getAttribute('data-shp-contents-dtl');
      if (!raw) return null;
      const o = {};
      for (const kv of JSON.parse(raw)) if (kv && kv.key) o[kv.key] = kv.value;
      return o;
    } catch (e) { return null; }
  };

  /** 카드 컨테이너 — 가격과 이미지를 함께 품은 가장 가까운 조상. */
  const cardOf = (a) => {
    let el = a;
    for (let i = 0; i < 8 && el.parentElement; i++) {
      if (/원/.test(el.innerText || '') && el.querySelector('img')) break;
      el = el.parentElement;
    }
    return el;
  };

  const thumbOf = (card) => {
    for (const im of card.querySelectorAll('img')) {
      const cands = [
        im.getAttribute('data-src'),
        im.dataset ? (im.dataset.original || im.dataset.lazySrc) : null,
        im.getAttribute('src'),
        im.currentSrc,
        (im.getAttribute('srcset') || '').split(',')[0].trim().split(' ')[0],
      ];
      for (const c of cands) {
        if (!c || /^data:/.test(c)) continue;      // 1×1 placeholder 는 주소가 아니다
        if (/pstatic\\.net|phinf/.test(c)) return c;
      }
    }
    return '';
  };

  /**
   * 트래킹 JSON 이 없는 카드용 폴백 — 접근성 라벨 → alt → 카드 안 텍스트 조각.
   * ★ 폴백으로 뽑은 문자열에는 홍보 문구가 붙어 온다(실측: 컬리·GS더프레시 카드에서
   *   "…복숭아 1.2kg(딱복) 할인 전 판매가 24,900원 20% 할인"). 상품명이 아닌 부분은
   *   **가장 앞의 홍보 표시에서 잘라낸다** — 뒤를 살리려다 이름까지 오염시키지 않는다.
   */
  const PROMO = /할인\\s*전\\s*판매가|정상\\s*가격|정상가|쿠폰\\s*할인|즉시\\s*할인|무료\\s*배송|리뷰\\s*[\\d,]+|\\d+%\\s*할인/;
  const trimPromo = (t) => clean(String(t == null ? '' : t).split(PROMO)[0]);

  const titleOf = (card, a) => {
    for (const id of (a.getAttribute('aria-labelledby') || '').split(/\\s+/)) {
      if (!id) continue;
      const el = document.getElementById(id);
      const t = trimPromo(el && el.innerText);
      if (t.length > 3 && !NOISE.test(t)) return t;
    }
    for (const im of card.querySelectorAll('img[alt]')) {
      const t = trimPromo(im.getAttribute('alt'));
      if (t.length > 3 && !NOISE.test(t)) return t;
    }
    let best = '';
    for (const el of card.querySelectorAll('strong, h1, h2, h3, h4, span, div, p')) {
      if (el.children.length) continue;                 // 잎 노드만 — 안 그러면 카드 전체가 잡힌다
      const t = trimPromo(el.innerText);
      if (t.length < 5 || t.length > 120) continue;
      if (NOISE.test(t) || /^[\\d,]+\\s*원?$/.test(t) || /^리뷰/.test(t)) continue;
      if (t.length > best.length) best = t;
    }
    return best;
  };

  for (const a of document.querySelectorAll('a[href]')) {
    const info = parseProduct(a.href || '');
    if (!info) continue;
    if (['search', 'products', 'category', 'best', 'new', 'sale', 'event', 'ns'].includes(info.storeId)) continue;

    const d = shpDetail(a);
    const card = cardOf(a);
    const text = clean(card.innerText);

    let price = parseInt(String((d && d.price) || '').replace(/[^0-9]/g, ''), 10) || 0;
    if (!price) {
      const pm = text.match(/([\\d,]{3,})\\s*원/);
      if (pm) price = parseInt(pm[1].replace(/,/g, ''), 10) || 0;
    }
    const rm = text.match(/리뷰\\s*([\\d,]+)/);

    const item = {
      productNo: info.productNo,
      storeId: info.storeId,
      url: (a.href || '').split('?')[0],
      title: clean((d && d.prod_nm) || '').slice(0, 160) || titleOf(card, a),
      price,
      thumb: thumbOf(card),
      reviewCount: rm ? parseInt(rm[1].replace(/,/g, ''), 10) : 0,
      nvMid: a.getAttribute('data-shp-contents-id') || '',
      catId: (d && d.cat_id) || '',
    };

    // 같은 상품이 여러 앵커(썸네일용·제목용)로 나온다. 예전엔 첫 앵커만 쓰고 나머지를 버려서
    // 제목이 통째로 날아갔다 — 이제 **필드별로 채워진 쪽**을 남긴다.
    const prev = out.get(info.productNo);
    out.set(info.productNo, !prev ? item : {
      ...prev,
      title: (prev.title || '').length >= (item.title || '').length ? prev.title : item.title,
      price: prev.price || item.price,
      thumb: prev.thumb || item.thumb,
      reviewCount: prev.reviewCount || item.reviewCount,
      nvMid: prev.nvMid || item.nvMid,
      catId: prev.catId || item.catId,
    });
  }
  return [...out.values()];
})()
`;

/**
 * 페이지 구조 진단 — "왜 안 긁혔나"를 추측하지 않으려고 실제 DOM 을 요약해 온다.
 *
 * 수집이 0건일 때 원인은 여러 가지다(목록이 아직 안 그려짐 / 링크 모양이 바뀜 / 이 페이지가
 * 애초에 상품 목록이 아님 / 차단). 이 넷은 **화면을 보면 바로 갈리는데** 로그만 보면 전부 똑같이
 * "0건" 이다. 그래서 링크 모양 분포·상품 링크 표본·본문 앞부분을 통째로 떠서 파일로 남긴다.
 */
export const probePageJs = `
(() => {
  const shapeOf = (u) => {
    try { const x = new URL(u); return x.host + x.pathname.replace(/\\d+/g, 'N'); } catch { return '(bad)'; }
  };
  const anchors = [...document.querySelectorAll('a[href]')];
  const tally = {};
  for (const a of anchors) { const s = shapeOf(a.href); tally[s] = (tally[s] || 0) + 1; }
  const shapes = Object.entries(tally).sort((x, y) => y[1] - x[1]).slice(0, 25).map(([shape, n]) => ({ shape, n }));

  const productish = anchors
    .filter((a) => /product/i.test(a.href))
    .slice(0, 12)
    .map((a) => ({
      href: (a.href || '').split('?')[0].slice(0, 160),
      text: (a.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
    }));

  const imgs = [...document.querySelectorAll('img')];
  const body = (document.body && document.body.innerText) || '';
  const cut = (s, n) => String(s == null ? '' : s).replace(/\\s+/g, ' ').trim().slice(0, n);

  // ── 스크롤 실태 ────────────────────────────────────────────────────────
  // "스크롤했는데 아무것도 안 늘었다"의 원인은 둘 중 하나다: 애초에 안 움직였거나(내부
  // 컨테이너가 스크롤 주체), 움직였는데 더 불러올 게 없거나. scrollY 를 안 재면 영원히 안 갈린다.
  const se = document.scrollingElement;
  const scrollables = [];
  for (const el of document.querySelectorAll('div, main, section, ul')) {
    const cs = getComputedStyle(el);
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 200) {
      scrollables.push({
        tag: el.tagName, cls: cut(el.className, 40), id: cut(el.id, 30),
        sh: el.scrollHeight, ch: el.clientHeight, st: el.scrollTop,
      });
      if (scrollables.length >= 8) break;
    }
  }

  // ── 상품 카드 1장의 실제 생김새 ────────────────────────────────────────
  // 제목·썸네일을 어디서 뽑아야 하는지는 마크업을 봐야만 정해진다. 클래스명 추측은 수명이 없다.
  const firstProductA = anchors.find((a) => /\\/products\\/\\d+|\\/window-products\\/[\\w-]+\\/\\d+/.test(a.href || ''));
  let cardHtml = null, cardImgs = [], cardAnchors = [];
  if (firstProductA) {
    let card = firstProductA;
    for (let i = 0; i < 8 && card.parentElement; i++) {
      if ((card.innerText || '').includes('원') && card.querySelector('img')) break;
      card = card.parentElement;
    }
    cardHtml = cut(card.outerHTML, 3000);
    cardImgs = [...card.querySelectorAll('img')].slice(0, 4).map((im) => ({
      src: cut(im.getAttribute('src'), 140),
      currentSrc: cut(im.currentSrc, 140),
      srcset: cut(im.getAttribute('srcset'), 140),
      alt: cut(im.getAttribute('alt'), 100),
      cls: cut(im.className, 40),
      data: Object.fromEntries(Object.entries(im.dataset || {}).slice(0, 8).map(([k, v]) => [k, cut(v, 120)])),
    }));
    cardAnchors = [...card.querySelectorAll('a[href]')].slice(0, 6).map((a) => ({
      href: cut((a.href || '').split('?')[0], 120),
      text: cut(a.innerText, 90),
      aria: cut(a.getAttribute('aria-label'), 90),
    }));
  }

  // ── 더 불러오는 장치 ───────────────────────────────────────────────────
  // 무한스크롤이 아니라 '더보기' 버튼이나 페이지네이션이면 스크롤은 영원히 헛돈다.
  const MORE_RE = /더\\s*보기|더보기|다음\\s*페이지|다음|more|show more|전체\\s*보기/i;
  const moreButtons = [...document.querySelectorAll('button, a, [role="button"]')]
    .filter((el) => MORE_RE.test((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || '')))
    .slice(0, 10)
    .map((el) => ({ tag: el.tagName, text: cut(el.innerText || el.getAttribute('aria-label'), 40), href: cut(el.getAttribute('href'), 100) }));
  const pageAnchors = anchors
    .filter((a) => /[?&](page|pagingIndex|pageIndex|start|offset)=/i.test(a.href || ''))
    .slice(0, 10)
    .map((a) => ({ href: cut(a.href, 140), text: cut(a.innerText, 20) }));

  return {
    url: location.href,
    title: document.title,
    counts: {
      anchors: anchors.length,
      hrefProductsPlural: anchors.filter((a) => (a.href || '').includes('/products/')).length,
      hrefProductSingular: anchors.filter((a) => /\\/product\\//.test(a.href || '')).length,
      hrefWindowProducts: anchors.filter((a) => /\\/window-products\\//.test(a.href || '')).length,
      hrefNvMid: anchors.filter((a) => /nvmid=/i.test(a.href || '')).length,
      roleLinks: document.querySelectorAll('[role="link"]').length,
      imgs: imgs.length,
      imgsPstatic: imgs.filter((i) => /pstatic\\.net/.test(i.src || '')).length,
      imgsDataUri: imgs.filter((i) => /^data:/.test(i.getAttribute('src') || '')).length,
      imgsNoSrc: imgs.filter((i) => !i.getAttribute('src')).length,
      wonInText: (body.match(/원/g) || []).length,
      scrollHeight: document.body ? document.body.scrollHeight : 0,
    },
    scroll: {
      scrollY: window.scrollY,
      innerHeight: window.innerHeight,
      docTop: se ? se.scrollTop : null,
      docHeight: se ? se.scrollHeight : null,
      docClient: se ? se.clientHeight : null,
      scrollables,
    },
    moreButtons,
    pageAnchors,
    cardHtml,
    cardImgs,
    cardAnchors,
    shapes,
    productish,
    text: body.replace(/\\s+/g, ' ').slice(0, 1200),
  };
})()
`;

/**
 * 상품 페이지 진단 — 옵션·상세이미지·리뷰이미지가 **실제로 어디에 있는지** 찍어 온다.
 * ---------------------------------------------------------------------------
 * 목록에서 배운 교훈을 그대로 적용한다: 화면 텍스트를 긁기 전에 **페이지가 이미 들고 있는
 * 구조화 데이터**부터 찾는다. 목록 카드는 data-shp-contents-dtl 에 상품명·가격이 통째로
 * 들어 있었고, 그걸 몰라서 54건의 제목이 전부 "새 창에서 열림" 이었다.
 *
 * 스마트스토어는 보통 window.__PRELOADED_STATE__ 에 옵션 조합까지 든 JSON 을 실어 준다.
 * 있으면 DOM 파싱이 통째로 필요 없어진다 — 그래서 **키 이름만** 먼저 떠 온다(본문은 수 MB라
 * 통째로 가져오면 IPC 가 막힌다).
 */
export const probeProductJs = `
(async () => {
  const cut = (s, n) => String(s == null ? '' : s).replace(/\\s+/g, ' ').trim().slice(0, n);
  const keysOf = (o, d) => {
    if (!o || typeof o !== 'object') return typeof o;
    const ks = Object.keys(o).slice(0, 40);
    if (!d) return ks;
    const out = {};
    for (const k of ks) {
      const v = o[k];
      out[k] = Array.isArray(v) ? ('array[' + v.length + ']')
        : (v && typeof v === 'object') ? Object.keys(v).slice(0, 25)
        : typeof v;
    }
    return out;
  };

  // ── ① 페이지가 들고 있는 구조화 데이터 ──────────────────────────────────
  const states = {};
  for (const name of ['__PRELOADED_STATE__', '__NEXT_DATA__', '__NUXT__', '__APOLLO_STATE__']) {
    try {
      if (window[name]) states[name] = { top: keysOf(window[name], true), size: JSON.stringify(window[name]).length };
    } catch (e) { states[name] = { error: String(e && e.message) }; }
  }
  // 옵션이 들어 있을 법한 자리를 이름으로 훑는다(경로를 모르니 넓게).
  const optionHits = [];
  const walk = (o, path, depth) => {
    if (!o || typeof o !== 'object' || depth > 5 || optionHits.length > 12) return;
    for (const k of Object.keys(o)) {
      if (/option|Option/.test(k)) {
        const v = o[k];
        optionHits.push({
          path: path + '.' + k,
          kind: Array.isArray(v) ? 'array[' + v.length + ']' : typeof v,
          sample: Array.isArray(v) && v[0] ? cut(JSON.stringify(v[0]), 300) : cut(JSON.stringify(v), 200),
        });
      }
      const v = o[k];
      if (v && typeof v === 'object') walk(v, path + '.' + k, depth + 1);
    }
  };
  try { if (window.__PRELOADED_STATE__) walk(window.__PRELOADED_STATE__, 'PRELOADED', 0); } catch (e) { /* ignore */ }

  // JSON-LD
  const ld = [];
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const d = JSON.parse(s.textContent);
      for (const x of (Array.isArray(d) ? d : [d])) if (x && x['@type']) ld.push({ type: x['@type'], keys: Object.keys(x).slice(0, 20) });
    } catch (e) { /* ignore */ }
  }

  // ── ② 옵션 UI ───────────────────────────────────────────────────────────
  const optionUi = {
    selects: [...document.querySelectorAll('select')].slice(0, 6).map((s) => ({
      name: s.name || s.id || '', count: s.options.length,
      sample: [...s.options].slice(0, 4).map((o) => cut(o.textContent, 40)),
    })),
    comboButtons: [...document.querySelectorAll('[role="combobox"], [role="listbox"], button')]
      .filter((b) => /옵션|선택|option/i.test((b.innerText || '') + (b.getAttribute('aria-label') || '')))
      .slice(0, 8)
      .map((b) => ({ tag: b.tagName, text: cut(b.innerText || b.getAttribute('aria-label'), 40) })),
  };

  // ── ③ 이미지 — 어디에 몇 장이 어떤 방식으로 있나 ────────────────────────
  const imgInfo = (im) => ({
    src: cut(im.getAttribute('src'), 110),
    dataSrc: cut(im.getAttribute('data-src'), 110),
    alt: cut(im.getAttribute('alt'), 60),
    cls: cut(im.className, 50),
    w: im.naturalWidth || im.width || 0,
  });
  const all = [...document.querySelectorAll('img')];
  const pstatic = all.filter((i) => /pstatic\\.net|phinf/.test((i.getAttribute('src') || '') + (i.getAttribute('data-src') || '')));

  // ── ④ 품절 판정이 남의 상품을 읽는가 ────────────────────────────────────
  // 품절 감시는 JSON.stringify(__PRELOADED_STATE__) 전체에서 **첫 번째** productStatusType 을
  // 정규식으로 집는다. 그런데 이 state 에는 추천·연관·카테고리 상품 묶음이 함께 들어 있고,
  // 실측상 본 상품(product)은 최상위 키 순서에서 한참 뒤다. 첫 매치가 정말 본 상품인지
  // **문자열 위치로** 확인한다 — 추측 대신 증거로 가른다.
  let stateAudit = null;
  try {
    const raw = JSON.stringify(window.__PRELOADED_STATE__ || {});
    // (진단용 정규식 스캔은 제거했다 — 템플릿 리터럴에서 백슬래시가 먹혀 조용히 틀린 답을 준다.
    //  실측은 이미 끝났다: 상태·가격은 아래 신원 기반 노드에서 직접 읽는다.)
    const hits = [], priceHits = [];

    // 이 URL 이 가리키는 상품번호 — 정규식을 쓰지 않는다(템플릿 리터럴에서 백슬래시가 먹혀
    // 조용히 틀린 답을 준 전례가 있다). 경로 마지막 조각이 6자리 이상 숫자면 그것이다.
    const _segs = location.pathname.split('/').filter(Boolean);
    const _last = _segs[_segs.length - 1] || '';
    const wantNo = (_last.length >= 6 && String(Number(_last)) === _last) ? _last : null;

    // 권위 필드(productStatusType)를 든 노드를 전부 모은다 — 자리를 믿지 않고 신원으로 고르려고.
    const cands = [];
    const stack = [[window.__PRELOADED_STATE__, 0]];
    while (stack.length && cands.length < 40) {
      const [node, depth] = stack.pop();
      if (!node || typeof node !== 'object' || depth > 6) continue;
      if (Array.isArray(node)) { for (const v of node.slice(0, 60)) stack.push([v, depth + 1]); continue; }
      if (typeof node.productStatusType === 'string' && node.productStatusType) cands.push(node);
      for (const k of Object.keys(node)) { const v = node[k]; if (v && typeof v === 'object') stack.push([v, depth + 1]); }
    }
    const same = (v) => v != null && String(v) === String(wantNo);

    const prod = cands.find((n) => same(n.productNo) || same(n.id) || same(n.channelProductNo) || same(n.originProductNo))
      || (cands.length === 1 ? cands[0] : null)
      || (window.__PRELOADED_STATE__ && window.__PRELOADED_STATE__.product);
    stateAudit = {
      rawLen: raw.length,
      topKeys: Object.keys(window.__PRELOADED_STATE__ || {}),
      productKeyIndex: Object.keys(window.__PRELOADED_STATE__ || {}).indexOf('product'),
      productNodeAt: raw.indexOf('"product":'),
      wantNo,
      candidateCount: cands.length,
      candidateIds: cands.slice(0, 6).map((n) => String(n.productNo || n.id || n.channelProductNo || '?')),
      statusHits: hits,
      priceHits,
      // 본 상품 노드가 실제로 들고 있는 값 — 고칠 때 여기를 직접 읽으면 된다.
      product: prod ? {
        keys: Object.keys(prod).slice(0, 60),
        A: prod.A ? Object.keys(prod.A).slice(0, 60) : null,
        productStatusType: prod.productStatusType || (prod.A && prod.A.productStatusType) || null,
        channelProductDisplayStatusType: prod.channelProductDisplayStatusType || (prod.A && prod.A.channelProductDisplayStatusType) || null,
        salePrice: prod.salePrice || (prod.A && prod.A.salePrice) || null,
        optionCombinationsLen: (prod.optionCombinations || (prod.A && prod.A.optionCombinations) || []).length,
        optionSample: cut(JSON.stringify((prod.optionCombinations || (prod.A && prod.A.optionCombinations) || [])[0]), 400),
        // 옵션이 어느 이름으로 들어 있는지 모르니 **본 상품 노드 안의 option* 키를 전부** 훑는다.
        optionKeys: Object.keys(prod).filter((k) => /option/i.test(k)).map((k) => ({
          key: k,
          kind: Array.isArray(prod[k]) ? 'array[' + prod[k].length + ']' : typeof prod[k],
          sample: cut(JSON.stringify(Array.isArray(prod[k]) ? prod[k][0] : prod[k]), 300),
        })),
        // 상세 본문·이미지가 어디 있는지도 같이 본다(상세 추출기가 읽어야 할 자리).
        contentLen: typeof prod.content === 'string' ? prod.content.length : null,
        contentHead: cut(typeof prod.content === 'string' ? prod.content : '', 300),
        productImages: Array.isArray(prod.productImages) ? prod.productImages.length : null,
        productImageSample: cut(JSON.stringify((prod.productImages || [])[0]), 250),
        channelProductImages: Array.isArray(prod.channelProductImages) ? prod.channelProductImages.length : null,
        detailAttrs: Array.isArray(prod.channelProductAttributes) ? prod.channelProductAttributes.length : null,
        originArea: cut(JSON.stringify(prod.originAreaInfo), 200),
      } : null,
    };
  } catch (e) { stateAudit = { error: String(e && e.message) }; }

  // ── ⑤ 옵션·상세는 나중에 온다 — 어디서 오는지 찾는다 ────────────────────
  // 실측: 로드 직후 state 의 상품 노드에는 optionUsable=true 인데 optionCombinations 가 0이고
  // content·productImages·고시정보가 전부 null 이다. 즉 화면이 뜬 뒤 **별도 요청**으로 채운다.
  // 그 요청의 주소를 알면 상세 추출기가 DOM 을 긁을 필요 없이 정확한 JSON 을 받을 수 있다.
  let network = null;
  try {
    const res = performance.getEntriesByType('resource') || [];
    const EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.css', '.woff', '.woff2', '.svg', '.ico'];
    const KEY = ['/api/', 'graphql', '.json', 'detail', 'option', 'product'];
    const interesting = res
      .map((e) => String(e.name || ''))
      .filter((u) => { const base = u.split('?')[0].toLowerCase(); return !EXT.some((x) => base.endsWith(x)); })
      .filter((u) => { const low = u.toLowerCase(); return KEY.some((k) => low.indexOf(k) >= 0); });
    network = {
      total: res.length,
      apiCount: interesting.length,
      // 같은 주소가 반복되므로 중복을 접고 앞부분만 본다.
      urls: [...new Set(interesting)].slice(0, 30).map((u) => u.slice(0, 190)),
    };
  } catch (e) { network = { error: String(e && e.message) }; }

  // 하이드레이션이 늦을 뿐일 수도 있다 — 잠깐 기다렸다 다시 본다.
  await new Promise((r) => setTimeout(r, 4000));
  let afterWait = null;
  try {
    const cands2 = [];
    const stack2 = [[window.__PRELOADED_STATE__, 0]];
    while (stack2.length && cands2.length < 40) {
      const [node, depth] = stack2.pop();
      if (!node || typeof node !== 'object' || depth > 6) continue;
      if (Array.isArray(node)) { for (const v of node.slice(0, 60)) stack2.push([v, depth + 1]); continue; }
      if (typeof node.productStatusType === 'string' && node.productStatusType) cands2.push(node);
      for (const k of Object.keys(node)) { const v = node[k]; if (v && typeof v === 'object') stack2.push([v, depth + 1]); }
    }
    const best = cands2[0] || {};
    afterWait = {
      candidates: cands2.length,
      optionCombinations: (best.optionCombinations || []).length,
      contentLen: typeof best.content === 'string' ? best.content.length : null,
      productImages: Array.isArray(best.productImages) ? best.productImages.length : null,
      // 화면에 실제로 그려진 옵션 UI — API 를 못 찾으면 여기서라도 읽어야 한다.
      selects: [...document.querySelectorAll('select')].length,
      optionTexts: [...document.querySelectorAll('[class*="option" i]')].slice(0, 6)
        .map((el) => cut(el.innerText, 80)).filter(Boolean),
      detailImgs: [...document.querySelectorAll('img')].filter((im) => /pstatic|phinf/.test((im.getAttribute('src') || '') + (im.getAttribute('data-src') || ''))).length,
    };
  } catch (e) { afterWait = { error: String(e && e.message) }; }


  // ── ⑥ 상품 API 를 직접 불러 본다 ────────────────────────────────────────
  // 옵션·상세·고시정보는 화면이 뜬 뒤 JSON API 로 온다(위 network 목록에서 확인). 페이지
  // 안에서 같은 주소를 부르면 쿠키·referer 가 그대로라 정상 응답이 온다. 상세 추출기를
  // DOM 파싱으로 짜기 전에, 이 경로가 진짜 되는지부터 확인한다.
  let api = null;
  try {
    const urls = (network && network.urls) || [];
    const marker = '/n/v2/channels/';
    let channelId = null;
    for (const u of urls) {
      const i = u.indexOf(marker);
      if (i < 0) continue;
      channelId = u.slice(i + marker.length).split('/')[0].split('?')[0];
      if (channelId) break;
    }
    // 원상품번호 — 상세·고시정보는 이 번호를 쓴다(채널상품번호와 다르다).
    let originNo = null;   // 응답에서 확정한다
    for (const u of urls) {
      const k = u.indexOf('/contents/');
      if (k > 0) { originNo = u.slice(k + 10).split('/')[0]; break; }
    }
    // wantNo 는 앞 블록(try) 안에 갇혀 있어 여기서 다시 구한다.
    const _s2 = location.pathname.split('/').filter(Boolean);
    const _l2 = _s2[_s2.length - 1] || '';
    const wantNo = (_l2.length >= 6 && String(Number(_l2)) === _l2) ? _l2 : null;
    const base = location.origin;
    const get = async (path) => {
      const res = await fetch(base + path, { credentials: 'include', headers: { accept: 'application/json' } });
      const txt = await res.text();
      let json = null;
      try { json = JSON.parse(txt); } catch (e) { /* HTML 응답일 수 있다 */ }
      return { status: res.status, len: txt.length, json, head: cut(txt, 200) };
    };

    api = { channelId, originNo, wantNo, calls: {} };
    if (channelId && wantNo) {
      const main = await get('/n/v2/channels/' + channelId + '/products/' + wantNo + '?withWindow=false');
      const mj = main.json || {};
      api.calls.product = {
        status: main.status, len: main.len,
        topKeys: mj && typeof mj === 'object' ? Object.keys(mj).slice(0, 40) : null,
        optionCombinations: (mj.optionCombinations || (mj.productOption && mj.productOption.optionCombinations) || []).length,
        optionKeys: mj && typeof mj === 'object' ? Object.keys(mj).filter((k) => k.toLowerCase().indexOf('option') >= 0) : null,
        sample: cut(JSON.stringify(mj.optionCombinations || (mj.productOption || {}).optionCombinations || []).slice(0, 400), 400),
        head: main.json ? null : main.head,
      };
      // ★ 원상품번호는 URL 에서 긁지 말고 **응답에서 받는다**(URL 파싱은 /n/v1/contents/reviews/…
      //   같은 다른 주소에 걸려 "reviews" 를 집었다 — 실측). 상세·고시정보가 이 번호를 쓴다.
      originNo = mj.originProductNo || mj.productNo || mj.id || originNo;
      api.originNo = originNo;
      if (originNo) {
        const cont = await get('/n/v2/channels/' + channelId + '/products/' + wantNo + '/contents/' + originNo + '/PC?isResponsive=true');
        api.calls.contents = { status: cont.status, len: cont.len,
          topKeys: cont.json && typeof cont.json === 'object' ? Object.keys(cont.json).slice(0, 25) : null,
          head: cut(cont.head, 200) };
        const notice = await get('/n/v2/channels/' + channelId + '/products/' + originNo + '/provided-notice');
        api.calls.providedNotice = { status: notice.status, len: notice.len, head: cut(notice.head, 250) };
      }
    }
  } catch (e) { api = { error: String(e && e.message) }; }

  // ── ⑦ 리뷰 본문 API 실측 ────────────────────────────────────────────────
  // 상세글을 "후기처럼" 쓰라고만 하고 정작 진짜 후기는 주지 않는다. 구매자가 실제로 쓰는
  // 표현과 자주 나오는 칭찬·불만 포인트를 재료로 주면 흉내가 아니라 결이 살아난다.
  // 사진 API(gallery-attaches)는 이미 되므로, 본문 API 도 되는지 여기서 확인한다.
  let reviewProbe = null;
  try {
    const _s3 = location.pathname.split('/').filter(Boolean);
    const _l3 = _s3[_s3.length - 1] || '';
    const cpNo = (_l3.length >= 6 && String(Number(_l3)) === _l3) ? _l3 : null;
    let ch = null, base = '/n';
    let merchant = null, originNo = null;
    for (const e of (performance.getEntriesByType('resource') || [])) {
      const u = String(e.name || '');
      for (const m of ['/n/v2/channels/', '/i/v2/channels/']) {
        const i = u.indexOf(m);
        if (i >= 0 && !ch) { ch = u.slice(i + m.length).split('/')[0].split('?')[0]; base = m.slice(0, 2); }
      }
      const k = u.indexOf('checkoutMerchantNo=');
      if (k >= 0 && !merchant) merchant = u.slice(k + 19).split('&')[0];
      const r = u.indexOf('/contents/reviews/product-summary/');
      if (r >= 0 && !originNo) originNo = u.slice(r + 34).split('/')[0].split('?')[0];
    }
    const get = async (path) => {
      const res = await fetch(location.origin + path, { credentials: 'include', headers: { accept: 'application/json' } });
      const txt = await res.text();
      let json = null; try { json = JSON.parse(txt); } catch (e) { /* HTML 이면 그대로 본다 */ }
      return { status: res.status, len: txt.length, json, head: cut(txt, 200) };
    };
    reviewProbe = { ch, base, merchant, originNo, cpNo, tries: {} };
    if (ch && originNo && merchant) {
      // 페이지가 실제로 부른 것과 같은 모양으로 — 파라미터를 바꾸면 400 이 난다(실측).
      const a = await get(base + '/v1/contents/reviews/product-summary/' + originNo
        + '/reviews/STORE_PICK?checkoutMerchantNo=' + merchant + '&searchSortType=REVIEW_RANKING&page=1&pageSize=20');
      reviewProbe.tries.storePick = {
        status: a.status, len: a.len,
        keys: a.json && typeof a.json === 'object' ? Object.keys(a.json).slice(0, 12) : null,
        sample: cut(JSON.stringify((a.json && (a.json.contents || a.json.reviews || [])) [0] || null), 500),
        head: a.json ? null : a.head,
      };
    }
  } catch (e) { reviewProbe = { error: String(e && e.message) }; }

  // runOne 은 data.name 으로 "페이지가 덜 로드됐는지"를 판정하고 없으면 재시도한다.
  // 진단이라고 이 계약을 어기면 멀쩡한 페이지를 3번 다시 여는 낭비가 된다.
  const og = document.querySelector('meta[property="og:title"]');
  const name = cut((og && og.content) || document.title, 160);

  return {
    name,
    stateAudit,
    reviewProbe,
    api,
    network,
    afterWait,
    url: location.href.slice(0, 200),
    title: cut(document.title, 120),
    textLen: ((document.body && document.body.innerText) || '').length,
    states,
    optionHits,
    ld,
    optionUi,
    images: {
      total: all.length,
      pstatic: pstatic.length,
      lazyOnly: all.filter((i) => !i.getAttribute('src') || /^data:/.test(i.getAttribute('src') || '')).length,
      samples: pstatic.slice(0, 8).map(imgInfo),
    },
    // 리뷰 영역 — 별도 탭/지연로딩이면 여기 수가 0 이고, 그 사실이 곧 설계 정보다.
    review: {
      sectionText: cut((document.querySelector('#REVIEW, [id*="review" i], [class*="review" i]') || {}).innerText, 200),
      countHint: cut(((document.body && document.body.innerText) || '').match(/리뷰\\s*[\\d,]+/) || [''], 30),
    },
    textHead: cut((document.body && document.body.innerText) || '', 600),
  };
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
