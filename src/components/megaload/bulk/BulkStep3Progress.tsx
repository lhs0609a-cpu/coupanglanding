'use client';

import { useState, useCallback, Fragment } from 'react';
import {
  CheckCircle2, XCircle, Loader2, Pause, Play, RefreshCw,
  Copy, Download, ChevronDown, ChevronUp, Lightbulb,
  FolderOpen, Image, DollarSign, Wifi, ShieldAlert, Tag, FileText, Layers, AlertTriangle, Ban,
} from 'lucide-react';
import type { EditableProduct, ErrorCategory, DetailedError } from './types';
import { categorizeErrors } from '@/lib/megaload/services/error-classifier';

interface BulkStep3ProgressProps {
  products: EditableProduct[];
  registering: boolean;
  isPaused: boolean;
  batchProgress: { current: number; total: number };
  startTime: number | null;
  imagePreuploadCacheSize: number;
  onTogglePause: () => void;
  onReset: () => void;
  onRetryFailed?: () => void;
  onBackToStep2?: () => void;
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

const CATEGORY_CONFIG: Record<ErrorCategory, { label: string; icon: typeof FolderOpen; color: string; bgColor: string }> = {
  category:   { label: '카테고리',  icon: FolderOpen,    color: 'text-purple-700', bgColor: 'bg-purple-100' },
  image:      { label: '이미지',    icon: Image,         color: 'text-blue-700',   bgColor: 'bg-blue-100' },
  price:      { label: '가격',      icon: DollarSign,    color: 'text-orange-700',  bgColor: 'bg-orange-100' },
  network:    { label: '네트워크',  icon: Wifi,          color: 'text-gray-700',    bgColor: 'bg-gray-200' },
  auth:       { label: '인증',      icon: ShieldAlert,   color: 'text-red-700',     bgColor: 'bg-red-100' },
  brand:      { label: '브랜드',    icon: Tag,           color: 'text-pink-700',    bgColor: 'bg-pink-100' },
  duplicate:  { label: '중복',      icon: Ban,           color: 'text-amber-700',   bgColor: 'bg-amber-100' },
  shipping:   { label: '배송',      icon: Layers,        color: 'text-teal-700',    bgColor: 'bg-teal-100' },
  notice:     { label: '고시정보',  icon: FileText,      color: 'text-indigo-700',  bgColor: 'bg-indigo-100' },
  attribute:  { label: '속성',      icon: Layers,        color: 'text-cyan-700',    bgColor: 'bg-cyan-100' },
  validation: { label: '검증',      icon: AlertTriangle, color: 'text-yellow-700',  bgColor: 'bg-yellow-100' },
  unknown:    { label: '기타',      icon: XCircle,       color: 'text-red-700',     bgColor: 'bg-red-100' },
};

function getCategoryBadge(category: ErrorCategory) {
  return CATEGORY_CONFIG[category] || CATEGORY_CONFIG.unknown;
}

export default function BulkStep3Progress({
  products, registering, isPaused, batchProgress, startTime, imagePreuploadCacheSize,
  onTogglePause, onReset,
}: BulkStep3ProgressProps) {
  const [expandedErrorUids, setExpandedErrorUids] = useState<Set<string>>(new Set());
  const [expandedRawUids, setExpandedRawUids] = useState<Set<string>>(new Set());
  const [copiedReport, setCopiedReport] = useState(false);

  const selectedProducts = products.filter(p => p.selected);
  const selectedCount = selectedProducts.length;
  const successCount = products.filter(p => p.status === 'success').length;
  const failCount = products.filter(p => p.status === 'error').length;
  const pendingCount = products.filter(p => p.selected && p.status === 'pending').length;
  const processedCount = successCount + failCount;

  const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
  const avgPerProduct = processedCount > 0 ? elapsed / processedCount : 0;
  const remainingEstimate = avgPerProduct > 0 ? Math.ceil(avgPerProduct * pendingCount) : 0;

  // Collect all detailed errors
  const errorProducts = products.filter(p => p.status === 'error' && p.detailedError);
  const allErrors = errorProducts.map(p => p.detailedError!);
  const errorCounts: Record<ErrorCategory, number> = allErrors.length > 0 ? categorizeErrors(allErrors) : {} as Record<ErrorCategory, number>;

  const toggleErrorExpand = useCallback((uid: string) => {
    setExpandedErrorUids(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  }, []);

  const toggleRawExpand = useCallback((uid: string) => {
    setExpandedRawUids(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  }, []);

  const generateReportText = useCallback(() => {
    const lines: string[] = ['=== 메가로드 등록 에러 리포트 ===', ''];
    lines.push(`전체: ${selectedCount}, 성공: ${successCount}, 실패: ${failCount}`);
    lines.push(`경과 시간: ${formatTime(elapsed)}`);
    lines.push('');

    if (Object.keys(errorCounts).length > 0) {
      lines.push('--- 오류 분류 ---');
      for (const [cat, count] of Object.entries(errorCounts)) {
        const config = CATEGORY_CONFIG[cat as ErrorCategory];
        lines.push(`  ${config?.label || cat}: ${count}건`);
      }
      lines.push('');
    }

    lines.push('--- 상세 오류 ---');
    for (const p of errorProducts) {
      const de = p.detailedError!;
      lines.push(`[${p.productCode}] ${p.editedName}`);
      lines.push(`  카테고리: ${getCategoryBadge(de.category).label}`);
      lines.push(`  단계: ${de.step || '—'}`);
      lines.push(`  오류: ${de.message}`);
      if (de.field) lines.push(`  필드: ${de.field}`);
      lines.push(`  가이드: ${de.suggestion}`);
      lines.push('');
    }

    // Also include errors without detailedError
    const plainErrors = products.filter(p => p.status === 'error' && !p.detailedError && p.errorMessage);
    for (const p of plainErrors) {
      lines.push(`[${p.productCode}] ${p.editedName}`);
      lines.push(`  오류: ${p.errorMessage}`);
      lines.push('');
    }

    return lines.join('\n');
  }, [selectedCount, successCount, failCount, elapsed, errorCounts, errorProducts, products]);

  const handleCopyReport = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generateReportText());
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    } catch { /* fallback: ignore */ }
  }, [generateReportText]);

  const handleDownloadCsv = useCallback(() => {
    const BOM = '\uFEFF';
    const header = 'productCode,상품명,오류유형,단계,오류메시지,수정가이드\n';
    const rows = products
      .filter(p => p.status === 'error')
      .map(p => {
        const de = p.detailedError;
        const cat = de ? getCategoryBadge(de.category).label : '—';
        const step = de?.step || '—';
        const msg = (de?.message || p.errorMessage || '').replace(/"/g, '""');
        const sug = de?.suggestion || '—';
        return `"${p.productCode}","${p.editedName.replace(/"/g, '""')}","${cat}","${step}","${msg}","${sug}"`;
      })
      .join('\n');

    const blob = new Blob([BOM + header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `megaload_errors_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [products]);

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

      {/* Error summary panel */}
      {!registering && failCount > 0 && (
        <div className="bg-white rounded-xl border border-red-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">오류 요약</h3>
            <div className="flex gap-2">
              <button
                onClick={handleCopyReport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedReport ? '복사됨!' : '에러 리포트 복사'}
              </button>
              <button
                onClick={handleDownloadCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                <Download className="w-3.5 h-3.5" /> CSV 다운로드
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(errorCounts).map(([cat, count]) => {
              const config = getCategoryBadge(cat as ErrorCategory);
              const Icon = config.icon;
              return (
                <span
                  key={cat}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {config.label} {count}
                </span>
              );
            })}
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
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-28">오류 유형</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-32">쿠팡 ID / 오류</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 w-16">소요</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.filter(p => p.selected).map((p) => {
                const isError = p.status === 'error';
                const hasDetail = isError && p.detailedError;
                const isExpanded = expandedErrorUids.has(p.uid);
                const de = p.detailedError;
                const badge = de ? getCategoryBadge(de.category) : null;

                return (
                  <Fragment key={p.uid}>
                    <tr
                      className={`hover:bg-gray-50 ${isError ? 'cursor-pointer' : ''}`}
                      onClick={() => isError && toggleErrorExpand(p.uid)}
                    >
                      <td className="px-4 py-2 text-center">
                        {p.status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />}
                        {p.status === 'error' && <XCircle className="w-4 h-4 text-red-500 mx-auto" />}
                        {p.status === 'registering' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin mx-auto" />}
                        {p.status === 'pending' && <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2 text-xs font-mono text-gray-500">{p.productCode}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 line-clamp-1">{p.editedName}</td>
                      <td className="px-4 py-2 text-xs">
                        {badge && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${badge.bgColor} ${badge.color}`}>
                            <badge.icon className="w-3 h-3" />
                            {badge.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {p.status === 'success' && <span className="text-green-600">#{p.channelProductId}</span>}
                        {p.status === 'error' && (
                          <span className="text-red-600 truncate max-w-[200px] block" title={p.errorMessage}>
                            {p.errorMessage}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-400 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {p.duration ? `${(p.duration / 1000).toFixed(1)}s` : '—'}
                          {isError && (
                            isExpanded
                              ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                              : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && hasDetail && de && (
                      <tr>
                        <td colSpan={6} className="px-4 py-0">
                          <div className="my-2 p-4 bg-red-50 border border-red-100 rounded-lg text-sm space-y-3">
                            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                              <span className="font-medium text-gray-600">단계:</span>
                              <span className="text-gray-800">{de.step || '—'}</span>
                              <span className="font-medium text-gray-600">오류:</span>
                              <span className="text-red-700">{de.code ? `${de.code} — ` : ''}{de.message}</span>
                              {de.field && (
                                <>
                                  <span className="font-medium text-gray-600">원인 필드:</span>
                                  <span className="text-gray-800 font-mono">{de.field}</span>
                                </>
                              )}
                            </div>

                            <div className="border-t border-red-200 pt-3">
                              <div className="flex items-start gap-2 text-xs">
                                <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-medium text-gray-700">수정 가이드:</span>
                                  <p className="text-gray-600 mt-0.5">{de.suggestion}</p>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(de.message); }}
                                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 transition"
                              >
                                <Copy className="w-3 h-3" /> 에러 메시지 복사
                              </button>
                              {de.rawResponse && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleRawExpand(p.uid); }}
                                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 transition"
                                >
                                  {expandedRawUids.has(p.uid) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  원본 API 응답
                                </button>
                              )}
                            </div>

                            {de.rawResponse && expandedRawUids.has(p.uid) && (
                              <pre className="mt-2 p-3 bg-white rounded border border-gray-200 text-xs text-gray-600 overflow-x-auto max-h-40 whitespace-pre-wrap">
                                {de.rawResponse}
                              </pre>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!registering && (
        <div className="flex items-center justify-center gap-3">
          {failCount > 0 && onRetryFailed && (
            <button onClick={onRetryFailed} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition">
              <RefreshCw className="w-4 h-4" /> 실패 {failCount}건 재등록
            </button>
          )}
          {onBackToStep2 && (
            <button onClick={onBackToStep2} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
              <ChevronUp className="w-4 h-4" /> 검증으로 돌아가기
            </button>
          )}
          <button onClick={onReset} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            <FolderOpen className="w-4 h-4" /> 새로 등록하기
          </button>
        </div>
      )}
    </div>
  );
}
