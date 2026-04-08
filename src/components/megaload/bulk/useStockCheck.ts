'use client';

import { useState, useCallback, useRef } from 'react';
import type { StockStatus, OptionStockStatus } from '@/app/api/megaload/stock-check/route';

export type { StockStatus };

export interface StockCheckResultItem {
  status: StockStatus;
  statusLabel: string;
  url: string;
  matchedPattern?: string;
  options?: OptionStockStatus[];
  isOptionProduct?: boolean;
  soldOutOptionCount?: number;
  totalOptionCount?: number;
}

export interface StockCheckState {
  /** uid → 품절 상태 */
  results: Record<string, StockCheckResultItem>;
  /** 진행 상태 */
  phase: 'idle' | 'running' | 'complete';
  /** 진행률 */
  progress: { done: number; total: number };
  /** 통계 */
  stats: { inStock: number; soldOut: number; removed: number; unknown: number; error: number } | null;
}

const BATCH_SIZE = 30; // API는 50개까지 지원하지만 여유 확보

/**
 * 배치 품절 체크 훅
 *
 * 사용법:
 *   const { state, runStockCheck, abort } = useStockCheck();
 *   runStockCheck(products); // sourceUrl이 있는 상품만 체크
 */
export function useStockCheck() {
  const [state, setState] = useState<StockCheckState>({
    results: {},
    phase: 'idle',
    progress: { done: 0, total: 0 },
    stats: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setState(prev => ({ ...prev, phase: 'idle' }));
  }, []);

  const runStockCheck = useCallback(async (
    items: { uid: string; sourceUrl?: string }[],
  ) => {
    // sourceUrl이 있는 항목만 필터
    const targets = items.filter(
      (p): p is { uid: string; sourceUrl: string } => !!p.sourceUrl,
    );

    if (targets.length === 0) return;

    // 이전 요청 취소
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      results: {},
      phase: 'running',
      progress: { done: 0, total: targets.length },
      stats: null,
    });

    const allResults: Record<string, StockCheckResultItem> = {};
    const stats = { inStock: 0, soldOut: 0, removed: 0, unknown: 0, error: 0 };

    // BATCH_SIZE씩 처리
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      if (controller.signal.aborted) break;

      const batch = targets.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch('/api/megaload/stock-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            urls: batch.map(p => ({ uid: p.uid, url: p.sourceUrl })),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          // API 에러 시 이 배치는 모두 error 처리
          for (const p of batch) {
            allResults[p.uid] = { status: 'error', statusLabel: '접속오류', url: p.sourceUrl };
            stats.error++;
          }
        } else {
          const data = await res.json();
          for (const [uid, result] of Object.entries(data.results) as [string, StockCheckResultItem][]) {
            allResults[uid] = result;
            switch (result.status) {
              case 'in_stock': stats.inStock++; break;
              case 'sold_out': stats.soldOut++; break;
              case 'removed': stats.removed++; break;
              case 'unknown': stats.unknown++; break;
              case 'error': stats.error++; break;
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') break;
        // 네트워크 에러
        for (const p of batch) {
          allResults[p.uid] = { status: 'error', statusLabel: '접속오류', url: p.sourceUrl };
          stats.error++;
        }
      }

      // 진행률 업데이트
      const done = Math.min(i + BATCH_SIZE, targets.length);
      setState(prev => ({
        ...prev,
        results: { ...allResults },
        progress: { done, total: targets.length },
      }));
    }

    if (!controller.signal.aborted) {
      setState({
        results: { ...allResults },
        phase: 'complete',
        progress: { done: targets.length, total: targets.length },
        stats,
      });
    }
  }, []);

  return { state, runStockCheck, abort };
}
