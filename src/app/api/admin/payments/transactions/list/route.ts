import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/payments/transactions/list?filter=all|duplicate|paid_locked&limit=100&search=name
 *
 * 결제 내역 + 중복 결제 / 결제 후 락 잔존 등 사고 케이스 필터.
 *   - filter=all: 최근 결제 전체 (success/failed/cancelled/pending)
 *   - filter=duplicate: 같은 monthly_report 에 success tx 가 2건 이상인 케이스
 *   - filter=paid_locked: 모든 미납이 paid 인데 lock_level > 0 인 사용자의 결제 tx
 *   - search: full_name 또는 email 부분 일치
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const guard = await requireAdminRole(supabase, user?.id, 'read');
    if (!guard.ok) return guard.response;

    const url = new URL(request.url);
    const filter = (url.searchParams.get('filter') || 'all') as 'all' | 'duplicate' | 'paid_locked';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500);
    const search = (url.searchParams.get('search') || '').trim();

    const serviceClient = await createServiceClient();

    // 필터별로 대상 monthly_report_id 또는 pt_user_id 를 먼저 좁히고 tx 조회
    let allowedReportIds: string[] | null = null;
    let allowedPtUserIds: string[] | null = null;

    if (filter === 'duplicate') {
      // 같은 리포트에 success tx >= 2 인 monthly_report_id 추출 (집계는 클라이언트)
      const { data: groupRows } = await serviceClient
        .from('payment_transactions')
        .select('monthly_report_id')
        .eq('status', 'success')
        .limit(5000);

      const counts = new Map<string, number>();
      for (const r of (groupRows || []) as { monthly_report_id: string }[]) {
        counts.set(r.monthly_report_id, (counts.get(r.monthly_report_id) ?? 0) + 1);
      }
      allowedReportIds = Array.from(counts.entries())
        .filter(([, c]) => c >= 2)
        .map(([id]) => id);

      if (allowedReportIds.length === 0) {
        return NextResponse.json({ filter, total: 0, transactions: [] });
      }
    }

    if (filter === 'paid_locked') {
      // payment_lock_level > 0 또는 admin_override_level > 0 인 사용자 ID 추출
      const { data: lockedUsers } = await serviceClient
        .from('pt_users')
        .select('id, payment_lock_level, admin_override_level')
        .or('payment_lock_level.gt.0,admin_override_level.gt.0');

      allowedPtUserIds = (lockedUsers || []).map(u => u.id);

      if (allowedPtUserIds.length === 0) {
        return NextResponse.json({ filter, total: 0, transactions: [] });
      }
    }

    let query = serviceClient
      .from('payment_transactions')
      .select(`
        id, pt_user_id, monthly_report_id, status, total_amount, amount, penalty_amount,
        is_auto_payment, created_at, approved_at, failed_at,
        receipt_url, toss_payment_key, toss_order_id,
        failure_code, failure_message,
        cancelled_at, cancel_reason,
        monthly_reports!inner(year_month, fee_payment_status),
        pt_users!inner(profile:profiles(full_name, email))
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (allowedReportIds) {
      query = query.in('monthly_report_id', allowedReportIds);
    }
    if (allowedPtUserIds) {
      query = query.in('pt_user_id', allowedPtUserIds);
    }

    const { data: txs, error } = await query;
    if (error) throw error;

    // success tx 카운트로 중복 마킹 (filter='all' 일 때도 표시)
    const successPerReport = new Map<string, number>();
    {
      const reportIds = Array.from(new Set((txs || []).map(t => t.monthly_report_id)));
      if (reportIds.length > 0) {
        const { data: counts } = await serviceClient
          .from('payment_transactions')
          .select('monthly_report_id, status')
          .in('monthly_report_id', reportIds)
          .eq('status', 'success');

        for (const r of (counts || []) as { monthly_report_id: string }[]) {
          successPerReport.set(r.monthly_report_id, (successPerReport.get(r.monthly_report_id) ?? 0) + 1);
        }
      }
    }

    let formatted = (txs || []).map((t) => {
      const reportRaw = (t as { monthly_reports?: unknown }).monthly_reports;
      const report = (Array.isArray(reportRaw) ? reportRaw[0] : reportRaw) as
        | { year_month?: string; fee_payment_status?: string }
        | null;
      const ptRaw = (t as { pt_users?: unknown }).pt_users;
      const pt = Array.isArray(ptRaw) ? ptRaw[0] : ptRaw;
      const profile = (pt as { profile?: unknown } | null)?.profile;
      const profileObj = (Array.isArray(profile) ? profile[0] : profile) as
        | { full_name?: string; email?: string }
        | null;

      return {
        id: t.id,
        ptUserId: t.pt_user_id,
        monthlyReportId: t.monthly_report_id,
        name: profileObj?.full_name || profileObj?.email || (t.pt_user_id as string).slice(0, 8),
        email: profileObj?.email || null,
        yearMonth: report?.year_month || '-',
        reportStatus: report?.fee_payment_status || '-',
        status: t.status,
        amount: t.total_amount,
        baseAmount: t.amount,
        penaltyAmount: t.penalty_amount,
        receiptUrl: t.receipt_url,
        paymentKey: t.toss_payment_key,
        orderId: t.toss_order_id,
        failureCode: t.failure_code,
        failureMessage: t.failure_message,
        cancelledAt: (t as { cancelled_at?: string | null }).cancelled_at ?? null,
        cancelReason: (t as { cancel_reason?: string | null }).cancel_reason ?? null,
        createdAt: t.created_at,
        approvedAt: t.approved_at,
        failedAt: t.failed_at,
        isAutoPayment: t.is_auto_payment,
        siblingSuccessCount: Math.max(0, (successPerReport.get(t.monthly_report_id) ?? 0) - (t.status === 'success' ? 1 : 0)),
        isDuplicateSuccess: t.status === 'success' && (successPerReport.get(t.monthly_report_id) ?? 0) >= 2,
      };
    });

    if (search) {
      const needle = search.toLowerCase();
      formatted = formatted.filter(t =>
        (t.name || '').toLowerCase().includes(needle) ||
        (t.email || '').toLowerCase().includes(needle),
      );
    }

    return NextResponse.json({
      filter,
      total: formatted.length,
      transactions: formatted,
    });
  } catch (err) {
    console.error('GET /api/admin/payments/transactions/list error:', err);
    void logSystemError({
      source: 'admin/payments/transactions/list',
      error: err,
    }).catch(() => {});
    return NextResponse.json({ error: err instanceof Error ? err.message : '서버 오류' }, { status: 500 });
  }
}
