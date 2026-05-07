import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import { notifyBugReportReplied } from '@/lib/utils/notifications';

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: reportId } = await params;
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient
      .from('sh_bug_report_messages')
      .select('*')
      .eq('bug_report_id', reportId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // user 메시지 읽음 처리
    await serviceClient
      .from('sh_bug_report_messages')
      .update({ is_read: true })
      .eq('bug_report_id', reportId)
      .eq('sender_role', 'user')
      .eq('is_read', false);

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    console.error('admin bug-report messages GET error:', err);
    return NextResponse.json({ error: '메시지 조회에 실패했습니다.' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: reportId } = await params;
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { content, attachments } = body;

    if (!content?.trim() && (!attachments || attachments.length === 0)) {
      return NextResponse.json({ error: '내용 또는 이미지를 입력해주세요.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 메시지 추가
    const { data, error } = await serviceClient
      .from('sh_bug_report_messages')
      .insert({
        bug_report_id: reportId,
        sender_id: user.id,
        sender_role: 'admin',
        content: content?.trim() || '',
        attachments: attachments || [],
      })
      .select()
      .single();

    if (error) throw error;

    // pending이면 자동으로 confirmed로 변경
    const { data: report } = await serviceClient
      .from('sh_bug_reports')
      .select('title, status, megaload_user:megaload_users(profile_id)')
      .eq('id', reportId)
      .single();

    if (report) {
      const reportStatus = (report as Record<string, unknown>).status as string;
      if (reportStatus === 'pending') {
        await serviceClient
          .from('sh_bug_reports')
          .update({ status: 'confirmed', updated_at: new Date().toISOString() })
          .eq('id', reportId);
      } else {
        await serviceClient
          .from('sh_bug_reports')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', reportId);
      }

      // 사용자에게 알림
      const megaloadUser = report.megaload_user as unknown as { profile_id: string }[] | { profile_id: string } | null;
      const profileId = Array.isArray(megaloadUser) ? megaloadUser[0]?.profile_id : megaloadUser?.profile_id;
      if (profileId) {
        await notifyBugReportReplied(serviceClient, profileId, report.title);
      }
    }

    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'reply_bug_report',
      targetType: 'bug_report_message',
      targetId: reportId,
      details: { content: (content || '').substring(0, 100) },
    });

    return NextResponse.json({ data });
  } catch (err) {
    console.error('admin bug-report messages POST error:', err);
    return NextResponse.json({ error: '답변 등록에 실패했습니다.' }, { status: 500 });
  }
}
