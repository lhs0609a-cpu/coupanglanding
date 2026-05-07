import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { fetchSettlementData, CoupangApiError } from '@/lib/utils/coupang-api-client';

export const maxDuration = 30;


/** POST: 쿠팡 정산 데이터 조회 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { yearMonth, periodStart, periodEnd } = body as { yearMonth: string; periodStart?: string; periodEnd?: string };

    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ error: 'yearMonth 형식이 올바르지 않습니다. (예: 2025-03)' }, { status: 400 });
    }

    // PT 사용자의 암호화된 API 키 조회
    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id, coupang_vendor_id, coupang_access_key, coupang_secret_key, coupang_api_connected')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (!ptUser.coupang_api_connected || !ptUser.coupang_access_key || !ptUser.coupang_secret_key || !ptUser.coupang_vendor_id) {
      return NextResponse.json({ error: '쿠팡 API가 연동되지 않았습니다. 설정에서 API 키를 등록해주세요.' }, { status: 400 });
    }

    // 서버에서만 secret key 복호화
    const accessKey = await decryptPassword(ptUser.coupang_access_key);
    const secretKey = await decryptPassword(ptUser.coupang_secret_key);

    // 쿠팡 API 호출 (첫 정산 합산 구간 지원)
    const settlement = await fetchSettlementData(
      {
        vendorId: ptUser.coupang_vendor_id,
        accessKey,
        secretKey,
      },
      yearMonth,
      periodStart && periodEnd
        ? { startDateOverride: periodStart, endDateOverride: periodEnd }
        : undefined,
    );

    return NextResponse.json({
      ptUserId: ptUser.id,
      yearMonth,
      totalSales: settlement.totalSales,
      totalCommission: settlement.totalCommission,
      totalShipping: settlement.totalShipping,
      totalReturns: settlement.totalReturns,
      totalSettlement: settlement.totalSettlement,
      itemCount: settlement.items.length,
      settlementData: settlement,
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
