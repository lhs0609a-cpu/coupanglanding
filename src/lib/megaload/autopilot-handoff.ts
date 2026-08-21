'use client';

/**
 * 무인 자동등록 **인계장** — 소싱 카탈로그에서 켠 것을 검수 화면이 이어받는 자리.
 * ---------------------------------------------------------------------------
 * ⭐ 왜 필요한가
 *   무인 자동등록은 원래 검수 화면(AllInOneRegisterPanel)의 React 상태로만 존재했다.
 *   그런데 카탈로그에서 등록을 누르면 검수 화면으로 **페이지가 새로 뜬다** — 그 순간
 *   상태가 통째로 초기화되므로, 카탈로그에서 무인을 켤 방법 자체가 없었다.
 *   "소싱에서 고르면 사람 손 없이 등록까지"가 정작 소싱 화면에서 시작할 수 없었던 셈이다.
 *
 * ⚠️ 동의 없이 무인이 도는 일은 절대 없어야 한다. 그래서 이 인계장은 **동의의 사본**이지
 *   동의를 만들어 내는 곳이 아니다. 지키는 것 넷:
 *
 *   ① 동의는 여기서 만들지 않는다 — 검수 화면과 **같은 위험 모달**(SkipReviewRiskModal)을
 *      통과한 결과만 적힌다. 통로가 둘로 갈리면 한쪽이 느슨해진다.
 *   ② sessionStorage 다 — **그 탭에서만** 산다. 북마크나 주소 복사로 남의 탭에서
 *      무인이 켜지지 않는다(localStorage 였다면 브라우저를 껐다 켜도 살아 있다).
 *   ③ 30분이면 만료된다. 소싱 → 생성 → 검수 한 판보다 넉넉하되, 아침에 켠 것이
 *      저녁까지 남아 있지는 않다. (검수 화면 쪽 6시간 동의 만료도 그대로 또 걸린다)
 *   ④ **한 번 쓰면 지운다**(consume). 한 번 켠 것으로 다음 판까지 자동 등록되면
 *      사람이 동의한 적 없는 등록이 된다.
 *
 * 이걸 받은 뒤에도 검수 화면은 10초 카운트다운을 그대로 띄운다 — 눈앞에 있으면 멈출 수 있어야 한다.
 */

export interface AutoPilotHandoff {
  /** 위험 모달을 통과한 시각(ms). 검수 화면이 이 값으로 동의 유효기간을 다시 잰다. */
  consentAt: number;
  /** 등록 직전 AI 최종점검 실행 여부 */
  audit: boolean;
  /** 점검으로도 못 고친 상품을 등록에서 뺄지 */
  excludeUnfixed: boolean;
}

const KEY = 'megaload.autopilot.handoff';
/** 인계장 유효시간. 소싱 → 생성 → 검수 한 판이 이 안에 끝난다. */
export const HANDOFF_TTL_MS = 30 * 60_000;

function read(): AutoPilotHandoff | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<AutoPilotHandoff>;
    if (typeof v?.consentAt !== 'number' || v.consentAt <= 0) return null;
    if (Date.now() - v.consentAt >= HANDOFF_TTL_MS) return null;   // 만료
    return {
      consentAt: v.consentAt,
      audit: v.audit !== false,
      excludeUnfixed: v.excludeUnfixed !== false,
    };
  } catch {
    return null;
  }
}

/** 위험 모달을 통과한 직후에만 부른다. 반환값은 방금 적은 인계장. */
export function armHandoff(opts: { audit: boolean; excludeUnfixed: boolean }): AutoPilotHandoff {
  const v: AutoPilotHandoff = { consentAt: Date.now(), audit: opts.audit, excludeUnfixed: opts.excludeUnfixed };
  try { window.sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* 저장 못 하면 무인은 안 켜진다 — 안전한 쪽 */ }
  return v;
}

/** 지우지 않고 본다 — 카탈로그 화면이 "지금 켜져 있음"을 표시하는 용도. */
export function peekHandoff(): AutoPilotHandoff | null {
  return read();
}

/** 한 번 쓰고 지운다 — 검수 화면이 무장할 때 부른다. */
export function consumeHandoff(): AutoPilotHandoff | null {
  const v = read();
  clearHandoff();
  return v;
}

export function clearHandoff(): void {
  try { window.sessionStorage.removeItem(KEY); } catch { /* 지우기 실패는 만료가 대신 막는다 */ }
}
