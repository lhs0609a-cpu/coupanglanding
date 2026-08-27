/**
 * 진짜 크롬 조종 — CDP over pipe. 의존성 0, 디버깅 포트도 열지 않는다.
 * ---------------------------------------------------------------------------
 * ⭐ 왜 Electron 창을 버리고 크롬으로 오나(실측 2026-08-25):
 *
 *   우리가 "클릭 이동"이라 부르던 것(inject.mjs navigateViaClickJs)은 진짜 클릭이 **아니다**.
 *   `new MouseEvent('click')` 을 `dispatchEvent` 한 것이라 `event.isTrusted === false` 다.
 *   안티봇이 가장 먼저 보는 값이 그거다. 그래서 목록 페이지에 들어가면 카드가 스켈레톤에
 *   머물러 47개에서 멈췄다(사람 크롬에서는 계속 늘어난다 — 사용자 실측).
 *
 *   CDP 의 `Input.dispatchMouseEvent` 는 **브라우저 입력 파이프라인**을 그대로 탄다.
 *   렌더러가 받는 이벤트는 `isTrusted === true` 이고, 사람이 마우스로 누른 것과 구분되지 않는다.
 *   이게 Electron 창으로는 흉내 낼 수 없는 유일한 차이이고, 크롬으로 옮기는 이유 전부다.
 *
 * ⚠️ 왜 포트가 아니라 파이프인가: `--remote-debugging-port` 는 그 PC 의 아무 프로세스나
 *   접속할 수 있는 구멍을 연다(같은 머신의 웹페이지도 노린다). `--remote-debugging-pipe` 는
 *   부모 프로세스가 쥔 fd 3/4 로만 말이 통해서 그 구멍이 아예 없다.
 *
 * 프로토콜: fd3 으로 쓰고 fd4 로 읽는다. 메시지는 JSON + `\0` 구분.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); t.unref?.(); });
const rand = (min, max) => min + Math.random() * (max - min);

/** 크롬 실행파일 — 설치 위치가 셋뿐이라 레지스트리까지 안 뒤져도 된다. */
export function findChrome() {
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || '';
  const candidates = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : [
      join(pf, 'Google/Chrome/Application/chrome.exe'),
      join(pf86, 'Google/Chrome/Application/chrome.exe'),
      local && join(local, 'Google/Chrome/Application/chrome.exe'),
    ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || null;
}

export class ChromeBrowser {
  constructor({ profileDir, onLog = () => {}, windowSize = '1440,1000' } = {}) {
    this.profileDir = profileDir;
    this.onLog = onLog;
    this.windowSize = windowSize;
    this.child = null;
    this._nextId = 1;
    this._pending = new Map();
    this._buf = Buffer.alloc(0);
    this._events = new Map();      // `${sessionId}:${method}` → Set<fn>
  }

  async launch() {
    if (this.child) return this;
    const exe = findChrome();
    if (!exe) throw new Error('크롬을 찾지 못했습니다 — 구글 크롬을 설치해 주세요.');
    mkdirSync(this.profileDir, { recursive: true });

    this.child = spawn(exe, [
      '--remote-debugging-pipe',
      `--user-data-dir=${this.profileDir}`,
      // navigator.webdriver 를 지운다 — 파이프만 붙여도 크롬이 이 값을 켜 버린다.
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate,MediaRouter',
      `--window-size=${this.windowSize}`,
      'about:blank',
    ], { stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'] });

    this._wr = this.child.stdio[3];
    this._rd = this.child.stdio[4];
    this._rd.on('data', (c) => this._onData(c));
    this.child.stderr?.on('data', () => { /* 크롬 잡음은 버린다 */ });
    this.child.on('exit', () => { this.child = null; });

    await sleep(1200);
    const v = await this.send('Browser.getVersion');
    this.onLog(`크롬 연결됨 — ${v.product}`);
    return this;
  }

  _onData(chunk) {
    this._buf = Buffer.concat([this._buf, chunk]);
    let i;
    // eslint-disable-next-line no-cond-assign
    while ((i = this._buf.indexOf(0)) !== -1) {
      const raw = this._buf.subarray(0, i).toString('utf8');
      this._buf = this._buf.subarray(i + 1);
      if (!raw) continue;
      let msg;
      try { msg = JSON.parse(raw); } catch { continue; }
      if (msg.id && this._pending.has(msg.id)) {
        const { resolve, reject, timer } = this._pending.get(msg.id);
        this._pending.delete(msg.id);
        clearTimeout(timer);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const key of [`${msg.sessionId || ''}:${msg.method}`, `*:${msg.method}`]) {
          for (const fn of this._events.get(key) || []) { try { fn(msg.params); } catch { /* ignore */ } }
        }
      }
    }
  }

  on(method, fn, sessionId = '*') {
    const key = `${sessionId}:${method}`;
    if (!this._events.has(key)) this._events.set(key, new Set());
    this._events.get(key).add(fn);
    return () => this._events.get(key)?.delete(fn);
  }

  send(method, params = {}, sessionId, timeoutMs = 30000) {
    if (!this.child) return Promise.reject(new Error('크롬이 떠 있지 않습니다.'));
    const id = this._nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this._pending.delete(id)) reject(new Error(`CDP 응답 없음: ${method}`));
      }, timeoutMs);
      timer.unref?.();
      this._pending.set(id, { resolve, reject, timer });
      this._wr.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      this._wr.write('\0');
    });
  }

  async newPage() {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new ChromePage(this, sessionId, targetId);
    await page._init();
    return page;
  }

  async close() {
    try { await this.send('Browser.close', {}, undefined, 5000); } catch { /* ignore */ }
    try { this.child?.kill(); } catch { /* ignore */ }
    this.child = null;
  }
}

export class ChromePage {
  constructor(browser, sessionId, targetId) {
    this.browser = browser;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this._loaded = false;
  }

  async _init() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('DOM.enable');

    // ★ 창이 뒤로 가도 **계속 그리게** 만든다(실측 2026-08-25).
    //   크롬은 창이 가려지면 렌더링을 늦춘다. 그러면 무한스크롤을 발화시키는
    //   IntersectionObserver 가 돌지 않아 목록이 첫 화면(약 49개)에서 멈춘다.
    //   같은 카테고리가 창이 앞에 있을 땐 244개, 뒤에 있을 땐 49개였다.
    //   focus 에뮬레이션은 렌더러에게 "너는 지금 포커스돼 있다"고 알려주는 것이라
    //   사람이 창을 안 보고 있어도 목록이 정상으로 이어진다.
    await this.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    await this.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});

    this.browser.on('Page.loadEventFired', () => { this._loaded = true; }, this.sessionId);
  }

  /** 렌더링이 늦춰지지 않게 다시 못을 박는다 — 페이지를 옮기면 풀리는 설정이 있다. */
  async keepRendering() {
    await this.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    await this.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  }

  send(method, params, timeoutMs) { return this.browser.send(method, params, this.sessionId, timeoutMs); }

  /**
   * 주소로 직접 이동 — **최초 진입점에만 쓴다.**
   * 목록·상품 페이지로 이 함수를 쓰면 네이버가 "쇼핑 서비스 접속이 일시적으로 제한되었습니다"
   * 를 돌려준다(실측 2026-08-25). 그 뒤부터는 반드시 clickLink 로 이동한다.
   */
  async goto(url, { timeoutMs = 30000, settleMs = 2500 } = {}) {
    this._loaded = false;
    await this.send('Page.navigate', { url }, timeoutMs);
    const until = Date.now() + timeoutMs;
    while (!this._loaded && Date.now() < until) await sleep(120);
    await sleep(settleMs);
    return this.url();
  }

  async evaluate(expression, { awaitPromise = false, timeoutMs = 30000 } = {}) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise,
    }, timeoutMs);
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'evaluate 실패');
    }
    return r.result?.value;
  }

  /** JSON 을 돌려주는 표현식 — 큰 결과(카드 수백 개)도 안전하게 넘어온다. */
  async evaluateJson(expression, opts) {
    const v = await this.evaluate(`JSON.stringify(${expression})`, opts);
    try { return JSON.parse(v); } catch { return null; }
  }

  async url() { return this.evaluate('location.href'); }

  async title() { return this.evaluate('document.title'); }

  /**
   * 화면 좌표를 실제로 눌러서 이동한다 — **여기가 이 파일의 존재 이유다.**
   * ---------------------------------------------------------------------------
   * `Input.dispatchMouseEvent` 는 브라우저의 진짜 입력 경로다. 렌더러가 받는 이벤트의
   * `isTrusted` 가 true 라서, 사람이 누른 것과 구분되지 않는다.
   * (Electron 에서 하던 `el.dispatchEvent(new MouseEvent(...))` 는 isTrusted=false 다.)
   *
   * @param {string} selectorOrText  CSS 선택자, 또는 `text=...` 로 텍스트 일치
   * @returns {Promise<{ok:boolean, reason?:string, href?:string, text?:string}>}
   */
  async clickLink(selectorOrText, { hoverMs = [600, 1000], timeoutMs = 8000 } = {}) {
    // ⚠️ scrollIntoView 와 좌표 읽기를 **한 번에 하면 안 된다**(실측 2026-08-25):
    //    네이버는 부드러운 스크롤을 쓰기 때문에 같은 블록에서 바로 getBoundingClientRect 를
    //    읽으면 **스크롤 전 좌표**가 나온다. 그 좌표를 누르면 엉뚱한 데를 눌러 아무 일도
    //    안 일어난다 — 형제 소분류 28칸이 전부 `no-navigation` 으로 밀린 원인이 이거였다.
    //    ① 요소를 화면에 올리고 → ② 잠깐 기다렸다가 → ③ 그때 좌표를 읽는다.
    const finder = `(() => {
      const q = ${JSON.stringify(selectorOrText)};
      if (q.startsWith('text=')) {
        const want = q.slice(5).trim();
        // ⚠️ 예전엔 a[href] 만 뒤졌다. 그런데 쇼핑 홈의 '카테고리' 는 **button** 이라
        //   영영 못 찾았다(실측 2026-08-26: 메뉴가 안 열려 진입 자체가 실패).
        return [...document.querySelectorAll('a[href], button, [role="button"], [role="menuitem"]')]
          .find(el => (el.innerText || el.textContent || '').replace(/\\s+/g,' ').trim() === want);
      }
      return document.querySelector(q);
    })()`;

    const brought = await this.evaluateJson(`(() => {
      const el = ${finder};
      if (!el) return { ok: false, reason: 'not-found' };
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      return { ok: true };
    })()`);
    if (!brought?.ok) return { ok: false, reason: brought?.reason || 'not-found' };
    await sleep(450);   // 부드러운 스크롤이 끝나기를 기다린다

    const found = await this.evaluateJson(`(() => {
      const el = ${finder};
      if (!el) return { ok: false, reason: 'not-found' };
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return { ok: false, reason: 'zero-size' };
      // 화면 밖이면 눌러도 소용없다 — 좌표가 뷰포트 안에 있는지 확인한다.
      if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) {
        return { ok: false, reason: 'offscreen' };
      }
      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + r.height / 2);
      // ★ 그 자리에 **진짜로 이게 있는지** 확인한다(실측 2026-08-25).
      //   쇼핑 홈에 멤버십 가입 팝업이 뜨면 링크는 DOM 에 그대로 있지만 그 위를 팝업이
      //   덮는다. 좌표만 믿고 누르면 팝업이 눌려 엉뚱한 페이지로 끌려간다.
      const top = document.elementFromPoint(x, y);
      if (!top || !(top === el || el.contains(top) || top.contains(el))) {
        const c = top ? (top.tagName + '.' + String(top.className || '').slice(0, 30)) : 'none';
        return { ok: false, reason: 'covered', coveredBy: c };
      }
      return {
        ok: true, x, y,
        href: el.href || '',
        text: (el.innerText || '').replace(/\\s+/g,' ').trim().slice(0, 40),
      };
    })()`);

    if (!found?.ok) {
      return { ok: false, reason: found?.reason || 'not-found', coveredBy: found?.coveredBy };
    }

    const before = await this.url();

    // 사람처럼: 근처로 이동 → 잠깐 머무름(hover 로 메뉴가 열리는 곳이 있다) → 누름
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: found.x - Math.round(rand(20, 60)), y: found.y - Math.round(rand(10, 30)), buttons: 0,
    });
    await sleep(rand(80, 180));
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: found.x, y: found.y, buttons: 0 });
    await sleep(rand(hoverMs[0], hoverMs[1]));
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: found.x, y: found.y, button: 'left', buttons: 1, clickCount: 1,
    });
    await sleep(rand(50, 130));
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: found.x, y: found.y, button: 'left', buttons: 0, clickCount: 1,
    });

    // SPA 라우팅이라 load 이벤트가 안 뜰 수 있다 — 주소가 바뀌는 것으로 판정한다.
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      await sleep(250);
      const now = await this.url().catch(() => before);
      if (now && now !== before) { await sleep(rand(1500, 2500)); return { ok: true, ...found, url: now }; }
    }
    return { ok: false, reason: 'no-navigation', href: found.href, text: found.text };
  }

  /**
   * **진짜 휠**로 내린다 — `window.scrollBy` 와 결정적으로 다르다.
   * ---------------------------------------------------------------------------
   * 클릭에서 이미 겪었다: 자바스크립트로 만든 입력은 브라우저 입력 파이프라인을 타지 않는다.
   * 스크롤도 같다. `Input.dispatchMouseEvent({type:'mouseWheel'})` 은 사람이 휠을 굴린 것과
   * 같은 경로로 들어가고, 그래야 지연 렌더·무한스크롤이 사람에게 하듯 반응한다.
   *
   * 한 번에 왕창 굴리지 않고 사람처럼 여러 번 나눠 굴린다 — 한 번에 바닥으로 뛰면
   * 중간 카드들이 화면을 스쳐 지나가 버려 렌더될 기회를 못 얻는다.
   */
  async wheel({ steps = 6, deltaY = 500, pauseMs = [180, 320], x = null, y = null } = {}) {
    // ★ **어디에 대고 굴리느냐가 중요하다**(실측 2026-08-26). 휠은 마우스 아래에 있는
    //   스크롤 영역에 먹는다. 목록 페이지 왼쪽 분류 사이드바는 자체 스크롤 영역이라
    //   (내용 2320px / 창 795px) 거기에 굴리면 **사이드바만 내려가고 상품은 그대로**다.
    //   딸기에서 49개 뒤로 더받기가 0회였던 게 이것이다. 상품 카드 위를 찾아 굴린다.
    if (x == null || y == null) {
      const p = await this.evaluateJson(`(() => {
        const card = document.querySelector('[class*="basicProductCard"], [class*="productCard"]');
        if (card) {
          const r = card.getBoundingClientRect();
          if (r.width > 0) return {
            x: Math.round(r.left + r.width / 2),
            y: Math.round(Math.min(Math.max(r.top + r.height / 2, 120), window.innerHeight - 120)),
          };
        }
        // 카드를 못 찾으면 오른쪽 3/4 지점 — 사이드바는 왼쪽에 있다.
        return { x: Math.round(window.innerWidth * 0.72), y: Math.round(window.innerHeight * 0.55) };
      })()`).catch(() => null);
      x = p?.x ?? 1000;
      y = p?.y ?? 500;
    }
    for (let i = 0; i < steps; i++) {
      const dist = Math.round(deltaY * (0.85 + Math.random() * 0.3));

      // 사람은 휠을 굴리는 동안 손이 미세하게 흔들린다. 우리는 mousemove 가 **0건**이었다 —
      // 네이버의 봇 판별(ncpt)이 보는 신호 중 하나가 그것이다. 굴리기 전에 몇 픽셀 움직인다.
      for (let k = 0; k < 2; k++) {
        await this.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: x + Math.round(rand(-14, 14)),
          y: y + Math.round(rand(-10, 10)),
          buttons: 0, pointerType: 'mouse',
        }).catch(() => {});
        await sleep(rand(25, 70));
      }
      // ★ `Input.dispatchMouseEvent({type:'mouseWheel'})` 는 **실제로 스크롤되지 않는다**
      //   (실측 2026-08-26: 6회차까지 +0 이다가, 사람이 손으로 굴린 7회차에 +99 가 들어왔다).
      //   렌더러에 이벤트만 꽂힐 뿐 컴포지터를 안 거쳐서 그렇다.
      //   `Input.synthesizeScrollGesture` 가 그걸 위한 API 다 — 컴포지터를 통해 진짜 스크롤
      //   제스처를 만든다. yDistance 는 **음수가 아래로**다.
      const ok = await this.send('Input.synthesizeScrollGesture', {
        x, y, xDistance: 0, yDistance: -dist,
        speed: 1200, gestureSourceType: 'mouse', repeatCount: 0,
      }, 20000).then(() => true).catch(() => false);

      if (!ok) {
        // 구버전 크롬 등으로 제스처가 없으면 그때만 예전 방식으로 — 안 되는 것보다는 낫다.
        await this.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel', x, y, deltaX: 0, deltaY: dist, pointerType: 'mouse',
        }).catch(() => {});
      }
      await sleep(rand(pauseMs[0], pauseMs[1]));
    }
    return this.evaluate('Math.round(window.scrollY)').catch(() => null);
  }

  /**
   * 네이버로 오간 응답을 듣는다 — **418 을 잡으려고** 있는 창구다.
   * ---------------------------------------------------------------------------
   * 무한스크롤의 진짜 엔드포인트는 `/ns/v1/search/paged-composite-cards?cursor=…` 이고,
   * 너무 빨리 긁으면 여기서 **418** 이 돌아온다(실측 2026-08-25: cursor=101 에서 418).
   * 418 이 오면 페이지는 이미 받아 둔 카드까지 되돌린다(439장 → 253장). 그래서
   * "안 늘어난다"로만 보이고 원인이 안 보였다. 상태를 직접 듣는 게 유일한 방법이다.
   *
   * @param {(r:{status:number,url:string,type:string})=>void} fn
   * @returns {() => void} 구독 해지
   */
  watchResponses(fn) {
    return this.browser.on('Network.responseReceived', (p) => {
      const url = p?.response?.url || '';
      if (!/naver\.com/.test(url)) return;
      fn({ status: p.response.status, url, type: p.type || '' });
    }, this.sessionId);
  }

  /**
   * 마우스를 조금 움직인다 — 멈춰서 구경하는 동안에도 사람 손은 가만히 있지 않는다.
   * 네이버 봇 판별(ncpt)이 이 신호를 본다. 실측 2026-08-26으로 확인된 차이다:
   *   마우스 안 움직임 → 목록 더받기 1회 뒤 418
   *   굴리기 직전에만 움직임 → 4회 뒤 418
   */
  async jiggle({ x = null, y = null } = {}) {
    if (x == null || y == null) {
      const p = await this.evaluateJson(
        '({ x: Math.round(window.innerWidth * (0.45 + Math.random() * 0.35)),'
        + '   y: Math.round(window.innerHeight * (0.25 + Math.random() * 0.5)) })',
      ).catch(() => null);
      x = p?.x ?? 900; y = p?.y ?? 400;
    }
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x, y, buttons: 0, pointerType: 'mouse',
    }).catch(() => {});
  }

  /** 요소가 나타날 때까지 기다린다(SPA 렌더 지연 대비). */
  async waitFor(selector, { timeoutMs = 10000, everyMs = 400 } = {}) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const ok = await this.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`).catch(() => false);
      if (ok) return true;
      await sleep(everyMs);
    }
    return false;
  }

  /**
   * 네이버가 막았는지 / 로그인을 요구하는지 / 캡차인지 — 한 번에 판정한다.
   * 문구는 실측(2026-08-25)한 그대로다: "쇼핑 서비스 접속이 일시적으로 제한되었습니다".
   */
  async detect() {
    return this.evaluateJson(`(() => {
      const t = (document.body && document.body.innerText || '');
      return {
        url: location.href,
        title: document.title,
        blocked: /접속이 일시적으로 제한|비정상적인 접근/.test(t),
        captcha: /보안 인증|자동입력 방지|캡차/.test(t + document.title),
        loginRequired: /nid\\.naver\\.com/.test(location.href),
        bodyLength: t.length,
      };
    })()`);
  }

  /**
   * 네이버 로그인 여부 — **쿠키로 판정한다**(naver-session.mjs 와 같은 규칙).
   * 화면으로 보면 페이지마다 마크업이 달라 오판하고, 판정하려고 페이지를 여는 것 자체가 예산이다.
   */
  async naverLogin() {
    const { cookies } = await this.send('Network.getCookies', { urls: ['https://www.naver.com', 'https://shopping.naver.com'] });
    const pick = (n) => (cookies || []).find((c) => c.name === n && c.value);
    const aut = pick('NID_AUT'); const ses = pick('NID_SES');
    return { loggedIn: !!(aut && ses), hasAuth: !!aut };
  }

  /**
   * 떠 있는 팝업·배너를 닫는다.
   * ---------------------------------------------------------------------------
   * 네이버 쇼핑 홈은 멤버십 가입 팝업 같은 걸 수시로 띄운다. 그게 링크 위를 덮으면
   * 클릭이 통째로 팝업에 먹히고, 우리는 영문 모를 페이지에 가 있게 된다(실측 2026-08-25:
   * 신선식품을 눌렀는데 nid.naver.com/membership/join 으로 끌려갔다).
   *
   * 닫기 계열만 누른다 — '확인' 은 무엇에 동의하는지 알 수 없어 건드리지 않는다.
   * 여기서는 진짜 마우스가 아니라 el.click() 이면 충분하다(우리 쪽 UI 조작이지 이동이 아니다).
   */
  async dismissPopups() {
    return this.evaluateJson(`(() => {
      // ⚠️ 정확히 일치로만 잡으면 놓친다. 실측 2026-08-26: 쇼핑 홈의 "시크릿 쿠폰 도착" 팝업은
      //   버튼이 '7일간 보지 않기' / '레이어 닫기' 라서 예전 목록에 하나도 안 걸렸고,
      //   그 팝업이 화면을 덮은 채로 카테고리 메뉴를 못 열어 진입이 통째로 실패했다.
      const OK = /(^|\\s)(닫기|취소|나중에|건너뛰기)(\\s|$)|보지\\s*않기|닫기$/;
      // '확인' 은 무엇에 동의하는지 알 수 없어 절대 누르지 않는다.
      const NEVER = /^(확인|동의|수락|가입|받으러가기|신청)/;
      let closed = 0;
      const seen = new Set();
      const cands = document.querySelectorAll(
        'button, a[role="button"], [role="button"], [aria-label], [class*="close"], [class*="Close"]'
      );
      for (const el of cands) {
        if (seen.has(el)) continue;
        seen.add(el);
        const text = (el.innerText || '').replace(/\\s+/g,' ').trim();
        const aria = (el.getAttribute('aria-label') || '').replace(/\\s+/g,' ').trim();
        const label = (text + ' ' + aria).trim();
        if (!label || NEVER.test(text) || NEVER.test(aria)) continue;
        if (!OK.test(label)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;      // 안 보이는 건 건드리지 않는다
        try { el.click(); closed++; } catch (e) {}
      }
      return { closed };
    })()`).catch(() => ({ closed: 0 }));
  }

  /** 진단용 — 화면에 실제로 뭐가 떠 있는지 통째로 본다. 추측을 없애는 유일한 방법이다. */
  async describe() {
    return this.evaluateJson(`(() => ({
      url: location.href,
      title: document.title,
      text: (document.body && document.body.innerText || '').replace(/\\s+/g,' ').slice(0, 500),
      buttons: [...document.querySelectorAll('button')].map(b => (b.innerText||'').trim()).filter(Boolean).slice(0,15),
    }))()`);
  }

  async close() {
    try { await this.browser.send('Target.closeTarget', { targetId: this.targetId }); } catch { /* ignore */ }
  }
}
