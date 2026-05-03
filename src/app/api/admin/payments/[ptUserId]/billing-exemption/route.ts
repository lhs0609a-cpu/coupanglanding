import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { createNotification } from '@/lib/utils/notifications';

/**
 * PATCH /api/admin/payments/[ptUserId]/billing-exemption
 * 결제 사이클 제외 설정 / 해제.
 *
 * Body:
 *   action: 'set' | 'clear'
 *   excludedUntil?: 'YYYY-MM-DD'  (set 시 필수, 이 날짜까지 결제 안 함)
 *   reason?: string               (set 시 사유, 감사 추적)
 *
 * 효과:
 *   - billing_excluded_until 컬럼 세팅
 *   - auto-billing cron / monthly-report-auto-create cron 모두 skip
 *   - 사용자에게 알림 발송 (안심하라고)
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ ptUserId: string }> },
) {
  try {
    const { ptUserId } = await context.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const guard = await requireAdminRole(supabase, user?.id, 'write');
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const action: 'set' | 'clear' = body.action;
    const excludedUntil: string | undefined = body.excludedUntil;
    const reason: string | undefined = body.reason;

    if (action !== 'set' && action !== 'clear') {
      return NextResponse.json({ error: "action 은 'set' 또는 'clear'" }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    const { data: ptUser } = await serviceClient
      .from('pt_users')
      .select('id, profile_id')
      .eq('id', ptUserId)
      .single();
    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자 없음' }, { status: 404 });
    }

    if (action === 'set') {
      if (!excludedUntil || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(excludedUntil)) {
        return NextResponse.json({ error: 'excludedUntil 은 YYYY-MM-DD 형식 필수' }, { status: 400 });
      }

      // 과거 날짜 체크
      const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (excludedUntil < today) {
        return NextResponse.json({ error: '종료일이 과거입니다' }, { status: 400 });
      }

      // RPC 사용 — PostgREST schema cache / 다중 컬럼 update 문제 회피.
      // Postgres function 안에서 원자적 UPDATE 실행 → 빠르게 반환.
      const { error: rpcErr } = await serviceClient.rpc('set_billing_exclusion', {
        p_pt_user_id: ptUserId,
        p_excluded_until: excludedUntil,
        p_reason: reason || null,
        p_admin_id: user!.id,
      });

      if (rpcErr) {
        console.error('[billing-exemption] set_billing_exclusion RPC 실패:', rpcErr);
        return NextResponse.json({
          error: `RPC 실패: ${rpcErr.message}. ` +
            `migration_billing_exclusion_rpc.sql 을 Supabase SQL Editor 에서 실행했는지 확인해주세요.`,
          details: rpcErr,
        }, { status: 500 });
      }

      await createNotification(serviceClient, {
        userId: ptUser.profile_id,
        type: 'fee_payment',
        title: '결제 사이클 일시 제외',
        message: `관리자가 ${excludedUntil}까지 자동결제를 일시 중단했습니다. 해당 기간 동안 결제 시도/락 적용이 없으니 안심하고 이용하세요.${reason ? ` 사유: ${reason}` : ''}`,
        link: '/my/settings',
      });

      return NextResponse.json({
        success: true,
        billing_excluded_until: excludedUntil,
        reason: reason || null,
      });
    } else {
      // clear — RPC 사용
      const { error: rpcErr } = await serviceClient.rpc('clear_billing_exclusion', {
        p_pt_user_id: ptUserId,
      });

      if (rpcErr) {
        console.error('[billing-exemption] clear_billing_exclusion RPC 실패:', rpcErr);
        return NextResponse.json({
          error: `RPC 실패: ${rpcErr.message}. migration_billing_exclusion_rpc.sql 실행 필요.`,
          details: rpcErr,
        }, { status: 500 });
      }

      await createNotification(serviceClient, {
        userId: ptUser.profile_id,
        type: 'fee_payment',
        title: '결제 사이클 재개',
        message: '관리자가 자동결제 일시 중단을 해제했습니다. 다음 청구일부터 정상적으로 자동결제가 진행됩니다.',
        link: '/my/settings',
      });

      return NextResponse.json({ success: true, billing_excluded_until: null });
    }
  } catch (err) {
    console.error('PATCH /api/admin/payments/[ptUserId]/billing-exemption error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 },
    );
  }
}
