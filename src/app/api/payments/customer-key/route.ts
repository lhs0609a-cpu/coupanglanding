import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateCustomerKey } from '@/lib/payments/toss-client';

export const maxDuration = 15;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error(`timeout(${ms}ms): ${label}`)), ms);
    p.then(v => { clearTimeout(tid); resolve(v); }).catch(e => { clearTimeout(tid); reject(e); });
  });
}

/**
 * GET /api/payments/customer-key
 * 토스 SDK requestBillingAuth() 호출에 필요한 customerKey 발급.
 * 단계별 timeout으로 hang 위치 표면화.
 */
export async function GET() {
  const t0 = Date.now();
  const tlog = (s: string) => console.log(`[customer-key] ${s} +${Date.now() - t0}ms`);
  try {
    const supabase = await createClient();
    tlog('supabase client created');

    // 1. auth.getUser — 5s timeout
    let user;
    try {
      const got = await withTimeout(supabase.auth.getUser(), 5_000, 'auth.getUser');
      user = got.data.user;
    } catch (e) {
      tlog(`auth.getUser TIMEOUT: ${e instanceof Error ? e.message : e}`);
      return NextResponse.json({ error: '세션 확인 지연 — 다시 로그인 후 시도해주세요.' }, { status: 504 });
    }
    tlog(`auth.getUser done (user=${user?.id || 'none'})`);
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    // 2. pt_users 조회 — 5s timeout (single → maybeSingle: 행이 없으면 throw 안 함)
    let ptUser: { id: string } | null = null;
    try {
      const r = await withTimeout<{ data: { id: string } | null }>(
        Promise.resolve(supabase.from('pt_users').select('id').eq('profile_id', user.id).maybeSingle()),
        5_000,
        'pt_users select',
      );
      ptUser = r.data;
    } catch (e) {
      tlog(`pt_users TIMEOUT: ${e instanceof Error ? e.message : e}`);
      return NextResponse.json({ error: 'PT 사용자 조회 지연 — DB/RLS 점검 필요.' }, { status: 504 });
    }
    tlog(`pt_users done (found=${!!ptUser})`);
    if (!ptUser) return NextResponse.json({ error: 'PT 사용자 없음 — 관리자에게 문의해주세요.' }, { status: 404 });

    const customerKey = generateCustomerKey(ptUser.id);
    tlog('returning customerKey');
    return NextResponse.json({ customerKey });
  } catch (err) {
    tlog(`error: ${err instanceof Error ? err.message : err}`);
    const code = (err as { code?: string }).code;
    const message = err instanceof Error ? err.message : 'customerKey 발급 실패';
    const status = code === 'TOSS_ENV_MISSING' || code === 'TOSS_CUSTOMER_KEY_SECRET_MISSING' ? 502 : 500;
    return NextResponse.json({ error: message, code }, { status });
  }
}
