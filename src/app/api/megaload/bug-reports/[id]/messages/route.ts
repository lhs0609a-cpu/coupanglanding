import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: reportId } = await params;
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

    // 본인 리포트인지 확인
    const { data: report } = await serviceClient
      .from('sh_bug_reports')
      .select('id')
      .eq('id', reportId)
      .eq('megaload_user_id', shUserId)
      .single();

    if (!report) {
      return NextResponse.json({ error: '리포트를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 메시지 조회
    const { data: messages, error } = await serviceClient
      .from('sh_bug_report_messages')
      .select('*')
      .eq('bug_report_id', reportId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // admin 메시지 읽음 처리
    await serviceClient
      .from('sh_bug_report_messages')
      .update({ is_read: true })
      .eq('bug_report_id', reportId)
      .eq('sender_role', 'admin')
      .eq('is_read', false);

    return NextResponse.json({ data: messages || [] });
  } catch (err) {
    console.error('bug-report messages GET error:', err);
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch {
      return NextResponse.json({ error: 'Megaload 계정이 없습니다.' }, { status: 404 });
    }

    // 본인 리포트인지 확인
    const { data: report } = await serviceClient
      .from('sh_bug_reports')
      .select('id, status')
      .eq('id', reportId)
      .eq('megaload_user_id', shUserId)
      .single();

    if (!report) {
      return NextResponse.json({ error: '리포트를 찾을 수 없습니다.' }, { status: 404 });
    }

    const reportStatus = (report as Record<string, unknown>).status as string;
    if (reportStatus === 'closed') {
      return NextResponse.json({ error: '종료된 문의에는 메시지를 보낼 수 없습니다.' }, { status: 400 });
    }

    const body = await request.json();
    const { content, attachments } = body;

    if (!content?.trim() && (!attachments || attachments.length === 0)) {
      return NextResponse.json({ error: '내용 또는 이미지를 입력해주세요.' }, { status: 400 });
    }

    const { data, error } = await serviceClient
      .from('sh_bug_report_messages')
      .insert({
        bug_report_id: reportId,
        sender_id: user.id,
        sender_role: 'user',
        content: content?.trim() || '',
        attachments: attachments || [],
      })
      .select()
      .single();

    if (error) throw error;

    // updated_at 갱신
    await serviceClient
      .from('sh_bug_reports')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', reportId);

    return NextResponse.json({ data });
  } catch (err) {
    console.error('bug-report messages POST error:', err);
    return NextResponse.json({ error: '메시지 전송에 실패했습니다.' }, { status: 500 });
  }
}
