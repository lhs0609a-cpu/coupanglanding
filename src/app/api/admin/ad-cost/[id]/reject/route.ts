import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { createNotification } from '@/lib/utils/notifications';
import { AD_COST_MAX_ATTEMPTS } from '@/lib/payments/ad-cost';

/**
 * POST /api/admin/ad-cost/[id]/reject
 * 광고비 제출 반려.
 *
 * - attempt_no < MAX (= 2) → status='rejected' (사용자 재제출 가능)
 * - attempt_no = MAX → status='locked' (재제출 불가, 광고비 0 확정)
 *
 * Body: { rejectReason: string (required), adminNote?: string }
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
  const rejectReason: string = String(body.rejectReason || '').trim();
  const adminNote: string | null = typeof body.adminNote === 'string' ? body.adminNote : null;

  if (!rejectReason) {
    return NextResponse.json({ error: '반려 사유를 입력해 주세요' }, { status: 400 });
  }

  const serviceClient = await createServiceClient();

  const { data: sub, error: fetchErr } = await serviceClient
    .from('ad_cost_submissions')
    .select('id, pt_user_id, year_month, attempt_no, status')
    .eq('id', id)
    .single();
  if (fetchErr || !sub) return NextResponse.json({ error: '제출 내역을 찾을 수 없습니다' }, { status: 404 });
  if (sub.status !== 'pending') {
    return NextResponse.json({ error: `이미 처리된 제출입니다 (status=${sub.status})` }, { status: 409 });
  }

  const isFinalAttempt = Number(sub.attempt_no) >= AD_COST_MAX_ATTEMPTS;
  const newStatus = isFinalAttempt ? 'locked' : 'rejected';

  const { error: updErr } = await serviceClient
    .from('ad_cost_submissions')
    .update({
      status: newStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by_admin_id: user!.id,
      reject_reason: rejectReason,
      admin_note: adminNote,
    })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // 알림
  const { data: pt } = await serviceClient
    .from('pt_users')
    .select('profile_id')
    .eq('id', sub.pt_user_id)
    .single();
  if (pt?.profile_id) {
    await createNotification(serviceClient, {
      userId: pt.profile_id,
      type: 'settlement',
      title: isFinalAttempt
        ? `${sub.year_month} 광고비 반려 (재제출 한도 초과)`
        : `${sub.year_month} 광고비 반려`,
      message: isFinalAttempt
        ? `광고비 제출이 ${AD_COST_MAX_ATTEMPTS}회 반려되어 더 이상 제출할 수 없습니다. 해당 월 광고비는 0원으로 확정됩니다. 사유: ${rejectReason}`
        : `광고비 제출이 반려되었습니다. 1회 더 재제출 가능합니다. 사유: ${rejectReason}`,
      link: '/my/ad-cost',
    });
  }

  return NextResponse.json({ success: true, newStatus });
}
