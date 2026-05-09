import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { notifyBugReportCreated } from '@/lib/utils/notifications';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch {
      return NextResponse.json({ error: 'Megaload 계정이 없습니다.' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = serviceClient
      .from('sh_bug_reports')
      .select('*')
      .eq('megaload_user_id', shUserId)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: reports, error } = await query;
    if (error) throw error;

    // 각 리포트에 대해 안 읽은 관리자 메시지 수 조회
    const reportIds = (reports || []).map((r: Record<string, unknown>) => r.id as string);
    let unreadMap: Record<string, number> = {};

    if (reportIds.length > 0) {
      const { data: unreadData } = await serviceClient
        .from('sh_bug_report_messages')
        .select('bug_report_id')
        .in('bug_report_id', reportIds)
        .eq('sender_role', 'admin')
        .eq('is_read', false);

      if (unreadData) {
        unreadMap = {};
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

    // 사용자 본인 데이터 → private. back/forward 또는 짧은 시간 내 재방문 시 DB 안 침.
    return NextResponse.json({ data: enriched }, {
      headers: { 'Cache-Control': 'private, max-age=30, must-revalidate' },
    });
  } catch (err) {
    console.error('bug-reports GET error:', err);
    void logSystemError({ source: 'megaload/bug-reports', error: err }).catch(() => {});
    return NextResponse.json({ error: '오류문의 목록 조회에 실패했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch {
      return NextResponse.json({ error: 'Megaload 계정이 없습니다.' }, { status: 404 });
    }

    const body = await request.json();
    const { title, description, category, attachments, page_url, browser_info, screen_size, context } = body;

    if (!title || !description) {
      return NextResponse.json({ error: '제목과 설명을 입력해주세요.' }, { status: 400 });
    }

    const { data, error } = await serviceClient
      .from('sh_bug_reports')
      .insert({
        megaload_user_id: shUserId,
        title,
        description,
        category: category || 'general',
        attachments: attachments || [],
        page_url: page_url || null,
        browser_info: browser_info || null,
        screen_size: screen_size || null,
        context: context || {},
      })
      .select()
      .single();

    if (error) throw error;

    // 관리자에게 알림
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();
    const userName = (profile as Record<string, unknown> | null)?.full_name as string || '사용자';

    const { data: admins } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('role', 'admin');

    if (admins) {
      for (const admin of admins) {
        await notifyBugReportCreated(
          serviceClient,
          (admin as Record<string, unknown>).id as string,
          userName,
          title,
        );
      }
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('bug-reports POST error:', err);
    void logSystemError({ source: 'megaload/bug-reports', error: err }).catch(() => {});
    return NextResponse.json({ error: '오류문의 등록에 실패했습니다.' }, { status: 500 });
  }
}
