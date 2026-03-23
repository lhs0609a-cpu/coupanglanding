import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import {
  applyInstantCoupon,
  createInstantCoupon,
  createDownloadCoupon,
  addDownloadCouponItems,
  checkDownloadCouponStatus,
  checkInstantCouponStatus,
  getInstantCouponItemCount,
  fetchInstantCoupons,
  toCoupangDateFormat,
} from '@/lib/utils/coupang-api-client';
import type { CoupangCredentials } from '@/lib/utils/coupang-api-client';
import type { SupabaseClient } from '@supabase/supabase-js';

export const maxDuration = 55;

// ── 배치 크기 설정 ──────────────────────────────────────
const INSTANT_BATCH_SIZE = 50;     // 즉시할인 쿠폰 1회 API 호출당 아이템 수
const DOWNLOAD_BATCH_SIZE = 100;   // 다운로드 쿠폰 1개당 최대 아이템 수
const INSTANT_COUPON_MAX_ITEMS = 10000; // 즉시할인 쿠폰 1개당 최대 아이템 수
const POLL_INTERVAL_MS = 3000;     // 비동기 상태 확인 간격 (3초)
const POLL_MAX_ATTEMPTS = 5;       // 비동기 상태 확인 최대 횟수 (충분한 대기)
const TIMEOUT_SAFETY_MS = 40000;   // Phase 전환 안전 한계 (40초)

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
  instant_coupon_item_count?: number;
  [key: string]: unknown;
}

// ── 즉시할인 쿠폰 확보 (로테이션 포함) ─────────────────
async function ensureInstantCoupon(
  credentials: CoupangCredentials,
  config: Config,
  serviceClient: SupabaseClient,
  itemsToAdd: number,
): Promise<{ couponId: number; couponName: string }> {
  const couponId = Number(config.instant_coupon_id);
  if (couponId <= 0) {
    throw new Error('즉시할인 쿠폰 ID가 설정되지 않았습니다.');
  }

  const dbCount = config.instant_coupon_item_count || 0;

  // ── 빠른 경로: DB 카운트 기준 한도 내이면 API 호출 없이 즉시 반환 ──
  if (dbCount + itemsToAdd <= INSTANT_COUPON_MAX_ITEMS) {
    return { couponId, couponName: config.instant_coupon_name };
  }

  // ── 한도 근접 → API로 실제 카운트 확인 ──
  let realCount = dbCount;
  try {
    realCount = await getInstantCouponItemCount(credentials, couponId);
    if (realCount !== dbCount) {
      console.log(`[ensureInstantCoupon] DB 카운트 ${dbCount} → 실제 카운트 ${realCount} 동기화`);
      await serviceClient.from('coupon_auto_sync_config').update({
        instant_coupon_item_count: realCount,
      }).eq('pt_user_id', config.pt_user_id);
      config.instant_coupon_item_count = realCount;
    }
  } catch {
    // API 실패 시 기존 쿠폰 계속 사용
    console.warn(`[ensureInstantCoupon] 아이템 수 조회 실패 — 기존 쿠폰 ${couponId} 계속 사용`);
    return { couponId, couponName: config.instant_coupon_name };
  }

  // 실제 한도 내이면 사용
  if (realCount + itemsToAdd <= INSTANT_COUPON_MAX_ITEMS) {
    return { couponId, couponName: config.instant_coupon_name };
  }

  // ── 10,000개 초과 → 로테이션 시도 ──
  console.log(`[bulk-apply] 즉시할인 쿠폰 로테이션: 현재 ${realCount}개 + ${itemsToAdd}개 > ${INSTANT_COUPON_MAX_ITEMS} 한도`);

  // 기존 쿠폰 설정 조회 (로테이션에 필요)
  let existingCouponData: Record<string, unknown> | null = null;
  try {
    const instantCoupons = await fetchInstantCoupons(credentials);
    const found = instantCoupons.find((c) => c.couponId === couponId);
    if (found) {
      existingCouponData = found as unknown as Record<string, unknown>;
    }
  } catch { /* 조회 실패 → 기존 쿠폰 폴백 */ }

  const discountValue = Number(existingCouponData?.discount || config.instant_coupon_discount || 0);
  const discountType = String(existingCouponData?.type || config.instant_coupon_discount_type || 'RATE') as 'RATE' | 'FIXED';
  const maxDiscount = Number(existingCouponData?.maxDiscountPrice || config.instant_coupon_max_discount || 10);
  const contractId = Number(existingCouponData?.contractId || config.contract_id || 0);
  const existingEndDate = existingCouponData?.endAt ? String(existingCouponData.endAt) : null;

  if (discountValue <= 0) {
    // 할인 설정 미확인 → 기존 쿠폰 계속 사용 (쿠팡이 한도 관리)
    console.warn(`[ensureInstantCoupon] 할인값 미확인 — 기존 쿠폰 ${couponId} 계속 사용`);
    return { couponId, couponName: config.instant_coupon_name };
  }

  const now = new Date();
  const endDate = existingEndDate
    ? new Date(existingEndDate)
    : new Date(now.getTime() + (config.instant_coupon_duration_days || 30) * 24 * 60 * 60 * 1000);
  if (endDate <= now) {
    endDate.setTime(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  }

  const dateStr = now.toISOString().slice(0, 10);
  const existingName = String(existingCouponData?.name || config.instant_coupon_name || '즉시할인');
  const title = `${existingName} ${dateStr} #${String(Date.now()).slice(-4)}`;

  try {
    const newCoupon = await createInstantCoupon(credentials, {
      title,
      startDate: toCoupangDateFormat(now),
      endDate: toCoupangDateFormat(endDate),
      discountType,
      discountValue,
      maxDiscountPrice: Math.max(maxDiscount, 10),
      contractId,
    });

    // 비동기 생성 — requestedId로 상태 확인하여 couponId 획득
    let newCouponId = 0;
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      try {
        const statusResult = await checkInstantCouponStatus(credentials, newCoupon.requestedId) as Record<string, unknown>;
        const nested = (statusResult.data || statusResult) as Record<string, unknown>;
        const content = (nested.content || nested) as Record<string, unknown>;
        const status = String(content.status || nested.status || '').toUpperCase();

        const resolvedId = Number(content.couponId || nested.couponId || 0);
        if (resolvedId > 0) {
          newCouponId = resolvedId;
          break;
        }
        if (status === 'FAIL' || status === 'FAILED' || status === 'ERROR') {
          throw new Error(`즉시할인 쿠폰 생성 실패: ${content.message || nested.message || status}`);
        }
      } catch (pollErr) {
        if (pollErr instanceof Error && pollErr.message.includes('생성 실패')) throw pollErr;
      }
    }

    if (newCouponId > 0) {
      const newCouponName = newCoupon.couponName || title;
      await serviceClient.from('coupon_auto_sync_config').update({
        instant_coupon_id: String(newCouponId),
        instant_coupon_name: newCouponName,
        instant_coupon_item_count: 0,
      }).eq('pt_user_id', config.pt_user_id);
      config.instant_coupon_id = String(newCouponId);
      config.instant_coupon_name = newCouponName;
      config.instant_coupon_item_count = 0;
      console.log(`[bulk-apply] 새 즉시할인 쿠폰 생성 완료: ${newCouponId} (${newCouponName})`);
      return { couponId: newCouponId, couponName: newCouponName };
    }
  } catch (err) {
    console.error(`[ensureInstantCoupon] 로테이션 실패:`, err instanceof Error ? err.message : err);
  }

  // 로테이션 실패 → 기존 쿠폰 폴백
  console.warn(`[ensureInstantCoupon] 로테이션 실패 — 기존 쿠폰 ${couponId} 계속 사용`);
  return { couponId, couponName: config.instant_coupon_name };
}

// ── 다운로드 쿠폰 배치 생성 (2단계: 쿠폰 생성 → 아이템 등록) ──
async function createDownloadCouponBatch(
  credentials: CoupangCredentials,
  config: Config,
  vendorItemIds: number[],
  batchNumber: number,
): Promise<{ couponId: number; couponName: string }> {
  const now = new Date();
  const startDate = new Date(now.getTime() + 5 * 60 * 1000);
  const endDate = new Date(startDate);
  const durationDays = Math.min(config.download_coupon_duration_days || 30, 90);
  endDate.setDate(endDate.getDate() + durationDays);

  const dateStr = now.toISOString().slice(0, 10);
  const title = (config.download_coupon_title_template || '다운로드쿠폰 {date} #{n}')
    .replace('{date}', dateStr)
    .replace('{n}', String(batchNumber));

  const policies = config.download_coupon_policies || [];
  if (policies.length === 0) {
    throw new Error('다운로드 쿠폰 정책(policies)이 설정되지 않았습니다. 기존 쿠폰에서 정책을 복사해주세요.');
  }

  console.log(`[bulk-apply] 다운로드 쿠폰 기간: ${startDate.toISOString()} ~ ${endDate.toISOString()} (${durationDays}일)`);

  // Step 1: 쿠폰 생성
  const newCoupon = await createDownloadCoupon(credentials, {
    title,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    policies,
    contractId: config.contract_id,
  });

  let couponId = newCoupon.couponId;
  const couponName = newCoupon.couponName || title;

  console.log(`[bulk-apply] createDownloadCoupon 응답: couponId=${couponId}, txId=${newCoupon.requestTransactionId || '없음'}`);

  if (couponId === 0 && !newCoupon.requestTransactionId) {
    throw new Error('다운로드 쿠폰 생성 실패: couponId와 requestTransactionId 모두 없음.');
  }

  // 비동기: couponId=0이면 폴링으로 확인
  if (couponId === 0 && newCoupon.requestTransactionId) {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      try {
        const statusResult = await checkDownloadCouponStatus(credentials, newCoupon.requestTransactionId) as {
          data?: { couponId?: number; status?: string; message?: string };
          status?: string; couponId?: number;
        };
        const resolvedId = statusResult.data?.couponId || statusResult.couponId;
        const asyncStatus = String(statusResult.data?.status || statusResult.status || '').toUpperCase();
        if (resolvedId && resolvedId > 0) {
          couponId = resolvedId;
          break;
        }
        if (asyncStatus === 'FAIL' || asyncStatus === 'FAILED' || asyncStatus === 'ERROR') {
          throw new Error(`다운로드 쿠폰 생성 실패: ${statusResult.data?.message || '실패'}`);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('생성 실패')) throw err;
      }
    }
    if (couponId === 0) {
      throw new Error(`다운로드 쿠폰 비동기 처리 중 (txId: ${newCoupon.requestTransactionId}).`);
    }
  }

  // Step 2: 아이템 등록
  if (vendorItemIds.length > 0) {
    console.log(`[bulk-apply] 쿠폰 ${couponId} 준비 대기 3초...`);
    await new Promise((r) => setTimeout(r, 3000));

    console.log(`[bulk-apply] 쿠폰 ${couponId}에 ${vendorItemIds.length}개 아이템 등록`);
    const itemResult = await addDownloadCouponItems(credentials, couponId, vendorItemIds);

    if (itemResult.requestResultStatus !== 'SUCCESS') {
      throw new Error(`다운로드 쿠폰(${couponId}) 아이템 등록 실패: status=${itemResult.requestResultStatus}`);
    }
  }

  console.log(`[bulk-apply] 다운로드 쿠폰 완료: ${couponId} (${couponName}), ${vendorItemIds.length}개`);
  return { couponId, couponName };
}

/** POST: 쿠폰 일괄 적용 (클라이언트 주도 배치 — 1회 호출당 1 Phase만 실행) */
export async function POST(request: NextRequest) {
  const fnStartTime = Date.now();
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

    const { data: configRow } = await serviceClient
      .from('coupon_auto_sync_config')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .maybeSingle();

    if (!configRow) {
      return NextResponse.json({ error: '쿠폰 설정을 찾을 수 없습니다.' }, { status: 400 });
    }
    const config = configRow as Config;

    let { data: progress } = await serviceClient
      .from('bulk_apply_progress')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .in('status', ['collecting', 'applying'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!progress) {
      await request.json().catch(() => ({}));
      const { count: pendingCount } = await serviceClient
        .from('product_coupon_tracking')
        .select('id', { count: 'exact', head: true })
        .eq('pt_user_id', ptUser.id)
        .eq('status', 'pending');

      const { data: newProgress, error: createError } = await serviceClient
        .from('bulk_apply_progress')
        .insert({ pt_user_id: ptUser.id, status: 'applying', total_products: pendingCount || 0 })
        .select()
        .single();

      if (createError || !newProgress) {
        return NextResponse.json({ error: '일괄 적용 시작에 실패했습니다.' }, { status: 500 });
      }
      progress = newProgress;
    }

    // 이전 실행에서 'processing' 상태로 남은 아이템 복구 (중단/타임아웃 방지)
    await serviceClient.from('product_coupon_tracking')
      .update({ status: 'pending' })
      .eq('pt_user_id', ptUser.id)
      .eq('status', 'processing');

    let batchInstantSuccess = 0;
    let batchInstantFailed = 0;
    let batchDownloadSuccess = 0;
    let batchDownloadFailed = 0;
    let lastError = '';

    const hasInstant = config.instant_coupon_enabled && !!config.instant_coupon_id;
    const hasDownload = config.download_coupon_enabled && !!config.contract_id;

    // ═══════════════════════════════════════════════════════
    // Phase 결정: 즉시할인 미적용 아이템이 있으면 Phase 1 먼저
    // ═══════════════════════════════════════════════════════
    let didInstantPhase = false;

    if (hasInstant) {
      // 즉시할인 미적용 pending 아이템 존재 여부 확인
      const { count: needInstantCount } = await serviceClient
        .from('product_coupon_tracking')
        .select('id', { count: 'exact', head: true })
        .eq('pt_user_id', ptUser.id)
        .eq('status', 'pending')
        .or('instant_coupon_applied.is.null,instant_coupon_applied.eq.false');

      if (needInstantCount && needInstantCount > 0) {
        // ─── Phase 1: 즉시할인 쿠폰 적용 ───────────────
        didInstantPhase = true;
        const { data: instantBatch } = await serviceClient
          .from('product_coupon_tracking')
          .select('*')
          .eq('pt_user_id', ptUser.id)
          .eq('status', 'pending')
          .or('instant_coupon_applied.is.null,instant_coupon_applied.eq.false')
          .order('created_at', { ascending: true })
          .limit(INSTANT_BATCH_SIZE);

        if (instantBatch && instantBatch.length > 0) {
          const validItems = instantBatch.filter((p) => p.vendor_item_id && !isNaN(Number(p.vendor_item_id)));
          const invalidItems = instantBatch.filter((p) => !p.vendor_item_id || isNaN(Number(p.vendor_item_id)));

          for (const item of invalidItems) {
            await serviceClient.from('product_coupon_tracking').update({
              status: 'skipped',
              error_message: 'vendorItemId 없음 — 쿠폰 적용 불가',
            }).eq('id', item.id);
          }

          if (validItems.length > 0) {
            const vendorItemIds = validItems.map((p) => Number(p.vendor_item_id));

            try {
              const { couponId, couponName } = await ensureInstantCoupon(
                credentials, config, serviceClient, vendorItemIds.length,
              );

              await serviceClient.from('product_coupon_tracking')
                .update({ status: 'processing' })
                .in('id', validItems.map((p) => p.id));

              const instantResult = await applyInstantCoupon(credentials, couponId, vendorItemIds);

              if (!instantResult.requestedId) {
                throw new Error('즉시할인 API가 requestedId를 반환하지 않았습니다.');
              }

              // 쿠팡 비동기 처리 시작 대기 (즉시 폴링 시 PROCESSING으로 폴링 횟수 낭비 방지)
              await new Promise((r) => setTimeout(r, 2000));

              // 비동기 결과 폴링
              let asyncConfirmed = false;
              for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
                try {
                  const statusResult = await checkInstantCouponStatus(credentials, instantResult.requestedId) as Record<string, unknown>;
                  const data = (statusResult.data || statusResult) as Record<string, unknown>;
                  const content = (data.content || data) as Record<string, unknown>;
                  const status = String(content.status || data.status || '').toUpperCase();

                  console.log(`[bulk-apply] 즉시할인 폴링 #${attempt + 1}/${POLL_MAX_ATTEMPTS}:`, JSON.stringify(statusResult).slice(0, 800));

                  // ★ FAIL 먼저 확인 — data.success는 "API 호출 수신 확인"이지 "쿠폰 적용 결과"가 아님
                  if (status === 'FAIL' || status === 'FAILED' || status === 'ERROR') {
                    const failMsg = String(content.message || data.message || '비동기 처리 실패');
                    const successCnt = Number(content.successCount ?? content.success_count ?? -1);
                    const failCnt = Number(content.failCount ?? content.fail_count ?? -1);
                    throw new Error(`즉시할인 비동기 실패: ${failMsg} (성공=${successCnt >= 0 ? successCnt : '?'}건, 실패=${failCnt >= 0 ? failCnt : '?'}건)`);
                  }
                  // SUCCESS 확인 — content.status 기반만 사용 (data.success 무시)
                  if (status === 'SUCCESS' || status === 'COMPLETED' || status === 'DONE') {
                    asyncConfirmed = true;
                    break;
                  }
                  // PROCESSING/PENDING → 다음 폴링에서 재확인
                } catch (pollErr) {
                  if (pollErr instanceof Error && pollErr.message.includes('비동기 실패')) throw pollErr;
                }
                if (attempt < POLL_MAX_ATTEMPTS - 1) {
                  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
                }
              }
              if (!asyncConfirmed) {
                // 폴링 시간 초과 — 실패로 처리 (이전: 성공으로 간주하던 버그 수정)
                throw new Error('즉시할인 비동기 처리 미확인 (폴링 시간 초과) — 재시도 필요');
              }

              // 성공 — 카운트 업데이트
              const newCount = (config.instant_coupon_item_count || 0) + vendorItemIds.length;
              await serviceClient.from('coupon_auto_sync_config').update({
                instant_coupon_item_count: newCount,
              }).eq('pt_user_id', ptUser.id);
              config.instant_coupon_item_count = newCount;

              batchInstantSuccess += validItems.length;

              // 성공 처리: 다운로드 활성이면 pending 유지, 아니면 completed
              const newStatus = hasDownload ? 'pending' : 'completed';
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

              // ★ 쿠팡 비동기 처리 완료 대기 — 연속 배치 충돌 방지 (핵심!)
              console.log(`[bulk-apply] 즉시할인 ${validItems.length}건 성공 — 5초 대기 (쿠팡 처리 안정화)`);
              await new Promise((r) => setTimeout(r, 5000));

            } catch (err) {
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

              // 재시도 판단: 이전에 이미 실패했던 아이템은 영구 실패로 전환
              const retryItems = validItems.filter(item => !item.error_message?.startsWith('즉시할인 실패'));
              const exhaustedItems = validItems.filter(item => item.error_message?.startsWith('즉시할인 실패'));

              if (retryItems.length > 0) {
                // 첫 실패 → pending 유지하여 다음 호출에서 재시도 (instant_coupon_applied 변경 안 함)
                await serviceClient.from('product_coupon_tracking')
                  .update({ status: 'pending', error_message: `즉시할인 실패 (재시도 대기): ${errMsg}` })
                  .in('id', retryItems.map((p) => p.id));
                console.log(`[bulk-apply] ${retryItems.length}건 재시도 대기`);
              }

              if (exhaustedItems.length > 0) {
                // 재시도 후에도 실패 → 영구 실패
                if (hasDownload) {
                  // 즉시할인 건너뛰고 다운로드 쿠폰으로 진행
                  await serviceClient.from('product_coupon_tracking')
                    .update({ status: 'pending', instant_coupon_applied: true, error_message: `즉시할인 2회 실패→다운로드: ${errMsg}` })
                    .in('id', exhaustedItems.map((p) => p.id));
                } else {
                  await serviceClient.from('product_coupon_tracking')
                    .update({ status: 'failed', error_message: `즉시할인 영구 실패: ${errMsg}` })
                    .in('id', exhaustedItems.map((p) => p.id));
                }
                console.log(`[bulk-apply] ${exhaustedItems.length}건 영구 실패`);
              }

              // 실패 후 쿠팡 큐 안정화 대기 (다음 배치 전 여유 확보)
              await new Promise((r) => setTimeout(r, 3000));
            }
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    // Phase 2: 다운로드 쿠폰 (Phase 1 후 시간이 남으면 실행)
    // ═══════════════════════════════════════════════════════
    const elapsed = Date.now() - fnStartTime;
    const skipDownload = didInstantPhase && elapsed > TIMEOUT_SAFETY_MS;
    if (skipDownload) {
      console.log(`[bulk-apply] Phase 1 후 ${Math.round(elapsed / 1000)}초 경과 — Phase 2 다음 호출로 연기`);
    }

    if (hasDownload && !skipDownload) {
      // 다운로드 대상: pending 상태 + 즉시할인이 활성이면 instant_coupon_applied=true만
      let downloadQuery = serviceClient
        .from('product_coupon_tracking')
        .select('*')
        .eq('pt_user_id', ptUser.id)
        .eq('status', 'pending');

      if (hasInstant) {
        // 즉시할인 완료된 아이템만 다운로드 (순서 보장)
        downloadQuery = downloadQuery.eq('instant_coupon_applied', true);
      }

      const { data: downloadBatch } = await downloadQuery
        .order('created_at', { ascending: true })
        .limit(DOWNLOAD_BATCH_SIZE);

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
          const batchNumber = Math.floor(Date.now() / 1000) % 100000;

          await serviceClient.from('product_coupon_tracking')
            .update({ status: 'processing' })
            .in('id', validItems.map((p) => p.id));

          try {
            const { couponId, couponName } = await createDownloadCouponBatch(
              credentials, config, vendorItemIds, batchNumber,
            );

            batchDownloadSuccess += validItems.length;

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
            console.error(`[bulk-apply] 다운로드 배치 실패 (${validItems.length}건):`, errMsg);

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
