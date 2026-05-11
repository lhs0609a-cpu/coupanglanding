import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { kstDateStr, kstMonthStr } from '@/lib/payments/billing-constants';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/payments/readiness-check
 * PT생별 "결제 가능 여부" 종합 진단:
 *   - 계약 signed?
 *   - 활성 카드?
 *   - 직전 마감월 API 매출 snapshot?
 *   - 직전 마감월 monthly_report?
 *   - 결제 제외?
 *   - 결제 가능 결론 + 막힌 단계
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const guard = await requireAdminRole(supabase, user?.id, 'read');
    if (!guard.ok) return guard.response;

    const serviceClient = await createServiceClient();
    const todayDateStr = kstDateStr();
    const currentMonth = kstMonthStr();
    const [cy, cm] = currentMonth.split('-').map(Number);
    const prevM = cm === 1 ? 12 : cm - 1;
    const prevY = cm === 1 ? cy - 1 : cy;
    const lastClosedMonth = `${prevY}-${String(prevM).padStart(2, '0')}`;

    // 1. 모든 활성 PT생
    const { data: ptUsers } = await serviceClient
      .from('pt_users')
      .select('id, profile_id, status, is_test_account, billing_excluded_until, billing_exclusion_reason, profile:profiles(full_name, email)')
      .neq('status', 'terminated');

    if (!ptUsers || ptUsers.length === 0) {
      return NextResponse.json({ users: [], summary: emptySummary(), lastClosedMonth });
    }

    const ptUserIds = ptUsers.map((u) => u.id);

    // 2. 계약 (signed 우선)
    const { data: contracts } = await serviceClient
      .from('contracts')
      .select('pt_user_id, status, created_at')
      .in('pt_user_id', ptUserIds)
      .order('created_at', { ascending: false });
    const contractMap = new Map<string, string>();
    (contracts || []).forEach((c) => {
      const existing = contractMap.get(c.pt_user_id);
      if (!existing || c.status === 'signed') contractMap.set(c.pt_user_id, c.status);
    });

    // 3. 카드
    const { data: cards } = await serviceClient
      .from('billing_cards')
      .select('pt_user_id, card_company, card_number, is_active, is_primary, failed_count')
      .in('pt_user_id', ptUserIds);
    const cardMap = new Map<string, { company: string; number: string; failedCount: number; active: boolean; primary: boolean }>();
    (cards || []).forEach((c) => {
      const cur = cardMap.get(c.pt_user_id);
      // primary + active 우선
      if (!cur || (c.is_primary && c.is_active)) {
        cardMap.set(c.pt_user_id, {
          company: c.card_company,
          number: c.card_number,
          failedCount: c.failed_count ?? 0,
          active: !!c.is_active,
          primary: !!c.is_primary,
        });
      }
    });

    // 4. 직전 마감월 API 매출 snapshot — settlement + orders 중 큰 값 사용
    const { data: snapshots } = await serviceClient
      .from('api_revenue_snapshots')
      .select('pt_user_id, total_sales, total_sales_orders, synced_at')
      .in('pt_user_id', ptUserIds)
      .eq('year_month', lastClosedMonth);
    const snapshotMap = new Map<string, { totalSales: number; syncedAt: string }>();
    (snapshots || []).forEach((s) => {
      const settle = Number(s.total_sales) || 0;
      const orders = Number((s as { total_sales_orders?: number }).total_sales_orders) || 0;
      snapshotMap.set(s.pt_user_id, { totalSales: Math.max(settle, orders), syncedAt: s.synced_at });
    });

    // 5. 직전 마감월 monthly_report
    const { data: reports } = await serviceClient
      .from('monthly_reports')
      .select('id, pt_user_id, fee_payment_status, total_with_vat, fee_paid_at')
      .in('pt_user_id', ptUserIds)
      .eq('year_month', lastClosedMonth);
    const reportMap = new Map<string, { id: string; feeStatus: string; totalWithVat: number; paidAt: string | null }>();
    (reports || []).forEach((r) => {
      reportMap.set(r.pt_user_id, {
        id: r.id,
        feeStatus: r.fee_payment_status || 'null',
        totalWithVat: Number(r.total_with_vat) || 0,
        paidAt: r.fee_paid_at || null,
      });
    });

    // 6. 각 PT생 결제 가능 여부 결정
    const rows = ptUsers.map((u) => {
      const profileRaw = (u as { profile?: unknown }).profile;
      const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
      const name = (profile as { full_name?: string; email?: string } | null)?.full_name
        || (profile as { full_name?: string; email?: string } | null)?.email
        || u.id.slice(0, 8);
      const email = (profile as { email?: string } | null)?.email || '';
      const isTest = !!u.is_test_account;
      const isExcluded = !!u.billing_excluded_until && u.billing_excluded_until >= todayDateStr;
      const contractStatus = contractMap.get(u.id) || null;
      const card = cardMap.get(u.id) || null;
      const snap = snapshotMap.get(u.id) || null;
      const report = reportMap.get(u.id) || null;

      // 막힌 단계 결정
      let blocker: string | null = null;
      let blockerDetail = '';
      if (isTest) {
        blocker = 'test_account';
        blockerDetail = '테스트 계정 — 자동결제 제외';
      } else if (isExcluded) {
        blocker = 'excluded';
        blockerDetail = `결제 제외 ${u.billing_excluded_until}까지`;
      } else if (report?.feeStatus === 'paid') {
        blocker = 'already_paid';
        blockerDetail = `이미 결제 완료 (${report.paidAt ? new Date(report.paidAt).toLocaleDateString('ko-KR') : ''})`;
      } else if (!card) {
        blocker = 'no_card';
        blockerDetail = '활성 카드 미등록';
      } else if (!card.active || !card.primary) {
        blocker = 'card_inactive';
        blockerDetail = `카드 비활성 (active=${card.active}, primary=${card.primary})`;
      } else if (!report && !snap) {
        blocker = 'no_data';
        blockerDetail = `${lastClosedMonth} 매출 데이터 없음 (snapshot도 없음)`;
      } else if (!report && snap && snap.totalSales <= 0) {
        blocker = 'zero_sales';
        blockerDetail = `${lastClosedMonth} 매출 0원 — 청구할 금액 없음`;
      } else if (!report && snap) {
        // 보고서 미생성 + snapshot 존재 → 결제 가능 (실행 시 자동 생성).
        // billable=true 로 처리해 사용자가 즉시 결제 실행할 수 있게 한다.
        blocker = null;
        blockerDetail = `${lastClosedMonth} 보고서 자동 생성 후 즉시 결제 진행`;
      } else if (report && !['awaiting_payment', 'overdue', 'suspended', 'awaiting_review'].includes(report.feeStatus)) {
        blocker = 'report_status';
        blockerDetail = `보고서 상태가 청구 가능 아님: ${report.feeStatus}`;
      } else if (report && report.feeStatus === 'awaiting_review') {
        // awaiting_review 도 결제 가능 (실행 시 awaiting_payment 로 자동 승급)
        blocker = null;
        blockerDetail = `보고서 검토대기 → 결제 시 자동 승급`;
      }

      return {
        ptUserId: u.id,
        name,
        email,
        contractStatus,
        isTest,
        isExcluded,
        excludedUntil: u.billing_excluded_until ?? null,
        excludedReason: u.billing_exclusion_reason ?? null,
        card,
        snapshotTotalSales: snap?.totalSales ?? null,
        snapshotSyncedAt: snap?.syncedAt ?? null,
        report,
        billable: blocker === null,
        blocker,
        blockerDetail,
      };
    });

    const summary = {
      total: rows.length,
      billable: rows.filter((r) => r.billable).length,
      already_paid: rows.filter((r) => r.blocker === 'already_paid').length,
      no_card: rows.filter((r) => r.blocker === 'no_card' || r.blocker === 'card_inactive').length,
      no_data: rows.filter((r) => r.blocker === 'no_data').length,
      zero_sales: rows.filter((r) => r.blocker === 'zero_sales').length,
      no_report: rows.filter((r) => r.blocker === 'no_report').length,
      excluded: rows.filter((r) => r.blocker === 'excluded').length,
      test: rows.filter((r) => r.blocker === 'test_account').length,
    };

    rows.sort((a, b) => {
      if (a.billable !== b.billable) return a.billable ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '', 'ko');
    });

    return NextResponse.json({ lastClosedMonth, users: rows, summary });
  } catch (err) {
    console.error('GET /api/admin/payments/readiness-check error:', err);
    void logSystemError({ source: 'admin/payments/readiness-check', error: err }).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 },
    );
  }
}

function emptySummary() {
  return { total: 0, billable: 0, already_paid: 0, no_card: 0, no_data: 0, zero_sales: 0, no_report: 0, excluded: 0, test: 0 };
}
