'use client';

import { RefreshCw, XCircle, RotateCcw } from 'lucide-react';
import { BULK_STATUS_LABELS } from '@/lib/data/promotion-constants';
import type { BulkApplyProgress } from '@/lib/supabase/types';

interface ProgressDisplayProps {
  progress: BulkApplyProgress;
  onCancel: () => void;
  onRestart: () => void;
  cancelling: boolean;
  restarting: boolean;
}

export default function ProgressDisplay({
  progress,
  onCancel,
  onRestart,
  cancelling,
  restarting,
}: ProgressDisplayProps) {
  const isActive = progress.status === 'collecting' || progress.status === 'applying';
  const totalProcessed = progress.instant_success + progress.instant_failed + progress.download_success + progress.download_failed;
  const totalTarget = progress.instant_total + progress.download_total;
  const applyPercent = totalTarget > 0 ? Math.round((totalProcessed / totalTarget) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isActive && <RefreshCw className="w-4 h-4 text-[#E31837] animate-spin" />}
          <h3 className="text-sm font-bold text-gray-900">일괄 적용 진행</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            progress.status === 'completed' ? 'bg-green-100 text-green-700' :
            progress.status === 'failed' ? 'bg-red-100 text-red-700' :
            progress.status === 'cancelled' ? 'bg-gray-100 text-gray-600' :
            'bg-blue-100 text-blue-700'
          }`}>
            {BULK_STATUS_LABELS[progress.status] || progress.status}
          </span>
        </div>
        {isActive && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" />
              {cancelling ? '취소 중...' : '취소'}
            </button>
          </div>
        )}
        {(progress.status === 'failed' || progress.status === 'cancelled') && (
          <button
            type="button"
            onClick={onRestart}
            disabled={restarting}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {restarting ? '재시작 중...' : '재시작'}
          </button>
        )}
      </div>

      {/* Collecting progress */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>상품 수집</span>
          <span>{progress.collecting_progress}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${progress.collecting_progress}%` }}
          />
        </div>
      </div>

      {/* Applying progress */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>쿠폰 적용</span>
          <span>{applyPercent}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#E31837] rounded-full transition-all duration-300"
            style={{ width: `${applyPercent}%` }}
          />
        </div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div className="bg-gray-50 rounded-lg p-2">
          <p className="text-xs text-gray-500">총 상품</p>
          <p className="text-lg font-bold text-gray-900">{progress.total_products}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-2">
          <p className="text-xs text-gray-500">성공</p>
          <p className="text-lg font-bold text-green-600">
            {progress.instant_success + progress.download_success}
          </p>
        </div>
        <div className="bg-red-50 rounded-lg p-2">
          <p className="text-xs text-gray-500">실패</p>
          <p className="text-lg font-bold text-red-600">
            {progress.instant_failed + progress.download_failed}
          </p>
        </div>
        <div className="bg-blue-50 rounded-lg p-2">
          <p className="text-xs text-gray-500">총 아이템</p>
          <p className="text-lg font-bold text-blue-600">{progress.total_items}</p>
        </div>
      </div>
    </div>
  );
}
