'use client';

import { useCallback, useRef, useState } from 'react';
import type { PreAnalysisResult } from './AutoModeModal';

/**
 * 올인원 자동 등록 오케스트레이션 훅.
 *
 * 현재 단계 (MVP):
 *   1. Gate 1: 폴더 선택 후 사전분석 (상품/이미지 수 카운트)
 *   2. 잡 생성 + 영속 체크포인트 시작
 *   3. (TODO) 기존 useBulkRegisterActions 의 각 단계 (스캔→매칭→상품명→상세→이미지 사전업로드→등록) 자동 chain
 *
 * checkpoint 는 배치 N개 등록 후마다 호출 — 탭 닫혀도 resume 가능.
 * Gate 2 자동 일시정지 임계치는 잡 생성 시점에 함께 저장 (서버 측 검증 + 클라이언트 측 watchdog).
 */
export function useAutoMode() {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [resumableJob, setResumableJob] = useState<unknown>(null);
  const watchdogTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 진입 시 미완료 잡 확인 */
  const checkResumable = useCallback(async () => {
    try {
      const res = await fetch('/api/megaload/auto-job/resumable');
      if (res.ok) {
        const data = await res.json();
        if (data.job) setResumableJob(data.job);
      }
    } catch { /* silent */ }
  }, []);

  /**
   * 폴더 picker 호출 + 사전 스캔으로 상품/이미지 수 카운트 — 실제 등록 X.
   * 사용자가 폴더 선택 취소하면 null 반환.
   *
   * scanDirectoryHandle 는 이미지 objectURL 까지 생성하므로 RAM 점유가 약간 있음.
   * MVP 는 그대로 활용 (1000개 ~ 50MB) — 추후 lightweight count-only API 분리 가능.
   *
   * 스캔 결과를 ref 에 저장해 startJob 시 재사용 (재스캔 회피).
   */
  const lastScanRef = useRef<{ dirName: string; products: unknown[]; thirdPartyImages: unknown[] } | null>(null);
  const pickAndAnalyze = useCallback(async (): Promise<{ rootFolderName: string; analysis: PreAnalysisResult } | null> => {
    const { pickAndScanFolder } = await import('@/lib/megaload/services/client-folder-scanner');
    let scan;
    try {
      scan = await pickAndScanFolder();
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return null;
      throw e;
    }
    lastScanRef.current = scan;

    const productCount = scan.products.length;
    // 상품당 평균 이미지 수
    const imageCount = scan.products.reduce((sum: number, p) => {
      const prod = p as { main_images?: unknown[]; detail_images?: unknown[]; review_images?: unknown[] };
      return sum +
        (prod.main_images?.length ?? 0) +
        (prod.detail_images?.length ?? 0) +
        (prod.review_images?.length ?? 0);
    }, 0);

    // 상품당 평균 5초 (이미지 압축/업로드 + 카테고리 매칭 + 쿠팡 등록)
    const estDurationMin = Math.ceil((productCount * 5) / 60);
    // OpenAI: dead code 정리 후 카테고리 LLM rerank 만 → 1000개 ≈ $0.04
    const estAiCostUsd = (productCount / 1000) * 0.04;

    const warnings: string[] = [];
    if (productCount > 1000) warnings.push(`${productCount}개는 ${Math.ceil(estDurationMin / 60)}시간 이상 소요됩니다 — 모니터링 가능한 시간대에 시작 권장`);
    if (productCount === 0) warnings.push('폴더에서 상품을 찾지 못했습니다 — 폴더 구조를 확인하세요');
    const avgImagesPerProduct = productCount > 0 ? Math.round(imageCount / productCount) : 0;
    if (avgImagesPerProduct < 3) warnings.push('상품당 이미지가 평균 3장 미만 — 쿠팡 노출에 불리할 수 있음');
    if (imageCount > 30000) warnings.push(`이미지 ${imageCount.toLocaleString()}장은 storage 부하가 큽니다 — 배치 분할 검토`);

    return {
      rootFolderName: scan.dirName,
      analysis: { productCount, imageCount, estDurationMin, estAiCostUsd, warnings },
    };
  }, []);

  /** 마지막 스캔 결과 — startJob 후 orchestrator 가 재사용 */
  const consumeLastScan = useCallback(() => {
    const r = lastScanRef.current;
    lastScanRef.current = null;
    return r;
  }, []);

  /** Gate 1 확인 → 잡 생성 → 실행 가능 상태로 전환 */
  const startJob = useCallback(async (params: {
    rootFolderName: string;
    dryRun: boolean;
    preAnalysis: PreAnalysisResult;
  }): Promise<string> => {
    const initRes = await fetch('/api/megaload/auto-job/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!initRes.ok) {
      const e = await initRes.json().catch(() => ({}));
      throw new Error(e.error || '잡 생성 실패');
    }
    const { jobId } = await initRes.json();

    // Gate 1 즉시 confirm (모달의 체크박스로 사용자 확인 완료된 상태)
    const confirmRes = await fetch(`/api/megaload/auto-job/${jobId}/confirm`, { method: 'POST' });
    if (!confirmRes.ok) {
      const e = await confirmRes.json().catch(() => ({}));
      throw new Error(e.error || 'Gate 1 확인 실패');
    }

    setActiveJobId(jobId);
    return jobId;
  }, []);

  /** 배치 완료 후 진행 상태 영속화 — 호출 측에서 매 배치마다 부름 */
  const checkpoint = useCallback(async (jobId: string, delta: {
    processedDelta: number;
    successDelta: number;
    failedDelta: number;
    lastIdx: number;
  }): Promise<void> => {
    try {
      await fetch(`/api/megaload/auto-job/${jobId}/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(delta),
      });
    } catch { /* 체크포인트 실패는 fatal 아님 — 다음 호출에서 재시도 */ }
  }, []);

  /** Gate 2 자동 일시정지 */
  const pauseJob = useCallback(async (jobId: string, reason: string, detail?: Record<string, unknown>): Promise<void> => {
    await fetch(`/api/megaload/auto-job/${jobId}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, detail }),
    });
    if (watchdogTimer.current) {
      clearInterval(watchdogTimer.current);
      watchdogTimer.current = null;
    }
  }, []);

  /** 종료 */
  const finalizeJob = useCallback(async (
    jobId: string,
    finalStatus: 'completed' | 'aborted' | 'failed',
    resultSummary?: Record<string, unknown>,
  ): Promise<void> => {
    await fetch(`/api/megaload/auto-job/${jobId}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finalStatus, resultSummary }),
    });
    if (watchdogTimer.current) {
      clearInterval(watchdogTimer.current);
      watchdogTimer.current = null;
    }
    setActiveJobId(null);
  }, []);

  return {
    activeJobId,
    resumableJob,
    checkResumable,
    pickAndAnalyze,
    consumeLastScan,
    startJob,
    checkpoint,
    pauseJob,
    finalizeJob,
  };
}
