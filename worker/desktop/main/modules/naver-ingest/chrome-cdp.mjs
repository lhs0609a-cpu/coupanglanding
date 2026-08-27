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
import { detectJs, spaReadyJs } from './inject.mjs';

const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); t.unref?.(); });
const rand = (min, max) => min + Math.random() * (max - min);

/** 진입점 — 주소로 직접 여는 것이 허용된 **유일한** 두 곳이다(설계도 §14 규칙 1). */
const HOME_URL = 'https://shopping.naver.com/ns/home';
const NAVER_HOME = 'https://www.naver.com';

/**
 * 이미지/미디어/폰트 차단 패턴 — `setMediaBlocked(true)` 로만 켜진다.
 * ⚠️ 기본값은 **끔**이다. 일렉트론 판은 항상 켜 뒀지만(installBlocker), 크롬 목록 수집이
 *   244개→641개로 검증된 건 **차단이 없는 상태**에서였다. 지연 렌더·IntersectionObserver 가
 *   이미지 로드에 얹혀 도는지 확인되지 않은 채로 켜면 검증된 성적을 잃는다.
 *   메모리가 문제가 될 때 상세 탭에만 켜는 용도로 남겨 둔다.
 */
const MEDIA_BLOCK_PATTERNS = [
  '*.jpg', '*.jpeg', '*.png', '*.gif', '*.webp', '*.avif', '*.svg', '*.ico',
  '*.woff', '*.woff2', '*.ttf', '*.otf',
  '*.mp4', '*.webm', '*.mp3', '*.m4s',
];

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
    // ★ 프로필 점유 판정에 쓴다 — 아래 launch 실패 분기 참고.
    let exitedEarly = false;
    this.child.on('exit', () => { exitedEarly = true; this.child = null; });

    await sleep(1200);
    let v;
    try {
      v = await this.send('Browser.getVersion', {}, undefined, 8000);
    } catch (e) {
      /**
       * ★ 여기서 십중팔구는 "이 프로필을 이미 다른 크롬이 쥐고 있다" 이다.
       * 같은 --user-data-dir 로 두 번째 크롬을 띄우면 크롬은 첫 번째 인스턴스에 주소만
       * 넘기고 **즉시 종료한다**. 그러면 우리 파이프(fd 3/4)에는 아무도 없어서 1.2초 뒤
       * `CDP 응답 없음: Browser.getVersion` 이라는, 원인을 전혀 알 수 없는 말만 남았다.
       * 프로세스가 곧바로 죽었는지(윈도우) / 잠금 파일이 있는지(POSIX)로 구분해서 말해 준다.
       */
      const locked = exitedEarly
        || existsSync(join(this.profileDir, 'SingletonLock'))
        || existsSync(join(this.profileDir, 'lockfile'));
      try { this.child?.kill(); } catch { /* ignore */ }
      this.child = null;
      throw new Error(locked
        ? '도우미용 크롬이 이미 떠 있습니다 — 그 크롬 창을 닫고 다시 시도해 주세요.'
        : `크롬에 연결하지 못했습니다 — ${e?.message || e}`);
    }
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

  /**
   * 크롬을 **곱게** 닫는다.
   * ---------------------------------------------------------------------------
   * ★ Browser.close 를 보내고 곧바로 kill 하면 크롬이 세션을 정리할 틈이 없어, 다음 실행 때
   *   "Chrome이 제대로 종료되지 않았습니다 — 페이지를 복원하시겠습니까?" 배너가 뜬다(실측).
   *   사용자 눈에는 도우미가 크롬을 망가뜨린 것처럼 보이고, 배너가 화면 위를 덮으면
   *   클릭 이동이 그 배너에 먹힐 수도 있다.
   *   그래서 프로세스가 스스로 끝나기를 잠깐 기다리고, 그래도 안 죽을 때만 kill 한다.
   */
  async close() {
    const child = this.child;
    if (!child) return;
    const exited = new Promise((r) => { child.once('exit', r); });
    try { await this.send('Browser.close', {}, undefined, 5000); } catch { /* 이미 죽었을 수 있다 */ }
    await Promise.race([exited, sleep(4000)]);
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill(); } catch { /* ignore */ }
      await Promise.race([exited, sleep(1000)]);
    }
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
    // ★ 탭마다 켠다. 예전엔 chrome-session 이 단 하나의 페이지에만 걸었는데, 탭이 여러 장이 되면
    //   Network 를 안 켠 탭에서는 watchResponses(418 감시)·getCookies(로그인 판정)·
    //   setBlockedURLs 가 조용히 아무 일도 하지 않는다. 켜는 비용은 없다.
    await this.send('Network.enable').catch(() => {});

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
   * requestId 도 같이 준다 — `Network.getResponseBody` 로 **418 의 본문을 실제로 읽어**
   * "차단 맞나" 를 눈으로 확인하기 위해서다. 버퍼가 살아 있는 동안만 읽을 수 있으므로
   * 듣는 쪽에서 곧바로 불러야 한다.
   *
   * @param {(r:{status:number,url:string,type:string,requestId:string})=>void} fn
   * @returns {() => void} 구독 해지
   */
  watchResponses(fn) {
    return this.browser.on('Network.responseReceived', (p) => {
      const url = p?.response?.url || '';
      if (!/naver\.com/.test(url)) return;
      fn({ status: p.response.status, url, type: p.type || '', requestId: p.requestId || '' });
    }, this.sessionId);
  }

  /**
   * 응답 본문을 읽는다(버퍼에 남아 있는 동안만). 실패는 빈 문자열로 삼킨다 — 진단용이다.
   * `responseReceived` 시점에는 아직 본문이 안 모여 "No data found" 가 나기 쉽다.
   * 그렇다고 loadingFinished 를 따로 듣기엔 배보다 배꼽이라, 짧게 몇 번 다시 묻는다.
   */
  async responseBody(requestId) {
    if (!requestId) return '';
    for (let i = 0; i < 3; i++) {
      const r = await this.send('Network.getResponseBody', { requestId }, 5000).catch(() => null);
      if (r) {
        if (r.base64Encoded) return Buffer.from(r.body || '', 'base64').toString('utf8');
        if (r.body) return r.body;
      }
      await sleep(250);
    }
    return '';
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
   * ---------------------------------------------------------------------------
   * ★ 판정기는 inject.mjs 의 `detectJs` **하나뿐이다**(단일 출처). 예전에 이 자리에는 정규식
   *   네 줄짜리 축약판이 따로 있었는데, 그게 두 가지를 망가뜨렸다:
   *     ① `is429` 를 안 돌려줬다 — runner.mjs·categories.mjs 가 그 값으로 쿨다운 길이를
   *        90초/60초로 가르는데, undefined 라 429 가 전부 일반 차단으로 격하됐다.
   *     ② 정상 목록 페이지를 캡차로 오탐했다 — detectJs 의 SAFE_PAGES 예외가 없었다.
   *   실패하면 "차단"으로 본다(안전한 쪽). 판정 자체가 안 되는 페이지는 쓸 수 없는 페이지다.
   */
  async detect() {
    const d = await this.evaluateJson(detectJs).catch(() => null);
    return d || { captcha: false, blocked: true, is429: false, loginRequired: false, bodyLength: 0 };
  }

  /**
   * SPA 렌더링 완료 대기. 로드 완료 ≠ 데이터 표시 — 이걸 건너뛰면 상품명이 'Unknown' 인
   * 껍데기가 저장된다(설계도 §14 규칙 3).
   */
  async waitSpaReady(isMainUrl = false) {
    await sleep(isMainUrl ? 1500 : 1000);
    for (let i = 0; i < 6; i++) {
      const s = await this.evaluateJson(spaReadyJs).catch(() => null);
      if (s?.ready) return s;
      await sleep(1000);
    }
    return null;
  }

  /** '/main/products/' 는 실제 스토어로 302 된다. 리다이렉트가 끝날 때까지 기다린다. */
  async _awaitMainRedirect() {
    for (let i = 0; i < 20; i++) {
      const u = String(await this.url().catch(() => ''));
      if (u && !u.includes('/main/products/')) { await sleep(2000); return true; }
      await sleep(500);
    }
    return false;
  }

  /**
   * 임의의 주소로 **눌러서** 이동한다 — 상세 추출의 진입 경로.
   * ---------------------------------------------------------------------------
   * 목록은 화면에 진짜 링크가 있어서 clickLink 로 눌러 내려가면 됐다(chrome-navigate.mjs).
   * 그런데 셀러가 요청한 상품 URL 은 지금 열린 페이지 어디에도 링크가 없다. 그렇다고
   * 주소로 직접 열면 설계도 §14 규칙 1 을 어긴다.
   *
   * 그래서 **발판을 만든 다음 진짜로 누른다**:
   *   ① 네이버 밖이면 쇼핑 홈을 연다(주소 직접 열기가 허용된 유일한 지점)
   *   ② 그 페이지에 목적지 앵커를 심는다 — 반드시 **누를 수 있는 크기**로. 0×0 이나 화면 밖이면
   *      clickLink 가 zero-size/offscreen 으로 튕긴다
   *   ③ Input.dispatchMouseEvent 로 그 좌표를 누른다 → isTrusted=true, referrer 는 네이버
   *
   * 일렉트론 판(inject.mjs navigateViaClickJs)과 모양은 같지만 결정적으로 다르다. 저쪽은
   * `el.dispatchEvent(new MouseEvent(...))` 라 isTrusted=false 였고, 그게 크롬으로 옮겨온 이유다.
   */
  async gotoViaClick(url, { timeoutMs = 15000, skipReady = false } = {}) {
    const at = String(await this.url().catch(() => ''));
    if (!/naver\.com/.test(at)) {
      await this.goto(HOME_URL, { settleMs: 2000 });
      await this.dismissPopups().catch(() => {});
      await sleep(rand(600, 1200));
    }

    /**
     * 앵커 자리를 세 군데 준비한다. 한 자리만 쓰면 그 위를 고정 배너·챗봇이 덮었을 때
     * (clickLink 가 'covered' 로 돌려준다) 이동이 통째로 실패한다 — 실제로 쇼핑 홈은
     * 하단에 고정 레이어를 자주 띄운다.
     */
    const SPOTS = [
      'left:24px;bottom:120px;',
      'left:50%;top:45%;margin-left:-60px;',
      'right:32px;top:140px;',
    ];

    let last = 'not-found';
    for (const spot of SPOTS) {
      const planted = await this.evaluateJson(`(() => {
        const old = document.getElementById('__mgl_nav');
        if (old) old.remove();
        const a = document.createElement('a');
        a.id = '__mgl_nav';
        a.href = ${JSON.stringify(url)};
        a.textContent = '\\u00a0';
        // opacity:0 / display:none 은 쓰지 않는다 — 안 보이는 링크 클릭은 그 자체가 봇 시그널이고,
        // elementFromPoint 적중 판정에도 걸려야 한다.
        a.style.cssText = 'position:fixed;${spot}width:120px;height:28px;'
          + 'z-index:2147483647;opacity:0.01;background:#fff;display:block;pointer-events:auto;';
        document.body.appendChild(a);
        return { ok: true };
      })()`).catch(() => null);
      if (!planted?.ok) { last = 'anchor-plant-failed'; continue; }

      // hover 는 짧게 — 우리가 방금 만든 링크라 메뉴가 열릴 일이 없다.
      const r = await this.clickLink('#__mgl_nav', { hoverMs: [120, 300], timeoutMs });
      if (r.ok) {
        // 이동이 SPA 라우팅이면 문서가 그대로라 앵커가 남는다 — 다음 이동의 판정을 흐리지 않게 치운다.
        await this.evaluate('(() => { const a = document.getElementById("__mgl_nav"); if (a) a.remove(); return true; })()')
          .catch(() => { /* 문서가 바뀌었으면 이미 사라졌다 */ });
        if (url.includes('/main/products/')) await this._awaitMainRedirect();
        if (!skipReady) await this.waitSpaReady(url.includes('/main/products/'));
        await this.keepRendering().catch(() => {});
        return { ok: true, status: 200, url: String(await this.url().catch(() => url)) };
      }
      last = r.reason || 'click-failed';
      if (last === 'covered') { await this.dismissPopups().catch(() => {}); await sleep(500); }
      // 실패한 앵커는 치우고 다음 자리로 — 남겨 두면 다음 시도의 elementFromPoint 를 흐린다.
      await this.evaluate('(() => { const a = document.getElementById("__mgl_nav"); if (a) a.remove(); return true; })()')
        .catch(() => { /* 이동했으면 컨텍스트가 사라져 실패한다 — 정상 */ });
    }
    return { ok: false, status: 0, error: last };
  }

  /**
   * 페이지 안에 **이미 있는 진짜 링크**를 눌러 이동한다. 목적지 링크가 실제로 있으면
   * 우리가 심은 앵커보다 항상 낫다 — referrer·SPA 라우팅·추적 파라미터가 사람과 같아진다.
   */
  async gotoViaPageLink(hrefIncludes, { timeoutMs = 20000, skipReady = false } = {}) {
    const sel = `a[href*="${String(hrefIncludes).replace(/"/g, '\\"')}"]`;
    const has = await this.evaluate(`!!document.querySelector(${JSON.stringify(sel)})`).catch(() => false);
    if (!has) return { ok: false, notFound: true, error: 'link-not-found' };

    const r = await this.clickLink(sel, { hoverMs: [500, 900], timeoutMs });
    if (!r.ok) return { ok: false, error: r.reason || 'click-failed' };
    if (!skipReady) await this.waitSpaReady();
    return { ok: true, status: 200, href: r.href, url: String(await this.url().catch(() => '')) };
  }

  /**
   * 사람처럼 굴기 — 상품 페이지 진입 직후 1회.
   * 일렉트론 판은 humanizeJs(자바스크립트 scrollBy + 합성 mousemove)를 썼는데, 그건 우리가
   * 크롬으로 옮겨오며 버린 바로 그 방식이다. 여기서는 진짜 입력만 쓴다.
   */
  async humanize() {
    await this.jiggle().catch(() => {});
    await this.wheel({ steps: 2 + Math.floor(Math.random() * 3), deltaY: 340, pauseMs: [220, 480] })
      .catch(() => {});
    await sleep(rand(400, 900));
    await this.jiggle().catch(() => {});
    // 가끔 위로 되돌아본다 — 사람은 끝까지 내리고 그대로 멈추지 않는다.
    if (Math.random() < 0.4) {
      await this.wheel({ steps: 1, deltaY: -Math.round(rand(150, 320)), pauseMs: [180, 320] }).catch(() => {});
    }
    return true;
  }

  /**
   * 세션 워밍업 — 탭을 처음 쓰기 전 1회.
   * 쿠키 없는 첫 방문은 스마트스토어가 429 로 막는다(실측). 네이버 → (클릭으로) 쇼핑 순으로
   * 들러 "방금 네이버를 쓰던 사람"의 쿠키를 만든다.
   */
  async warmUp() {
    try {
      await this.goto(NAVER_HOME, { settleMs: 1500 });
      await sleep(rand(1500, 2600));
      const r = await this.gotoViaClick(HOME_URL, { skipReady: true });
      await sleep(rand(1500, 2600));
      await this.dismissPopups().catch(() => {});
      return !!r.ok;
    } catch {
      return false;
    }
  }

  /** 이미지/미디어/폰트 차단 토글. 기본은 꺼짐 — MEDIA_BLOCK_PATTERNS 머리말 참고. */
  async setMediaBlocked(on) {
    await this.send('Network.setBlockedURLs', { urls: on ? MEDIA_BLOCK_PATTERNS : [] }).catch(() => {});
  }

  /** 이 탭을 사람에게 보여준다 — 캡차·로그인처럼 사람 손이 필요할 때. */
  async bringToFront() {
    const w = await this.browser.send('Browser.getWindowForTarget', { targetId: this.targetId }).catch(() => null);
    if (w?.windowId != null) {
      await this.browser.send('Browser.setWindowBounds', { windowId: w.windowId, bounds: { windowState: 'normal' } })
        .catch(() => { /* 이미 normal 이면 그만 */ });
    }
    await this.send('Page.bringToFront').catch(() => {});
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
