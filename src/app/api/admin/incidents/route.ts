import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import { notifyIncidentStatusChange } from '@/lib/utils/notifications';

export const maxDuration = 30;


export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const serviceClient = await createServiceClient();

    let query = serviceClient
      .from('incidents')
      .select('*, pt_user:pt_users(id, profile:profiles(id, full_name, email))')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { id, status, admin_note } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'ID와 상태는 필수입니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    const updateData: Record<string, unknown> = {
      status,
      reviewed_by: user.id,
      updated_at: new Date().toISOString(),
    };

    if (admin_note !== undefined) updateData.admin_note = admin_note;
    if (status === 'resolved') updateData.resolved_at = new Date().toISOString();

    const { data, error } = await serviceClient
      .from('incidents')
      .update(updateData)
      .eq('id', id)
      .select('*, pt_user:pt_users(id, profile_id, profile:profiles(id, full_name))')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 파트너에게 상태 변경 알림
    const ptUser = data.pt_user as { id: string; profile_id: string; profile: { id: string; full_name: string } };
    if (ptUser?.profile_id) {
      await notifyIncidentStatusChange(
        serviceClient,
        ptUser.profile_id,
        data.title,
        status,
        admin_note,
      );
    }

    // 활동 로그
    const action = status === 'resolved' ? 'resolve_incident'
      : status === 'escalated' ? 'escalate_incident'
      : 'review_incident';

    await logActivity(serviceClient, {
      adminId: user.id,
      action: action as 'resolve_incident' | 'escalate_incident' | 'review_incident',
      targetType: 'incident',
      targetId: id,
      details: { status, admin_note },
    });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
