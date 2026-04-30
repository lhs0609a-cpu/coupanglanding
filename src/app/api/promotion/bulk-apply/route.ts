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
const POLL_MAX_ATTEMPTS = 5;       // 비동기 상태 확인 최대 횟수 (FAIL 감지용)
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
// 쿠팡 공식: 생성 API body엔 vendorItemIds 없음. 아이템은 PUT /coupon-items 별도 호출.
// "다운로드쿠폰은 최초 생성 시 설정한 쿠폰 적용 상품을 추후 바꿀 수 없습니다" =
// 쿠폰별 1회만 등록 가능. 따라서 생성→등록을 한 트랜잭션처럼 묶어 실패 시 throw.
async function createDownloadCouponBatch(
  credentials: CoupangCredentials,
  config: Config,
  vendorItemIds: number[],
  batchNumber: number,
): Promise<{ couponId: number; couponName: string }> {
  const now = new Date();
  // 쿠팡 문서: "생성 후 최소 1시간 이후부터 프론트에 반영"
  const startDate = new Date(now.getTime() + 60 * 60 * 1000); // +1시간
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

  console.log(`[bulk-apply] 다운로드 쿠폰 기간: ${startDate.toISOString()} ~ ${endDate.toISOString()} (${durationDays}일), 아이템 ${vendorItemIds.length}개 등록 예정`);

  // ── 1단계: 쿠폰 생성 (공식 스펙 7필드만, vendorItemIds 미포함) ──
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

  // 응답이 즉시 오지 않은 경우(비동기 폴백) — 문서엔 없지만 안전장치로 유지
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
  }

  if (couponId === 0) {
    throw new Error(`다운로드 쿠폰 생성 실패: couponId 미수신 (txId: ${newCoupon.requestTransactionId || '없음'})`);
  }

  // ── 2단계: 아이템(vendorItemIds) 등록 (PUT /coupon-items) ──
  console.log(`[bulk-apply] 다운로드 쿠폰 ${couponId}에 ${vendorItemIds.length}개 아이템 등록 시도`);
  const itemResult = await addDownloadCouponItems(credentials, couponId, vendorItemIds);
  if (itemResult.requestResultStatus && itemResult.requestResultStatus !== 'SUCCESS') {
    throw new Error(`다운로드 쿠폰 아이템 등록 실패: ${itemResult.requestResultStatus}`);
  }

  console.log(`[bulk-apply] 다운로드 쿠폰 완료: ${couponId} (${couponName}), 아이템 ${vendorItemIds.length}개 등록`);
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
      .select('id, coupang_vendor_id, coupang_wing_user_id, coupang_access_key, coupang_secret_key, coupang_api_connected')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (!ptUser.coupang_api_connected || !ptUser.coupang_vendor_id || !ptUser.coupang_access_key || !ptUser.coupang_secret_key) {
      return NextResponse.json({ error: '쿠팡 API가 연동되지 않았습니다.' }, { status: 400 });
    }

    if (!ptUser.coupang_wing_user_id || !ptUser.coupang_wing_user_id.trim()) {
      return NextResponse.json({
        error: 'WING 로그인 ID가 등록되어 있지 않습니다. 설정 > 쿠팡 API 연동 > "WING 로그인 ID" 필드를 입력 후 저장해주세요. (다운로드 쿠폰은 vendorId가 아닌 WING 로그인 ID로 등록됩니다)',
        code: 'WING_USER_ID_MISSING',
      }, { status: 400 });
    }

    const credentials: CoupangCredentials = {
      vendorId: ptUser.coupang_vendor_id,
      accessKey: await decryptPassword(ptUser.coupang_access_key),
      secretKey: await decryptPassword(ptUser.coupang_secret_key),
      wingUserId: ptUser.coupang_wing_user_id.trim(),
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

              // 쿠팡 비동기 처리 시작 대기
              await new Promise((r) => setTimeout(r, 3000));

              // 비동기 결과 폴링
              let pollSuccessCount = -1; // 쿠팡 응답의 성공 건수 (-1 = 미확인)
              let pollFailCount = -1;
              let pollStatus = '';
              for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
                try {
                  const statusResult = await checkInstantCouponStatus(credentials, instantResult.requestedId) as Record<string, unknown>;
                  const data = (statusResult.data || statusResult) as Record<string, unknown>;
                  const content = (data.content || data) as Record<string, unknown>;
                  pollStatus = String(content.status || data.status || '').toUpperCase();

                  console.log(`[bulk-apply] 즉시할인 폴링 #${attempt + 1}/${POLL_MAX_ATTEMPTS}: status="${pollStatus}"`, JSON.stringify(statusResult).slice(0, 500));

                  // 성공/실패 건수 추출
                  const sCnt = Number(content.successCount ?? content.success_count ?? data.successCount ?? -1);
                  const fCnt = Number(content.failCount ?? content.fail_count ?? data.failCount ?? -1);
                  if (sCnt >= 0) pollSuccessCount = sCnt;
                  if (fCnt >= 0) pollFailCount = fCnt;

                  // 완료 상태 감지 (SUCCESS든 FAIL이든 처리 완료)
                  if (['FAIL', 'FAILED', 'ERROR', 'SUCCESS', 'COMPLETED', 'DONE'].includes(pollStatus)) {
                    console.log(`[bulk-apply] 폴링 완료: status=${pollStatus}, 성공=${pollSuccessCount}, 실패=${pollFailCount}`);
                    break;
                  }
                  if (data.success === true && attempt >= 2) {
                    console.log(`[bulk-apply] 폴링: data.success=true → 완료 처리 (attempt ${attempt + 1})`);
                    break;
                  }
                } catch (pollErr) {
                  const pollErrMsg = pollErr instanceof Error ? pollErr.message : String(pollErr);
                  console.warn(`[bulk-apply] 즉시할인 폴링 #${attempt + 1} API 오류 (무시):`, pollErrMsg);
                }
                if (attempt < POLL_MAX_ATTEMPTS - 1) {
                  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
                }
              }

              // ★ 결과 판정: 쿠팡 응답 기반
              // 전체 실패 = "이미 적용된 아이템"일 가능성 높음 → 완료 처리 (재시도 무한루프 방지)
              // 부분 성공 = 일부 신규 + 일부 이미 적용 → 전체 완료 처리
              // 쿠팡은 이미 등록된 vendorItemId를 재추가하면 해당 아이템만 실패 카운트함
              const isTerminalFail = ['FAIL', 'FAILED', 'ERROR'].includes(pollStatus);
              const isAlreadyApplied = isTerminalFail && pollSuccessCount === 0 && pollFailCount > 0;
              const isPartialSuccess = pollSuccessCount > 0 && pollFailCount > 0;

              // 실제 신규 적용 건수 (쿠팡 응답 기준, 미확인 시 전체로 간주)
              const actualNewCount = pollSuccessCount >= 0 ? pollSuccessCount : vendorItemIds.length;

              if (isAlreadyApplied) {
                // ★ 전체 실패 = 이미 쿠폰에 등록된 아이템 → "적용 완료"로 처리
                console.log(`[bulk-apply] 즉시할인 전체 실패(${pollFailCount}건) — 이미 적용된 아이템으로 간주, 완료 처리`);
                batchInstantSuccess += validItems.length;

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
                    error_message: '이미 쿠폰 적용됨 (중복 등록 스킵)',
                  })),
                );
                await serviceClient.from('product_coupon_tracking')
                  .update({ status: newStatus, instant_coupon_applied: true, error_message: null })
                  .in('id', validItems.map((p) => p.id));

                await new Promise((r) => setTimeout(r, 2000));
              } else {
                // 성공 / 부분 성공 / 미확인 → 전체 적용 완료 처리
                // 부분 실패 = 이미 적용된 아이템이므로 결과적으로 전체 적용됨
                const newCount = (config.instant_coupon_item_count || 0) + actualNewCount;
                await serviceClient.from('coupon_auto_sync_config').update({
                  instant_coupon_item_count: newCount,
                }).eq('pt_user_id', ptUser.id);
                config.instant_coupon_item_count = newCount;

                batchInstantSuccess += validItems.length;

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
                    error_message: isPartialSuccess ? `${pollFailCount}건 이미 적용됨` : undefined,
                  })),
                );
                await serviceClient.from('product_coupon_tracking')
                  .update({ status: newStatus, instant_coupon_applied: true, error_message: null })
                  .in('id', validItems.map((p) => p.id));

                if (pollFailCount > 0) {
                  console.log(`[bulk-apply] 부분 성공: 신규 ${pollSuccessCount}건, 이미적용 ${pollFailCount}건 — 전체 완료 처리`);
                }

                // 쿠팡 처리 안정화 대기
                console.log(`[bulk-apply] 즉시할인 ${validItems.length}건 처리 (신규 ${actualNewCount}건) — 5초 대기`);
                await new Promise((r) => setTimeout(r, 5000));
              }

            } catch (err) {
              // applyInstantCoupon API 호출 자체가 실패한 경우만 여기로 옴
              // (폴링 결과 기반 실패는 위에서 처리 — 여기는 네트워크/인증 에러만)
              batchInstantFailed += validItems.length;
              const errMsg = err instanceof Error ? err.message : String(err);
              lastError = `[즉시할인] ${errMsg}`;
              console.error(`[bulk-apply] 즉시할인 API 호출 실패 (${validItems.length}건):`, errMsg);

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

              // API 호출 자체 실패 → pending 유지 (다음 호출에서 재시도)
              await serviceClient.from('product_coupon_tracking')
                .update({ status: 'pending', error_message: `즉시할인 API 오류: ${errMsg}` })
                .in('id', validItems.map((p) => p.id));

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
