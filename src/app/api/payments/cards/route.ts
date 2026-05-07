import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { TossPaymentsAPI } from '@/lib/payments/toss-client';
import { logSettlementError } from '@/lib/payments/settlement-errors';

export const maxDuration = 15;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error(`timeout(${ms}ms): ${label}`)), ms);
    Promise.resolve(p).then(v => { clearTimeout(tid); resolve(v); }).catch(e => { clearTimeout(tid); reject(e); });
  });
}

/**
 * GET /api/payments/cards — 등록 카드 목록 (민감 필드는 노출하지 않음)
 * DELETE /api/payments/cards — 카드 비활성화 + 토스 빌링키 폐기
 * PATCH /api/payments/cards — 기본 카드 변경
 */
export async function GET() {
  const t0 = Date.now();
  const tlog = (s: string) => console.log(`[cards.GET] ${s} +${Date.now() - t0}ms`);
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

    // 민감 컬럼(billing_key, customer_key) 은 제외하고 반환
    const cardsRes = await withTimeout<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>(
      Promise.resolve(supabase
        .from('billing_cards')
        .select('id, pt_user_id, card_company, card_number, card_type, is_active, is_primary, failed_count, registered_at, last_used_at, created_at')
        .eq('pt_user_id', ptUser.id)
        .eq('is_active', true)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false })),
      5_000,
      'billing_cards select',
    );
    const cards = cardsRes.data;
    const error = cardsRes.error;
    tlog(`billing_cards done (count=${cards?.length || 0}, err=${error?.message || 'none'})`);

    if (error) throw error;

    return NextResponse.json({ cards: cards || [] });
  } catch (err) {
    tlog(`error: ${err instanceof Error ? err.message : String(err)}`);
    console.error('GET /api/payments/cards error:', err);
    return NextResponse.json({ error: '서버 오류', detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
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

    // 카드 확인 — 본인 카드만 삭제 가능
    const { data: card } = await serviceClient
      .from('billing_cards')
      .select('id, billing_key, customer_key')
      .eq('id', cardId)
      .eq('pt_user_id', ptUser.id)
      .maybeSingle();

    if (!card) {
      return NextResponse.json({ error: '카드를 찾을 수 없음' }, { status: 404 });
    }

    // 토스 빌링키 폐기 (실패해도 DB soft delete 는 진행)
    if (card.billing_key && card.customer_key) {
      try {
        await TossPaymentsAPI.revokeBillingKey(
          card.billing_key,
          card.customer_key,
          '사용자 삭제 요청',
        );
      } catch (revokeErr) {
        await logSettlementError(serviceClient, {
          stage: 'revoke_billing_key',
          ptUserId: ptUser.id,
          error: revokeErr,
          detail: { cardId: card.id },
        });
        // revoke 실패해도 계속 진행 — DB 상으로는 삭제 처리해주는 게 사용자 의도.
      }
    }

    // DB: soft delete + billing_key/customer_key 마스킹 (재사용 차단)
    const { error } = await serviceClient
      .from('billing_cards')
      .update({
        is_active: false,
        is_primary: false,
        billing_key: `REVOKED_${card.id}`,
        customer_key: `REVOKED_${card.id}`,
      })
      .eq('id', cardId)
      .eq('pt_user_id', ptUser.id);

    if (error) throw error;

    // 스케줄에서 이 카드 참조 제거
    await serviceClient
      .from('payment_schedules')
      .update({ billing_card_id: null })
      .eq('pt_user_id', ptUser.id)
      .eq('billing_card_id', cardId);

    // 이 카드를 참조하는 미결 tx 정리 —
    //   1) pending tx: 토스에 결제 요청은 갔을 수 있지만 응답 미완. 'cancelled' 로 명시 종결.
    //      (실제로 결제됐다면 reconcile 크론이 토스 조회 후 'success' 로 정정)
    //   2) failed + 재시도 예정: 카드 없어진 상태로 재시도해도 무의미 → final_failure 로 전환.
    const nowIso = new Date().toISOString();

    await serviceClient
      .from('payment_transactions')
      .update({
        status: 'cancelled',
        failure_code: 'CARD_DELETED',
        failure_message: '카드 삭제로 인한 취소',
        failed_at: nowIso,
      })
      .eq('billing_card_id', cardId)
      .eq('status', 'pending');

    await serviceClient
      .from('payment_transactions')
      .update({
        is_final_failure: true,
        final_failed_at: nowIso,
        next_retry_at: null,
        failure_code: 'CARD_DELETED',
        failure_message: '카드 삭제로 재시도 중단',
      })
      .eq('billing_card_id', cardId)
      .eq('status', 'failed')
      .eq('is_final_failure', false);

    // 남은 active 카드 중 아무것도 primary 가 아니면 최신 1장을 primary 로 승격
    const { data: activeCards } = await serviceClient
      .from('billing_cards')
      .select('id, is_primary, created_at')
      .eq('pt_user_id', ptUser.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    const hasPrimary = (activeCards || []).some((c) => c.is_primary);
    if (!hasPrimary && activeCards && activeCards.length > 0) {
      await serviceClient
        .from('billing_cards')
        .update({ is_primary: true })
        .eq('id', activeCards[0].id);
    }

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

    // 대상 카드가 active 인지 먼저 확인
    const { data: target } = await serviceClient
      .from('billing_cards')
      .select('id')
      .eq('id', cardId)
      .eq('pt_user_id', ptUser.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!target) {
      return NextResponse.json({ error: '활성 카드만 기본 카드로 설정 가능' }, { status: 400 });
    }

    // 새 primary 설정 먼저
    const { error } = await serviceClient
      .from('billing_cards')
      .update({ is_primary: true })
      .eq('id', cardId)
      .eq('pt_user_id', ptUser.id)
      .eq('is_active', true);

    if (error) throw error;

    // 그 다음 다른 primary 들 해제
    await serviceClient
      .from('billing_cards')
      .update({ is_primary: false })
      .eq('pt_user_id', ptUser.id)
      .eq('is_primary', true)
      .neq('id', cardId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/payments/cards error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
