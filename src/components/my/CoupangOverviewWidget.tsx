'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import { Package, TrendingUp, Wallet, Percent } from 'lucide-react';

interface OverviewData {
  productCount: number;
  monthlySales: number;
  monthlySettlement: number;
  monthlyCommission: number;
  yearMonth: string;
}

function formatKRW(value: number): string {
  if (value >= 10000) {
    return `${Math.floor(value / 10000).toLocaleString()}만원`;
  }
  return `${value.toLocaleString()}원`;
}

export default function CoupangOverviewWidget() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/coupang-overview');
        if (!res.ok) {
          setError(true);
          return;
        }
        const json = await res.json();
        setData(json);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
      <h2 className="text-lg font-bold text-gray-900 mb-4">쿠팡 연동 현황</h2>
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
