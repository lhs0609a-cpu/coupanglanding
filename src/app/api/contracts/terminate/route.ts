import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import { notifyContractTermination } from '@/lib/utils/notifications';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


export async function POST(request: NextRequest) {
  try {
    // 1. 관리자 권한 확인
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

    if (!contractId || !reason) {
      return NextResponse.json({ error: '계약 ID와 해지 사유가 필요합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 2. 계약 조회
    const { data: contract, error: contractError } = await serviceClient
      .from('contracts')
      .select('*, pt_user:pt_users(id, profile_id)')
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (contract.status === 'terminated') {
      return NextResponse.json({ error: '이미 해지된 계약입니다.' }, { status: 400 });
    }

    const now = new Date();
    const deadlineDate = new Date(now);
    deadlineDate.setDate(deadlineDate.getDate() + 14);

    const terminatedAt = now.toISOString();
    const deactivationDeadline = deadlineDate.toISOString();

    // 3. 계약 상태 업데이트 (원자적 처리)
    const { error: updateError } = await serviceClient
      .from('contracts')
      .update({
        status: 'terminated',
        terminated_at: terminatedAt,
        termination_reason: reason,
        product_deactivation_deadline: deactivationDeadline,
      })
      .eq('id', contractId);

    if (updateError) {
      return NextResponse.json({ error: `계약 업데이트 실패: ${updateError.message}` }, { status: 500 });
    }

    // 4. pt_users 상태 업데이트
    const ptUser = contract.pt_user as unknown as { id: string; profile_id: string } | null;
    if (ptUser) {
      await serviceClient
        .from('pt_users')
        .update({ status: 'terminated' })
        .eq('id', ptUser.id);

      // 5. 사용자에게 알림 발송
      const deadlineStr = deadlineDate.toISOString().split('T')[0];
      await notifyContractTermination(
        serviceClient,
        ptUser.profile_id,
        terminatedAt.split('T')[0],
        deadlineStr,
        reason,
      );
    }

    // 6. 활동 로그
    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'terminate_contract',
      targetType: 'contract',
      targetId: contractId,
      details: { reason, deactivation_deadline: deactivationDeadline },
    });

    return NextResponse.json({
      success: true,
      terminated_at: terminatedAt,
      product_deactivation_deadline: deactivationDeadline,
    });
  } catch (err) {
    console.error('contract terminate error:', err);
    void logSystemError({ source: 'contracts/terminate', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
