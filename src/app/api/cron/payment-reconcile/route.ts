import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { completeSettlement } from '@/lib/payments/complete-settlement';
import { logSettlementError } from '@/lib/payments/settlement-errors';
import { assertTossEnv } from '@/lib/payments/toss-client';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


/**
 * GET /api/cron/payment-reconcile
 *
 * 결제 API 응답 유실/웹훅 누락에 대비한 보조 동기화:
 *   1) status='pending' 이고 30분 이상 된 tx 를 토스에 직접 조회 → 실제 상태로 확정.
 *   2) payment_retry_in_progress=true 인데 활성 retry(next_retry_at IS NOT NULL AND is_final_failure=false)
 *      가 하나도 없는 pt_user 는 플래그 해제 (좀비 상태 복구).
 *   3) TTL: status='pending' 이고 STALE_TTL_HOURS(=24h) 넘은 tx 는 'failed' 로 강제 종결.
 *      토스 API 장애로 조회조차 실패한 좀비 pending 이 영구 잔존하는 걸 막는다.
 *
 * 빈도: 1시간마다.
 */

const STALE_TTL_HOURS = 24;
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { secretKey: tossSecretKey } = assertTossEnv();
    const serviceClient = await createServiceClient();

    // ── 1) stale pending tx 동기화 ──────────────────────
    // 30분+ pending 인 tx 를 토스에 직접 조회 → DONE 이면 즉시 success.
    // 가장 오래된 것부터 fairness — 한도 100 (이전 50 → 더 빨리 stuck 해결).
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stalePending } = await serviceClient
      .from('payment_transactions')
      .select('id, pt_user_id, monthly_report_id, toss_order_id, total_amount')
      .eq('status', 'pending')
      .lte('created_at', staleThreshold)
      .order('created_at', { ascending: true })
      .limit(100);

    let reconciled = 0;
    let reconcileFailed = 0;

    for (const tx of stalePending || []) {
      try {
        const res = await fetch(
          `https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(tx.toss_order_id)}`,
          {
            headers: {
              Authorization:
                'Basic ' + Buffer.from(tossSecretKey + ':').toString('base64'),
            },
          },
        );

        if (res.status === 404) {
          // 토스에도 없음 → 시도조차 안 됐을 가능성. 실패로 확정.
          await serviceClient
            .from('payment_transactions')
            .update({
              status: 'failed',
              failure_code: 'RECONCILE_NOT_FOUND',
              failure_message: '토스에 해당 주문이 없음 (API 호출 실패 추정)',
              failed_at: new Date().toISOString(),
            })
            .eq('id', tx.id);
          reconciled++;
          continue;
        }

        if (!res.ok) {
          reconcileFailed++;
          continue;
        }

        const data = await res.json();
        const status = data.status as string | undefined;

        if (status === 'DONE') {
          const { error: rpcErr } = await serviceClient.rpc('payment_mark_success', {
            p_tx_id: tx.id,
            p_payment_key: data.paymentKey,
            p_receipt_url: data.receipt?.url ?? null,
            p_raw: data,
            p_approved_at: data.approvedAt,
          });

          if (rpcErr) {
            await logSettlementError(serviceClient, {
              stage: 'reconcile_mark_success',
              monthlyReportId: tx.monthly_report_id,
              ptUserId: tx.pt_user_id,
              error: rpcErr,
            });
            reconcileFailed++;
            continue;
          }

          const { data: fullReport } = await serviceClient
            .from('monthly_reports')
            .select('*')
            .eq('id', tx.monthly_report_id)
            .single();

          if (fullReport) {
            try {
              await completeSettlement(serviceClient, fullReport);
            } catch (settleErr) {
              await logSettlementError(serviceClient, {
                stage: 'reconcile_complete_settlement',
                monthlyReportId: tx.monthly_report_id,
                ptUserId: tx.pt_user_id,
                error: settleErr,
              });
            }
          }

          await serviceClient.rpc('payment_clear_overdue_if_settled', {
            p_pt_user_id: tx.pt_user_id,
          });
          reconciled++;
        } else if (status === 'CANCELED' || status === 'ABORTED' || status === 'EXPIRED') {
          await serviceClient
            .from('payment_transactions')
            .update({
              status: 'failed',
              failure_code: `RECONCILE_${status}`,
              failure_message: `토스 조회: ${status}`,
              raw_response: data,
              failed_at: new Date().toISOString(),
            })
            .eq('id', tx.id);
          reconciled++;
        }
        // READY/WAITING_FOR_DEPOSIT 등은 다음 실행에서 다시 체크
      } catch (err) {
        reconcileFailed++;
        await logSettlementError(serviceClient, {
          stage: 'reconcile_fetch_toss',
          monthlyReportId: tx.monthly_report_id,
          ptUserId: tx.pt_user_id,
          error: err,
        });
      }
    }

    // ── 2) 좀비 retry_in_progress 플래그 해제 ──────────────
    const { data: possibleZombies } = await serviceClient
      .from('pt_users')
      .select('id')
      .eq('payment_retry_in_progress', true);

    let flagsCleared = 0;
    for (const u of possibleZombies || []) {
      const { data: active } = await serviceClient
        .from('payment_transactions')
        .select('id')
        .eq('pt_user_id', u.id)
        .eq('status', 'failed')
        .eq('is_final_failure', false)
        .not('next_retry_at', 'is', null)
        .limit(1);

      if (!active || active.length === 0) {
        await serviceClient
          .from('pt_users')
          .update({ payment_retry_in_progress: false })
          .eq('id', u.id);
        flagsCleared++;
      }
    }

    // ── 3) TTL 만료 좀비 pending — 토스 명시적 응답 기반 분기 처리 ─────────────────
    //
    // 핵심 사고 패턴 (2026-05 한정욱/이지영/나인호/박영호):
    //   토스에서는 결제 DONE + 정산 진행 중인데 우리 시스템엔 "RECONCILE_TTL_EXPIRED" 로
    //   강제 final_failure 마킹됨. 원인: 이전 코드가 토스 응답을 명시적으로 분기 안 하고
    //   "DONE 아니면 무조건 failed" 처리. READY/WAITING/네트워크에러도 final failure 로 묶여
    //   복구 cron 이 마지막까지 시도해도 사용자 결제 사실을 시스템이 못 따라잡음.
    //
    // 수정된 분기:
    //   DONE                              → success 복구
    //   CANCELED/ABORTED/EXPIRED          → final failure (토스 명시적 미결제)
    //   404 (Toss 에 orderId 없음)        → final failure (시도 자체 안 됨)
    //   READY/WAITING_FOR_DEPOSIT         → 그대로 pending 유지 (토스가 처리 중일 수 있음, 다음 cron 재확인)
    //   네트워크 에러 / 비-2xx 응답        → 그대로 pending 유지 (확정 못 함, 다음 cron 재확인)
    //
    // 결과: 사용자 결제 사실을 시스템이 영구히 놓치는 silent stuck 사고 차단.
    const ttlThreshold = new Date(Date.now() - STALE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data: ttlCandidates } = await serviceClient
      .from('payment_transactions')
      .select('id, pt_user_id, monthly_report_id, toss_order_id')
      .eq('status', 'pending')
      .lte('created_at', ttlThreshold)
      .order('created_at', { ascending: true })  // 가장 오래된 것부터 — fairness
      .limit(100);

    let ttlExpired = 0;
    let ttlSavedByToss = 0;
    let ttlKeptPending = 0;  // 토스 미응답/READY 로 그대로 둔 건수 (silent stuck 방지)

    for (const tx of ttlCandidates || []) {
      type TossOutcome =
        | { kind: 'done'; data: Record<string, unknown> }
        | { kind: 'final_fail'; code: string; message: string }
        | { kind: 'keep_pending'; reason: string };
      let outcome: TossOutcome = {
        kind: 'keep_pending',
        reason: 'unknown',
      };
      try {
        const res = await fetch(
          `https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(tx.toss_order_id as string)}`,
          {
            headers: {
              Authorization: 'Basic ' + Buffer.from(tossSecretKey + ':').toString('base64'),
            },
            signal: AbortSignal.timeout(10_000),
          },
        );

        if (res.status === 404) {
          outcome = {
            kind: 'final_fail',
            code: 'RECONCILE_TOSS_NOT_FOUND',
            message: '토스에 해당 orderId 의 결제가 존재하지 않음 (시도 자체 안 됨)',
          };
        } else if (!res.ok) {
          outcome = { kind: 'keep_pending', reason: `toss_http_${res.status}` };
        } else {
          const data = (await res.json()) as Record<string, unknown>;
          const status = data.status as string | undefined;
          if (status === 'DONE') {
            outcome = { kind: 'done', data };
          } else if (status === 'CANCELED' || status === 'ABORTED' || status === 'EXPIRED') {
            outcome = {
              kind: 'final_fail',
              code: `RECONCILE_TOSS_${status}`,
              message: `토스 명시적 ${status} 응답 — 결제 미완료 확정`,
            };
          } else {
            // READY / WAITING_FOR_DEPOSIT / IN_PROGRESS 등 — 토스 처리중 가능성, 보류
            outcome = { kind: 'keep_pending', reason: `toss_status_${status ?? 'unknown'}` };
          }
        }
      } catch {
        outcome = { kind: 'keep_pending', reason: 'toss_network_error' };
      }

      if (outcome.kind === 'done') {
        const data = outcome.data;
        const { error: rpcErr } = await serviceClient.rpc('payment_mark_success', {
          p_tx_id: tx.id,
          p_payment_key: data.paymentKey,
          p_receipt_url: (data.receipt as { url?: string } | undefined)?.url ?? null,
          p_raw: data,
          p_approved_at: data.approvedAt,
        });
        if (!rpcErr) {
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
                stage: 'reconcile_ttl_complete_settlement',
                monthlyReportId: tx.monthly_report_id as string,
                ptUserId: tx.pt_user_id as string,
                error: settleErr,
              });
            }
          }
          await serviceClient.rpc('payment_clear_overdue_if_settled', {
            p_pt_user_id: tx.pt_user_id,
          });
          ttlSavedByToss++;
        } else {
          // RPC 실패 — 다음 cron / 강제 복구 도구가 잡을 수 있게 pending 유지
          await logSettlementError(serviceClient, {
            stage: 'reconcile_ttl_mark_success_rpc',
            monthlyReportId: tx.monthly_report_id as string,
            ptUserId: tx.pt_user_id as string,
            error: rpcErr,
            detail: { severity: 'CRITICAL_DESYNC', orderId: tx.toss_order_id },
          });
          ttlKeptPending++;
        }
      } else if (outcome.kind === 'final_fail') {
        await serviceClient
          .from('payment_transactions')
          .update({
            status: 'failed',
            failure_code: outcome.code,
            failure_message: outcome.message,
            failed_at: new Date().toISOString(),
            is_final_failure: true,
            final_failed_at: new Date().toISOString(),
            next_retry_at: null,
          })
          .eq('id', tx.id)
          .eq('status', 'pending');
        ttlExpired++;
      } else {
        // keep_pending — 다음 cron 에서 재확인. silent stuck 방지.
        ttlKeptPending++;
        console.log(
          `[payment-reconcile][TTL] keep pending tx=${tx.id} orderId=${tx.toss_order_id} reason=${outcome.reason}`,
        );
      }
    }

    return NextResponse.json({
      success: true,
      ttlKeptPending,  // 토스 미응답/READY 로 보류된 건수 (다음 cron 재확인)
      stalePending: (stalePending || []).length,
      reconciled,
      reconcileFailed,
      zombieCandidates: (possibleZombies || []).length,
      flagsCleared,
      ttlExpired,
      ttlSavedByToss,
    });
  } catch (err) {
    console.error('cron/payment-reconcile error:', err);
    void logSystemError({ source: 'cron/payment-reconcile', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
