import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { fetchProductListings } from '@/lib/utils/coupang-api-client';
import type { CoupangCredentials } from '@/lib/utils/coupang-api-client';

const COLLECT_BATCH_SIZE = 100; // upsert batch size

/** POST: 쿠팡 상품 수집 → product_coupon_tracking에 저장 */
export async function POST() {
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

    // 쿠팡에서 승인된 전체 상품 조회
    console.log('[collect-products] 상품 수집 시작...');
    const { items: productItems } = await fetchProductListings(credentials, {
      status: 'APPROVED',
    });

    console.log(`[collect-products] 쿠팡에서 ${productItems.length}개 vendorItem 조회 완료`);

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

      // 수집 진행률 업데이트
      const collectingProgress = Math.round(((i + batch.length) / productItems.length) * 100);
      await serviceClient.from('bulk_apply_progress').update({
        collecting_progress: Math.min(collectingProgress, 100),
        total_products: productItems.length,
      }).eq('id', progress.id);
    }

    // pending 상품 수 카운트
    const { count: pendingCount } = await serviceClient
      .from('product_coupon_tracking')
      .select('id', { count: 'exact', head: true })
      .eq('pt_user_id', ptUser.id)
      .eq('status', 'pending');

    // 수집 완료 → applying 상태로 전환
    await serviceClient.from('bulk_apply_progress').update({
      status: 'applying',
      collecting_progress: 100,
      total_products: pendingCount || 0,
      total_items: productItems.length,
    }).eq('id', progress.id);

    // 최신 상태 반환
    const { data: currentProgress } = await serviceClient
      .from('bulk_apply_progress')
      .select('*')
      .eq('id', progress.id)
      .single();

    console.log(`[collect-products] 수집 완료: ${insertedCount}건 삽입, ${pendingCount}건 pending`);

    return NextResponse.json({
      progress: currentProgress,
      collected: true,
      totalVendorItems: productItems.length,
      pendingCount: pendingCount || 0,
    });
  } catch (err) {
    console.error('상품 수집 서버 오류:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
