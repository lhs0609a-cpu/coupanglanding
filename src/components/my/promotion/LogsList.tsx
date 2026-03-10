'use client';

import Card from '@/components/ui/Card';
import { CheckCircle, XCircle, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import type { CouponApplyLog } from '@/lib/supabase/types';

interface LogsListProps {
  items: CouponApplyLog[];
  total: number;
  loading: boolean;
  currentPage: number;
  onPageChange: (page: number) => void;
  pageSize: number;
}

export default function LogsList({
  items,
  total,
  loading,
  currentPage,
  onPageChange,
  pageSize,
}: LogsListProps) {
  const totalPages = Math.ceil(total / pageSize);

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <Card>
      {loading ? (
        <div className="py-8 text-center text-gray-400">불러오는 중...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center">
          <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">적용 이력이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((log) => (
            <div
              key={log.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 transition"
            >
              {/* Icon */}
              {log.success ? (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    log.coupon_type === 'instant'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {log.coupon_type === 'instant' ? '즉시할인' : '다운로드'}
                  </span>
                  {log.coupon_name && (
                    <span className="text-xs text-gray-500 truncate">{log.coupon_name}</span>
                  )}
                </div>
                <p className="text-sm text-gray-900">
                  상품 <span className="font-mono text-xs">{log.seller_product_id}</span>
                  {log.vendor_item_id && (
                    <span className="text-gray-400 text-xs"> (아이템: {log.vendor_item_id})</span>
                  )}
                </p>
                {log.error_message && (
                  <p className="text-xs text-red-500 mt-0.5 truncate">{log.error_message}</p>
                )}
              </div>

              {/* Timestamp */}
              <p className="text-[10px] text-gray-400 flex-shrink-0">
                {formatDate(log.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500">총 {total.toLocaleString()}건</p>
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
  );
}
