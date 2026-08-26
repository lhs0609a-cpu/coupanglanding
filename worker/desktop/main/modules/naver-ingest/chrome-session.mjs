/**
 * 크롬 한 벌을 앱 전체가 나눠 쓴다 — WindowPool 이 Electron 창에 하는 일을 크롬에 한다.
 * ---------------------------------------------------------------------------
 * 왜 싱글턴인가: 조종석이 둘이기 때문이다(도우미 탭 / 웹 대시보드). 각자 크롬을 띄우면
 * 같은 PC 에서 네이버 세션이 두 개가 되고, 네이버 눈에는 "같은 IP 의 다른 사람 둘"이 된다.
 * 예산도 두 배로 태운다. service.mjs 가 창 풀을 하나만 두는 것과 같은 이유다.
 *
 * 프로필은 userData 아래 고정 자리를 쓴다 — 로그인이 거기 남아야 다음 실행이 조용하다.
 */
import { join } from 'node:path';
import { ChromeBrowser, findChrome } from './chrome-cdp.mjs';

let browser = null;
let page = null;
let userDataDir = null;
let onLog = () => {};

export function initChromeSession({ userDataDir: dir, onLog: log } = {}) {
  userDataDir = dir || userDataDir;
  if (log) onLog = log;
}

export function chromeProfileDir() {
  return join(userDataDir || '.', 'chrome-profile');
}

export function isChromeAvailable() {
  return !!findChrome();
}

/** 떠 있으면 그대로, 아니면 띄운다. 페이지는 한 장만 쓴다(스크롤 수집은 한 창이 이어서 해야 한다). */
export async function ensureChrome() {
  if (browser && page) return { browser, page };
  if (!findChrome()) throw new Error('구글 크롬이 설치돼 있지 않습니다 — 크롬을 설치해 주세요.');

  browser = new ChromeBrowser({ profileDir: chromeProfileDir(), onLog });
  await browser.launch();
  page = await browser.newPage();
  await page.send('Network.enable');
  return { browser, page };
}

/**
 * 네이버 로그인 상태 — **쿠키로만** 본다(페이지를 열지 않는다 = 예산 0).
 * 크롬이 안 떠 있으면 띄우지 않고 모른다고 답한다. 상태 폴링이 크롬을 켜면 안 된다.
 */
export async function chromeLoginState() {
  if (!page) return { running: false, loggedIn: false };
  const li = await page.naverLogin().catch(() => ({ loggedIn: false }));
  return { running: true, ...li };
}

/**
 * 로그인 창을 띄우고 사람이 로그인할 때까지 기다린다.
 * ⚠️ 로그인이 안 된 채로 목록에 가면 로그인 화면이 아니라 **"오류 + 새로고침"** 이 뜬다
 *   (실측 2026-08-25). 그래서 들어가기 전에 여기서 확실히 끊는다.
 */
export async function ensureChromeLogin({ waitMs = 300_000 } = {}) {
  const { page: p } = await ensureChrome();
  let li = await p.naverLogin();
  if (li.loggedIn) return { ok: true, already: true };

  onLog('네이버 로그인이 필요합니다 — 크롬 창에서 직접 로그인해 주세요("로그인 상태 유지" 권장).');
  await p.goto('https://nid.naver.com/nidlogin.login', { settleMs: 1500 });

  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    await new Promise((r) => { const t = setTimeout(r, 4000); t.unref?.(); });
    li = await p.naverLogin().catch(() => li);
    if (li.loggedIn) { onLog('네이버 로그인 확인됨.'); return { ok: true }; }
  }
  return { ok: false, error: '로그인이 확인되지 않았습니다.' };
}

export async function closeChrome() {
  try { await browser?.close(); } catch { /* ignore */ }
  browser = null;
  page = null;
}
