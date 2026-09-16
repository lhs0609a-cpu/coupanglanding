/**
 * 아카데미 요청 컨텍스트 — 누구인가, 무엇을 볼 수 있는가.
 *
 * 접근 범위(2026-09-16 확정):
 *   Act 0~2 = 로그인한 전원 (무료 공개 — 여기까지 해본 사람이 PT 를 산다)
 *   Act 3~5 = PT 학생 전용
 */

import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { AcademyStep } from '@/lib/data/academy/types';

export interface AcademyContext {
  userId: string;
  megaloadUserId: string | null;
  isPtStudent: boolean;
  service: Awaited<ReturnType<typeof createServiceClient>>;
}

export type AcademyContextResult =
  | { ok: true; ctx: AcademyContext }
  | { ok: false; status: number; error: string };

export async function getAcademyContext(): Promise<AcademyContextResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: '로그인이 필요합니다.' };

  const service = await createServiceClient();

  const [{ data: shUser }, { data: ptUser }] = await Promise.all([
    service.from('megaload_users').select('id').eq('profile_id', user.id).maybeSingle(),
    service.from('pt_users').select('id').eq('profile_id', user.id).maybeSingle(),
  ]);

  return {
    ok: true,
    ctx: {
      userId: user.id,
      megaloadUserId: (shUser?.id as string) ?? null,
      isPtStudent: !!ptUser,
      service,
    },
  };
}

/** 이 스텝을 열어도 되는가 */
export function canAccess(step: AcademyStep, ctx: AcademyContext): boolean {
  return step.access === 'public' || ctx.isPtStudent;
}

/**
 * XP → 레벨. 설계도 §8-2 는 "실제 셀러 상태" 로 승급시키지만,
 * 그건 Phase 5(게이미피케이션)에서 붙인다. Phase 1 은 XP 누계로만 센다.
 */
export function levelFromXp(xp: number): { level: number; label: string; nextAt: number | null } {
  const TABLE: { at: number; label: string }[] = [
    { at: 0,    label: '예비 셀러' },
    { at: 150,  label: '입점 셀러' },
    { at: 350,  label: '첫 상품 셀러' },
    { at: 600,  label: '판매 셀러' },
    { at: 900,  label: '운영 셀러' },
  ];
  let level = 1;
  for (let i = 0; i < TABLE.length; i++) if (xp >= TABLE[i].at) level = i + 1;
  return {
    level,
    label: TABLE[level - 1].label,
    nextAt: level < TABLE.length ? TABLE[level].at : null,
  };
}
