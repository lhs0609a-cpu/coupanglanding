import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import { logSystemError } from '@/lib/utils/system-log';
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
  const t0 = Date.now();
  const ms = () => Date.now() - t0;
  try {
    const supabase = await createClient();
    console.log(`[admin/bug-reports] createClient ${ms()}ms`);

    const user = await requireAdmin(supabase);
    console.log(`[admin/bug-reports] requireAdmin ${ms()}ms (user=${user?.id ?? 'null'})`);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');

    const serviceClient = await createServiceClient();
    console.log(`[admin/bug-reports] createServiceClient ${ms()}ms`);

    // ── 1) sh_bug_reports — nested join 제거, flat 쿼리로 schema cache 의존 제거 ──
    let query = serviceClient
      .from('sh_bug_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (priority && priority !== 'all') {
      query = query.eq('priority', priority);
    }

    const { data: reports, error } = await query;
    console.log(`[admin/bug-reports] sh_bug_reports query ${ms()}ms (rows=${reports?.length ?? 0}, err=${error?.message ?? 'none'})`);
    if (error) throw error;

    const rowList = (reports || []) as Array<Record<string, unknown>>;

    // 빈 결과 fast-path — 추가 쿼리 전부 skip
    if (rowList.length === 0) {
      console.log(`[admin/bug-reports] DONE empty ${ms()}ms`);
      return NextResponse.json({ data: [] });
    }

    // ── 2) megaload_users + profiles 를 별도 쿼리로 (nested join 회피) ──
    const userIds = Array.from(new Set(rowList.map((r) => r.megaload_user_id as string).filter(Boolean)));
    let userMap = new Map<string, { id: string; profile_id: string }>();
    let profileMap = new Map<string, { id: string; full_name: string | null; email: string | null }>();

    if (userIds.length > 0) {
      const { data: users } = await serviceClient
        .from('megaload_users')
        .select('id, profile_id')
        .in('id', userIds);
      console.log(`[admin/bug-reports] megaload_users query ${ms()}ms`);

      for (const u of (users || []) as Array<{ id: string; profile_id: string }>) {
        userMap.set(u.id, u);
      }

      const profileIds = Array.from(new Set([...userMap.values()].map((u) => u.profile_id).filter(Boolean)));
      if (profileIds.length > 0) {
        const { data: profiles } = await serviceClient
          .from('profiles')
          .select('id, full_name, email')
          .in('id', profileIds);
        console.log(`[admin/bug-reports] profiles query ${ms()}ms`);

        for (const p of (profiles || []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
          profileMap.set(p.id, p);
        }
      }
    }

    // ── 3) 안 읽은 user 메시지 수 ──
    const reportIds = rowList.map((r) => r.id as string);
    const unreadMap: Record<string, number> = {};

    const { data: unreadData } = await serviceClient
      .from('sh_bug_report_messages')
      .select('bug_report_id')
      .in('bug_report_id', reportIds)
      .eq('sender_role', 'user')
      .eq('is_read', false);
    console.log(`[admin/bug-reports] unread query ${ms()}ms`);

    if (unreadData) {
      for (const row of unreadData) {
        const rid = (row as Record<string, unknown>).bug_report_id as string;
        unreadMap[rid] = (unreadMap[rid] || 0) + 1;
      }
    }

    // ── 4) stitch ──
    const enriched = rowList.map((r) => {
      const u = userMap.get(r.megaload_user_id as string);
      const p = u ? profileMap.get(u.profile_id) : null;
      return {
        ...r,
        unread_count: unreadMap[r.id as string] || 0,
        megaload_user: u ? { id: u.id, profile_id: u.profile_id, profile: p || null } : null,
      };
    });

    console.log(`[admin/bug-reports] DONE ${ms()}ms`);
    return NextResponse.json({ data: enriched });
  } catch (err) {
    console.error(`[admin/bug-reports] error at ${ms()}ms:`, err);
    await logSystemError({ source: 'admin/megaload-bug-reports:GET', error: err, category: 'admin', context: { elapsed_ms: ms() } });
    return NextResponse.json({
      error: err instanceof Error ? err.message : '오류문의 목록 조회에 실패했습니다.',
      elapsed_ms: ms(),
    }, { status: 500 });
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
    await logSystemError({ source: 'admin/megaload-bug-reports:PATCH', error: err, category: 'admin' });
    return NextResponse.json({ error: '상태 변경에 실패했습니다.' }, { status: 500 });
  }
}
