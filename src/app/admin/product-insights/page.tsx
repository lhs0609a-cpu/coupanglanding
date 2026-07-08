'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { formatKRW } from '@/lib/utils/format';
import { CHANNELS, CHANNEL_SHORT_LABELS } from '@/lib/megaload/constants';
import StatCard from '@/components/ui/StatCard';
import Card from '@/components/ui/Card';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  Package, TrendingUp, ShoppingCart, Users as UsersIcon, RefreshCw, Flame, Layers, Tag,
} from 'lucide-react';

interface TopRow {
  key: string; name: string; qty: number; revenue: number; orders: number; sellers: number; channels: string[];
}
interface RisingRow {
  key: string; name: string; revenue: number; prevRevenue: number; qty: number; growth: number | null; isNew: boolean;
}
interface InsightsData {
  kpi: { qty: number; revenue: number; products: number; sellers: number };
  top: TopRow[];
  trend: { date: string; qty: number; revenue: number }[];
  byChannel: { channel: string; qty: number; revenue: number }[];
  rising: RisingRow[];
  groupBy: string; days: number; channel: string;
}

const DONUT_COLORS = ['#E31837', '#3182F6', '#03C75A', '#FF6F00', '#8B5CF6', '#EC4899', '#14B8A6', '#F59E0B'];
const PERIODS = [{ v: 7, l: '7일' }, { v: 30, l: '30일' }, { v: 90, l: '90일' }];

export default function ProductInsightsPage() {
  const [groupBy, setGroupBy] = useState<'sku' | 'listing'>('sku');
  const [days, setDays] = useState(30);
  const [channel, setChannel] = useState('');
  const [metric, setMetric] = useState<'revenue' | 'qty'>('revenue');
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ days: String(days), groupBy });
      if (channel) params.set('channel', channel);
      const res = await fetch(`/api/admin/product-insights?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || String(res.status));
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days, groupBy, channel]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const topChart = useMemo(
    () => (data?.top || []).slice(0, 12).map((t) => ({
      name: t.name.length > 22 ? t.name.slice(0, 22) + '…' : t.name,
      value: metric === 'revenue' ? t.revenue : t.qty,
    })),
    [data, metric],
  );

  const donut = useMemo(
    () => (data?.byChannel || []).map((c) => ({
      name: CHANNEL_SHORT_LABELS[c.channel as keyof typeof CHANNEL_SHORT_LABELS] || c.channel,
      value: metric === 'revenue' ? c.revenue : c.qty,
    })),
    [data, metric],
  );

  const fmt = (n: number) => (metric === 'revenue' ? formatKRW(n) : `${n.toLocaleString()}개`);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">상품 판매 인사이트</h1>
          <p className="text-sm text-gray-500 mt-1">전체 피티생 실판매 데이터 · 지금 잘 팔리는 상품 한눈에</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* 컨트롤 */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* 집계 축 탭 */}
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1">
          <button
            onClick={() => setGroupBy('sku')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${groupBy === 'sku' ? 'bg-[#E31837] text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <Layers className="w-4 h-4" /> 실제 상품(SKU)
          </button>
          <button
            onClick={() => setGroupBy('listing')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${groupBy === 'listing' ? 'bg-[#E31837] text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <Tag className="w-4 h-4" /> 셀러 리스팅
          </button>
        </div>

        {/* 기간 */}
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.v}
              onClick={() => setDays(p.v)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${days === p.v ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {p.l}
            </button>
          ))}
        </div>

        {/* 채널 */}
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">전체 채널</option>
          {CHANNELS.map((ch) => (
            <option key={ch} value={ch}>{CHANNEL_SHORT_LABELS[ch]}</option>
          ))}
        </select>

        {/* 지표 토글 */}
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1 ml-auto">
          <button
            onClick={() => setMetric('revenue')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${metric === 'revenue' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            매출
          </button>
          <button
            onClick={() => setMetric('qty')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${metric === 'qty' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            수량
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          집계 오류: {error}
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="총 매출 (GMV)" value={formatKRW(data?.kpi.revenue || 0)} icon={<TrendingUp className="w-5 h-5" />} />
        <StatCard title="총 판매수량" value={`${(data?.kpi.qty || 0).toLocaleString()}개`} icon={<ShoppingCart className="w-5 h-5" />} />
        <StatCard title={groupBy === 'sku' ? '판매 상품 종수' : '판매 리스팅 수'} value={`${(data?.kpi.products || 0).toLocaleString()}`} icon={<Package className="w-5 h-5" />} />
        <StatCard title="판매 셀러 수" value={`${(data?.kpi.sellers || 0).toLocaleString()}명`} icon={<UsersIcon className="w-5 h-5" />} />
      </div>

      {loading && !data ? (
        <Card className="text-center text-gray-400 py-16">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" /> 집계 중...
        </Card>
      ) : (
        <>
          {/* 베스트셀러 + 채널 도넛 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-[#E31837]" /> 베스트셀러 Top 12 ({metric === 'revenue' ? '매출' : '수량'})
              </h2>
              {topChart.length === 0 ? (
                <p className="text-sm text-gray-400 py-12 text-center">데이터가 없습니다</p>
              ) : (
                <ResponsiveContainer width="100%" height={420}>
                  <BarChart data={topChart} layout="vertical" margin={{ left: 12, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => metric === 'revenue' ? `${Math.round(v / 10000)}만` : String(v)} fontSize={11} />
                    <YAxis type="category" dataKey="name" width={160} fontSize={11} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {topChart.map((_, i) => <Cell key={i} fill="#E31837" fillOpacity={1 - i * 0.05} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card>
              <h2 className="text-sm font-semibold text-gray-700 mb-4">채널별 비중</h2>
              {donut.length === 0 ? (
                <p className="text-sm text-gray-400 py-12 text-center">데이터가 없습니다</p>
              ) : (
                <ResponsiveContainer width="100%" height={420}>
                  <PieChart>
                    <Pie data={donut} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={110} label={(e: { name?: string }) => e.name ?? ''}>
                      {donut.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* 판매 추이 */}
          <Card>
            <h2 className="text-sm font-semibold text-gray-700 mb-4">기간별 판매 추이 ({metric === 'revenue' ? '매출' : '수량'})</h2>
            {(data?.trend.length || 0) === 0 ? (
              <p className="text-sm text-gray-400 py-12 text-center">데이터가 없습니다</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data?.trend || []} margin={{ left: 12, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={11} tickFormatter={(d: string) => d.slice(5)} />
                  <YAxis fontSize={11} tickFormatter={(v) => metric === 'revenue' ? `${Math.round(v / 10000)}만` : String(v)} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Line type="monotone" dataKey={metric} stroke="#E31837" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* 급상승 + 랭킹 테이블 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-green-600" /> 급상승 (직전 기간 대비)
              </h2>
              <div className="space-y-2">
                {(data?.rising || []).length === 0 ? (
                  <p className="text-sm text-gray-400 py-8 text-center">급상승 상품이 없습니다</p>
                ) : (
                  data!.rising.map((r, i) => (
                    <div key={r.key} className="flex items-center gap-3 text-sm">
                      <span className="w-5 text-gray-400 tabular-nums">{i + 1}</span>
                      <span className="flex-1 truncate text-gray-800">{r.name}</span>
                      <span className="text-gray-500 tabular-nums">{formatKRW(r.revenue)}</span>
                      <span className={`w-16 text-right font-medium tabular-nums ${r.isNew ? 'text-blue-600' : 'text-green-600'}`}>
                        {r.isNew ? 'NEW' : `+${r.growth}%`}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">전체 랭킹 Top 30</h2>
              <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 border-b sticky top-0 bg-white">
                    <tr>
                      <th className="text-left py-2 font-medium">#</th>
                      <th className="text-left py-2 font-medium">상품</th>
                      <th className="text-right py-2 font-medium">수량</th>
                      <th className="text-right py-2 font-medium">매출</th>
                      <th className="text-right py-2 font-medium">셀러</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.top || []).map((t, i) => (
                      <tr key={t.key} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 text-gray-400 tabular-nums">{i + 1}</td>
                        <td className="py-2 pr-2 text-gray-800 max-w-[240px] truncate" title={t.name}>{t.name}</td>
                        <td className="py-2 text-right tabular-nums">{t.qty.toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRW(t.revenue)}</td>
                        <td className="py-2 text-right tabular-nums text-gray-500">{t.sellers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
