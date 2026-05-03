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

      // Step 1: 새 컬럼 (billing_excluded_*) 만 업데이트.
      //   schema cache 미갱신이나 RLS 문제를 step 별로 분리해서 어디가 막혔는지 식별.
      const { error: updErr1 } = await serviceClient
        .from('pt_users')
        .update({
          billing_excluded_until: excludedUntil,
          billing_exclusion_reason: reason || null,
          billing_excluded_by_admin_id: user!.id,
          billing_excluded_at: new Date().toISOString(),
        })
        .eq('id', ptUserId);

      if (updErr1) {
        console.error('[billing-exemption] step1 update 실패 (새 컬럼):', updErr1);
        return NextResponse.json({
          error: `Step 1 (billing_excluded_* 컬럼 업데이트) 실패: ${updErr1.message}. ` +
            `Supabase 대시보드 → Settings → API → "Reload schema cache" 실행 필요할 수 있음.`,
          details: updErr1,
        }, { status: 500 });
      }

      // Step 2: 기존 락 컬럼 클리어 — step1 성공한 뒤 진행하므로 부분 적용 안전.
      const { error: updErr2 } = await serviceClient
        .from('pt_users')
        .update({
          payment_overdue_since: null,
          payment_lock_level: 0,
          payment_retry_in_progress: false,
          program_access_active: true,
        })
        .eq('id', ptUserId);

      if (updErr2) {
        console.error('[billing-exemption] step2 update 실패 (락 클리어):', updErr2);
        // step1 은 이미 적용되어 있으므로 250 (partial success) 대신 200 + warning 으로 응답
        return NextResponse.json({
          success: true,
          warning: `결제 제외는 적용됐지만 기존 락 클리어 실패: ${updErr2.message}`,
          billing_excluded_until: excludedUntil,
        });
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
      // clear
      const { error: updErr } = await serviceClient
        .from('pt_users')
        .update({
          billing_excluded_until: null,
          billing_exclusion_reason: null,
          billing_excluded_by_admin_id: null,
          billing_excluded_at: null,
        })
        .eq('id', ptUserId);

      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

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
