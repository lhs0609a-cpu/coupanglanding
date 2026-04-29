import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateCustomerKey } from '@/lib/payments/toss-client';

/**
 * GET /api/payments/customer-key
 *
 * 토스 SDK requestBillingAuth() 호출에 필요한 customerKey 를 반환한다.
 * customerKey 는 ptUserId 를 서버 비밀(TOSS_CUSTOMER_KEY_SECRET)로 HMAC 해서 만들기 때문에
 * 클라이언트에서 직접 계산할 수 없다 — 반드시 이 라우트로 받아가야 한다.
 *
 * 같은 ptUserId 면 항상 같은 customerKey 가 나온다 (deterministic) → 카드 등록/결제/취소가 일관됨.
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

    const customerKey = generateCustomerKey(ptUser.id);
    return NextResponse.json({ customerKey });
  } catch (err) {
    const code = (err as { code?: string }).code;
    const message = err instanceof Error ? err.message : 'customerKey 발급 실패';
    // TOSS_ENV_MISSING 은 운영자가 봐야 할 설정 이슈 → 502 로 명확히
    const status = code === 'TOSS_ENV_MISSING' ? 502 : 500;
    return NextResponse.json({ error: message, code }, { status });
  }
}
