// One manual login tab shared by sourcing and stock monitoring. No password storage required.
export class ManualLogin {
  constructor({ newPage, state, persist, log = () => {}, pollMs = 2000 }) {
    Object.assign(this, { newPage, state, persist, log, pollMs });
    this.active = null; this.opening = null; this.page = null;
    this.last = null;
  }
  get waiting() { return !!(this.active || this.opening); }
  async alive(page) {
    if (!page?.browser?.alive) return false;
    try { await page.browser.send('Target.getTargetInfo', { targetId: page.targetId }, undefined, 5000); return true; }
    catch { return false; }
  }
  async start({ page, waitMs = 15 * 60_000 } = {}) {
    if (this.opening) return this.opening;
    this.opening = this.open(page, waitMs);
    try { return await this.opening; } finally { this.opening = null; }
  }
  finish(task, result) {
    if (this.active !== task) return;
    this.active = null; this.last = result;
    task.resolve(result);
  }
  async open(adopt, waitMs) {
    try {
      if (this.active && await this.alive(this.active.page)) {
        await this.active.page.bringToFront();
        this.log('열려 있는 네이버 로그인 창을 앞으로 가져왔습니다.');
        return { ok: true, already: true, busy: true };
      }
      if (this.active) this.finish(this.active, { ok: false, reason: 'window-closed' });
      if (adopt && !(await this.alive(adopt))) adopt = null;
      this.last = null;
      const p = adopt || (await this.alive(this.page) ? this.page : await this.newPage());
      this.page = p;
      await p.setMediaBlocked(false);
      // Adopt an in-progress CAPTCHA/QR/2FA tab without navigating away from it.
      const currentUrl = adopt ? await p.evaluate('location.href', { timeoutMs: 5000 }) : '';
      if (!adopt || currentUrl === 'about:blank' || currentUrl.startsWith('chrome-error:')) {
        const url = await p.goto('https://nid.naver.com/nidlogin.login', { timeoutMs: 30000, settleMs: 500 });
        if (!/^https:\/\/([a-z0-9-]+\.)*naver\.com(?:\/|$)/i.test(url))
          throw new Error('네이버 로그인 페이지에 연결하지 못했습니다. 인터넷 연결·프록시·인증서 오류를 브라우저에서 확인해 주세요.');
      }
      await p.bringToFront();
      const st = await this.state();
      if (st.loggedIn) { await this.persist(); this.last = { ok: true, already: true, loggedIn: true }; return this.last; }
      const task = { page: p, until: Date.now() + waitMs };
      task.done = new Promise((resolve) => { task.resolve = resolve; });
      this.active = task;
      this.log('도우미가 연 브라우저에서 네이버에 로그인해 주세요. QR 로그인·보안문자·추가 인증도 이 창에서 진행하면 자동으로 확인합니다.');
      void this.monitor(task);
      return { ok: true, started: true };
    } catch (e) {
      this.last = { ok: false, reason: 'open-failed', error: String(e?.message || e) };
      this.log('네이버 로그인 창을 열지 못했습니다: ' + this.last.error);
      return this.last;
    }
  }
  async monitor(task) {
    try {
      while (this.active === task && Date.now() < task.until) {
        if (!(await this.alive(task.page))) {
          this.log('로그인 창이 닫혔습니다. 네이버 로그인 버튼을 누르면 다시 열립니다.');
          return this.finish(task, { ok: false, reason: 'window-closed' });
        }
        const st = await this.state();
        if (st.loggedIn) {
          await this.persist();
          this.log('네이버 로그인을 확인했습니다. 이제 연결된 기능을 사용할 수 있습니다.');
          return this.finish(task, { ok: true, loggedIn: true });
        }
        await new Promise((resolve) => setTimeout(resolve, this.pollMs));
      }
      if (this.active === task) {
        this.log('로그인 확인 대기가 끝났습니다. 창은 그대로 두었습니다. 로그인 버튼으로 다시 확인할 수 있습니다.');
        this.finish(task, { ok: false, reason: 'human-timeout' });
      }
    } catch (e) {
      this.log('로그인 상태 확인 실패: ' + String(e?.message || e));
      this.finish(task, { ok: false, reason: 'connection-lost', error: String(e?.message || e) });
    }
  }
  async wait(options) {
    const result = await this.start(options);
    return this.active ? this.active.done : result;
  }
}
