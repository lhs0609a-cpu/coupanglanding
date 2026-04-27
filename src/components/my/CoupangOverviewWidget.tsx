'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/Card';
import { Package, TrendingUp, Wallet, Percent, RefreshCw, Clock } from 'lucide-react';
import CoupangApiAlert, { type CoupangAlertKind } from './CoupangApiAlert';

interface OverviewData {
  productCount: number;
  monthlySales: number;
  monthlySettlement: number;
  monthlyCommission: number;
  yearMonth: string;
  syncedAt: string;
  alert?: CoupangAlertKind | null;
  failedIp?: string | null;
}

function formatKRW(value: number): string {
  if (value >= 10000) {
    return `${Math.floor(value / 10000).toLocaleString()}만원`;
  }
  return `${value.toLocaleString()}원`;
}

function formatSyncTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  return `${MM}.${DD} ${hh}:${mm}`;
}

export default function CoupangOverviewWidget() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/coupang-overview');
      if (!res.ok) {
        setError(true);
        return;
      }
      const json = await res.json();
      setData(json);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setSyncing(true);
    fetchData();
  };

  if (error) return null;

  if (loading) {
    return (
      <Card>
        <div className="py-6 text-center text-gray-400 text-sm">쿠팡 데이터 불러오는 중...</div>
      </Card>
    );
  }

  if (!data) return null;

  const monthLabel = data.yearMonth.replace('-', '년 ') + '월';

  const stats = [
    {
      label: '총 등록 상품',
      value: `${data.productCount.toLocaleString()}개`,
      icon: <Package className="w-5 h-5" />,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      label: `${monthLabel} 매출`,
      value: formatKRW(data.monthlySales),
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'bg-green-50 text-green-600',
    },
    {
      label: `${monthLabel} 정산액`,
      value: formatKRW(data.monthlySettlement),
      icon: <Wallet className="w-5 h-5" />,
      color: 'bg-purple-50 text-purple-600',
    },
    {
      label: `${monthLabel} 수수료`,
      value: formatKRW(data.monthlyCommission),
      icon: <Percent className="w-5 h-5" />,
      color: 'bg-orange-50 text-orange-600',
    },
  ];

  return (
    <Card>
      {/* 통합 알림 배너 — 7가지 실패 시나리오 모두 일관된 친절 안내 */}
      {data.alert && <CoupangApiAlert alert={data.alert} failedIp={data.failedIp} />}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">쿠팡 연동 현황</h2>
        <div className="flex items-center gap-2">
          {data?.syncedAt && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              {formatSyncTime(data.syncedAt)}
            </span>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={syncing}
            className="p-1.5 rounded-lg text-gray-400 hover:text-[#E31837] hover:bg-red-50 transition disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${stat.color}`}>
              {stat.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-gray-500 truncate">{stat.label}</p>
              <p className="text-lg font-bold text-gray-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
