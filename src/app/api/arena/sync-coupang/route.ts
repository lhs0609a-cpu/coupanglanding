import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { fetchProductListings } from '@/lib/utils/coupang-api-client';
import { calculateDailyPoints } from '@/lib/utils/arena-points';

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

    const today = new Date().toISOString().split('T')[0];

    // 암호화된 API 키 복호화
    const accessKey = await decryptPassword(ptUser.coupang_access_key);
    const secretKey = await decryptPassword(ptUser.coupang_secret_key);

    const { count } = await fetchProductListings(
      {
        vendorId: ptUser.coupang_vendor_id,
        accessKey,
        secretKey,
      },
      today,
      today,
    );

    const { points_listings, points_revenue, points_total } = calculateDailyPoints(count, 0);

    const serviceClient = await createServiceClient();

    const { data: activity, error } = await serviceClient
      .from('seller_daily_activity')
      .upsert({
        pt_user_id: ptUser.id,
        activity_date: today,
        listings_count: count,
        revenue_amount: 0,
        points_listings,
        points_revenue,
        points_streak: 0,
        points_challenge: 0,
        points_total,
        data_source: 'api',
      }, { onConflict: 'pt_user_id,activity_date' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: activity, listings_count: count });
  } catch (err) {
    console.error('arena sync-coupang error:', err);
    const message = err instanceof Error ? err.message : '서버 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
