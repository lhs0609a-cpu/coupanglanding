import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import { notifyWithdrawalApproved } from '@/lib/utils/notifications';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


export async function POST(request: NextRequest) {
  try {
    // 관리자 권한 확인
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { contractId } = body;

    if (!contractId) {
      return NextResponse.json({ error: '계약 ID가 필요합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 계약 조회
    const { data: contract, error: contractError } = await serviceClient
      .from('contracts')
      .select('*, pt_user:pt_users(id, profile_id)')
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (contract.withdrawal_status !== 'pending') {
      return NextResponse.json({ error: '대기 중인 탈퇴 요청이 아닙니다.' }, { status: 400 });
    }

    const now = new Date();
    const deadlineDate = new Date(now);
    deadlineDate.setDate(deadlineDate.getDate() + 14);
    const deactivationDeadline = deadlineDate.toISOString();

    // 계약 상태 업데이트
    const { error: updateError } = await serviceClient
      .from('contracts')
      .update({
        status: 'terminated',
        terminated_at: now.toISOString(),
        termination_reason: contract.withdrawal_reason,
        product_deactivation_deadline: deactivationDeadline,
        product_deactivation_evidence_url: contract.withdrawal_evidence_url,
        withdrawal_status: 'approved',
        withdrawal_approved_at: now.toISOString(),
        withdrawal_reviewed_by: user.id,
      })
      .eq('id', contractId);

    if (updateError) {
      return NextResponse.json({ error: `승인 처리 실패: ${updateError.message}` }, { status: 500 });
    }

    // pt_users 상태 업데이트
    const ptUser = contract.pt_user as unknown as { id: string; profile_id: string } | null;
    if (ptUser) {
      await serviceClient
        .from('pt_users')
        .update({ status: 'terminated' })
        .eq('id', ptUser.id);

      // 파트너에게 알림
      const deadlineStr = deadlineDate.toISOString().split('T')[0];
      await notifyWithdrawalApproved(serviceClient, ptUser.profile_id, deadlineStr);
    }

    // 활동 로그
    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'approve_withdrawal',
      targetType: 'contract',
      targetId: contractId,
      details: { reason: contract.withdrawal_reason, deactivation_deadline: deactivationDeadline },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('approve-withdrawal error:', err);
    void logSystemError({ source: 'contracts/approve-withdrawal', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
