import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateListingDiscount } from '@/lib/calculations/listing-discount';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


/**
 * GET /api/listing-discount?netProfit=320000
 *
 * 현재 로그인 유저의 누적 등록 수 기반 할인 정보 반환
 * netProfit이 있으면 실제 할인 금액도 계산
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // PT유저 ID 조회
    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 유저 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    // seller_points에서 total_listings 조회
    const { data: sellerPoints } = await supabase
      .from('seller_points')
      .select('total_listings')
      .eq('pt_user_id', ptUser.id)
      .single();

    const totalListings = sellerPoints?.total_listings ?? 0;

    // URL 파라미터에서 netProfit 가져오기
    const url = new URL(request.url);
    const netProfit = Number(url.searchParams.get('netProfit')) || 0;

    const result = calculateListingDiscount(totalListings, netProfit);

    return NextResponse.json(result);
  } catch (err) {
    console.error('listing-discount error:', err);
    void logSystemError({ source: 'listing-discount', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
