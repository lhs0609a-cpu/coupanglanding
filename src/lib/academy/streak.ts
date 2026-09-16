/**
 * 스트릭 — "연속 로그인" 이 아니라 **연속 운영**을 센다(설계도 §8-4).
 *
 * 로그인만 해도 오르는 스트릭은 아무것도 측정하지 않는다.
 * 여기서 하루가 채워지는 조건은 둘 중 하나다:
 *   ① 아카데미 단계를 하나 통과했다
 *   ② 밀린 일(미출고 주문·미답변 문의)을 0으로 유지했다 — 최근 활동이 있는 상태에서만
 *
 * ②에 "최근 활동이 있을 때만" 을 붙인 이유: 주문도 문의도 없는 사람은 가만히 있어도
 * 0이다. 아무것도 안 한 사람에게 연속 기록을 주면 그 숫자는 거짓이 된다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** 한국 시간 기준 날짜 문자열. 자정 경계가 사용자 체감과 맞아야 한다. */
export function seoulDate(at = new Date()): string {
  return new Date(at.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export interface StreakState {
  current: number;
  best: number;
  lastDate: string | null;
  /** 오늘 이미 채워졌는가 */
  todayDone: boolean;
}

/**
 * 오늘 하루를 채운다. 같은 날 여러 번 불려도 한 번만 오른다.
 * 실패해도 던지지 않는다 — 스트릭 때문에 판정이 막히면 안 된다.
 */
export async function touchStreak(service: SupabaseClient, userId: string): Promise<StreakState | null> {
  try {
    const today = seoulDate();
    const { data: row } = await service
      .from('academy_streaks')
      .select('current_days, best_days, last_active_date')
      .eq('user_id', userId)
      .maybeSingle();

    const last = (row?.last_active_date as string | null) ?? null;
    if (last === today) {
      return {
        current: Number(row?.current_days ?? 0),
        best: Number(row?.best_days ?? 0),
        lastDate: last,
        todayDone: true,
      };
    }

    // 어제 이어서면 +1, 하루라도 건너뛰었으면 1부터 다시.
    const current = last && daysBetween(last, today) === 1 ? Number(row?.current_days ?? 0) + 1 : 1;
    const best = Math.max(current, Number(row?.best_days ?? 0));

    await service.from('academy_streaks').upsert(
      { user_id: userId, current_days: current, best_days: best, last_active_date: today },
      { onConflict: 'user_id' },
    );

    return { current, best, lastDate: today, todayDone: true };
  } catch {
    return null;
  }
}

/** 쓰지 않고 읽기만 — 화면 표시용. 끊긴 연속은 0으로 보여준다. */
export async function readStreak(service: SupabaseClient, userId: string): Promise<StreakState> {
  const { data: row } = await service
    .from('academy_streaks')
    .select('current_days, best_days, last_active_date')
    .eq('user_id', userId)
    .maybeSingle();

  const today = seoulDate();
  const last = (row?.last_active_date as string | null) ?? null;
  const stored = Number(row?.current_days ?? 0);
  // 어제까지는 살아 있다. 이틀 이상 비었으면 이미 끊긴 것이고, 숫자를 붙들고 있으면 거짓말이 된다.
  const alive = !!last && daysBetween(last, today) <= 1;

  return {
    current: alive ? stored : 0,
    best: Number(row?.best_days ?? 0),
    lastDate: last,
    todayDone: last === today,
  };
}
