import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { BILLING_DAY } from '@/lib/payments/billing-constants';

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

    // billingDay와 enabled는 운영 정책상 고정 — 클라이언트 입력 무시.
    // 사용자는 billing_card_id만 변경 가능.
    const { cardId } = await request.json();

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) return NextResponse.json({ error: 'PT 사용자 없음' }, { status: 404 });

    if (cardId) {
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

    const { data: schedule, error } = await serviceClient
      .from('payment_schedules')
      .upsert({
        pt_user_id: ptUser.id,
        auto_payment_enabled: true,
        billing_day: BILLING_DAY,
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
