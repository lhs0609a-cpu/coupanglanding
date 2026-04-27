import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { fetchTotalProductCount, fetchSettlementData, CoupangApiError } from '@/lib/utils/coupang-api-client';

export const maxDuration = 60;

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

    // 상품 수 + revenue-history 정산 데이터 병렬 조회 (단일 빠른 endpoint, 페이지네이션 부담 없음)
    //   monthlySales는 settlementDate 기준 client-side 필터링하여 yearMonth 범위만 합산
    //   (revenue-history API는 recognitionDate로 fetch하지만 이 값이 누적치처럼 들어오는 케이스가 있어
    //    클라 측에서 settlementDate가 yearMonth 안인 항목만 합산함으로써 누적 부풀림 방지)
    const [productResult, settlementResult] = await Promise.allSettled([
      fetchTotalProductCount(credentials),
      fetchSettlementData(credentials, yearMonth),
    ]);

    const productCount = productResult.status === 'fulfilled' ? productResult.value.count : 0;
    const settlement = settlementResult.status === 'fulfilled' ? settlementResult.value : null;

    // settlementDate가 yearMonth(예: '2026-04') 으로 시작하는 것만 매출/수수료/정산액 합산
    const ymPrefix = yearMonth; // 'YYYY-MM'
    let monthlySales = 0;
    let monthlySettlement = 0;
    let monthlyCommission = 0;
    if (settlement?.items) {
      for (const it of settlement.items) {
        if (typeof it.settlementDate === 'string' && it.settlementDate.startsWith(ymPrefix)) {
          monthlySales += it.salePrice || 0;
          monthlySettlement += it.settlementAmount || 0;
          monthlyCommission += it.commission || 0;
        }
      }
    }
    // settlementDate가 비어있는 응답 폴백 — 적어도 누적 부풀림은 막을 수 없지만 0 반환은 회피
    const hasFiltered = monthlySales > 0 || monthlySettlement > 0 || monthlyCommission > 0;
    if (!hasFiltered && settlement) {
      monthlySales = settlement.totalSales;
      monthlySettlement = settlement.totalSettlement;
      monthlyCommission = settlement.totalCommission;
    }

    return NextResponse.json({
      productCount,
      monthlySales,
      monthlySettlement,
      monthlyCommission,
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
