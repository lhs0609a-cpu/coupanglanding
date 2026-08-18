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
    return { loggedIn, persistent: !!aut?.expirationDate };
  } catch (e) {
    return { loggedIn: false, persistent: false, error: String(e?.message || e) };
  }
}

/** 로그아웃(쿠키 삭제) — 계정을 바꿀 때. 품절 감시도 같은 세션이므로 함께 로그아웃된다. */
export async function clearLogin() {
  const { session } = await import('electron');
  const ses = session.fromPartition(NAVER_PARTITION);
  const cookies = await ses.cookies.get({ domain: '.naver.com' });
  for (const c of cookies) {
    const url = `https://${c.domain.replace(/^\./, '')}${c.path}`;
    await ses.cookies.remove(url, c.name).catch(() => {});
  }
  return true;
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
        onLog('✅ 네이버 로그인 완료 — 이제 스마트스토어 상품도 확인합니다.');
        if (!s.persistent) {
          onLog('⚠️ 다만 이 로그인은 앱을 껐다 켜면 풀립니다 — 네이버 로그인 화면의 "로그인 상태 유지"를 켜고 다시 로그인하면 계속 유지됩니다.');
        }
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
