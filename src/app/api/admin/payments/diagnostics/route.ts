import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { kstMonthStr } from '@/lib/payments/billing-constants';

/**
 * GET /api/admin/payments/diagnostics
 * "왜 자동결제가 안 됐는지" 진단 — 14명 PT생 vs 결제 0건 미스매치 원인 추적.
 *
 * 검사 항목:
 *   1. 전체 PT생 수
 *   2. signed 계약 보유 PT생 수 (auto-billing 대상)
 *   3. 직전 마감월 monthly_reports 분포 (status별)
 *   4. api_revenue_snapshots 분포 (직전 마감월)
 *   5. 카드 등록 PT생 수
 *   6. 자동결제 미실행 추정 사유 요약
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const guard = await requireAdminRole(supabase, user?.id, 'read');
    if (!guard.ok) return guard.response;

    const serviceClient = await createServiceClient();
    const now = new Date();
    const currentMonth = kstMonthStr(now);
    // 직전 마감월
    const [cy, cm] = currentMonth.split('-').map(Number);
    const prevM = cm === 1 ? 12 : cm - 1;
    const prevY = cm === 1 ? cy - 1 : cy;
    const lastClosedMonth = `${prevY}-${String(prevM).padStart(2, '0')}`;

    // 1. 전체 PT생
    const { count: totalPtUsers } = await serviceClient
      .from('pt_users')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'terminated');

    // 2. signed 계약 보유 PT생
    const { count: signedPtUsers } = await serviceClient
      .from('pt_users')
      .select('id, contracts!inner(status)', { count: 'exact', head: true })
      .eq('contracts.status', 'signed')
      .eq('is_test_account', false);

    // 3. is_test_account=true 인 PT생 (자동결제에서 제외됨)
    const { count: testAccounts } = await serviceClient
      .from('pt_users')
      .select('id', { count: 'exact', head: true })
      .eq('is_test_account', true);

    // 4. 계약 상태 분포
    const { data: contractsByStatus } = await serviceClient
      .from('contracts')
      .select('status');

    const contractDist: Record<string, number> = {};
    (contractsByStatus || []).forEach((c) => {
      contractDist[c.status] = (contractDist[c.status] || 0) + 1;
    });

    // 5. 직전 마감월 monthly_reports 상태 분포
    const { data: lastReports } = await serviceClient
      .from('monthly_reports')
      .select('id, fee_payment_status, payment_status, total_with_vat')
      .eq('year_month', lastClosedMonth);

    const reportFeeDist: Record<string, number> = {};
    const reportPaymentDist: Record<string, number> = {};
    let lastReportTotal = 0;
    (lastReports || []).forEach((r) => {
      const fs = r.fee_payment_status || 'null';
      const ps = r.payment_status || 'null';
      reportFeeDist[fs] = (reportFeeDist[fs] || 0) + 1;
      reportPaymentDist[ps] = (reportPaymentDist[ps] || 0) + 1;
      lastReportTotal += Number(r.total_with_vat) || 0;
    });

    // 6. 직전 마감월 api_revenue_snapshots
    const { count: lastSnapshots } = await serviceClient
      .from('api_revenue_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('year_month', lastClosedMonth);

    // 7. 활성 카드 보유 PT생 수
    const { data: activeCards } = await serviceClient
      .from('billing_cards')
      .select('pt_user_id')
      .eq('is_active', true)
      .eq('is_primary', true);

    const usersWithCard = new Set((activeCards || []).map((c) => c.pt_user_id)).size;

    // 8. 최근 cron 실행 락 — 5월 3일에 cron 이 실제로 실행됐는지 추적
    const { data: cronLocks } = await serviceClient
      .from('cron_locks')
      .select('lock_key, acquired_at, acquired_by')
      .order('acquired_at', { ascending: false })
      .limit(10);

    // 9. 오늘 자동결제 실행 결과 — payment_transactions 테이블 5월 3일치
    const today = new Date();
    const todayStart = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { data: todayTxs } = await serviceClient
      .from('payment_transactions')
      .select('id, status, is_auto_payment, created_at, failure_code')
      .gte('created_at', todayStart)
      .eq('is_auto_payment', true);

    // 10. settlement_errors 최근 24h
    const { data: recentErrors } = await serviceClient
      .from('payment_settlement_errors')
      .select('stage, error_code, error_message, created_at')
      .gte('created_at', todayStart)
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(20);

    // ─── 진단 요약 ───
    const reasons: string[] = [];
    const eligibleForBilling = (lastReports || []).filter((r) =>
      ['awaiting_payment', 'overdue', 'suspended'].includes(r.fee_payment_status || ''),
    ).length;

    if ((signedPtUsers || 0) === 0) {
      reasons.push('🚨 contracts.status="signed" 인 PT생이 0명 — auto-billing cron이 아무도 처리하지 못함. /admin/contracts 에서 계약 서명 완료 처리 필요.');
    }

    if ((lastReports || []).length === 0) {
      reasons.push(`🚨 ${lastClosedMonth} monthly_reports 가 0건 — 자동 생성 cron이 안 돌았거나 PT생이 contracts.signed 가 아니어서 skip됨.`);
    } else if (eligibleForBilling === 0) {
      const reviewCount = reportFeeDist.awaiting_review || 0;
      if (reviewCount > 0) {
        reasons.push(`⚠️ ${lastClosedMonth} 보고서 ${reviewCount}건이 'awaiting_review' 상태에 머물러 있음 — PT생이 검토/확정 안 함. auto-billing은 awaiting_payment 만 청구.`);
      } else {
        reasons.push(`⚠️ ${lastClosedMonth} 보고서가 청구 가능 상태(awaiting_payment/overdue/suspended)에 0건임. fee_payment_status 분포: ${JSON.stringify(reportFeeDist)}`);
      }
    }

    if (usersWithCard === 0 && (signedPtUsers || 0) > 0) {
      reasons.push('⚠️ 활성 + primary 카드 등록한 PT생이 0명 — 결제 수단 자체가 없음.');
    }

    const todayAutoBillingLock = (cronLocks || []).find((l) => l.lock_key === 'cron:auto-billing');
    if (todayAutoBillingLock) {
      reasons.push(`✅ auto-billing cron이 최근 실행됨 (${todayAutoBillingLock.acquired_at}).`);
    } else {
      reasons.push('⚠️ cron_locks 테이블에 auto-billing 락 흔적이 없음 — cron이 아직 실행 안 됐거나 lock 미점유 상태로 종료. CRON_SECRET / Vercel cron 로그 확인 필요.');
    }

    if (reasons.length === 0) {
      reasons.push('✅ 명확한 차단 사유 없음 — 5월 3일 03:00 KST 이후 결제 결과를 다시 확인해주세요.');
    }

    return NextResponse.json({
      summary: {
        currentMonth,
        lastClosedMonth,
        totalPtUsers: totalPtUsers ?? 0,
        signedPtUsers: signedPtUsers ?? 0,
        testAccounts: testAccounts ?? 0,
        usersWithCard,
        lastReportCount: (lastReports || []).length,
        lastReportTotal,
        eligibleForBilling,
        lastSnapshotCount: lastSnapshots ?? 0,
        todayAutoTxCount: (todayTxs || []).length,
      },
      reasons,
      contractStatusDist: contractDist,
      reportFeeStatusDist: reportFeeDist,
      reportPaymentStatusDist: reportPaymentDist,
      cronLocks: cronLocks || [],
      todayAutoTxs: (todayTxs || []).map((t) => ({
        status: t.status,
        failure_code: t.failure_code,
        created_at: t.created_at,
      })),
      recentErrors: recentErrors || [],
    });
  } catch (err) {
    console.error('GET /api/admin/payments/diagnostics error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '진단 실패' },
      { status: 500 },
    );
  }
}
