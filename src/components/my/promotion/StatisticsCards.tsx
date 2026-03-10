'use client';

import { Package, Clock, CheckCircle, XCircle } from 'lucide-react';

interface Stats {
  total: number;
  pending: number;
  completed: number;
  failed: number;
}

interface StatisticsCardsProps {
  stats: Stats;
  loading: boolean;
}

export default function StatisticsCards({ stats, loading }: StatisticsCardsProps) {
  const items = [
    { label: '총 추적', value: stats.total, icon: Package, color: 'text-gray-900', bg: 'bg-gray-50' },
    { label: '대기', value: stats.pending, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: '완료', value: stats.completed, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: '실패', value: stats.failed, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className={`${item.bg} rounded-xl p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${item.color}`} />
              <span className="text-xs font-medium text-gray-500">{item.label}</span>
            </div>
            <p className={`text-2xl font-bold ${item.color}`}>
              {loading ? '-' : item.value.toLocaleString()}
            </p>
          </div>
        );
      })}
    </div>
  );
}
