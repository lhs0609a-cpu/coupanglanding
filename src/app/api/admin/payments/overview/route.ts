import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { calculateLockLevel, kstDateStr, kstMonthStr } from '@/lib/payments/billing-constants';
import { failureLabel } from '@/lib/payments/failure-codes';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { logSystemError } from '@/lib/utils/system-log';

// Vercel function timeout 60s + 캐시 우회
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/payments/overview
 * 모든 PT 유저의 결제 상태를 한 화면에서 보기 위한 통합 데이터.
 *
 * 각 PT 유저당:
 *   - 프로필 / 계약 (signed 만 대상)
 *   - 카드 등록 여부 (primary 우선, primary 없으면 최신 active 카드를 노출)
 *   - 가장 최근 미결 transaction
 *   - 락 상태
 *   - 이번달 리포트 + 전체 미납 리포트 요약 (건수 / 총액)
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const guard = await requireAdminRole(supabase, user?.id, 'read');
    if (!guard.ok) return guard.response;

    const serviceClient = await createServiceClient();
    const today = new Date();
    const todayDateStr = kstDateStr(today);
    const thisMonth = kstMonthStr(today);

    // signed 필터를 제거 — 모든 활성 PT생을 보여줘야 어떤 사람이 계약 미서명/카드 미등록인지
    // 운영자가 식별하고 조치 가능. terminated 만 제외, 테스트 계정 제외.
    const { data: ptUsers, error } = await serviceClient
      .from('pt_users')
      .select(`
        id,
        profile_id,
        status,
        is_test_account,
        payment_overdue_since,
        payment_lock_level,
        payment_lock_exempt_until,
        admin_override_level,
        payment_retry_in_progress,
        first_billing_grace_until,
        billing_excluded_until,
        billing_exclusion_reason,
        profile:profiles(full_name, email)
      `)
      .neq('status', 'terminated')
      .eq('is_test_account', false);

    if (error) throw error;

    const ptUserIds = (ptUsers || []).map((u) => u.id);
    if (ptUserIds.length === 0) {
      return NextResponse.json({ users: [], summary: emptySummary() });
    }

    // 계약 상태 별도 조회 — 어떤 PT생이 signed/draft/없음인지 표시
    const { data: contracts } = await serviceClient
      .from('contracts')
      .select('pt_user_id, status, created_at')
      .in('pt_user_id', ptUserIds)
      .order('created_at', { ascending: false });

    const contractByUser = new Map<string, string>();
    (contracts || []).forEach((c) => {
      // 가장 최근 계약 1건만 표시 (signed 우선)
      const existing = contractByUser.get(c.pt_user_id);
      if (!existing || c.status === 'signed') {
        contractByUser.set(c.pt_user_id, c.status);
      }
    });

    // 카드 — active 전체 조회 후 primary 우선 선택
    const { data: cards } = await serviceClient
      .from('billing_cards')
      .select('id, pt_user_id, card_company, card_number, is_active, is_primary, failed_count, created_at')
      .in('pt_user_id', ptUserIds)
      .eq('is_active', true)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false });

    type CardRow = NonNullable<typeof cards>[number];
    const cardByUser = new Map<string, CardRow>();
    (cards || []).forEach((c) => {
      if (!cardByUser.has(c.pt_user_id)) cardByUser.set(c.pt_user_id, c);
    });

    // 이번달 리포트
    const { data: reports } = await serviceClient
      .from('monthly_reports')
      .select('id, pt_user_id, year_month, fee_payment_status, total_with_vat, fee_payment_deadline')
      .in('pt_user_id', ptUserIds)
      .eq('year_month', thisMonth);

    type ReportRow = NonNullable<typeof reports>[number];
    const reportByUser = new Map<string, ReportRow>();
    (reports || []).forEach((r) => reportByUser.set(r.pt_user_id, r));

    // 전체 미납 요약 (suspended/overdue/awaiting_payment 모두 포함)
    const { data: unpaidAll } = await serviceClient
      .from('monthly_reports')
      .select('pt_user_id, year_month, total_with_vat, fee_payment_status')
      .in('pt_user_id', ptUserIds)
      .in('fee_payment_status', ['awaiting_payment', 'overdue', 'suspended']);

    const unpaidSummaryByUser = new Map<string, {
      count: number;
      total: number;
      suspendedCount: number;
      overdueCount: number;
    }>();

    (unpaidAll || []).forEach((r) => {
      const prev = unpaidSummaryByUser.get(r.pt_user_id) ?? {
        count: 0,
        total: 0,
        suspendedCount: 0,
        overdueCount: 0,
      };
      prev.count++;
      prev.total += r.total_with_vat || 0;
      if (r.fee_payment_status === 'suspended') prev.suspendedCount++;
      if (r.fee_payment_status === 'overdue') prev.overdueCount++;
      unpaidSummaryByUser.set(r.pt_user_id, prev);
    });

    // 최근 transaction (유저당 1건) — 영수증 / paymentKey 포함.
    // 성능: 모든 tx 가져오면 14명 * N건 으로 timeout 위험 → 최근 90일 + limit 500.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: txs, error: txErr } = await serviceClient
      .from('payment_transactions')
      .select('id, pt_user_id, monthly_report_id, status, retry_count, next_retry_at, is_final_failure, final_failed_at, failure_code, failure_message, total_amount, created_at, parent_transaction_id, toss_payment_key, receipt_url, approved_at')
      .in('pt_user_id', ptUserIds)
      .gte('created_at', ninetyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(500);

    if (txErr) throw txErr;

    const latestTxByUser = new Map<string, NonNullable<typeof txs>[number]>();
    // 마지막 성공 결제(영수증 표시용) — 별도 추적
    const lastSuccessTxByUser = new Map<string, NonNullable<typeof txs>[number]>();
    (txs || []).forEach((t) => {
      if (!latestTxByUser.has(t.pt_user_id)) {
        latestTxByUser.set(t.pt_user_id, t);
      }
      if (t.status === 'success' && !lastSuccessTxByUser.has(t.pt_user_id)) {
        lastSuccessTxByUser.set(t.pt_user_id, t);
      }
    });

    const rows = (ptUsers || []).map((u) => {
      const card = cardByUser.get(u.id) ?? null;
      const report = reportByUser.get(u.id) ?? null;
      const latestTx = latestTxByUser.get(u.id) ?? null;
      const lastSuccessTx = lastSuccessTxByUser.get(u.id) ?? null;
      const unpaid = unpaidSummaryByUser.get(u.id) ?? null;
      const contractStatus = contractByUser.get(u.id) ?? null;
      const hasSignedContract = contractStatus === 'signed';

      const exemptActive = u.payment_lock_exempt_until && u.payment_lock_exempt_until > todayDateStr;
      const computedLevel = exemptActive
        ? 0
        : calculateLockLevel(u.payment_overdue_since, today, {
            retryInProgress: !!u.payment_retry_in_progress,
          });

      // 결제 제외 기간 — 관리자가 지정한 종료일까지 자동결제/락/리포트 자동생성 모두 면제
      const billingExcluded =
        !!(u as { billing_excluded_until?: string | null }).billing_excluded_until &&
        (u as { billing_excluded_until?: string | null }).billing_excluded_until! >= todayDateStr;

      let status: 'normal' | 'retrying' | 'final_failed' | 'locked' | 'no_card' | 'no_report' | 'no_contract' | 'excluded' = 'normal';
      if (billingExcluded) status = 'excluded';
      else if (u.payment_retry_in_progress) status = 'retrying';
      else if ((u.payment_lock_level ?? 0) > 0 || computedLevel > 0) status = 'locked';
      else if (latestTx?.is_final_failure && latestTx.status === 'failed') status = 'final_failed';
      else if (!hasSignedContract) status = 'no_contract';
      else if (!card) status = 'no_card';
      else if (!report) status = 'no_report';

      // Supabase 조인은 1:1 FK 관계여도 타입 추론이 배열로 되는 경우가 있어 양쪽 모두 안전 처리
      const profileRaw = u.profile as unknown;
      const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
      const profileTyped = profile as { full_name?: string | null; email?: string | null } | null;

      return {
        pt_user_id: u.id,
        profile_id: u.profile_id,
        full_name: profileTyped?.full_name ?? null,
        email: profileTyped?.email ?? null,
        status,
        contract_status: contractStatus,
        billing_excluded_until: (u as { billing_excluded_until?: string | null }).billing_excluded_until ?? null,
        billing_exclusion_reason: (u as { billing_exclusion_reason?: string | null }).billing_exclusion_reason ?? null,
        payment_overdue_since: u.payment_overdue_since,
        payment_lock_level: u.payment_lock_level ?? 0,
        computed_lock_level: computedLevel,
        admin_override_level: u.admin_override_level,
        payment_lock_exempt_until: u.payment_lock_exempt_until,
        retry_in_progress: !!u.payment_retry_in_progress,
        first_billing_grace_until: u.first_billing_grace_until,
        card: card
          ? {
              id: card.id,
              company: card.card_company,
              number: card.card_number,
              is_primary: card.is_primary,
              failed_count: card.failed_count,
            }
          : null,
        this_month_report: report
          ? {
              id: report.id,
              year_month: report.year_month,
              fee_payment_status: report.fee_payment_status,
              total_with_vat: report.total_with_vat,
              deadline: report.fee_payment_deadline,
            }
          : null,
        unpaid_summary: unpaid,
        latest_tx: latestTx
          ? {
              id: latestTx.id,
              status: latestTx.status,
              retry_count: latestTx.retry_count ?? 0,
              next_retry_at: latestTx.next_retry_at,
              is_final_failure: !!latestTx.is_final_failure,
              final_failed_at: latestTx.final_failed_at,
              failure_code: latestTx.failure_code,
              failure_label: failureLabel(latestTx.failure_code, latestTx.failure_message),
              total_amount: latestTx.total_amount,
              created_at: latestTx.created_at,
            }
          : null,
        last_success_tx: lastSuccessTx
          ? {
              id: lastSuccessTx.id,
              total_amount: lastSuccessTx.total_amount,
              receipt_url: (lastSuccessTx as { receipt_url?: string | null }).receipt_url ?? null,
              toss_payment_key: (lastSuccessTx as { toss_payment_key?: string | null }).toss_payment_key ?? null,
              approved_at: (lastSuccessTx as { approved_at?: string | null }).approved_at ?? null,
            }
          : null,
      };
    });

    const summary = {
      total: rows.length,
      normal: rows.filter((r) => r.status === 'normal').length,
      retrying: rows.filter((r) => r.status === 'retrying').length,
      final_failed: rows.filter((r) => r.status === 'final_failed').length,
      locked: rows.filter((r) => r.status === 'locked').length,
      no_card: rows.filter((r) => r.status === 'no_card').length,
      no_report: rows.filter((r) => r.status === 'no_report').length,
      no_contract: rows.filter((r) => r.status === 'no_contract').length,
      excluded: rows.filter((r) => r.status === 'excluded').length,
    };

    const order: Record<string, number> = {
      locked: 0,
      final_failed: 1,
      retrying: 2,
      no_contract: 3,
      no_card: 4,
      no_report: 5,
      excluded: 6,
      normal: 7,
    };
    rows.sort((a, b) => order[a.status] - order[b.status]);

    return NextResponse.json({ users: rows, summary });
  } catch (err) {
    console.error('GET /api/admin/payments/overview error:', err);
    void logSystemError({ source: 'admin/payments/overview', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

function emptySummary() {
  return { total: 0, normal: 0, retrying: 0, final_failed: 0, locked: 0, no_card: 0, no_report: 0, no_contract: 0, excluded: 0 };
}
