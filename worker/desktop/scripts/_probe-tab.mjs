/**
 * 탐침 공용 발판 — 크롬 탭 하나를 열어 페이지 안에서 JS 를 돌린다.
 * ---------------------------------------------------------------------------
 * 예전에는 탐침마다 electron 을 부팅하고 `new BrowserWindow({partition})` 을 직접 만들었다.
 * 네이버 접속이 전부 크롬으로 옮겨가면서 그 파티션에는 로그인이 없다 — 탐침도 같은 크롬
 * 프로필을 써야 실전과 같은 조건에서 잰다.
 *
 * 덤: **순수 node 로 돈다.** electron 부팅이 없어져서 그냥 `node scripts/….mjs` 로 실행된다.
 *
 * 프로필은 운영과 같은 자리다(로그인 승계). MEGALOAD_CHROME_PROFILE 로 바꿀 수 있다.
 */
import { join } from 'node:path';
import {
  initChromeSession, ensureChromeBrowser, closeChrome, naverCookieState,
} from '../main/modules/naver-ingest/chrome-session.mjs';
import { ChromeTab } from '../main/modules/naver-ingest/chrome-tab.mjs';

export const say = (s) => process.stdout.write(String(s) + '\n');

export function probeUserDataDir() {
  return process.env.MEGALOAD_CHROME_PROFILE
    ? join(process.env.MEGALOAD_CHROME_PROFILE, '..')
    : join(process.env.APPDATA || process.env.HOME || '.', 'megaload-desktop');
}

/**
 * 탭 하나를 열어 fn(tab) 을 돌리고 반드시 정리한다.
 * @param {(tab: ChromeTab) => Promise<any>} fn
 */
export async function withProbeTab(fn, { warmUp = true, quiet = false } = {}) {
  initChromeSession({ userDataDir: probeUserDataDir(), onLog: quiet ? () => {} : (m) => say('  · ' + m) });
  await ensureChromeBrowser();
  const li = await naverCookieState();
  if (!quiet) say(`로그인: ${li.loggedIn ? 'O' : 'X'}`);

  const tab = new ChromeTab(0);
  try {
    await tab.ensure();
    if (warmUp && !(await tab.warmUp())) say('⚠️ 워밍업 실패 — 그대로 진행합니다.');
    return await fn(tab);
  } finally {
    tab.close();
    await closeChrome();
  }
}

/**
 * "주소 하나 열고 페이지 안에서 JS 한 번 돌리기" — 탐침 대부분이 이것뿐이다.
 * 이동은 실전과 같은 클릭 이동을 쓴다(주소 직접 열기는 네이버가 막는다).
 */
export async function probeUrl(url, js, { settleMs = 3000, warmUp = true } = {}) {
  return withProbeTab(async (tab) => {
    const nav = await tab.gotoViaClick(url, { timeoutMs: 20000 });
    if (!nav.ok) return { error: `이동 실패: ${nav.error || 'unknown'}` };
    await new Promise((r) => { const t = setTimeout(r, settleMs); t.unref?.(); });
    return tab.evaluate(js).catch((e) => ({ error: String(e?.message || e) }));
  }, { warmUp });
}
