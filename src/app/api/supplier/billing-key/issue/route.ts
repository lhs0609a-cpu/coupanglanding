/**
 * POST /api/supplier/billing-key/issue   { authKey }
 *   토스 SDK 카드등록 콜백의 authKey → 공급사 빌링키 발급 + 카드 게이트 해제.
 *   성공 시 suppliers.billing_status='active' 로 전환되어 상품 업로드가 열린다.
 *
 * 셀러 빌링키 흐름(/api/payments/billing-key/issue)과 동일한 Toss 부품 재사용.
 * 빌링키는 AES 암호화 저장(쿠팡 키와 동일 encryption.ts).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { TossPaymentsAPI, generateCustomerKey } from '@/lib/payments/toss-client';
import { encryptPassword } from '@/lib/utils/encryption';
import { getSupplierByProfile } from '@/lib/megaload/supplier/ensure-supplier';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const { authKey } = await request.json().catch(() => ({}));
    if (!authKey) return NextResponse.json({ error: 'authKey가 필요합니다.' }, { status: 400 });

    const serviceClient = await createServiceClient();
    const supplier = await getSupplierByProfile(serviceClient, user.id);
    if (!supplier) {
      return NextResponse.json({ error: '공급사 등록을 먼저 완료해주세요.' }, { status: 404 });
    }

    // 공급사 id 기반 customerKey (충전 시 generateCustomerKey(supplier.id)로 재생성 가능 → 저장 불필요)
    const customerKey = generateCustomerKey(supplier.id);
    const billing = await TossPaymentsAPI.issueBillingKey(authKey, customerKey);

    const encryptedKey = await encryptPassword(billing.billingKey);

    const { data, error } = await serviceClient
      .from('suppliers')
      .update({
        billing_key: encryptedKey,
        card_company: billing.cardCompany,
        card_number: billing.cardNumber,
        card_registered_at: billing.authenticatedAt || new Date().toISOString(),
        billing_status: 'active',
      })
      .eq('id', supplier.id)
      .select('id, card_company, card_number, card_registered_at, billing_status')
      .single();

    if (error) {
      return NextResponse.json({ error: `카드 등록 저장 실패: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      card: { company: data.card_company, number: data.card_number, registeredAt: data.card_registered_at },
      billingStatus: data.billing_status,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '빌링키 발급 실패';
    console.error('[supplier/billing-key/issue]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
