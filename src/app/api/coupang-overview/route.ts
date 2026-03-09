import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { fetchSettlementData, CoupangApiError } from '@/lib/utils/coupang-api-client';

/** GET: 쿠팡 연동 현황 (총 상품 수 + 이번 달 매출 요약) */
export async function GET() {
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
      .single();

    if (!ptUser || !ptUser.coupang_api_connected || !ptUser.coupang_vendor_id || !ptUser.coupang_access_key || !ptUser.coupang_secret_key) {
      return NextResponse.json({ error: 'API 미연동' }, { status: 400 });
    }

    // 상품 수: DB 캐시(seller_points)에서 조회 (9000+ 상품 매번 API 순회 방지)
    const { data: sellerPoints } = await supabase
      .from('seller_points')
      .select('total_listings')
      .eq('pt_user_id', ptUser.id)
      .maybeSingle();

    const productCount = sellerPoints?.total_listings ?? 0;

    // 매출 데이터: API 실시간 조회
    const accessKey = await decryptPassword(ptUser.coupang_access_key);
    const secretKey = await decryptPassword(ptUser.coupang_secret_key);
    const credentials = { vendorId: ptUser.coupang_vendor_id, accessKey, secretKey };

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let settlement = null;
    let settlementError: string | null = null;
    try {
      settlement = await fetchSettlementData(credentials, yearMonth);
    } catch (err) {
      settlementError = err instanceof Error ? err.message : String(err);
      console.error('[coupang-overview] 매출 조회 실패:', settlementError);
    }

    return NextResponse.json({
      productCount,
      monthlySales: settlement?.totalSales ?? 0,
      monthlySettlement: settlement?.totalSettlement ?? 0,
      monthlyCommission: settlement?.totalCommission ?? 0,
      yearMonth,
      // 디버그: 실제 API 응답 구조 확인용 (문제 해결 후 제거)
      _debug: {
        settlementError,
        settlementItemCount: settlement?.items.length ?? 0,
        rawResponseKeys: settlement?.rawResponse ? Object.keys(settlement.rawResponse as Record<string, unknown>) : null,
        rawFirstItem: settlement?.rawResponse
          ? (() => {
              const raw = settlement.rawResponse as Record<string, unknown>;
              const arr = Array.isArray(raw.data) ? raw.data : [];
              return arr.length > 0 ? arr[0] : null;
            })()
          : null,
      },
    });
  } catch (error) {
    if (error instanceof CoupangApiError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode >= 500 ? 502 : error.statusCode },
      );
    }
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
