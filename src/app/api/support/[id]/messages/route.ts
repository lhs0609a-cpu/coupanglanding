import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;


export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: ticketId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const serviceClient = await createServiceClient();

    // 티켓이 본인 소유인지 확인
    const { data: ticket } = await serviceClient
      .from('support_tickets')
      .select('id')
      .eq('id', ticketId)
      .eq('pt_user_id', ptUser.id)
      .maybeSingle();

    if (!ticket) {
      return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data, error } = await serviceClient
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('ticket messages GET error:', error);
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const serviceClient = await createServiceClient();

    // 티켓이 본인 소유인지 확인
    const { data: ticket } = await serviceClient
      .from('support_tickets')
      .select('id, status')
      .eq('id', ticketId)
      .eq('pt_user_id', ptUser.id)
      .maybeSingle();

    if (!ticket) {
      return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (ticket.status === 'closed') {
      return NextResponse.json({ error: '종료된 문의에는 메시지를 추가할 수 없습니다.' }, { status: 400 });
    }

    const body = await request.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json({ error: '내용을 입력해주세요.' }, { status: 400 });
    }

    const { data, error } = await serviceClient
      .from('ticket_messages')
      .insert({
        ticket_id: ticketId,
        sender_id: user.id,
        sender_role: 'user',
        content,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('ticket messages POST error:', error);
    return NextResponse.json({ error: '메시지 등록에 실패했습니다.' }, { status: 500 });
  }
}
