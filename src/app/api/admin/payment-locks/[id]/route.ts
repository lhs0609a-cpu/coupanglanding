import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/utils/notifications';
import { requireAdminRole } from '@/lib/payments/admin-guard';

interface UpdateBody {
  action: 'reset' | 'exempt' | 'force_level' | 'clear_override';
  exempt_until?: string | null;
  force_level?: number;
}

/**
 * PATCH /api/admin/payment-locks/[id]
 * Body actions:
 *  - reset:          payment_overdue_since=null, payment_lock_level=0, exempt_until=null, admin_override_level=null
 *  - exempt:         exempt_until=YYYY-MM-DD (lock_level은 cron이 다음 실행 때 0으로 내림)
 *  - force_level:    admin_override_level=N (영구 override — cron이 덮어쓰지 않음)
 *  - clear_override: admin_override_level=null (자동 계산 모드로 복귀)
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // 락 변경은 write — admin 전용 (partner 는 금지)
    const guard = await requireAdminRole(supabase, user?.id, 'write');
    if (!guard.ok) return guard.response;

    const body = (await request.json()) as UpdateBody;
    const serviceClient = await createServiceClient();

    let updates: Record<string, unknown> = {};
    let notifyTitle = '';
    let notifyMessage = '';

    if (body.action === 'reset') {
      updates = {
        payment_overdue_since: null,
        payment_lock_level: 0,
        payment_lock_exempt_until: null,
        admin_override_level: null,
      };
      notifyTitle = '결제 락 해제';
      notifyMessage = '관리자가 결제 락을 해제했습니다. 모든 서비스를 정상 이용할 수 있습니다.';
    } else if (body.action === 'exempt') {
      if (!body.exempt_until) {
        return NextResponse.json({ error: 'exempt_until 필수' }, { status: 400 });
      }
      updates = {
        payment_lock_exempt_until: body.exempt_until,
        payment_lock_level: 0,
      };
      notifyTitle = '결제 락 예외 처리';
      notifyMessage = `관리자가 ${body.exempt_until}까지 결제 락 예외를 적용했습니다.`;
    } else if (body.action === 'force_level') {
      const level = Number(body.force_level);
      if (!Number.isInteger(level) || level < 0 || level > 3) {
        return NextResponse.json({ error: 'force_level은 0~3 사이여야 합니다' }, { status: 400 });
      }
      // admin_override_level로 저장 → cron이 덮어쓰지 않음
      updates = {
        admin_override_level: level,
        payment_lock_level: level,
      };
      notifyTitle = '결제 락 단계 변경 (관리자 override)';
      notifyMessage = `관리자가 결제 락을 ${level}단계로 고정했습니다.`;
    } else if (body.action === 'clear_override') {
      updates = { admin_override_level: null };
      notifyTitle = '관리자 override 해제';
      notifyMessage = '락 단계가 자동 계산 모드로 복귀합니다.';
    } else {
      return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
    }

    const { data: ptUser, error } = await serviceClient
      .from('pt_users')
      .update(updates)
      .eq('id', id)
      .select('profile_id')
      .single();

    if (error) throw error;

    if (ptUser?.profile_id) {
      await createNotification(serviceClient, {
        userId: ptUser.profile_id,
        type: 'fee_payment',
        title: notifyTitle,
        message: notifyMessage,
        link: '/my/settings',
      });
    }

    return NextResponse.json({ success: true, updates });
  } catch (err) {
    console.error('PATCH /api/admin/payment-locks/[id] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
