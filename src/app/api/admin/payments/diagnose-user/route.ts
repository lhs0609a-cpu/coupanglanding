import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { assertTossEnv } from '@/lib/payments/toss-client';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;

const TOSS_PAYMENTS_BASE = 'https://api.tosspayments.com/v1/payments';

/**
 * GET /api/admin/payments/diagnose-user?email=xxx 또는 ?ptUserId=xxx&verifyToss=1
 *
 * "이 사용자는 결제됐는데 왜 최종실패로 떠?" 단일 사용자 정밀 진단.
 *
 * 반환:
 *   - ptUser/profile 정보, 락 상태
 *   - 모든 monthly_reports + 결제상태
 *   - 모든 payment_transactions 시간순 (orderId 포함)
 *   - verifyToss=1 이면 각 tx 의 toss_order_id 로 토스 직접 조회 → 진실값
 *   - 발견된 mismatch 요약 ("토스 DONE인데 시스템 failed" 등)
 *
 * 사용:
 *   GET /api/admin/payments/diagnose-user?email=kecmok@gmail.com&verifyToss=1
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const guard = await requireAdminRole(supabase, user?.id, 'read');
    if (!guard.ok) return guard.response;

    const url = new URL(request.url);
    const email = url.searchParams.get('email')?.trim();
    let ptUserId = url.searchParams.get('ptUserId')?.trim();
    const verifyToss = url.searchParams.get('verifyToss') === '1';

    if (!email && !ptUserId) {
      return NextResponse.json({ error: 'email 또는 ptUserId 필수' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 1) ptUserId 로 변환 (email 입력시)
    if (!ptUserId && email) {
      const { data: prof } = await serviceClient
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (!prof) return NextResponse.json({ error: `${email} 사용자 없음` }, { status: 404 });
      const profileId = (prof as { id: string }).id;
      const { data: pt } = await serviceClient
        .from('pt_users')
        .select('id')
        .eq('profile_id', profileId)
        .maybeSingle();
      if (!pt) return NextResponse.json({ error: `${email} pt_user 없음` }, { status: 404 });
      ptUserId = (pt as { id: string }).id;
    }

    // 2) 사용자 기본 정보
    const { data: ptUser } = await serviceClient
      .from('pt_users')
      .select(`
        id, profile_id, status, is_test_account,
        payment_overdue_since, payment_lock_level, admin_override_level,
        payment_lock_exempt_until, payment_retry_in_progress,
        billing_excluded_until, billing_exclusion_reason
      `)
      .eq('id', ptUserId!)
      .maybeSingle();

    if (!ptUser) return NextResponse.json({ error: 'pt_user 없음' }, { status: 404 });
    const ptUserData = ptUser as Record<string, unknown>;

    const { data: profile } = await serviceClient
      .from('profiles')
      .select('full_name, email')
      .eq('id', ptUserData.profile_id as string)
      .maybeSingle();

    // 3) 카드
    const { data: cards } = await serviceClient
      .from('billing_cards')
      .select('id, card_company, card_number, is_active, is_primary, failed_count, created_at')
      .eq('pt_user_id', ptUserId!)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false });

    // 4) 모든 monthly_reports
    const { data: reports } = await serviceClient
      .from('monthly_reports')
      .select('id, year_month, fee_payment_status, payment_status, total_with_vat, fee_paid_at, fee_payment_deadline, created_at')
      .eq('pt_user_id', ptUserId!)
      .order('year_month', { ascending: false });

    // 5) 모든 payment_transactions (전체 — 한 사용자라 limit 없어도 OK)
    const { data: txs } = await serviceClient
      .from('payment_transactions')
      .select('id, monthly_report_id, status, is_final_failure, retry_count, next_retry_at, failure_code, failure_message, total_amount, amount, penalty_amount, toss_order_id, toss_payment_key, receipt_url, approved_at, failed_at, final_failed_at, cancelled_at, cancel_reason, created_at, parent_transaction_id, is_auto_payment')
      .eq('pt_user_id', ptUserId!)
      .order('created_at', { ascending: false });

    // 6) verifyToss=1: 각 tx 마다 토스에 직접 질의
    type TxRow = NonNullable<typeof txs>[number];
    const tossResults: Record<string, {
      tossStatus: string | null;
      tossFound: boolean;
      tossPaymentKey: string | null;
      tossApprovedAt: string | null;
      tossTotalAmount: number | null;
      tossError: string | null;
      mismatch: string | null; // mismatch 사유 한 줄 요약
    }> = {};

    if (verifyToss && txs && txs.length > 0) {
      try {
        const { secretKey } = assertTossEnv();
        const authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');

        // 직렬 — 토스 rate limit 보호 + 오류 격리
        for (const tx of txs as TxRow[]) {
          if (!tx.toss_order_id) continue;
          try {
            const res = await fetch(
              `${TOSS_PAYMENTS_BASE}/orders/${encodeURIComponent(tx.toss_order_id as string)}`,
              { headers: { Authorization: authHeader }, signal: AbortSignal.timeout(8_000) },
            );
            if (res.status === 404) {
              tossResults[tx.id as string] = {
                tossStatus: null,
                tossFound: false,
                tossPaymentKey: null,
                tossApprovedAt: null,
                tossTotalAmount: null,
                tossError: null,
                mismatch: tx.status === 'success'
                  ? '⚠️ 시스템 success 인데 토스에 orderId 없음 — 데이터 무결성 의심'
                  : null,
              };
              continue;
            }
            if (!res.ok) {
              tossResults[tx.id as string] = {
                tossStatus: null,
                tossFound: false,
                tossPaymentKey: null,
                tossApprovedAt: null,
                tossTotalAmount: null,
                tossError: `HTTP ${res.status}`,
                mismatch: null,
              };
              continue;
            }
            const data = await res.json() as Record<string, unknown>;
            const tossStatus = (data.status as string | undefined) ?? null;
            const tossPaymentKey = (data.paymentKey as string | undefined) ?? null;
            const tossApprovedAt = (data.approvedAt as string | undefined) ?? null;
            const tossTotalAmount = (data.totalAmount as number | undefined) ?? null;

            // mismatch 분석
            let mismatch: string | null = null;
            if (tossStatus === 'DONE' && tx.status !== 'success') {
              mismatch = `🚨 토스 DONE 인데 시스템은 ${tx.status} — 자동 복구 실패한 케이스. /sync-locks 또는 토스확인 버튼으로 복구 필요`;
            } else if (tossStatus === 'CANCELED' && tx.status === 'success') {
              mismatch = `⚠️ 토스 CANCELED 인데 시스템은 success — 환불 후처리 누락 의심`;
            } else if (tossStatus && tossStatus !== 'DONE' && tx.status === 'success') {
              mismatch = `⚠️ 토스 ${tossStatus} 인데 시스템 success — 상태 mismatch`;
            }

            tossResults[tx.id as string] = {
              tossStatus,
              tossFound: true,
              tossPaymentKey,
              tossApprovedAt,
              tossTotalAmount,
              tossError: null,
              mismatch,
            };
          } catch (err) {
            tossResults[tx.id as string] = {
              tossStatus: null,
              tossFound: false,
              tossPaymentKey: null,
              tossApprovedAt: null,
              tossTotalAmount: null,
              tossError: err instanceof Error ? err.message : 'unknown',
              mismatch: null,
            };
          }
        }
      } catch (envErr) {
        return NextResponse.json({
          error: 'Toss 환경변수 미설정 — verifyToss 실패',
          envError: envErr instanceof Error ? envErr.message : String(envErr),
        }, { status: 500 });
      }
    }

    // 7) 진단 요약
    const findings: string[] = [];

    // 7-1) success tx 있는데 report unpaid?
    type ReportRow = NonNullable<typeof reports>[number];
    type SuccessTx = TxRow & { status: 'success' };
    const successTxByReport = new Map<string, SuccessTx>();
    for (const tx of (txs || []) as TxRow[]) {
      if (tx.status === 'success' && tx.monthly_report_id) {
        if (!successTxByReport.has(tx.monthly_report_id as string)) {
          successTxByReport.set(tx.monthly_report_id as string, tx as SuccessTx);
        }
      }
    }
    for (const rep of (reports || []) as ReportRow[]) {
      const successTx = successTxByReport.get(rep.id as string);
      if (successTx && rep.fee_payment_status !== 'paid') {
        findings.push(
          `🚨 ${rep.year_month} 리포트: success tx 존재(₩${successTx.total_amount?.toLocaleString()})하는데 fee_payment_status=${rep.fee_payment_status}. ` +
          `desync-recovery Pass A 가 처리해야 하지만 누락. /sync-locks 트리거 필요.`,
        );
      }
    }

    // 7-2) Toss DONE인데 시스템 failed 인 tx
    if (verifyToss) {
      const recoverable = (txs || []).filter((tx) => {
        const r = tossResults[tx.id as string];
        return r?.tossStatus === 'DONE' && tx.status !== 'success';
      });
      if (recoverable.length > 0) {
        findings.push(
          `🚨 자동 복구 가능: ${recoverable.length}건의 tx가 토스 DONE인데 시스템은 not-success. ` +
          `각 tx의 "토스 확인" 버튼 클릭 또는 /sync-locks 한번이면 자동 복구.`,
        );
      }
    }

    // 7-3) 같은 월에 여러 tx 인지 (재시도 체인 검증)
    const txCountByReport = new Map<string, number>();
    for (const tx of (txs || []) as TxRow[]) {
      if (tx.monthly_report_id) {
        const k = tx.monthly_report_id as string;
        txCountByReport.set(k, (txCountByReport.get(k) || 0) + 1);
      }
    }
    for (const [reportId, count] of txCountByReport) {
      if (count >= 4) {
        const rep = (reports || []).find((r) => r.id === reportId);
        findings.push(`ℹ️ ${rep?.year_month || reportId.slice(0, 8)} 리포트에 tx ${count}건 — 재시도 체인 길음`);
      }
    }

    // 7-4) 락 상태
    const lockLevel = (ptUserData.payment_lock_level as number | null) ?? 0;
    const adminOverride = ptUserData.admin_override_level as number | null;
    if (lockLevel > 0 || (adminOverride ?? 0) > 0) {
      findings.push(`⚠️ 락 활성: payment_lock_level=${lockLevel}, admin_override=${adminOverride ?? 0}, overdue_since=${ptUserData.payment_overdue_since ?? 'null'}`);
    }

    if (findings.length === 0) {
      findings.push('✅ 명확한 mismatch 발견 안됨. 사용자 결제는 정확히 시스템에 반영된 상태로 보임.');
    }

    return NextResponse.json({
      ptUser: {
        id: ptUserData.id,
        email: (profile as { email?: string } | null)?.email ?? null,
        full_name: (profile as { full_name?: string } | null)?.full_name ?? null,
        status: ptUserData.status,
        is_test_account: ptUserData.is_test_account,
        payment_overdue_since: ptUserData.payment_overdue_since,
        payment_lock_level: ptUserData.payment_lock_level,
        admin_override_level: ptUserData.admin_override_level,
        payment_lock_exempt_until: ptUserData.payment_lock_exempt_until,
        payment_retry_in_progress: ptUserData.payment_retry_in_progress,
        billing_excluded_until: ptUserData.billing_excluded_until,
      },
      cards: cards || [],
      reports: reports || [],
      transactions: (txs || []).map((tx) => ({
        ...tx,
        toss: verifyToss ? (tossResults[tx.id as string] || null) : undefined,
      })),
      findings,
      tossVerified: verifyToss,
    });
  } catch (err) {
    console.error('GET /api/admin/payments/diagnose-user error:', err);
    void logSystemError({
      source: 'admin/payments/diagnose-user',
      error: err,
      category: 'payment',
    }).catch(() => {});
    return NextResponse.json({ error: err instanceof Error ? err.message : '서버 오류' }, { status: 500 });
  }
}
