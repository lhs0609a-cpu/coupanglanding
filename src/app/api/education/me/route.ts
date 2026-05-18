import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 10;

/**
 * GET /api/education/me
 * 로그인한 학생 본인의 교육 모듈 + 진행 상태.
 * 어드민 API와 동일한 구조지만 자기 것만 반환 + RLS 의존 (서비스 클라이언트 사용 안 함).
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const serviceClient = await createServiceClient();

    // pt_user 조회 (없으면 학생 아님)
    const { data: ptUser } = await serviceClient
      .from('pt_users')
      .select('id, status')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (!ptUser) {
      return NextResponse.json({ error: 'PT 학생이 아닙니다' }, { status: 403 });
    }

    // 진행 상태 보장 (없는 모듈은 자동 시드)
    await serviceClient.rpc('ensure_pt_education_progress', { p_pt_user_id: ptUser.id });

    const [{ data: modules }, { data: progress }] = await Promise.all([
      serviceClient.from('pt_education_modules')
        .select('key, title, category, external_link, sub_modules, display_order, trigger_hint')
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
      serviceClient.from('pt_education_progress')
        .select('module_key, status, sub_progress, triggered_at, completed_at, resume_point')
        .eq('pt_user_id', ptUser.id),
    ]);

    return NextResponse.json({ modules, progress });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 },
    );
  }
}
