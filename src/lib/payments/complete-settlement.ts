/**
 * 카드 결제 성공 후 정산 자동 확정 로직
 * - payment_status → confirmed
 * - revenue_entries 생성
 * - 세금계산서 자동 발행
 * - 트레이너 보너스 생성
 * - 프로그램 접근 복구
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getReportCosts } from '@/lib/calculations/deposit';
import { calculateTrainerBonus } from '@/lib/calculations/trainer';
import { notifyTrainerBonusEarned } from '@/lib/utils/notifications';

interface SettlementReport {
  id: string;
  pt_user_id: string;
  year_month: string;
  reported_revenue: number;
  calculated_deposit: number;
  admin_deposit_amount: number | null;
  supply_amount: number;
  vat_amount: number;
  total_with_vat: number;
  cost_product: number;
  cost_commission: number;
  cost_advertising: number;
  cost_returns: number;
  cost_shipping: number;
  cost_tax: number;
}

/**
 * 결제 성공 후 정산 자동 확정
 * 관리자의 수동 확인 없이 모든 후처리를 수행한다.
 */
export async function completeSettlement(
  serviceClient: SupabaseClient,
  report: SettlementReport,
) {
  const now = new Date().toISOString();
  const depositAmount = report.admin_deposit_amount || report.calculated_deposit;

  // 1. 리포트 → confirmed
  await serviceClient
    .from('monthly_reports')
    .update({
      payment_status: 'confirmed',
      payment_confirmed_at: now,
      fee_payment_status: 'paid',
      fee_confirmed_at: now,
      fee_paid_at: now,
    })
    .eq('id', report.id);

  // 2. 프로그램 접근 복구
  await serviceClient
    .from('pt_users')
    .update({ program_access_active: true })
    .eq('id', report.pt_user_id);

  // 3. 사용자명 조회
  const { data: ptUser } = await serviceClient
    .from('pt_users')
    .select('profile_id, profile:profiles(full_name)')
    .eq('id', report.pt_user_id)
    .single();

  const userName = (ptUser?.profile as { full_name: string } | null)?.full_name || '이름없음';

  // 4. revenue_entries 생성 (중복 방지)
  const { data: existingRevenue } = await serviceClient
    .from('revenue_entries')
    .select('id')
    .eq('year_month', report.year_month)
    .ilike('description', `PT:${report.pt_user_id}%`)
    .maybeSingle();

  if (!existingRevenue) {
    await serviceClient.from('revenue_entries').insert({
      year_month: report.year_month,
      source: 'pt',
      description: `PT:${report.pt_user_id}:${userName}`,
      amount: depositAmount,
      main_partner_id: null,
    });
  }

  // 5. 트레이너 보너스 생성
  const { data: traineeLink } = await serviceClient
    .from('trainer_trainees')
    .select('trainer_id, trainer:trainers(*, pt_user:pt_users(profile_id))')
    .eq('trainee_pt_user_id', report.pt_user_id)
    .eq('is_active', true)
    .maybeSingle();

  if (traineeLink) {
    const trainer = (traineeLink as unknown as {
      trainer_id: string;
      trainer: {
        id: string;
        status: string;
        bonus_percentage: number;
        total_earnings: number;
        pt_user: { profile_id: string };
      };
    }).trainer;

    if (trainer && trainer.status === 'approved') {
      const reportCosts = getReportCosts(report);
      const { netProfit: trainerNetProfit, bonusAmount } = calculateTrainerBonus(
        report.reported_revenue,
        reportCosts,
        trainer.bonus_percentage,
      );

      if (bonusAmount > 0) {
        const { data: existingEarning } = await serviceClient
          .from('trainer_earnings')
          .select('id')
          .eq('monthly_report_id', report.id)
          .maybeSingle();

        if (!existingEarning) {
          await serviceClient.from('trainer_earnings').insert({
            trainer_id: trainer.id,
            trainee_pt_user_id: report.pt_user_id,
            monthly_report_id: report.id,
            year_month: report.year_month,
            trainee_net_profit: trainerNetProfit,
            bonus_percentage: trainer.bonus_percentage,
            bonus_amount: bonusAmount,
            payment_status: 'pending',
          });

          await serviceClient
            .from('trainers')
            .update({ total_earnings: (trainer.total_earnings || 0) + bonusAmount })
            .eq('id', trainer.id);

          if (trainer.pt_user?.profile_id) {
            await notifyTrainerBonusEarned(
              serviceClient,
              trainer.pt_user.profile_id,
              userName,
              report.year_month,
              bonusAmount,
            );
          }
        }
      }
    }
  }

  // 6. 세금계산서 자동 발행
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    await fetch(`${baseUrl}/api/tax-invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monthly_report_id: report.id,
        pt_user_id: report.pt_user_id,
        year_month: report.year_month,
        supply_amount: report.supply_amount || 0,
        vat_amount: report.vat_amount || 0,
        total_amount: report.total_with_vat || 0,
      }),
    });
  } catch {
    // 세금계산서 실패해도 정산 확정은 유지
  }
}
