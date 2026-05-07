import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { createNotification } from '@/lib/utils/notifications';
import { BILLING_DAY } from '@/lib/payments/billing-constants';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


/**
 * POST /api/admin/payments/[ptUserId]/notify-card-required
 * 관리자가 카드 미등록 PT생에게 "결제 카드 등록" 안내 알림을 즉시 발송.
 *
 * 자동결제 cron 도 청구일에 카드 미등록이면 동일 알림을 보내지만,
 * 관리자가 지원 채널(전화/카톡)로 안내하기 직전에 시스템 알림도 함께
 * 남기고 싶을 때 사용한다.
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ ptUserId: string }> }) {
  try {
    const { ptUserId } = await context.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const guard = await requireAdminRole(supabase, user?.id, 'write');
    if (!guard.ok) return guard.response;

    const serviceClient = await createServiceClient();

    const { data: ptUser } = await serviceClient
      .from('pt_users')
      .select('id, profile_id')
      .eq('id', ptUserId)
      .single();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자 없음' }, { status: 404 });
    }

    await createNotification(serviceClient, {
      userId: ptUser.profile_id,
      type: 'fee_payment',
      title: '[관리자 안내] 결제 카드 등록 필요',
      message: `자동결제를 위해 결제 카드를 등록해 주세요. 매월 ${BILLING_DAY}일에 자동결제가 진행되며, 카드가 등록되어 있지 않으면 단계적 서비스 제한이 적용될 수 있습니다.`,
      link: '/my/settings',
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/admin/payments/[ptUserId]/notify-card-required error:', err);
    void logSystemError({ source: 'admin/payments/[ptUserId]/notify-card-required', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
