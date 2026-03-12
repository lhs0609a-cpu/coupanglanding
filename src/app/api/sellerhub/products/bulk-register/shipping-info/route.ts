import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/sellerhub/adapters/factory';
import { CoupangAdapter } from '@/lib/sellerhub/adapters/coupang.adapter';

/**
 * GET — 쿠팡 출고지/반품지/vendorId 조회
 *
 * 상품 등록 시 필수인 물류 정보를 한꺼번에 반환한다.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: shUser } = await supabase
      .from('sellerhub_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'SellerHub 계정이 없습니다.' }, { status: 404 });

    const shUserId = (shUser as Record<string, unknown>).id as string;
    const serviceClient = await createServiceClient();

    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
    const coupangAdapter = adapter as CoupangAdapter;

    const vendorId = coupangAdapter.getVendorId();

    // 출고지 + 반품지 병렬 조회
    const [outboundResult, returnResult] = await Promise.all([
      coupangAdapter.getOutboundShippingPlaces().catch(() => ({ items: [] })),
      coupangAdapter.getReturnShippingCenters().catch(() => ({ items: [] })),
    ]);

    return NextResponse.json({
      vendorId,
      outboundShippingPlaces: outboundResult.items.filter((p) => p.usable),
      returnShippingCenters: returnResult.items.filter((c) => c.usable),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '물류 정보 조회 실패' },
      { status: 500 },
    );
  }
}
