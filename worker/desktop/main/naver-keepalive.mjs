/**
 * 네이버 세션 keep-alive — **캡차가 뜨는 조건 자체를 없앤다.**
 * ---------------------------------------------------------------------------
 * 왜 캡차가 자꾸 떴나(실측 2026-08-18, 하루 종일):
 *   캡차는 "로그인 시도"에 붙는다. 우리가 로그인을 자꾸 한 이유는 세션이 자꾸 깨졌기 때문이고,
 *   세션이 깨진 이유는 **NID_SES 가 사라져서**다. NID_AUT(장기 인증)는 만료시각을 붙여 두면
 *   디스크에 남는데, NID_SES 는 네이버가 브라우징 중 세션 쿠키로 계속 새로 발급한다.
 *   그래서 앱을 껐다 켜면 NID_AUT 만 남고 NID_SES 가 없는 **반쪽 세션**이 되고, 우리는 그걸
 *   "로그아웃"으로 읽어 새 로그인을 시도했다 → 캡차.
 *
 * 핵심: 반쪽 세션은 **로그인할 필요가 없다.** NID_AUT 를 들고 네이버를 한 번 방문하면
 * 네이버가 NID_SES 를 다시 내준다. 아이디·비밀번호도, 캡차도 개입하지 않는다.
 *
 * 그래서 이 파일이 하는 일은 둘뿐이다.
 *   ① 되살리기(revive)  — NID_SES 가 없을 때 네이버를 한 번 방문해 다시 받아 온다.
 *   ② 유지하기(keep)    — 주기적으로 같은 일을 해 세션이 늙어 죽지 않게 한다.
 * 둘 다 요청 1회짜리이고, 로그인 화면을 거치지 않으므로 캡차를 유발하지 않는다.
 */
import { NAVER_PARTITION, installBlocker, loginState, persistLoginCookies } from './naver-session.mjs';

const VISIT_URL = 'https://www.naver.com/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 방문 간격 — 세션을 살려 두기엔 충분하고, 네이버 예산으로는 무시할 수 있는 수준. */
const KEEP_INTERVAL_MS = 25 * 60 * 1000;

let timer = null;
let busy = false;
let last = { at: 0, ok: false, reason: '' };

/** 창 하나로 네이버를 잠깐 열었다 닫는다 — 쿠키만 받아 오는 게 목적이다. */
async function visitNaver(timeoutMs = 15000) {
  const { BrowserWindow } = await import('electron');
  await installBlocker();
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
    webPreferences: { partition: NAVER_PARTITION, javascript: true, backgroundThrottling: false },
  });
  try {
    await new Promise((resolve) => {
      const done = () => { clearTimeout(t); resolve(); };
      const t = setTimeout(done, timeoutMs);
      if (t.unref) t.unref();
      win.webContents.once('did-finish-load', done);
      win.webContents.once('did-fail-load', done);
      win.loadURL(VISIT_URL, { userAgent: UA }).catch(done);
    });
    // 쿠키가 자리를 잡을 짧은 여유.
    await new Promise((r) => { const t = setTimeout(r, 1200); if (t.unref) t.unref(); });
  } finally {
    try { if (!win.isDestroyed()) win.destroy(); } catch { /* ignore */ }
  }
}

/**
 * 반쪽 세션이면 되살린다.
 * @returns {Promise<{revived:boolean, loggedIn:boolean, reason:string}>}
 */
export async function reviveSession({ onLog = () => {} } = {}) {
  if (busy) return { revived: false, loggedIn: false, reason: 'busy' };
  busy = true;
  try {
    const before = await loginState();
    if (before.loggedIn) {
      // 살아 있으면 만료시각만 다시 찍어 둔다(다음 재시작을 견디게).
      await persistLoginCookies().catch(() => 0);
      last = { at: Date.now(), ok: true, reason: 'already' };
      return { revived: false, loggedIn: true, reason: 'already' };
    }
    // NID_AUT 도 없으면 되살릴 재료가 없다 — 여기서 로그인을 시도하지 않는다(그게 캡차다).
    if (!before.hasAuth) {
      last = { at: Date.now(), ok: false, reason: 'no-auth-cookie' };
      return { revived: false, loggedIn: false, reason: 'no-auth-cookie' };
    }

    onLog('네이버 세션을 되살립니다 — 로그인 없이 방문 1회로 복구합니다.');
    await visitNaver();
    const after = await loginState();
    if (after.loggedIn) {
      await persistLoginCookies().catch(() => 0);
      onLog('✅ 세션 복구 완료 — 로그인 화면을 거치지 않았습니다(캡차 없음).');
      last = { at: Date.now(), ok: true, reason: 'revived' };
      return { revived: true, loggedIn: true, reason: 'revived' };
    }
    last = { at: Date.now(), ok: false, reason: 'revive-failed' };
    return { revived: false, loggedIn: false, reason: 'revive-failed' };
  } catch (e) {
    last = { at: Date.now(), ok: false, reason: String(e?.message || e) };
    return { revived: false, loggedIn: false, reason: last.reason };
  } finally {
    busy = false;
  }
}

/**
 * 주기 유지 시작 — 앱이 켜져 있는 동안 세션이 늙어 죽지 않게 한다.
 * 로그인 상태일 때만 방문한다(비로그인인데 찔러 봐야 의미가 없고 트래픽만 는다).
 */
export function startKeepAlive({ onLog = () => {} } = {}) {
  if (timer) return;
  const tick = async () => {
    try {
      const st = await loginState();
      if (st.loggedIn) {
        await visitNaver();
        await persistLoginCookies().catch(() => 0);
      } else if (st.hasAuth) {
        await reviveSession({ onLog });
      }
    } catch { /* 유지 실패는 다음 주기에 다시 */ }
  };
  timer = setInterval(tick, KEEP_INTERVAL_MS);
  if (timer.unref) timer.unref();
  // 앱을 켜자마자 한 번 — 재시작 직후의 반쪽 세션이 여기서 조용히 복구된다.
  setTimeout(() => { tick().catch(() => {}); }, 5000).unref?.();
}

export function stopKeepAlive() {
  if (timer) { clearInterval(timer); timer = null; }
}

export function keepAliveState() {
  return { running: !!timer, last };
}
