import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import { notifyWithdrawalRequested } from '@/lib/utils/notifications';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // pt_user 조회
    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const body = await request.json();
    const { reason, evidenceUrl } = body;

    if (!reason || reason.trim().length < 10) {
      return NextResponse.json({ error: '탈퇴 사유는 최소 10자 이상이어야 합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 계약 조회: signed 상태 + 이미 pending이 아닌지 확인
    const { data: contract, error: contractError } = await serviceClient
      .from('contracts')
      .select('id, status, withdrawal_status')
      .eq('pt_user_id', ptUser.id)
      .eq('status', 'signed')
      .maybeSingle();

    if (contractError || !contract) {
      return NextResponse.json({ error: '유효한 서명 완료 계약을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (contract.withdrawal_status === 'pending') {
      return NextResponse.json({ error: '이미 탈퇴 요청이 진행 중입니다.' }, { status: 400 });
    }

    // 계약 업데이트
    const { error: updateError } = await serviceClient
      .from('contracts')
      .update({
        withdrawal_requested_at: new Date().toISOString(),
        withdrawal_reason: reason.trim(),
        withdrawal_evidence_url: evidenceUrl || null,
        withdrawal_status: 'pending',
        withdrawal_rejected_reason: null,
        withdrawal_approved_at: null,
        withdrawal_reviewed_by: null,
      })
      .eq('id', contract.id);

    if (updateError) {
      return NextResponse.json({ error: `요청 처리 실패: ${updateError.message}` }, { status: 500 });
    }

    // 모든 관리자에게 알림
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    const partnerName = profile?.full_name || '파트너';

    const { data: admins } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('role', 'admin');

    if (admins) {
      for (const admin of admins) {
        await notifyWithdrawalRequested(serviceClient, admin.id, partnerName);
      }
    }

    // 활동 로그
    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'request_withdrawal',
      targetType: 'contract',
      targetId: contract.id,
      details: { reason: reason.trim() },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('request-withdrawal error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
