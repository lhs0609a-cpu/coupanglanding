/**
 * 네이버 전용 브라우저 세션 — **품절 감시와 소싱 수집이 세션 하나를 공유한다.**
 * ---------------------------------------------------------------------------
 * 왜 합치는가:
 *   품절 감시(stock-monitor)와 소싱 수집(naver-ingest)이 서로 다른 파티션을 쓰고 있었다.
 *   그래서 사람이 소싱 화면에서 네이버 로그인을 해도 **품절 감시는 여전히 비로그인**으로 돌았다.
 *   smartstore.naver.com 은 비로그인 조회를 429 로 막는다(실측: brand 3/3 성공, smartstore 0/5).
 *   같은 PC·같은 가정 IP·같은 사람인데 세션만 둘로 쪼개면, 네이버 입장에서 "쿠키 없는 신규
 *   방문자"가 하나 더 생기는 셈이라 이득이 없고 손해만 있다(naver-ingest/browser.mjs 원칙 ③).
 *
 * ★ 파티션 문자열을 'persist:naveringest' 그대로 두는 이유:
 *   이미 소싱용으로 로그인해 둔 사용자의 쿠키가 이 파티션에 들어 있다. 이름이 예뻐 보이는
 *   새 값으로 바꾸면 그 로그인이 통째로 날아가고 사람이 다시 로그인해야 한다. 이름보다 승계가 중요.
 *   (버려지는 옛 품절 감시 파티션 'persist:naverscrape' 에는 NNB 시드 쿠키뿐이라 잃을 게 없다.)
 *
 * 페이싱은 별개다 — 요청 속도 조절은 naver-gate.mjs 가 이미 두 갈래를 합쳐서 담당한다.
 * 여기는 "누구로 보이는가"(쿠키·세션)만 담당한다.
 */

/** 네이버로 나가는 모든 창이 공유하는 파티션. 값 변경 금지(위 주석 참고). */
export const NAVER_PARTITION = 'persist:naveringest';

/**
 * 이미지 차단을 잠시 푸는 스위치.
 * 평소엔 이미지/미디어/폰트를 안 받는 게 이득이지만, **사람이 직접 봐야 하는 화면**(로그인·캡차)
 * 에서는 로고·보안문자가 안 보이면 아예 진행이 불가능하다. 그때만 잠깐 연다.
 * 세션이 하나로 합쳐졌으므로 이 스위치도 하나뿐이다 — 로그인 창이 열려 있는 동안은
 * 품절 감시도 이미지를 받는데, 몇 분짜리라 무시할 수 있는 비용이다.
 */
let _mediaAllowed = false;
export function setMediaAllowed(on) { _mediaAllowed = !!on; }
export function isMediaAllowed() { return _mediaAllowed; }

/**
 * 파티션에 리소스 차단을 1회 설치.
 * ★ 전용 파티션에만 걸어야 앱 UI 아이콘이 안 깨진다.
 * ★ onBeforeRequest 는 세션당 리스너가 하나뿐이라 나중에 건 쪽이 앞의 것을 덮는다.
 *   그래서 설치 지점이 반드시 여기 하나여야 한다(양쪽 모듈이 각자 걸면 서로를 지운다).
 */
let _blockerPromise = null;
export function installBlocker() {
  if (_blockerPromise) return _blockerPromise;
  _blockerPromise = (async () => {
    try {
      const { session } = await import('electron');
      session.fromPartition(NAVER_PARTITION).webRequest.onBeforeRequest(
        { urls: ['*://*/*'] },
        (details, cb) => cb({
          cancel: !_mediaAllowed && ['image', 'media', 'font'].includes(details.resourceType),
        }),
      );
    } catch { /* best-effort — 차단 실패해도 동작은 한다(느려질 뿐) */ }
  })();
  return _blockerPromise;
}

/**
 * 네이버 로그인 여부 — **쿠키로 판정한다**.
 * 화면(로그아웃 버튼 유무)으로 보면 페이지 종류마다 마크업이 달라 오판하고, 판정하려고 페이지를
 * 한 장 여는 것 자체가 네이버 예산이다. 쿠키는 요청 0회에 확실하다.
 */
export async function loginState() {
  try {
    const { session } = await import('electron');
    const cookies = await session.fromPartition(NAVER_PARTITION).cookies.get({ domain: '.naver.com' });
    const pick = (name) => cookies.find((c) => c.name === name && c.value);
    const aut = pick('NID_AUT');
    const loggedIn = !!(aut && pick('NID_SES'));
    // ★ 로그인이 앱 재시작을 견디는가 — 실측(2026-08-18): 그냥 로그인하면 NID_AUT/NID_SES 는
    //   **세션 쿠키**라 디스크에 저장되지 않고 프로세스가 죽으면 사라진다(재시작 후 로그아웃 실측).
    //   네이버 로그인 화면의 "로그인 상태 유지"를 켜야 만료시각이 붙은 영속 쿠키가 된다.
    //   이 구분을 알려주지 않으면 사용자는 "로그인했는데 왜 또?"만 반복해서 겪는다.
    // ★ persistent 는 **둘 다** 영속일 때만 참이다. NID_AUT 만 만료시각이 붙어 있으면
    //   화면엔 "유지됨"이라 뜨는데 실제로는 NID_SES 가 사라져 로그인이 깨진다(실측: 재시작
    //   때마다 loggedIn=false·persistent=true 라는 모순된 상태가 나왔다).
    const ses = pick('NID_SES');
    // hasAuth = 장기 인증 쿠키가 남아 있다 → **로그인 없이 세션을 되살릴 수 있다**는 뜻이다.
    //   (naver-keepalive.reviveSession 이 이 신호로 캡차 없는 복구를 판단한다)
    return { loggedIn, hasAuth: !!aut, persistent: !!(aut?.expirationDate && ses?.expirationDate) };
  } catch (e) {
    return { loggedIn: false, hasAuth: false, persistent: false, error: String(e?.message || e) };
  }
}

/**
 * 로그인 쿠키를 **디스크에 남게** 만든다 — 로그인 성공 직후 1회.
 * ---------------------------------------------------------------------------
 * 왜 필요한가(실측 2026-08-18): "로그인 상태 유지"를 켜도, 캡차 화면을 거치면 페이지가 다시
 * 그려지면서 체크가 풀린다. 그러면 네이버는 NID_AUT/NID_SES 를 **세션 쿠키**로 주고, 앱을
 * 껐다 켜는 순간 로그아웃이다. 실제로 앱을 재시작할 때마다 캡차를 다시 풀어야 했다.
 *
 * 하는 일은 하나뿐이다: **이미 발급받은 쿠키를 값 그대로 다시 심되 만료시각을 붙인다.**
 * 값을 만들지도, 바꾸지도 않는다 — 브라우저가 그 쿠키를 메모리에만 둘지 디스크에도 둘지의
 * 문제라서, 세션의 실제 유효기간은 여전히 네이버 서버가 정한다(만료되면 자동 로그인이 돈다).
 *
 * ★ 이미 영속인 쿠키도 만료가 가까우면 **다시 찍는다**. 예전엔 세션 쿠키만 손댔는데, NID_AUT 는
 *   한 번 도장을 찍고 나면 네이버가 다시 발급할 일이 거의 없다 → 그 자리에서 늙어 죽고,
 *   그 날짜가 지나면 앱을 아무리 켜 뒀어도 통째로 로그아웃이었다. 앱을 쓰는 동안은 계속 젊게 유지한다.
 */
const PERSIST_DAYS = 90;

/**
 * 로그아웃이 도는 동안은 도장을 찍지 않는다.
 * 안 막으면 이런 일이 난다: 로그아웃이 쿠키를 지우는 사이, 그 직전에 쿠키를 읽어 둔 재도장이
 * 방금 지운 쿠키를 **값 그대로 되살린다** → 로그아웃 버튼이 안 먹는 것처럼 보인다.
 * 지우는 쪽이 항상 이겨야 한다(계정을 바꾸려는 사람의 의도가 우리 자동화보다 우선이다).
 */
let _logoutBusy = false;
let _logoutAt = 0;
const logoutInProgress = () => _logoutBusy || Date.now() - _logoutAt < 2000;

export async function persistLoginCookies({ days = PERSIST_DAYS } = {}) {
  const PERSIST = /^(NID_AUT|NID_SES|NID_JKL|nid_inf)$/;
  if (logoutInProgress()) return 0;
  try {
    const { session } = await import('electron');
    const ses = session.fromPartition(NAVER_PARTITION);
    const cookies = await ses.cookies.get({ domain: '.naver.com' });
    const expirationDate = Math.floor(Date.now() / 1000) + days * 86400;
    const renewBefore = Math.floor(Date.now() / 1000) + (days * 86400) / 2;   // 반환점을 지나면 갱신
    let n = 0;
    for (const c of cookies) {
      if (!PERSIST.test(c.name)) continue;
      // 세션 쿠키면 도장을 찍고, 영속이라도 만료가 가까우면 연장한다. 둘 다 아니면 건드리지 않는다.
      if (!c.session && Number(c.expirationDate) > renewBefore) continue;
      try {
        await ses.cookies.set({
          url: `https://${c.domain.replace(/^\./, '')}${c.path || '/'}`,
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          sameSite: c.sameSite,
          expirationDate,
        });
        n += 1;
      } catch { /* 한 개 실패해도 나머지는 살린다 */ }
    }
    // ★ 디스크에 **지금** 쓰게 강제한다. Chromium 은 쿠키를 주기적으로만 flush 하는데,
    //   앱이 강제 종료되면(개발 중 재시작·작업관리자 종료) 아직 안 쓴 쿠키가 통째로 날아간다.
    //   실측: 방금 로그인한 세션이 재시작 후 NID_AUT 까지 없어져 자가복구가 재료 없이 실패했다.
    //   flush 는 로컬 I/O 라 네트워크 비용이 0 이다 — 아낄 이유가 없다.
    try { await ses.cookies.flushStore(); } catch { /* 구버전 electron 은 없을 수 있다 */ }
    return n;
  } catch {
    return 0;
  }
}

/** 지금 당장 디스크에 쓴다 — 앱을 끄기 직전처럼 "다음 기회"가 없는 순간에. */
export async function flushCookies() {
  try {
    const { session } = await import('electron');
    await session.fromPartition(NAVER_PARTITION).cookies.flushStore();
    return true;
  } catch { return false; }
}

/**
 * 쿠키 상시 감시 — **로그인이 앱 재시작·재부팅을 견디게 하는 핵심.**
 * ---------------------------------------------------------------------------
 * 왜 필요한가: 도장을 "언젠가 한 번" 찍는 방식은 전부 새는 구조였다.
 *   · 로그인 창은 성사만 확인하고 도장을 안 찍었다(품절 감시에서 로그인하면 그대로 세션 쿠키).
 *   · 소싱 패널의 상태 폴링에 얹어 두었더니, 그 화면을 안 여는 사람에겐 영영 안 돌았다.
 *   · 네이버는 브라우징 도중 NID_SES 를 **세션 쿠키로 계속 다시 준다** — 한 번 찍어 둔 도장이
 *     조용히 지워지고, 그걸 알아채는 사람이 아무도 없었다.
 * 그래서 "누가 봐 주면 고친다"를 그만두고, **쿠키가 바뀌는 순간 그 자리에서** 되돌려 놓는다.
 * 네트워크 요청이 0회라 얼마든지 자주 해도 공짜다.
 *
 * flush 는 모아서 한다 — 로그인 한 번에 쿠키가 여러 개 바뀌는데 매번 디스크에 쓸 이유가 없다.
 */
let _watchInstalled = false;
let _flushTimer = null;
let _restamping = false;
let _restampAgain = false;

export async function installCookiePersistence() {
  if (_watchInstalled) return true;
  _watchInstalled = true;
  const PERSIST = /^(NID_AUT|NID_SES|NID_JKL|nid_inf)$/;
  try {
    const { session } = await import('electron');
    const ses = session.fromPartition(NAVER_PARTITION);
    ses.cookies.on('changed', (_e, cookie, _cause, removed) => {
      // 삭제(로그아웃·만료)는 그대로 둔다 — 되살리면 로그아웃이 안 되는 버그가 된다.
      if (removed || !cookie?.session || !PERSIST.test(cookie.name)) return;
      // 우리가 다시 심는 동안 들어오는 이벤트로 되돌아 들어오지 않게 한다.
      // 그 사이에 진짜 새 쿠키가 왔을 수 있으므로 흘려보내지 않고 **한 번 더 돌** 예약만 남긴다
      // (persistLoginCookies 는 매번 쿠키 전체를 다시 읽으므로 한 바퀴면 전부 따라잡는다).
      if (_restamping) { _restampAgain = true; return; }
      const restamp = () => {
        _restamping = true;
        _restampAgain = false;
        persistLoginCookies({ days: PERSIST_DAYS })
          .catch(() => 0)
          .finally(() => { _restamping = false; if (_restampAgain) restamp(); });
      };
      restamp();
      if (_flushTimer) clearTimeout(_flushTimer);
      _flushTimer = setTimeout(() => { _flushTimer = null; flushCookies(); }, 3000);
      _flushTimer.unref?.();
    });
    // 앱을 켠 직후 한 번 — 지난번에 못 찍고 끝난 쿠키가 있으면 여기서 정리된다.
    await persistLoginCookies().catch(() => 0);
    return true;
  } catch {
    _watchInstalled = false;   // 다음 기회에 다시 시도할 수 있게 되돌린다
    return false;
  }
}

/** 로그아웃(쿠키 삭제) — 계정을 바꿀 때. 품절 감시도 같은 세션이므로 함께 로그아웃된다. */
export async function clearLogin() {
  _logoutBusy = true;
  try {
    const { session } = await import('electron');
    const ses = session.fromPartition(NAVER_PARTITION);
    const cookies = await ses.cookies.get({ domain: '.naver.com' });
    for (const c of cookies) {
      const url = `https://${c.domain.replace(/^\./, '')}${c.path}`;
      await ses.cookies.remove(url, c.name).catch(() => {});
    }
    // 지운 상태를 디스크에도 확정한다 — 안 그러면 재시작 때 옛 쿠키가 되살아난다.
    try { await ses.cookies.flushStore(); } catch { /* ignore */ }
    return true;
  } finally {
    _logoutBusy = false;
    _logoutAt = Date.now();
  }
}

// ─── 네이버 로그인 창 ────────────────────────────────────────────────────────
// **사람이 직접 로그인한다.** 아이디/비밀번호를 우리 화면에서 받지 않는 이유 3가지:
//   ① 남의 계정 비밀번호를 우리가 보관하면 사고 시 책임이 전부 이쪽으로 온다.
//   ② 2단계 인증·기기등록·보안문자가 걸린 계정은 자동 입력으로 애초에 못 뚫는다.
//   ③ 폼에 자동 타이핑하는 것 자체가 네이버가 잡아내는 봇 시그널이다.
// 창은 네이버 로그인 페이지로 바로 가고, 우리는 결과(쿠키)만 관찰한다.
const LOGIN_URL = 'https://nid.naver.com/nidlogin.login';
const LOGIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOGIN_WAIT_MS = 10 * 60 * 1000;   // 사람이 보안문자·2단계까지 하기 충분한 시간
const LOGIN_POLL_MS = 3000;

let _loginWin = null;

export function isLoginWindowOpen() {
  return !!(_loginWin && !_loginWin.isDestroyed());
}

/**
 * 로그인 창을 띄우고, 쿠키로 성사를 관찰한다.
 * 즉시 반환한다(창이 떠 있는 동안 UI 를 막지 않는다) — 결과는 onLog 와 loginState 로 나온다.
 */
export async function openLoginWindow({ onLog = () => {} } = {}) {
  const st = await loginState();
  if (st.loggedIn) {
    onLog('이미 네이버에 로그인되어 있습니다.');
    return { ok: true, already: true, loggedIn: true };
  }
  if (isLoginWindowOpen()) {
    try { _loginWin.show(); _loginWin.focus(); } catch { /* ignore */ }
    return { ok: true, already: true };
  }

  const { BrowserWindow } = await import('electron');
  await installBlocker();
  setMediaAllowed(true);   // ★ 보안문자가 안 보이면 사람이 로그인을 못 한다

  _loginWin = new BrowserWindow({
    width: 520,
    height: 760,
    show: true,
    title: '네이버 로그인',
    autoHideMenuBar: true,
    webPreferences: { partition: NAVER_PARTITION, javascript: true, backgroundThrottling: false },
  });
  _loginWin.on('closed', () => { _loginWin = null; setMediaAllowed(false); });
  _loginWin.loadURL(LOGIN_URL, { userAgent: LOGIN_UA })
    .catch((e) => onLog('로그인 창을 여는 데 실패했습니다: ' + (e?.message || e)));

  onLog('네이버 로그인 창을 열었습니다 — 창에서 직접 로그인하세요. 아이디·비밀번호는 저장하지 않습니다.');

  // 성사 관찰 — 창을 닫으면 즉시 끝난다. 사람이 방치해도 10분 뒤엔 스스로 접는다.
  void (async () => {
    const deadline = Date.now() + LOGIN_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => { const t = setTimeout(r, LOGIN_POLL_MS); t.unref?.(); });
      if (!isLoginWindowOpen()) { onLog('로그인 창이 닫혔습니다.'); return; }
      const s = await loginState();
      if (s.loggedIn) {
        // ★ 여기서 **반드시** 도장을 찍는다. 예전엔 성사만 알리고 "로그인 상태 유지를 켜라"고
        //   사람에게 떠넘겼는데, 그 체크는 캡차 화면을 지나면 저절로 풀려서 지킬 수가 없었다.
        //   (그래서 재시작할 때마다 캡차를 다시 푸는 일이 반복됐다.)
        await persistLoginCookies().catch(() => 0);
        await flushCookies();
        const after = await loginState();
        onLog(after.persistent
          ? '✅ 네이버 로그인 완료 — 앱을 껐다 켜도, 재부팅해도 유지됩니다.'
          : '✅ 네이버 로그인 완료 — 이제 스마트스토어 상품도 확인합니다.');
        setMediaAllowed(false);
        try { _loginWin.close(); } catch { /* ignore */ }
        return;
      }
    }
    onLog('로그인 대기를 종료합니다(10분) — 필요하면 다시 눌러주세요.');
    setMediaAllowed(false);
    try { _loginWin?.close(); } catch { /* ignore */ }
  })();

  return { ok: true, started: true };
}
