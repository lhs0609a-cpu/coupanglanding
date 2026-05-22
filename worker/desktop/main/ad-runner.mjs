/**
 * 쿠팡 애즈 입찰 자동조정 — 워커 통합 (P3 배선)
 * ---------------------------------------------------------------------------
 * 숨김 BrowserWindow 로 윙 광고화면을 띄워(쿠팡 로그인 세션은 별도 쿠키 파티션에
 * 영속) 성과를 읽고 입찰가를 바꾼다. 평가/영속화는 runtime/ad-loop 에 위임.
 *
 * ⚠️ 실제 동작은 runtime/ad-automation 의 WING 셀렉터 설정(__TODO__)을 채워야 함.
 *    미설정이면 onEvent 로 "윙 설정 필요"를 알리고 안전하게 종료한다.
 *
 * 배선 안내: main.mjs 에서
 *   import { AdRunner } from './ad-runner.mjs';
 *   const ads = new AdRunner({ getSession: () => runner.session, onEvent: e => send('ads:evt', e) });
 *   ipcMain.handle('ads:run-once', () => ads.runOnce());
 *   ipcMain.handle('ads:start',    () => ads.start());
 *   ipcMain.handle('ads:stop',     () => ads.stop());
 * 처럼 연결한다. (DOM 설정·실기기 검증 전까지 자동 시작은 하지 않는다.)
 */

import { BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { selectRows } from '../runtime/supabase-rest.mjs';
import { runAdEvaluation, runDeletePass, runRegisterQueue, makeSupabaseDb } from '../runtime/ad-loop.mjs';
import { ensureWingSession, collectMetrics, applyBidChange, toggleCampaign, deleteCampaign, registerItem } from '../runtime/ad-automation.mjs';

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6시간마다 평가

export class AdRunner {
  constructor({ getSession, onEvent = () => {} }) {
    this.getSession = getSession;
    this.onEvent = onEvent;
    this.win = null;
    this.timer = null;
    this.busy = false;
  }

  get running() { return !!this.timer; }

  _ensureWin() {
    if (this.win && !this.win.isDestroyed()) return this.win;
    this.win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: { partition: 'persist:wing' }, // 쿠팡 로그인 쿠키 영속(비번 저장 X)
    });
    return this.win;
  }

  async _context() {
    const session = this.getSession?.();
    if (!session) throw new Error('메가로드 로그인이 필요합니다.');
    const users = await selectRows(session, 'megaload_users', 'select=id&limit=1');
    const muId = users?.[0]?.id;
    if (!muId) throw new Error('메가로드 계정을 찾지 못했습니다.');
    const rules = await selectRows(
      session, 'megaload_ad_rules',
      'scope_type=eq.account&enabled=eq.true&select=*&limit=1',
    );
    return { session, muId, rule: rules?.[0] ?? null };
  }

  /** 1회 평가 실행 */
  async runOnce() {
    if (this.busy) { this.onEvent({ type: 'warn', message: '이미 실행 중' }); return; }
    this.busy = true;
    try {
      const { session, muId, rule } = await this._context();
      if (!rule) { this.onEvent({ type: 'idle', message: '활성화된 광고 규칙이 없습니다(설정에서 켜세요).' }); return; }

      const win = this._ensureWin();
      let loggedIn = false;
      try {
        loggedIn = await ensureWingSession(win);
      } catch (e) {
        // WING 셀렉터 미설정 등
        this.onEvent({ type: 'error', message: e.message });
        return;
      }
      if (!loggedIn) {
        win.show(); // 사용자가 직접 윙 로그인하도록 창을 보여줌
        this.onEvent({ type: 'login-required', message: '윙에 로그인해 주세요. 로그인 후 다시 실행하면 진행됩니다.' });
        return;
      }

      const db = makeSupabaseDb(session, muId);
      const summary = await runAdEvaluation({
        ruleRow: rule,
        collect: (opts) => collectMetrics(win, opts),
        apply: (t) => applyBidChange(win, t),
        offApply: (t) => toggleCampaign(win, { campaignId: t.campaignId, on: false }),
        db,
        workerId: 'desktop-ads',
        onEvent: this.onEvent,
      });
      // B-1 삭제 패스 (OFF 후 N일 경과분)
      await runDeletePass({
        ruleRow: rule, db,
        deleteApply: (t) => deleteCampaign(win, { campaignId: t.campaignId }),
        workerId: 'desktop-ads', onEvent: this.onEvent,
      });
      // B-2 자동등록 큐 처리 (일일 상한 내)
      await runRegisterQueue({
        ruleRow: rule, db,
        register: (t) => registerItem(win, t),
        workerId: 'desktop-ads', onEvent: this.onEvent,
      });
      this.onEvent({ type: 'done', ...summary });
    } catch (e) {
      this.onEvent({ type: 'error', message: e.message });
    } finally {
      this.busy = false;
    }
  }

  /** 주기 실행 시작 */
  async start({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
    if (this.timer) return;
    await this.runOnce();
    this.timer = setInterval(() => { this.runOnce().catch(() => {}); }, intervalMs);
    this.onEvent({ type: 'started', intervalMs });
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.win && !this.win.isDestroyed()) { this.win.destroy(); this.win = null; }
    this.onEvent({ type: 'stopped' });
  }

  // ── 윙 DOM 캡처 도우미 (WING 셀렉터 설정값을 알아내기 위한 1회용) ──
  /** 윙 창을 띄워 사용자가 로그인 후 광고 리포트 화면까지 이동하게 한다. */
  async openCapture() {
    const win = this._ensureWin();
    win.show();
    await win.loadURL('https://wing.coupang.com/');
    this.onEvent({ type: 'capture-open', message: '윙에 로그인하고 광고 성과 리포트 화면까지 이동한 뒤 "HTML 저장"을 누르세요.' });
    return true;
  }

  /** 현재 윙 창의 전체 HTML을 파일로 저장 → 그 파일을 공유하면 셀렉터를 채울 수 있다. */
  async saveCaptureHtml(filePath) {
    if (!this.win || this.win.isDestroyed()) throw new Error('윙 창이 없습니다. 먼저 "윙 열기"를 누르세요.');
    const html = await this.win.webContents.executeJavaScript('document.documentElement.outerHTML');
    await writeFile(filePath, html, 'utf8');
    this.onEvent({ type: 'capture-saved', path: filePath });
    return filePath;
  }
}
