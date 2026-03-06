import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import { createNotification } from '@/lib/utils/notifications';

/** PATCH: 관리자가 수동 입력 요청 승인/거절 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    // 관리자 확인
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { status, adminNote } = body as { status: 'approved' | 'rejected'; adminNote?: string };

    if (!status || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'status는 approved 또는 rejected여야 합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 기존 요청 조회
    const { data: existing } = await serviceClient
      .from('manual_input_requests')
      .select('*, pt_user:pt_users(id, profile_id, profile:profiles(id, full_name))')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: '요청을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (existing.status !== 'pending') {
      return NextResponse.json({ error: '이미 처리된 요청입니다.' }, { status: 400 });
    }

    // 업데이트
    const { error } = await serviceClient
      .from('manual_input_requests')
      .update({
        status,
        admin_note: adminNote?.trim() || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: '처리에 실패했습니다.' }, { status: 500 });
    }

    // 활동 로그
    await logActivity(serviceClient, {
      adminId: user.id,
      action: status === 'approved' ? 'approve_manual_input' : 'reject_manual_input',
      targetType: 'manual_input_request',
      targetId: id,
      details: {
        pt_user_id: existing.pt_user_id,
        year_month: existing.year_month,
        reason: existing.reason,
        admin_note: adminNote?.trim() || null,
      },
    });

    // PT 사용자에게 알림
    const ptUserProfileId = existing.pt_user?.profile_id;
    if (ptUserProfileId) {
      if (status === 'approved') {
        await createNotification(serviceClient, {
          userId: ptUserProfileId,
          type: 'settlement',
          title: '수동 입력 승인됨',
          message: `${existing.year_month} 매출 수동 입력이 승인되었습니다. 이제 수동으로 매출을 입력할 수 있습니다.`,
          link: '/my/report',
        });
      } else {
        await createNotification(serviceClient, {
          userId: ptUserProfileId,
          type: 'settlement',
          title: '수동 입력 거절됨',
          message: `${existing.year_month} 수동 입력 요청이 거절되었습니다.${adminNote ? ` 사유: ${adminNote.trim()}` : ''} API 설정을 확인해주세요.`,
          link: '/my/report',
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
