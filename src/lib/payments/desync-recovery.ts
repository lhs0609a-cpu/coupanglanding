/**
 * 결제 동기화 사고 자동 복구
 *
 * 시나리오:
 *   사용자가 토스 카드결제로 실제 결제 → payment_transactions.status='success'
 *   그런데 webhook 누락/RPC 오류로 monthly_reports 가 paid 로 못 바뀜
 *   → 사용자에게 결제 락이 걸려 화면에 강제 모달 표시
 *
 * 자동 복구:
 *   1) status='success' tx 가 있는 monthly_report 중 fee_payment_status 가 paid 가 아닌 것 추출
 *   2) 해당 리포트들 모두 paid 로 강제 마킹 (settlement_completed_at 도 세팅)
 *   3) 영향받은 pt_user_id 별로 payment_clear_overdue_if_settled RPC 호출 → 락 해제
 *
 * 안전:
 *   - 토스 환불 발생 안 함 (이미 결제 성공했으므로)
 *   - admin_override_level set 된 사용자는 RPC 가드에 의해 락 보존
 *   - 다른 미납 리포트 / 미결 재시도 있으면 락 해제 안 됨 (정상 동작)
 *
 * 멱등: 동일 효과만 반복. 이미 paid 면 skip.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logSettlementError } from './settlement-errors';

export interface DesyncRecoveryResult {
  scannedDesyncReports: number;
  fixedReports: { id: string; ptUserId: string; yearMonth: string; previousStatus: string }[];
  affectedPtUsers: number;
  locksCleared: number;
  locksStillHeld: number;
  errors: { stage: string; message: string }[];
}

export async function runDesyncRecovery(
  serviceClient: SupabaseClient,
): Promise<DesyncRecoveryResult> {
  const result: DesyncRecoveryResult = {
    scannedDesyncReports: 0,
    fixedReports: [],
    affectedPtUsers: 0,
    locksCleared: 0,
    locksStillHeld: 0,
    errors: [],
  };

  // 1) success tx 가 있는데 리포트가 paid 아닌 케이스 검출
  //    - payment_transactions 와 monthly_reports 를 join 해서 desync 추출
  //    - DISTINCT 로 같은 리포트에 여러 success tx 있어도 1번만 처리
  const { data: desyncRows, error: scanErr } = await serviceClient
    .from('payment_transactions')
    .select(`
      id,
      monthly_report_id,
      pt_user_id,
      monthly_reports!inner(id, year_month, fee_payment_status, pt_user_id)
    `)
    .eq('status', 'success')
    .in('monthly_reports.fee_payment_status', ['awaiting_payment', 'overdue', 'suspended'])
    .limit(1000);

  if (scanErr) {
    result.errors.push({ stage: 'scan_desync', message: scanErr.message });
    return result;
  }

  // monthly_report 단위로 dedupe
  const reportMap = new Map<string, { id: string; ptUserId: string; yearMonth: string; previousStatus: string }>();
  for (const row of (desyncRows || []) as Array<{
    monthly_report_id: string;
    pt_user_id: string;
    monthly_reports: { id: string; year_month: string; fee_payment_status: string } | { id: string; year_month: string; fee_payment_status: string }[];
  }>) {
    const mr = Array.isArray(row.monthly_reports) ? row.monthly_reports[0] : row.monthly_reports;
    if (!mr) continue;
    if (!reportMap.has(mr.id)) {
      reportMap.set(mr.id, {
        id: mr.id,
        ptUserId: row.pt_user_id,
        yearMonth: mr.year_month,
        previousStatus: mr.fee_payment_status,
      });
    }
  }

  result.scannedDesyncReports = reportMap.size;
  if (reportMap.size === 0) return result;

  // 2) 일괄 paid 마킹
  const reportIds = Array.from(reportMap.keys());
  const nowIso = new Date().toISOString();

  const { error: updErr } = await serviceClient
    .from('monthly_reports')
    .update({
      fee_payment_status: 'paid',
      fee_paid_at: nowIso,
      fee_confirmed_at: nowIso,
      payment_status: 'confirmed',
      payment_confirmed_at: nowIso,
      admin_note: '[auto-desync-recovery] success tx 매칭 — 자동 paid 마킹',
    })
    .in('id', reportIds);

  if (updErr) {
    await logSettlementError(serviceClient, {
      stage: 'desync_recovery_bulk_update',
      error: updErr,
    });
    result.errors.push({ stage: 'bulk_update', message: updErr.message });
    return result;
  }

  result.fixedReports = Array.from(reportMap.values());

  // 3) 영향받은 pt_user 별로 락 해제 RPC 호출
  const ptUserIds = Array.from(new Set(Array.from(reportMap.values()).map(r => r.ptUserId)));
  result.affectedPtUsers = ptUserIds.length;

  for (const ptUserId of ptUserIds) {
    const { data: cleared, error: clearErr } = await serviceClient.rpc(
      'payment_clear_overdue_if_settled',
      { p_pt_user_id: ptUserId },
    );
    if (clearErr) {
      await logSettlementError(serviceClient, {
        stage: 'desync_recovery_clear_overdue_rpc',
        ptUserId,
        error: clearErr,
      });
      result.errors.push({ stage: 'clear_overdue', message: clearErr.message });
      continue;
    }
    if (cleared === true) result.locksCleared++;
    else result.locksStillHeld++;
  }

  return result;
}
