import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { fetchProductListings } from '@/lib/utils/coupang-api-client';
import type { CoupangCredentials } from '@/lib/utils/coupang-api-client';

export const maxDuration = 55; // Vercel 함수 최대 실행 시간 (초)

const COLLECT_BATCH_SIZE = 100; // upsert batch size
const PAGES_PER_CALL = 5; // 한 호출당 최대 5페이지 (500 상품) — Vercel timeout 방지

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

    // 클라이언트에서 전달한 nextToken (이어서 수집)
    let resumeToken = '';
    try {
      const body = await request.json();
      resumeToken = body.nextToken || '';
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
      // 새 진행 생성 (collecting 상태)
      const { data: newProgress, error: createError } = await serviceClient
        .from('bulk_apply_progress')
        .insert({
          pt_user_id: ptUser.id,
          status: 'collecting',
          total_products: 0,
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
    console.log(`[collect-products] 배치 수집 시작 (resumeToken: ${resumeToken ? '있음' : '없음'})`);
    const { items: productItems, nextToken } = await fetchProductListings(credentials, {
      status: 'APPROVED',
      maxPages: PAGES_PER_CALL,
      nextToken: resumeToken,
    });

    console.log(`[collect-products] 이번 배치: ${productItems.length}개 vendorItem, nextToken: ${nextToken ? '있음' : '없음'}`);

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
          ignoreDuplicates: true, // 이미 처리된 항목은 건너뜀
        });

      if (upsertError) {
        console.error('[collect-products] upsert 오류:', upsertError);
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
      const estimatedTotal = (totalCollected || 0) + 1000; // 대략적 추정
      const collectingProgress = Math.min(Math.round(((totalCollected || 0) / estimatedTotal) * 100), 95);
      await serviceClient.from('bulk_apply_progress').update({
        collecting_progress: collectingProgress,
        total_products: totalCollected || 0,
      }).eq('id', progress.id);

      console.log(`[collect-products] 배치 완료: ${insertedCount}건 삽입, 총 ${totalCollected}건, 계속 수집...`);
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
