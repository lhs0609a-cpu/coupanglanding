import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { createNotification } from '@/lib/utils/notifications';
import { calculateDeposit, getReportCosts } from '@/lib/calculations/deposit';
import { calculateVatOnTop } from '@/lib/calculations/vat';

export const maxDuration = 30;


/**
 * POST /api/admin/ad-cost/[id]/approve
 * 광고비 제출 승인 — pending → approved.
 *
 * Side effects:
 *   - monthly_reports.cost_advertising 자동 반영 (해당 월 리포트 존재 시)
 *   - 사용자에게 인앱 알림
 *   - admin_note 옵션
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const guard = await requireAdminRole(supabase, user?.id, 'write');
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const adminNote: string | null = typeof body.adminNote === 'string' ? body.adminNote : null;

  const serviceClient = await createServiceClient();

  // 현재 행 조회
  const { data: sub, error: fetchErr } = await serviceClient
    .from('ad_cost_submissions')
    .select('id, pt_user_id, year_month, amount, status')
    .eq('id', id)
    .single();
  if (fetchErr || !sub) return NextResponse.json({ error: '제출 내역을 찾을 수 없습니다' }, { status: 404 });
  if (sub.status !== 'pending') {
    return NextResponse.json({ error: `이미 처리된 제출입니다 (status=${sub.status})` }, { status: 409 });
  }

  // approved 로 전환
  const { error: updErr } = await serviceClient
    .from('ad_cost_submissions')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by_admin_id: user!.id,
      admin_note: adminNote,
    })
    .eq('id', id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // monthly_reports 가 이미 있으면 cost_advertising 반영 + 파생값(deposit/VAT/total) 재계산
  // 단, 이미 paid 된 리포트는 회계 무결성을 위해 재계산하지 않는다.
  const { data: existingReport } = await serviceClient
    .from('monthly_reports')
    .select('*')
    .eq('pt_user_id', sub.pt_user_id)
    .eq('year_month', sub.year_month)
    .maybeSingle();

  if (existingReport && existingReport.fee_payment_status !== 'paid' && existingReport.payment_status !== 'confirmed') {
    // 광고비 적용한 새 비용 구조
    const updatedCosts = {
      ...getReportCosts(existingReport),
      cost_advertising: sub.amount,
    };
    const revenue = Number(existingReport.reported_revenue) || 0;
    const sharePercentage = 30; // 기본 — 추후 user.share_percentage 기반으로 개선 가능
    const newDeposit = calculateDeposit(revenue, updatedCosts, sharePercentage);
    const newVatCalc = calculateVatOnTop(newDeposit);

    await serviceClient
      .from('monthly_reports')
      .update({
        cost_advertising: sub.amount,
        calculated_deposit: newDeposit,
        admin_deposit_amount: newDeposit,
        supply_amount: newVatCalc.supplyAmount,
        vat_amount: newVatCalc.vatAmount,
        total_with_vat: newVatCalc.totalWithVat,
      })
      .eq('pt_user_id', sub.pt_user_id)
      .eq('year_month', sub.year_month);
  } else if (existingReport) {
    // paid 리포트: 광고비만 기록 (정산엔 영향 X — 다음 사이클에서 환급 처리 필요 시 별도 프로세스)
    await serviceClient
      .from('monthly_reports')
      .update({ cost_advertising: sub.amount })
      .eq('pt_user_id', sub.pt_user_id)
      .eq('year_month', sub.year_month);
  }

  // 사용자에게 알림 — pt_users.profile_id 필요
  const { data: pt } = await serviceClient
    .from('pt_users')
    .select('profile_id')
    .eq('id', sub.pt_user_id)
    .single();
  if (pt?.profile_id) {
    await createNotification(serviceClient, {
      userId: pt.profile_id,
      type: 'settlement',
      title: `${sub.year_month} 광고비 승인 완료`,
      message: `제출하신 광고비 ${Number(sub.amount).toLocaleString()}원이 승인되어 정산에 반영됩니다.`,
      link: '/my/ad-cost',
    });
  }

  return NextResponse.json({ success: true });
}
