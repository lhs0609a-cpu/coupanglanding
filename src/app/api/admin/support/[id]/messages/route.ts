import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import { notifyTicketReplied } from '@/lib/utils/notifications';

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
    const { id: ticketId } = await params;
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('admin ticket messages GET error:', error);
    return NextResponse.json({ error: '메시지 조회에 실패했습니다.' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: ticketId } = await params;
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json({ error: '내용을 입력해주세요.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 메시지 추가
    const { data, error } = await serviceClient
      .from('ticket_messages')
      .insert({
        ticket_id: ticketId,
        sender_id: user.id,
        sender_role: 'admin',
        content,
      })
      .select()
      .single();

    if (error) throw error;

    // 상태를 처리중으로 변경
    const { data: ticket } = await serviceClient
      .from('support_tickets')
      .update({ status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', ticketId)
      .select('title, pt_user:pt_users(profile_id)')
      .single();

    // 유저에게 알림
    if (ticket) {
      const ptUserArr = ticket.pt_user as unknown as { profile_id: string }[] | null;
      const ptUser = ptUserArr?.[0] ?? null;
      if (ptUser) {
        await notifyTicketReplied(serviceClient, ptUser.profile_id, ticket.title);
      }
    }

    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'reply_ticket',
      targetType: 'ticket_message',
      targetId: ticketId,
      details: { content: content.substring(0, 100) },
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('admin ticket messages POST error:', error);
    return NextResponse.json({ error: '답변 등록에 실패했습니다.' }, { status: 500 });
  }
}
