'use client';

import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import { ChevronLeft, ChevronRight, Package } from 'lucide-react';
import { TRACKING_STATUS_LABELS, TRACKING_STATUS_COLORS } from '@/lib/data/promotion-constants';
import type { ProductCouponTracking, TrackingStatus } from '@/lib/supabase/types';

interface TrackingListProps {
  items: ProductCouponTracking[];
  total: number;
  loading: boolean;
  currentFilter: TrackingStatus | 'all';
  onFilterChange: (filter: TrackingStatus | 'all') => void;
  currentPage: number;
  onPageChange: (page: number) => void;
  pageSize: number;
}

const FILTER_OPTIONS: { key: TrackingStatus | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '대기' },
  { key: 'processing', label: '처리중' },
  { key: 'completed', label: '완료' },
  { key: 'failed', label: '실패' },
  { key: 'skipped', label: '건너뜀' },
];

export default function TrackingList({
  items,
  total,
  loading,
  currentFilter,
  onFilterChange,
  currentPage,
  onPageChange,
  pageSize,
}: TrackingListProps) {
  const totalPages = Math.ceil(total / pageSize);

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-4">
      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => { onFilterChange(opt.key); onPageChange(0); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
              currentFilter === opt.key
                ? 'border-[#E31837] bg-red-50 text-[#E31837]'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* List */}
      <Card>
        {loading ? (
          <div className="py-8 text-center text-gray-400">불러오는 중...</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center">
            <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">추적 중인 상품이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-gray-200 transition"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      label={TRACKING_STATUS_LABELS[item.status] || item.status}
                      colorClass={TRACKING_STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-600'}
                    />
                    <span className="text-xs text-gray-400 font-mono">{item.seller_product_id}</span>
                  </div>
                  <p className="text-sm text-gray-900 truncate">
                    {item.seller_product_name || '(이름 없음)'}
                  </p>
                  {item.error_message && (
                    <p className="text-xs text-red-500 mt-0.5 truncate">{item.error_message}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <div className="flex gap-2 text-[10px]">
                    {item.instant_coupon_applied && (
                      <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">즉시</span>
                    )}
                    {item.download_coupon_applied && (
                      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">다운</span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">{formatDate(item.updated_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              총 {total.toLocaleString()}건
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 0}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-600 px-2">
                {currentPage + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage >= totalPages - 1}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
