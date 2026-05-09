import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { assertTossEnv } from '@/lib/payments/toss-client';
import { completeSettlement } from '@/lib/payments/complete-settlement';
import { logSettlementError } from '@/lib/payments/settlement-errors';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 60;

const TOSS_PAYMENTS_BASE = 'https://api.tosspayments.com/v1/payments';

/**
 * POST /api/admin/payments/force-recover-all
 *
 * stuck 한 모든 미납 사용자의 모든 의심 tx 를 토스에 직접 재조회해서
 * DONE 인 결제를 강제 복구한다. desync-recovery Pass B 보다 더 공격적이다:
 *   - is_final_failure=true 인 tx 도 포함 (ttl 만료된 좀비도 복구)
 *   - 모든 미납 monthly_report 의 모든 tx 를 봄 (limit 없음, 단 maxDuration 60s 가드)
 *   - 한 사용자만 타게팅 가능 (?ptUserId=xxx 또는 ?email=xxx)
 *
 * 사용 시나리오:
 *   토스 정산 페이지엔 입금예정인데 우리 시스템엔 최종실패인 사용자 일괄 복구.
 *
 * Body (optional):
 *   { ptUserId?: string, email?: string, dryRun?: boolean }
 *   - ptUserId/email 없으면 → 모든 stuck 사용자 대상
 *   - dryRun=true → 실제 복구 안 하고 어떤 게 DONE 인지 리포트만
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const guard = await requireAdminRole(supabase, user?.id, 'write');
    if (!guard.ok) return guard.response;

    const body = (await request.json().catch(() => ({}))) as {
      ptUserId?: string;
      email?: string;
      dryRun?: boolean;
    };
    const dryRun = body.dryRun === true;

    const serviceClient = await createServiceClient();

    // ── 타겟 ptUserId 결정 ──
    let targetPtUserId: string | null = null;
    if (body.ptUserId) {
      targetPtUserId = body.ptUserId;
    } else if (body.email) {
      const { data: prof } = await serviceClient
        .from('profiles')
        .select('id')
        .eq('email', body.email)
        .maybeSingle();
      if (!prof) return NextResponse.json({ error: `${body.email} 사용자 없음` }, { status: 404 });
      const { data: pt } = await serviceClient
        .from('pt_users')
        .select('id')
        .eq('profile_id', (prof as { id: string }).id)
        .maybeSingle();
      if (!pt) return NextResponse.json({ error: 'pt_user 없음' }, { status: 404 });
      targetPtUserId = (pt as { id: string }).id;
    }

    // ── 미납 monthly_report 추출 ──
    let unpaidQuery = serviceClient
      .from('monthly_reports')
      .select('id, pt_user_id, year_month, total_with_vat')
      .neq('fee_payment_status', 'paid');
    if (targetPtUserId) unpaidQuery = unpaidQuery.eq('pt_user_id', targetPtUserId);

    const { data: unpaidReports, error: reportsErr } = await unpaidQuery;
    if (reportsErr) {
      return NextResponse.json({ error: reportsErr.message }, { status: 500 });
    }
    if (!unpaidReports || unpaidReports.length === 0) {
      return NextResponse.json({
        success: true,
        scanned: 0,
        recovered: 0,
        message: '미납 리포트 없음',
      });
    }

    const unpaidReportIds = unpaidReports.map((r) => r.id);

    // ── 그 리포트들의 모든 의심 tx (is_final_failure 포함) ──
    const { data: suspectTxs, error: scanErr } = await serviceClient
      .from('payment_transactions')
      .select('id, pt_user_id, monthly_report_id, toss_order_id, total_amount, status, is_final_failure, failure_code, failure_message, created_at')
      .in('monthly_report_id', unpaidReportIds)
      .in('status', ['failed', 'pending'])
      .not('toss_order_id', 'is', null)
      .order('created_at', { ascending: false });

    if (scanErr) {
      return NextResponse.json({ error: scanErr.message }, { status: 500 });
    }

    if (!suspectTxs || suspectTxs.length === 0) {
      return NextResponse.json({
        success: true,
        scanned: 0,
        recovered: 0,
        message: '의심 tx 없음',
      });
    }

    // ── 토스 인증 ──
    let authHeader: string;
    try {
      const { secretKey } = assertTossEnv();
      authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');
    } catch (envErr) {
      return NextResponse.json({
        error: 'Toss 환경변수 미설정',
        detail: envErr instanceof Error ? envErr.message : String(envErr),
      }, { status: 500 });
    }

    type TxRow = NonNullable<typeof suspectTxs>[number];
    const recoveredItems: Array<{
      txId: string;
      ptUserId: string;
      orderId: string;
      tossPaymentKey: string | null;
      amount: number;
      tossApprovedAt: string | null;
    }> = [];
    const stillNotDoneItems: Array<{
      txId: string;
      orderId: string;
      tossStatus: string | null;
      tossFound: boolean;
    }> = [];
    const errorsItems: Array<{
      txId: string;
      orderId: string;
      stage: string;
      message: string;
    }> = [];

    const affectedPtUserIds = new Set<string>();
    const startedAt = Date.now();
    const SOFT_DEADLINE_MS = 50_000; // maxDuration 60s 중 10s 여유

    for (const tx of suspectTxs as TxRow[]) {
      // 데드라인 체크 — 남은 tx 는 다음 실행에서
      if (Date.now() - startedAt > SOFT_DEADLINE_MS) {
        console.warn('[force-recover-all] soft deadline 도달, 남은 tx 다음 실행으로');
        break;
      }
      if (!tx.toss_order_id) continue;

      let tossData: Record<string, unknown> | null = null;
      let tossStatus: string | null = null;
      let tossFound = false;

      try {
        const res = await fetch(
          `${TOSS_PAYMENTS_BASE}/orders/${encodeURIComponent(tx.toss_order_id as string)}`,
          { headers: { Authorization: authHeader }, signal: AbortSignal.timeout(8_000) },
        );
        if (res.status === 404) {
          stillNotDoneItems.push({
            txId: tx.id as string,
            orderId: tx.toss_order_id as string,
            tossStatus: null,
            tossFound: false,
          });
          continue;
        }
        if (!res.ok) {
          errorsItems.push({
            txId: tx.id as string,
            orderId: tx.toss_order_id as string,
            stage: 'toss_fetch',
            message: `HTTP ${res.status}`,
          });
          continue;
        }
        tossData = (await res.json()) as Record<string, unknown>;
        tossStatus = (tossData.status as string | undefined) ?? null;
        tossFound = true;
      } catch (err) {
        errorsItems.push({
          txId: tx.id as string,
          orderId: tx.toss_order_id as string,
          stage: 'toss_fetch_exception',
          message: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      if (tossStatus !== 'DONE') {
        stillNotDoneItems.push({
          txId: tx.id as string,
          orderId: tx.toss_order_id as string,
          tossStatus,
          tossFound,
        });
        continue;
      }

      // ─── 토스 DONE 확정 — 복구 진행 (dryRun 이면 skip) ───
      const tossPaymentKey = (tossData?.paymentKey as string | undefined) ?? null;
      const tossApprovedAt = (tossData?.approvedAt as string | undefined) ?? null;

      if (dryRun) {
        recoveredItems.push({
          txId: tx.id as string,
          ptUserId: tx.pt_user_id as string,
          orderId: tx.toss_order_id as string,
          tossPaymentKey,
          amount: tx.total_amount as number,
          tossApprovedAt,
        });
        continue;
      }

      const { error: rpcErr } = await serviceClient.rpc('payment_mark_success', {
        p_tx_id: tx.id,
        p_payment_key: tossPaymentKey,
        p_receipt_url: ((tossData?.receipt as { url?: string } | undefined)?.url) ?? null,
        p_raw: tossData,
        p_approved_at: tossApprovedAt ?? new Date().toISOString(),
      });

      if (rpcErr) {
        await logSettlementError(serviceClient, {
          stage: 'force_recover_all_mark_success',
          monthlyReportId: tx.monthly_report_id as string,
          ptUserId: tx.pt_user_id as string,
          error: rpcErr,
          detail: {
            orderId: tx.toss_order_id,
            tossPaymentKey,
            severity: 'CRITICAL_DESYNC',
          },
        });
        errorsItems.push({
          txId: tx.id as string,
          orderId: tx.toss_order_id as string,
          stage: 'payment_mark_success_rpc',
          message: rpcErr.message,
        });
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
            stage: 'force_recover_all_complete_settlement',
            monthlyReportId: tx.monthly_report_id as string,
            ptUserId: tx.pt_user_id as string,
            error: settleErr,
          });
        }
      }

      affectedPtUserIds.add(tx.pt_user_id as string);
      recoveredItems.push({
        txId: tx.id as string,
        ptUserId: tx.pt_user_id as string,
        orderId: tx.toss_order_id as string,
        tossPaymentKey,
        amount: tx.total_amount as number,
        tossApprovedAt,
      });

      console.log(
        `[force-recover-all][RECOVERED] tx=${tx.id} ptUser=${tx.pt_user_id} ` +
        `orderId=${tx.toss_order_id} amount=${tx.total_amount} paymentKey=${tossPaymentKey}`,
      );
    }

    // ── 영향받은 사용자 락 해제 ──
    let locksCleared = 0;
    if (!dryRun) {
      for (const ptUserId of affectedPtUserIds) {
        const { data: cleared } = await serviceClient.rpc(
          'payment_clear_overdue_if_settled',
          { p_pt_user_id: ptUserId },
        );
        if (cleared === true) locksCleared++;
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      target: targetPtUserId ? { ptUserId: targetPtUserId } : { scope: 'all_unpaid' },
      scannedTxs: (suspectTxs || []).length,
      recovered: recoveredItems.length,
      stillNotDone: stillNotDoneItems.length,
      errors: errorsItems.length,
      affectedPtUsers: affectedPtUserIds.size,
      locksCleared,
      details: {
        recovered: recoveredItems,
        stillNotDone: stillNotDoneItems,
        errors: errorsItems,
      },
    });
  } catch (err) {
    console.error('POST /api/admin/payments/force-recover-all error:', err);
    void logSystemError({
      source: 'admin/payments/force-recover-all',
      error: err,
      category: 'payment',
    }).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 },
    );
  }
}
