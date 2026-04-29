/**
 * 카드 결제 성공 후 정산 자동 확정 로직
 * - revenue_entries 생성
 * - 세금계산서 자동 발행
 * - 트레이너 보너스 생성
 * - 프로그램 접근 복구
 *
 * 멱등성: monthly_reports.settlement_completed_at 가 NULL 일 때만 후처리 실행.
 *   payment_mark_success RPC 가 이미 payment_status='confirmed' 로 마킹하므로 그 컬럼은
 *   가드로 쓸 수 없다 (모든 후처리 호출이 0건 매칭으로 skip 되던 버그).
 *   각 단계도 자체 idempotency guard (revenue_entries source_ref UNIQUE,
 *   trainer_earnings monthly_report_id UNIQUE, tax_invoices 멱등 체크)를 가짐.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getReportCosts } from '@/lib/calculations/deposit';
import { calculateTrainerBonus } from '@/lib/calculations/trainer';
import { notifyTrainerBonusEarned } from '@/lib/utils/notifications';
import { logSettlementError } from './settlement-errors';

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

export async function completeSettlement(
  serviceClient: SupabaseClient,
  report: SettlementReport,
) {
  // 1. 멱등 가드 — 이미 후처리 완료된 리포트면 즉시 반환
  const { data: gateCheck } = await serviceClient
    .from('monthly_reports')
    .select('settlement_completed_at')
    .eq('id', report.id)
    .maybeSingle();

  if (gateCheck?.settlement_completed_at) {
    return;
  }

  const depositAmount = report.admin_deposit_amount || report.calculated_deposit;

  // 2. 프로그램 접근 복구 (idempotent)
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

  const userName = (ptUser?.profile as unknown as { full_name: string } | null)?.full_name || '이름없음';

  // 4. revenue_entries 생성 — source_ref=monthly_report_id 기준 UNIQUE 로 중복 방지
  const { data: existingRevenue } = await serviceClient
    .from('revenue_entries')
    .select('id')
    .eq('source', 'pt')
    .eq('source_ref', report.id)
    .maybeSingle();

  if (!existingRevenue) {
    const { error: revErr } = await serviceClient.from('revenue_entries').insert({
      year_month: report.year_month,
      source: 'pt',
      source_ref: report.id,
      description: `PT:${report.pt_user_id}:${userName}`,
      amount: depositAmount,
      main_partner_id: null,
    });
    if (revErr) {
      // UNIQUE 충돌(동시 호출)은 정상 — 다른 호출이 먼저 처리. 그 외만 로깅.
      if (revErr.code !== '23505') {
        await logSettlementError(serviceClient, {
          stage: 'revenue_entries_insert',
          monthlyReportId: report.id,
          ptUserId: report.pt_user_id,
          error: revErr,
        });
      }
    }
  }

  // 5. 트레이너 보너스 생성 (trainer_earnings.monthly_report_id UNIQUE 로 중복 방지)
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
          const { error: earningErr } = await serviceClient.from('trainer_earnings').insert({
            trainer_id: trainer.id,
            trainee_pt_user_id: report.pt_user_id,
            monthly_report_id: report.id,
            year_month: report.year_month,
            trainee_net_profit: trainerNetProfit,
            bonus_percentage: trainer.bonus_percentage,
            bonus_amount: bonusAmount,
            payment_status: 'pending',
          });

          if (!earningErr) {
            // total_earnings 는 atomic increment 로 race-free 보장
            await serviceClient.rpc('trainer_increment_total_earnings', {
              p_trainer_id: trainer.id,
              p_delta: bonusAmount,
            });

            if (trainer.pt_user?.profile_id) {
              await notifyTrainerBonusEarned(
                serviceClient,
                trainer.pt_user.profile_id,
                userName,
                report.year_month,
                bonusAmount,
              );
            }
          } else if (earningErr.code !== '23505') {
            await logSettlementError(serviceClient, {
              stage: 'trainer_earnings_insert',
              monthlyReportId: report.id,
              ptUserId: report.pt_user_id,
              error: earningErr,
            });
          }
        }
      }
    }
  }

  // 6. 세금계산서 자동 발행 — tax_invoices API 가 자체 멱등 체크 보유 (중복 호출 시 400)
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const invoiceRes = await fetch(`${baseUrl}/api/tax-invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.INTERNAL_API_SECRET
          ? { 'x-internal-secret': process.env.INTERNAL_API_SECRET }
          : {}),
      },
      body: JSON.stringify({
        monthly_report_id: report.id,
        pt_user_id: report.pt_user_id,
        year_month: report.year_month,
        supply_amount: report.supply_amount || 0,
        vat_amount: report.vat_amount || 0,
        total_amount: report.total_with_vat || 0,
      }),
    });

    if (!invoiceRes.ok && invoiceRes.status !== 400) {
      // 400 은 "이미 발행됨" 멱등 응답이므로 정상.
      const errBody = await invoiceRes.text().catch(() => '');
      await logSettlementError(serviceClient, {
        stage: 'tax_invoice_fetch',
        monthlyReportId: report.id,
        ptUserId: report.pt_user_id,
        error: { code: `HTTP_${invoiceRes.status}`, message: errBody.slice(0, 500) },
        detail: { baseUrl, status: invoiceRes.status },
      });
    }
  } catch (err) {
    await logSettlementError(serviceClient, {
      stage: 'tax_invoice_fetch',
      monthlyReportId: report.id,
      ptUserId: report.pt_user_id,
      error: err,
    });
  }

  // 7. 후처리 완료 마킹 — 다음 호출은 1번 가드에서 즉시 return.
  //    부분 실패한 경우에도 마킹하여 재실행으로 인한 중복 부작용을 차단(로그는 settlement_errors 에 남음).
  await serviceClient
    .from('monthly_reports')
    .update({ settlement_completed_at: new Date().toISOString() })
    .eq('id', report.id)
    .is('settlement_completed_at', null);
}
