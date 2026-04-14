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
    supabase.from('pt_users').select('id, created_at, coupang_api_connected').eq('profile_id', user.id).maybeSingle(),
  ]);

  // 트레이너 여부 확인 + 정산 D-Day 뱃지 데이터
  let isTrainer = false;
  let settlementBadge: { dday: number; reportStatus: 'not_eligible' | 'pending' | 'submitted' | 'completed' | 'overdue'; eligible: boolean } | undefined;
  let feePaymentBadge: { status: string; deadline: string | null; unpaidAmount: number; yearMonth: string } | undefined;

  let hasPaymentCards = false;

  if (ptUser) {
    // fire-and-forget: 마지막 활동 시간 업데이트
    supabase.from('pt_users').update({ last_active_at: new Date().toISOString() }).eq('id', (ptUser as { id: string }).id).then();

    const ptUserData = ptUser as PtUser;
    const targetMonth = getReportTargetMonth();
    const dday = getSettlementDDay(targetMonth);
    const eligible = isEligibleForMonth(ptUserData.created_at, targetMonth);

    // 2단계: reportData + trainer + 카드 병렬 조회
    const [{ data: reportData }, { data: trainer }, { data: cards }] = await Promise.all([
      supabase.from('monthly_reports').select('payment_status, fee_payment_status, fee_payment_deadline, total_with_vat').eq('pt_user_id', ptUserData.id).eq('year_month', targetMonth).maybeSingle(),
      supabase.from('trainers').select('id').eq('pt_user_id', ptUserData.id).eq('status', 'approved').maybeSingle(),
      supabase.from('billing_cards').select('id').eq('pt_user_id', ptUserData.id).eq('is_active', true).limit(1),
    ]);

    hasPaymentCards = (cards || []).length > 0;

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

  const coupangApiConnected = !!(ptUser as Record<string, unknown> | null)?.coupang_api_connected;

  return (
    <MyLayoutClient
      userName={profile?.full_name || user.email || '사용자'}
      userRole={profile?.role || 'pt_user'}
      isTrainer={isTrainer}
      settlementBadge={settlementBadge}
      feePaymentBadge={feePaymentBadge}
      coupangApiConnected={coupangApiConnected}
      hasPaymentCards={hasPaymentCards}
    >
      {children}
    </MyLayoutClient>
  );
}
