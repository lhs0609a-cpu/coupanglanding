'use client';

import { RefreshCw, XCircle, RotateCcw, Play, Zap, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { BULK_STATUS_LABELS } from '@/lib/data/promotion-constants';
import type { BulkApplyProgress } from '@/lib/supabase/types';

export interface VerifyResult {
  verified: boolean;
  message: string;
  results: Array<{
    couponId: string;
    couponType: 'instant' | 'download';
    exists: boolean;
    status: string;
    itemCount?: number;
    message: string;
    logCount: number;
  }>;
  summary?: {
    total: number;
    verifiedInstant: number;
    verifiedDownload: number;
    failedInstant: number;
    failedDownload: number;
  };
}

interface ProgressDisplayProps {
  progress: BulkApplyProgress;
  onCancel: () => void;
  onRestart: () => void;
  onApplyNewOnly?: () => void;
  onVerify?: () => void;
  cancelling: boolean;
  restarting: boolean;
  applyingNewOnly?: boolean;
  verifying?: boolean;
  verifyResult?: VerifyResult | null;
}

export default function ProgressDisplay({
  progress,
  onCancel,
  onRestart,
  onApplyNewOnly,
  onVerify,
  cancelling,
  restarting,
  applyingNewOnly,
  verifying,
  verifyResult,
}: ProgressDisplayProps) {
  const isActive = progress.status === 'collecting' || progress.status === 'applying';
  const isCompleted = progress.status === 'completed';
  const isFailed = progress.status === 'failed' || progress.status === 'cancelled';

  const applyPercent = progress.applying_progress;
  const hasAnySuccess = progress.instant_success > 0 || progress.download_success > 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isActive && <RefreshCw className="w-4 h-4 text-[#E31837] animate-spin" />}
          <h3 className="text-sm font-bold text-gray-900">일괄 적용 진행</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            isCompleted ? 'bg-green-100 text-green-700' :
            isFailed ? 'bg-red-100 text-red-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {BULK_STATUS_LABELS[progress.status] || progress.status}
          </span>
        </div>
        {isActive && (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" />
            {cancelling ? '취소 중...' : '취소'}
          </button>
        )}
        {isFailed && (
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

      {/* 2-step progress bars */}
      <div className="space-y-3">
        {/* Step 1: Collecting */}
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span className="flex items-center gap-1">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                progress.status === 'collecting' ? 'bg-blue-500 animate-pulse' :
                progress.collecting_progress >= 100 ? 'bg-green-500' : 'bg-gray-300'
              }`} />
              STEP 1. 상품 수집
            </span>
            <span>{progress.collecting_progress}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${progress.collecting_progress}%` }}
            />
          </div>
        </div>

        {/* Step 2: Applying */}
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span className="flex items-center gap-1">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                progress.status === 'applying' ? 'bg-[#E31837] animate-pulse' :
                applyPercent >= 100 ? 'bg-green-500' : 'bg-gray-300'
              }`} />
              STEP 2. 쿠폰 적용
            </span>
            <span>{applyPercent}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#E31837] rounded-full transition-all duration-300"
              style={{ width: `${applyPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Detail result grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div className="bg-gray-50 rounded-lg p-2">
          <p className="text-xs text-gray-500">총 상품</p>
          <p className="text-lg font-bold text-gray-900">{progress.total_products}</p>
        </div>
        <div className="bg-orange-50 rounded-lg p-2">
          <p className="text-xs text-gray-500">즉시할인 성공</p>
          <p className="text-lg font-bold text-orange-600">{progress.instant_success}</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-2">
          <p className="text-xs text-gray-500">다운로드 성공</p>
          <p className="text-lg font-bold text-blue-600">{progress.download_success}</p>
        </div>
        <div className="bg-red-50 rounded-lg p-2">
          <p className="text-xs text-gray-500">실패</p>
          <p className="text-lg font-bold text-red-600">
            {progress.instant_failed + progress.download_failed}
          </p>
        </div>
      </div>

      {/* 쿠팡 실제 검증 섹션 */}
      {isCompleted && hasAnySuccess && (
        <div className="border-t border-gray-100 pt-3 space-y-3">
          {/* 검증 미완료 경고 */}
          {!verifyResult && !verifying && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800">쿠팡 실제 등록 확인이 필요합니다</p>
                <p className="text-xs text-amber-700 mt-1">
                  위 성공 수치는 API 요청 기준이며, 쿠팡에서 실제로 쿠폰이 생성되었는지 확인하려면 아래 검증 버튼을 클릭하세요.
                </p>
              </div>
            </div>
          )}

          {/* 검증 중 */}
          {verifying && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              <p className="text-sm text-blue-800">쿠팡에서 쿠폰 등록 상태를 확인 중입니다...</p>
            </div>
          )}

          {/* 검증 결과 */}
          {verifyResult && (
            <div className={`p-3 rounded-lg border ${
              verifyResult.verified
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-start gap-2">
                {verifyResult.verified ? (
                  <ShieldCheck className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                )}
                <div className="flex-1">
                  <p className={`text-sm font-medium ${
                    verifyResult.verified ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {verifyResult.message}
                  </p>

                  {/* 개별 쿠폰 검증 상세 */}
                  {verifyResult.results.length > 0 && (
                    <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                      {verifyResult.results.map((r, i) => (
                        <div key={i} className={`flex items-center gap-2 text-xs ${
                          r.exists ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {r.exists ? (
                            <ShieldCheck className="w-3 h-3 shrink-0" />
                          ) : (
                            <XCircle className="w-3 h-3 shrink-0" />
                          )}
                          <span>
                            {r.couponType === 'instant' ? '즉시할인' : '다운로드'} #{r.couponId}
                            {' — '}
                            {r.exists
                              ? `확인됨 (상태: ${r.status}${r.itemCount !== undefined ? `, ${r.itemCount}개 아이템` : ''})`
                              : `미확인 (${r.status})`
                            }
                            {r.logCount > 0 && ` [${r.logCount}건 적용 시도]`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 검증 요약 */}
                  {verifyResult.summary && (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      {(verifyResult.summary.verifiedInstant > 0 || verifyResult.summary.failedInstant > 0) && (
                        <span className="text-gray-600">
                          즉시할인: <span className="text-green-700 font-medium">{verifyResult.summary.verifiedInstant}건 확인</span>
                          {verifyResult.summary.failedInstant > 0 && (
                            <> / <span className="text-red-700 font-medium">{verifyResult.summary.failedInstant}건 미확인</span></>
                          )}
                        </span>
                      )}
                      {(verifyResult.summary.verifiedDownload > 0 || verifyResult.summary.failedDownload > 0) && (
                        <span className="text-gray-600">
                          다운로드: <span className="text-green-700 font-medium">{verifyResult.summary.verifiedDownload}건 확인</span>
                          {verifyResult.summary.failedDownload > 0 && (
                            <> / <span className="text-red-700 font-medium">{verifyResult.summary.failedDownload}건 미확인</span></>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 검증 버튼 */}
          {onVerify && !verifying && (
            <button
              type="button"
              onClick={onVerify}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
            >
              <ShieldCheck className="w-4 h-4" />
              {verifyResult ? '다시 검증' : '쿠팡 실제 등록 검증'}
            </button>
          )}
        </div>
      )}

      {/* 0건 완료 경고 */}
      {(isCompleted || isFailed) && progress.total_products === 0 && (
        <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <span className="text-yellow-600 text-sm mt-0.5">&#9888;</span>
          <div>
            <p className="text-sm font-medium text-yellow-800">수집된 상품이 0개입니다</p>
            <p className="text-xs text-yellow-700 mt-1">
              쿠팡 Wing에서 승인(APPROVED) 상태의 상품이 있는지 확인해주세요.
              상품이 있는데도 0건이면 API 응답 형식 문제일 수 있습니다.
            </p>
          </div>
        </div>
      )}

      {/* Completion buttons */}
      {isCompleted && onApplyNewOnly && (
        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onApplyNewOnly}
            disabled={applyingNewOnly}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[#E31837] border border-[#E31837] rounded-lg hover:bg-red-50 transition disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5" />
            {applyingNewOnly ? '적용 중...' : '신규 상품만 적용'}
          </button>
          <button
            type="button"
            onClick={onRestart}
            disabled={restarting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            {restarting ? '시작 중...' : '전체 재적용'}
          </button>
        </div>
      )}
    </div>
  );
}
