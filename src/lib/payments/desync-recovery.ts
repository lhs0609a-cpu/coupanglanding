/**
 * 결제 동기화 사고 자동 복구
 *
 * Pass A — 시스템에 success tx 가 있는데 monthly_report 가 paid 가 아닌 케이스
 *   webhook 누락/RPC 오류로 리포트가 못 따라온 경우. report 만 paid 마킹하면 끝.
 *
 * Pass B — 토스에선 결제 성공인데 우리 시스템이 임의로 failed 마킹한 케이스
 *   사고 패턴: payment-reconcile Section 3 / charge-now stale-pending 정리가
 *   토스 API 조회 없이 일방적으로 failed 처리. 사용자는 카드 결제됐는데 시스템엔 실패.
 *   대상 failure_code: RECONCILE_TTL_EXPIRED, STALE_PENDING, RECONCILE_NOT_FOUND
 *   → 토스에 toss_order_id 로 재조회. status='DONE' 이면 success 로 복구 + report paid + 락 해제.
 *
 * 안전:
 *   - 토스 환불 발생 안 함 (이미 결제 성공한 건만 시스템 동기화)
 *   - admin_override_level 셋된 사용자는 RPC 가드에 의해 락 보존
 *   - 다른 미납 리포트 / 미결 재시도 있으면 락 해제 안 됨
 *   - 토스 호출은 per-run limit (기본 50건) 으로 rate-limit 보호
 *
 * 멱등: 동일 효과만 반복. 이미 paid/success 면 skip.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logSettlementError } from './settlement-errors';
import { assertTossEnv } from './toss-client';
import { completeSettlement } from './complete-settlement';

const TOSS_PAYMENTS_BASE = 'https://api.tosspayments.com/v1/payments';

const TOSS_VERIFY_PER_RUN = 100;

export interface DesyncRecoveryResult {
  // Pass A
  scannedDesyncReports: number;
  fixedReports: { id: string; ptUserId: string; yearMonth: string; previousStatus: string }[];

  // Pass B
  scannedSuspectFailedTx: number;
  tossVerifiedDone: number;
  tossVerifiedNotDone: number;
  tossVerifyErrors: number;
  recoveredFailedTxs: { txId: string; ptUserId: string; orderId: string; tossStatus: string }[];

  // 공통
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
    scannedSuspectFailedTx: 0,
    tossVerifiedDone: 0,
    tossVerifiedNotDone: 0,
    tossVerifyErrors: 0,
    recoveredFailedTxs: [],
    affectedPtUsers: 0,
    locksCleared: 0,
    locksStillHeld: 0,
    errors: [],
  };

  const affectedPtUserIds = new Set<string>();

  // ─────────────────────────────────────────────────────────
  // Pass A: success tx 있는데 리포트 paid 아닌 케이스
  // ─────────────────────────────────────────────────────────
  await runPassA(serviceClient, result, affectedPtUserIds);

  // ─────────────────────────────────────────────────────────
  // Pass B: 토스 재검증 — 시스템이 잘못 failed 마킹한 tx 복구
  // ─────────────────────────────────────────────────────────
  try {
    await runPassB(serviceClient, result, affectedPtUserIds);
  } catch (envErr) {
    // 토스 env 미설정 등 — Pass A 결과는 유지
    result.errors.push({
      stage: 'toss_verify_env',
      message: envErr instanceof Error ? envErr.message : String(envErr),
    });
  }

  // ─────────────────────────────────────────────────────────
  // 공통: 영향받은 pt_user 락 해제 RPC 호출
  // ─────────────────────────────────────────────────────────
  result.affectedPtUsers = affectedPtUserIds.size;

  for (const ptUserId of affectedPtUserIds) {
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

async function runPassA(
  serviceClient: SupabaseClient,
  result: DesyncRecoveryResult,
  affectedPtUserIds: Set<string>,
): Promise<void> {
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
    return;
  }

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
  if (reportMap.size === 0) return;

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
    return;
  }

  result.fixedReports = Array.from(reportMap.values());
  for (const r of result.fixedReports) {
    affectedPtUserIds.add(r.ptUserId);
  }
}

async function runPassB(
  serviceClient: SupabaseClient,
  result: DesyncRecoveryResult,
  affectedPtUserIds: Set<string>,
): Promise<void> {
  const { secretKey: tossSecretKey } = assertTossEnv();
  const authHeader = 'Basic ' + Buffer.from(tossSecretKey + ':').toString('base64');

  // 적극 검사 대상 추출:
  //   "락 걸린 사용자(payment_lock_level > 0 OR payment_overdue_since IS NOT NULL OR admin_override_level > 0)"
  //   의 미납 monthly_report (fee_payment_status != 'paid') 에 속한 모든 failed/pending tx.
  //
  // 즉 락 걸린 사용자는 failure_code 무관하게 모든 의심 tx 를 토스로 재검증.
  // 이전 로직은 RECONCILE_TTL_EXPIRED 같은 특정 코드만 봐서 다른 코드로 잘못 마킹된 tx 를 놓쳤음.
  const { data: lockedUsers, error: lockErr } = await serviceClient
    .from('pt_users')
    .select('id')
    .or('payment_lock_level.gt.0,payment_overdue_since.not.is.null,admin_override_level.gt.0');

  if (lockErr) {
    result.errors.push({ stage: 'scan_locked_users', message: lockErr.message });
    return;
  }
  const lockedIds = (lockedUsers || []).map((u) => u.id);
  if (lockedIds.length === 0) {
    result.scannedSuspectFailedTx = 0;
    return;
  }

  // 락 걸린 사용자의 미납 monthly_report 추출
  const { data: unpaidReports } = await serviceClient
    .from('monthly_reports')
    .select('id')
    .in('pt_user_id', lockedIds)
    .neq('fee_payment_status', 'paid');

  const unpaidReportIds = (unpaidReports || []).map((r) => r.id);
  if (unpaidReportIds.length === 0) {
    result.scannedSuspectFailedTx = 0;
    return;
  }

  // 그 리포트들의 모든 의심 tx (failed/pending). 최신순.
  const { data: suspectTxs, error: scanErr } = await serviceClient
    .from('payment_transactions')
    .select('id, pt_user_id, monthly_report_id, toss_order_id, total_amount, failure_code, status, created_at')
    .in('monthly_report_id', unpaidReportIds)
    .in('status', ['failed', 'pending'])
    .not('toss_order_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(TOSS_VERIFY_PER_RUN);

  if (scanErr) {
    result.errors.push({ stage: 'scan_suspect_failed', message: scanErr.message });
    return;
  }

  result.scannedSuspectFailedTx = (suspectTxs || []).length;
  if (!suspectTxs || suspectTxs.length === 0) return;

  for (const tx of suspectTxs) {
    if (!tx.toss_order_id) continue;

    let tossData: Record<string, unknown> | null = null;
    let tossStatus: string | null = null;

    try {
      const res = await fetch(
        `${TOSS_PAYMENTS_BASE}/orders/${encodeURIComponent(tx.toss_order_id as string)}`,
        { headers: { Authorization: authHeader }, signal: AbortSignal.timeout(10_000) },
      );

      if (res.status === 404) {
        // 토스에도 정말 없음 — 우리 마킹이 맞았던 케이스. skip.
        result.tossVerifiedNotDone++;
        continue;
      }
      if (!res.ok) {
        result.tossVerifyErrors++;
        continue;
      }
      tossData = await res.json();
      tossStatus = (tossData?.status as string | undefined) ?? null;
    } catch (err) {
      result.tossVerifyErrors++;
      await logSettlementError(serviceClient, {
        stage: 'toss_verify_fetch',
        monthlyReportId: tx.monthly_report_id as string,
        ptUserId: tx.pt_user_id as string,
        error: err,
      });
      continue;
    }

    if (tossStatus !== 'DONE') {
      result.tossVerifiedNotDone++;
      continue;
    }

    // ★ 토스에선 DONE — 시스템 마킹이 잘못됨. success 로 복구.
    result.tossVerifiedDone++;

    // payment_mark_success 는 status IN (pending, failed) 일 때만 동작 — failed 도 가능. 적합.
    const { error: rpcErr } = await serviceClient.rpc('payment_mark_success', {
      p_tx_id: tx.id,
      p_payment_key: (tossData?.paymentKey as string | undefined) ?? null,
      p_receipt_url: ((tossData?.receipt as { url?: string } | undefined)?.url) ?? null,
      p_raw: tossData,
      p_approved_at: (tossData?.approvedAt as string | undefined) ?? new Date().toISOString(),
    });

    if (rpcErr) {
      await logSettlementError(serviceClient, {
        stage: 'toss_verify_mark_success_rpc',
        monthlyReportId: tx.monthly_report_id as string,
        ptUserId: tx.pt_user_id as string,
        error: rpcErr,
      });
      result.errors.push({ stage: 'toss_verify_mark_success', message: rpcErr.message });
      continue;
    }

    // 정산 후처리
    const { data: fullReport } = await serviceClient
      .from('monthly_reports')
      .select('*')
      .eq('id', tx.monthly_report_id as string)
      .single();

    if (fullReport) {
      try {
        await completeSettlement(serviceClient, fullReport);
      } catch (settleErr) {
        await logSettlementError(serviceClient, {
          stage: 'toss_verify_complete_settlement',
          monthlyReportId: tx.monthly_report_id as string,
          ptUserId: tx.pt_user_id as string,
          error: settleErr,
        });
      }
    }

    affectedPtUserIds.add(tx.pt_user_id as string);
    result.recoveredFailedTxs.push({
      txId: tx.id as string,
      ptUserId: tx.pt_user_id as string,
      orderId: tx.toss_order_id as string,
      tossStatus,
    });
  }
}
