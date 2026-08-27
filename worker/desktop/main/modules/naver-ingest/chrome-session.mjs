/**
 * 크롬 한 벌을 앱 전체가 나눠 쓴다 — 네이버로 나가는 **모든** 경로의 유일한 브라우저.
 * ---------------------------------------------------------------------------
 * 왜 싱글턴인가: 조종석이 둘이기 때문이다(도우미 탭 / 웹 대시보드). 각자 크롬을 띄우면
 * 같은 PC 에서 네이버 세션이 두 개가 되고, 네이버 눈에는 "같은 IP 의 다른 사람 둘"이 된다.
 * 예산도 두 배로 태운다.
 *
 * ⭐ 2026-08-27 — 일렉트론 창을 전부 걷어내고 여기로 모았다.
 *   예전에는 목록 수집만 크롬이고 상세·카테고리·로그인·품절감시는 일렉트론 창이었다. 그래서
 *   **세션이 둘로 갈렸다**: 자동 로그인은 일렉트론 파티션에 성공하는데 수집은 크롬 프로필을
 *   보는 바람에, 로그에 "✅ 자동 로그인 성공" 12초 뒤에 "크롬에 네이버 로그인이 필요합니다"가
 *   찍혔다. 쿠키 저장소가 하나여야 그 모순이 사라진다.
 *
 * 프로필은 userData 아래 고정 자리를 쓴다 — 로그인이 거기 남아야 다음 실행이 조용하다.
 *
 * 탭 구성:
 *   · 수집·상세용 탭들 → tab-pool.mjs 가 소유한다(여기서는 newTab 만 빌려준다)
 *   · 품절 감시 탭 1장 → stock-monitor 가 따로 쥔다(직렬 조회, 풀과 섞지 않는다)
 *   · 로그인 판정 → **탭을 쓰지 않는다.** 브라우저 수준 Storage.getCookies 로 본다.
 */
import { join } from 'node:path';
import { ChromeBrowser, findChrome } from './chrome-cdp.mjs';

let browser = null;
let userDataDir = null;
let onLog = () => {};
let launching = null;

/**
 * 자동 로그인 처리기 — service.mjs 가 시작할 때 꽂아 준다.
 * ★ 여기서 service.mjs 를 import 하면 순환 참조가 된다(service → chrome-session → service).
 *   그래서 방향을 뒤집어 주입받는다.
 */
let autoLoginHandler = null;

/**
 * 로그인이 확인된 **바로 그 순간** 쿠키에 만료시각을 찍는 처리기(naver-session 이 꽂는다).
 * ★ 왜 그 자리여야 하나(실측 2026-08-27): 네이버가 막 내준 NID_AUT/NID_SES 는 **세션 쿠키**다.
 *   도장을 안 찍은 채 크롬이 닫히면 로그인이 통째로 사라진다 — 방금 로그인했는데 다음 실행이
 *   또 로그인 화면이고, 그 로그인 시도가 곧 캡차다. 주기 타이머(60초)에 맡기면 그 사이에
 *   앱이 꺼진 경우를 못 막는다.
 */
let loginPersistHandler = null;

export function initChromeSession({ userDataDir: dir, onLog: log } = {}) {
  userDataDir = dir || userDataDir;
  if (log) onLog = log;
}

/** service.mjs 가 자기 autoLoginNow 를 꽂는다. 없으면 사람이 직접 로그인하는 경로로 간다. */
export function setAutoLoginHandler(fn) { autoLoginHandler = fn; }

/** naver-session.mjs 가 persistLoginCookies 를 꽂는다(순환 참조를 피하려고 방향을 뒤집었다). */
export function setLoginPersistHandler(fn) { loginPersistHandler = fn; }

/** 로그인이 확인될 때마다 부른다 — 실패해도 로그인 자체를 무르지는 않는다. */
async function stampLogin() {
  try { await loginPersistHandler?.(); } catch { /* 도장 실패가 로그인을 되돌릴 이유는 없다 */ }
}

export function chromeProfileDir() {
  return join(userDataDir || '.', 'chrome-profile');
}

export function isChromeAvailable() {
  return !!findChrome();
}

/** 지금 크롬이 떠 있는가 — 상태 폴링이 크롬을 켜지 않도록 판단하는 값. */
export function chromeRunning() {
  return !!browser;
}

/**
 * 크롬을 띄운다(떠 있으면 그대로). 동시에 여러 곳에서 불러도 한 번만 뜨도록 묶는다 —
 * 탭 풀이 탭 3장을 3초 간격으로 만들면서 동시에 들어오기 때문이다.
 */
export async function ensureChromeBrowser() {
  if (browser) return browser;
  if (launching) return launching;
  if (!findChrome()) throw new Error('구글 크롬이 설치돼 있지 않습니다 — 크롬을 설치해 주세요.');

  launching = (async () => {
    const b = new ChromeBrowser({ profileDir: chromeProfileDir(), onLog });
    await b.launch();
    browser = b;
    return b;
  })();
  try {
    return await launching;
  } finally {
    launching = null;
  }
}

/** 탭 한 장을 새로 연다. 부르는 쪽이 수명을 책임진다(풀, 품절 감시). */
export async function newTab() {
  const b = await ensureChromeBrowser();
  return b.newPage();
}

/**
 * 브라우저 수준 CDP 한 발 — 탭 없이 쿠키를 읽고 쓸 때 쓴다(naver-session.mjs).
 * ★ 크롬이 안 떠 있으면 **띄우지 않고** null 을 돌려준다. 쿠키를 보려고 크롬을 켜면
 *   상태 폴링이 브라우저를 깨우는 꼴이 된다.
 */
export async function chromeSend(method, params = {}) {
  if (!browser) return null;
  return browser.send(method, params);
}

/**
 * 네이버 로그인 상태 — **쿠키로만** 본다(페이지를 열지 않는다 = 예산 0).
 * ★ 탭이 아니라 브라우저 수준(Storage.getCookies)에서 읽는다. 탭 하나를 로그인 판정용으로
 *   붙들고 있을 이유가 없고, 상태 폴링이 탭을 만들면 안 되기 때문이다.
 * 크롬이 안 떠 있으면 띄우지 않고 모른다고 답한다.
 */
export async function naverCookieState() {
  if (!browser) return { running: false, loggedIn: false, hasAuth: false, persistent: false };
  const r = await browser.send('Storage.getCookies').catch(() => null);
  const all = r?.cookies || [];
  // 도메인은 '.naver.com' / 'nid.naver.com' / 'naver.com' 세 모양으로 온다.
  const isNaver = (c) => /(^|\.)naver\.com$/.test(String(c.domain || ''));
  const pick = (n) => all.find((c) => c.name === n && c.value && isNaver(c));
  const aut = pick('NID_AUT');
  const ses = pick('NID_SES');
  return {
    running: true,
    loggedIn: !!(aut && ses),
    hasAuth: !!aut,
    // expires 가 -1 이면 세션 쿠키다 — 크롬을 닫으면 사라진다.
    persistent: !!(aut && Number(aut.expires) > 0 && ses && Number(ses.expires) > 0),
  };
}

/**
 * 로그인을 확보한다. 저장된 계정이 있으면 **먼저 자동으로** 시도하고, 그게 안 될 때만 사람을 부른다.
 * ---------------------------------------------------------------------------
 * ⚠️ 예전에는 계정이 저장돼 있어도 무조건 사람을 5분 기다렸다. 자동 로그인은 일렉트론 창에만
 *   되고 수집은 크롬을 보던 시절의 잔재다 — 이제 같은 쿠키 저장소라 그럴 이유가 없다.
 * ⚠️ 로그인이 안 된 채로 목록에 가면 로그인 화면이 아니라 **"오류 + 새로고침"** 이 뜬다
 *   (실측 2026-08-25). 그래서 들어가기 전에 여기서 확실히 끊는다.
 *
 * @param {object} opts.tab  로그인 화면을 띄울 탭(ChromePage). 없으면 임시 탭을 열고 닫는다.
 */
export async function ensureChromeLogin({ waitMs = 300_000, tab = null } = {}) {
  // ★ 쿠키를 보기 전에 크롬을 먼저 띄운다. 안 그러면 프로필에 로그인이 멀쩡히 남아 있어도
  //   "안 떠 있음 = 로그아웃"으로 읽어 쓸데없이 자동 로그인을 돌린다(그게 곧 캡차다).
  await ensureChromeBrowser();
  let st = await naverCookieState();
  // 이미 로그인돼 있어도 세션 쿠키면 도장을 찍는다 — 네이버는 브라우징 중 NID_SES 를
  // 세션 쿠키로 계속 재발급해서, 어제 찍은 도장이 오늘 지워져 있는 일이 흔하다.
  if (st.loggedIn) { if (!st.persistent) await stampLogin(); return { ok: true, already: true }; }

  // ① 저장된 계정으로 조용히 시도한다 — 사람이 자리에 없어도 여기서 끝나는 게 정상 경로다.
  if (autoLoginHandler) {
    const r = await autoLoginHandler().catch(() => null);
    if (r?.ok) return { ok: true, auto: true };
    // 자격증명이 없거나(no-credential) 쿨다운 중이면(cooling) 사람을 부르는 게 맞다.
    // 캡차·2단계에 막힌 경우도 마찬가지 — 그 판단은 handler 안에서 끝난다.
  }

  st = await naverCookieState();
  if (st.loggedIn) { await stampLogin(); return { ok: true, auto: true }; }

  // ② 사람 차례.
  const own = !tab;
  const p = tab || (await newTab());
  try {
    onLog('네이버 로그인이 필요합니다 — 크롬 창에서 직접 로그인해 주세요("로그인 상태 유지" 권장).');
    await p.goto('https://nid.naver.com/nidlogin.login', { settleMs: 1500 });
    await p.bringToFront().catch(() => {});

    const until = Date.now() + waitMs;
    while (Date.now() < until) {
      await new Promise((r) => { const t = setTimeout(r, 4000); t.unref?.(); });
      const cur = await naverCookieState().catch(() => st);
      if (cur.loggedIn) {
        // ★ 여기서 **반드시** 도장을 찍는다. 안 찍으면 세션 쿠키라 크롬이 닫히는 순간
        //   방금 한 로그인이 통째로 사라진다(실측 2026-08-27).
        await stampLogin();
        onLog('네이버 로그인 확인됨.');
        return { ok: true };
      }
    }
    return { ok: false, error: '로그인이 확인되지 않았습니다.' };
  } finally {
    if (own) await p.close().catch(() => {});
  }
}

export async function closeChrome() {
  try { await browser?.close(); } catch { /* ignore */ }
  browser = null;
  launching = null;
}
