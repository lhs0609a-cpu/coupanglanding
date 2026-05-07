import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { fetchDownloadCoupon } from '@/lib/utils/coupang-api-client';
import type { CoupangCredentials } from '@/lib/utils/coupang-api-client';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ couponId: string }> },
) {
  try {
    const { couponId } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id, coupang_vendor_id, coupang_access_key, coupang_secret_key, coupang_api_connected')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (!ptUser.coupang_api_connected || !ptUser.coupang_vendor_id || !ptUser.coupang_access_key || !ptUser.coupang_secret_key) {
      return NextResponse.json({ error: '쿠팡 API가 연동되지 않았습니다.' }, { status: 400 });
    }

    const credentials: CoupangCredentials = {
      vendorId: ptUser.coupang_vendor_id,
      accessKey: await decryptPassword(ptUser.coupang_access_key),
      secretKey: await decryptPassword(ptUser.coupang_secret_key),
    };

    const coupon = await fetchDownloadCoupon(credentials, Number(couponId));

    if (!coupon) {
      return NextResponse.json({
        error: `쿠폰 ID ${couponId}을(를) 찾을 수 없습니다. 쿠팡 WING에서 정확한 쿠폰 ID를 확인해주세요.`,
      }, { status: 404 });
    }

    return NextResponse.json({ data: coupon });
  } catch (err) {
    console.error('promotion download coupon detail error:', err);
    void logSystemError({ source: 'promotion/coupons/download/[couponId]', error: err }).catch(() => {});
    const message = err instanceof Error ? err.message : '서버 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
