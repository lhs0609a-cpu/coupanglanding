import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { assertTossEnv } from '@/lib/payments/toss-client';
import { completeSettlement } from '@/lib/payments/complete-settlement';
import { logSettlementError } from '@/lib/payments/settlement-errors';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 90;

const TOSS_BASE = 'https://api.tosspayments.com/v1';

/**
 * POST /api/admin/payments/toss-settlement-reconcile
 *
 * 토스의 정산(Settlement) 데이터를 권위(authoritative) 기준으로 우리 DB 동기화.
 *
 * 시나리오: 토스 정산 페이지엔 입금예정/완료인데 우리 시스템엔 최종실패로 stuck.
 * 기존 desync-recovery 가 우리 DB의 toss_order_id 로 토스 조회 → NOT DONE 받는 케이스
 * (orderId 미스매치 / 토스 일시 응답 이상 등) 도 모두 잡는다.
 *
 * 동작:
 *   1) 토스 GET /v1/settlements?startDate=...&endDate=... 로 settlement 목록 페이지네이션 조회
 *   2) 각 settlement 의 paymentKey 로 토스 GET /v1/payments/{paymentKey} 조회 → orderId 확보
 *   3) 우리 DB payment_transactions 에서 toss_order_id 매칭 검색
 *      - 매칭 + status != 'success' → payment_mark_success 로 강제 복구
 *      - 매칭 + status == 'success' → no-op
 *      - 매칭 없음 → settlement 의 orderId 가 우리 generateOrderId 형식이면
 *        ptUserId 추출해서 amount 매칭으로 unpaid report 복구
 *
 * Body: { startDate?: string, endDate?: string, dryRun?: boolean }
 *   - 기본값: 지난 14일
 */

interface TossSettlementItem {
  mId: string;
  paymentKey: string;
  transactionKey?: string;
  orderId: string;
  currency: string;
  method: string;
  amount: number;
  interestFee?: number;
  supplyAmount?: number;
  vat?: number;
  fee?: number;
  soldDate?: string;
  paidOutDate?: string;
}

interface TossPaymentResponse {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  approvedAt?: string;
  receipt?: { url?: string };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const guard = await requireAdminRole(supabase, user?.id, 'write');
    if (!guard.ok) return guard.response;

    const body = (await request.json().catch(() => ({}))) as {
      startDate?: string;
      endDate?: string;
      dryRun?: boolean;
    };

    const today = new Date();
    const fourteenDaysAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
    const startDate = body.startDate || fourteenDaysAgo.toISOString().slice(0, 10);
    const endDate = body.endDate || today.toISOString().slice(0, 10);
    const dryRun = body.dryRun === true;

    let secretKey: string;
    try {
      ({ secretKey } = assertTossEnv());
    } catch (envErr) {
      return NextResponse.json({
        error: 'Toss 환경변수 미설정',
        detail: envErr instanceof Error ? envErr.message : String(envErr),
      }, { status: 500 });
    }
    const authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');

    const serviceClient = await createServiceClient();
    const startedAt = Date.now();
    const SOFT_DEADLINE_MS = 80_000;

    // ── 1) 토스 settlements 페이지네이션 ──
    const allSettlements: TossSettlementItem[] = [];
    let page = 1;
    const SIZE = 100;
    while (true) {
      if (Date.now() - startedAt > SOFT_DEADLINE_MS) break;
      const res = await fetch(
        `${TOSS_BASE}/settlements?startDate=${startDate}&endDate=${endDate}&page=${page}&size=${SIZE}`,
        { headers: { Authorization: authHeader }, signal: AbortSignal.timeout(15_000) },
      );
      if (!res.ok) {
        return NextResponse.json({
          error: `토스 settlements API 실패 (HTTP ${res.status})`,
          detail: await res.text().catch(() => ''),
        }, { status: 502 });
      }
      const items = (await res.json()) as TossSettlementItem[];
      if (!Array.isArray(items) || items.length === 0) break;
      allSettlements.push(...items);
      if (items.length < SIZE) break;  // 마지막 페이지
      page++;
      if (page > 50) break;  // 안전장치 5000건
    }

    // 음수 amount = 환불/취소. 양수만 복구 대상.
    const positiveSettlements = allSettlements.filter((s) => s.amount > 0);

    type RecoveryItem = {
      paymentKey: string;
      orderId: string;
      amount: number;
      tossStatus: string | null;
      ourTxId: string | null;
      ourPrevStatus: string | null;
      action: 'recovered' | 'already_success' | 'no_match' | 'rpc_error' | 'fetch_error';
      message?: string;
    };
    const items: RecoveryItem[] = [];
    const affectedPtUserIds = new Set<string>();

    // ── 2) 각 settlement → 토스 payment 상세 → DB 매칭 + 복구 ──
    for (const stl of positiveSettlements) {
      if (Date.now() - startedAt > SOFT_DEADLINE_MS) {
        items.push({
          paymentKey: stl.paymentKey,
          orderId: stl.orderId,
          amount: stl.amount,
          tossStatus: null,
          ourTxId: null,
          ourPrevStatus: null,
          action: 'fetch_error',
          message: 'soft_deadline — 다음 실행에서 재시도',
        });
        continue;
      }

      // 우리 DB 에서 orderId 로 매칭 시도
      const { data: tx } = await serviceClient
        .from('payment_transactions')
        .select('id, pt_user_id, monthly_report_id, status, total_amount, is_final_failure')
        .eq('toss_order_id', stl.orderId)
        .maybeSingle();

      if (!tx) {
        items.push({
          paymentKey: stl.paymentKey,
          orderId: stl.orderId,
          amount: stl.amount,
          tossStatus: null,
          ourTxId: null,
          ourPrevStatus: null,
          action: 'no_match',
          message: 'orderId 가 우리 DB 에 없음 — 외부 결제 또는 다른 시스템',
        });
        continue;
      }

      if (tx.status === 'success') {
        items.push({
          paymentKey: stl.paymentKey,
          orderId: stl.orderId,
          amount: stl.amount,
          tossStatus: 'DONE',
          ourTxId: tx.id as string,
          ourPrevStatus: 'success',
          action: 'already_success',
        });
        continue;
      }

      // 토스 payment 상세 조회 (paymentKey 기준 → orderId 기준 보다 정확)
      let tossPayment: TossPaymentResponse | null = null;
      try {
        const pres = await fetch(
          `${TOSS_BASE}/payments/${encodeURIComponent(stl.paymentKey)}`,
          { headers: { Authorization: authHeader }, signal: AbortSignal.timeout(8_000) },
        );
        if (pres.ok) {
          tossPayment = (await pres.json()) as TossPaymentResponse;
        }
      } catch {
        // ignore — 아래에서 settlement 정보로 fallback
      }

      const tossStatus = tossPayment?.status ?? 'DONE';  // settlement 에 들어왔으면 DONE 으로 간주
      const tossPaymentKey = tossPayment?.paymentKey ?? stl.paymentKey;
      const tossApprovedAt = tossPayment?.approvedAt ?? new Date().toISOString();
      const tossReceiptUrl = tossPayment?.receipt?.url ?? null;
      const rawForRpc: Record<string, unknown> = (tossPayment as unknown as Record<string, unknown>) ?? (stl as unknown as Record<string, unknown>);

      if (dryRun) {
        items.push({
          paymentKey: stl.paymentKey,
          orderId: stl.orderId,
          amount: stl.amount,
          tossStatus,
          ourTxId: tx.id as string,
          ourPrevStatus: tx.status as string,
          action: 'recovered',
          message: 'dryRun — 실제 복구 안 함',
        });
        continue;
      }

      const { error: rpcErr } = await serviceClient.rpc('payment_mark_success', {
        p_tx_id: tx.id,
        p_payment_key: tossPaymentKey,
        p_receipt_url: tossReceiptUrl,
        p_raw: rawForRpc,
        p_approved_at: tossApprovedAt,
      });

      if (rpcErr) {
        await logSettlementError(serviceClient, {
          stage: 'toss_settlement_reconcile_rpc',
          monthlyReportId: tx.monthly_report_id as string,
          ptUserId: tx.pt_user_id as string,
          error: rpcErr,
          detail: {
            orderId: stl.orderId,
            paymentKey: stl.paymentKey,
            severity: 'CRITICAL_DESYNC',
          },
        });
        items.push({
          paymentKey: stl.paymentKey,
          orderId: stl.orderId,
          amount: stl.amount,
          tossStatus,
          ourTxId: tx.id as string,
          ourPrevStatus: tx.status as string,
          action: 'rpc_error',
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
            stage: 'toss_settlement_reconcile_complete_settlement',
            monthlyReportId: tx.monthly_report_id as string,
            ptUserId: tx.pt_user_id as string,
            error: settleErr,
          });
        }
      }

      affectedPtUserIds.add(tx.pt_user_id as string);
      items.push({
        paymentKey: stl.paymentKey,
        orderId: stl.orderId,
        amount: stl.amount,
        tossStatus,
        ourTxId: tx.id as string,
        ourPrevStatus: tx.status as string,
        action: 'recovered',
      });

      console.log(
        `[toss-settlement-reconcile][RECOVERED] tx=${tx.id} orderId=${stl.orderId} ` +
        `paymentKey=${stl.paymentKey} amount=${stl.amount} prev=${tx.status}`,
      );
    }

    // ── 3) 영향받은 사용자 락 해제 ──
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

    const summary = {
      tossSettlementsScanned: positiveSettlements.length,
      tossSettlementsTotalAmount: positiveSettlements.reduce((s, x) => s + x.amount, 0),
      recovered: items.filter((i) => i.action === 'recovered').length,
      alreadySuccess: items.filter((i) => i.action === 'already_success').length,
      noMatch: items.filter((i) => i.action === 'no_match').length,
      rpcErrors: items.filter((i) => i.action === 'rpc_error').length,
      fetchErrors: items.filter((i) => i.action === 'fetch_error').length,
      affectedPtUsers: affectedPtUserIds.size,
      locksCleared,
    };

    return NextResponse.json({
      success: true,
      dryRun,
      dateRange: { startDate, endDate },
      summary,
      items,
    });
  } catch (err) {
    console.error('POST /api/admin/payments/toss-settlement-reconcile error:', err);
    void logSystemError({
      source: 'admin/payments/toss-settlement-reconcile',
      error: err,
      category: 'payment',
    }).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 },
    );
  }
}
