import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MyLayoutClient from './layout-client';
import { getReportTargetMonth, getSettlementDDay, getSettlementStatus, isEligibleForMonth } from '@/lib/utils/settlement';
import type { PtUser, MonthlyReport } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '내 PT | 쿠팡 메가로드',
};

export default async function MyLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  // getSession()은 JWT 로컬 디코딩 (네트워크 요청 없음, getUser() 대비 수백ms 절약)
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect('/auth/login?redirect=/my/dashboard');
  }

  const user = session.user;

  // 1단계: profile + ptUser 병렬 조회
  const [{ data: profile }, { data: ptUser }] = await Promise.all([
    supabase.from('profiles').select('full_name, role').eq('id', user.id).single(),
    supabase.from('pt_users').select('id, created_at, coupang_api_connected, coupang_vendor_id, payment_lock_level, payment_overdue_since, admin_override_level, payment_lock_exempt_until, is_test_account').eq('profile_id', user.id).maybeSingle(),
  ]);

  // 트레이너 여부 확인 + 정산 D-Day 뱃지 데이터
  let isTrainer = false;
  let settlementBadge: { dday: number; reportStatus: 'not_eligible' | 'pending' | 'submitted' | 'completed' | 'overdue'; eligible: boolean } | undefined;
  let feePaymentBadge: { status: string; deadline: string | null; unpaidAmount: number; yearMonth: string } | undefined;

  let hasPaymentCards = false;

  if (ptUser) {
    // fire-and-forget: 마지막 활동 시간 업데이트
    supabase.from('pt_users').update({ last_active_at: new Date().toISOString() }).eq('id', (ptUser as { id: string }).id).then();

    // select 가 일부 필드만 가져오므로 PtUser 전체 구조와 불일치 — unknown 경유 cast.
    // 실제 사용 필드(id, created_at) 는 27행 select 에 포함돼 있어 런타임 안전.
    const ptUserData = ptUser as unknown as PtUser;
    const targetMonth = getReportTargetMonth();
    const dday = getSettlementDDay(targetMonth);
    const eligible = isEligibleForMonth(ptUserData.created_at, targetMonth);

    // 2단계: reportData + trainer 병렬 조회
    const [{ data: reportData }, { data: trainer }] = await Promise.all([
      supabase.from('monthly_reports').select('payment_status, fee_payment_status, fee_payment_deadline, total_with_vat').eq('pt_user_id', ptUserData.id).eq('year_month', targetMonth).maybeSingle(),
      supabase.from('trainers').select('id').eq('pt_user_id', ptUserData.id).eq('status', 'approved').maybeSingle(),
    ]);

    // billing_cards는 마이그레이션 미적용 시에도 안전하게 처리
    try {
      const { data: cards } = await supabase.from('billing_cards').select('id').eq('pt_user_id', ptUserData.id).eq('is_active', true).limit(1);
      hasPaymentCards = (cards || []).length > 0;
    } catch {
      hasPaymentCards = false;
    }

    const reportStatus = getSettlementStatus(
      ptUserData.created_at,
      (reportData as MonthlyReport | null)?.payment_status || null,
      targetMonth,
    );

    settlementBadge = { dday, reportStatus, eligible };

    // 수수료 납부 뱃지 데이터
    const reportRow = reportData as Record<string, unknown> | null;
    const feeStatus = (reportRow?.fee_payment_status as string) || 'not_applicable';
    if (feeStatus !== 'not_applicable' && feeStatus !== 'paid') {
      feePaymentBadge = {
        status: feeStatus,
        deadline: (reportRow?.fee_payment_deadline as string) || null,
        unpaidAmount: (reportRow?.total_with_vat as number) || 0,
        yearMonth: targetMonth,
      };
    }

    isTrainer = !!trainer;
  }

  const ptUserRow = ptUser as Record<string, unknown> | null;
  const isTestAccount = !!ptUserRow?.is_test_account;
  // 연동 판정: connected 플래그 우선, 플래그가 false 라도 vendor_id 가 세팅돼
  // 있으면 이미 연동 완료로 간주 (router.refresh 타이밍 이슈로 플래그 갱신이
  // 지연되는 경우 방어). 테스트 계정은 배너 표시 자체를 막기 위해 connected=true.
  const hasVendorId = !!ptUserRow?.coupang_vendor_id;
  const coupangApiConnected =
    isTestAccount || !!ptUserRow?.coupang_api_connected || hasVendorId;

  // Lock 정보 — admin_override_level 우선. 테스트 계정이면 전부 정상(0)으로 리턴
  const rawLevel = (ptUserRow?.admin_override_level as number | null) ?? (ptUserRow?.payment_lock_level as number | null) ?? 0;
  const paymentLock = ptUserRow && !isTestAccount ? {
    lockLevel: Math.max(0, Math.min(3, rawLevel)) as 0 | 1 | 2 | 3,
    overdueSince: (ptUserRow.payment_overdue_since as string | null) ?? null,
    hasCard: hasPaymentCards,
    exemptUntil: (ptUserRow.payment_lock_exempt_until as string | null) ?? null,
  } : undefined;

  // 테스트 계정 → 수수료 뱃지도 숨김 (결제 팝업 억제)
  if (isTestAccount) {
    feePaymentBadge = undefined;
  }

  return (
    <MyLayoutClient
      userName={profile?.full_name || user.email || '사용자'}
      userRole={profile?.role || 'pt_user'}
      isTrainer={isTrainer}
      settlementBadge={settlementBadge}
      feePaymentBadge={feePaymentBadge}
      coupangApiConnected={coupangApiConnected}
      hasPaymentCards={hasPaymentCards}
      paymentLock={paymentLock}
    >
      {children}
    </MyLayoutClient>
  );
}
