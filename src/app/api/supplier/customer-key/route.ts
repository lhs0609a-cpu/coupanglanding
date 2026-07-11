/**
 * GET /api/supplier/customer-key
 *   토스 SDK requestBillingAuth() 에 필요한 공급사 customerKey 발급.
 *   billing-key/issue 가 generateCustomerKey(supplier.id) 로 재생성하므로 값이 일치해야 함.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateCustomerKey } from '@/lib/payments/toss-client';
import { getSupplierByProfile } from '@/lib/megaload/supplier/ensure-supplier';

export const maxDuration = 15;

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const supplier = await getSupplierByProfile(supabase, user.id);
    if (!supplier) {
      return NextResponse.json({ error: '공급사 등록을 먼저 완료해주세요.' }, { status: 404 });
    }

    return NextResponse.json({ customerKey: generateCustomerKey(supplier.id) });
  } catch (err) {
    const code = (err as { code?: string }).code;
    const message = err instanceof Error ? err.message : 'customerKey 발급 실패';
    const status = code === 'TOSS_ENV_MISSING' || code === 'TOSS_CUSTOMER_KEY_SECRET_MISSING' ? 502 : 500;
    return NextResponse.json({ error: message, code }, { status });
  }
}
