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
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stalePending } = await serviceClient
      .from('payment_transactions')
      .select('id, pt_user_id, monthly_report_id, toss_order_id, total_amount')
      .eq('status', 'pending')
      .lte('created_at', staleThreshold)
      .limit(50);

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

    // ── 3) TTL 만료 좀비 pending 강제 종결 ─────────────────
    // 위 2)까지 처리한 뒤에도 pending 상태로 남은 tx 중 24h+ 된 건은 실패로 확정.
    const ttlThreshold = new Date(Date.now() - STALE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data: zombiePending } = await serviceClient
      .from('payment_transactions')
      .update({
        status: 'failed',
        failure_code: 'RECONCILE_TTL_EXPIRED',
        failure_message: `${STALE_TTL_HOURS}h 이상 pending 상태로 방치되어 자동 실패 처리`,
        failed_at: new Date().toISOString(),
        is_final_failure: true,
        final_failed_at: new Date().toISOString(),
        next_retry_at: null,
      })
      .eq('status', 'pending')
      .lte('created_at', ttlThreshold)
      .select('id');

    const ttlExpired = (zombiePending || []).length;

    return NextResponse.json({
      success: true,
      stalePending: (stalePending || []).length,
      reconciled,
      reconcileFailed,
      zombieCandidates: (possibleZombies || []).length,
      flagsCleared,
      ttlExpired,
    });
  } catch (err) {
    console.error('cron/payment-reconcile error:', err);
    void logSystemError({ source: 'cron/payment-reconcile', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
