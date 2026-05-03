'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatKRW, formatYearMonth } from '@/lib/utils/format';
import { calculateDeposit, getReportCosts } from '@/lib/calculations/deposit';
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
} from '@/lib/utils/constants';
import {
  getPreviousMonth,
  isEligibleForMonth,
  getSettlementStatus,
} from '@/lib/utils/settlement';
import { buildCostBreakdown } from '@/lib/calculations/deposit';
import StatCard from '@/components/ui/StatCard';
import {
  Table2, Search, Download, TrendingUp, Users as UsersIcon, CheckCircle2, Banknote,
  ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Zap,
  CreditCard, AlertTriangle, Lock, XCircle, PlayCircle, Bell, Unlock, Loader2, ChevronDown, ChevronUp, Stethoscope,
} from 'lucide-react';
import type { PtUser, MonthlyReport, Profile, ApiRevenueSnapshot } from '@/lib/supabase/types';

/* ─── 결제 상태 패널 타입 — /api/admin/payments/overview 응답 형태와 1:1 매칭 ─── */
type PaymentStatus = 'normal' | 'retrying' | 'final_failed' | 'locked' | 'no_card' | 'no_report' | 'no_contract' | 'excluded';

interface PaymentOverviewUser {
  pt_user_id: string;
  profile_id: string;
  full_name: string | null;
  email: string | null;
  status: PaymentStatus;
  contract_status: string | null;
  billing_excluded_until: string | null;
  billing_exclusion_reason: string | null;
  payment_overdue_since: string | null;
  payment_lock_level: number;
  computed_lock_level: number;
  admin_override_level: number | null;
  retry_in_progress: boolean;
  card: { id: string; company: string; number: string; is_primary: boolean; failed_count: number } | null;
  this_month_report: { id: string; year_month: string; fee_payment_status: string; total_with_vat: number; deadline: string | null } | null;
  unpaid_summary: { count: number; total: number; suspendedCount: number; overdueCount: number } | null;
  latest_tx: {
    id: string;
    status: string;
    retry_count: number;
    next_retry_at: string | null;
    is_final_failure: boolean;
    failure_code: string | null;
    failure_label: string;
    total_amount: number;
    created_at: string;
  } | null;
}

interface PaymentOverviewSummary {
  total: number;
  normal: number;
  retrying: number;
  final_failed: number;
  locked: number;
  no_card: number;
  no_report: number;
  no_contract: number;
  excluded: number;
}

/* ─── 진단 응답 타입 ─── */
interface DiagnosticsData {
  summary: {
    currentMonth: string;
    lastClosedMonth: string;
    totalPtUsers: number;
    signedPtUsers: number;
    testAccounts: number;
    usersWithCard: number;
    lastReportCount: number;
    lastReportTotal: number;
    eligibleForBilling: number;
    lastSnapshotCount: number;
    todayAutoTxCount: number;
  };
  reasons: string[];
  contractStatusDist: Record<string, number>;
  reportFeeStatusDist: Record<string, number>;
  reportPaymentStatusDist: Record<string, number>;
  cronLocks: Array<{ lock_key: string; acquired_at: string; acquired_by: string | null }>;
  todayAutoTxs: Array<{ status: string; failure_code: string | null; created_at: string }>;
  recentErrors: Array<{ stage: string; error_code: string | null; error_message: string | null; created_at: string }>;
}

interface PtUserWithProfile extends PtUser {
  profile: Profile;
}

type SortKey = 'name' | 'created' | 'currentRevenue' | 'currentDeposit' | 'totalRevenue' | 'totalDeposit';
type SortDir = 'asc' | 'desc';
type MonthRange = 3 | 6 | 12;
type StatusFilter = 'all' | 'pending' | 'submitted' | 'completed' | 'overdue';

interface MonthCell {
  revenue: number;
  deposit: number;
  /** 우리에게 들어올 수수료 (VAT 포함) — PT생 → 우리 결제 금액 */
  fee: number;
  status: string;
  isEligible: boolean;
  /** 데이터 출처 — 'report'=PT생 확정, 'api'=쿠팡 API 자동수집 잠정, 'none'=없음 */
  source: 'report' | 'api' | 'none';
  syncedAt?: string;
  syncError?: string | null;
  /** PT생 → 우리 수수료 결제 상태 (report 가 있을 때만 의미 있음) */
  feeStatus?: 'not_applicable' | 'awaiting_review' | 'awaiting_payment' | 'paid' | 'overdue' | 'suspended' | null;
  /** 결제 완료 시각 */
  feePaidAt?: string | null;
}

interface UserRow {
  user: PtUserWithProfile;
  monthly: Map<string, MonthCell>;
  totalRevenue: number;
  totalDeposit: number;
  currentRevenue: number;
  currentDeposit: number;
  currentStatus: string;
  apiConnected: boolean;
  latestSyncedAt: string | null;
}

/** 최근 N개월 배열 생성 (당월부터 → 과거) — 당월 진행중 매출도 표시 */
function getRecentMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  let ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  for (let i = 0; i < count; i++) {
    months.push(ym);
    ym = getPreviousMonth(ym);
  }
  return months;
}

export default function AdminSalesOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<PtUserWithProfile[]>([]);
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [snapshots, setSnapshots] = useState<ApiRevenueSnapshot[]>([]);
  const [monthRange, setMonthRange] = useState<MonthRange>(6);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('currentRevenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [autoSyncStatus, setAutoSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const autoSyncLockRef = useRef<number>(0);

  // 오늘 실시간 매출
  const [todayTotal, setTodayTotal] = useState<number | null>(null);
  const [todayPerUser, setTodayPerUser] = useState<Array<{ ptUserId: string; name: string; email: string; todaySales: number; orderCount?: number; error?: string }>>([]);
  const [todayLoading, setTodayLoading] = useState(false);
  const [todayFetchedAt, setTodayFetchedAt] = useState<Date | null>(null);

  // 결제 상태 (카드 등록 / 락 / 재시도 등) — 별도 API 에서 한번에 조회
  const [paymentUsers, setPaymentUsers] = useState<PaymentOverviewUser[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentOverviewSummary | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentPanelOpen, setPaymentPanelOpen] = useState(true);
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | 'problem' | 'all'>('problem');
  const [actingUserId, setActingUserId] = useState<string | null>(null);

  const fetchPaymentOverview = useCallback(async () => {
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const res = await fetch('/api/admin/payments/overview');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '결제 상태 조회 실패');
      setPaymentUsers(data.users || []);
      setPaymentSummary(data.summary || null);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : '결제 상태 조회 실패');
    } finally {
      setPaymentLoading(false);
    }
  }, []);

  /** 카드 미등록 PT생에게 카드 등록 안내 알림 발송 */
  const handleNotifyCardRequired = useCallback(async (ptUserId: string, name: string) => {
    if (!confirm(`${name} 사용자에게 "결제 카드 등록 필요" 안내 알림을 보냅니다. 진행할까요?`)) return;
    setActingUserId(ptUserId);
    try {
      const res = await fetch(`/api/admin/payments/${ptUserId}/notify-card-required`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '알림 발송 실패');
      alert('✅ 알림 발송 완료');
    } catch (err) {
      alert(err instanceof Error ? err.message : '알림 발송 실패');
    } finally {
      setActingUserId(null);
    }
  }, []);

  /** 미제출 PT생 일괄 리포트 요청 알림 */
  const [bulkRequestLoading, setBulkRequestLoading] = useState(false);
  const [bulkRequestResult, setBulkRequestResult] = useState<string | null>(null);
  const handleBulkReportRequest = useCallback(async () => {
    if (!confirm('리포트를 제출하지 않은 모든 PT생에게 일괄 알림을 보냅니다. 진행할까요?')) return;
    setBulkRequestLoading(true);
    setBulkRequestResult(null);
    try {
      const res = await fetch('/api/admin/payments/bulk-report-request', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '발송 실패');
      setBulkRequestResult(`✅ ${data.notified}명에게 리포트 제출 요청 알림 발송 완료 (대상월: ${data.targetMonth})`);
    } catch (err) {
      setBulkRequestResult(err instanceof Error ? `❌ ${err.message}` : '❌ 발송 실패');
    } finally {
      setBulkRequestLoading(false);
    }
  }, []);

  /** 즉시 청구 사이클 트리거 — 직전 마감월 보고서 자동 생성 + awaiting_payment 마킹 */
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  /** 결제 진단 — "왜 결제가 안 됐는지" 추적. 페이지 진입 시 자동 실행. */
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagData, setDiagData] = useState<DiagnosticsData | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);

  /** withModal=true 면 진단 후 모달 자동 오픈, false 면 인라인 배너만 갱신 */
  const runDiagnostics = useCallback(async (withModal = false) => {
    setDiagLoading(true);
    setDiagError(null);
    try {
      const res = await fetch('/api/admin/payments/diagnostics');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '진단 실패');
      setDiagData(data);
      if (withModal) setDiagOpen(true);
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : '진단 실패');
      if (withModal) setDiagOpen(true);
    } finally {
      setDiagLoading(false);
    }
  }, []);

  // 페이지 진입 시 자동 진단 (5분 주기 갱신)
  useEffect(() => {
    runDiagnostics(false);
    const id = setInterval(() => runDiagnostics(false), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [runDiagnostics]);

  /** 결제 락 / overdue 해제 (관리자 수동) */
  const handleResetLock = useCallback(async (ptUserId: string, name: string) => {
    if (!confirm(`${name} 사용자의 결제 락을 즉시 해제합니다. (overdue/lock_level/admin_override 모두 초기화)\n\n진행할까요?`)) return;
    setActingUserId(ptUserId);
    try {
      const res = await fetch(`/api/admin/payment-locks/${ptUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '락 해제 실패');
      alert('✅ 결제 락 해제 완료');
      await fetchPaymentOverview();
    } catch (err) {
      alert(err instanceof Error ? err.message : '락 해제 실패');
    } finally {
      setActingUserId(null);
    }
  }, [fetchPaymentOverview]);

  /** 결제 사이클 제외 설정 */
  const handleSetBillingExclusion = useCallback(async (ptUserId: string, name: string) => {
    const dateStr = prompt(`${name} 사용자를 결제 사이클에서 제외합니다.\n\n언제까지 제외할까요? (YYYY-MM-DD 형식)\n예: 2026-08-31`);
    if (!dateStr) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dateStr)) {
      alert('날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)');
      return;
    }
    const reason = prompt('사유 (선택, 감사 추적용)');
    setActingUserId(ptUserId);
    try {
      const res = await fetch(`/api/admin/payments/${ptUserId}/billing-exemption`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set', excludedUntil: dateStr, reason: reason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '제외 설정 실패');
      alert(`✅ ${name} 사용자가 ${dateStr}까지 결제 사이클에서 제외되었습니다.`);
      await fetchPaymentOverview();
    } catch (err) {
      alert(err instanceof Error ? err.message : '제외 설정 실패');
    } finally {
      setActingUserId(null);
    }
  }, [fetchPaymentOverview]);

  /** 결제 사이클 재포함 (제외 해제) */
  const handleClearBillingExclusion = useCallback(async (ptUserId: string, name: string) => {
    if (!confirm(`${name} 사용자의 결제 사이클 제외를 즉시 해제합니다. 다음 청구일부터 자동결제가 진행됩니다.\n\n진행할까요?`)) return;
    setActingUserId(ptUserId);
    try {
      const res = await fetch(`/api/admin/payments/${ptUserId}/billing-exemption`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '해제 실패');
      alert(`✅ ${name} 사용자가 결제 사이클에 다시 포함되었습니다.`);
      await fetchPaymentOverview();
    } catch (err) {
      alert(err instanceof Error ? err.message : '해제 실패');
    } finally {
      setActingUserId(null);
    }
  }, [fetchPaymentOverview]);

  /** 즉시 결제 재시도 */
  const handleRetryNow = useCallback(async (txId: string, name: string) => {
    if (!confirm(`${name} 사용자의 결제를 즉시 재시도합니다. 진행할까요?`)) return;
    setActingUserId(txId);
    try {
      const res = await fetch(`/api/admin/payments/${txId}/retry-now`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '재시도 실패');
      const r = data.result;
      if (r?.succeeded) alert('✅ 결제 성공');
      else if (r?.finalFailed) alert(`❌ 최종 실패: ${r.errorMessage || r.errorCode}`);
      else alert(`재시도 실패 (${r?.errorMessage || r?.errorCode || '?'}). 24시간 후 자동 재시도됩니다.`);
      await fetchPaymentOverview();
    } catch (err) {
      alert(err instanceof Error ? err.message : '재시도 실패');
    } finally {
      setActingUserId(null);
    }
  }, [fetchPaymentOverview]);

  const fetchTodayRevenue = useCallback(async () => {
    setTodayLoading(true);
    try {
      const res = await fetch('/api/admin/today-revenue');
      const data = await res.json();
      if (res.ok) {
        setTodayTotal(Number(data.totalSales) || 0);
        setTodayPerUser(Array.isArray(data.perUser) ? data.perUser : []);
        setTodayFetchedAt(new Date());
      }
    } catch { /* silent */ }
    finally { setTodayLoading(false); }
  }, []);

  const supabase = useMemo(() => createClient(), []);

  const [fetchError, setFetchError] = useState<string | null>(null);

  /** 데이터 조회. initial=true 면 로딩 스피너 표시, 주기 폴링에서는 false 로 silent */
  const fetchData = useCallback(async (initial = true) => {
    if (initial) setLoading(true);
    setFetchError(null);
    try {
      // pt_users 조회 — error 도 캡처해야 silent fail (RLS/schema cache/quota 등) 진단 가능
      const { data: usersData, error: usersErr } = await supabase
        .from('pt_users')
        .select('*, profile:profiles(*)')
        .neq('status', 'terminated')
        .order('created_at', { ascending: false });

      if (usersErr) {
        console.error('[sales-overview] pt_users 조회 실패:', usersErr);
        setFetchError(`PT 사용자 조회 실패: ${usersErr.message}${usersErr.hint ? ` (힌트: ${usersErr.hint})` : ''}`);
        setUsers([]);
        return;
      }

      const fetchedUsers = (usersData as PtUserWithProfile[]) || [];
      setUsers(fetchedUsers);

      if (fetchedUsers.length > 0) {
        const userIds = fetchedUsers.map(u => u.id);
        const [reportsRes, snapshotsRes] = await Promise.all([
          supabase.from('monthly_reports').select('*').in('pt_user_id', userIds),
          supabase.from('api_revenue_snapshots').select('*').in('pt_user_id', userIds),
        ]);
        if (reportsRes.error) {
          console.error('[sales-overview] monthly_reports 조회 실패:', reportsRes.error);
          setFetchError((prev) => prev || `리포트 조회 실패: ${reportsRes.error.message}`);
        }
        if (snapshotsRes.error) {
          console.error('[sales-overview] api_revenue_snapshots 조회 실패:', snapshotsRes.error);
          setFetchError((prev) => prev || `매출 스냅샷 조회 실패: ${snapshotsRes.error.message}`);
        }
        setReports((reportsRes.data as MonthlyReport[]) || []);
        setSnapshots((snapshotsRes.data as ApiRevenueSnapshot[]) || []);
      } else {
        setReports([]);
        setSnapshots([]);
      }
      setLastRefreshAt(new Date());
    } catch (err) {
      console.error('sales-overview fetch error:', err);
      setFetchError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      if (initial) setLoading(false);
    }
  }, [supabase]);

  /** 지금 즉시 실제 결제 실행 — Toss 빌링키로 awaiting_payment 모두 결제 */
  const [executeLoading, setExecuteLoading] = useState(false);
  const [executeResult, setExecuteResult] = useState<string | null>(null);
  const handleExecuteBillingNow = useCallback(async () => {
    if (!confirm(
      '⚠️ 지금 즉시 실제 결제를 실행합니다.\n\n' +
      '대상: fee_payment_status="awaiting_payment/overdue/suspended" 인 모든 리포트\n' +
      'Toss 빌링키로 카드 결제가 즉시 시도됩니다.\n\n' +
      '중복 결제 방지: paid 리포트는 자동 제외, UNIQUE 제약 + 멱등 RPC + 락으로 다층 차단.\n\n' +
      '진행할까요?'
    )) return;
    setExecuteLoading(true);
    setExecuteResult(null);
    try {
      const res = await fetch('/api/admin/payments/execute-billing-now', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '결제 실행 실패');
      const failureSummary = data.failures && data.failures.length > 0
        ? ` 실패 사유: ${data.failures.slice(0, 3).map((f: { reason: string }) => f.reason).join(', ')}`
        : '';
      setExecuteResult(
        `✅ 결제 시도 ${data.processed}건 — 성공 ${data.succeeded} · 실패 ${data.failed} · 카드없음 ${data.skippedNoCard} · 결제제외 ${data.skippedExcluded}.${failureSummary}`
      );
      await fetchData(false);
      await fetchPaymentOverview();
    } catch (err) {
      setExecuteResult(err instanceof Error ? `❌ ${err.message}` : '❌ 결제 실행 실패');
    } finally {
      setExecuteLoading(false);
    }
  }, [fetchData, fetchPaymentOverview]);

  const handleTriggerBilling = useCallback(async (requireSignedContract: boolean) => {
    const msg = requireSignedContract
      ? '직전 마감월 보고서를 자동 생성하고 즉시 청구 가능 상태로 만듭니다.\n(signed 계약 PT생만 대상, 광고비=0 가정)\n\n진행할까요?'
      : '⚠️ 모든 PT생(미서명자 포함)에 대해 직전 마감월 보고서를 자동 생성합니다.\n광고비=0 가정으로 즉시 청구 가능 상태가 됩니다.\n\n진행할까요?';
    if (!confirm(msg)) return;
    setTriggerLoading(true);
    setTriggerResult(null);
    try {
      const res = await fetch('/api/admin/payments/trigger-billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requireSignedContract }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '트리거 실패');
      setTriggerResult(
        `✅ ${data.targetMonth} 보고서 ${data.created}건 생성 (이미 존재 ${data.skippedExisting} · 매출 없음 ${data.skippedNoRevenue} · 에러 ${data.errored}). 다음 cron(매월 3일) 또는 즉시 결제 트리거에서 청구됩니다.`
      );
      await fetchData(false);
    } catch (err) {
      setTriggerResult(err instanceof Error ? `❌ ${err.message}` : '❌ 트리거 실패');
    } finally {
      setTriggerLoading(false);
    }
  }, [fetchData]);

  /** 백그라운드 자동 동기화 — 조용히 실행, 실패해도 UI 방해 없음 */
  const triggerAutoSync = useCallback(async () => {
    const now = Date.now();
    // 5분 이내 재실행 방지
    if (now - autoSyncLockRef.current < 5 * 60 * 1000) return;
    autoSyncLockRef.current = now;
    setAutoSyncStatus('syncing');
    try {
      const res = await fetch('/api/admin/coupang-revenue-sync', { method: 'POST' });
      if (!res.ok) throw new Error('sync failed');
      setAutoSyncStatus('ok');
      await fetchData(false);
    } catch {
      setAutoSyncStatus('error');
    }
  }, [fetchData]);

  /** 수동 즉시 동기화 — confirm 프롬프트 */
  const handleSyncNow = useCallback(async () => {
    if (!confirm('연동된 모든 PT생의 쿠팡 API 매출을 즉시 재동기화합니다. 15분 주기 자동 동기화와 별개로 강제 실행. 진행할까요?')) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/admin/coupang-revenue-sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '동기화 실패');
      setSyncMessage(`${data.totalUsers}명 × ${data.yearMonths?.length || 0}개월 — 성공 ${data.totalSynced}건, 실패 ${data.totalFailed}건 (${Math.round((data.elapsedMs || 0) / 1000)}초)`);
      autoSyncLockRef.current = Date.now();
      await fetchData(false);
    } catch (err) {
      setSyncMessage(err instanceof Error ? `❌ ${err.message}` : '❌ 동기화 실패');
    } finally {
      setSyncing(false);
    }
  }, [fetchData]);

  useEffect(() => { fetchData(true); }, [fetchData]);

  // 오늘 실시간 매출 — 최초 진입 + 5분 주기
  useEffect(() => {
    fetchTodayRevenue();
    const id = setInterval(fetchTodayRevenue, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchTodayRevenue]);

  // 결제 상태 — 최초 + 1분 주기 (카드 미등록/락/재시도 변동 추적)
  useEffect(() => {
    fetchPaymentOverview();
    const id = setInterval(fetchPaymentOverview, 60 * 1000);
    return () => clearInterval(id);
  }, [fetchPaymentOverview]);

  /** 초기 로드 후: 스냅샷이 10분 이상 묵었으면 자동 동기화 */
  useEffect(() => {
    if (loading || users.length === 0) return;
    const latestSync = snapshots.reduce((max, s) => s.synced_at > max ? s.synced_at : max, '');
    const stale = !latestSync || (Date.now() - new Date(latestSync).getTime() > 10 * 60 * 1000);
    const hasConnectedUser = users.some(u => u.coupang_api_connected);
    if (stale && hasConnectedUser) {
      triggerAutoSync();
    }
  }, [loading, users, snapshots, triggerAutoSync]);

  /** 1분마다 자동 재조회 — 크론(15분마다)이 갱신한 스냅샷을 계속 반영 */
  useEffect(() => {
    const refreshId = setInterval(() => { fetchData(false); }, 60 * 1000);
    /** 5분마다 stale 체크 → 자동 동기화 재트리거 */
    const syncCheckId = setInterval(() => {
      const latestSync = snapshots.reduce((max, s) => s.synced_at > max ? s.synced_at : max, '');
      const stale = !latestSync || (Date.now() - new Date(latestSync).getTime() > 10 * 60 * 1000);
      if (stale && users.some(u => u.coupang_api_connected)) {
        triggerAutoSync();
      }
    }, 5 * 60 * 1000);
    return () => { clearInterval(refreshId); clearInterval(syncCheckId); };
  }, [fetchData, snapshots, users, triggerAutoSync]);

  const months = useMemo(() => getRecentMonths(monthRange), [monthRange]);
  const currentMonth = months[0]; // 당월 (진행중, 4월)
  // 직전 마감월 — 청구 수수료 기준 (PT생이 보고해야 할 가장 최근 월)
  const lastClosedMonth = months[1] || months[0];

  /** 사용자별 집계 계산 — monthly_reports(확정) ∪ api_revenue_snapshots(잠정) */
  const rows = useMemo<UserRow[]>(() => {
    const reportsByUser = new Map<string, MonthlyReport[]>();
    for (const r of reports) {
      const list = reportsByUser.get(r.pt_user_id) || [];
      list.push(r);
      reportsByUser.set(r.pt_user_id, list);
    }

    const snapshotsByUser = new Map<string, ApiRevenueSnapshot[]>();
    for (const s of snapshots) {
      const list = snapshotsByUser.get(s.pt_user_id) || [];
      list.push(s);
      snapshotsByUser.set(s.pt_user_id, list);
    }

    return users.map(user => {
      const userReports = reportsByUser.get(user.id) || [];
      const userSnaps = snapshotsByUser.get(user.id) || [];
      const monthly = new Map<string, MonthCell>();

      // 표시 월별 집계: report 우선, 없으면 snapshot
      for (const ym of months) {
        const report = userReports.find(r => r.year_month === ym);
        const snap = userSnaps.find(s => s.year_month === ym);
        const isEligible = isEligibleForMonth(user.created_at, ym);

        if (report) {
          const revenue = report.reported_revenue || 0;
          const deposit = report.admin_deposit_amount
            || report.calculated_deposit
            || calculateDeposit(revenue, getReportCosts(report), user.share_percentage);
          // 우리 수수료(VAT 포함) — report 에 저장된 값 우선, 없으면 deposit×1.1
          const fee = Number(report.total_with_vat) || Math.round(deposit * 1.1);
          monthly.set(ym, {
            revenue,
            deposit,
            fee,
            status: report.payment_status,
            isEligible: true,
            source: 'report',
            feeStatus: report.fee_payment_status ?? null,
            feePaidAt: report.fee_paid_at ?? null,
          });
        } else if (snap && (snap.total_sales > 0 || !snap.sync_error)) {
          // API 스냅샷: 매출 기반 기본 비용률(원가 40%·세금 10% 등) 적용한 잠정 정산
          //   - 광고비는 PT생이 리포트 제출해야 알 수 있으므로 0 가정
          //   - 실제보다 과대평가될 수 있음 (광고비 미반영)
          const revenue = Number(snap.total_sales) || 0;
          const deposit = revenue > 0
            ? calculateDeposit(
                revenue,
                buildCostBreakdown(revenue, 0), // 자동 비용률 적용, 광고비 0
                user.share_percentage,
              )
            : 0;
          monthly.set(ym, {
            revenue,
            deposit,
            fee: Math.round(deposit * 1.1),
            status: 'api_pending',
            isEligible,
            source: 'api',
            syncedAt: snap.synced_at,
            syncError: snap.sync_error,
          });
        } else {
          monthly.set(ym, {
            revenue: 0,
            deposit: 0,
            fee: 0,
            status: 'none',
            isEligible,
            source: 'none',
            syncError: snap?.sync_error || null,
          });
        }
      }

      // 누적 합계: report 월은 report, 그 외 월은 snapshot
      const reportMonths = new Set(userReports.map(r => r.year_month));
      let totalRevenue = 0;
      let totalDeposit = 0;
      for (const r of userReports) {
        totalRevenue += r.reported_revenue || 0;
        totalDeposit += r.admin_deposit_amount
          || r.calculated_deposit
          || calculateDeposit(r.reported_revenue || 0, getReportCosts(r), user.share_percentage);
      }
      for (const s of userSnaps) {
        if (reportMonths.has(s.year_month)) continue;
        const rev = Number(s.total_sales) || 0;
        if (rev <= 0) continue;
        totalRevenue += rev;
        totalDeposit += calculateDeposit(
          rev,
          buildCostBreakdown(rev, 0),
          user.share_percentage,
        );
      }

      const curr = monthly.get(currentMonth)!;
      const currentStatus = getSettlementStatus(
        user.created_at,
        curr.source === 'report' ? curr.status : null,
        currentMonth,
      );

      const latestSync = userSnaps.length > 0
        ? userSnaps.reduce((max, s) => s.synced_at > max ? s.synced_at : max, '')
        : null;

      return {
        user,
        monthly,
        totalRevenue,
        totalDeposit,
        currentRevenue: curr.revenue,
        currentDeposit: curr.deposit,
        currentStatus,
        apiConnected: !!user.coupang_api_connected,
        latestSyncedAt: latestSync || null,
      };
    });
  }, [users, reports, snapshots, months, currentMonth]);

  /** 필터링 + 정렬 */
  const filteredRows = useMemo(() => {
    let result = rows;

    // 검색
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(r =>
        (r.user.profile?.full_name || '').toLowerCase().includes(q) ||
        (r.user.profile?.email || '').toLowerCase().includes(q)
      );
    }

    // 상태 필터
    if (statusFilter !== 'all') {
      result = result.filter(r => r.currentStatus === statusFilter);
    }

    // 정렬
    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = (a.user.profile?.full_name || '').localeCompare(b.user.profile?.full_name || '', 'ko');
          break;
        case 'created':
          cmp = new Date(a.user.created_at).getTime() - new Date(b.user.created_at).getTime();
          break;
        case 'currentRevenue':
          cmp = a.currentRevenue - b.currentRevenue;
          break;
        case 'currentDeposit':
          cmp = a.currentDeposit - b.currentDeposit;
          break;
        case 'totalRevenue':
          cmp = a.totalRevenue - b.totalRevenue;
          break;
        case 'totalDeposit':
          cmp = a.totalDeposit - b.totalDeposit;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [rows, search, statusFilter, sortKey, sortDir]);

  /** pt_user_id → 결제 상태 빠른 조회 맵 (apiPotentialFees / 매트릭스 인라인 배지에서 사용) */
  const paymentByUser = useMemo(() => {
    const map = new Map<string, PaymentOverviewUser>();
    for (const p of paymentUsers) map.set(p.pt_user_id, p);
    return map;
  }, [paymentUsers]);

  /** API 잠정 수수료 합계 — "리포트 없이도 받아야 할 추정 금액" */
  const apiPotentialFees = useMemo(() => {
    // currentMonth 제외한 마감월에서 source='api' (리포트 없음) 인 셀의 fee 합산.
    // monthly_reports 가 생성 안 된 PT생/월의 잠재 청구액을 보여준다.
    let totalPotential = 0;
    let lastClosedPotential = 0;
    let lastClosedUserCount = 0;
    const lastClosedDetails: Array<{ ptUserId: string; name: string; email: string; fee: number; revenue: number; isExcluded: boolean; excludedUntil: string | null }> = [];

    for (const row of rows) {
      for (const ym of months) {
        if (ym === currentMonth) continue;
        const m = row.monthly.get(ym);
        if (!m || m.source !== 'api') continue;
        if (m.fee <= 0) continue;
        totalPotential += m.fee;
        if (ym === lastClosedMonth) {
          lastClosedPotential += m.fee;
          lastClosedUserCount++;
          const pay = paymentByUser.get(row.user.id);
          lastClosedDetails.push({
            ptUserId: row.user.id,
            name: row.user.profile?.full_name || row.user.profile?.email || row.user.id.slice(0, 8),
            email: row.user.profile?.email || '',
            fee: m.fee,
            revenue: m.revenue,
            isExcluded: pay?.status === 'excluded',
            excludedUntil: pay?.billing_excluded_until ?? null,
          });
        }
      }
    }
    lastClosedDetails.sort((a, b) => b.fee - a.fee);
    return {
      totalPotential,
      lastClosedPotential,
      lastClosedUserCount,
      lastClosedDetails,
    };
  }, [rows, months, currentMonth, lastClosedMonth, paymentByUser]);

  /** 누적 수금 현황 — "지금까지 받은 돈 / 못 받은 돈" 한눈에 */
  const cashflow = useMemo(() => {
    let billedTotal = 0;       // 누적 청구액 (paid + awaiting + overdue + suspended)
    let paidTotal = 0;         // 실제 수금
    let awaitingTotal = 0;     // 결제 대기 (아직 청구일 안 옴)
    let overdueTotal = 0;      // 미납 (청구일 지남, 재시도중)
    let suspendedTotal = 0;    // 정지 (최종실패)
    let paidCount = 0;
    let awaitingCount = 0;
    let overdueCount = 0;
    let suspendedCount = 0;

    // 이번 청구일(직전 마감월) 기준 — "오늘 자동결제로 들어온 돈"
    let lastMonthBilled = 0;
    let lastMonthPaid = 0;
    let lastMonthPaidCount = 0;
    let lastMonthBilledCount = 0;

    // 미수금 PT생별 세부
    const debtByUser = new Map<string, { name: string; amount: number; months: string[] }>();

    for (const r of reports) {
      const amount = Number(r.total_with_vat) || 0;
      const status = r.fee_payment_status;
      if (amount <= 0 || status === 'not_applicable' || status === 'awaiting_review') continue;

      billedTotal += amount;

      const u = users.find((x) => x.id === r.pt_user_id);
      const name = u?.profile?.full_name || u?.profile?.email || r.pt_user_id.slice(0, 8);

      if (status === 'paid') {
        paidTotal += amount;
        paidCount++;
      } else if (status === 'awaiting_payment') {
        awaitingTotal += amount;
        awaitingCount++;
      } else if (status === 'overdue') {
        overdueTotal += amount;
        overdueCount++;
      } else if (status === 'suspended') {
        suspendedTotal += amount;
        suspendedCount++;
      }

      // 미수금 누적 (PT생별 합산)
      if (status !== 'paid') {
        const prev = debtByUser.get(r.pt_user_id) || { name, amount: 0, months: [] };
        prev.amount += amount;
        prev.months.push(r.year_month);
        debtByUser.set(r.pt_user_id, prev);
      }

      // 이번 청구 사이클(직전 마감월)
      if (r.year_month === lastClosedMonth) {
        lastMonthBilled += amount;
        lastMonthBilledCount++;
        if (status === 'paid') {
          lastMonthPaid += amount;
          lastMonthPaidCount++;
        }
      }
    }

    const collectionRate = billedTotal > 0 ? Math.round((paidTotal / billedTotal) * 100) : 0;
    const lastMonthRate = lastMonthBilled > 0 ? Math.round((lastMonthPaid / lastMonthBilled) * 100) : 0;
    const unpaidTotal = awaitingTotal + overdueTotal + suspendedTotal;

    return {
      billedTotal, paidTotal, unpaidTotal,
      awaitingTotal, overdueTotal, suspendedTotal,
      paidCount, awaitingCount, overdueCount, suspendedCount,
      collectionRate,
      lastMonthBilled, lastMonthPaid, lastMonthPaidCount, lastMonthBilledCount,
      lastMonthRate,
      debtList: Array.from(debtByUser.values()).sort((a, b) => b.amount - a.amount),
    };
  }, [reports, users, lastClosedMonth]);

  /** 직전 마감월 결제 결과 — "내일 결제됐는지" 한눈에 보기용 */
  const billingResult = useMemo(() => {
    const lastReports = reports.filter((r) => r.year_month === lastClosedMonth);
    const buckets = { paid: 0, awaiting_payment: 0, overdue: 0, suspended: 0, awaiting_review: 0, not_applicable: 0 };
    let paidAmount = 0;
    let unpaidAmount = 0;
    const paidUsers: string[] = [];
    const unpaidUsers: { name: string; status: string; amount: number }[] = [];
    for (const r of lastReports) {
      const status = (r.fee_payment_status || 'not_applicable') as keyof typeof buckets;
      if (status in buckets) buckets[status]++;
      const amount = Number(r.total_with_vat) || 0;
      const u = users.find((x) => x.id === r.pt_user_id);
      const name = u?.profile?.full_name || u?.profile?.email || r.pt_user_id.slice(0, 8);
      if (status === 'paid') {
        paidAmount += amount;
        paidUsers.push(name);
      } else if (status === 'awaiting_payment' || status === 'overdue' || status === 'suspended') {
        unpaidAmount += amount;
        unpaidUsers.push({ name, status, amount });
      }
    }
    return {
      total: lastReports.length,
      ...buckets,
      paidAmount,
      unpaidAmount,
      paidUsers,
      unpaidUsers,
    };
  }, [reports, users, lastClosedMonth]);

  /** 요약 통계 (당월 기준) */
  const summary = useMemo(() => {
    const eligible = rows.filter(r => isEligibleForMonth(r.user.created_at, currentMonth));
    const totalRev = eligible.reduce((s, r) => s + r.currentRevenue, 0);
    const totalDep = eligible.reduce((s, r) => s + r.currentDeposit, 0);
    const completed = eligible.filter(r => r.currentStatus === 'completed').length;
    const submitted = eligible.filter(r => r.currentStatus === 'submitted').length;
    const overdue = eligible.filter(r => r.currentStatus === 'overdue').length;
    const pending = eligible.filter(r => r.currentStatus === 'pending').length;
    const completionRate = eligible.length > 0
      ? Math.round(((completed + submitted) / eligible.length) * 100)
      : 0;

    // 직전 마감월 청구 수수료 (PT생이 우리에게 결제할 금액, VAT 포함)
    //   currentMonth=4월(진행중) 이라 4월 보고서는 아직 없음 → 직전 마감월(3월) 기준으로 청구액 계산
    const billingReports = reports.filter(r => r.year_month === lastClosedMonth);
    // 당월(4월) 진행중 매출 기반 추정 수수료 — snapshot.fee 합산 (위 cell 계산 결과 활용)
    const currentMonthFeeEstimate = rows.reduce((s, r) => {
      const m = r.monthly.get(currentMonth);
      return s + (m?.fee || 0);
    }, 0);
    let feeBilledTotal = 0;
    let feePaidTotal = 0;
    let feeDueTotal = 0;
    let feePaidCount = 0;
    let feeDueCount = 0;
    for (const r of billingReports) {
      const amount = Number(r.total_with_vat) || 0;
      if (amount <= 0) continue;
      feeBilledTotal += amount;
      if (r.fee_payment_status === 'paid') {
        feePaidTotal += amount;
        feePaidCount++;
      } else if (r.fee_payment_status !== 'not_applicable') {
        feeDueTotal += amount;
        feeDueCount++;
      }
    }

    return {
      totalRev,
      totalDep,
      eligible: eligible.length,
      completed,
      submitted,
      overdue,
      pending,
      completionRate,
      feeBilledTotal,
      feePaidTotal,
      feeDueTotal,
      feePaidCount,
      feeDueCount,
      currentMonthFeeEstimate,
    };
  }, [rows, reports, currentMonth, lastClosedMonth]);

  /** 월별 총합 (matrix 하단 합계행) */
  const monthTotals = useMemo(() => {
    const totals: Record<string, { revenue: number; deposit: number; fee: number }> = {};
    for (const ym of months) {
      totals[ym] = { revenue: 0, deposit: 0, fee: 0 };
      for (const row of filteredRows) {
        const m = row.monthly.get(ym);
        if (m) {
          totals[ym].revenue += m.revenue;
          totals[ym].deposit += m.deposit;
          totals[ym].fee += m.fee;
        }
      }
    }
    const totalCumRev = filteredRows.reduce((s, r) => s + r.totalRevenue, 0);
    const totalCumDep = filteredRows.reduce((s, r) => s + r.totalDeposit, 0);
    const totalCumFee = Object.values(totals).reduce((s, t) => s + t.fee, 0);
    return { totals, totalCumRev, totalCumDep, totalCumFee };
  }, [filteredRows, months]);

  /** 패널에 표시할 PT생 목록 (필터 적용) */
  const filteredPaymentRows = useMemo(() => {
    if (paymentFilter === 'all') return paymentUsers;
    if (paymentFilter === 'problem') {
      return paymentUsers.filter((p) => p.status !== 'normal');
    }
    return paymentUsers.filter((p) => p.status === paymentFilter);
  }, [paymentUsers, paymentFilter]);

  /** 정렬 토글 */
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  /** CSV 내보내기 */
  const exportCsv = () => {
    const headers: string[] = ['사용자명', '이메일', '가입일', '상태', '수수료율'];
    for (const ym of [...months].reverse()) {
      headers.push(`${ym} 매출`, `${ym} 정산`, `${ym} 상태`);
    }
    headers.push('누적 매출', '누적 정산');

    const rows = filteredRows.map(r => {
      const cells: string[] = [
        r.user.profile?.full_name || '',
        r.user.profile?.email || '',
        r.user.created_at.slice(0, 10),
        r.user.status,
        `${r.user.share_percentage}%`,
      ];
      for (const ym of [...months].reverse()) {
        const m = r.monthly.get(ym)!;
        const statusLabel = m.source === 'api'
          ? 'API 잠정'
          : m.source === 'none'
            ? (m.isEligible ? '미제출' : '-')
            : (PAYMENT_STATUS_LABELS[m.status] || m.status);
        cells.push(String(m.revenue), String(m.deposit), statusLabel);
      }
      cells.push(String(r.totalRevenue), String(r.totalDeposit));
      return cells;
    });

    // 합계 행
    const totalRow: string[] = ['합계', '', '', '', ''];
    for (const ym of [...months].reverse()) {
      const t = monthTotals.totals[ym];
      totalRow.push(String(t.revenue), String(t.deposit), '');
    }
    totalRow.push(String(monthTotals.totalCumRev), String(monthTotals.totalCumDep));
    rows.push(totalRow);

    // CSV 문자열 생성 (Excel 한글 호환 BOM 포함)
    const escapeCsv = (v: string) => {
      if (v.includes(',') || v.includes('"') || v.includes('\n')) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    };
    const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(escapeCsv).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `매출현황_${currentMonth}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  /** 셀 렌더링 */
  const renderCell = (m: MonthCell, ym: string) => {
    // 직전 마감월 이전(과거 마감월)은 결제 사이클이 끝났어야 하는 달.
    // 진행중월(currentMonth) 이외는 모두 closed 로 본다.
    const isClosedMonth = ym !== currentMonth;

    if (!m.isEligible && m.source === 'none') {
      return <span className="text-xs text-gray-300">-</span>;
    }
    if (m.source === 'none') {
      return (
        <div className="flex flex-col items-end gap-0.5">
          {isClosedMonth ? (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-800 border border-gray-300">
              📝 리포트 미제출
            </span>
          ) : (
            <span className="text-xs text-gray-400">미제출</span>
          )}
          {m.syncError && (
            <span className="text-[9px] text-red-500" title={m.syncError}>API 오류</span>
          )}
        </div>
      );
    }
    if (m.source === 'api') {
      return (
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs font-semibold text-blue-700">{formatKRW(m.revenue)}</span>
          <span className="text-[11px] text-emerald-700 font-medium" title="우리 수수료 (VAT 포함)">
            +{formatKRW(m.fee)} 수수료
          </span>
          {isClosedMonth ? (
            // 마감월인데 리포트 미제출 → 결제 사이클 진입 못함을 명확히 알림
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-800 border border-gray-300"
              title="PT생이 매출 리포트를 제출하지 않아 자동결제 대상이 아님"
            >
              📝 리포트 미제출
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-50 text-blue-700 border border-blue-200"
              title="진행중 — API 자동수집 잠정값"
            >
              <Zap className="w-2.5 h-2.5" /> 진행중
            </span>
          )}
        </div>
      );
    }
    const statusColor = PAYMENT_STATUS_COLORS[m.status] || 'bg-gray-100 text-gray-700';
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-xs font-semibold text-gray-900">{formatKRW(m.revenue)}</span>
        <span className="text-[11px] text-emerald-700 font-medium" title="우리 수수료 (VAT 포함)">
          +{formatKRW(m.fee)} 수수료
        </span>
        <FeeStatusBadge feeStatus={m.feeStatus ?? null} feePaidAt={m.feePaidAt ?? null} />
        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${statusColor}`}>
          {PAYMENT_STATUS_LABELS[m.status] || m.status}
        </span>
      </div>
    );
  };

  const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => {
    if (!active) return <ArrowUpDown className="w-3 h-3 inline-block ml-0.5 text-gray-300" />;
    return dir === 'asc'
      ? <ArrowUp className="w-3 h-3 inline-block ml-0.5 text-[#E31837]" />
      : <ArrowDown className="w-3 h-3 inline-block ml-0.5 text-[#E31837]" />;
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Table2 className="w-6 h-6 text-[#E31837]" />
            매출 현황
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            전체 PT 사용자의 월별 매출·정산액을 한눈에 확인합니다 (기준월: {formatYearMonth(currentMonth)})
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            <Zap className="w-3 h-3 inline text-blue-500" /> API 잠정 매출 = 쿠팡 ordersheets(주문 기준, 취소 제외) · 빠른정산 수령액과 가까움 · 확정은 PT생 리포트 제출 후
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            잠정 정산액은 기본 비용률(원가40%·수수료10%·세금10%·반품3%·배송5%) 적용 · 광고비는 0 가정이라 실제보다 높을 수 있음
          </p>
          <div className="flex items-center gap-2 mt-1 text-[11px]">
            {autoSyncStatus === 'syncing' ? (
              <span className="inline-flex items-center gap-1 text-blue-600">
                <RefreshCw className="w-3 h-3 animate-spin" /> 자동 동기화 중...
              </span>
            ) : autoSyncStatus === 'error' ? (
              <span className="text-red-600">⚠️ 자동 동기화 실패 · 수동 버튼으로 재시도 가능</span>
            ) : (
              <span className="text-green-600">● 실시간 자동 동기화 활성 (15분 크론 + 1분 폴링)</span>
            )}
            {lastRefreshAt && (
              <span className="text-gray-400">· 마지막 갱신 {lastRefreshAt.toLocaleTimeString('ko-KR')}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncNow}
            disabled={syncing || loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            title="자동 동기화와 별개로 즉시 강제 동기화"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? '동기화 중...' : '강제 동기화'}
          </button>
          <button
            onClick={exportCsv}
            disabled={loading || filteredRows.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
          >
            <Download className="w-4 h-4" />
            CSV 내보내기
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-2 rounded-lg text-sm">
          {syncMessage}
        </div>
      )}

      {/* 데이터 조회 에러 — Supabase RLS / quota / schema cache 등 silent fail 노출 */}
      {fetchError && (
        <div className="bg-red-50 border-2 border-red-300 text-red-900 px-4 py-3 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-sm">데이터 조회 실패 — 페이지가 비어보이는 이유</p>
              <p className="text-xs text-red-800 mt-1 break-all">{fetchError}</p>
              <div className="mt-2 text-[11px] text-red-700 space-y-0.5">
                <p>가능한 원인:</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li><strong>Supabase quota 초과</strong>: 상단 노란 배너 확인 (5/28 grace 종료)</li>
                  <li><strong>schema cache 미갱신</strong>: 새 컬럼 추가 직후라면 Supabase 대시보드 → API → "Reload schema" 클릭</li>
                  <li><strong>RLS 정책 변경</strong>: pt_users / monthly_reports 의 SELECT 권한 확인</li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => fetchData(false)}
                className="mt-2 px-3 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700"
              >
                다시 시도
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 자동 결제 진단 — 페이지 진입 시 자동 실행. 차단 사유가 있으면 빨간 배너로 강조. */}
      {diagData && (() => {
        const s = diagData.summary;
        const hasBlocker = s.signedPtUsers === 0 || s.lastReportCount === 0 || s.eligibleForBilling === 0 || s.usersWithCard === 0;
        const reviewStuck = (diagData.reportFeeStatusDist.awaiting_review || 0);
        return (
          <div className={`rounded-xl border-2 overflow-hidden ${hasBlocker ? 'border-red-400 bg-red-50' : 'border-green-400 bg-green-50'}`}>
            <div className={`px-5 py-3 flex items-center justify-between flex-wrap gap-2 ${hasBlocker ? 'bg-red-100' : 'bg-green-100'}`}>
              <div className="flex items-center gap-2">
                <Stethoscope className={`w-5 h-5 ${hasBlocker ? 'text-red-700' : 'text-green-700'}`} />
                <h2 className={`text-base font-bold ${hasBlocker ? 'text-red-900' : 'text-green-900'}`}>
                  {hasBlocker ? '🚨 자동결제 차단 사유 감지' : '✅ 자동결제 정상 작동 중'}
                </h2>
                <span className="text-xs text-gray-600">5분마다 자동 진단</span>
              </div>
              <button
                type="button"
                onClick={() => runDiagnostics(true)}
                className="text-xs font-medium text-gray-700 hover:underline inline-flex items-center gap-1"
              >
                <Stethoscope className="w-3 h-3" /> 상세 리포트 열기
              </button>
            </div>

            <div className={`px-5 py-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm ${hasBlocker ? '' : ''}`}>
              <DiagInline
                label="signed 계약 PT생"
                value={`${s.signedPtUsers}/${s.totalPtUsers}명`}
                bad={s.signedPtUsers === 0}
                hint={s.signedPtUsers === 0 ? '계약 서명 0명 — cron이 모두 skip' : undefined}
              />
              <DiagInline
                label="활성 카드 보유"
                value={`${s.usersWithCard}명`}
                bad={s.usersWithCard === 0}
                hint={s.usersWithCard === 0 ? '결제 수단 0' : undefined}
              />
              <DiagInline
                label={`${s.lastClosedMonth} 보고서`}
                value={`${s.lastReportCount}건`}
                bad={s.lastReportCount === 0}
                warn={reviewStuck > 0}
                hint={s.lastReportCount === 0 ? '자동 생성 cron 미실행 또는 대상 없음' : reviewStuck > 0 ? `${reviewStuck}건 검토대기 (PT생 확정 필요)` : undefined}
              />
              <DiagInline
                label="청구 가능 보고서"
                value={`${s.eligibleForBilling}건`}
                bad={s.eligibleForBilling === 0}
                hint={s.eligibleForBilling === 0 ? 'awaiting_payment 0건 = 결제 대상 없음' : undefined}
              />
              <DiagInline
                label="오늘 자동결제 시도"
                value={`${s.todayAutoTxCount}건`}
                bad={s.todayAutoTxCount === 0 && s.eligibleForBilling > 0}
                hint={s.todayAutoTxCount === 0 && s.eligibleForBilling > 0 ? 'cron 미실행 의심 (CRON_SECRET 확인)' : undefined}
              />
            </div>

            {/* 차단 사유 텍스트 */}
            {diagData.reasons.length > 0 && (
              <div className="px-5 py-3 border-t border-gray-200 space-y-1.5 bg-white">
                {diagData.reasons.map((r, i) => (
                  <p
                    key={i}
                    className={`text-sm leading-snug ${
                      r.startsWith('🚨') ? 'text-red-800 font-semibold' :
                      r.startsWith('⚠️') ? 'text-amber-800' :
                      'text-green-700'
                    }`}
                  >
                    {r}
                  </p>
                ))}
              </div>
            )}

            {/* 즉시 해결 가이드 */}
            {hasBlocker && (
              <div className="px-5 py-3 bg-white border-t border-gray-200">
                <p className="text-[12px] font-bold text-gray-700 mb-1.5">💡 다음 조치를 해주세요:</p>
                <ul className="text-[12px] text-gray-700 space-y-1 list-disc pl-5">
                  {s.signedPtUsers === 0 && (
                    <li>
                      <a href="/admin/contracts" className="text-blue-600 underline">/admin/contracts</a>에서 PT생 계약을 'signed' 상태로 처리
                    </li>
                  )}
                  {s.lastReportCount === 0 && s.signedPtUsers > 0 && (
                    <li>
                      매월 1일 KST 03:00에 자동 생성되는 보고서가 누락됨 — Vercel 대시보드에서 <code className="bg-gray-100 px-1">/api/cron/monthly-report-auto-create</code> 실행 로그 확인. CRON_SECRET 환경변수가 설정되어 있어야 함
                    </li>
                  )}
                  {reviewStuck > 0 && (
                    <li>
                      {reviewStuck}건이 PT생 확정 대기 중 — PT생에게 <code className="bg-gray-100 px-1">/my/report</code> 페이지에서 "확정" 버튼 클릭하라고 안내
                    </li>
                  )}
                  {s.usersWithCard === 0 && s.signedPtUsers > 0 && (
                    <li>
                      PT생들에게 <code className="bg-gray-100 px-1">/my/settings</code>에서 결제 카드 등록 안내 (위 결제 상태 패널의 "카드 안내" 버튼 사용)
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        );
      })()}

      {diagError && !diagData && (
        <div className="bg-red-50 border border-red-200 text-red-900 px-4 py-2 rounded-lg text-sm flex items-center justify-between">
          <span>⚠️ 진단 API 호출 실패: {diagError}</span>
          <button type="button" onClick={() => runDiagnostics(true)} className="text-xs underline">다시 시도</button>
        </div>
      )}

      {/* 누적 수금 현황 — 우리가 지금까지 얼마 받았는지 한눈에 */}
      <div className="bg-gradient-to-r from-emerald-50 via-white to-amber-50 border-2 border-emerald-300 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2 bg-white/60">
          <div className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-emerald-700" />
            <h2 className="text-base font-bold text-gray-900">수금 현황 (누적)</h2>
            <span className="text-xs text-gray-500">PT생 → 우리 수수료 결제 기준 · VAT 포함</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">입금률</span>
            <span className={`px-2 py-0.5 rounded font-bold ${
              cashflow.collectionRate >= 90 ? 'bg-green-100 text-green-700' :
              cashflow.collectionRate >= 70 ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'
            }`}>
              {cashflow.collectionRate}%
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-gray-200">
          <div className="px-5 py-4 bg-white">
            <p className="text-[11px] font-semibold text-gray-600 uppercase">📋 누적 청구액</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatKRW(cashflow.billedTotal)}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">전체 리포트 합계 (VAT 포함)</p>
          </div>
          <div className="px-5 py-4 bg-green-50/60">
            <p className="text-[11px] font-semibold text-green-700 uppercase">💰 누적 수금액</p>
            <p className="text-2xl font-bold text-green-700 mt-1">{formatKRW(cashflow.paidTotal)}</p>
            <p className="text-[11px] text-green-700 mt-0.5">{cashflow.paidCount}건 결제 완료</p>
          </div>
          <div className="px-5 py-4 bg-orange-50/60">
            <p className="text-[11px] font-semibold text-orange-700 uppercase">⚠️ 미수금</p>
            <p className="text-2xl font-bold text-orange-700 mt-1">{formatKRW(cashflow.unpaidTotal)}</p>
            <p className="text-[11px] text-orange-700 mt-0.5">
              대기 {cashflow.awaitingCount} · 미납 {cashflow.overdueCount} · 정지 {cashflow.suspendedCount}
            </p>
          </div>
          <div className="px-5 py-4 bg-emerald-50/60">
            <p className="text-[11px] font-semibold text-emerald-700 uppercase">📅 {formatYearMonth(lastClosedMonth)} 청구분</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">
              {formatKRW(cashflow.lastMonthPaid)}<span className="text-xs font-medium text-emerald-600 ml-1">/ {formatKRW(cashflow.lastMonthBilled)}</span>
            </p>
            <p className="text-[11px] text-emerald-700 mt-0.5">
              {cashflow.lastMonthPaidCount}/{cashflow.lastMonthBilledCount}명 완료 ({cashflow.lastMonthRate}%)
            </p>
          </div>
        </div>
        {cashflow.debtList.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-200 bg-white/60">
            <p className="text-[11px] font-semibold text-orange-700 mb-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> 미수금 보유 PT생 ({cashflow.debtList.length}명) · 큰 금액 순
            </p>
            <div className="flex flex-wrap gap-1.5">
              {cashflow.debtList.slice(0, 20).map((d, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-orange-50 text-orange-800 border border-orange-200"
                  title={`미납월: ${d.months.join(', ')}`}
                >
                  {d.name} <span className="font-bold">{formatKRW(d.amount)}</span>
                  <span className="text-[10px] opacity-70">({d.months.length}건)</span>
                </span>
              ))}
              {cashflow.debtList.length > 20 && (
                <span className="text-[11px] text-gray-500">외 {cashflow.debtList.length - 20}명</span>
              )}
            </div>
          </div>
        )}
        {/* 받아야 할 금액 (API 추정) — 리포트 미제출이라도 우리가 받았어야 할 잠재 청구액 */}
        {apiPotentialFees.totalPotential > 0 && (
          <div className="px-5 py-3 border-t border-amber-200 bg-amber-50">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                <p className="text-sm font-bold text-amber-900">
                  📊 받아야 할 금액 (API 추정 · 리포트 미제출이라 미청구)
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleExecuteBillingNow}
                  disabled={executeLoading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-red-700 text-white rounded hover:bg-red-800 disabled:opacity-50 ring-2 ring-red-300"
                  title="Toss 빌링키로 즉시 실제 결제 시도 (awaiting_payment/overdue/suspended 전체)"
                >
                  {executeLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Banknote className="w-3 h-3" />}
                  ⚡ 지금 즉시 결제 실행
                </button>
                <button
                  type="button"
                  onClick={() => handleTriggerBilling(true)}
                  disabled={triggerLoading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-[#E31837] text-white rounded hover:bg-red-700 disabled:opacity-50"
                  title="결제는 안 함 — 보고서만 자동 생성하고 청구 가능 상태로 마킹"
                >
                  {triggerLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
                  보고서만 자동 생성
                </button>
                <button
                  type="button"
                  onClick={handleBulkReportRequest}
                  disabled={bulkRequestLoading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
                  title="PT생들에게 광고비+스샷 제출 안내 알림 발송"
                >
                  {bulkRequestLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />}
                  광고비 제출 안내 일괄 발송
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="bg-white rounded p-3 border border-amber-300">
                <p className="text-[11px] font-semibold text-amber-700 uppercase">{formatYearMonth(lastClosedMonth)} 받아야 할 금액 (추정)</p>
                <p className="text-2xl font-bold text-amber-900 mt-1">{formatKRW(apiPotentialFees.lastClosedPotential)}</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  {apiPotentialFees.lastClosedUserCount}명이 리포트 미제출 — 청구 진행 안 됨
                </p>
              </div>
              <div className="bg-white rounded p-3 border border-amber-300">
                <p className="text-[11px] font-semibold text-amber-700 uppercase">전체 미청구 추정 합계 (마감월 누적)</p>
                <p className="text-2xl font-bold text-amber-900 mt-1">{formatKRW(apiPotentialFees.totalPotential)}</p>
                <p className="text-[11px] text-amber-700 mt-0.5">PT생들이 리포트 제출하면 실제로 청구됨</p>
              </div>
            </div>
            {apiPotentialFees.lastClosedDetails.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold text-amber-800 mb-1.5 flex items-center gap-1.5">
                  <span>{formatYearMonth(lastClosedMonth)} 미청구 PT생 (큰 금액 순)</span>
                  <span className="text-[10px] font-normal text-amber-700">
                    💡 클릭 = 결제 사이클에서 제외 (그 PT생은 결제 없이 프로그램 이용 가능)
                  </span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {apiPotentialFees.lastClosedDetails.slice(0, 14).map((d, i) => {
                    const acting = actingUserId === d.ptUserId;
                    if (d.isExcluded) {
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={acting}
                          onClick={() => handleClearBillingExclusion(d.ptUserId, d.name)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-300 hover:bg-slate-200 hover:border-slate-400 disabled:opacity-50 transition cursor-pointer line-through"
                          title={`결제 제외 중 (${d.excludedUntil ?? '?'}까지) — 클릭하면 즉시 결제 사이클 재포함`}
                        >
                          {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlock className="w-3 h-3" />}
                          {d.name}
                          <span className="text-[10px] opacity-70">제외중 ~{d.excludedUntil?.slice(5) ?? ''}</span>
                        </button>
                      );
                    }
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={acting}
                        onClick={() => handleSetBillingExclusion(d.ptUserId, d.name)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-white text-amber-800 border border-amber-300 hover:bg-amber-50 hover:border-amber-500 hover:shadow-sm disabled:opacity-50 transition cursor-pointer"
                        title="클릭하면 이 PT생을 결제 사이클에서 제외 (결제 없이 프로그램 이용 가능)"
                      >
                        {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        {d.name} <span className="font-bold">{formatKRW(d.fee)}</span>
                        <span className="text-[10px] opacity-70">(매출 {formatKRW(d.revenue)})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {bulkRequestResult && (
              <div className={`mt-3 p-2 rounded text-[12px] ${bulkRequestResult.startsWith('✅') ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}>
                {bulkRequestResult}
              </div>
            )}
            {triggerResult && (
              <div className={`mt-3 p-2 rounded text-[12px] ${triggerResult.startsWith('✅') ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}>
                {triggerResult}
              </div>
            )}
            {executeResult && (
              <div className={`mt-3 p-2 rounded text-[12px] font-medium ${executeResult.startsWith('✅') ? 'bg-green-100 text-green-900 border border-green-300' : 'bg-red-100 text-red-900 border border-red-300'}`}>
                {executeResult}
              </div>
            )}
            <p className="mt-2 text-[11px] text-amber-800 leading-relaxed">
              💡 <strong>정책</strong>: PT생은 매월 <strong>1일까지</strong> 광고비 + 스크린샷을 <code className="bg-amber-100 px-1">/my/ad-cost</code>에 제출해야 수수료가 차감됩니다.
              매월 <strong>3일 KST 03:00</strong>에는 광고비 입력 여부와 무관하게 무조건 자동결제 실행.
              미입력 시 광고비 0 가정으로 청구되어 PT생이 손해를 봅니다.
            </p>
          </div>
        )}

        {cashflow.billedTotal === 0 && (
          <div className="px-5 py-3 border-t border-gray-200 bg-amber-50 text-amber-900 text-[12px] flex items-center justify-between flex-wrap gap-2">
            <span>📝 아직 청구된 수수료가 없습니다 — PT생이 매출 리포트를 제출하고 관리자가 확인하면 청구액이 잡힙니다.</span>
            <button
              type="button"
              onClick={() => runDiagnostics(true)}
              disabled={diagLoading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
            >
              {diagLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Stethoscope className="w-3 h-3" />}
              왜 결제가 안 됐는지 진단
            </button>
          </div>
        )}
        {cashflow.billedTotal > 0 && (
          <div className="px-5 py-2 border-t border-gray-200 bg-gray-50 text-[11px] flex justify-end">
            <button
              type="button"
              onClick={() => runDiagnostics(true)}
              disabled={diagLoading}
              className="inline-flex items-center gap-1 px-2 py-1 text-gray-600 hover:text-gray-900"
            >
              {diagLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Stethoscope className="w-3 h-3" />}
              결제 진단
            </button>
          </div>
        )}
      </div>

      {/* 결제 진단 모달 */}
      {diagOpen && (
        <PaymentDiagnosticsModal
          data={diagData}
          error={diagError}
          loading={diagLoading}
          onClose={() => setDiagOpen(false)}
          onRetry={() => runDiagnostics(true)}
        />
      )}

      {/* 오늘 실시간 매출 — Wing 기준 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-600" />
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">오늘 실시간 매출 (전체 PT생, KST 오늘)</p>
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {todayLoading && todayTotal === null ? '조회 중...' : formatKRW(todayTotal ?? 0)}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">
              쿠팡 ordersheets API 직접 조회 · 접수~배송완료 모든 주문 포함 · 5분마다 자동 갱신
              {todayFetchedAt && ` · ${todayFetchedAt.toLocaleTimeString('ko-KR')} 기준`}
            </p>
          </div>
          <button
            onClick={fetchTodayRevenue}
            disabled={todayLoading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-white border border-blue-300 text-blue-700 rounded hover:bg-blue-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${todayLoading ? 'animate-spin' : ''}`} />
            지금 새로고침
          </button>
        </div>
        {todayPerUser.length > 0 && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {todayPerUser.filter(u => u.todaySales > 0 || u.error).slice(0, 12).map((u) => (
              <div key={u.ptUserId} className="flex items-center justify-between bg-white rounded px-3 py-1.5 border border-blue-100">
                <span className="text-xs text-gray-700 truncate flex-1 pr-2">{u.name || u.email}</span>
                {u.error ? (
                  <span className="text-[10px] text-red-500" title={u.error}>오류</span>
                ) : (
                  <span className="text-xs font-semibold text-blue-700">{formatKRW(u.todaySales)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 핵심: 우리가 받을 수수료 (PT생 → 우리, VAT 포함) */}
      <div className="bg-gradient-to-r from-[#E31837]/5 to-amber-50 border-2 border-[#E31837]/30 rounded-xl p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">당월 진행중 수수료 추정 ({formatYearMonth(currentMonth)})</p>
              <p className="text-3xl font-bold text-emerald-700 mt-1">{formatKRW(summary.currentMonthFeeEstimate)}</p>
              <p className="text-[11px] text-gray-500 mt-1">쿠팡 API 매출 기반 자동 추정 · VAT 포함 · 광고비 0 가정</p>
            </div>
            <div className="border-t border-gray-200 pt-2">
              <p className="text-xs font-semibold text-[#E31837] uppercase tracking-wide">직전 마감월 청구 수수료 ({formatYearMonth(lastClosedMonth)})</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatKRW(summary.feeBilledTotal)}</p>
              <p className="text-[11px] text-gray-500 mt-1">PT생 제출 리포트 기반 · VAT 포함</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[11px] font-semibold text-green-700 uppercase">납부 완료</p>
              <p className="text-xl font-bold text-green-700">{formatKRW(summary.feePaidTotal)}</p>
              <p className="text-[10px] text-green-600">{summary.feePaidCount}건</p>
            </div>
            <div className="w-px h-12 bg-gray-200" />
            <div>
              <p className="text-[11px] font-semibold text-orange-700 uppercase">받아야 할 금액</p>
              <p className="text-xl font-bold text-orange-700">{formatKRW(summary.feeDueTotal)}</p>
              <p className="text-[10px] text-orange-600">{summary.feeDueCount}건 미납</p>
            </div>
          </div>
        </div>
      </div>

      {/* 요약 카드 (매출·정산 흐름) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={`${formatYearMonth(currentMonth)} 총매출`}
          value={formatKRW(summary.totalRev)}
          subtitle={`대상자 ${summary.eligible}명 (API 잠정 포함)`}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <StatCard
          title={`${formatYearMonth(currentMonth)} 총정산액`}
          value={formatKRW(summary.totalDep)}
          subtitle="우리 → PT생 송금액 합계"
          icon={<Banknote className="w-5 h-5" />}
        />
        <StatCard
          title="제출 완료율"
          value={`${summary.completionRate}%`}
          subtitle={`완료 ${summary.completed} · 처리중 ${summary.submitted}`}
          icon={<CheckCircle2 className="w-5 h-5" />}
          trend={summary.completionRate >= 80 ? 'up' : summary.completionRate >= 50 ? 'neutral' : 'down'}
        />
        <StatCard
          title="지연/미제출"
          value={`${summary.overdue + summary.pending}명`}
          subtitle={`지연 ${summary.overdue} · 미제출 ${summary.pending}`}
          icon={<UsersIcon className="w-5 h-5" />}
          trend={summary.overdue > 0 ? 'down' : 'neutral'}
        />
      </div>

      {/* 직전 마감월 자동결제 결과 — 누가 결제했고 누가 안 했는지 즉시 파악 */}
      {billingResult.total > 0 && (
        <div className="bg-white border-2 border-[#E31837]/30 rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-[#E31837]/10 to-amber-50 px-5 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Banknote className="w-5 h-5 text-[#E31837]" />
              <h2 className="text-base font-bold text-gray-900">
                {formatYearMonth(lastClosedMonth)} 자동결제 결과
              </h2>
              <span className="text-xs text-gray-500">(매월 3일 KST 03:00 자동 청구)</span>
            </div>
            <button
              type="button"
              onClick={() => fetchData(false)}
              disabled={loading}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-gray-600 hover:text-gray-900"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-gray-200">
            <div className="px-5 py-4 bg-green-50/50">
              <p className="text-[11px] font-semibold text-green-700 uppercase">✅ 결제 완료</p>
              <p className="text-2xl font-bold text-green-700 mt-1">
                {billingResult.paid}<span className="text-sm font-medium text-green-600 ml-1">/ {billingResult.total}명</span>
              </p>
              <p className="text-[11px] text-green-700 mt-0.5">{formatKRW(billingResult.paidAmount)} 입금</p>
            </div>
            <div className="px-5 py-4 bg-amber-50/50">
              <p className="text-[11px] font-semibold text-amber-700 uppercase">⏳ 결제 대기</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">
                {billingResult.awaiting_payment}<span className="text-sm font-medium text-amber-600 ml-1">명</span>
              </p>
              <p className="text-[11px] text-amber-700 mt-0.5">아직 결제 시도 전</p>
            </div>
            <div className="px-5 py-4 bg-orange-50/50">
              <p className="text-[11px] font-semibold text-orange-700 uppercase">⚠️ 미납 (재시도)</p>
              <p className="text-2xl font-bold text-orange-700 mt-1">
                {billingResult.overdue}<span className="text-sm font-medium text-orange-600 ml-1">명</span>
              </p>
              <p className="text-[11px] text-orange-700 mt-0.5">24h 후 자동 재시도</p>
            </div>
            <div className="px-5 py-4 bg-red-50/50">
              <p className="text-[11px] font-semibold text-red-700 uppercase">🚫 최종실패/정지</p>
              <p className="text-2xl font-bold text-red-700 mt-1">
                {billingResult.suspended}<span className="text-sm font-medium text-red-600 ml-1">명</span>
              </p>
              <p className="text-[11px] text-red-700 mt-0.5">{formatKRW(billingResult.unpaidAmount)} 미수</p>
            </div>
          </div>
          {billingResult.unpaidUsers.length > 0 && (
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-200">
              <p className="text-[11px] font-semibold text-gray-700 mb-1.5">미납 PT생 ({billingResult.unpaidUsers.length}명):</p>
              <div className="flex flex-wrap gap-1.5">
                {billingResult.unpaidUsers.map((u, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
                      u.status === 'suspended'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : u.status === 'overdue'
                          ? 'bg-orange-50 text-orange-700 border-orange-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {u.name} <span className="text-[10px] opacity-70">{formatKRW(u.amount)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {billingResult.total === billingResult.paid && billingResult.paid > 0 && (
            <div className="px-5 py-2 bg-green-50 border-t border-green-200 text-[12px] text-green-800 font-medium">
              🎉 전원 결제 완료 — 미납 0명
            </div>
          )}
        </div>
      )}

      {/* 결제 상태 패널 — 카드 미등록 / 락 / 재시도 / 최종실패 한눈에 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setPaymentPanelOpen((o) => !o)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
        >
          <div className="flex items-center gap-3 flex-wrap">
            <CreditCard className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-gray-900">결제 상태 / 카드 등록 현황</h2>
            {paymentSummary && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {paymentSummary.no_contract > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800">
                    <AlertTriangle className="w-3 h-3" /> 계약 미서명 {paymentSummary.no_contract}
                  </span>
                )}
                {paymentSummary.no_card > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">
                    <CreditCard className="w-3 h-3" /> 카드 미등록 {paymentSummary.no_card}
                  </span>
                )}
                {paymentSummary.locked > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-orange-100 text-orange-800">
                    <Lock className="w-3 h-3" /> 락 {paymentSummary.locked}
                  </span>
                )}
                {paymentSummary.final_failed > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-700">
                    <XCircle className="w-3 h-3" /> 최종실패 {paymentSummary.final_failed}
                  </span>
                )}
                {paymentSummary.retrying > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-700">
                    <RefreshCw className="w-3 h-3" /> 재시도중 {paymentSummary.retrying}
                  </span>
                )}
                {paymentSummary.excluded > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-700">
                    <Unlock className="w-3 h-3" /> 결제 제외 {paymentSummary.excluded}
                  </span>
                )}
                {paymentSummary.no_card === 0 && paymentSummary.locked === 0 && paymentSummary.final_failed === 0 && paymentSummary.retrying === 0 && paymentSummary.no_contract === 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-green-100 text-green-700">
                    <CheckCircle2 className="w-3 h-3" /> 모두 정상
                  </span>
                )}
              </div>
            )}
            {paymentLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{paymentSummary?.total ?? 0}명 중 {paymentSummary ? paymentSummary.total - paymentSummary.normal : 0}명 조치 필요</span>
            {paymentPanelOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>
        </button>

        {paymentPanelOpen && (
          <div className="border-t border-gray-200">
            {paymentError && (
              <div className="bg-red-50 border-b border-red-200 text-red-900 px-4 py-2 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {paymentError}
                <button
                  type="button"
                  onClick={fetchPaymentOverview}
                  className="ml-auto text-xs underline"
                >
                  다시 시도
                </button>
              </div>
            )}

            {/* 필터 칩 */}
            <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-1.5 flex-wrap text-xs">
              {([
                { key: 'problem', label: '조치 필요만', color: 'bg-[#E31837]/10 text-[#E31837] border-[#E31837]/30' },
                { key: 'all', label: '전체', color: 'bg-gray-100 text-gray-700 border-gray-200' },
                { key: 'no_contract', label: `계약 미서명 (${paymentSummary?.no_contract ?? 0})`, color: 'bg-purple-50 text-purple-800 border-purple-200' },
                { key: 'no_card', label: `카드 미등록 (${paymentSummary?.no_card ?? 0})`, color: 'bg-amber-50 text-amber-800 border-amber-200' },
                { key: 'locked', label: `락 (${paymentSummary?.locked ?? 0})`, color: 'bg-orange-50 text-orange-800 border-orange-200' },
                { key: 'final_failed', label: `최종실패 (${paymentSummary?.final_failed ?? 0})`, color: 'bg-red-50 text-red-700 border-red-200' },
                { key: 'retrying', label: `재시도중 (${paymentSummary?.retrying ?? 0})`, color: 'bg-blue-50 text-blue-700 border-blue-200' },
                { key: 'no_report', label: `리포트 미제출 (${paymentSummary?.no_report ?? 0})`, color: 'bg-gray-50 text-gray-700 border-gray-200' },
                { key: 'excluded', label: `결제 제외 (${paymentSummary?.excluded ?? 0})`, color: 'bg-slate-100 text-slate-700 border-slate-300' },
                { key: 'normal', label: `정상 (${paymentSummary?.normal ?? 0})`, color: 'bg-green-50 text-green-700 border-green-200' },
              ] as const).map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setPaymentFilter(chip.key)}
                  className={`px-2.5 py-1 rounded-full border font-medium transition ${
                    paymentFilter === chip.key ? `${chip.color} ring-2 ring-offset-1 ring-current/20` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
              <button
                type="button"
                onClick={fetchPaymentOverview}
                disabled={paymentLoading}
                className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 hover:text-gray-700"
              >
                <RefreshCw className={`w-3 h-3 ${paymentLoading ? 'animate-spin' : ''}`} />
                새로고침
              </button>
            </div>

            {filteredPaymentRows.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-500">
                {paymentFilter === 'problem'
                  ? '✅ 조치 필요 PT생이 없습니다 — 모두 정상'
                  : '해당 상태의 PT생이 없습니다'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1100px]">
                  <thead className="bg-gray-50 text-gray-600 text-[11px] uppercase">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold">사용자</th>
                      <th className="px-3 py-2.5 text-left font-semibold">상태 / 사유</th>
                      <th className="px-3 py-2.5 text-left font-semibold">카드</th>
                      <th className="px-3 py-2.5 text-left font-semibold">미납</th>
                      <th className="px-3 py-2.5 text-left font-semibold">최근 결제</th>
                      <th className="px-3 py-2.5 text-left font-semibold">락 / 연체</th>
                      <th className="px-3 py-2.5 text-right font-semibold">조치</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredPaymentRows.map((p) => {
                      const name = p.full_name || p.email || p.pt_user_id.slice(0, 8);
                      const acting = actingUserId === p.pt_user_id || actingUserId === p.latest_tx?.id;
                      const canRetry = p.latest_tx && p.latest_tx.status === 'failed' && !p.latest_tx.is_final_failure;
                      const lockActive = p.payment_lock_level > 0 || p.computed_lock_level > 0 || !!p.payment_overdue_since;

                      return (
                        <tr key={p.pt_user_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 align-top">
                            <p className="font-medium text-gray-900">{name}</p>
                            <p className="text-[11px] text-gray-500 truncate max-w-[180px]">{p.email}</p>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <PaymentStatusBadge status={p.status} />
                            {p.latest_tx?.failure_label && p.status !== 'normal' && (
                              <p className="text-[11px] text-red-600 mt-1 max-w-[200px]">{p.latest_tx.failure_label}</p>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">
                            {p.card ? (
                              <div>
                                <p className="text-xs text-gray-900">{p.card.company}</p>
                                <p className="text-[11px] text-gray-500">{p.card.number}</p>
                                {p.card.failed_count > 0 && (
                                  <p className="text-[10px] text-red-600 mt-0.5">실패 {p.card.failed_count}회 누적</p>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-semibold">
                                <CreditCard className="w-3 h-3" />
                                미등록
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">
                            {p.unpaid_summary && p.unpaid_summary.count > 0 ? (
                              <div>
                                <p className="text-xs font-semibold text-orange-700">{p.unpaid_summary.count}건</p>
                                <p className="text-[11px] text-gray-600">{formatKRW(p.unpaid_summary.total)}</p>
                                {p.unpaid_summary.suspendedCount > 0 && (
                                  <p className="text-[10px] text-red-600">정지 {p.unpaid_summary.suspendedCount}</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">없음</span>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">
                            {p.latest_tx ? (
                              <div>
                                <p className="text-xs text-gray-900">
                                  {p.latest_tx.status === 'success' && '✅ 성공'}
                                  {p.latest_tx.status === 'failed' && (p.latest_tx.is_final_failure ? '❌ 최종실패' : '⚠️ 실패')}
                                  {p.latest_tx.status === 'pending' && '⏳ 진행중'}
                                  {p.latest_tx.retry_count > 0 && (
                                    <span className="ml-1 text-blue-600">({p.latest_tx.retry_count}/3)</span>
                                  )}
                                </p>
                                {p.latest_tx.next_retry_at && (
                                  <p className="text-[10px] text-gray-500">
                                    다음: {new Date(p.latest_tx.next_retry_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit' })}
                                  </p>
                                )}
                                <p className="text-[10px] text-gray-400">
                                  {new Date(p.latest_tx.created_at).toLocaleDateString('ko-KR')}
                                </p>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">없음</span>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">
                            {lockActive ? (
                              <div>
                                <p className="text-xs font-semibold text-orange-700">
                                  L{p.payment_lock_level}
                                  {p.computed_lock_level !== p.payment_lock_level && (
                                    <span className="ml-1 text-[10px] text-orange-500">(계산 L{p.computed_lock_level})</span>
                                  )}
                                </p>
                                {p.payment_overdue_since && (
                                  <p className="text-[10px] text-gray-500">
                                    연체 {new Date(p.payment_overdue_since).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}~
                                  </p>
                                )}
                                {p.admin_override_level !== null && (
                                  <p className="text-[10px] text-purple-600">override L{p.admin_override_level}</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-green-600 text-xs">정상</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right align-top">
                            <div className="inline-flex flex-col gap-1 items-end">
                              {p.status === 'excluded' && p.billing_excluded_until && (
                                <p className="text-[10px] text-slate-600 font-medium">
                                  ~{new Date(p.billing_excluded_until).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}까지 제외
                                </p>
                              )}
                              {p.status === 'no_card' && (
                                <button
                                  type="button"
                                  disabled={acting}
                                  onClick={() => handleNotifyCardRequired(p.pt_user_id, name)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
                                  title="카드 등록 안내 알림 즉시 발송"
                                >
                                  {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />}
                                  카드 안내
                                </button>
                              )}
                              {canRetry && p.latest_tx && (
                                <button
                                  type="button"
                                  disabled={acting}
                                  onClick={() => handleRetryNow(p.latest_tx!.id, name)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                  title="24시간 대기 없이 즉시 재시도"
                                >
                                  {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
                                  즉시 재시도
                                </button>
                              )}
                              {lockActive && (
                                <button
                                  type="button"
                                  disabled={acting}
                                  onClick={() => handleResetLock(p.pt_user_id, name)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
                                  title="overdue / lock_level / admin_override 초기화"
                                >
                                  {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlock className="w-3 h-3" />}
                                  락 해제
                                </button>
                              )}
                              {/* 결제 제외 / 재개 토글 */}
                              {p.status === 'excluded' ? (
                                <button
                                  type="button"
                                  disabled={acting}
                                  onClick={() => handleClearBillingExclusion(p.pt_user_id, name)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                                  title="결제 사이클 다시 포함"
                                >
                                  {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
                                  결제 재개
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={acting}
                                  onClick={() => handleSetBillingExclusion(p.pt_user_id, name)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-slate-500 text-white rounded hover:bg-slate-600 disabled:opacity-50"
                                  title="이 PT생을 일정 기간 결제 사이클에서 제외 (자동결제/락 면제)"
                                >
                                  {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlock className="w-3 h-3" />}
                                  결제 제외
                                </button>
                              )}
                              {p.status === 'normal' && !lockActive && !canRetry && (
                                <span className="text-[10px] text-gray-400">정상</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 컨트롤 바 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
        {/* 검색 */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="사용자명 또는 이메일 검색..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
          />
        </div>

        {/* 월 범위 */}
        <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1">
          {([3, 6, 12] as MonthRange[]).map(n => (
            <button
              key={n}
              onClick={() => setMonthRange(n)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                monthRange === n
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              최근 {n}개월
            </button>
          ))}
        </div>

        {/* 상태 필터 */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
        >
          <option value="all">전체 상태</option>
          <option value="completed">완료</option>
          <option value="submitted">처리중</option>
          <option value="pending">미제출</option>
          <option value="overdue">지연</option>
        </select>

        <span className="ml-auto text-xs text-gray-500">
          {filteredRows.length}명 / {users.length}명
        </span>
      </div>

      {/* 매트릭스 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-gray-400 text-sm">로딩 중...</div>
        ) : filteredRows.length === 0 ? (
          <div className="py-20 text-center text-gray-400 text-sm">표시할 사용자가 없습니다</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th
                    className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-semibold text-gray-600 border-r border-gray-200 cursor-pointer hover:bg-gray-100 transition"
                    style={{ minWidth: 200 }}
                    onClick={() => toggleSort('name')}
                  >
                    사용자<SortIcon active={sortKey === 'name'} dir={sortDir} />
                  </th>
                  <th
                    className="px-3 py-3 text-left text-xs font-semibold text-gray-600 border-r border-gray-200 cursor-pointer hover:bg-gray-100 transition"
                    onClick={() => toggleSort('created')}
                  >
                    가입일<SortIcon active={sortKey === 'created'} dir={sortDir} />
                  </th>
                  {/* 월별 컬럼 (과거 → 최신 순서로 표시) */}
                  {[...months].reverse().map(ym => (
                    <th
                      key={ym}
                      className={`px-3 py-3 text-right text-xs font-semibold border-r border-gray-200 ${ym === currentMonth ? 'bg-emerald-50 text-emerald-800' : 'text-gray-600'}`}
                      style={{ minWidth: 130 }}
                    >
                      {formatYearMonth(ym)}
                      {ym === currentMonth && (
                        <span className="block text-[9px] text-emerald-600 font-medium mt-0.5">진행중</span>
                      )}
                    </th>
                  ))}
                  <th
                    className="px-3 py-3 text-right text-xs font-semibold text-gray-600 border-r border-gray-200 bg-blue-50 cursor-pointer hover:bg-blue-100 transition"
                    onClick={() => toggleSort('totalRevenue')}
                  >
                    누적 매출<SortIcon active={sortKey === 'totalRevenue'} dir={sortDir} />
                  </th>
                  <th
                    className="px-3 py-3 text-right text-xs font-semibold text-gray-600 bg-blue-50 cursor-pointer hover:bg-blue-100 transition"
                    onClick={() => toggleSort('totalDeposit')}
                  >
                    누적 정산<SortIcon active={sortKey === 'totalDeposit'} dir={sortDir} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => {
                  const pay = paymentByUser.get(row.user.id) || null;
                  const lockActiveInline = pay && (pay.payment_lock_level > 0 || pay.computed_lock_level > 0 || !!pay.payment_overdue_since);
                  return (
                  <tr key={row.user.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 border-r border-gray-200" style={{ minWidth: 200 }}>
                      <div className="font-medium text-gray-900 flex items-center gap-1 flex-wrap">
                        {row.user.profile?.full_name || '-'}
                        {row.apiConnected && (
                          <span title={`API 연동 · ${row.latestSyncedAt ? '최근 동기화 ' + new Date(row.latestSyncedAt).toLocaleString('ko-KR') : '동기화 이력 없음'}`}>
                            <Zap className="w-3 h-3 text-blue-500" />
                          </span>
                        )}
                        {pay && pay.status === 'no_contract' && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800" title="계약 미서명 — 자동결제 대상 아님">
                            계약 ✗
                          </span>
                        )}
                        {pay && pay.status === 'excluded' && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-700" title={`결제 제외 (${pay.billing_excluded_until ?? ''})`}>
                            결제 제외
                          </span>
                        )}
                        {pay && pay.status === 'no_card' && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800" title="결제 카드 미등록">
                            <CreditCard className="w-2.5 h-2.5" /> 카드 ✗
                          </span>
                        )}
                        {pay && lockActiveInline && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-800" title={`결제 락 L${pay.payment_lock_level}`}>
                            <Lock className="w-2.5 h-2.5" /> L{pay.payment_lock_level}
                          </span>
                        )}
                        {pay && pay.status === 'final_failed' && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700" title="자동결제 최종 실패">
                            <XCircle className="w-2.5 h-2.5" /> 실패
                          </span>
                        )}
                        {pay && pay.status === 'retrying' && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700" title="재시도 진행중">
                            <RefreshCw className="w-2.5 h-2.5" /> 재시도
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate max-w-[180px]">{row.user.profile?.email}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">수수료 {row.user.share_percentage}%{!row.apiConnected && <span className="ml-1 text-amber-600">· API 미연동</span>}</div>
                    </td>
                    <td className="px-3 py-3 border-r border-gray-200 text-xs text-gray-600 whitespace-nowrap">
                      {row.user.created_at.slice(0, 10)}
                    </td>
                    {[...months].reverse().map(ym => (
                      <td key={ym} className={`px-3 py-3 text-right border-r border-gray-200 ${ym === currentMonth ? 'bg-emerald-50/40' : ''}`}>
                        {renderCell(row.monthly.get(ym)!, ym)}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right border-r border-gray-200 bg-blue-50/40">
                      <div className="text-sm font-semibold text-gray-900">{formatKRW(row.totalRevenue)}</div>
                    </td>
                    <td className="px-3 py-3 text-right bg-blue-50/40">
                      <div className="text-sm font-semibold text-[#E31837]">{formatKRW(row.totalDeposit)}</div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              {/* 합계 행 */}
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-gray-300 font-semibold">
                  <td className="sticky left-0 z-10 bg-gray-100 px-4 py-3 border-r border-gray-200" style={{ minWidth: 200 }}>
                    합계 ({filteredRows.length}명)
                  </td>
                  <td className="px-3 py-3 border-r border-gray-200"></td>
                  {[...months].reverse().map(ym => {
                    const t = monthTotals.totals[ym];
                    return (
                      <td key={ym} className={`px-3 py-3 text-right border-r border-gray-200 ${ym === currentMonth ? 'bg-emerald-100' : ''}`}>
                        <div className="text-xs font-semibold text-gray-900">{formatKRW(t.revenue)}</div>
                        <div className="text-[11px] text-emerald-700 font-medium">+{formatKRW(t.fee)}</div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-right border-r border-gray-200 bg-blue-100">
                    <div className="text-sm font-bold text-gray-900">{formatKRW(monthTotals.totalCumRev)}</div>
                  </td>
                  <td className="px-3 py-3 text-right bg-blue-100">
                    <div className="text-sm font-bold text-[#E31837]">{formatKRW(monthTotals.totalCumDep)}</div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* 범례 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="font-semibold text-gray-700">상태 범례:</span>
          {Object.entries(PAYMENT_STATUS_LABELS).map(([key, label]) => (
            <span key={key} className={`inline-block px-2 py-0.5 rounded font-medium ${PAYMENT_STATUS_COLORS[key]}`}>
              {label}
            </span>
          ))}
          <span className="ml-auto text-gray-500">셀 형식: 매출 + 우리 수수료(VAT 포함) · {formatYearMonth(currentMonth)} 진행중</span>
        </div>
      </div>
    </div>
  );
}

/* ─── 결제 진단 모달 ─── */
function PaymentDiagnosticsModal({
  data,
  error,
  loading,
  onClose,
  onRetry,
}: {
  data: DiagnosticsData | null;
  error: string | null;
  loading: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  const d = data;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full my-8 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">자동결제 진단 리포트</h2>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-900 px-4 py-3 rounded-lg flex items-center justify-between gap-2">
              <span className="text-sm">{error}</span>
              <button type="button" onClick={onRetry} className="text-xs underline">다시 시도</button>
            </div>
          )}

          {loading && !d && (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          )}

          {d && (
            <>
              {/* 결론 */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 mb-2">🔍 결론 / 추정 원인</h3>
                <div className="space-y-2">
                  {d.reasons.map((r, i) => (
                    <p
                      key={i}
                      className={`text-sm leading-relaxed px-3 py-2 rounded border ${
                        r.startsWith('🚨') ? 'bg-red-50 border-red-200 text-red-900' :
                        r.startsWith('⚠️') ? 'bg-amber-50 border-amber-200 text-amber-900' :
                        'bg-green-50 border-green-200 text-green-900'
                      }`}
                    >
                      {r}
                    </p>
                  ))}
                </div>
              </section>

              {/* 기본 통계 */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 mb-2">📊 기본 통계</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <DiagStat label="전체 PT생" value={`${d.summary.totalPtUsers}명`} />
                  <DiagStat
                    label="signed 계약 보유"
                    value={`${d.summary.signedPtUsers}명`}
                    color={d.summary.signedPtUsers === 0 ? 'red' : 'gray'}
                  />
                  <DiagStat label="테스트 계정 (제외)" value={`${d.summary.testAccounts}명`} />
                  <DiagStat
                    label="활성 카드 보유"
                    value={`${d.summary.usersWithCard}명`}
                    color={d.summary.usersWithCard === 0 ? 'red' : 'gray'}
                  />
                  <DiagStat
                    label={`${d.summary.lastClosedMonth} 보고서 수`}
                    value={`${d.summary.lastReportCount}건`}
                    color={d.summary.lastReportCount === 0 ? 'red' : 'gray'}
                  />
                  <DiagStat
                    label="청구 가능 보고서"
                    value={`${d.summary.eligibleForBilling}건`}
                    color={d.summary.eligibleForBilling === 0 ? 'amber' : 'green'}
                  />
                  <DiagStat label={`${d.summary.lastClosedMonth} API 스냅샷`} value={`${d.summary.lastSnapshotCount}건`} />
                  <DiagStat label="오늘 자동결제 시도" value={`${d.summary.todayAutoTxCount}건`} />
                </div>
              </section>

              {/* 분포 */}
              <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <DiagDist title="계약 상태" dist={d.contractStatusDist} />
                <DiagDist title={`${d.summary.lastClosedMonth} 결제상태`} dist={d.reportFeeStatusDist} />
                <DiagDist title={`${d.summary.lastClosedMonth} 보고상태`} dist={d.reportPaymentStatusDist} />
              </section>

              {/* Cron 락 */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 mb-2">⏱️ 최근 Cron 실행 흔적</h3>
                {d.cronLocks.length === 0 ? (
                  <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200">
                    cron_locks 테이블 비어있음 — cron이 한 번도 실행되지 않았거나 정상 종료됐을 수 있음. Vercel cron 로그 확인 필요.
                  </p>
                ) : (
                  <div className="space-y-1 text-xs">
                    {d.cronLocks.map((l, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded">
                        <span className="font-mono text-gray-700">{l.lock_key}</span>
                        <span className="text-gray-500">{new Date(l.acquired_at).toLocaleString('ko-KR')}</span>
                        {l.acquired_by && <span className="text-gray-400">· {l.acquired_by}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 오늘 결제 시도 */}
              {d.todayAutoTxs.length > 0 && (
                <section>
                  <h3 className="text-sm font-bold text-gray-900 mb-2">💳 오늘 자동결제 시도 ({d.todayAutoTxs.length}건)</h3>
                  <div className="space-y-1 text-xs">
                    {d.todayAutoTxs.slice(0, 10).map((t, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded">
                        <span className={`font-bold ${t.status === 'success' ? 'text-green-700' : 'text-red-700'}`}>{t.status}</span>
                        {t.failure_code && <span className="text-red-600">{t.failure_code}</span>}
                        <span className="text-gray-500 ml-auto">{new Date(t.created_at).toLocaleString('ko-KR')}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 최근 에러 */}
              {d.recentErrors.length > 0 && (
                <section>
                  <h3 className="text-sm font-bold text-red-900 mb-2">🚨 최근 24h 미해결 settlement 에러 ({d.recentErrors.length}건)</h3>
                  <div className="space-y-1 text-xs">
                    {d.recentErrors.slice(0, 10).map((e, i) => (
                      <div key={i} className="px-3 py-2 bg-red-50 border border-red-200 rounded">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-red-900">{e.stage}</span>
                          {e.error_code && <span className="text-red-700">[{e.error_code}]</span>}
                        </div>
                        {e.error_message && <p className="text-red-800 mt-0.5">{e.error_message}</p>}
                        <p className="text-red-500 text-[10px] mt-0.5">{new Date(e.created_at).toLocaleString('ko-KR')}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onRetry}
            disabled={loading}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 inline mr-1 ${loading ? 'animate-spin' : ''}`} />
            재진단
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded hover:bg-gray-700"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function DiagInline({
  label,
  value,
  bad,
  warn,
  hint,
}: {
  label: string;
  value: string;
  bad?: boolean;
  warn?: boolean;
  hint?: string;
}) {
  const tone = bad ? 'border-red-400 bg-red-50' : warn ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white';
  const valueColor = bad ? 'text-red-700' : warn ? 'text-amber-700' : 'text-gray-900';
  return (
    <div className={`px-3 py-2 rounded border ${tone}`}>
      <p className="text-[10px] font-semibold text-gray-600 uppercase">{label}</p>
      <p className={`text-base font-bold mt-0.5 ${valueColor}`}>{value}</p>
      {hint && <p className="text-[10px] text-gray-700 mt-0.5">{hint}</p>}
    </div>
  );
}

function DiagStat({ label, value, color = 'gray' }: { label: string; value: string; color?: 'gray' | 'red' | 'green' | 'amber' }) {
  const colorClass: Record<string, string> = {
    gray: 'bg-gray-50 text-gray-900',
    red: 'bg-red-50 text-red-900 border-red-200 border',
    green: 'bg-green-50 text-green-900',
    amber: 'bg-amber-50 text-amber-900',
  };
  return (
    <div className={`px-3 py-2 rounded ${colorClass[color]}`}>
      <p className="text-[10px] uppercase font-semibold opacity-70">{label}</p>
      <p className="text-sm font-bold mt-0.5">{value}</p>
    </div>
  );
}

function DiagDist({ title, dist }: { title: string; dist: Record<string, number> }) {
  const entries = Object.entries(dist);
  return (
    <div className="bg-gray-50 rounded p-3">
      <p className="text-[11px] font-bold text-gray-700 mb-2">{title}</p>
      {entries.length === 0 ? (
        <p className="text-[11px] text-gray-400">데이터 없음</p>
      ) : (
        <div className="space-y-1">
          {entries.map(([k, v]) => (
            <div key={k} className="flex justify-between text-[11px]">
              <span className="text-gray-600">{k}</span>
              <span className="font-bold text-gray-900">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── 수수료 결제 배지 — 셀 안에서 한눈에 ─── */
function FeeStatusBadge({
  feeStatus,
  feePaidAt,
}: {
  feeStatus: string | null;
  feePaidAt: string | null;
}) {
  if (!feeStatus || feeStatus === 'not_applicable') return null;
  const map: Record<string, { label: string; color: string }> = {
    paid: { label: '✅ 결제완료', color: 'bg-green-100 text-green-800 border-green-300' },
    awaiting_payment: { label: '⏳ 결제대기', color: 'bg-amber-100 text-amber-800 border-amber-300' },
    awaiting_review: { label: '검토대기', color: 'bg-gray-100 text-gray-700 border-gray-300' },
    overdue: { label: '⚠️ 미납', color: 'bg-orange-100 text-orange-800 border-orange-300' },
    suspended: { label: '🚫 정지', color: 'bg-red-100 text-red-700 border-red-300' },
  };
  const meta = map[feeStatus] || { label: feeStatus, color: 'bg-gray-100 text-gray-700 border-gray-300' };
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${meta.color}`}
      title={feePaidAt ? `결제 완료 ${new Date(feePaidAt).toLocaleString('ko-KR')}` : undefined}
    >
      {meta.label}
    </span>
  );
}

/* ─── 결제 상태 배지 ─── */
function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
    normal: { label: '정상', color: 'bg-green-100 text-green-700', Icon: CheckCircle2 },
    retrying: { label: '재시도중', color: 'bg-blue-100 text-blue-700', Icon: RefreshCw },
    final_failed: { label: '최종실패', color: 'bg-red-100 text-red-700', Icon: XCircle },
    locked: { label: '락 걸림', color: 'bg-orange-100 text-orange-800', Icon: Lock },
    no_card: { label: '카드 미등록', color: 'bg-amber-100 text-amber-800', Icon: CreditCard },
    no_report: { label: '리포트 미제출', color: 'bg-gray-100 text-gray-700', Icon: AlertTriangle },
    no_contract: { label: '계약 미서명', color: 'bg-purple-100 text-purple-800', Icon: AlertTriangle },
    excluded: { label: '결제 제외', color: 'bg-slate-200 text-slate-700', Icon: Unlock },
  };
  const meta = map[status];
  const Icon = meta.Icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${meta.color}`}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}
