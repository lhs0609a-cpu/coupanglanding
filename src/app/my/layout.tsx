import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MyLayoutClient from './layout-client';
import { getReportTargetMonth, getSettlementDDay, getSettlementStatus, isEligibleForMonth } from '@/lib/utils/settlement';
import type { PtUser, MonthlyReport } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '내 PT | 쿠팡 셀러허브',
};

export default async function MyLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?redirect=/my/dashboard');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  // 트레이너 여부 확인 + 정산 D-Day 뱃지 데이터
  let isTrainer = false;
  let settlementBadge: { dday: number; reportStatus: 'not_eligible' | 'pending' | 'submitted' | 'completed' | 'overdue'; eligible: boolean } | undefined;
  let feePaymentBadge: { status: string; deadline: string | null; unpaidAmount: number; yearMonth: string } | undefined;

  const { data: ptUser } = await supabase
    .from('pt_users')
    .select('id, created_at, coupang_api_connected')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (ptUser) {
    // fire-and-forget: 마지막 활동 시간 업데이트
    supabase.from('pt_users').update({ last_active_at: new Date().toISOString() }).eq('id', (ptUser as { id: string }).id).then();

    const ptUserData = ptUser as PtUser;
    const targetMonth = getReportTargetMonth();
    const dday = getSettlementDDay(targetMonth);
    const eligible = isEligibleForMonth(ptUserData.created_at, targetMonth);

    // 현재 보고 대상월 리포트 조회
    const { data: reportData } = await supabase
      .from('monthly_reports')
      .select('payment_status, fee_payment_status, fee_payment_deadline, total_with_vat')
      .eq('pt_user_id', ptUserData.id)
      .eq('year_month', targetMonth)
      .maybeSingle();

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

    const { data: trainer } = await supabase
      .from('trainers')
      .select('id')
      .eq('pt_user_id', ptUserData.id)
      .eq('status', 'approved')
      .maybeSingle();

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
    >
      {children}
    </MyLayoutClient>
  );
}
