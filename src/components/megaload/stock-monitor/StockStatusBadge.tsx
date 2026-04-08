'use client';

import { CheckCircle2, XCircle, AlertTriangle, Loader2, MinusCircle } from 'lucide-react';

type StatusType = 'in_stock' | 'sold_out' | 'removed' | 'unknown' | 'error' | 'active' | 'suspended';

const STATUS_CONFIG: Record<StatusType, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  in_stock: { label: '판매중', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  sold_out: { label: '품절', color: 'bg-red-100 text-red-700', icon: XCircle },
  removed: { label: '삭제됨', color: 'bg-gray-100 text-gray-600', icon: MinusCircle },
  unknown: { label: '미확인', color: 'bg-yellow-100 text-yellow-700', icon: AlertTriangle },
  error: { label: '오류', color: 'bg-orange-100 text-orange-700', icon: AlertTriangle },
  active: { label: '판매중', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  suspended: { label: '중지됨', color: 'bg-red-100 text-red-700', icon: XCircle },
};

export default function StockStatusBadge({ status, size = 'sm' }: { status: StatusType; size?: 'xs' | 'sm' }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
  const Icon = config.icon;
  const sizeClass = size === 'xs' ? 'text-[10px] px-1.5 py-0.5 gap-0.5' : 'text-xs px-2 py-1 gap-1';
  const iconSize = size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span className={`inline-flex items-center ${sizeClass} rounded-full font-medium ${config.color}`}>
      <Icon className={iconSize} />
      {config.label}
    </span>
  );
}
