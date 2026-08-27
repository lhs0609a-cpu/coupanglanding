/**
 * 네이버 세션 — **이 앱에서 네이버 쿠키의 단일 출처.**
 * ---------------------------------------------------------------------------
 * 품절 감시(stock-monitor)와 소싱 수집(naver-ingest)이 세션 하나를 공유한다. 같은 PC·같은
 * 가정 IP·같은 사람인데 세션만 쪼개면, 네이버 입장에서 "쿠키 없는 신규 방문자"가 하나 더
 * 생기는 셈이라 이득이 없고 손해만 있다. smartstore.naver.com 은 비로그인 조회를 429 로
 * 막는다(실측: brand 3/3 성공, smartstore 0/5).
 *
 * ⭐ 2026-08-27 — 저장소가 **일렉트론 파티션에서 크롬 프로필로** 옮겨졌다.
 *   그전에는 수집만 크롬이고 나머지는 일렉트론 파티션(persist:naveringest)이었다. 그래서
 *   자동 로그인은 일렉트론에 성공하는데 수집은 크롬을 보는, 로그로 이렇게 드러나는 모순이 있었다:
 *       ✅ 네이버 자동 로그인 성공          (일렉트론 파티션)
 *       크롬에 네이버 로그인이 필요합니다     (12초 뒤, 크롬 프로필)
 *   이제 네이버로 나가는 모든 경로가 크롬 한 벌을 쓰므로 저장소도 하나다.
 *   ⚠️ 사용자는 **이 버전에서 한 번만** 다시 로그인해야 한다. 옛 파티션의 쿠키는 크롬으로
 *      옮길 수 없다(암호화 키가 프로필에 묶여 있다). 계정을 저장해 둔 사용자는 자동 로그인이
 *      알아서 처리하므로 아무 일도 일어나지 않는다.
 *
 * 페이싱은 별개다 — 요청 속도 조절은 naver-gate.mjs 가 두 갈래를 합쳐서 담당한다.
 * 여기는 "누구로 보이는가"(쿠키·세션)만 담당한다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  chromeRunning, chromeSend, newTab, ensureChromeLogin, naverCookieState, setLoginPersistHandler,
} from './modules/naver-ingest/chrome-session.mjs';

/** 우리가 만료시각을 붙여 지켜 주는 쿠키 — 이 넷이 로그인의 전부다. */
const PERSIST = /^(NID_AUT|NID_SES|NID_JKL|nid_inf)$/;
const PERSIST_DAYS = 90;
const isNaver = (domain) => /(^|\.)naver\.com$/.test(String(domain || ''));

/**
 * 마지막으로 **실제로 확인한** 로그인 상태.
 * ★ 왜 디스크에 남기나: 크롬은 필요할 때만 뜬다. 크롬이 안 떠 있는 동안 loginState() 가
 *   무조건 "로그아웃"이라고 답하면, 앱을 켜자마자 화면이 "네이버 로그인 필요"를 띄우고
 *   품절 감시는 스마트스토어를 통째로 건너뛴다 — 실제로는 로그인이 멀쩡한데도.
 *   그래서 마지막 확인값을 stale 표시와 함께 돌려준다. 크롬이 뜨는 순간 실측으로 대체된다.
 */
let _cachePath = null;
let _cache = { loggedIn: false, hasAuth: false, persistent: false, at: 0 };

export function initNaverSession(userDataDir) {
  // 로그인이 확인되는 순간 크롬 쪽에서 이걸 부른다 — 세션 쿠키로 남으면 크롬이 닫힐 때 사라진다.
  setLoginPersistHandler(() => persistLoginCookies());
  _cachePath = join(userDataDir || tmpdir(), 'naver-login-state.json');
  try {
    const s = JSON.parse(readFileSync(_cachePath, 'utf8'));
    if (s && typeof s === 'object') _cache = { ...(_cache), ...s };
  } catch { /* 없으면 기본값 */ }
}

function saveCache(st) {
  _cache = { loggedIn: !!st.loggedIn, hasAuth: !!st.hasAuth, persistent: !!st.persistent, at: Date.now() };
  if (!_cachePath) return;
  try { writeFileSync(_cachePath, JSON.stringify(_cache)); } catch { /* 저장 실패가 로그인을 막을 이유는 없다 */ }
}

/**
 * 네이버 로그인 여부 — **쿠키로 판정한다**.
 * 화면(로그아웃 버튼 유무)으로 보면 페이지 종류마다 마크업이 달라 오판하고, 판정하려고 페이지를
 * 한 장 여는 것 자체가 네이버 예산이다. 쿠키는 요청 0회에 확실하다.
 *
 * 반환:
 *   loggedIn   NID_AUT + NID_SES 둘 다 있음
 *   hasAuth    장기 인증 쿠키만 남음 → **로그인 화면 없이 세션을 되살릴 수 있다**는 뜻
 *              (naver-keepalive.reviveSession 이 이 신호로 캡차 없는 복구를 판단한다)
 *   persistent 둘 다 만료시각이 붙어 있음. 하나라도 세션 쿠키면 크롬을 닫는 순간 깨진다 —
 *              화면엔 "유지됨"인데 재시작하면 로그아웃인 모순을 막으려고 **둘 다**를 본다.
 *   stale      크롬이 안 떠 있어 마지막 확인값을 그대로 돌려준 경우
 */
export async function loginState() {
  if (!chromeRunning()) return { ..._cache, stale: true };
  try {
    const st = await naverCookieState();
    saveCache(st);
    return { loggedIn: st.loggedIn, hasAuth: st.hasAuth, persistent: st.persistent };
  } catch (e) {
    return { ..._cache, stale: true, error: String(e?.message || e) };
  }
}

/** 브라우저 수준 쿠키 목록 — 탭을 쓰지 않는다. */
async function allCookies() {
  const r = await chromeSend('Storage.getCookies').catch(() => null);
  return (r?.cookies || []).filter((c) => isNaver(c.domain));
}

/**
 * 로그아웃이 도는 동안은 도장을 찍지 않는다.
 * 안 막으면 이런 일이 난다: 로그아웃이 쿠키를 지우는 사이, 그 직전에 쿠키를 읽어 둔 재도장이
 * 방금 지운 쿠키를 **값 그대로 되살린다** → 로그아웃 버튼이 안 먹는 것처럼 보인다.
 * 지우는 쪽이 항상 이겨야 한다(계정을 바꾸려는 사람의 의도가 우리 자동화보다 우선이다).
 */
let _logoutBusy = false;
let _logoutAt = 0;
const logoutInProgress = () => _logoutBusy || Date.now() - _logoutAt < 2000;

/**
 * 로그인 쿠키를 **디스크에 남게** 만든다.
 * ---------------------------------------------------------------------------
 * 왜 필요한가(실측 2026-08-18): "로그인 상태 유지"를 켜도, 캡차 화면을 거치면 페이지가 다시
 * 그려지면서 체크가 풀린다. 그러면 네이버는 NID_AUT/NID_SES 를 **세션 쿠키**로 주고, 브라우저를
 * 닫는 순간 로그아웃이다. 실제로 앱을 재시작할 때마다 캡차를 다시 풀어야 했다.
 *
 * 하는 일은 하나뿐이다: **이미 발급받은 쿠키를 값 그대로 다시 심되 만료시각을 붙인다.**
 * 값을 만들지도, 바꾸지도 않는다 — 브라우저가 그 쿠키를 메모리에만 둘지 디스크에도 둘지의
 * 문제라서, 세션의 실제 유효기간은 여전히 네이버 서버가 정한다(만료되면 자동 로그인이 돈다).
 *
 * ★ 이미 영속인 쿠키도 만료가 가까우면 다시 찍는다. NID_AUT 는 한 번 도장을 찍고 나면 네이버가
 *   다시 발급할 일이 거의 없다 → 그 자리에서 늙어 죽고, 그 날짜가 지나면 통째로 로그아웃이었다.
 */
export async function persistLoginCookies({ days = PERSIST_DAYS } = {}) {
  if (logoutInProgress() || !chromeRunning()) return 0;
  try {
    const cookies = await allCookies();
    const expires = Math.floor(Date.now() / 1000) + days * 86400;
    const renewBefore = Math.floor(Date.now() / 1000) + (days * 86400) / 2;   // 반환점을 지나면 갱신
    const want = [];
    for (const c of cookies) {
      if (!PERSIST.test(c.name)) continue;
      // 세션 쿠키면 도장을 찍고, 영속이라도 만료가 가까우면 연장한다. 둘 다 아니면 건드리지 않는다.
      if (!c.session && Number(c.expires) > renewBefore) continue;
      want.push({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        secure: !!c.secure,
        httpOnly: !!c.httpOnly,
        ...(c.sameSite ? { sameSite: c.sameSite } : {}),
        expires,
      });
    }
    if (!want.length) return 0;
    // 한 번에 심는다 — 하나씩 보내면 그사이 네이버가 재발급한 쿠키와 엇갈린다.
    await chromeSend('Storage.setCookies', { cookies: want });
    return want.length;
  } catch {
    return 0;
  }
}

/**
 * 크롬은 쿠키를 알아서 디스크에 쓴다(일렉트론처럼 flushStore 를 부를 창구가 CDP 에 없다).
 * 대신 **끄기 직전에 도장을 한 번 더 찍는** 것이 같은 목적을 달성한다 — 세션 쿠키로 남아 있으면
 * 크롬이 닫히는 순간 사라지기 때문이다. 호출부(main.mjs)를 안 고치려고 이름을 유지한다.
 */
export async function flushCookies() {
  await persistLoginCookies().catch(() => 0);
  return true;
}

/**
 * 쿠키 상시 유지 — **로그인이 앱 재시작·재부팅을 견디게 하는 핵심.**
 * ---------------------------------------------------------------------------
 * 도장을 "언젠가 한 번" 찍는 방식은 전부 새는 구조였다. 네이버는 브라우징 도중 NID_SES 를
 * **세션 쿠키로 계속 다시 준다** — 한 번 찍어 둔 도장이 조용히 지워지고, 그걸 알아채는 사람이
 * 아무도 없었다.
 *
 * 일렉트론 시절엔 `cookies.on('changed')` 로 바뀌는 순간 되돌렸다. CDP 에는 브라우저 수준의
 * 같은 이벤트가 없어서 **주기적으로** 다시 찍는다. 쿠키 조작은 네트워크 요청이 0회라 공짜고,
 * 60초면 그사이 크롬이 죽어도 잃을 게 없다.
 */
let _timer = null;
export async function installCookiePersistence() {
  if (_timer) return true;
  _timer = setInterval(() => { persistLoginCookies().catch(() => 0); }, 60_000);
  _timer.unref?.();
  await persistLoginCookies().catch(() => 0);
  return true;
}

/** 로그아웃(쿠키 삭제) — 계정을 바꿀 때. 품절 감시도 같은 세션이므로 함께 로그아웃된다. */
export async function clearLogin() {
  _logoutBusy = true;
  try {
    if (!chromeRunning()) { saveCache({ loggedIn: false, hasAuth: false, persistent: false }); return true; }
    const cookies = await allCookies();
    // 삭제는 탭 세션의 Network.deleteCookies 로 한다 — 브라우저 수준에는 도메인을 가려 지우는
    // 창구가 없다(Storage.clearCookies 는 **전부** 지운다).
    const tab = await newTab();
    try {
      for (const c of cookies) {
        await tab.send('Network.deleteCookies', { name: c.name, domain: c.domain, path: c.path || '/' })
          .catch(() => { /* 한 개 실패해도 나머지는 지운다 */ });
      }
    } finally {
      await tab.close().catch(() => {});
    }
    saveCache({ loggedIn: false, hasAuth: false, persistent: false });
    return true;
  } finally {
    _logoutBusy = false;
    _logoutAt = Date.now();
  }
}

// ─── 네이버 로그인 창 ────────────────────────────────────────────────────────
// 크롬 창에서 **사람이 직접** 로그인한다. 저장된 계정이 있으면 ensureChromeLogin 이 먼저
// 자동으로 시도하고, 그게 막힐 때만 사람을 부른다.
let _loginBusy = false;

export function isLoginWindowOpen() {
  return _loginBusy;
}

/**
 * 로그인을 확보한다. 즉시 반환한다(창이 떠 있는 동안 UI 를 막지 않는다) —
 * 결과는 onLog 와 loginState 로 나온다.
 */
export async function openLoginWindow({ onLog = () => {} } = {}) {
  const st = await loginState();
  if (st.loggedIn && !st.stale) {
    onLog('이미 네이버에 로그인되어 있습니다.');
    return { ok: true, already: true, loggedIn: true };
  }
  if (_loginBusy) return { ok: true, already: true };
  _loginBusy = true;

  void (async () => {
    try {
      const r = await ensureChromeLogin({ waitMs: 10 * 60 * 1000 });
      if (!r.ok) { onLog('로그인 대기를 종료합니다(10분) — 필요하면 다시 눌러주세요.'); return; }
      // ★ 여기서 **반드시** 도장을 찍는다. 예전엔 성사만 알리고 "로그인 상태 유지를 켜라"고
      //   사람에게 떠넘겼는데, 그 체크는 캡차 화면을 지나면 저절로 풀려서 지킬 수가 없었다.
      await persistLoginCookies().catch(() => 0);
      const after = await loginState();
      onLog(after.persistent
        ? '✅ 네이버 로그인 완료 — 앱을 껐다 켜도, 재부팅해도 유지됩니다.'
        : '✅ 네이버 로그인 완료 — 이제 스마트스토어 상품도 확인합니다.');
    } catch (e) {
      onLog('로그인에 실패했습니다: ' + (e?.message || e));
    } finally {
      _loginBusy = false;
    }
  })();

  return { ok: true, started: true };
}
