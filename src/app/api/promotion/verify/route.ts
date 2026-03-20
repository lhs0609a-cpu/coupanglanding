import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import {
  verifyInstantCoupon,
  verifyDownloadCoupon,
} from '@/lib/utils/coupang-api-client';
import type { CoupangCredentials, CouponVerifyResult } from '@/lib/utils/coupang-api-client';

export const maxDuration = 55;

/** POST: 쿠폰 적용 결과를 쿠팡 API에서 실제 검증 */
export async function POST(request: NextRequest) {
  try {
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

    if (!ptUser?.coupang_api_connected || !ptUser.coupang_access_key || !ptUser.coupang_secret_key) {
      return NextResponse.json({ error: '쿠팡 API가 연동되지 않았습니다.' }, { status: 400 });
    }

    const credentials: CoupangCredentials = {
      vendorId: ptUser.coupang_vendor_id,
      accessKey: await decryptPassword(ptUser.coupang_access_key),
      secretKey: await decryptPassword(ptUser.coupang_secret_key),
    };

    const serviceClient = await createServiceClient();

    // 최근 완료된 진행 상태에서 성공으로 기록된 로그 조회
    const body = await request.json().catch(() => ({})) as { progressId?: string };

    // 최근 성공 로그에서 고유 coupon_id 추출 (최근 1시간 이내)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentLogs } = await serviceClient
      .from('coupon_apply_log')
      .select('coupon_type, coupon_id, coupon_name')
      .eq('pt_user_id', ptUser.id)
      .eq('success', true)
      .gte('created_at', oneHourAgo)
      .order('created_at', { ascending: false });

    if (!recentLogs || recentLogs.length === 0) {
      return NextResponse.json({
        verified: false,
        message: '최근 1시간 내 성공 기록이 없습니다.',
        results: [],
      });
    }

    // 고유 쿠폰 ID별로 그룹화
    const couponMap = new Map<string, { type: string; name: string; count: number }>();
    for (const log of recentLogs) {
      if (!log.coupon_id) continue;
      const key = `${log.coupon_type}:${log.coupon_id}`;
      const existing = couponMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        couponMap.set(key, {
          type: log.coupon_type,
          name: log.coupon_name || '',
          count: 1,
        });
      }
    }

    // 각 쿠폰을 쿠팡 API에서 검증
    const results: (CouponVerifyResult & { logCount: number })[] = [];
    let allVerified = true;
    let verifiedInstant = 0;
    let verifiedDownload = 0;
    let failedInstant = 0;
    let failedDownload = 0;

    for (const [key, info] of couponMap) {
      const couponId = Number(key.split(':')[1]);
      if (!couponId || isNaN(couponId)) continue;

      let result: CouponVerifyResult;
      if (info.type === 'instant') {
        result = await verifyInstantCoupon(credentials, couponId);
        if (result.exists) verifiedInstant++;
        else failedInstant++;
      } else {
        result = await verifyDownloadCoupon(credentials, couponId);
        if (result.exists) verifiedDownload++;
        else failedDownload++;
      }

      if (!result.exists) allVerified = false;
      results.push({ ...result, logCount: info.count });
    }

    // 검증 결과를 로그에 기록
    if (results.length > 0) {
      await serviceClient.from('coupon_apply_log').insert({
        pt_user_id: ptUser.id,
        coupon_type: 'instant',
        coupon_id: 'VERIFY',
        coupon_name: `검증 완료: ${results.filter(r => r.exists).length}/${results.length}건 확인`,
        seller_product_id: 'VERIFY',
        vendor_item_id: null,
        success: allVerified,
        error_message: allVerified ? null : `미확인 쿠폰: ${results.filter(r => !r.exists).map(r => `${r.couponType}:${r.couponId}`).join(', ')}`,
      });
    }

    // 진행 상태 업데이트 (완료 → verified 또는 verify_failed)
    if (body.progressId) {
      await serviceClient.from('bulk_apply_progress').update({
        error_message: allVerified
          ? `검증 완료: 즉시할인 ${verifiedInstant}건, 다운로드 ${verifiedDownload}건 쿠팡에서 확인됨`
          : `검증 실패: 즉시할인 ${failedInstant}건, 다운로드 ${failedDownload}건 쿠팡에서 미확인`,
      }).eq('id', body.progressId);
    }

    return NextResponse.json({
      verified: allVerified,
      message: allVerified
        ? `모든 쿠폰이 쿠팡에서 확인되었습니다 (즉시할인: ${verifiedInstant}건, 다운로드: ${verifiedDownload}건)`
        : `일부 쿠폰이 쿠팡에서 확인되지 않았습니다 (실패: 즉시할인 ${failedInstant}건, 다운로드 ${failedDownload}건)`,
      results,
      summary: {
        total: results.length,
        verifiedInstant,
        verifiedDownload,
        failedInstant,
        failedDownload,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('쿠폰 검증 서버 오류:', message);
    return NextResponse.json({ error: `검증 오류: ${message}` }, { status: 500 });
  }
}
