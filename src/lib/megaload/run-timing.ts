'use client';

/**
 * 한 판이 실제로 얼마나 걸렸나 — 소싱에서 검수까지의 **시계 기록**.
 * ---------------------------------------------------------------------------
 * ⭐ 왜 필요한가
 *   진행 중에는 경과·남은시간이 보이지만, 끝나고 검수 화면에 도착하면 그 숫자가 통째로
 *   사라진다. 그래서 "1개에 얼마나 걸리더라?"를 매번 감으로 답하게 되고, 100개를 돌릴지
 *   말지를 판단할 근거가 없다. 끝난 뒤에 **총 얼마 걸렸는지**가 남아야 계획을 세운다.
 *
 *   단계별로 나눠 적는 이유도 같다. 총합만 있으면 "느리다"까지만 알고 **어디가 느린지**를
 *   모른다. 상세 준비(관리자 도우미가 네이버를 여는 구간)와 생성(내 PC 의 AI)은 고치는
 *   방법이 완전히 다르다.
 *
 * 카탈로그 → 검수는 페이지가 새로 뜨는 이동이라 상태가 안 넘어간다. autopilot-handoff 와
 * 같은 자리(sessionStorage·그 탭 한정)를 쓰고, 한 번 읽으면 지운다 — 다음 판에 옛 기록이
 * 따라붙으면 그건 거짓말이 된다.
 */

export interface RunTiming {
  /** [등록하기]를 누른 시각(ms). 총 소요는 여기서부터 잰다. */
  startedAt: number;
  /** 이번 판에 만든 상품 수. 상품당 평균·100개 환산의 분모다. */
  count: number;
  /** 0단계 — 상세를 아직 안 받아 둔 상품을 관리자 도우미가 뽑아 오는 구간. 없었으면 0. */
  detailWaitMs: number;
  /** 1단계 — 사진·정보를 내 PC 로 가져오는 구간. */
  importMs: number;
  /** 2단계(상세페이지 생성) 시작 시각. 끝은 검수 화면이 뜬 시각으로 잰다. */
  genStartedAt: number;
}

const KEY = 'megaload.run.timing';
/** 기록 유효시간. 이보다 오래된 건 이번 판의 것이 아니다. */
const TTL_MS = 6 * 60 * 60_000;

/** 검수 화면으로 넘어가기 직전에 적는다. */
export function saveRunTiming(t: RunTiming): void {
  try { window.sessionStorage.setItem(KEY, JSON.stringify({ ...t, at: Date.now() })); } catch { /* 못 적으면 표시만 없다 */ }
}

/** 한 번 읽고 지운다 — 다음 판에 옛 기록이 따라붙으면 안 된다. */
export function consumeRunTiming(): RunTiming | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<RunTiming> & { at?: number };
    if (typeof v?.startedAt !== 'number' || v.startedAt <= 0) return null;
    if (typeof v.at === 'number' && Date.now() - v.at >= TTL_MS) return null;
    return {
      startedAt: v.startedAt,
      count: Math.max(0, Number(v.count) || 0),
      detailWaitMs: Math.max(0, Number(v.detailWaitMs) || 0),
      importMs: Math.max(0, Number(v.importMs) || 0),
      genStartedAt: Math.max(0, Number(v.genStartedAt) || 0),
    };
  } catch {
    return null;
  }
}
