import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { logSystemError } from '@/lib/utils/system-log';
import { logSettlementError } from '@/lib/payments/settlement-errors';

export const maxDuration = 30;

/**
 * POST /api/admin/payments/[ptUserId]/mark-report-paid
 * body: { reportId?: string, yearMonth?: string, reason: string }
 *
 * 사용 시점:
 *   사용자가 외부 수단(계좌이체 등)으로 실제 결제했지만
 *   payment_transactions 에 success tx 가 없거나 webhook 누락으로
 *   monthly_report 가 awaiting_payment/overdue/suspended 로 남아있는 경우.
 *
 * 동작:
 *   1) 대상 monthly_report 를 fee_payment_status='paid' 로 강제 마킹
 *      (reportId 또는 yearMonth 둘 다 미지정 시 모든 미납 리포트 일괄 처리)
 *   2) payment_clear_overdue_if_settled RPC 호출 → 다른 미납·재시도 없으면 락 해제
 *   3) 모든 변경은 settlement_audit_log 에 stage='admin_manual_mark_paid' 로 기록
 *
 * 안전:
 *   - admin write 권한 필수
 *   - reason 2자 이상 필수 (감사 추적)
 *   - 토스 환불은 일어나지 않음 (이미 외부 결제됐다는 가정)
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ptUserId: string }> },
) {
  try {
    const { ptUserId } = await context.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const guard = await requireAdminRole(supabase, user?.id, 'write');
    if (!guard.ok) return guard.response;

    const body = await request.json().catch(() => ({}));
    const reportId: string | undefined = body.reportId;
    const yearMonth: string | undefined = body.yearMonth;
    const reason: string = (body.reason as string) || '';

    if (!reason || reason.trim().length < 2) {
      return NextResponse.json(
        { error: '처리 사유를 2자 이상 입력해주세요.' },
        { status: 400 },
      );
    }

    const serviceClient = await createServiceClient();

    // 대상 리포트 조회
    let reportQuery = serviceClient
      .from('monthly_reports')
      .select('id, year_month, fee_payment_status, total_with_vat')
      .eq('pt_user_id', ptUserId)
      .in('fee_payment_status', ['awaiting_payment', 'overdue', 'suspended']);

    if (reportId) {
      reportQuery = reportQuery.eq('id', reportId);
    } else if (yearMonth) {
      reportQuery = reportQuery.eq('year_month', yearMonth);
    }

    const { data: reports, error: rerr } = await reportQuery;
    if (rerr) {
      return NextResponse.json({ error: rerr.message }, { status: 500 });
    }
    if (!reports || reports.length === 0) {
      return NextResponse.json(
        { error: '대상 미납 리포트 없음 (이미 paid 이거나 존재하지 않음)' },
        { status: 404 },
      );
    }

    // 일괄 paid 마킹
    const reportIds = reports.map(r => r.id);
    const nowIso = new Date().toISOString();

    const { error: updErr } = await serviceClient
      .from('monthly_reports')
      .update({
        fee_payment_status: 'paid',
        fee_paid_at: nowIso,
        fee_confirmed_at: nowIso,
        payment_status: 'confirmed',
        payment_confirmed_at: nowIso,
        admin_note: `[수동 paid 처리 ${nowIso.slice(0, 10)}] ${reason.trim()}`,
      })
      .in('id', reportIds);

    if (updErr) {
      await logSettlementError(serviceClient, {
        stage: 'admin_manual_mark_paid_update',
        ptUserId,
        error: updErr,
      });
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    // 락 해제 RPC
    const { data: cleared, error: clearErr } = await serviceClient.rpc(
      'payment_clear_overdue_if_settled',
      { p_pt_user_id: ptUserId },
    );

    if (clearErr) {
      await logSettlementError(serviceClient, {
        stage: 'admin_manual_mark_paid_clear_overdue_rpc',
        ptUserId,
        error: clearErr,
      });
    }

    return NextResponse.json({
      success: true,
      markedReports: reports.map(r => ({
        id: r.id,
        yearMonth: r.year_month,
        previousStatus: r.fee_payment_status,
        amount: r.total_with_vat,
      })),
      lockCleared: cleared === true,
      reason: reason.trim(),
    });
  } catch (err) {
    console.error('POST /api/admin/payments/[ptUserId]/mark-report-paid error:', err);
    void logSystemError({
      source: 'admin/payments/[ptUserId]/mark-report-paid',
      error: err,
      category: 'payment',
    }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
