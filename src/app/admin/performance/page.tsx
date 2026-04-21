'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatKRW, formatYearMonth } from '@/lib/utils/format';
import { getReportTargetMonth, getPreviousMonth } from '@/lib/utils/settlement';
import { PT_STATUS_LABELS, PT_STATUS_COLORS } from '@/lib/utils/constants';
import { CHANNELS, CHANNEL_SHORT_LABELS, CHANNEL_COLORS } from '@/lib/megaload/constants';
import type { Channel } from '@/lib/megaload/types';
import type { PtUser, Profile } from '@/lib/supabase/types';
import StatCard from '@/components/ui/StatCard';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import SimpleBarChart from '@/components/ui/SimpleBarChart';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  BarChart3,
  Users,
  Package,
  TrendingUp,
  Search,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

// ── Types ──

interface PtUserWithProfile extends PtUser {
  profile: Profile;
}

interface MegaloadUserRow {
  id: string;
  profile_id: string;
}

interface ProductRow {
  id: string;
  megaload_user_id: string;
  status: string;
  channels: { channel: string; status: string }[];
}

interface ReportRow {
  pt_user_id: string;
  year_month: string;
  reported_revenue: number;
}

interface SnapshotRow {
  pt_user_id: string;
  year_month: string;
  total_sales: number;
  synced_at: string;
  sync_error: string | null;
}

type SortKey = 'name' | 'products' | 'currentRevenue' | 'totalRevenue';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'active' | 'paused';

interface UserPerf {
  user: PtUserWithProfile;
  activeProducts: number;
  totalProducts: number;
  channelCounts: Partial<Record<Channel, number>>;
  currentRevenue: number;
  totalRevenue: number;
  recentMonths: { month: string; revenue: number }[]; // last 3
}

// ── Helpers ──

function getRecentMonths(count: number): string[] {
  const months: string[] = [];
  let ym = getReportTargetMonth();
  for (let i = 0; i < count; i++) {
    months.push(ym);
    ym = getPreviousMonth(ym);
  }
  return months;
}

function shortMonth(ym: string): string {
  const [, m] = ym.split('-');
  return `${parseInt(m)}월`;
}

// ── Page ──

export default function AdminPerformancePage() {
  const [loading, setLoading] = useState(true);
  const [ptUsers, setPtUsers] = useState<PtUserWithProfile[]>([]);
  const [megaloadUsers, setMegaloadUsers] = useState<MegaloadUserRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('totalRevenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, megaloadRes, reportsRes, productsRes, snapshotsRes] = await Promise.all([
        supabase
          .from('pt_users')
          .select('*, profile:profiles(*)')
          .neq('status', 'terminated')
          .order('created_at', { ascending: false }),
        supabase
          .from('megaload_users')
          .select('id, profile_id'),
        supabase
          .from('monthly_reports')
          .select('pt_user_id, year_month, reported_revenue'),
        supabase
          .from('sh_products')
          .select('id, megaload_user_id, status, channels:sh_product_channels(channel, status)'),
        supabase
          .from('api_revenue_snapshots')
          .select('pt_user_id, year_month, total_sales, synced_at, sync_error'),
      ]);

      setPtUsers((usersRes.data as PtUserWithProfile[]) || []);
      setMegaloadUsers((megaloadRes.data as MegaloadUserRow[]) || []);
      setReports((reportsRes.data as ReportRow[]) || []);
      setProducts((productsRes.data as ProductRow[]) || []);
      setSnapshots((snapshotsRes.data as SnapshotRow[]) || []);
    } catch (err) {
      console.error('performance fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived data ──

  const last6 = useMemo(() => getRecentMonths(6), []);
  const last3 = useMemo(() => getRecentMonths(3), []);
  const currentMonth = last6[0];

  // profileId → megaloadUserId
  const profileToMegaload = useMemo(() => {
    const m = new Map<string, string>();
    for (const mu of megaloadUsers) {
      m.set(mu.profile_id, mu.id);
    }
    return m;
  }, [megaloadUsers]);

  // megaloadUserId → products
  const productsByMegaload = useMemo(() => {
    const m = new Map<string, ProductRow[]>();
    for (const p of products) {
      const list = m.get(p.megaload_user_id) || [];
      list.push(p);
      m.set(p.megaload_user_id, list);
    }
    return m;
  }, [products]);

  // ptUserId → reports
  const reportsByUser = useMemo(() => {
    const m = new Map<string, ReportRow[]>();
    for (const r of reports) {
      const list = m.get(r.pt_user_id) || [];
      list.push(r);
      m.set(r.pt_user_id, list);
    }
    return m;
  }, [reports]);

  const snapshotsByUser = useMemo(() => {
    const m = new Map<string, SnapshotRow[]>();
    for (const s of snapshots) {
      const list = m.get(s.pt_user_id) || [];
      list.push(s);
      m.set(s.pt_user_id, list);
    }
    return m;
  }, [snapshots]);

  /** report 우선, 없으면 snapshot(total_sales) */
  const resolveRevenue = useCallback((ptUserId: string, ym: string): number => {
    const reports = reportsByUser.get(ptUserId) || [];
    const r = reports.find(rr => rr.year_month === ym);
    if (r) return r.reported_revenue || 0;
    const snaps = snapshotsByUser.get(ptUserId) || [];
    const s = snaps.find(ss => ss.year_month === ym);
    return s ? Number(s.total_sales) || 0 : 0;
  }, [reportsByUser, snapshotsByUser]);

  // ── Per-user performance rows ──

  const rows = useMemo<UserPerf[]>(() => {
    return ptUsers.map(user => {
      const megaloadId = profileToMegaload.get(user.profile_id);
      const userProducts = megaloadId ? (productsByMegaload.get(megaloadId) || []) : [];
      const userReports = reportsByUser.get(user.id) || [];

      // Products
      const activeProducts = userProducts.filter(p => p.status === 'active').length;
      const totalProducts = userProducts.length;

      // Channel counts (from active product channels)
      const channelCounts: Partial<Record<Channel, number>> = {};
      for (const p of userProducts) {
        if (p.status !== 'active') continue;
        for (const ch of (p.channels || [])) {
          if (ch.status === 'active') {
            const key = ch.channel as Channel;
            channelCounts[key] = (channelCounts[key] || 0) + 1;
          }
        }
      }

      // Revenue — report 우선, 없으면 snapshot(API 잠정)
      const currentRevenue = resolveRevenue(user.id, currentMonth);

      // 누적 매출: report 월은 report 값, 그 외 월은 snapshot 값
      const userSnaps = snapshotsByUser.get(user.id) || [];
      const reportMonths = new Set(userReports.map(r => r.year_month));
      let totalRevenue = 0;
      for (const r of userReports) totalRevenue += r.reported_revenue || 0;
      for (const s of userSnaps) {
        if (reportMonths.has(s.year_month)) continue;
        totalRevenue += Number(s.total_sales) || 0;
      }

      const recentMonths = [...last3].reverse().map(ym => ({
        month: ym,
        revenue: resolveRevenue(user.id, ym),
      }));

      return {
        user,
        activeProducts,
        totalProducts,
        channelCounts,
        currentRevenue,
        totalRevenue,
        recentMonths,
      };
    });
  }, [ptUsers, profileToMegaload, productsByMegaload, reportsByUser, snapshotsByUser, resolveRevenue, currentMonth, last3]);

  // ── Filtered & sorted ──

  const filteredRows = useMemo(() => {
    let result = rows;

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(r => r.user.status === statusFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.user.profile?.full_name?.toLowerCase().includes(q) ||
        r.user.profile?.email?.toLowerCase().includes(q),
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case 'name':
          diff = (a.user.profile?.full_name || '').localeCompare(b.user.profile?.full_name || '', 'ko');
          break;
        case 'products':
          diff = a.activeProducts - b.activeProducts;
          break;
        case 'currentRevenue':
          diff = a.currentRevenue - b.currentRevenue;
          break;
        case 'totalRevenue':
          diff = a.totalRevenue - b.totalRevenue;
          break;
      }
      return sortDir === 'asc' ? diff : -diff;
    });

    return result;
  }, [rows, statusFilter, search, sortKey, sortDir]);

  // ── KPI aggregates ──

  const activeUserCount = useMemo(() => ptUsers.filter(u => u.status === 'active').length, [ptUsers]);
  const totalActiveProducts = useMemo(() => rows.reduce((s, r) => s + r.activeProducts, 0), [rows]);
  const currentMonthRevenue = useMemo(() => rows.reduce((s, r) => s + r.currentRevenue, 0), [rows]);
  const avgProducts = useMemo(() => activeUserCount > 0 ? (totalActiveProducts / activeUserCount) : 0, [totalActiveProducts, activeUserCount]);

  // ── Chart data ──

  // Monthly total revenue (last 6 months, oldest first) — report ∪ snapshot
  const monthlyRevenueChart = useMemo(() => {
    return [...last6].reverse().map(ym => {
      const total = ptUsers.reduce((s, u) => s + resolveRevenue(u.id, ym), 0);
      return { month: shortMonth(ym), fullMonth: ym, revenue: total };
    });
  }, [last6, ptUsers, resolveRevenue]);

  // Top 10 by total revenue
  const top10Data = useMemo(() => {
    return [...rows]
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10)
      .map(r => ({
        label: r.user.profile?.full_name || '이름없음',
        value: r.totalRevenue,
        color: '#E31837',
      }));
  }, [rows]);

  // Product distribution buckets
  const productDistribution = useMemo(() => {
    const buckets = [
      { label: '0개', min: 0, max: 0, count: 0 },
      { label: '1-5개', min: 1, max: 5, count: 0 },
      { label: '6-10개', min: 6, max: 10, count: 0 },
      { label: '11-20개', min: 11, max: 20, count: 0 },
      { label: '20+개', min: 21, max: Infinity, count: 0 },
    ];
    for (const r of rows) {
      const n = r.activeProducts;
      const bucket = buckets.find(b => n >= b.min && n <= b.max);
      if (bucket) bucket.count++;
    }
    return buckets.map(b => ({ name: b.label, count: b.count }));
  }, [rows]);

  // ── CSV export ──

  const handleExportCSV = useCallback(() => {
    const header = ['이름', '이메일', '상태', '활성상품', '전체상품', '당월매출', '누적매출'];
    const csvRows = [header.join(',')];
    for (const r of filteredRows) {
      csvRows.push([
        r.user.profile?.full_name || '',
        r.user.profile?.email || '',
        PT_STATUS_LABELS[r.user.status] || r.user.status,
        r.activeProducts,
        r.totalProducts,
        r.currentRevenue,
        r.totalRevenue,
      ].join(','));
    }
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pt_performance_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredRows]);

  // ── Sort handler ──

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3.5 h-3.5 text-[#E31837]" />
      : <ArrowDown className="w-3.5 h-3.5 text-[#E31837]" />;
  };

  // ── Mini bar chart renderer ──

  const MiniBar = ({ data }: { data: { month: string; revenue: number }[] }) => {
    const max = Math.max(...data.map(d => d.revenue), 1);
    return (
      <div className="flex items-end gap-1 h-8">
        {data.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div
              className="w-5 rounded-sm bg-[#E31837]/70"
              style={{ height: `${Math.max((d.revenue / max) * 28, 2)}px` }}
              title={`${shortMonth(d.month)}: ${formatKRW(d.revenue)}`}
            />
            <span className="text-[9px] text-gray-400">{shortMonth(d.month)}</span>
          </div>
        ))}
      </div>
    );
  };

  // ── Render ──

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl" />
            ))}
          </div>
          <div className="h-96 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-[#E31837]" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">PT생 성과</h1>
            <p className="text-sm text-gray-500">매출 + 상품 등록 종합 대시보드</p>
          </div>
        </div>
        <p className="text-sm text-gray-500">
          기준: {formatYearMonth(currentMonth)}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="활성 PT생"
          value={`${activeUserCount}명`}
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          title="등록 상품 수"
          value={`${totalActiveProducts.toLocaleString()}개`}
          icon={<Package className="w-5 h-5" />}
        />
        <StatCard
          title="이번 달 총매출"
          value={formatKRW(currentMonthRevenue)}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <StatCard
          title="평균 상품 수/학생"
          value={avgProducts.toFixed(1)}
          subtitle="활성상품 ÷ 활성PT생"
          icon={<BarChart3 className="w-5 h-5" />}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="이름 또는 이메일 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30"
        >
          <option value="all">전체 상태</option>
          <option value="active">활성</option>
          <option value="paused">일시정지</option>
        </select>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <Download className="w-4 h-4" />
          CSV 내보내기
        </button>
      </div>

      {/* Performance Table */}
      <Card className="overflow-hidden !p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-gray-900">
                    이름 <SortIcon col="name" />
                  </button>
                </th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">
                  <button onClick={() => handleSort('products')} className="flex items-center gap-1 justify-center hover:text-gray-900">
                    상품 수 <SortIcon col="products" />
                  </button>
                </th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">채널 현황</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">
                  <button onClick={() => handleSort('currentRevenue')} className="flex items-center gap-1 justify-end hover:text-gray-900 ml-auto">
                    당월 매출 <SortIcon col="currentRevenue" />
                  </button>
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">
                  <button onClick={() => handleSort('totalRevenue')} className="flex items-center gap-1 justify-end hover:text-gray-900 ml-auto">
                    누적 매출 <SortIcon col="totalRevenue" />
                  </button>
                </th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">추이</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">
                    {search || statusFilter !== 'all' ? '검색 결과가 없습니다.' : 'PT생 데이터가 없습니다.'}
                  </td>
                </tr>
              ) : (
                filteredRows.map(row => (
                  <tr key={row.user.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    {/* Name + email + status */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{row.user.profile?.full_name || '-'}</span>
                        <span className="text-xs text-gray-400">{row.user.profile?.email || '-'}</span>
                      </div>
                      <Badge
                        label={PT_STATUS_LABELS[row.user.status] || row.user.status}
                        colorClass={PT_STATUS_COLORS[row.user.status]}
                      />
                    </td>

                    {/* Products: active/total */}
                    <td className="px-4 py-3 text-center">
                      <span className="font-semibold text-gray-900">{row.activeProducts}</span>
                      <span className="text-gray-400">/{row.totalProducts}</span>
                    </td>

                    {/* Channel badges */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 justify-center">
                        {CHANNELS.map(ch => {
                          const count = row.channelCounts[ch];
                          if (!count) return null;
                          return (
                            <span
                              key={ch}
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${CHANNEL_COLORS[ch]}`}
                            >
                              {CHANNEL_SHORT_LABELS[ch]} {count}
                            </span>
                          );
                        })}
                        {Object.keys(row.channelCounts).length === 0 && (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </div>
                    </td>

                    {/* Current month revenue */}
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {row.currentRevenue > 0 ? formatKRW(row.currentRevenue) : <span className="text-gray-300">-</span>}
                    </td>

                    {/* Total revenue */}
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {row.totalRevenue > 0 ? formatKRW(row.totalRevenue) : <span className="text-gray-300">-</span>}
                    </td>

                    {/* Mini chart */}
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <MiniBar data={row.recentMonths} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
          총 {filteredRows.length}명 표시 (전체 {rows.length}명)
        </div>
      </Card>

      {/* Charts Section */}
      <div className="space-y-6">
        {/* Monthly Revenue Trend (Line Chart) */}
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">월별 총매출 추이 (최근 6개월)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyRevenueChart} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#666' }} />
                <YAxis
                  tick={{ fontSize: 12, fill: '#666' }}
                  tickFormatter={(v: number) => v >= 10000 ? `${(v / 10000).toFixed(0)}만` : v.toLocaleString()}
                />
                <Tooltip
                  formatter={(value: number) => [formatKRW(value), '매출']}
                  labelFormatter={(label: string) => label}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#E31837"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#E31837' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Bottom two charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top 10 Revenue */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">매출 TOP 10 (누적)</h3>
            <SimpleBarChart data={top10Data} height={300} />
          </Card>

          {/* Product Distribution */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">학생별 상품 수 분포</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productDistribution} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#666' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#666' }} allowDecimals={false} />
                  <Tooltip
                    formatter={(value: number) => [`${value}명`, '학생 수']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {productDistribution.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? '#d1d5db' : '#E31837'} opacity={0.7 + i * 0.06} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
