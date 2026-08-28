'use client';

/**
 * 도우미 자동 재연결(auto-pair).
 *
 * ⭐ 왜 필요한가
 *   도우미는 저장된 리프레시 토큰(.session.json)으로 스스로 로그인을 복구한다. 그런데 그 토큰이
 *   서버에서 죽으면(폐기·회전 실패) 도우미는 **혼자서는 절대 복구할 수 없다** — 비밀번호를
 *   갖고 있지 않기 때문이다. 그때부터 올인원·썸네일·재생성·네이버 소싱이 전부 멈추는데,
 *   복구 방법은 "앱을 열어 메가로드 연결을 누른다" 뿐이었다(실측: 그 사이 10시간 방치).
 *
 *   하지만 사용자가 메가로드 사이트에 들어와 있는 순간, 브라우저에는 **살아 있는 세션**이 있고
 *   웹은 이미 127.0.0.1 에서 도우미를 찾아낼 수 있다. 즉 사람이 누를 이유가 없다 — 그래서
 *   /worker/activate 가 클릭으로 하던 일(POST /pair)을 여기서 자동으로 한다.
 *
 * ⚠️ 안전장치
 *   ① 세션이 **죽었을 때만** 보낸다(health.loggedIn === false). 멀쩡한 도우미의 세션을
 *      덮어쓰지 않는다. 구버전 도우미(loggedIn 미제공)는 서버 하트비트 판정(monitor-only/offline)
 *      으로만 시도한다 — 근거 없이 토큰을 뿌리지 않는다.
 *   ② silent:true — 도우미 창이 튀어나와 브라우저 포커스를 뺏지 않게 한다.
 *   ③ 탭마다 쿨다운·연속 실패 상한. 실패하는 상대에게 토큰을 계속 던지지 않는다.
 */

import { createClient } from '@/lib/supabase/client';
import { probeLocalHelper } from './allinone-local';

export type AutoPairResult =
  /** 붙였다 — 호출부는 상태를 다시 폴링하면 된다 */
  | { status: 'paired'; email: string | null }
  /** 도우미가 이미 로그인돼 있음 — 할 일 없음 */
  | { status: 'already' }
  /** 이 PC 에서 도우미를 못 찾음 */
  | { status: 'no-helper' }
  /** 브라우저에 세션이 없음(로그인 화면 등) */
  | { status: 'no-session' }
  /** 쿨다운·연속 실패 상한에 걸려 이번엔 건너뜀 */
  | { status: 'skipped' }
  | { status: 'failed'; error: string };

/** 같은 탭에서 30초 안에 두 번 시도하지 않는다(사이드바 폴러가 15초마다 돈다). */
const COOLDOWN_MS = 30_000;
/** 연속 실패가 이만큼이면 그 탭에서는 포기한다 — 안 되는 상대에게 토큰을 반복해 던지지 않는다. */
const MAX_FAILS = 3;

let lastAttemptAt = 0;
let failStreak = 0;
let inFlight: Promise<AutoPairResult> | null = null;

/**
 * @param heartbeatSaysDead 서버 하트비트 기준으로 세션 워커가 죽어 보이는가(monitor-only/offline).
 *   구버전 도우미(loggedIn 미제공)에서 유일한 판단 근거다.
 * @param onAttempt 실제로 POST /pair 를 쏘기 직전에 한 번 불린다. 쿨다운·상한에 걸려 건너뛴
 *   호출에서는 불리지 않는다 — UI 가 "자동 재연결 중…"을 진짜 시도할 때만 보이게 하기 위한 것이다.
 */
export async function autoPairHelper(
  heartbeatSaysDead: boolean,
  onAttempt?: () => void,
): Promise<AutoPairResult> {
  if (inFlight) return inFlight;                       // 폴러가 겹쳐 불러도 한 번만
  if (failStreak >= MAX_FAILS) return { status: 'skipped' };
  if (Date.now() - lastAttemptAt < COOLDOWN_MS) return { status: 'skipped' };
  lastAttemptAt = Date.now();

  inFlight = (async (): Promise<AutoPairResult> => {
    const health = await probeLocalHelper();
    if (!health) return { status: 'no-helper' };

    // 도우미가 스스로 "로그인됨"이라 하면 손대지 않는다. 그 값을 안 주는 구버전은
    // 서버 하트비트가 죽었다고 할 때만 시도한다(근거 없이 보내지 않는다).
    if (health.loggedIn === true) { failStreak = 0; return { status: 'already' }; }
    if (health.loggedIn === undefined && !heartbeatSaysDead) return { status: 'skipped' };

    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return { status: 'no-session' };

    onAttempt?.();
    try {
      const res = await fetch(`http://127.0.0.1:${health.ep.port}/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          nonce: health.ep.nonce,
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at ? data.session.expires_at * 1000 : undefined,
          // 사람이 누른 게 아니다 — 도우미 창을 띄우지 말라는 표시(v0.5.2+, 구버전은 무시).
          silent: true,
        }),
      });
      if (!res.ok) {
        failStreak++;
        return { status: 'failed', error: `HTTP ${res.status}` };
      }
      failStreak = 0;
      return { status: 'paired', email: data.session.user?.email ?? null };
    } catch (e) {
      failStreak++;
      return { status: 'failed', error: e instanceof Error ? e.message : String(e) };
    }
  })();

  try { return await inFlight; } finally { inFlight = null; }
}

/** 사용자가 직접 "지금 재연결"을 눌렀을 때 — 쿨다운·실패 상한을 푼다. */
export function resetAutoPairGuard(): void {
  lastAttemptAt = 0;
  failStreak = 0;
}
