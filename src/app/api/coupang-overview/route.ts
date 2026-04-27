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

    // revenue-history 단일 호출 — recognitionDateFrom/To로 yearMonth 범위 조회
    //   쿠팡 API가 이미 날짜 필터를 적용해 응답하므로 client-side 후처리 불필요
    const [productResult, settlementResult] = await Promise.allSettled([
      fetchTotalProductCount(credentials),
      fetchSettlementData(credentials, yearMonth),
    ]);

    const productCount = productResult.status === 'fulfilled' ? productResult.value.count : 0;
    const settlement = settlementResult.status === 'fulfilled' ? settlementResult.value : null;

    // ── 자동 진단 — IP 만료 / 키 만료 / 인증 실패 ──
    // 응답 에러 메시지에서 패턴 감지하여 클라이언트 배너용 플래그 반환.
    // DB 컬럼 추가 없이 런타임 시그널만으로 동작.
    let ipOutdated = false;
    let failedIp: string | null = null;
    let keyExpired = false;       // 명시적 "만료" 신호
    let keyAuthFailed = false;    // 401 (만료 또는 잘못된 키 — 모달에서 둘 다 안내)

    const ipErrorRe = /Your ip address ([0-9.]+) is not allowed/i;
    // 쿠팡 OpenAPI 만료 시 errorCode/Message 패턴
    const expiredKeyRe = /expired|만료|EXPIRED_?AUTH|EXPIRED_?KEY|key.*expir/i;
    const authFailRe = /인증 실패 \(401\)|AUTH_?FAIL|INVALID_?ACCESS_?KEY|HTTP 401/i;

    for (const r of [productResult, settlementResult]) {
      if (r.status === 'rejected') {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);

        // IP 화이트리스트
        const ipMatch = msg.match(ipErrorRe);
        if (ipMatch) {
          ipOutdated = true;
          failedIp = ipMatch[1];
        }

        // 키 만료 (specific)
        if (expiredKeyRe.test(msg)) {
          keyExpired = true;
        }

        // 401 일반 (만료 or 잘못된 키)
        if (authFailRe.test(msg)) {
          keyAuthFailed = true;
        }
      }
    }

    return NextResponse.json({
      productCount,
      monthlySales: settlement?.totalSales ?? 0,
      monthlySettlement: settlement?.totalSettlement ?? 0,
      monthlyCommission: settlement?.totalCommission ?? 0,
      yearMonth,
      syncedAt: new Date().toISOString(),
      ipOutdated,
      failedIp,
      keyExpired,
      keyAuthFailed,
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
