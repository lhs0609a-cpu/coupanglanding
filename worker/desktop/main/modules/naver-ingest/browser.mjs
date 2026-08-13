/**
 * 수집용 브라우저 창 — Electron 내장 Chromium 을 "사람이 쇼핑하는 브라우저"처럼 몬다.
 * ---------------------------------------------------------------------------
 * 핵심 원칙 4가지 (원본 이식 가이드 [4][5][11-E], 어기면 즉시 차단된다):
 *   ① 상품/카테고리 URL 을 loadURL 로 직접 열지 않는다. 반드시 클릭 이동.
 *      (loadURL 은 최초 진입점 shopping.naver.com 을 열 때만 쓴다)
 *   ② 창을 매번 새로 만들지 않고 재사용한다. referrer 체인이 끊기면 봇 시그널.
 *   ③ 세션(파티션)은 **모든 창이 공유**한다. 창마다 파티션을 나누면 "쿠키 없는 신규 방문자"가
 *      여러 명 생기는 셈이라 오히려 잡힌다. 우리가 원하는 그림은 "한 사람이 탭 3개".
 *   ④ 창은 이미지/미디어/폰트를 로드하지 않는다. 우리는 이미지 **URL 만** 뽑고 실제 다운로드는
 *      별도 HTTP 로 하므로 손해가 없다. 창 3개를 띄워도 메모리가 감당된다.
 */
import { navigateViaClickJs, spaReadyJs, detectJs, humanizeJs } from './inject.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 전 창이 공유하는 파티션 — 쿠키·세션이 하나로 유지된다. */
export const SCRAPE_PARTITION = 'persist:naveringest';

const HOME_URL = 'https://shopping.naver.com/ns/home';
const NAVER_HOME = 'https://www.naver.com';

const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t?.unref) t.unref(); });
const rand = (min, max) => min + Math.random() * (max - min);

let _blockerInstalled = false;

/** 파티션에 리소스 차단을 1회 설치. ★ 전용 파티션에만 걸어야 앱 UI 아이콘이 안 깨진다. */
async function installBlocker() {
  if (_blockerInstalled) return;
  const { session } = await import('electron');
  try {
    session.fromPartition(SCRAPE_PARTITION).webRequest.onBeforeRequest(
      { urls: ['*://*/*'] },
      (details, cb) => cb({ cancel: ['image', 'media', 'font'].includes(details.resourceType) }),
    );
    _blockerInstalled = true;
  } catch { /* best-effort — 차단 실패해도 수집 자체는 된다(느려질 뿐) */ }
}

export class ScrapeWindow {
  /** @param {number} index 창 번호(UI 표시용) */
  constructor(index) {
    this.index = index;
    this.win = null;
    this.warmedUp = false;
    this.status = 'idle';     // idle | warming | navigating | working | captcha | closed
    this.detail = '';
  }

  async ensure() {
    if (this.win && !this.win.isDestroyed()) return this.win;
    await installBlocker();
    const { BrowserWindow } = await import('electron');
    this.win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        offscreen: false,
        backgroundThrottling: false,   // 숨긴 창도 타이머가 정상 동작해야 스크롤이 진행된다
        javascript: true,
        partition: SCRAPE_PARTITION,
      },
    });
    this.win.webContents.setAudioMuted(true);
    // 네이버 링크 중 target=_blank 가 있어 팝업이 뜨면 창 관리가 깨진다.
    // 새 창을 막고 **같은 창에서 클릭 이동**으로 처리한다(직접 loadURL 로 대체하지 않는다).
    this.win.webContents.setWindowOpenHandler(({ url }) => {
      this._pendingPopupUrl = url;
      return { action: 'deny' };
    });
    return this.win;
  }

  get wc() { return this.win && !this.win.isDestroyed() ? this.win.webContents : null; }
  get url() { try { return this.wc?.getURL() || ''; } catch { return ''; } }

  /** 창을 사용자에게 보여준다 — 캡차를 사람이 풀어야 할 때. */
  show() { try { this.win?.show(); this.win?.focus(); } catch { /* ignore */ } }
  hide() { try { this.win?.hide(); } catch { /* ignore */ } }

  close() {
    this.status = 'closed';
    try { if (this.win && !this.win.isDestroyed()) this.win.destroy(); } catch { /* ignore */ }
    this.win = null;
  }

  /**
   * 다음 네비게이션 1회를 기다린다. 클릭 이동은 우리가 결과를 직접 못 받으므로
   * (컨텍스트가 파괴되며 executeJavaScript 가 거부된다) 이벤트로 관측한다.
   */
  _waitForNavigation(timeoutMs = 15000) {
    const wc = this.wc;
    if (!wc) return Promise.resolve({ ok: false, status: 0, error: 'no-window' });
    return new Promise((resolve) => {
      let status = 0;
      let settled = false;
      const done = (r) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        wc.removeListener('did-navigate', onNavigate);
        wc.removeListener('did-finish-load', onFinish);
        wc.removeListener('did-fail-load', onFail);
        resolve(r);
      };
      const timer = setTimeout(() => done({ ok: false, status, error: 'timeout' }), timeoutMs);
      if (timer?.unref) timer.unref();
      const onNavigate = (_e, _u, code) => { if (code) status = code; };
      const onFinish = () => done({ ok: true, status: status || 200 });
      const onFail = (_e, code, desc, _u, isMain) => {
        // -3(ABORTED)은 리다이렉트 중 흔히 나므로 실패로 치지 않는다.
        if (isMain && code !== -3) done({ ok: false, status, error: `load ${code} ${desc}` });
      };
      wc.on('did-navigate', onNavigate);
      wc.on('did-finish-load', onFinish);
      wc.on('did-fail-load', onFail);
    });
  }

  /** 진입점만 직접 로드한다 — 상품/카테고리 URL 에는 절대 쓰지 않는다. */
  async _loadDirect(url, timeoutMs = 20000) {
    const wc = this.wc;
    if (!wc) throw new Error('창이 없습니다');
    const nav = this._waitForNavigation(timeoutMs);
    wc.loadURL(url, { userAgent: UA }).catch(() => { /* nav 결과로 판정 */ });
    return nav;
  }

  /**
   * 세션 워밍업 — 배치 시작 전 1회.
   * 쿠키 없는 첫 방문은 스마트스토어가 429 로 막는다(브랜드스토어는 통과, 실측).
   * 네이버 → (클릭으로) 쇼핑 순으로 들러 "방금 네이버를 쓰던 사람"의 쿠키를 만든다.
   */
  async warmUp() {
    if (this.warmedUp) return true;
    this.status = 'warming';
    await this.ensure();
    try {
      await this._loadDirect(NAVER_HOME);
      await sleep(rand(2000, 3000));
      // 여기서부터는 클릭 이동 — 네이버 내부 페이지에서 출발하므로 referrer 가 자연스럽다.
      await this.gotoViaClick(HOME_URL, { skipReady: true });
      await sleep(rand(2000, 3000));
      this.warmedUp = true;
      return true;
    } catch {
      this.warmedUp = false;
      return false;
    } finally {
      this.status = 'idle';
    }
  }

  /**
   * 클릭으로 이동한다. 현재 네이버 페이지가 아니면 진입점을 먼저 연다.
   * ★ 이 함수가 이 프로젝트의 심장이다 — loadURL 로 대체하는 순간 차단이 시작된다.
   */
  async gotoViaClick(url, { timeoutMs = 15000, skipReady = false } = {}) {
    const wc = this.wc || (await this.ensure(), this.wc);
    this.status = 'navigating';
    this.detail = url;

    // 출발지가 네이버가 아니면 클릭할 발판이 없다 → 진입점을 직접 연다(허용된 유일한 직접 로드).
    if (!/naver\.com/.test(this.url)) {
      await this._loadDirect(HOME_URL);
      await sleep(rand(800, 1500));
    }

    const nav = this._waitForNavigation(timeoutMs);
    // 클릭이 성사되면 컨텍스트가 파괴되며 이 Promise 는 거부된다 — 정상이다. 결과는 nav 로 받는다.
    wc.executeJavaScript(navigateViaClickJs(url), true).catch(() => { /* expected */ });
    const r = await nav;

    // '/main/products/' 는 실제 스토어로 302 된다. 리다이렉트가 끝날 때까지 기다린다.
    if (r.ok && url.includes('/main/products/')) await this._awaitMainRedirect();

    if (!skipReady && r.ok) await this.waitSpaReady(url.includes('/main/products/'));
    this.status = 'idle';
    return r;
  }

  async _awaitMainRedirect() {
    for (let i = 0; i < 20; i++) {
      if (!this.url.includes('/main/products/')) { await sleep(2000); return true; }
      await sleep(500);
    }
    return false;
  }

  /**
   * SPA 렌더링 완료 대기. 로드 완료 ≠ 데이터 표시.
   * 이걸 건너뛰면 상품명이 'Unknown' 인 껍데기가 저장된다.
   */
  async waitSpaReady(isMainUrl = false) {
    await sleep(isMainUrl ? 1500 : 1000);
    for (let i = 0; i < 6; i++) {
      const s = await this.evaluate(spaReadyJs).catch(() => null);
      if (s?.ready) return s;
      await sleep(1000);
    }
    return null;
  }

  /** 차단/캡차 판정. 캡차를 먼저 본다(가이드 함정 4). */
  async detect() {
    return this.evaluate(detectJs).catch(() => ({ captcha: false, blocked: true, is429: false, bodyLength: 0 }));
  }

  /** 사람처럼 스크롤/마우스 — 상품 페이지 진입 직후 1회. */
  async humanize() { return this.evaluate(humanizeJs).catch(() => false); }

  evaluate(js, userGesture = false) {
    const wc = this.wc;
    if (!wc) return Promise.reject(new Error('창이 없습니다'));
    return wc.executeJavaScript(js, userGesture);
  }
}
