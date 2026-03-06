import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { status, actions_taken, resolution_note } = body;

    const serviceClient = await createServiceClient();

    // 권한 체크: 본인 인시던트 or 관리자
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';

    if (!isAdmin) {
      const { data: ptUser } = await supabase
        .from('pt_users')
        .select('id')
        .eq('profile_id', user.id)
        .maybeSingle();

      if (!ptUser) {
        return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
      }

      const { data: incident } = await serviceClient
        .from('incidents')
        .select('pt_user_id')
        .eq('id', id)
        .single();

      if (!incident || incident.pt_user_id !== ptUser.id) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
      }
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status) updateData.status = status;
    if (actions_taken) updateData.actions_taken = actions_taken;
    if (resolution_note) updateData.resolution_note = resolution_note;
    if (status === 'resolved') updateData.resolved_at = new Date().toISOString();

    const { data, error } = await serviceClient
      .from('incidents')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
