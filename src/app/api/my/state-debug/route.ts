import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/my/state-debug
 *
 * 본인 pt_users row 의 핵심 필드 + 현재 UI 판정 결과를 JSON 으로 반환.
 * 배너/모달이 왜 뜨는지, 메가로드 왜 못 들어가는지 즉시 진단용.
 * 민감값(키, 토큰) 은 제외.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
    }

    const user = session.user;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, is_active, full_name')
      .eq('id', user.id)
      .maybeSingle();

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select(
        'id, profile_id, created_at, is_test_account, coupang_vendor_id, coupang_api_connected, coupang_api_key_expires_at, payment_lock_level, payment_overdue_since, admin_override_level, payment_lock_exempt_until, payment_retry_in_progress, first_billing_grace_until',
      )
      .eq('profile_id', user.id)
      .maybeSingle();

    let billingCards: { count: number; activeCount: number } | null = null;
    let currentReport: Record<string, unknown> | null = null;
    let megaloadUser: { id: string } | null = null;

    if (ptUser) {
      const ptRow = ptUser as Record<string, unknown>;
      const { data: cards } = await supabase
        .from('billing_cards')
        .select('id, is_active')
        .eq('pt_user_id', ptRow.id as string);
      billingCards = {
        count: (cards || []).length,
        activeCount: (cards || []).filter((c) => (c as { is_active?: boolean }).is_active).length,
      };

      const yearMonth = new Date().toISOString().slice(0, 7);
      const { data: report } = await supabase
        .from('monthly_reports')
        .select('year_month, payment_status, fee_payment_status, fee_payment_deadline, total_with_vat')
        .eq('pt_user_id', ptRow.id as string)
        .eq('year_month', yearMonth)
        .maybeSingle();
      currentReport = (report as Record<string, unknown> | null) ?? null;

      const { data: mUser } = await supabase
        .from('megaload_users')
        .select('id')
        .eq('profile_id', user.id)
        .maybeSingle();
      megaloadUser = mUser ? { id: (mUser as { id: string }).id } : null;
    }

    // UI 판정 시뮬레이션 (my/layout.tsx + DashboardLayout.tsx 와 동일 규칙)
    const ptRow = ptUser as Record<string, unknown> | null;
    const isTestAccount = !!ptRow?.is_test_account;
    const hasVendorId = !!ptRow?.coupang_vendor_id;
    const apiConnectedFlag = !!ptRow?.coupang_api_connected;
    const uiCoupangApiConnected = isTestAccount || apiConnectedFlag || hasVendorId;
    const todayStr = new Date().toISOString().slice(0, 10);
    const exemptUntil = (ptRow?.payment_lock_exempt_until as string | null | undefined) ?? null;
    const exemptActive = !!exemptUntil && exemptUntil > todayStr;
    const rawLockLevel = (ptRow?.payment_lock_level as number | null | undefined) ?? 0;
    const adminOverride = (ptRow?.admin_override_level as number | null | undefined) ?? null;
    const uiEffectiveLockLevel = exemptActive ? 0 : (adminOverride ?? rawLockLevel);
    const hasActiveCard = (billingCards?.activeCount ?? 0) > 0;
    const feeStatus = (currentReport?.fee_payment_status as string | undefined) ?? 'not_applicable';
    const hasUnpaidFee = ['awaiting_payment', 'overdue'].includes(feeStatus);
    const isHardBlock =
      !isTestAccount &&
      (uiEffectiveLockLevel === 3 || (!hasActiveCard && hasUnpaidFee));

    const banners = {
      apiConnectionBanner_shown: !uiCoupangApiConnected,
      apiConnectionBanner_reason: uiCoupangApiConnected
        ? 'hidden — connected or test account or has vendor id'
        : `shown — is_test_account=${isTestAccount}, coupang_api_connected=${apiConnectedFlag}, coupang_vendor_id=${hasVendorId}`,
      forcedPaymentOverlay_shown: isHardBlock,
      forcedPaymentOverlay_reason: isHardBlock
        ? `blocked — lockLevel=${uiEffectiveLockLevel}, hasActiveCard=${hasActiveCard}, hasUnpaidFee=${hasUnpaidFee}(status=${feeStatus})`
        : 'not shown',
      megaloadLayoutRedirectsToSettings: uiEffectiveLockLevel === 3 && !isTestAccount,
    };

    return NextResponse.json({
      user: { id: user.id, email: user.email },
      profile,
      ptUser,
      billingCards,
      currentReport,
      megaloadUser,
      uiDecisions: {
        isTestAccount,
        hasVendorId,
        apiConnectedFlag,
        uiCoupangApiConnected,
        rawLockLevel,
        adminOverride,
        exemptActive,
        uiEffectiveLockLevel,
        hasActiveCard,
        hasUnpaidFee,
        feeStatus,
      },
      banners,
      note: '이 응답에서 banners.* 값이 UI 표시 여부를 결정합니다. shown=true 항목이 실제 문제 원인입니다.',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 },
    );
  }
}
