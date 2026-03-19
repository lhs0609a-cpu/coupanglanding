'use client';

import {
  CheckCircle2, XCircle, Loader2, Pause, Play, RefreshCw, Package,
} from 'lucide-react';
import type { EditableProduct } from './types';

interface BulkStep3ProgressProps {
  products: EditableProduct[];
  registering: boolean;
  isPaused: boolean;
  batchProgress: { current: number; total: number };
  startTime: number | null;
  imagePreuploadCacheSize: number;
  onTogglePause: () => void;
  onReset: () => void;
}

function formatTime(seconds: number) {
  if (seconds < 60) return `${seconds}초`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}분 ${s}초`;
}

function StatBox({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
      <div className={`text-xl font-bold ${highlight ? 'text-[#E31837]' : 'text-gray-900'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

export default function BulkStep3Progress({
  products, registering, isPaused, batchProgress, startTime, imagePreuploadCacheSize,
  onTogglePause, onReset,
}: BulkStep3ProgressProps) {
  const selectedProducts = products.filter(p => p.selected);
  const selectedCount = selectedProducts.length;
  const successCount = products.filter(p => p.status === 'success').length;
  const failCount = products.filter(p => p.status === 'error').length;
  const pendingCount = products.filter(p => p.selected && p.status === 'pending').length;
  const processedCount = successCount + failCount;

  const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
  const avgPerProduct = processedCount > 0 ? elapsed / processedCount : 0;
  const remainingEstimate = avgPerProduct > 0 ? Math.ceil(avgPerProduct * pendingCount) : 0;

  return (
    <div className="space-y-6">
      {/* Progress card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {registering ? (
              <>
                등록 진행 중 — 배치 {batchProgress.current}/{batchProgress.total}
                <span className="text-sm font-normal text-gray-400 ml-2">
                  ({imagePreuploadCacheSize > 0 ? '이미지 사전업로드 적용' : '일반 모드'}, 배치 크기 10)
                </span>
              </>
            ) : '등록 완료'}
          </h2>
          {registering && (
            <button
              onClick={onTogglePause}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition ${
                isPaused ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100' : 'bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100'
              }`}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {isPaused ? '재개' : '일시정지'}
            </button>
          )}
        </div>

        <div className="w-full bg-gray-200 rounded-full h-4 mb-3">
          <div
            className="bg-[#E31837] h-4 rounded-full transition-all duration-300 flex items-center justify-center"
            style={{ width: `${selectedCount > 0 ? (processedCount / selectedCount) * 100 : 0}%` }}
          >
            {processedCount > 0 && (
              <span className="text-[10px] text-white font-medium">
                {Math.round((processedCount / selectedCount) * 100)}%
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex gap-4">
            <span className="text-green-600">성공: {successCount}</span>
            <span className="text-red-600">실패: {failCount}</span>
            <span className="text-gray-400">대기: {pendingCount}</span>
          </div>
          <div className="flex gap-4 text-xs text-gray-400">
            <span>경과: {formatTime(elapsed)}</span>
            {registering && remainingEstimate > 0 && <span>예상 남은: {formatTime(remainingEstimate)}</span>}
          </div>
        </div>
      </div>

      {/* Completion stats */}
      {!registering && (
        <div className="grid grid-cols-3 gap-4">
          <StatBox label="전체" value={selectedCount} />
          <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{successCount}</div>
            <div className="text-xs text-green-600 mt-1">성공</div>
          </div>
          <div className={`rounded-xl border p-4 text-center ${failCount > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
            <div className={`text-2xl font-bold ${failCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>{failCount}</div>
            <div className={`text-xs mt-1 ${failCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>실패</div>
          </div>
        </div>
      )}

      {/* Per-product status table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 text-sm font-medium text-gray-700">등록 상태</div>
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 w-12">상태</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-16">코드</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">상품명</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-32">쿠팡 ID / 오류</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 w-16">소요</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.filter(p => p.selected).map((p) => (
                <tr key={p.uid} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-center">
                    {p.status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />}
                    {p.status === 'error' && <XCircle className="w-4 h-4 text-red-500 mx-auto" />}
                    {p.status === 'registering' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin mx-auto" />}
                    {p.status === 'pending' && <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono text-gray-500">{p.productCode}</td>
                  <td className="px-4 py-2 text-sm text-gray-700 line-clamp-1">{p.editedName}</td>
                  <td className="px-4 py-2 text-xs">
                    {p.status === 'success' && <span className="text-green-600">#{p.channelProductId}</span>}
                    {p.status === 'error' && <span className="text-red-600 truncate max-w-[200px] block" title={p.errorMessage}>{p.errorMessage}</span>}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400 text-right">{p.duration ? `${(p.duration / 1000).toFixed(1)}s` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!registering && (
        <div className="flex items-center justify-center">
          <button onClick={onReset} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
            <RefreshCw className="w-4 h-4" /> 새로 등록하기
          </button>
        </div>
      )}
    </div>
  );
}
