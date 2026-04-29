import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { fetchTotalProductCount, fetchSettlementData, CoupangApiError } from '@/lib/utils/coupang-api-client';
import { buildCostBreakdown, calculateNetProfit, calculateDeposit } from '@/lib/calculations/deposit';

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
      .select('coupang_vendor_id, coupang_access_key, coupang_secret_key, coupang_api_connected, share_percentage')
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

    // ── 자동 진단 — 모든 실패 케이스 패턴 감지 ──
    // 응답 에러 메시지를 분석해 비기술 사용자가 이해할 수 있는 단일 alert 반환.
    // 우선순위: ip > key_expired > key_auth_failed > rate_limited > server_error > proxy_unreachable > timeout
    type AlertKind =
      | 'ip_outdated'
      | 'key_expired'
      | 'key_auth_failed'
      | 'rate_limited'
      | 'server_error'
      | 'proxy_unreachable'
      | 'timeout'
      | null;

    let alert: AlertKind = null;
    let failedIp: string | null = null;

    const patterns: Array<{ kind: AlertKind; re: RegExp }> = [
      { kind: 'ip_outdated',       re: /Your ip address ([0-9.]+) is not allowed/i },
      { kind: 'key_expired',       re: /expired|만료|EXPIRED_?AUTH|EXPIRED_?KEY|key.*expir/i },
      { kind: 'key_auth_failed',   re: /인증 실패 \(401\)|AUTH_?FAIL|INVALID_?ACCESS_?KEY|HTTP 401|status.*401/i },
      { kind: 'rate_limited',      re: /API 호출 한도|RATE_?LIMIT|rate.?limit|HTTP 429|status.*429/i },
      { kind: 'server_error',      re: /HTTP 50[234]|status.*50[234]|server error|internal.*error/i },
      { kind: 'proxy_unreachable', re: /ECONNREFUSED|ENOTFOUND|fetch failed|network|proxy.*fail/i },
      { kind: 'timeout',           re: /타임아웃|TIMEOUT|timed? out|ETIMEDOUT/i },
    ];

    // 우선순위대로 첫 매치 채택
    outer: for (const r of [productResult, settlementResult]) {
      if (r.status !== 'rejected') continue;
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      for (const p of patterns) {
        if (p.re.test(msg)) {
          alert = p.kind;
          // IP 의 경우 차단된 IP 추출
          if (p.kind === 'ip_outdated') {
            const m = msg.match(/Your ip address ([0-9.]+)/i);
            if (m) failedIp = m[1];
          }
          break outer;
        }
      }
    }

    // ── 진단 정보 — settlementDate 분포 분석으로 누적치 표시 원인 특정 ──
    //   monthlySales 값이 누적치처럼 부풀려 보일 때, 응답 items의 settlementDate가
    //   yearMonth 범위 밖이면 쿠팡 API 필터 문제, 모두 yearMonth 안이면 신규 셀러 케이스.
    let debug: {
      itemCount: number;
      firstSettlementDate: string | null;
      lastSettlementDate: string | null;
      uniqueMonths: string[];
      itemsOutsideRequestedMonth: number;
      requestedMonth: string;
    } | null = null;

    if (settlement?.items && settlement.items.length > 0) {
      const dates = settlement.items
        .map(it => (typeof it.settlementDate === 'string' ? it.settlementDate : ''))
        .filter(Boolean)
        .sort();
      const monthsInResponse = new Set<string>();
      let outsideCount = 0;
      for (const d of dates) {
        const month = d.slice(0, 7); // 'YYYY-MM'
        monthsInResponse.add(month);
        if (month !== yearMonth) outsideCount++;
      }
      debug = {
        itemCount: settlement.items.length,
        firstSettlementDate: dates[0] || null,
        lastSettlementDate: dates[dates.length - 1] || null,
        uniqueMonths: Array.from(monthsInResponse).sort(),
        itemsOutsideRequestedMonth: outsideCount,
        requestedMonth: yearMonth,
      };
    }

    // 우리 수수료(예상) 계산 — DEFAULT_COST_RATES 기반 추정
    //   광고비는 사용자 수동 입력 필드라 위젯에선 0 으로 가정 (실제 정산 리포트에서 입력)
    //   share_percentage 는 pt_users 컬럼, 미설정 시 30 디폴트
    const monthlySales = settlement?.totalSales ?? 0;
    const sharePercentage = ptUser.share_percentage ?? 30;
    const estimatedCosts = buildCostBreakdown(monthlySales, 0);
    const estimatedNetProfit = monthlySales > 0 ? calculateNetProfit(monthlySales, estimatedCosts) : 0;
    const estimatedProgramFee = monthlySales > 0 ? calculateDeposit(monthlySales, estimatedCosts, sharePercentage) : 0;

    return NextResponse.json({
      productCount,
      monthlySales,
      monthlySettlement: settlement?.totalSettlement ?? 0,
      monthlyCommission: settlement?.totalCommission ?? 0,
      // 우리 정산 (예상값 — 정확한 금액은 월별 리포트 제출 시 확정)
      estimatedNetProfit,
      estimatedProgramFee,
      sharePercentage,
      yearMonth,
      syncedAt: new Date().toISOString(),
      alert,        // null | 'ip_outdated' | 'key_expired' | 'key_auth_failed' | 'rate_limited' | 'server_error' | 'proxy_unreachable' | 'timeout'
      failedIp,
      // 하위 호환 (이전 필드도 함께 반환)
      ipOutdated: alert === 'ip_outdated',
      keyExpired: alert === 'key_expired',
      keyAuthFailed: alert === 'key_auth_failed' || alert === 'key_expired',
      // 진단용 — 누적치 의심 시 settlementDate 분포 확인
      debug,
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
