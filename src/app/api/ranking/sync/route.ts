import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { fetchTotalProductCount } from '@/lib/utils/coupang-api-client';
import { generateAnonymousName } from '@/lib/utils/arena-anonymous';

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
      return NextResponse.json({
        error: '쿠팡 API가 연동되지 않았습니다. 설정에서 API 키를 등록해주세요.',
        needsSetup: true,
      }, { status: 400 });
    }

    // 쿠팡 API에서 총 등록 상품 수 가져오기
    const { count } = await fetchTotalProductCount({
      vendorId: ptUser.coupang_vendor_id,
      accessKey: ptUser.coupang_access_key,
      secretKey: ptUser.coupang_secret_key,
    });

    const serviceClient = await createServiceClient();

    // 익명 이름 생성
    const { name: anonName, emoji: anonEmoji } = generateAnonymousName(ptUser.id);

    // seller_points 테이블에 upsert
    const { error } = await serviceClient
      .from('seller_points')
      .upsert({
        pt_user_id: ptUser.id,
        total_listings: count,
        anonymous_name: anonName,
        anonymous_emoji: anonEmoji,
        last_activity_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'pt_user_id' });

    if (error) {
      console.error('Ranking sync upsert error:', error);
      return NextResponse.json({ error: '동기화에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      total_listings: count,
      synced_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Ranking sync error:', err);
    const message = err instanceof Error ? err.message : '서버 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
