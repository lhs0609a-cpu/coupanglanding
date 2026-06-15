import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { verifyDownloadCoupon, fetchDownloadCoupon } from '@/lib/utils/coupang-api-client';

/** 다운로드 쿠폰이 "죽었는지"(할인 미발효) 판정.
 *  - contractId<=0: 예산계약 없음 → 시작일 지나도 영구 STANDBY (2026-04 사고).
 *  - STANDBY 인데 시작일이 1시간 넘게 지남 → 활성화 실패로 굳은 상태.
 *  반환: { dead, reason } / 단, 일시 오류(null+ERROR)는 dead=false 로 두어 live 쿠폰 오리셋 방지. */
async function classifyCoupon(
  credentials: Parameters<typeof fetchDownloadCoupon>[0],
  couponId: number,
): Promise<{ dead: boolean; reason: string }> {
  const coupon = await fetchDownloadCoupon(credentials, couponId);
  if (coupon) {
    const status = String(coupon.couponStatus || '').toUpperCase();
    const start = coupon.startDate ? new Date(coupon.startDate).getTime() : 0;
    // ① 활성 상태면 무조건 보호 — 작동 중인 할인은 절대 리셋 안 함(contractId 에코가 0이어도).
    if (['APPLIED', 'NORMAL', 'ISSUED', 'ACTIVE'].includes(status)) return { dead: false, reason: status };
    // ② STANDBY: 시작 1시간 넘게 지났는데도 STANDBY = 활성화 실패로 굳음(대개 contractId=0) → 죽음.
    //    아직 시작 전 STANDBY 는 정상이므로 보호.
    if (status === 'STANDBY') {
      return (start > 0 && start < Date.now() - 3_600_000)
        ? { dead: true, reason: `STANDBY(시작일 ${coupon.startDate} 경과했으나 미활성)` }
        : { dead: false, reason: 'STANDBY(시작 전)' };
    }
    // ③ 그 외 비활성 상태 + 예산계약 없음 → 죽음.
    if (Number(coupon.contractId || 0) <= 0) return { dead: true, reason: 'contractId=0(예산계약 없음)' };
    return { dead: false, reason: status };
  }
  // null = 404(실제 없음) 또는 일시 오류 — verify 로 구분. NOT_FOUND 만 dead, ERROR 는 skip.
  const v = await verifyDownloadCoupon(credentials, couponId);
  if (!v.exists && v.status === 'NOT_FOUND') return { dead: true, reason: 'NOT_FOUND(쿠팡에 없음)' };
  return { dead: false, reason: v.status || 'UNKNOWN' };
}
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

    // ── 커서 기반 수집 (★ 핵심 수정) ──────────────────────────────
    //   예전 버그: 매 호출이 항상 "최신 40개"만 봐서, 쿠폰이 40개 넘는 유저는
    //   나머지가 영영 재검증 안 됐다(835개 유저 → 39개만 처리되고 종료).
    //   이제 cursor(created_at) 보다 과거 쿠폰만 골라, 호출마다 다음 40개로 전진한다.
    const cursor = url.searchParams.get('cursor')?.trim() || null;
    let logQuery = sc
      .from('coupon_apply_log')
      .select('coupon_id, created_at')
      .eq('pt_user_id', ptUser.id)
      .eq('coupon_type', 'download')
      .eq('success', true)
      .order('created_at', { ascending: false })
      .limit(5000);
    if (cursor) logQuery = logQuery.lt('created_at', cursor);
    const { data: logs } = await logQuery;

    // 등장 순서(최신→과거)대로 distinct 쿠폰 수집 + 각 쿠폰의 created_at 기억
    const seen = new Map<string, string>(); // coupon_id → created_at
    for (const l of (logs || []) as { coupon_id: string; created_at: string }[]) {
      const cid = String(l.coupon_id || '');
      if (!cid || cid === 'VERIFY' || isNaN(Number(cid))) continue;
      if (!seen.has(cid)) seen.set(cid, l.created_at);
    }
    const allOrdered = [...seen.entries()];
    const batch = allOrdered.slice(0, MAX_COUPONS_PER_RUN);
    const couponIds = batch.map(([cid]) => cid);
    // 다음 커서 = 이번 배치 마지막 쿠폰의 created_at (그보다 과거부터 다음 호출)
    const nextCursor = batch.length > 0 ? batch[batch.length - 1][1] : null;
    // 더 남았나: 이번 윈도에 40개 초과 distinct 가 있었거나, 로그 5000행을 꽉 채워 더 있을 수 있음
    const hasMore = allOrdered.length > MAX_COUPONS_PER_RUN || (logs?.length || 0) >= 5000;

    let verified = 0;
    let notFound = 0;
    let resetItems = 0;

    for (const cid of couponIds) {
      const num = Number(cid);
      const { dead, reason } = await classifyCoupon(credentials, num);
      verified++;
      if (!dead) continue;
      notFound++; // "죽은 쿠폰" 카운트 (NOT_FOUND + STANDBY/contractId=0 포함)

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
          error_message: `재검증: 다운로드 쿠폰 ${cid} ${reason} — 재적용 대기`,
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
      notFound, // 죽은 쿠폰 수 (NOT_FOUND + STANDBY/contractId=0)
      resetItems,
      nextCursor, // 다음 호출에 ?cursor= 로 전달 → 과거 쿠폰으로 전진
      hasMore,
    });
  } catch (err) {
    console.error('[reverify-reset] error:', err);
    void logSystemError({ source: 'promotion/reverify-reset', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
