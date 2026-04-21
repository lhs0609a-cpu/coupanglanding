import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * admin API 권한 확인.
 * - read  : admin 또는 partner 허용
 * - write : admin 만 허용 (파트너는 락 해제/강제 재시도 등 금전 영향 조치 금지)
 */
export async function requireAdminRole(
  supabase: SupabaseClient,
  userId: string | undefined,
  mode: 'read' | 'write',
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: '인증 필요' }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (!profile) {
    return {
      ok: false,
      response: NextResponse.json({ error: '프로필 없음' }, { status: 403 }),
    };
  }

  if (mode === 'read') {
    if (profile.role !== 'admin' && profile.role !== 'partner') {
      return {
        ok: false,
        response: NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 }),
      };
    }
  } else {
    if (profile.role !== 'admin') {
      return {
        ok: false,
        response: NextResponse.json(
          { error: '결제/락 변경은 관리자(admin) 권한만 가능합니다' },
          { status: 403 },
        ),
      };
    }
  }

  return { ok: true };
}
