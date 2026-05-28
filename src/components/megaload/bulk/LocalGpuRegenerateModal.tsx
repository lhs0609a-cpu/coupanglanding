'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, RotateCcw, Check, AlertCircle, Cpu, Scissors, Sparkles, MonitorSmartphone } from 'lucide-react';
import { uploadSingleImage, compressImage } from '@/lib/megaload/services/client-folder-scanner';

interface LocalGpuRegenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 재생성할 원본 이미지 URL (blob: 또는 http) */
  sourceImageUrl: string;
  productCode?: string;
  /** 재생성 프롬프트 기본값 생성을 위한 상품명 */
  productName?: string;
  /** 결과를 대표이미지 "새 후보"로 추가 */
  onApply: (newUrl: string) => void;
}

type Mode = 'cutout' | 'regenerate';
type Phase = 'idle' | 'working' | 'done' | 'error';

const buildDefaultPrompt = (name?: string) =>
  `a single ${name?.trim() || 'product'}, front-facing straight-on view (camera directly facing the product front, no tilt, no angle, no perspective), the product enlarged and centered to fill most of the frame, isolated on a pure white background (#FFFFFF), clean e-commerce studio thumbnail, photorealistic, sharp focus, soft even lighting, subtle shadow beneath, only one product, no other objects, no clutter, no hands, no people, no text overlay`;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function LocalGpuRegenerateModal({
  isOpen,
  onClose,
  sourceImageUrl,
  productCode,
  productName,
  onApply,
}: LocalGpuRegenerateModalProps) {
  const [mode, setMode] = useState<Mode>('regenerate');
  const [prompt, setPrompt] = useState(buildDefaultPrompt(productName));
  const [phase, setPhase] = useState<Phase>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workerOffline, setWorkerOffline] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode('regenerate');
      setPrompt(buildDefaultPrompt(productName));
      setPhase('idle');
      setStatusMsg('');
      setResultUrl(null);
      setError(null);
      setWorkerOffline(false);
    }
  }, [isOpen, productName]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setPhase('working');
    setError(null);
    setResultUrl(null);
    setWorkerOffline(false);

    // 1) 워커가 받을 http URL 확보 (blob 이면 업로드)
    let sourceUrl = sourceImageUrl;
    try {
      if (!/^https?:\/\//i.test(sourceUrl)) {
        setStatusMsg('원본 이미지 업로드 중...');
        const blob = await (await fetch(sourceUrl)).blob();
        const compressed = await compressImage(blob);
        sourceUrl = await uploadSingleImage(compressed, `${productCode || 'img'}_regen.jpg`);
      }
    } catch (e) {
      setPhase('error');
      setError('원본 이미지 업로드 실패: ' + (e instanceof Error ? e.message : String(e)));
      return;
    }

    // 2) 단일 잡 enqueue
    setStatusMsg('작업 큐 등록 중...');
    const label = `single_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let batchId: string;
    try {
      const res = await fetch('/api/megaload/products/thumbnail-jobs/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobs: [{ sourceUrl, productCode, label, ...(mode === 'regenerate' && prompt.trim() ? { prompt: prompt.trim() } : {}) }],
          mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '큐 등록 실패');
      batchId = data.batchId;
    } catch (e) {
      setPhase('error');
      setError(e instanceof Error ? e.message : '큐 등록 실패');
      return;
    }

    // 3) 워커 연결 확인 — 꺼져 있어도 잡은 큐에 남는다 (안내만 다르게)
    let offline = false;
    try {
      const ws = await fetch('/api/megaload/products/thumbnail-jobs/worker-status');
      offline = ws.ok ? !(await ws.json()).online : true;
    } catch { offline = true; }
    setWorkerOffline(offline);
    setStatusMsg(offline
      ? '메가로드 도우미가 감지되지 않습니다 — 도우미를 켜면 자동으로 처리됩니다.'
      : 'AI가 이미지를 생성하는 중입니다... (보통 10~40초)');

    // 4) 폴링 (최대 5분)
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await sleep(3000);
      try {
        const res = await fetch(`/api/megaload/products/thumbnail-jobs?batchId=${batchId}`);
        if (!res.ok) continue;
        const data = await res.json();
        const job = (data.jobs || []).find((j: { label?: string }) => j.label === label) as
          | { status: string; result_url?: string; error_message?: string }
          | undefined;
        if (job?.status === 'done' && job.result_url) {
          setResultUrl(job.result_url);
          setPhase('done');
          return;
        }
        if (job?.status === 'error') {
          setPhase('error');
          setError(job.error_message || '워커 처리 중 오류가 발생했습니다.');
          return;
        }
      } catch { /* 계속 폴링 */ }
    }
    setPhase('error');
    setError(offline
      ? '워커가 켜지지 않아 처리되지 않았습니다. 메가로드 도우미를 켠 뒤 다시 시도해주세요. (작업은 큐에 등록됨)'
      : '시간 초과(5분). 잠시 후 다시 시도해주세요.');
  };

  const handleApply = () => {
    if (resultUrl) {
      onApply(resultUrl);
      onClose();
    }
  };

  const working = phase === 'working';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-800">AI 이미지 재생성</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded transition">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 모드 선택 */}
          <div>
            <div className="text-[11px] font-medium text-gray-600 mb-1.5">처리 방식</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('regenerate')}
                disabled={working}
                className={`flex items-start gap-2 p-2.5 rounded-lg border text-left transition disabled:opacity-50 ${
                  mode === 'regenerate' ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-200 hover:border-indigo-200'
                }`}
              >
                <Sparkles className={`w-4 h-4 shrink-0 mt-0.5 ${mode === 'regenerate' ? 'text-indigo-600' : 'text-gray-400'}`} />
                <div>
                  <div className={`text-xs font-semibold ${mode === 'regenerate' ? 'text-indigo-700' : 'text-gray-700'}`}>AI 재생성</div>
                  <div className="text-[10px] text-gray-500">잘림·지저분·흐림 사진을 깨끗하게 재구성</div>
                </div>
              </button>
              <button
                onClick={() => setMode('cutout')}
                disabled={working}
                className={`flex items-start gap-2 p-2.5 rounded-lg border text-left transition disabled:opacity-50 ${
                  mode === 'cutout' ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-200 hover:border-indigo-200'
                }`}
              >
                <Scissors className={`w-4 h-4 shrink-0 mt-0.5 ${mode === 'cutout' ? 'text-indigo-600' : 'text-gray-400'}`} />
                <div>
                  <div className={`text-xs font-semibold ${mode === 'cutout' ? 'text-indigo-700' : 'text-gray-700'}`}>누끼 (흰 배경)</div>
                  <div className="text-[10px] text-gray-500">배경 제거 + 순수 흰 배경으로 정리</div>
                </div>
              </button>
            </div>
          </div>

          {/* 이미지 비교 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] font-medium text-gray-600 mb-1.5">원본</div>
              <div className="aspect-square rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sourceImageUrl} alt="원본" loading="lazy" decoding="async" className="w-full h-full object-contain" />
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-gray-600 mb-1.5">
                {resultUrl ? '생성 결과' : working ? '생성 중...' : '생성 결과 (대기)'}
              </div>
              <div className="aspect-square rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center">
                {working ? (
                  <div className="flex flex-col items-center gap-2 text-gray-400 px-3 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                    <span className="text-xs">{statusMsg || '처리 중...'}</span>
                  </div>
                ) : resultUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resultUrl} alt="생성 결과" loading="lazy" decoding="async" className="w-full h-full object-contain" />
                ) : (
                  <div className="text-xs text-gray-300">아직 생성되지 않았습니다</div>
                )}
              </div>
            </div>
          </div>

          {/* 프롬프트 (재생성 모드만) */}
          {mode === 'regenerate' && (
            <div>
              <div className="text-[11px] font-medium text-gray-600 mb-1.5">프롬프트 (편집 가능, 영어 권장)</div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={working}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-300 focus:border-transparent outline-none resize-y disabled:bg-gray-50 font-mono"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                상품명 기반 기본 프롬프트가 채워져 있습니다. 결과는 원본과 비교해 확인 후 추가하세요.
              </p>
            </div>
          )}

          {/* 워커 미감지 안내 */}
          {workerOffline && phase !== 'error' && (
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <MonitorSmartphone className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span className="text-xs text-amber-800">
                메가로드 도우미가 감지되지 않습니다. 도우미를 켜면 대기 중인 작업이 자동으로 처리됩니다.
              </span>
            </div>
          )}

          {/* 에러 */}
          {error && (
            <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span className="text-xs text-red-700">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-200">
          <div className="text-[10px] text-gray-400">
            결과는 <b className="text-gray-500">대표이미지 새 후보로 추가</b>됩니다 (원본 보존)
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={working}
              className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
            >
              취소
            </button>
            {resultUrl && (
              <button
                onClick={handleGenerate}
                disabled={working}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-50 disabled:opacity-50 transition"
              >
                <RotateCcw className="w-3 h-3" />
                다시 생성
              </button>
            )}
            {!resultUrl ? (
              <button
                onClick={handleGenerate}
                disabled={working || (mode === 'regenerate' && !prompt.trim())}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {working ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cpu className="w-3 h-3" />}
                {working ? '처리 중...' : '생성'}
              </button>
            ) : (
              <button
                onClick={handleApply}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition"
              >
                <Check className="w-3 h-3" />
                대표이미지 후보로 추가
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
