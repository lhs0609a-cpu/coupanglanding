import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { TossPaymentsAPI, generateCustomerKey } from '@/lib/payments/toss-client';
import { createNotification } from '@/lib/utils/notifications';

/**
 * POST /api/payments/billing-key/issue
 * 토스 SDK 콜백에서 받은 authKey로 빌링키 발급 + 카드 등록
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { authKey } = await request.json();
    if (!authKey) return NextResponse.json({ error: 'authKey 필요' }, { status: 400 });

    // pt_user 조회
    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id, profile_id')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) return NextResponse.json({ error: 'PT 사용자 없음' }, { status: 404 });

    const customerKey = generateCustomerKey(ptUser.id);

    // 토스 API로 빌링키 발급
    const billing = await TossPaymentsAPI.issueBillingKey(authKey, customerKey);

    const serviceClient = await createServiceClient();

    // 기존 primary 카드 해제
    await serviceClient
      .from('billing_cards')
      .update({ is_primary: false })
      .eq('pt_user_id', ptUser.id)
      .eq('is_primary', true);

    // 새 카드 저장
    const { data: card, error: insertError } = await serviceClient
      .from('billing_cards')
      .insert({
        pt_user_id: ptUser.id,
        customer_key: customerKey,
        billing_key: billing.billingKey,
        card_company: billing.cardCompany,
        card_number: billing.cardNumber,
        card_type: billing.cardType || '신용',
        is_active: true,
        is_primary: true,
        registered_at: billing.authenticatedAt || new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 자동결제 스케줄 자동 생성 (첫 카드 등록 시)
    const { data: existingSchedule } = await serviceClient
      .from('payment_schedules')
      .select('id')
      .eq('pt_user_id', ptUser.id)
      .single();

    if (!existingSchedule && card) {
      await serviceClient
        .from('payment_schedules')
        .insert({
          pt_user_id: ptUser.id,
          auto_payment_enabled: true,
          billing_day: 10,
          billing_card_id: card.id,
        });
    }

    // 알림
    await createNotification(serviceClient, {
      userId: ptUser.profile_id,
      type: 'fee_payment',
      title: '결제 카드 등록 완료',
      message: `${billing.cardCompany} ${billing.cardNumber} 카드가 등록되었습니다. 매월 10일 자동결제가 활성화되었습니다.`,
      link: '/my/settings',
    });

    return NextResponse.json({ success: true, card });
  } catch (err) {
    const detail = serializeError(err);
    console.error('billing-key/issue error:', JSON.stringify(detail));
    return NextResponse.json(
      { error: detail.message, code: detail.code, detail },
      { status: 500 },
    );
  }
}

function serializeError(err: unknown): {
  message: string;
  code?: string;
  name?: string;
  details?: unknown;
  hint?: unknown;
  stack?: string;
} {
  if (err instanceof Error) {
    const extra = err as unknown as Record<string, unknown>;
    return {
      message: typeof err.message === 'string' ? err.message : String(err.message),
      name: err.name,
      code: typeof extra.code === 'string' ? extra.code : undefined,
      details: extra.details,
      hint: extra.hint,
      stack: err.stack,
    };
  }
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const msg = obj.message;
    return {
      message: typeof msg === 'string' ? msg : JSON.stringify(obj) || '알 수 없는 오류',
      code: typeof obj.code === 'string' ? obj.code : undefined,
      details: obj.details,
      hint: obj.hint,
    };
  }
  return { message: String(err) || '빌링키 발급 실패' };
}
