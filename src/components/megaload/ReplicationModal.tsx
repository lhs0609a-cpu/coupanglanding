'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import { createClient } from '@/lib/supabase/client';
import { CHANNELS, CHANNEL_LABELS, CHANNEL_SHORT_LABELS, CHANNEL_COMMISSION_RATES } from '@/lib/megaload/constants';
import { isChannelSupported } from '@/lib/megaload/types';
import type { Channel } from '@/lib/megaload/types';
import { Copy, CheckCircle2, XCircle, AlertTriangle, Loader2, Clock, Calculator } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** sh_products.id 배열 — 기존 상품 관리 페이지 경로 */
  selectedProductIds?: string[];
  /** Coupang product ID 배열 — 대량 등록 직후 경로 (서버에서 sh_products 조회) */
  coupangProductIds?: string[];
  onCompleted?: () => void;
}

type Phase = 'configure' | 'running' | 'done';

interface JobStatus {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errorLog: Array<{ product_id: string; channel: string; error: string; at: string }>;
  targetChannels: Channel[];
}

export default function ReplicationModal({
  isOpen,
  onClose,
  selectedProductIds,
  coupangProductIds,
  onCompleted,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [phase, setPhase] = useState<Phase>('configure');

  const productCount = (selectedProductIds?.length ?? 0) + (coupangProductIds?.length ?? 0);
  const hasProductIds = (selectedProductIds?.length ?? 0) > 0;
  const hasCoupangIds = (coupangProductIds?.length ?? 0) > 0;

  // 복제 대상 채널 (쿠팡/토스/카카오 제외)
  const replicatableChannels = useMemo(
    () => CHANNELS.filter((c) => c !== 'coupang' && isChannelSupported(c)),
    [],
  );

  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(replicatableChannels);
  const [margins, setMargins] = useState<Record<string, number>>({});
  const [marginsLoaded, setMarginsLoaded] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [previewPrice, setPreviewPrice] = useState<number>(10000);
  const [showPreview, setShowPreview] = useState<boolean>(false);

  // 모달 열릴 때 저장된 마진 로드
  useEffect(() => {
    if (!isOpen || marginsLoaded) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('sh_channel_margin_settings')
        .select('channel, margin_percent')
        .eq('is_enabled', true);
      const initial: Record<string, number> = {};
      for (const ch of replicatableChannels) initial[ch] = 0;
      for (const row of (data || []) as Array<Record<string, unknown>>) {
        initial[row.channel as string] = Number(row.margin_percent) || 0;
      }
      setMargins(initial);
      setMarginsLoaded(true);
    })();
  }, [isOpen, marginsLoaded, supabase, replicatableChannels]);

  // 모달 닫힐 때 상태 리셋
  useEffect(() => {
    if (!isOpen) {
      setPhase('configure');
      setSubmitError(null);
      setJobId(null);
      setJobStatus(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  // 진행률 폴링 (running 중)
  useEffect(() => {
    if (!jobId || phase !== 'running') return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/megaload/products/bulk-replicate/status/${jobId}`);
        if (!res.ok) return;
        const data: JobStatus = await res.json();
        if (cancelled) return;
        setJobStatus(data);
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          setPhase('done');
          onCompleted?.();
        }
      } catch { /* ignore */ }
    };

    poll();
    // 크론은 15분 주기 → 짧은 폴링은 무의미. 처음 1분만 30s 간격(빠른 시작 확인용),
    // 이후 60s 간격으로 완료 신호를 잡는다.
    const startedAt = Date.now();
    const interval = setInterval(() => {
      poll();
    }, Date.now() - startedAt < 60_000 ? 30_000 : 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId, phase, onCompleted]);

  const toggleChannel = (ch: Channel) => {
    setSelectedChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  };

  const updateMargin = (ch: string, value: number) => {
    setMargins((prev) => ({ ...prev, [ch]: value }));
  };

  const startReplication = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: Record<string, unknown> = {
        channels: selectedChannels,
        margins,
      };
      if (hasProductIds) payload.productIds = selectedProductIds;
      if (hasCoupangIds) payload.coupangProductIds = coupangProductIds;

      const res = await fetch('/api/megaload/products/bulk-replicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || '복제 시작 실패');
        setSubmitting(false);
        return;
      }
      setJobId(data.jobId as string);
      setPhase('running');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '복제 시작 실패');
    } finally {
      setSubmitting(false);
    }
  }, [selectedProductIds, coupangProductIds, hasProductIds, hasCoupangIds, selectedChannels, margins]);

  const totalItems = productCount * selectedChannels.length;
  const progressPct = jobStatus && jobStatus.total > 0
    ? Math.round((jobStatus.processed / jobStatus.total) * 100)
    : 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={phase === 'running' ? () => { /* running 중엔 닫기 비활성 */ } : onClose}
      title={
        phase === 'configure' ? '선택 상품 전채널 복제'
          : phase === 'running' ? '복제 진행 중...'
          : '복제 완료'
      }
      maxWidth="max-w-2xl"
    >
      {/* ── Configure phase ── */}
      {phase === 'configure' && (
        <div className="space-y-5">
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
            <span className="font-semibold text-gray-900">{productCount}개</span> 상품을{' '}
            <span className="font-semibold text-gray-900">{selectedChannels.length}개</span> 채널에 복제합니다
            <span className="text-gray-500"> · 총 {totalItems.toLocaleString()}건 등록 예정</span>
          </div>

          <div>
            <div className="text-sm font-semibold text-gray-900 mb-2">대상 채널 및 마진율 설정</div>
            <p className="text-xs text-gray-500 mb-3">
              기준 가격은 쿠팡 판매가이며, 마진율(%)만큼 가산되어 해당 채널에 등록됩니다. 설정은 다음 복제 시에도 유지됩니다.
            </p>
            <div className="space-y-2">
              {replicatableChannels.map((ch) => {
                const checked = selectedChannels.includes(ch);
                return (
                  <label
                    key={ch}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition ${
                      checked ? 'border-[#E31837] bg-red-50/40' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleChannel(ch)}
                      className="w-4 h-4 rounded border-gray-300 text-[#E31837] focus:ring-[#E31837]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900">{CHANNEL_LABELS[ch]}</div>
                      <div className="text-xs text-gray-500">
                        기본 수수료율 약 {CHANNEL_COMMISSION_RATES[ch]}%
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.1"
                        value={margins[ch] ?? 0}
                        disabled={!checked}
                        onChange={(e) => updateMargin(ch, Number(e.target.value) || 0)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-20 px-2 py-1 text-sm text-right border border-gray-300 rounded-md focus:ring-1 focus:ring-[#E31837] focus:border-[#E31837] disabled:bg-gray-100 disabled:text-gray-400"
                      />
                      <span className="text-xs text-gray-500 font-medium">%</span>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* 준비 중 채널 안내 */}
            <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
              <AlertTriangle className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              {CHANNEL_LABELS.toss}, {CHANNEL_LABELS.kakao} 는 공식 셀러 API 미공개로 현재 복제 대상에서 제외됩니다.
            </div>
          </div>

          {/* 가격 프리뷰 */}
          <div className="rounded-lg border border-gray-200">
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
            >
              <span className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-gray-500" />
                가격 계산 미리보기
              </span>
              <span className="text-xs text-gray-500">{showPreview ? '접기' : '펼치기'}</span>
            </button>

            {showPreview && (
              <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600 flex-shrink-0">예시 쿠팡 판매가</span>
                  <input
                    type="number"
                    value={previewPrice}
                    onChange={(e) => setPreviewPrice(Math.max(0, Number(e.target.value) || 0))}
                    step="1000"
                    className="w-28 px-2 py-1 text-sm text-right border border-gray-300 rounded-md focus:ring-1 focus:ring-[#E31837] focus:border-[#E31837]"
                  />
                  <span className="text-xs text-gray-500">원</span>
                </div>
                <div className="divide-y divide-gray-100 rounded-md border border-gray-100 overflow-hidden">
                  {selectedChannels.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-center text-gray-400">
                      채널을 먼저 선택해주세요.
                    </div>
                  ) : (
                    selectedChannels.map((ch) => {
                      const m = margins[ch] ?? 0;
                      const final = Math.round(previewPrice * (1 + m / 100));
                      const diff = final - previewPrice;
                      return (
                        <div key={ch} className="flex items-center justify-between px-3 py-2 text-xs">
                          <span className="text-gray-700 font-medium">{CHANNEL_LABELS[ch]}</span>
                          <div className="flex items-center gap-2 tabular-nums">
                            <span className="text-gray-500">
                              {previewPrice.toLocaleString()}원 × {(1 + m / 100).toFixed(3)}
                            </span>
                            <span className="text-gray-400">=</span>
                            <span className="font-bold text-gray-900">{final.toLocaleString()}원</span>
                            {diff !== 0 && (
                              <span className={`text-[10px] font-semibold ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {diff > 0 ? '+' : ''}{diff.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  실제 기준가는 각 상품의 쿠팡 판매가이며, 위 수식이 상품별로 개별 적용됩니다.
                </p>
              </div>
            )}
          </div>

          {submitError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="leading-snug">{submitError}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={startReplication}
              disabled={submitting || selectedChannels.length === 0 || productCount === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <Copy className="w-4 h-4" />
              복제 시작
            </button>
          </div>
        </div>
      )}

      {/* ── Running phase ── */}
      {phase === 'running' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Clock className="w-4 h-4 text-blue-500 animate-pulse" />
              백그라운드 크론이 매 30분마다 배치 처리 중 (1회당 최대 20건)
            </div>
            <span className="text-2xl font-bold text-[#E31837] tabular-nums">{progressPct}%</span>
          </div>

          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#E31837] to-red-400 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-lg bg-gray-50 py-2">
              <div className="text-xs text-gray-500">총</div>
              <div className="font-bold text-gray-900 tabular-nums">{jobStatus?.total ?? '-'}</div>
            </div>
            <div className="rounded-lg bg-green-50 py-2">
              <div className="text-xs text-green-700">성공</div>
              <div className="font-bold text-green-700 tabular-nums">{jobStatus?.succeeded ?? 0}</div>
            </div>
            <div className="rounded-lg bg-red-50 py-2">
              <div className="text-xs text-red-700">실패</div>
              <div className="font-bold text-red-700 tabular-nums">{jobStatus?.failed ?? 0}</div>
            </div>
            <div className="rounded-lg bg-gray-100 py-2">
              <div className="text-xs text-gray-600">건너뜀</div>
              <div className="font-bold text-gray-700 tabular-nums">{jobStatus?.skipped ?? 0}</div>
            </div>
          </div>

          <p className="text-xs text-gray-500 text-center">
            창을 닫아도 작업은 백그라운드에서 계속 진행됩니다.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              백그라운드에서 계속
            </button>
          </div>
        </div>
      )}

      {/* ── Done phase ── */}
      {phase === 'done' && jobStatus && (
        <div className="space-y-5">
          <div className="flex items-center justify-center py-2">
            {jobStatus.failed === 0 ? (
              <CheckCircle2 className="w-12 h-12 text-green-500" />
            ) : (
              <AlertTriangle className="w-12 h-12 text-yellow-500" />
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-green-50 py-3">
              <div className="text-xs text-green-700">성공</div>
              <div className="text-xl font-bold text-green-700 tabular-nums">{jobStatus.succeeded}</div>
            </div>
            <div className="rounded-lg bg-red-50 py-3">
              <div className="text-xs text-red-700">실패</div>
              <div className="text-xl font-bold text-red-700 tabular-nums">{jobStatus.failed}</div>
            </div>
            <div className="rounded-lg bg-gray-100 py-3">
              <div className="text-xs text-gray-600">건너뜀</div>
              <div className="text-xl font-bold text-gray-700 tabular-nums">{jobStatus.skipped}</div>
            </div>
          </div>

          {jobStatus.errorLog && jobStatus.errorLog.length > 0 && (
            <div className="border border-gray-200 rounded-lg">
              <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 text-sm font-medium text-gray-700">
                실패 로그 (최대 50건)
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                {jobStatus.errorLog.map((e, i) => (
                  <div key={i} className="px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
                        {CHANNEL_SHORT_LABELS[e.channel as Channel] || e.channel}
                      </span>
                      <span className="text-gray-500 truncate">{e.product_id.slice(0, 8)}</span>
                    </div>
                    <div className="text-gray-700 leading-snug">{e.error}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
