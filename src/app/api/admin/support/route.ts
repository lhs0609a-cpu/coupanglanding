import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import { notifyTicketResolved } from '@/lib/utils/notifications';

export const maxDuration = 30;


async function requireAdmin(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return null;
  return user;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const category = searchParams.get('category');

    const serviceClient = await createServiceClient();

    let query = serviceClient
      .from('support_tickets')
      .select('*, pt_user:pt_users(id, profile_id, profile:profiles(id, full_name, email))')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('admin support GET error:', error);
    return NextResponse.json({ error: '문의 목록 조회에 실패했습니다.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { id, status, priority } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID가 필요합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;

    const { data, error } = await serviceClient
      .from('support_tickets')
      .update(updateData)
      .eq('id', id)
      .select('*, pt_user:pt_users(id, profile_id, profile:profiles(id, full_name))')
      .single();

    if (error) throw error;

    // 상태 변경 시 활동 로그 및 알림
    if (status === 'resolved' || status === 'closed') {
      const ptUser = data.pt_user as { profile_id: string; profile: { id: string; full_name: string } | null } | null;
      const profileId = ptUser?.profile_id;

      if (profileId) {
        await notifyTicketResolved(serviceClient, profileId, data.title);
      }

      await logActivity(serviceClient, {
        adminId: user.id,
        action: status === 'closed' ? 'close_ticket' : 'reply_ticket',
        targetType: 'support_ticket',
        targetId: id,
        details: { status },
      });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('admin support PATCH error:', error);
    return NextResponse.json({ error: '문의 상태 변경에 실패했습니다.' }, { status: 500 });
  }
}
