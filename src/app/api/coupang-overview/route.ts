import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { fetchTotalProductCount, fetchSettlementData, fetchOrderBasedSales, CoupangApiError } from '@/lib/utils/coupang-api-client';

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
      .select('coupang_vendor_id, coupang_access_key, coupang_secret_key, coupang_api_connected')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser || !ptUser.coupang_api_connected || !ptUser.coupang_vendor_id || !ptUser.coupang_access_key || !ptUser.coupang_secret_key) {
      return NextResponse.json({ error: 'API 미연동' }, { status: 400 });
    }

    const accessKey = await decryptPassword(ptUser.coupang_access_key);
    const secretKey = await decryptPassword(ptUser.coupang_secret_key);
    const credentials = { vendorId: ptUser.coupang_vendor_id, accessKey, secretKey };

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 상품 수 + 매출(주문일 기준) + 정산(인식일 기준) 병렬 조회
    //  - monthlySales: ordersheets API로 createdAt 기준 — 사용자가 기대하는 "이 달 발주"
    //  - monthlySettlement/Commission: revenue-history API로 recognitionDate 기준 — 쿠팡이 이 달 정산한 금액
    //    (revenue-history만 쓰면 과거 주문의 정산이 이 달로 인식돼 누적치처럼 부풀려짐)
    const [productResult, orderSalesResult, settlementResult] = await Promise.allSettled([
      fetchTotalProductCount(credentials),
      fetchOrderBasedSales(credentials, yearMonth, { excludeCancelled: true }),
      fetchSettlementData(credentials, yearMonth),
    ]);

    const productCount = productResult.status === 'fulfilled' ? productResult.value.count : 0;
    const orderSales = orderSalesResult.status === 'fulfilled' ? orderSalesResult.value : null;
    const settlement = settlementResult.status === 'fulfilled' ? settlementResult.value : null;

    return NextResponse.json({
      productCount,
      monthlySales: orderSales?.totalSales ?? 0,
      monthlySettlement: settlement?.totalSettlement ?? 0,
      monthlyCommission: settlement?.totalCommission ?? 0,
      yearMonth,
      syncedAt: new Date().toISOString(),
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
