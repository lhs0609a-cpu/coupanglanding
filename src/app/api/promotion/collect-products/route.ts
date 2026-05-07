import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { fetchProductListings, fetchTotalProductCount } from '@/lib/utils/coupang-api-client';
import type { CoupangCredentials } from '@/lib/utils/coupang-api-client';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 55; // Vercel 함수 최대 실행 시간 (초)

const COLLECT_BATCH_SIZE = 100; // upsert batch size
const PAGES_PER_CALL = 3; // 한 호출당 3페이지 — 시간 초과 시 자동 중단 (maxTimeMs 보호)
const MAX_FETCH_TIME_MS = 45000; // fetchProductListings 최대 실행 시간 (45초)

/** POST: 쿠팡 상품 수집 → product_coupon_tracking에 저장 (배치 방식) */
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

    // 클라이언트에서 전달한 nextToken, collectDays
    let resumeToken = '';
    let collectDays = 0;
    try {
      const body = await request.json();
      resumeToken = body.nextToken || '';
      collectDays = Number(body.collectDays) || 0;
    } catch { /* empty body */ }

    const credentials: CoupangCredentials = {
      vendorId: ptUser.coupang_vendor_id,
      accessKey: await decryptPassword(ptUser.coupang_access_key),
      secretKey: await decryptPassword(ptUser.coupang_secret_key),
    };

    const serviceClient = await createServiceClient();

    // 활성 진행 확인 또는 생성
    let { data: progress } = await serviceClient
      .from('bulk_apply_progress')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .in('status', ['collecting', 'applying'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!progress) {
      // 첫 수집: 총 상품 수를 미리 조회 (프로그레스 계산용)
      let estimatedTotal = 0;
      try {
        const { count } = await fetchTotalProductCount(credentials);
        estimatedTotal = count;
      } catch { /* 실패 시 0으로 시작 */ }

      // 새 진행 생성 (collecting 상태)
      const { data: newProgress, error: createError } = await serviceClient
        .from('bulk_apply_progress')
        .insert({
          pt_user_id: ptUser.id,
          status: 'collecting',
          total_products: 0,
          total_items: estimatedTotal, // 예상 총 상품 수 저장
        })
        .select()
        .single();

      if (createError || !newProgress) {
        return NextResponse.json({ error: '상품 수집 시작에 실패했습니다.' }, { status: 500 });
      }
      progress = newProgress;
    }

    // 이미 applying 상태이면 수집 완료로 처리
    if (progress.status === 'applying') {
      return NextResponse.json({
        progress,
        collected: true,
        message: '이미 적용 단계입니다.',
      });
    }

    // 쿠팡에서 상품 배치 조회 (PAGES_PER_CALL 페이지만)
    console.log(`[collect-products] 배치 수집 시작 (resumeToken: ${resumeToken ? '있음' : '없음'}, days: ${collectDays || '전체'})`);
    const { items: allItems, nextToken, rawResponse } = await fetchProductListings(credentials, {
      status: 'APPROVED',
      maxPages: PAGES_PER_CALL,
      nextToken: resumeToken,
      maxTimeMs: MAX_FETCH_TIME_MS,
    });

    // 날짜 필터링 (서버 측 — 쿠팡 API 파라미터가 무시되므로)
    let productItems = allItems;
    if (collectDays > 0) {
      const cutoffDate = new Date(Date.now() - collectDays * 24 * 60 * 60 * 1000);
      const cutoffStr = cutoffDate.toISOString();
      productItems = allItems.filter((item) => {
        if (!item.createdAt) return false;
        return item.createdAt >= cutoffStr;
      });
      console.log(`[collect-products] 날짜 필터: 최근 ${collectDays}일 → ${allItems.length}개 중 ${productItems.length}개 통과 (기준: ${cutoffStr.split('T')[0]})`);
    }

    console.log(`[collect-products] 이번 배치: ${productItems.length}개 vendorItem, nextToken: ${nextToken ? '있음' : '없음'}`);

    // 0건인 경우 rawResponse 로깅
    if (productItems.length === 0 && !resumeToken) {
      const { count: inflowCount } = await fetchTotalProductCount(credentials);
      console.warn(`[collect-products] 상품 0건 수집됨. inflow-status 등록 상품 수: ${inflowCount}`);
      console.warn(`[collect-products] API 응답 일부:`, JSON.stringify(rawResponse).slice(0, 500));
    }

    // 이번 배치에서 0건이고 resumeToken이 있었다면 (중간 빈 페이지) → 수집 완료 처리
    // (쿠팡 API가 빈 페이지 + nextToken을 반환할 수 있으므로 무한 루프 방지)
    if (productItems.length === 0 && resumeToken && nextToken) {
      console.log(`[collect-products] 빈 페이지 감지 (resumeToken 있음, 0건) — 수집 강제 완료`);
      // nextToken을 무시하고 수집 완료 처리
      const { count: pendingCount } = await serviceClient
        .from('product_coupon_tracking')
        .select('id', { count: 'exact', head: true })
        .eq('pt_user_id', ptUser.id)
        .eq('status', 'pending');

      const { count: totalItems } = await serviceClient
        .from('product_coupon_tracking')
        .select('id', { count: 'exact', head: true })
        .eq('pt_user_id', ptUser.id);

      await serviceClient.from('bulk_apply_progress').update({
        status: 'applying',
        collecting_progress: 100,
        total_products: pendingCount || 0,
        total_items: totalItems || 0,
      }).eq('id', progress.id);

      const { data: currentProgress } = await serviceClient
        .from('bulk_apply_progress')
        .select('*')
        .eq('id', progress.id)
        .single();

      return NextResponse.json({
        progress: currentProgress,
        collected: true,
        hasMore: false,
        totalCollected: totalItems || 0,
      });
    }

    // product_coupon_tracking에 upsert (batch)
    let insertedCount = 0;
    for (let i = 0; i < productItems.length; i += COLLECT_BATCH_SIZE) {
      const batch = productItems.slice(i, i + COLLECT_BATCH_SIZE);

      const rows = batch
        .filter((item) => item.vendorItemId) // vendorItemId가 있는 것만
        .map((item) => ({
          pt_user_id: ptUser.id,
          seller_product_id: item.sellerProductId,
          seller_product_name: item.sellerProductName || item.vendorItemName,
          vendor_item_id: item.vendorItemId,
          status: 'pending' as const,
          product_created_at: item.createdAt,
        }));

      if (rows.length === 0) continue;

      const { error: upsertError } = await serviceClient
        .from('product_coupon_tracking')
        .upsert(rows, {
          onConflict: 'pt_user_id,vendor_item_id',
          ignoreDuplicates: true, // 이미 존재하는 항목은 건너뜀 (신규 상품만 적용 시 completed 보존)
        });

      if (upsertError) {
        console.error('[collect-products] upsert 오류:', upsertError);
        void logSystemError({ source: 'promotion/collect-products', error: upsertError }).catch(() => {});
      } else {
        insertedCount += rows.length;
      }
    }

    // 현재까지 수집된 총 상품 수
    const { count: totalCollected } = await serviceClient
      .from('product_coupon_tracking')
      .select('id', { count: 'exact', head: true })
      .eq('pt_user_id', ptUser.id);

    const hasMore = !!nextToken;

    if (hasMore) {
      // 아직 더 수집할 상품이 있음 — collecting 유지
      const knownTotal = progress.total_items || 0;
      const collected = totalCollected || 0;
      // registeredCount는 전체(APPROVED+기타) 포함이므로, 실제 APPROVED는 ~85-90% 수준
      // 남은 예상치를 50으로 제한하여 진행률이 80%에서 멈추는 것 방지
      const estimatedRemaining = knownTotal > collected
        ? Math.min(knownTotal - collected, 100) // 최대 100개만 남은 것으로 추정
        : 50;
      const denominator = collected + estimatedRemaining;
      const collectingProgress = Math.min(Math.round((collected / denominator) * 100), 99);
      await serviceClient.from('bulk_apply_progress').update({
        collecting_progress: collectingProgress,
        total_products: totalCollected || 0,
      }).eq('id', progress.id);

      console.log(`[collect-products] 배치 완료: ${insertedCount}건 삽입, 총 ${totalCollected}/${knownTotal}건, 계속 수집...`);
    } else {
      // 모든 상품 수집 완료 → applying 상태로 전환
      const { count: pendingCount } = await serviceClient
        .from('product_coupon_tracking')
        .select('id', { count: 'exact', head: true })
        .eq('pt_user_id', ptUser.id)
        .eq('status', 'pending');

      await serviceClient.from('bulk_apply_progress').update({
        status: 'applying',
        collecting_progress: 100,
        total_products: pendingCount || 0,
        total_items: totalCollected || 0,
      }).eq('id', progress.id);

      console.log(`[collect-products] 수집 완료: 총 ${totalCollected}건, ${pendingCount}건 pending`);
    }

    // 최신 상태 반환
    const { data: currentProgress } = await serviceClient
      .from('bulk_apply_progress')
      .select('*')
      .eq('id', progress.id)
      .single();

    return NextResponse.json({
      progress: currentProgress,
      collected: !hasMore,
      hasMore,
      nextToken: nextToken || undefined,
      totalCollected: totalCollected || 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' | ') : '';
    console.error('상품 수집 서버 오류:', message, stack);
    return NextResponse.json({
      error: `상품 수집 오류: ${message}`,
      detail: stack,
    }, { status: 500 });
  }
}
