// ============================================================
// Image Analysis Web Worker — CPU-heavy 이미지 분석을 워커 스레드로
//
// 입력: File[] (구조화 복제로 zero-copy 전송, blob 데이터 자체는 공유)
// 처리: blob URL 생성 → 기존 scorer 함수 호출 (worker-compatible)
// 출력: 분석 결과 (인덱스/점수)
//
// blob URL은 워커 컨텍스트에 한정되므로 메인 thread URL을 전달하지 않고
// File 객체를 받아 워커 내부에서 URL.createObjectURL() 호출.
// ============================================================

import {
  selectDiverseImages,
  filterDetailPageImages,
  detectDuplicateImages,
  clearAnalysisCache,
  type DiverseSelectionResult,
} from './image-quality-scorer';
import type { AutoExcludeReason } from './client-folder-scanner';

export type WorkerRequest =
  | { id: number; op: 'analyzeProduct'; args: AnalyzeProductArgs }
  | { id: number; op: 'clearCache' };

export interface AnalyzeProductArgs {
  detailFiles: File[];
  reviewFiles: File[];
  mainFiles: File[];
  detailMaxCount: number;
  reviewMaxCount: number;
}

export interface AnalyzeProductResult {
  detail: {
    diverse: DiverseSelectionResult;
    adFilter: { index: number; filtered: boolean; reason?: string }[];
    dup: { keptIndices: number[]; duplicateIndices: number[] };
  } | null;
  review: DiverseSelectionResult | null;
}

export type WorkerResponse =
  | { id: number; result: AnalyzeProductResult | null }
  | { id: number; error: string };

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  const { id, op } = msg;
  try {
    if (op === 'clearCache') {
      clearAnalysisCache();
      const res: WorkerResponse = { id, result: null };
      self.postMessage(res);
      return;
    }

    if (op === 'analyzeProduct') {
      const { detailFiles, reviewFiles, mainFiles, detailMaxCount, reviewMaxCount } = msg.args;

      // 워커 컨텍스트에서 blob URL 생성 — 메인 URL은 워커에서 접근 불가
      const detailUrls = detailFiles.map(f => URL.createObjectURL(f));
      const reviewUrls = reviewFiles.map(f => URL.createObjectURL(f));
      const mainUrls = mainFiles.map(f => URL.createObjectURL(f)).slice(0, 3);

      try {
        const [detailResult, reviewResult] = await Promise.all([
          (async () => {
            if (detailUrls.length === 0) return null;
            const [diverse, adFilter, dup] = await Promise.all([
              selectDiverseImages(
                detailUrls,
                { maxCount: detailMaxCount, referenceUrls: mainUrls, trustFolderContents: true },
              ),
              filterDetailPageImages(detailUrls).catch(() => [] as Awaited<ReturnType<typeof filterDetailPageImages>>),
              detectDuplicateImages(detailUrls, 0.95).catch(() => ({
                keptIndices: [] as number[],
                duplicateIndices: [] as number[],
                clusterMap: new Map<number, number>(),
              })),
            ]);
            return {
              diverse,
              adFilter,
              dup: { keptIndices: dup.keptIndices, duplicateIndices: dup.duplicateIndices },
            };
          })(),
          (async () => {
            if (reviewUrls.length === 0) return null;
            return await selectDiverseImages(
              reviewUrls,
              { maxCount: reviewMaxCount, trustFolderContents: true },
            );
          })(),
        ]);

        const res: WorkerResponse = {
          id,
          result: { detail: detailResult, review: reviewResult },
        };
        self.postMessage(res);
      } finally {
        detailUrls.forEach(URL.revokeObjectURL);
        reviewUrls.forEach(URL.revokeObjectURL);
        mainUrls.forEach(URL.revokeObjectURL);
      }
    }
  } catch (err) {
    const res: WorkerResponse = {
      id,
      error: err instanceof Error ? err.message : 'unknown',
    };
    self.postMessage(res);
  }
};

// 워커 인스턴스 정보 (디버그용)
console.info('[image-analysis-worker] 워커 시작');

// 외부에서 import 시 fallback 타입만 제공 (실제 실행은 self.onmessage)
export type { AutoExcludeReason };
