'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Table2, Search, Download, TrendingUp, Users as UsersIcon, CheckCircle2, Banknote, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { PtUser, MonthlyReport, Profile } from '@/lib/supabase/types';

interface PtUserWithProfile extends PtUser {
  profile: Profile;
}

type SortKey = 'name' | 'created' | 'currentRevenue' | 'currentDeposit' | 'totalRevenue' | 'totalDeposit';
type SortDir = 'asc' | 'desc';
type MonthRange = 3 | 6 | 12;
type StatusFilter = 'all' | 'pending' | 'submitted' | 'completed' | 'overdue';

interface UserRow {
  user: PtUserWithProfile;
  // yearMonth → { revenue, deposit, status }
  monthly: Map<string, { revenue: number; deposit: number; status: string; isEligible: boolean }>;
  totalRevenue: number;
  totalDeposit: number;
  currentRevenue: number;
  currentDeposit: number;
  currentStatus: string; // for filtering
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
  const [monthRange, setMonthRange] = useState<MonthRange>(6);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('currentRevenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. 모든 PT 사용자 + 프로필
      const { data: usersData } = await supabase
        .from('pt_users')
        .select('*, profile:profiles(*)')
        .neq('status', 'terminated')
        .order('created_at', { ascending: false });
      const fetchedUsers = (usersData as PtUserWithProfile[]) || [];
      setUsers(fetchedUsers);

      // 2. 전체 월별 보고서 (누적 합계용)
      if (fetchedUsers.length > 0) {
        const userIds = fetchedUsers.map(u => u.id);
        const { data: reportsData } = await supabase
          .from('monthly_reports')
          .select('*')
          .in('pt_user_id', userIds);
        setReports((reportsData as MonthlyReport[]) || []);
      } else {
        setReports([]);
      }
    } catch (err) {
      console.error('sales-overview fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const months = useMemo(() => getRecentMonths(monthRange), [monthRange]);
  const currentMonth = months[0]; // 보고 대상 월(전월)

  /** 사용자별 집계 계산 */
  const rows = useMemo<UserRow[]>(() => {
    // userId → reports
    const reportsByUser = new Map<string, MonthlyReport[]>();
    for (const r of reports) {
      const list = reportsByUser.get(r.pt_user_id) || [];
      list.push(r);
      reportsByUser.set(r.pt_user_id, list);
    }

    return users.map(user => {
      const userReports = reportsByUser.get(user.id) || [];
      const monthly = new Map<string, { revenue: number; deposit: number; status: string; isEligible: boolean }>();

      // 표시 월별 집계
      for (const ym of months) {
        const report = userReports.find(r => r.year_month === ym);
        const isEligible = isEligibleForMonth(user.created_at, ym);
        if (report) {
          const revenue = report.reported_revenue || 0;
          // 관리자 확정 송금액 우선, 없으면 계산값
          const deposit = report.admin_deposit_amount
            || report.calculated_deposit
            || calculateDeposit(revenue, getReportCosts(report), user.share_percentage);
          monthly.set(ym, {
            revenue,
            deposit,
            status: report.payment_status,
            isEligible: true,
          });
        } else {
          monthly.set(ym, { revenue: 0, deposit: 0, status: 'none', isEligible });
        }
      }

      // 누적 합계 (모든 보고서 기준, 표시 범위와 무관)
      let totalRevenue = 0;
      let totalDeposit = 0;
      for (const r of userReports) {
        totalRevenue += r.reported_revenue || 0;
        totalDeposit += r.admin_deposit_amount
          || r.calculated_deposit
          || calculateDeposit(r.reported_revenue || 0, getReportCosts(r), user.share_percentage);
      }

      // 당월(보고대상월) 지표
      const curr = monthly.get(currentMonth)!;
      const currentStatus = getSettlementStatus(user.created_at, curr.status === 'none' ? null : curr.status, currentMonth);

      return {
        user,
        monthly,
        totalRevenue,
        totalDeposit,
        currentRevenue: curr.revenue,
        currentDeposit: curr.deposit,
        currentStatus,
      };
    });
  }, [users, reports, months, currentMonth]);

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
    return {
      totalRev,
      totalDep,
      eligible: eligible.length,
      completed,
      submitted,
      overdue,
      pending,
      completionRate,
    };
  }, [rows, currentMonth]);

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
        cells.push(
          String(m.revenue),
          String(m.deposit),
          m.status === 'none' ? (m.isEligible ? '미제출' : '-') : (PAYMENT_STATUS_LABELS[m.status] || m.status),
        );
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
  const renderCell = (m: { revenue: number; deposit: number; status: string; isEligible: boolean }) => {
    if (!m.isEligible) {
      return <span className="text-xs text-gray-300">-</span>;
    }
    if (m.status === 'none') {
      return <span className="text-xs text-gray-400">미제출</span>;
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
        </div>
        <button
          onClick={exportCsv}
          disabled={loading || filteredRows.length === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
        >
          <Download className="w-4 h-4" />
          CSV 내보내기
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={`${formatYearMonth(currentMonth)} 총매출`}
          value={formatKRW(summary.totalRev)}
          subtitle={`대상자 ${summary.eligible}명`}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <StatCard
          title={`${formatYearMonth(currentMonth)} 총정산액`}
          value={formatKRW(summary.totalDep)}
          subtitle="확정/계산 송금액 합계"
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
                      <div className="font-medium text-gray-900">{row.user.profile?.full_name || '-'}</div>
                      <div className="text-[11px] text-gray-500 truncate max-w-[180px]">{row.user.profile?.email}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">수수료 {row.user.share_percentage}%</div>
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
