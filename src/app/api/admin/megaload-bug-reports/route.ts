import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import { notifyBugReportStatusChanged } from '@/lib/utils/notifications';
import { BUG_REPORT_STATUS_LABELS } from '@/lib/utils/constants';

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
    const priority = searchParams.get('priority');

    const serviceClient = await createServiceClient();

    let query = serviceClient
      .from('sh_bug_reports')
      .select('*, megaload_user:megaload_users(id, profile_id, profile:profiles(id, full_name, email))')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (priority && priority !== 'all') {
      query = query.eq('priority', priority);
    }

    const { data: reports, error } = await query;
    if (error) throw error;

    // 안 읽은 user 메시지 수
    const reportIds = (reports || []).map((r: Record<string, unknown>) => r.id as string);
    let unreadMap: Record<string, number> = {};

    if (reportIds.length > 0) {
      const { data: unreadData } = await serviceClient
        .from('sh_bug_report_messages')
        .select('bug_report_id')
        .in('bug_report_id', reportIds)
        .eq('sender_role', 'user')
        .eq('is_read', false);

      if (unreadData) {
        for (const row of unreadData) {
          const rid = (row as Record<string, unknown>).bug_report_id as string;
          unreadMap[rid] = (unreadMap[rid] || 0) + 1;
        }
      }
    }

    const enriched = (reports || []).map((r: Record<string, unknown>) => ({
      ...r,
      unread_count: unreadMap[r.id as string] || 0,
    }));

    return NextResponse.json({ data: enriched });
  } catch (err) {
    console.error('admin bug-reports GET error:', err);
    return NextResponse.json({ error: '오류문의 목록 조회에 실패했습니다.' }, { status: 500 });
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
      .from('sh_bug_reports')
      .update(updateData)
      .eq('id', id)
      .select('*, megaload_user:megaload_users(id, profile_id)')
      .single();

    if (error) throw error;

    // 사용자에게 상태 변경 알림
    if (status) {
      const megaloadUser = data.megaload_user as unknown as { profile_id: string } | { profile_id: string }[] | null;
      const profileId = Array.isArray(megaloadUser) ? megaloadUser[0]?.profile_id : megaloadUser?.profile_id;

      if (profileId) {
        const statusLabel = BUG_REPORT_STATUS_LABELS[status] || status;
        await notifyBugReportStatusChanged(serviceClient, profileId, data.title, statusLabel);
      }

      const action = status === 'closed' ? 'close_bug_report' : 'update_bug_report_status';
      await logActivity(serviceClient, {
        adminId: user.id,
        action,
        targetType: 'bug_report',
        targetId: id,
        details: { status, priority },
      });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('admin bug-reports PATCH error:', err);
    return NextResponse.json({ error: '상태 변경에 실패했습니다.' }, { status: 500 });
  }
}
