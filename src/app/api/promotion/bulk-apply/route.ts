import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import {
  applyInstantCoupon,
  createInstantCoupon,
  createDownloadCoupon,
  checkDownloadCouponStatus,
  checkInstantCouponStatus,
  toCoupangDateFormat,
} from '@/lib/utils/coupang-api-client';
import type { CoupangCredentials } from '@/lib/utils/coupang-api-client';
import type { SupabaseClient } from '@supabase/supabase-js';

export const maxDuration = 55;

// ── 배치 크기 설정 ──────────────────────────────────────
const INSTANT_BATCH_SIZE = 50;     // 즉시할인 쿠폰 1회 API 호출당 아이템 수
const DOWNLOAD_BATCH_SIZE = 100;   // 다운로드 쿠폰 1개당 최대 아이템 수
const INSTANT_COUPON_MAX_ITEMS = 10000; // 즉시할인 쿠폰 1개당 최대 아이템 수

interface Config {
  id: string;
  pt_user_id: string;
  is_enabled: boolean;
  contract_id: string;
  instant_coupon_enabled: boolean;
  instant_coupon_id: string;
  instant_coupon_name: string;
  instant_coupon_auto_create: boolean;
  instant_coupon_title_template: string;
  instant_coupon_duration_days: number;
  instant_coupon_discount: number;
  instant_coupon_discount_type: string;
  instant_coupon_max_discount: number;
  download_coupon_enabled: boolean;
  download_coupon_id: string;
  download_coupon_name: string;
  download_coupon_auto_create: boolean;
  download_coupon_title_template: string;
  download_coupon_duration_days: number;
  download_coupon_policies: Record<string, unknown>[];
  apply_delay_days: number;
  instant_coupon_item_count?: number; // 현재 쿠폰에 추가된 아이템 수 추적
  [key: string]: unknown;
}

// ── 즉시할인 쿠폰 자동 생성 (로테이션) ─────────────────
async function ensureInstantCoupon(
  credentials: CoupangCredentials,
  config: Config,
  serviceClient: SupabaseClient,
  itemsToAdd: number,
): Promise<{ couponId: number; couponName: string }> {
  const currentCount = config.instant_coupon_item_count || 0;
  const couponId = Number(config.instant_coupon_id);

  // 현재 쿠폰에 여유가 있으면 그대로 사용 (auto_create 비활성이면 항상 기존 쿠폰 사용)
  if (couponId > 0 && (currentCount + itemsToAdd <= INSTANT_COUPON_MAX_ITEMS || !config.instant_coupon_auto_create)) {
    return { couponId, couponName: config.instant_coupon_name };
  }

  // auto_create 비활성인데 한도 초과 시 에러
  if (!config.instant_coupon_auto_create) {
    throw new Error(`즉시할인 쿠폰 ${couponId}의 아이템 한도(${INSTANT_COUPON_MAX_ITEMS})를 초과했습니다. 자동 생성을 활성화하거나 새 쿠폰 ID를 입력해주세요.`);
  }

  // 새 쿠폰 생성 필요
  console.log(`[bulk-apply] 즉시할인 쿠폰 로테이션: 현재 ${currentCount}개 + ${itemsToAdd}개 > ${INSTANT_COUPON_MAX_ITEMS} 한도`);

  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + (config.instant_coupon_duration_days || 30));

  const dateStr = now.toISOString().slice(0, 10);
  const title = (config.instant_coupon_title_template || '즉시할인 {date}')
    .replace('{date}', dateStr)
    .replace('{n}', String(Date.now()).slice(-4));

  const discountValue = config.instant_coupon_discount || 0;
  const discountType = (config.instant_coupon_discount_type as 'RATE' | 'FIXED') || 'RATE';

  // 쿠팡 API 요구사항: 퍼센트 1-89, 정액 1원 이상
  if (discountValue <= 0) {
    throw new Error(`즉시할인 쿠폰 생성 불가: 할인값이 설정되지 않았습니다 (${discountType}: ${discountValue}). 설정에서 할인값을 입력해주세요.`);
  }
  if (discountType === 'RATE' && (discountValue < 1 || discountValue > 89)) {
    throw new Error(`즉시할인 쿠폰 생성 불가: 퍼센트 할인은 1~89% 범위여야 합니다 (현재: ${discountValue}%).`);
  }

  const newCoupon = await createInstantCoupon(credentials, {
    title,
    startDate: toCoupangDateFormat(now),
    endDate: toCoupangDateFormat(endDate),
    discountType,
    discountValue,
    maxDiscountPrice: Math.max(config.instant_coupon_max_discount || 10, 10), // 최소 10원
    contractId: Number(config.contract_id) || 0,
  });

  const newCouponId = newCoupon.couponId;
  const newCouponName = newCoupon.couponName || title;

  // config 업데이트 (새 쿠폰 ID)
  await serviceClient.from('coupon_auto_sync_config').update({
    instant_coupon_id: String(newCouponId),
    instant_coupon_name: newCouponName,
    instant_coupon_item_count: 0,
  }).eq('pt_user_id', config.pt_user_id);

  config.instant_coupon_id = String(newCouponId);
  config.instant_coupon_name = newCouponName;
  config.instant_coupon_item_count = 0;

  console.log(`[bulk-apply] 새 즉시할인 쿠폰 생성: ${newCouponId} (${newCouponName})`);
  return { couponId: newCouponId, couponName: newCouponName };
}

// ── 다운로드 쿠폰 배치 생성 (2단계: 쿠폰 생성 → 아이템 등록) ──
async function createDownloadCouponBatch(
  credentials: CoupangCredentials,
  config: Config,
  vendorItemIds: number[],
  batchNumber: number,
): Promise<{ couponId: number; couponName: string }> {
  // startDate: 5분 뒤 (현재 시간이 API 도달 시 과거가 되는 것 방지)
  const now = new Date();
  const startDate = new Date(now.getTime() + 5 * 60 * 1000);
  const endDate = new Date(startDate);
  // 쿠팡 최대 유효기간 제한 (90일 상한 — 365일은 거부될 수 있음)
  const durationDays = Math.min(config.download_coupon_duration_days || 30, 90);
  endDate.setDate(endDate.getDate() + durationDays);

  const dateStr = now.toISOString().slice(0, 10);
  const title = (config.download_coupon_title_template || '다운로드쿠폰 {date} #{n}')
    .replace('{date}', dateStr)
    .replace('{n}', String(batchNumber));

  // policies 검증 — 빈 배열이면 쿠팡 API가 거부함
  const policies = config.download_coupon_policies || [];
  if (policies.length === 0) {
    throw new Error('다운로드 쿠폰 정책(policies)이 설정되지 않았습니다. 기존 쿠폰에서 정책을 복사해주세요.');
  }

  console.log(`[bulk-apply] 다운로드 쿠폰 기간: ${startDate.toISOString()} ~ ${endDate.toISOString()} (${durationDays}일)`);

  // 쿠폰 생성 + 아이템 등록을 한 번에 (별도 item API는 "요청불가" 발생)
  const newCoupon = await createDownloadCoupon(credentials, {
    title,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    policies,
    contractId: config.contract_id,
    vendorItemIds,  // 생성 시 아이템 포함
  });

  let couponId = newCoupon.couponId;
  const couponName = newCoupon.couponName || title;

  // 비동기 API: couponId=0이면 requestTransactionId로 상태 확인하여 couponId 획득
  if (couponId === 0 && newCoupon.requestTransactionId) {
    console.log(`[bulk-apply] 다운로드 쿠폰 비동기 생성 — 상태 확인 중 (${newCoupon.requestTransactionId})`);
    // 최대 5회 폴링 (각 3초 대기)
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const statusResult = await checkDownloadCouponStatus(credentials, newCoupon.requestTransactionId) as {
          data?: { couponId?: number; status?: string; message?: string };
          status?: string;
          couponId?: number;
        };
        const resolvedId = statusResult.data?.couponId || statusResult.couponId;
        const asyncStatus = String(statusResult.data?.status || statusResult.status || '').toUpperCase();

        if (resolvedId && resolvedId > 0) {
          couponId = resolvedId;
          console.log(`[bulk-apply] 비동기 쿠폰 ID 확인: ${couponId} (attempt ${attempt + 1})`);
          break;
        }
        if (asyncStatus === 'FAIL' || asyncStatus === 'FAILED' || asyncStatus === 'ERROR') {
          const failMsg = String(statusResult.data?.message || '비동기 처리 실패');
          throw new Error(`다운로드 쿠폰 생성 실패 (${newCoupon.requestTransactionId}): ${failMsg}`);
        }
        console.log(`[bulk-apply] 비동기 쿠폰 상태: ${asyncStatus || 'unknown'} (attempt ${attempt + 1})`);
      } catch (err) {
        if (err instanceof Error && err.message.includes('생성 실패')) throw err;
        console.warn(`[bulk-apply] 비동기 상태 확인 실패 (attempt ${attempt + 1}):`, err instanceof Error ? err.message : err);
      }
    }

    if (couponId === 0) {
      throw new Error(`다운로드 쿠폰 생성이 비동기 처리 중입니다 (requestTransactionId: ${newCoupon.requestTransactionId}). 잠시 후 다시 시도해주세요.`);
    }
  }

  console.log(`[bulk-apply] 다운로드 쿠폰 생성+아이템 등록 완료: ${couponId} (${couponName}), ${vendorItemIds.length}개 아이템`);
  return { couponId, couponName };
}

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
    const { data: configRow } = await serviceClient
      .from('coupon_auto_sync_config')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .maybeSingle();

    if (!configRow) {
      return NextResponse.json({ error: '쿠폰 설정을 찾을 수 없습니다.' }, { status: 400 });
    }
    const config = configRow as Config;

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
      await request.json().catch(() => ({}));

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

    let batchInstantSuccess = 0;
    let batchInstantFailed = 0;
    let batchDownloadSuccess = 0;
    let batchDownloadFailed = 0;
    let lastError = '';

    // ═══════════════════════════════════════════════════════
    // Phase 1: 즉시할인 쿠폰 배치 적용
    // ═══════════════════════════════════════════════════════
    if (config.instant_coupon_enabled && config.instant_coupon_id) {
      // pending 상태이면서 instant 미적용인 아이템 가져오기
      const { data: instantBatch } = await serviceClient
        .from('product_coupon_tracking')
        .select('*')
        .eq('pt_user_id', ptUser.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(INSTANT_BATCH_SIZE);

      if (instantBatch && instantBatch.length > 0) {
        // vendorItemId 수집 (유효한 것만)
        const validItems = instantBatch.filter((p) => p.vendor_item_id && !isNaN(Number(p.vendor_item_id)));
        const invalidItems = instantBatch.filter((p) => !p.vendor_item_id || isNaN(Number(p.vendor_item_id)));

        // 무효 아이템 스킵 처리
        for (const item of invalidItems) {
          await serviceClient.from('product_coupon_tracking').update({
            status: 'skipped',
            error_message: 'vendorItemId 없음 — 쿠폰 적용 불가',
          }).eq('id', item.id);
        }

        if (validItems.length > 0) {
          const vendorItemIds = validItems.map((p) => Number(p.vendor_item_id));

          // 즉시할인 쿠폰 로테이션 체크
          try {
            const { couponId, couponName } = await ensureInstantCoupon(
              credentials, config, serviceClient, vendorItemIds.length,
            );

            // processing 상태로 변경
            await serviceClient.from('product_coupon_tracking')
              .update({ status: 'processing' })
              .in('id', validItems.map((p) => p.id));

            // 배치 API 호출 (한 번에 여러 vendorItemId 전송)
            const instantResult = await applyInstantCoupon(credentials, couponId, vendorItemIds);

            // 비동기 결과 폴링 — 모든 배치에서 수행 (최대 5회, 3초 간격)
            if (instantResult.requestedId) {
              console.log(`[bulk-apply] 즉시할인 배치 — 비동기 결과 폴링 시작 (requestedId: ${instantResult.requestedId})`);
              let asyncConfirmed = false;
              for (let attempt = 0; attempt < 5; attempt++) {
                await new Promise((r) => setTimeout(r, 3000));
                try {
                  const statusResult = await checkInstantCouponStatus(credentials, instantResult.requestedId) as Record<string, unknown>;
                  const nested = (statusResult.data || statusResult) as Record<string, unknown>;
                  const status = String(nested.status || nested.couponStatus || statusResult.status || '').toUpperCase();
                  console.log(`[bulk-apply] 즉시할인 비동기 상태 (attempt ${attempt + 1}): ${status}`, JSON.stringify(nested).slice(0, 300));

                  if (status === 'SUCCESS' || status === 'COMPLETED' || status === 'DONE') {
                    asyncConfirmed = true;
                    break;
                  }
                  if (status === 'FAIL' || status === 'FAILED' || status === 'ERROR') {
                    const failMsg = String(nested.message || nested.failReason || '비동기 처리 실패');
                    throw new Error(`즉시할인 비동기 실패 (${instantResult.requestedId}): ${failMsg}`);
                  }
                  // PARTIAL_SUCCESS 등도 확인
                  if (status.includes('PARTIAL')) {
                    console.warn(`[bulk-apply] 즉시할인 부분 성공: ${status}`);
                    asyncConfirmed = true;
                    break;
                  }
                } catch (pollErr) {
                  if (pollErr instanceof Error && pollErr.message.includes('비동기 실패')) throw pollErr;
                  console.warn(`[bulk-apply] 즉시할인 폴링 실패 (attempt ${attempt + 1}):`, pollErr instanceof Error ? pollErr.message : pollErr);
                }
              }
              if (!asyncConfirmed) {
                console.warn(`[bulk-apply] 즉시할인 비동기 결과 미확인 — 성공으로 간주하되 검증 필요`);
              }
            }

            // 성공 — 아이템 카운트 업데이트
            const newCount = (config.instant_coupon_item_count || 0) + vendorItemIds.length;
            await serviceClient.from('coupon_auto_sync_config').update({
              instant_coupon_item_count: newCount,
            }).eq('pt_user_id', ptUser.id);
            config.instant_coupon_item_count = newCount;

            batchInstantSuccess += validItems.length;

            // 성공 로그 배치 삽입 + 트래킹 배치 업데이트
            const newStatus = config.download_coupon_enabled ? 'pending' : 'completed';
            await serviceClient.from('coupon_apply_log').insert(
              validItems.map((item) => ({
                pt_user_id: ptUser.id,
                coupon_type: 'instant',
                coupon_id: String(couponId),
                coupon_name: couponName,
                seller_product_id: item.seller_product_id,
                vendor_item_id: item.vendor_item_id,
                success: true,
              })),
            );
            await serviceClient.from('product_coupon_tracking')
              .update({ status: newStatus, instant_coupon_applied: true })
              .in('id', validItems.map((p) => p.id));
          } catch (err) {
            // 즉시할인 실패 — 다운로드 쿠폰은 계속 진행되어야 함
            batchInstantFailed += validItems.length;
            const errMsg = err instanceof Error ? err.message : String(err);
            lastError = `[즉시할인] ${errMsg}`;
            console.error(`[bulk-apply] 즉시할인 배치 실패 (${validItems.length}건):`, errMsg);

            await serviceClient.from('coupon_apply_log').insert(
              validItems.map((item) => ({
                pt_user_id: ptUser.id,
                coupon_type: 'instant',
                coupon_id: config.instant_coupon_id,
                coupon_name: config.instant_coupon_name,
                seller_product_id: item.seller_product_id,
                vendor_item_id: item.vendor_item_id,
                success: false,
                error_message: errMsg,
              })),
            );

            // 다운로드 쿠폰이 활성이면 pending 유지 (다운로드 진행 가능)
            // 다운로드 비활성이면 failed 처리
            if (config.download_coupon_enabled) {
              await serviceClient.from('product_coupon_tracking')
                .update({ status: 'pending', instant_coupon_applied: false, error_message: `즉시할인 실패(다운로드 계속): ${errMsg}` })
                .in('id', validItems.map((p) => p.id));
            } else {
              await serviceClient.from('product_coupon_tracking')
                .update({ status: 'failed', instant_coupon_applied: false, error_message: `즉시할인 쿠폰 실패: ${errMsg}` })
                .in('id', validItems.map((p) => p.id));
            }
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    // Phase 2: 다운로드 쿠폰 배치 생성
    // ═══════════════════════════════════════════════════════
    if (config.download_coupon_enabled && config.contract_id) {
      // 다운로드 쿠폰 적용 대상 쿼리:
      // - 모든 pending 아이템 (즉시할인 성공/실패 모두 포함)
      // - 즉시할인이 실패해도 다운로드는 독립적으로 진행
      const downloadQuery = serviceClient
        .from('product_coupon_tracking')
        .select('*')
        .eq('pt_user_id', ptUser.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(DOWNLOAD_BATCH_SIZE);

      const { data: downloadBatch } = await downloadQuery;

      if (downloadBatch && downloadBatch.length > 0) {
        const validItems = downloadBatch.filter((p) => p.vendor_item_id && !isNaN(Number(p.vendor_item_id)));
        const invalidItems = downloadBatch.filter((p) => !p.vendor_item_id || isNaN(Number(p.vendor_item_id)));

        for (const item of invalidItems) {
          await serviceClient.from('product_coupon_tracking').update({
            status: 'skipped',
            error_message: 'vendorItemId 없음 — 쿠폰 적용 불가',
          }).eq('id', item.id);
        }

        if (validItems.length > 0) {
          const vendorItemIds = validItems.map((p) => Number(p.vendor_item_id));

          // 다운로드 쿠폰 배치 번호 (현재 시간 기반)
          const batchNumber = Math.floor(Date.now() / 1000) % 100000;

          await serviceClient.from('product_coupon_tracking')
            .update({ status: 'processing' })
            .in('id', validItems.map((p) => p.id));

          try {
            // 다운로드 쿠폰 생성 (아이템 포함 — 한 번에 생성)
            const { couponId, couponName } = await createDownloadCouponBatch(
              credentials, config, vendorItemIds, batchNumber,
            );

            batchDownloadSuccess += validItems.length;

            // 성공 로그 배치 삽입 + 트래킹 배치 업데이트
            await serviceClient.from('coupon_apply_log').insert(
              validItems.map((item) => ({
                pt_user_id: ptUser.id,
                coupon_type: 'download',
                coupon_id: String(couponId),
                coupon_name: couponName,
                seller_product_id: item.seller_product_id,
                vendor_item_id: item.vendor_item_id,
                success: true,
              })),
            );
            await serviceClient.from('product_coupon_tracking')
              .update({ status: 'completed', download_coupon_applied: true })
              .in('id', validItems.map((p) => p.id));
          } catch (err) {
            batchDownloadFailed += validItems.length;
            const errMsg = err instanceof Error ? err.message : String(err);
            lastError = `[다운로드] ${errMsg}`;
            console.error(`[bulk-apply] 다운로드 쿠폰 배치 생성 실패 (${validItems.length}건):`, errMsg);

            await serviceClient.from('coupon_apply_log').insert(
              validItems.map((item) => ({
                pt_user_id: ptUser.id,
                coupon_type: 'download',
                coupon_id: '',
                coupon_name: config.download_coupon_title_template || '',
                seller_product_id: item.seller_product_id,
                vendor_item_id: item.vendor_item_id,
                success: false,
                error_message: errMsg,
              })),
            );
            await serviceClient.from('product_coupon_tracking')
              .update({ status: 'failed', download_coupon_applied: false, error_message: `다운로드 쿠폰 실패: ${errMsg}` })
              .in('id', validItems.map((p) => p.id));
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    // Phase 3: 즉시할인만 활성 + 다운로드 비활성 → pending 아이템 처리
    // ═══════════════════════════════════════════════════════
    // 즉시할인만 활성이고 다운로드 비활성인 경우, 위 Phase 1에서 이미 completed로 처리됨

    // ═══════════════════════════════════════════════════════
    // 진행 카운터 업데이트
    // ═══════════════════════════════════════════════════════
    const totalProcessed = (progress.instant_success || 0) + batchInstantSuccess
      + (progress.download_success || 0) + batchDownloadSuccess
      + (progress.instant_failed || 0) + batchInstantFailed
      + (progress.download_failed || 0) + batchDownloadFailed;
    const couponTypes = (config.instant_coupon_enabled ? 1 : 0) + (config.download_coupon_enabled ? 1 : 0);
    const denominator = (progress.total_products || 1) * Math.max(couponTypes, 1);
    const applyingProgress = Math.round((totalProcessed / denominator) * 100);

    await serviceClient.from('bulk_apply_progress').update({
      instant_success: (progress.instant_success || 0) + batchInstantSuccess,
      instant_failed: (progress.instant_failed || 0) + batchInstantFailed,
      download_success: (progress.download_success || 0) + batchDownloadSuccess,
      download_failed: (progress.download_failed || 0) + batchDownloadFailed,
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

    return NextResponse.json({ progress: currentProgress, hasMore, lastError: lastError || undefined });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('쿠폰 일괄 적용 서버 오류:', message);
    return NextResponse.json({ error: `쿠폰 적용 오류: ${message}` }, { status: 500 });
  }
}
