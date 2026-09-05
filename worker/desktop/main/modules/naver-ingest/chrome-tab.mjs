/**
 * 수집용 크롬 탭 — 예전 `ScrapeWindow`(일렉트론 창)의 자리를 그대로 물려받는다.
 * ---------------------------------------------------------------------------
 * ⭐ 왜 일렉트론 창을 버렸나(실측 2026-08-25, 자세한 근거는 chrome-cdp.mjs 머리말):
 *   일렉트론에서 "클릭 이동"이라 부르던 것은 `el.dispatchEvent(new MouseEvent('click'))` 이라
 *   `isTrusted === false` 였다. 안티봇이 가장 먼저 보는 값이 그것이다. CDP 의
 *   `Input.dispatchMouseEvent` 는 브라우저 입력 파이프라인을 그대로 타서 사람과 구분되지 않는다.
 *
 * ★ 이 클래스는 **ScrapeWindow 와 같은 이름·같은 모양**을 유지한다. runner.mjs·categories.mjs·
 *   service.mjs 는 창 객체의 메서드 열 개만 쓰기 때문에, 드라이버 한 겹만 바꾸면 나머지가
 *   그대로 따라온다. 이름을 예쁘게 고치고 싶어도 참는다 — 그게 이 이식을 작게 만든 이유다.
 *
 * 원칙(일렉트론 시절과 동일, 어기면 즉시 차단된다):
 *   ① 상품/카테고리 URL 을 주소로 직접 열지 않는다. 반드시 클릭 이동(gotoViaClick).
 *   ② 탭을 매번 새로 만들지 않고 재사용한다. referrer 체인이 끊기면 봇 시그널.
 *   ③ 쿠키는 **크롬 프로필 하나**를 전 탭이 공유한다. 탭마다 컨텍스트를 나누면
 *      "쿠키 없는 신규 방문자"가 여러 명 생기는 셈이라 오히려 잡힌다.
 */
import { newTab } from './chrome-session.mjs';

/** 상세 추출기는 페이지 안에서 fetch 를 5번 한다(리뷰 100건 포함) — 넉넉히 준다. */
const EVAL_TIMEOUT_MS = 120_000;

export class ChromeTab {
  /** @param {number} index 탭 번호(UI 표시용 — 사용자에게는 "창 N" 으로 보인다) */
  constructor(index) {
    this.index = index;
    this.page = null;
    this.warmedUp = false;
    this.status = 'idle';     // idle | warming | navigating | working | captcha | login | closed
    this.detail = '';
    this.lastError = '';      // 워밍업이 실패한 진짜 이유(풀이 로그에 싣는다)
    this._url = '';
  }

  /**
   * ★ 동기 getter 다. runner.mjs 가 `sw.url.includes('/products/')` 처럼 **await 없이** 쓴다
   *   (runner.mjs:99, :164). CDP 의 `page.url()` 은 async 라, 이동할 때마다 캐시해 둔다.
   */
  get url() { return this._url; }

  /** 탭이 살아 있는가 — 풀이 반납 시 확인한다(죽었으면 반납 대신 정리). */
  get alive() { return !!this.page; }

  async ensure() {
    if (this.page) return this.page;
    this.page = await newTab();
    return this.page;
  }

  async _syncUrl() {
    if (!this.page) return '';
    this._url = String(await this.page.url().catch(() => this._url));
    return this._url;
  }

  /** 캡차를 사람이 풀어야 할 때 이 탭을 앞으로 가져온다. */
  async show() { await this.page?.bringToFront().catch(() => {}); }

  /**
   * 일렉트론 창은 숨길 수 있었지만 크롬 탭은 그렇지 않다 — 크롬 창은 원래 사람에게 보인다.
   * 호출부(runner.mjs 캡차 루프)를 건드리지 않으려고 자리만 지킨다.
   */
  hide() { /* 크롬 탭은 숨기지 않는다 */ }

  close() {
    this.status = 'closed';
    const p = this.page;
    this.page = null;
    try { p?.close(); } catch { /* ignore */ }
  }

  /**
   * 세션 워밍업 — 탭을 처음 쓰기 전 1회.
   * 쿠키 없는 첫 방문은 스마트스토어가 429 로 막는다(브랜드스토어는 통과, 실측).
   */
  async warmUp() {
    if (this.warmedUp) return true;
    this.status = 'warming';
    this.lastError = '';
    try {
      await this.ensure();
      const ok = await this.page.warmUp();
      await this._syncUrl();
      if (!ok) this.lastError = '네이버 진입에 실패했습니다';
      this.warmedUp = ok;
      return ok;
    } catch (e) {
      // ★ 이유를 삼키지 않는다. 예전에는 "워밍업 실패"만 남아서 크롬 미설치인지, 프로필을
      //   다른 크롬이 쥐고 있는지, 네이버가 막은 건지 로그로 구분할 수가 없었다.
      this.lastError = String(e?.message || e);
      this.warmedUp = false;
      return false;
    } finally {
      this.status = this.warmedUp ? 'idle' : 'closed';
    }
  }

  /** 클릭으로 이동한다 — 이 프로젝트의 심장. 주소 직접 열기로 대체하는 순간 차단이 시작된다. */
  async gotoViaClick(url, opts = {}) {
    await this.ensure();
    this.status = 'navigating';
    this.detail = url;
    try {
      const r = await this.page.gotoViaClick(url, opts);
      await this._syncUrl();
      return r;
    } finally {
      this.status = 'idle';
    }
  }

  /** 지금 열린 페이지 안의 **진짜 링크**를 눌러 이동한다. 있으면 항상 이쪽이 낫다. */
  async gotoViaPageLink(hrefIncludes, opts = {}) {
    await this.ensure();
    this.status = 'navigating';
    this.detail = hrefIncludes;
    try {
      const r = await this.page.gotoViaPageLink(hrefIncludes, opts);
      await this._syncUrl();
      return r;
    } finally {
      this.status = 'idle';
    }
  }

  async waitSpaReady(isMainUrl = false) {
    return this.page ? this.page.waitSpaReady(isMainUrl) : null;
  }

  /**
   * 차단/캡차 판정. 캡차를 먼저 본다(가이드 함정 4) — 판정기는 inject.mjs 의 detectJs 하나뿐이다.
   * ★ 탭이 없을 때의 대체값도 **키를 하나도 빠뜨리면 안 된다.** categories.mjs 는
   *   `loginRequired` 를 `blocked` 보다 먼저 보는데, 그 키가 undefined 면 죽은 탭이
   *   "네이버가 막았다"로 읽혀 전역 쿨다운이 걸린다 — 아무도 막지 않았는데 전 탭이 멈춘다.
   */
  async detect() {
    if (!this.page) {
      return { captcha: false, blocked: true, is429: false, loginRequired: false, bodyLength: 0, url: this._url };
    }
    const d = await this.page.detect();
    if (d?.url) this._url = String(d.url);
    return d;
  }

  /** 사람처럼 스크롤/마우스 — 진짜 입력(synthesizeScrollGesture + mouseMoved)으로 한다. */
  async humanize() {
    return this.page ? this.page.humanize().catch(() => false) : false;
  }

  /**
   * 페이지 안에서 JS 를 돌린다.
   * ★ `awaitPromise: true` 가 **필수**다. extractDetailJs 는 `(async () => {…})()` 라
   *   기본값(false)으로 부르면 Promise 객체가 그대로 직렬화돼 `{}` 가 돌아온다 —
   *   추출은 조용히 빈 결과가 되고, 로그에는 "가져온 것이 없음" 만 남아 원인을 알 수 없다.
   *   일렉트론의 executeJavaScript 는 이걸 알아서 해 줬기 때문에 이식에서 놓치기 쉽다.
   */
  evaluate(js, _userGesture = false) {
    if (!this.page) return Promise.reject(new Error('탭이 없습니다'));
    return this.page.evaluate(js, { awaitPromise: true, timeoutMs: EVAL_TIMEOUT_MS });
  }

  /** 이미지/미디어 차단 토글 — 로그인·캡차 화면에서는 반드시 꺼야 보안문자가 보인다. */
  async setMediaBlocked(on) { await this.page?.setMediaBlocked(on).catch(() => {}); }
}
