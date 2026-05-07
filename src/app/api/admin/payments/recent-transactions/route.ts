import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/payments/recent-transactions
 * 최근 24시간 결제 시도 — 결제 됐는지 / 안 됐는지 즉시 확인용.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const guard = await requireAdminRole(supabase, user?.id, 'read');
    if (!guard.ok) return guard.response;

    const serviceClient = await createServiceClient();

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: txs } = await serviceClient
      .from('payment_transactions')
      .select(`
        id, pt_user_id, status, total_amount, created_at, approved_at,
        receipt_url, toss_payment_key, failure_code, failure_message,
        is_auto_payment,
        monthly_reports!inner(year_month),
        pt_users!inner(profile:profiles(full_name, email))
      `)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50);

    const formatted = (txs || []).map((t) => {
      const reportRaw = (t as { monthly_reports?: unknown }).monthly_reports;
      const report = Array.isArray(reportRaw) ? reportRaw[0] : reportRaw;
      const ptRaw = (t as { pt_users?: unknown }).pt_users;
      const pt = Array.isArray(ptRaw) ? ptRaw[0] : ptRaw;
      const profile = (pt as { profile?: unknown } | null)?.profile;
      const profileObj = Array.isArray(profile) ? profile[0] : profile;

      return {
        id: t.id,
        ptUserId: t.pt_user_id,
        name: (profileObj as { full_name?: string; email?: string } | null)?.full_name
          || (profileObj as { full_name?: string; email?: string } | null)?.email
          || t.pt_user_id.slice(0, 8),
        yearMonth: (report as { year_month?: string } | null)?.year_month || '-',
        status: t.status,
        amount: t.total_amount,
        receiptUrl: t.receipt_url,
        paymentKey: t.toss_payment_key,
        failureCode: t.failure_code,
        failureMessage: t.failure_message,
        createdAt: t.created_at,
        approvedAt: t.approved_at,
        isAutoPayment: t.is_auto_payment,
      };
    });

    return NextResponse.json({
      total: formatted.length,
      successCount: formatted.filter((t) => t.status === 'success').length,
      failedCount: formatted.filter((t) => t.status === 'failed').length,
      pendingCount: formatted.filter((t) => t.status === 'pending').length,
      transactions: formatted,
    });
  } catch (err) {
    console.error('GET /api/admin/payments/recent-transactions error:', err);
    void logSystemError({ source: 'admin/payments/recent-transactions', error: err }).catch(() => {});
    return NextResponse.json({ error: err instanceof Error ? err.message : '서버 오류' }, { status: 500 });
  }
}
