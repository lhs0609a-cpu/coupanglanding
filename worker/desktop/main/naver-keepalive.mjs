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
import { loginState, persistLoginCookies } from './naver-session.mjs';
import { chromeRunning, newTab } from './modules/naver-ingest/chrome-session.mjs';

const VISIT_URL = 'https://www.naver.com/';

/** 방문 간격 — 세션을 살려 두기엔 충분하고, 네이버 예산으로는 무시할 수 있는 수준. */
const KEEP_INTERVAL_MS = 25 * 60 * 1000;

let timer = null;
let busy = false;
let last = { at: 0, ok: false, reason: '' };

/**
 * 탭 하나로 네이버를 잠깐 열었다 닫는다 — 쿠키만 받아 오는 게 목적이다.
 * ★ 주기 유지(keep)는 크롬이 안 떠 있으면 **띄우지 않는다.** 세션 유지는 있으면 좋은 것이지,
 *   그것 때문에 브라우저를 깨울 일은 아니다(그 순간 사용자 화면에 크롬 창이 튀어나온다).
 *   반대로 되살리기(revive)는 누군가 지금 수집을 하려는 중이라 띄워도 된다 — launch:true.
 */
async function visitNaver({ launch = false } = {}) {
  if (!launch && !chromeRunning()) return false;
  const tab = await newTab();
  try {
    await tab.goto(VISIT_URL, { settleMs: 1500 });
    return true;
  } finally {
    await tab.close().catch(() => {});
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
    await visitNaver({ launch: true });
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
  /**
   * ⚠️ 예전 tick 은 결과를 **어디에도 남기지 않았다.** `last` 는 선언만 돼 있고 한 번도
   *    갱신되지 않아 keepAliveState() 가 영원히 {at:0, ok:false} 를 돌려줬고, 실패는
   *    빈 catch 가 통째로 삼켰다. 그래서 "keep-alive 가 도는지"를 **아무도 확인할 수 없었다** —
   *    이게 도는 줄 알고 세션 만료를 다른 데서 찾고 있었다(실측 2026-08-28).
   *    세션 유지는 캡차를 막는 첫 번째 방어선이라, 조용히 죽어 있으면 안 되는 종류의 일이다.
   */
  const tick = async () => {
    const started = Date.now();
    const mark = (ok, reason) => { last = { at: started, ok, reason }; };
    try {
      const st = await loginState();
      if (st.loggedIn) {
        const visited = await visitNaver();
        if (!visited) return mark(false, '크롬이 안 떠 있어 건너뜀');   // 정상 동작이다(창을 깨우지 않는다)
        const kept = await persistLoginCookies().catch(() => 0);
        return mark(true, kept ? `세션 갱신 · 쿠키 ${kept}개에 만료 도장` : '세션 갱신');
      }
      if (st.hasAuth) {
        // 반쪽 세션 — 로그인 화면을 거치지 않고 되살린다(캡차가 붙을 자리가 없다).
        const rev = await reviveSession({ onLog });
        return mark(!!rev?.loggedIn, rev?.loggedIn ? '반쪽 세션 되살림' : (rev?.reason || '되살리기 실패'));
      }
      return mark(false, st.stale ? '상태 미확인(크롬 꺼짐)' : '로그인 안 됨');
    } catch (e) {
      // 조용히 삼키지 않는다 — 연속 실패는 곧 세션 만료이고, 그다음은 로그인이고, 그다음이 캡차다.
      const reason = String(e?.message || e);
      mark(false, reason);
      onLog(`네이버 세션 유지에 실패했습니다(${reason}). ${Math.round(KEEP_INTERVAL_MS / 60000)}분 뒤 다시 시도합니다.`);
    }
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
