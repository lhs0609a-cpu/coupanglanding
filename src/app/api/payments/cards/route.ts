import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/payments/cards — 등록 카드 목록
 * DELETE /api/payments/cards — 카드 비활성화
 * PATCH /api/payments/cards — 기본 카드 변경
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) return NextResponse.json({ error: 'PT 사용자 없음' }, { status: 404 });

    const { data: cards } = await supabase
      .from('billing_cards')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .eq('is_active', true)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false });

    return NextResponse.json({ cards: cards || [] });
  } catch (err) {
    console.error('GET /api/payments/cards error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { cardId } = await request.json();
    if (!cardId) return NextResponse.json({ error: 'cardId 필요' }, { status: 400 });

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) return NextResponse.json({ error: 'PT 사용자 없음' }, { status: 404 });

    const serviceClient = await createServiceClient();

    // 비활성화 (soft delete)
    const { error } = await serviceClient
      .from('billing_cards')
      .update({ is_active: false, is_primary: false })
      .eq('id', cardId)
      .eq('pt_user_id', ptUser.id);

    if (error) throw error;

    // 스케줄에서 이 카드 참조 제거
    await serviceClient
      .from('payment_schedules')
      .update({ billing_card_id: null })
      .eq('pt_user_id', ptUser.id)
      .eq('billing_card_id', cardId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/payments/cards error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { cardId } = await request.json();
    if (!cardId) return NextResponse.json({ error: 'cardId 필요' }, { status: 400 });

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) return NextResponse.json({ error: 'PT 사용자 없음' }, { status: 404 });

    const serviceClient = await createServiceClient();

    // 기존 primary 해제
    await serviceClient
      .from('billing_cards')
      .update({ is_primary: false })
      .eq('pt_user_id', ptUser.id)
      .eq('is_primary', true);

    // 새 primary 설정
    const { error } = await serviceClient
      .from('billing_cards')
      .update({ is_primary: true })
      .eq('id', cardId)
      .eq('pt_user_id', ptUser.id)
      .eq('is_active', true);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/payments/cards error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
