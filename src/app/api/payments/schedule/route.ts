import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { BILLING_DAY } from '@/lib/payments/billing-constants';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 15;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error(`timeout(${ms}ms): ${label}`)), ms);
    Promise.resolve(p).then(v => { clearTimeout(tid); resolve(v); }).catch(e => { clearTimeout(tid); reject(e); });
  });
}

/**
 * GET /api/payments/schedule — 자동결제 스케줄 조회
 * PUT /api/payments/schedule — 자동결제 설정 변경
 */
export async function GET() {
  const t0 = Date.now();
  const tlog = (s: string) => console.log(`[schedule.GET] ${s} +${Date.now() - t0}ms`);
  try {
    const supabase = await createClient();
    const got = await withTimeout(supabase.auth.getUser(), 5_000, 'auth.getUser');
    const user = got.data.user;
    tlog(`auth.getUser done (user=${user?.id || 'none'})`);
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const ptRes = await withTimeout<{ data: { id: string } | null }>(
      Promise.resolve(supabase.from('pt_users').select('id').eq('profile_id', user.id).maybeSingle()),
      5_000,
      'pt_users select',
    );
    const ptUser = ptRes.data;
    tlog(`pt_users done (found=${!!ptUser})`);

    if (!ptUser) return NextResponse.json({ error: 'PT 사용자 없음' }, { status: 404 });

    // join 분리 — billing_card 조인이 RLS로 hang하는 경우 대비
    const schedRes = await withTimeout<{ data: Record<string, unknown> | null }>(
      Promise.resolve(supabase.from('payment_schedules').select('*').eq('pt_user_id', ptUser.id).maybeSingle()),
      5_000,
      'payment_schedules select',
    );
    const schedule = schedRes.data;
    tlog(`schedule done (found=${!!schedule})`);

    return NextResponse.json({ schedule: schedule || null });
  } catch (err) {
    tlog(`error: ${err instanceof Error ? err.message : String(err)}`);
    console.error('GET /api/payments/schedule error:', err);
    void logSystemError({ source: 'payments/schedule', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류', detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
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
    void logSystemError({ source: 'payments/schedule', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
