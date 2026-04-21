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
  getReportTargetMonth,
  getPreviousMonth,
  isEligibleForMonth,
  getSettlementStatus,
} from '@/lib/utils/settlement';
import StatCard from '@/components/ui/StatCard';
import { Table2, Search, Download, TrendingUp, Users as UsersIcon, CheckCircle2, Banknote, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Zap } from 'lucide-react';
import type { PtUser, MonthlyReport, Profile, ApiRevenueSnapshot } from '@/lib/supabase/types';

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
  status: string;
  isEligible: boolean;
  /** 데이터 출처 — 'report'=PT생 확정, 'api'=쿠팡 API 자동수집 잠정, 'none'=없음 */
  source: 'report' | 'api' | 'none';
  syncedAt?: string;
  syncError?: string | null;
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

/** 최근 N개월 배열 생성 (최신 → 과거) */
function getRecentMonths(count: number): string[] {
  const months: string[] = [];
  let ym = getReportTargetMonth();
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

  const supabase = useMemo(() => createClient(), []);

  /** 데이터 조회. initial=true 면 로딩 스피너 표시, 주기 폴링에서는 false 로 silent */
  const fetchData = useCallback(async (initial = true) => {
    if (initial) setLoading(true);
    try {
      const { data: usersData } = await supabase
        .from('pt_users')
        .select('*, profile:profiles(*)')
        .neq('status', 'terminated')
        .order('created_at', { ascending: false });
      const fetchedUsers = (usersData as PtUserWithProfile[]) || [];
      setUsers(fetchedUsers);

      if (fetchedUsers.length > 0) {
        const userIds = fetchedUsers.map(u => u.id);
        const [reportsRes, snapshotsRes] = await Promise.all([
          supabase.from('monthly_reports').select('*').in('pt_user_id', userIds),
          supabase.from('api_revenue_snapshots').select('*').in('pt_user_id', userIds),
        ]);
        setReports((reportsRes.data as MonthlyReport[]) || []);
        setSnapshots((snapshotsRes.data as ApiRevenueSnapshot[]) || []);
      } else {
        setReports([]);
        setSnapshots([]);
      }
      setLastRefreshAt(new Date());
    } catch (err) {
      console.error('sales-overview fetch error:', err);
    } finally {
      if (initial) setLoading(false);
    }
  }, [supabase]);

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
  const currentMonth = months[0]; // 보고 대상 월(전월)

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
          monthly.set(ym, {
            revenue,
            deposit,
            status: report.payment_status,
            isEligible: true,
            source: 'report',
          });
        } else if (snap && (snap.total_sales > 0 || !snap.sync_error)) {
          // API 스냅샷: 매출 → 정산은 API commission 기반 대략값 (광고비/반품비 제외)
          const revenue = Number(snap.total_sales) || 0;
          const deposit = revenue > 0
            ? calculateDeposit(
                revenue,
                {
                  cost_product: 0,
                  cost_commission: Number(snap.total_commission) || 0,
                  cost_advertising: 0,
                  cost_returns: Number(snap.total_returns) || 0,
                  cost_shipping: Number(snap.total_shipping) || 0,
                  cost_tax: 0,
                },
                user.share_percentage,
              )
            : 0;
          monthly.set(ym, {
            revenue,
            deposit,
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
          {
            cost_product: 0,
            cost_commission: Number(s.total_commission) || 0,
            cost_advertising: 0,
            cost_returns: Number(s.total_returns) || 0,
            cost_shipping: Number(s.total_shipping) || 0,
            cost_tax: 0,
          },
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

    // 이번달 청구 수수료 (PT생이 우리에게 결제할 금액, VAT 포함)
    const currentReports = reports.filter(r => r.year_month === currentMonth);
    let feeBilledTotal = 0; // 이번달 청구 총액
    let feePaidTotal = 0;   // 이미 납부완료된 금액
    let feeDueTotal = 0;    // 미납(받아야 할) 금액
    let feePaidCount = 0;
    let feeDueCount = 0;
    for (const r of currentReports) {
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
    };
  }, [rows, reports, currentMonth]);

  /** 월별 총합 (matrix 하단 합계행) */
  const monthTotals = useMemo(() => {
    const totals: Record<string, { revenue: number; deposit: number }> = {};
    for (const ym of months) {
      totals[ym] = { revenue: 0, deposit: 0 };
      for (const row of filteredRows) {
        const m = row.monthly.get(ym);
        if (m) {
          totals[ym].revenue += m.revenue;
          totals[ym].deposit += m.deposit;
        }
      }
    }
    const totalCumRev = filteredRows.reduce((s, r) => s + r.totalRevenue, 0);
    const totalCumDep = filteredRows.reduce((s, r) => s + r.totalDeposit, 0);
    return { totals, totalCumRev, totalCumDep };
  }, [filteredRows, months]);

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
  const renderCell = (m: MonthCell) => {
    if (!m.isEligible && m.source === 'none') {
      return <span className="text-xs text-gray-300">-</span>;
    }
    if (m.source === 'none') {
      return (
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs text-gray-400">미제출</span>
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
          <span className="text-[11px] text-blue-500">→ {formatKRW(m.deposit)}</span>
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
            <Zap className="w-2.5 h-2.5" /> API 잠정
          </span>
        </div>
      );
    }
    const statusColor = PAYMENT_STATUS_COLORS[m.status] || 'bg-gray-100 text-gray-700';
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-xs font-semibold text-gray-900">{formatKRW(m.revenue)}</span>
        <span className="text-[11px] text-gray-500">→ {formatKRW(m.deposit)}</span>
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
            <Zap className="w-3 h-3 inline text-blue-500" /> API 잠정 = 쿠팡 API에서 자동수집한 매출(광고비/반품비 미반영) · 확정값은 PT생이 제출한 리포트 기준
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

      {/* 핵심: 이번달 우리가 받을 돈 (PT생 → 우리, VAT 포함) */}
      <div className="bg-gradient-to-r from-[#E31837]/5 to-amber-50 border-2 border-[#E31837]/30 rounded-xl p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold text-[#E31837] uppercase tracking-wide">이번달 청구 수수료 (PT생 → 우리)</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{formatKRW(summary.feeBilledTotal)}</p>
            <p className="text-[11px] text-gray-500 mt-1">VAT 포함 · 기준월 {formatYearMonth(currentMonth)} · 제출된 리포트만 집계</p>
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
                      className="px-3 py-3 text-right text-xs font-semibold text-gray-600 border-r border-gray-200"
                      style={{ minWidth: 130 }}
                    >
                      {formatYearMonth(ym)}
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
                {filteredRows.map(row => (
                  <tr key={row.user.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 border-r border-gray-200" style={{ minWidth: 200 }}>
                      <div className="font-medium text-gray-900 flex items-center gap-1">
                        {row.user.profile?.full_name || '-'}
                        {row.apiConnected && (
                          <span title={`API 연동 · ${row.latestSyncedAt ? '최근 동기화 ' + new Date(row.latestSyncedAt).toLocaleString('ko-KR') : '동기화 이력 없음'}`}>
                            <Zap className="w-3 h-3 text-blue-500" />
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
                      <td key={ym} className="px-3 py-3 text-right border-r border-gray-200">
                        {renderCell(row.monthly.get(ym)!)}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right border-r border-gray-200 bg-blue-50/40">
                      <div className="text-sm font-semibold text-gray-900">{formatKRW(row.totalRevenue)}</div>
                    </td>
                    <td className="px-3 py-3 text-right bg-blue-50/40">
                      <div className="text-sm font-semibold text-[#E31837]">{formatKRW(row.totalDeposit)}</div>
                    </td>
                  </tr>
                ))}
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
                      <td key={ym} className="px-3 py-3 text-right border-r border-gray-200">
                        <div className="text-xs font-semibold text-gray-900">{formatKRW(t.revenue)}</div>
                        <div className="text-[11px] text-[#E31837]">→ {formatKRW(t.deposit)}</div>
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
          <span className="ml-auto text-gray-500">셀 형식: 매출 → 정산액</span>
        </div>
      </div>
    </div>
  );
}
