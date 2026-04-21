import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MegaloadLayoutClient from './layout-client';
import { getSettlementGateLevel, getReportTargetMonth } from '@/lib/utils/settlement';
import type { SettlementGateLevel, PaymentStatus } from '@/lib/utils/settlement';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Megaload | 멀티채널 자동화',
};

export default async function MegaloadLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  // getSession()은 JWT 로컬 디코딩 (네트워크 요청 없음)
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect('/auth/login?redirect=/megaload/dashboard');
  }

  const user = session.user;

  // profile + shUser + ptUser 병렬 조회
  const [{ data: profile }, { data: shUser }, { data: ptUser }] = await Promise.all([
    supabase.from('profiles').select('full_name, role, is_active').eq('id', user.id).single(),
    supabase.from('megaload_users').select('id, plan, onboarding_done').eq('profile_id', user.id).maybeSingle(),
    supabase.from('pt_users').select('id, created_at, payment_lock_level, payment_overdue_since, admin_override_level, payment_lock_exempt_until, is_test_account').eq('profile_id', user.id).maybeSingle(),
  ]);

  // 카드 유무
  let hasPaymentCards = false;
  if (ptUser) {
    try {
      const { data: cards } = await supabase.from('billing_cards').select('id').eq('pt_user_id', ptUser.id).eq('is_active', true).limit(1);
      hasPaymentCards = (cards || []).length > 0;
    } catch { hasPaymentCards = false; }
  }

  // 테스트 계정 체크 — 모든 결제 관련 처리 bypass
  const isTestAccount = !!(ptUser as Record<string, unknown> | null)?.is_test_account;

  // 결제 락 3단계(완전 차단) → 결제 설정 페이지로 강제 이동
  // admin/partner 면제 · 테스트 계정 면제. /my/settings는 별도 레이아웃.
  if (
    profile?.role !== 'admin' &&
    profile?.role !== 'partner' &&
    !isTestAccount &&
    ptUser?.payment_lock_level === 3
  ) {
    redirect('/my/settings?locked=3');
  }

  const role = profile?.role;

  // admin/partner → 접근 제어 바이패스
  if (role !== 'admin' && role !== 'partner') {
    // 비활성 계정 → 승인 대기 페이지
    if (!profile?.is_active) {
      redirect('/auth/pending');
    }
    // PT 미등록 → 대시보드로
    if (!ptUser) {
      redirect('/my/dashboard');
    }
  }

  if (!shUser) {
    await supabase.from('megaload_users').insert({
      profile_id: user.id,
      plan: 'free',
      onboarding_done: false,
    });
  }

  // 정산 게이트 산출 (admin/partner 바이패스)
  let gateLevel: SettlementGateLevel = 'none';
  let gateDDay = 0;
  let gateTargetMonth = '';
  let gateDeadline = '';

  if (role !== 'admin' && role !== 'partner' && ptUser) {
    const targetMonth = getReportTargetMonth();
    const { data: report } = await supabase
      .from('monthly_reports')
      .select('payment_status')
      .eq('pt_user_id', ptUser.id)
      .eq('year_month', targetMonth)
      .maybeSingle();

    const gateInfo = getSettlementGateLevel(
      ptUser.created_at,
      (report?.payment_status as PaymentStatus) ?? null,
    );
    gateLevel = gateInfo.level;
    gateDDay = gateInfo.dday;
    gateTargetMonth = gateInfo.targetMonth;
    gateDeadline = gateInfo.deadlineFormatted;
  }

  // 뱃지/채널 데이터는 클라이언트에서 비동기 로드 → 페이지 렌더링 차단 안 함
  return (
    <MegaloadLayoutClient
      userName={profile?.full_name || user.email || '사용자'}
      userRole={profile?.role || 'pt_user'}
      gateLevel={gateLevel}
      gateDDay={gateDDay}
      gateTargetMonth={gateTargetMonth}
      gateDeadline={gateDeadline}
      paymentLockLevel={isTestAccount ? 0 : (ptUser?.payment_lock_level ?? 0)}
      paymentOverdueSince={isTestAccount ? null : (ptUser?.payment_overdue_since ?? null)}
      adminOverrideLevel={isTestAccount ? null : ((ptUser as Record<string, unknown> | null)?.admin_override_level as number | null ?? null)}
      paymentLockExemptUntil={(ptUser as Record<string, unknown> | null)?.payment_lock_exempt_until as string | null ?? null}
      hasPaymentCards={isTestAccount ? true : hasPaymentCards}
    >
      {children}
    </MegaloadLayoutClient>
  );
}
