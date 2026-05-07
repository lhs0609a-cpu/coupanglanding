import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import { notifyWithdrawalRejected } from '@/lib/utils/notifications';
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
    const { contractId, reason } = body;

    if (!contractId) {
      return NextResponse.json({ error: '계약 ID가 필요합니다.' }, { status: 400 });
    }

    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: '반려 사유를 입력해주세요.' }, { status: 400 });
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

    // 계약 업데이트
    const { error: updateError } = await serviceClient
      .from('contracts')
      .update({
        withdrawal_status: 'rejected',
        withdrawal_rejected_reason: reason.trim(),
        withdrawal_reviewed_by: user.id,
      })
      .eq('id', contractId);

    if (updateError) {
      return NextResponse.json({ error: `반려 처리 실패: ${updateError.message}` }, { status: 500 });
    }

    // 파트너에게 알림
    const ptUser = contract.pt_user as unknown as { id: string; profile_id: string } | null;
    if (ptUser) {
      await notifyWithdrawalRejected(serviceClient, ptUser.profile_id, reason.trim());
    }

    // 활동 로그
    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'reject_withdrawal',
      targetType: 'contract',
      targetId: contractId,
      details: { reason: reason.trim() },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('reject-withdrawal error:', err);
    void logSystemError({ source: 'contracts/reject-withdrawal', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
