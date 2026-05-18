'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Zap, FolderOpen, Loader2, AlertTriangle, Clock, Package, Image as ImageIcon,
  CheckCircle2, X, PlayCircle, Shield,
} from 'lucide-react';

interface PreAnalysisResult {
  productCount: number;
  imageCount: number;
  estDurationMin: number;
  estAiCostUsd: number;
  warnings: string[];
}

interface AutoModeModalProps {
  open: boolean;
  onClose: () => void;
  /** 폴더 선택 + 사전 스캔 → 카운트만. 호출자가 폴더 picker 까지 처리. */
  onPickAndAnalyze: () => Promise<{ rootFolderName: string; analysis: PreAnalysisResult } | null>;
  /** Gate 1 확인 완료 → 잡 생성 + 자동 실행 시작 */
  onStart: (params: {
    rootFolderName: string;
    dryRun: boolean;
    preAnalysis: PreAnalysisResult;
  }) => Promise<void>;
}

type Step = 'pick' | 'analyzing' | 'gate1' | 'starting';

export default function AutoModeModal({ open, onClose, onPickAndAnalyze, onStart }: AutoModeModalProps) {
  const [step, setStep] = useState<Step>('pick');
  const [folderName, setFolderName] = useState('');
  const [analysis, setAnalysis] = useState<PreAnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [confirmChecks, setConfirmChecks] = useState({ understood: false, supervised: false, dryRunAck: false });

  useEffect(() => {
    if (!open) {
      setStep('pick'); setFolderName(''); setAnalysis(null); setError('');
      setDryRun(true); setConfirmChecks({ understood: false, supervised: false, dryRunAck: false });
    }
  }, [open]);

  const handlePick = useCallback(async () => {
    setError('');
    setStep('analyzing');
    try {
      const result = await onPickAndAnalyze();
      if (!result) { setStep('pick'); return; }
      setFolderName(result.rootFolderName);
      setAnalysis(result.analysis);
      setStep('gate1');
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') {
        setError(e.message);
      }
      setStep('pick');
    }
  }, [onPickAndAnalyze]);

  const handleStart = useCallback(async () => {
    if (!analysis) return;
    setStep('starting');
    setError('');
    try {
      await onStart({ rootFolderName: folderName, dryRun, preAnalysis: analysis });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '시작 실패');
      setStep('gate1');
    }
  }, [analysis, folderName, dryRun, onStart, onClose]);

  if (!open) return null;

  const allConfirmed = dryRun
    ? confirmChecks.understood && confirmChecks.supervised
    : confirmChecks.understood && confirmChecks.supervised && confirmChecks.dryRunAck;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold">올인원 자동 등록</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {step === 'pick' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                최상위 폴더를 선택하면 안에 있는 상품을 모두 스캔하고, 카테고리 매칭 / 상품명 / 상세페이지 생성 / 등록까지
                <strong className="text-gray-900"> 무인 자동 진행</strong>합니다.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold mb-1">처음이라면 dry-run 모드 권장</div>
                  실제 등록은 하지 않고 끝까지 시뮬레이션 → 결과 검토 후 본 등록 진행하세요.
                </div>
              </div>
              <button
                onClick={handlePick}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"
              >
                <FolderOpen className="w-5 h-5" />
                최상위 폴더 선택
              </button>
              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {error}
                </div>
              )}
            </div>
          )}

          {step === 'analyzing' && (
            <div className="py-10 flex flex-col items-center gap-3 text-gray-600">
              <Loader2 className="w-8 h-8 animate-spin text-red-600" />
              <div className="text-sm">사전 분석 중 — {folderName}</div>
              <div className="text-xs text-gray-400">상품 수 / 이미지 수 / 예상 소요시간 계산</div>
            </div>
          )}

          {step === 'gate1' && analysis && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <StatCard icon={Package} label="상품 수" value={`${analysis.productCount.toLocaleString()}개`} />
                <StatCard icon={ImageIcon} label="이미지 수" value={`${analysis.imageCount.toLocaleString()}장`} />
                <StatCard icon={Clock} label="예상 소요" value={formatDuration(analysis.estDurationMin)} />
                <StatCard icon={Zap} label="예상 AI 비용" value={`$${analysis.estAiCostUsd.toFixed(2)}`} />
              </div>

              {analysis.warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-1">
                  <div className="text-xs font-semibold text-yellow-800 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> 주의사항
                  </div>
                  <ul className="text-xs text-yellow-700 space-y-0.5 pl-4 list-disc">
                    {analysis.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-semibold">실행 모드</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDryRun(true)}
                    className={`flex-1 px-3 py-2 text-xs rounded border ${
                      dryRun ? 'bg-green-50 border-green-300 text-green-800 font-medium' : 'bg-white border-gray-200'
                    }`}
                  >
                    Dry-Run (시뮬레이션만)
                  </button>
                  <button
                    onClick={() => setDryRun(false)}
                    className={`flex-1 px-3 py-2 text-xs rounded border ${
                      !dryRun ? 'bg-red-50 border-red-300 text-red-800 font-medium' : 'bg-white border-gray-200'
                    }`}
                  >
                    실제 등록
                  </button>
                </div>
              </div>

              <div className="space-y-2 bg-white border border-gray-300 rounded-lg p-3">
                <ConfirmRow
                  checked={confirmChecks.understood}
                  onChange={(v) => setConfirmChecks(c => ({ ...c, understood: v }))}
                  label={`${analysis.productCount.toLocaleString()}개 상품을 ${formatDuration(analysis.estDurationMin)} 동안 자동 처리한다는 것을 이해했습니다.`}
                />
                <ConfirmRow
                  checked={confirmChecks.supervised}
                  onChange={(v) => setConfirmChecks(c => ({ ...c, supervised: v }))}
                  label="탭이 닫혀도 자동 재개 가능하지만, 가급적 모니터링이 가능한 상태에서 시작합니다."
                />
                {!dryRun && (
                  <ConfirmRow
                    checked={confirmChecks.dryRunAck}
                    onChange={(v) => setConfirmChecks(c => ({ ...c, dryRunAck: v }))}
                    label="실제 등록 모드입니다 — 쿠팡에 실제 상품이 게시됩니다. dry-run 결과를 확인했거나 위험을 감수합니다."
                  />
                )}
              </div>

              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={handleStart}
                  disabled={!allConfirmed}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <PlayCircle className="w-4 h-4" />
                  {dryRun ? 'Dry-Run 시작' : '실제 등록 시작'}
                </button>
              </div>
            </div>
          )}

          {step === 'starting' && (
            <div className="py-10 flex flex-col items-center gap-3 text-gray-600">
              <Loader2 className="w-8 h-8 animate-spin text-red-600" />
              <div className="text-sm">자동 실행 시작 중…</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-lg font-bold text-gray-900">{value}</div>
    </div>
  );
}

function ConfirmRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer text-xs text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-red-600"
      />
      <span>{label}</span>
      {checked && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
    </label>
  );
}

function formatDuration(min: number): string {
  if (min < 60) return `${Math.round(min)}분`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

export type { PreAnalysisResult };
