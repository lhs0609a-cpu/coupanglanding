import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { notifyTicketCreated } from '@/lib/utils/notifications';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


export async function GET() {
  try {
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
    const { data, error } = await serviceClient
      .from('support_tickets')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('support GET error:', error);
    void logSystemError({ source: 'support', error: error }).catch(() => {});
    return NextResponse.json({ error: '문의 목록 조회에 실패했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id, profile:profiles(full_name)')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const body = await request.json();
    const { category, title, content } = body;

    if (!title || !content) {
      return NextResponse.json({ error: '제목과 내용을 입력해주세요.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 티켓 생성
    const { data: ticket, error: ticketError } = await serviceClient
      .from('support_tickets')
      .insert({
        pt_user_id: ptUser.id,
        category: category || 'other',
        title,
      })
      .select()
      .single();

    if (ticketError) throw ticketError;

    // 첫 메시지 생성
    const { error: msgError } = await serviceClient
      .from('ticket_messages')
      .insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        sender_role: 'user',
        content,
      });

    if (msgError) throw msgError;

    // 관리자에게 알림
    const { data: admins } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('role', 'admin');

    const profileArr = ptUser.profile as unknown as { full_name: string }[] | null;
    const profile = profileArr?.[0] ?? null;
    const userName = profile?.full_name || '사용자';

    if (admins) {
      for (const admin of admins) {
        await notifyTicketCreated(serviceClient, admin.id, userName, title);
      }
    }

    return NextResponse.json({ data: ticket });
  } catch (error) {
    console.error('support POST error:', error);
    void logSystemError({ source: 'support', error: error }).catch(() => {});
    return NextResponse.json({ error: '문의 등록에 실패했습니다.' }, { status: 500 });
  }
}
