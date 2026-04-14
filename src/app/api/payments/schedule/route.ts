import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/payments/schedule — 자동결제 스케줄 조회
 * PUT /api/payments/schedule — 자동결제 설정 변경
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

    const { data: schedule } = await supabase
      .from('payment_schedules')
      .select('*, billing_card:billing_cards(*)')
      .eq('pt_user_id', ptUser.id)
      .single();

    return NextResponse.json({ schedule: schedule || null });
  } catch (err) {
    console.error('GET /api/payments/schedule error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { enabled, billingDay, cardId } = await request.json();

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) return NextResponse.json({ error: 'PT 사용자 없음' }, { status: 404 });

    // billingDay 유효성
    const day = Number(billingDay);
    if (day && (day < 1 || day > 28)) {
      return NextResponse.json({ error: '청구일은 1~28 사이여야 합니다' }, { status: 400 });
    }

    // 자동결제 활성화 시 카드 필수
    if (enabled && cardId) {
      const { data: card } = await supabase
        .from('billing_cards')
        .select('id')
        .eq('id', cardId)
        .eq('pt_user_id', ptUser.id)
        .eq('is_active', true)
        .single();

      if (!card) {
        return NextResponse.json({ error: '유효한 카드가 아닙니다' }, { status: 400 });
      }
    }

    const serviceClient = await createServiceClient();

    // upsert
    const { data: schedule, error } = await serviceClient
      .from('payment_schedules')
      .upsert({
        pt_user_id: ptUser.id,
        auto_payment_enabled: !!enabled,
        billing_day: day || 10,
        billing_card_id: cardId || null,
      }, { onConflict: 'pt_user_id' })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, schedule });
  } catch (err) {
    console.error('PUT /api/payments/schedule error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
