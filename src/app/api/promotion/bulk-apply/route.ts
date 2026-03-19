import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { applyInstantCoupon, applyDownloadCoupon } from '@/lib/utils/coupang-api-client';
import type { CoupangCredentials } from '@/lib/utils/coupang-api-client';

const BATCH_SIZE = 15;

/** POST: 쿠폰 일괄 적용 시작 또는 계속 (클라이언트 주도 배치 방식) */
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

    const serviceClient = await createServiceClient();

    // 설정 조회
    const { data: config } = await serviceClient
      .from('coupon_auto_sync_config')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .maybeSingle();

    if (!config) {
      return NextResponse.json({ error: '쿠폰 설정을 찾을 수 없습니다.' }, { status: 400 });
    }

    // 기존 활성 진행 상태 확인
    let { data: progress } = await serviceClient
      .from('bulk_apply_progress')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .in('status', ['collecting', 'applying'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 활성 진행 없으면 새로 생성
    if (!progress) {
      // request body 소비 (클라이언트에서 startNew 등 전달)
      await request.json().catch(() => ({}));

      // pending 상품 수 카운트
      const { count: pendingCount } = await serviceClient
        .from('product_coupon_tracking')
        .select('id', { count: 'exact', head: true })
        .eq('pt_user_id', ptUser.id)
        .eq('status', 'pending');

      const { data: newProgress, error: createError } = await serviceClient
        .from('bulk_apply_progress')
        .insert({
          pt_user_id: ptUser.id,
          status: 'applying',
          total_products: pendingCount || 0,
        })
        .select()
        .single();

      if (createError || !newProgress) {
        return NextResponse.json({ error: '일괄 적용 시작에 실패했습니다.' }, { status: 500 });
      }
      progress = newProgress;
    }

    // 다음 배치 가져오기
    const { data: batch } = await serviceClient
      .from('product_coupon_tracking')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    let batchInstantSuccess = 0;
    let batchInstantFailed = 0;
    let batchDownloadSuccess = 0;
    let batchDownloadFailed = 0;

    // 배치 처리
    for (const product of (batch || [])) {
      const itemId = product.vendor_item_id;

      // vendorItemId가 없으면 건너뜀 (sellerProductId는 쿠폰 API에서 사용 불가)
      if (!itemId) {
        await serviceClient.from('product_coupon_tracking').update({
          status: 'skipped',
          error_message: 'vendorItemId 없음 — 쿠폰 적용 불가',
        }).eq('id', product.id);
        continue;
      }

      try {
        // 처리 중 상태
        await serviceClient
          .from('product_coupon_tracking')
          .update({ status: 'processing' })
          .eq('id', product.id);

        let instantOk = true;
        let downloadOk = true;

        // 즉시할인 쿠폰 적용 (vendorItemId 사용)
        if (config.instant_coupon_enabled && config.instant_coupon_id) {
          try {
            await applyInstantCoupon(credentials, Number(config.instant_coupon_id), [itemId]);
            batchInstantSuccess++;
          } catch (err) {
            instantOk = false;
            batchInstantFailed++;
            await serviceClient.from('coupon_apply_log').insert({
              pt_user_id: ptUser.id,
              coupon_type: 'instant',
              coupon_id: config.instant_coupon_id,
              coupon_name: config.instant_coupon_name,
              seller_product_id: product.seller_product_id,
              vendor_item_id: product.vendor_item_id,
              success: false,
              error_message: err instanceof Error ? err.message : String(err),
            });
          }

          if (instantOk) {
            await serviceClient.from('coupon_apply_log').insert({
              pt_user_id: ptUser.id,
              coupon_type: 'instant',
              coupon_id: config.instant_coupon_id,
              coupon_name: config.instant_coupon_name,
              seller_product_id: product.seller_product_id,
              vendor_item_id: product.vendor_item_id,
              success: true,
            });
          }
        }

        // 다운로드 쿠폰 적용 (vendorItemId 사용)
        if (config.download_coupon_enabled && config.download_coupon_id) {
          try {
            await applyDownloadCoupon(credentials, Number(config.download_coupon_id), [itemId]);
            batchDownloadSuccess++;
          } catch (err) {
            downloadOk = false;
            batchDownloadFailed++;
            await serviceClient.from('coupon_apply_log').insert({
              pt_user_id: ptUser.id,
              coupon_type: 'download',
              coupon_id: config.download_coupon_id,
              coupon_name: config.download_coupon_name,
              seller_product_id: product.seller_product_id,
              vendor_item_id: product.vendor_item_id,
              success: false,
              error_message: err instanceof Error ? err.message : String(err),
            });
          }

          if (downloadOk) {
            await serviceClient.from('coupon_apply_log').insert({
              pt_user_id: ptUser.id,
              coupon_type: 'download',
              coupon_id: config.download_coupon_id,
              coupon_name: config.download_coupon_name,
              seller_product_id: product.seller_product_id,
              vendor_item_id: product.vendor_item_id,
              success: true,
            });
          }
        }

        // 트래킹 상태 업데이트
        const allOk = instantOk && downloadOk;
        await serviceClient.from('product_coupon_tracking').update({
          status: allOk ? 'completed' : 'failed',
          instant_coupon_applied: instantOk && config.instant_coupon_enabled,
          download_coupon_applied: downloadOk && config.download_coupon_enabled,
          error_message: allOk ? null : '일부 쿠폰 적용 실패',
        }).eq('id', product.id);

      } catch (err) {
        console.error(`상품 처리 중 오류 (${itemId}):`, err);
        await serviceClient.from('product_coupon_tracking').update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : String(err),
        }).eq('id', product.id);
      }
    }

    // 진행 카운터 업데이트 (증분)
    const totalProcessed = (progress.instant_success || 0) + batchInstantSuccess
      + (progress.download_success || 0) + batchDownloadSuccess
      + (progress.instant_failed || 0) + batchInstantFailed
      + (progress.download_failed || 0) + batchDownloadFailed;
    const couponTypes = (config.instant_coupon_enabled ? 1 : 0) + (config.download_coupon_enabled ? 1 : 0);
    const denominator = (progress.total_products || 1) * Math.max(couponTypes, 1);
    const applyingProgress = Math.round((totalProcessed / denominator) * 100);

    await serviceClient.from('bulk_apply_progress').update({
      instant_success: progress.instant_success + batchInstantSuccess,
      instant_failed: progress.instant_failed + batchInstantFailed,
      download_success: progress.download_success + batchDownloadSuccess,
      download_failed: progress.download_failed + batchDownloadFailed,
      applying_progress: Math.min(applyingProgress, 100),
      collecting_progress: 100,
    }).eq('id', progress.id);

    // 남은 pending 확인
    const { count: remainingCount } = await serviceClient
      .from('product_coupon_tracking')
      .select('id', { count: 'exact', head: true })
      .eq('pt_user_id', ptUser.id)
      .eq('status', 'pending');

    const hasMore = (remainingCount || 0) > 0;

    if (!hasMore) {
      await serviceClient.from('bulk_apply_progress').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        applying_progress: 100,
      }).eq('id', progress.id);
    }

    // 최신 상태 반환
    const { data: currentProgress } = await serviceClient
      .from('bulk_apply_progress')
      .select('*')
      .eq('id', progress.id)
      .single();

    return NextResponse.json({ progress: currentProgress, hasMore });
  } catch (err) {
    console.error('쿠폰 일괄 적용 서버 오류:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
