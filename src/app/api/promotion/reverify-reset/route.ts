import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { verifyDownloadCoupon } from '@/lib/utils/coupang-api-client';
import type { CoupangCredentials } from '@/lib/utils/coupang-api-client';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 60;

// 한 번 호출당 검증할 다운로드 쿠폰 ID 최대 수 (쿠팡 API 호출 + 시간 budget)
const MAX_COUPONS_PER_RUN = 40;

/**
 * POST /api/promotion/reverify-reset  (방법 A — 과거 가짜 success 복구)
 *
 * 앱이 success 로 기록했지만 쿠팡엔 존재하지 않는(NOT_FOUND, 파기된) 다운로드 쿠폰을 찾아,
 * 그 쿠폰에 묶였던 상품들을 pending 으로 되돌린다 → 크론(coupon-auto-apply)이 재적용.
 * 실제 존재하는(유효한) 쿠폰의 상품은 건드리지 않아 중복 쿠폰을 만들지 않는다.
 *
 * Cron 모드: Header Authorization: Bearer ${CRON_SECRET} + Query ?ptUserId=<uuid>
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
    const url = new URL(request.url);
    const cronPtUserId = isCron ? url.searchParams.get('ptUserId')?.trim() : null;

    type PtUser = {
      id: string;
      coupang_vendor_id: string;
      coupang_access_key: string;
      coupang_secret_key: string;
      coupang_api_connected: boolean;
    };
    let ptUser: PtUser | null = null;

    if (isCron && cronPtUserId) {
      const sc = await createServiceClient();
      const { data } = await sc
        .from('pt_users')
        .select('id, coupang_vendor_id, coupang_access_key, coupang_secret_key, coupang_api_connected')
        .eq('id', cronPtUserId)
        .maybeSingle();
      ptUser = (data as PtUser | null) ?? null;
    } else {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
      const { data } = await supabase
        .from('pt_users')
        .select('id, coupang_vendor_id, coupang_access_key, coupang_secret_key, coupang_api_connected')
        .eq('profile_id', user.id)
        .maybeSingle();
      ptUser = (data as PtUser | null) ?? null;
    }

    if (!ptUser) return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    if (!ptUser.coupang_api_connected || !ptUser.coupang_access_key || !ptUser.coupang_secret_key) {
      return NextResponse.json({ error: '쿠팡 API가 연동되지 않았습니다.' }, { status: 400 });
    }

    const credentials: CoupangCredentials = {
      vendorId: ptUser.coupang_vendor_id,
      accessKey: await decryptPassword(ptUser.coupang_access_key),
      secretKey: await decryptPassword(ptUser.coupang_secret_key),
    };

    const sc = await createServiceClient();

    // success 로 기록된 다운로드 쿠폰 ID 수집 (중복 제거)
    const { data: logs } = await sc
      .from('coupon_apply_log')
      .select('coupon_id')
      .eq('pt_user_id', ptUser.id)
      .eq('coupon_type', 'download')
      .eq('success', true)
      .order('created_at', { ascending: false })
      .limit(5000);

    const couponIds = [...new Set(
      (logs || [])
        .map((l) => String((l as { coupon_id: string }).coupon_id || ''))
        .filter((c) => c && c !== 'VERIFY' && !isNaN(Number(c))),
    )].slice(0, MAX_COUPONS_PER_RUN);

    let verified = 0;
    let notFound = 0;
    let resetItems = 0;

    for (const cid of couponIds) {
      const num = Number(cid);
      const v = await verifyDownloadCoupon(credentials, num);
      verified++;
      if (v.exists) continue;
      notFound++;

      // 이 쿠폰에 묶였던 옵션ID(vendor_item_id) 수집
      const { data: items } = await sc
        .from('coupon_apply_log')
        .select('vendor_item_id')
        .eq('pt_user_id', ptUser.id)
        .eq('coupon_type', 'download')
        .eq('coupon_id', cid)
        .eq('success', true);
      const vids = [...new Set(
        (items || []).map((i) => (i as { vendor_item_id: string | null }).vendor_item_id).filter(Boolean),
      )] as string[];
      if (vids.length === 0) continue;

      // 그 상품들 중 아직 download_applied=true 인 것만 pending 으로 되돌림 (재적용 대상)
      const { count } = await sc
        .from('product_coupon_tracking')
        .update({
          status: 'pending',
          download_coupon_applied: false,
          error_message: `재검증: 다운로드 쿠폰 ${cid} 쿠팡에서 NOT_FOUND — 재적용 대기`,
        }, { count: 'exact' })
        .eq('pt_user_id', ptUser.id)
        .in('vendor_item_id', vids)
        .eq('download_coupon_applied', true);
      resetItems += count || 0;
    }

    return NextResponse.json({
      ptUserId: ptUser.id,
      checkedCoupons: couponIds.length,
      verified,
      notFound,
      resetItems,
      hasMore: couponIds.length >= MAX_COUPONS_PER_RUN,
    });
  } catch (err) {
    console.error('[reverify-reset] error:', err);
    void logSystemError({ source: 'promotion/reverify-reset', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
