import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 15;

/**
 * GET /api/admin/education/students/[ptUserId]
 * 단일 학생의 모든 모듈 진행 상태 (없는 모듈은 ensure_pt_education_progress 로 자동 시드).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ ptUserId: string }> }) {
  try {
    const { ptUserId } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !['admin', 'partner'].includes(profile.role)) {
      return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 });
    }

    const serviceClient = await createServiceClient();

    // 학생 정보
    const { data: ptUser, error: ptErr } = await serviceClient
      .from('pt_users')
      .select('id, status, profile:profiles(id, full_name, email, phone)')
      .eq('id', ptUserId)
      .maybeSingle();
    if (ptErr) return NextResponse.json({ error: ptErr.message }, { status: 500 });
    if (!ptUser) return NextResponse.json({ error: '학생을 찾을 수 없습니다' }, { status: 404 });

    // 진행 상태 시드 (없는 모듈만 추가됨)
    await serviceClient.rpc('ensure_pt_education_progress', { p_pt_user_id: ptUserId });

    // 모듈 마스터 + 진행 상태 함께 조회
    const [{ data: modules }, { data: progress }] = await Promise.all([
      serviceClient.from('pt_education_modules')
        .select('*').eq('is_active', true)
        .order('display_order', { ascending: true }),
      serviceClient.from('pt_education_progress')
        .select('*').eq('pt_user_id', ptUserId),
    ]);

    return NextResponse.json({ ptUser, modules, progress });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 },
    );
  }
}
