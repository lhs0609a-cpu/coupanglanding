// ============================================================
// Image Analysis Worker Pool — 메인스레드 CPU 작업을 워커풀로 분산
//
// - 하드웨어 코어 수에 비례한 워커 N개 spawn (max 8)
// - 워크 큐: 워커가 idle일 때 대기 작업 즉시 dispatch
// - Promise 기반 인터페이스
// ============================================================

import type {
  WorkerRequest,
  WorkerResponse,
  AnalyzeProductArgs,
  AnalyzeProductResult,
} from './image-analysis.worker';

interface PendingTask {
  id: number;
  request: WorkerRequest;
  resolve: (result: AnalyzeProductResult | null) => void;
  reject: (err: Error) => void;
}

class ImageAnalysisPool {
  private workers: Worker[] = [];
  private idleWorkers: Worker[] = [];
  private pending: PendingTask[] = [];
  private workerInflight: Map<Worker, PendingTask> = new Map();
  private nextId = 0;
  private initialized = false;

  init(size?: number): void {
    if (this.initialized) return;
    this.initialized = true;
    const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
    // ★ 속도패치: cores/2(보통 4개) → cores-1(메인스레드용 1코어만 남김). 디코드를 size×size로
    //   직접 축소(getCachedPixels)해 워커당 작업이 가벼워졌으므로 워커 수를 늘려 병렬도↑.
    //   로컬 CPU만 사용(서버/비용 무관).
    const poolSize = size ?? Math.min(12, Math.max(4, cores - 1));
    for (let i = 0; i < poolSize; i++) {
      try {
        const worker = new Worker(
          new URL('./image-analysis.worker.ts', import.meta.url),
          { type: 'module' },
        );
        worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.handleMessage(worker, e.data);
        worker.onerror = (err) => {
          console.error('[image-analysis-pool] worker error:', err);
          // 실패한 worker가 들고 있던 작업 reject
          const task = this.workerInflight.get(worker);
          if (task) {
            this.workerInflight.delete(worker);
            task.reject(new Error(`worker error: ${err.message || 'unknown'}`));
          }
        };
        this.workers.push(worker);
        this.idleWorkers.push(worker);
      } catch (e) {
        console.warn('[image-analysis-pool] worker spawn 실패 (메인 thread fallback)', e);
      }
    }
    console.info(`[image-analysis-pool] ${this.workers.length}개 워커 시작 (cores=${cores})`);
  }

  isAvailable(): boolean {
    return this.workers.length > 0;
  }

  private handleMessage(worker: Worker, res: WorkerResponse): void {
    const task = this.workerInflight.get(worker);
    if (!task || task.id !== res.id) {
      console.warn('[image-analysis-pool] orphan message', res);
      return;
    }
    this.workerInflight.delete(worker);
    if ('error' in res) {
      task.reject(new Error(res.error));
    } else {
      task.resolve(res.result);
    }
    this.idleWorkers.push(worker);
    this.dispatchNext();
  }

  private dispatchNext(): void {
    while (this.pending.length > 0 && this.idleWorkers.length > 0) {
      const worker = this.idleWorkers.shift()!;
      const task = this.pending.shift()!;
      this.workerInflight.set(worker, task);
      worker.postMessage(task.request);
    }
  }

  analyzeProduct(args: AnalyzeProductArgs): Promise<AnalyzeProductResult> {
    if (!this.initialized) this.init();
    if (this.workers.length === 0) {
      return Promise.reject(new Error('no workers available'));
    }
    return new Promise<AnalyzeProductResult>((resolve, reject) => {
      const id = ++this.nextId;
      const task: PendingTask = {
        id,
        request: { id, op: 'analyzeProduct', args },
        resolve: (r) => r ? resolve(r) : reject(new Error('null result')),
        reject,
      };
      this.pending.push(task);
      this.dispatchNext();
    });
  }

  /** 모든 워커의 캐시 비우기 (새 파이프라인 시작 시) */
  async clearCache(): Promise<void> {
    if (!this.initialized) return;
    await Promise.all(
      this.workers.map(worker => new Promise<void>((resolve) => {
        const id = ++this.nextId;
        const task: PendingTask = {
          id,
          request: { id, op: 'clearCache' },
          resolve: () => resolve(),
          reject: () => resolve(), // 에러도 무시 (best-effort)
        };
        // clearCache는 idle 큐가 아닌 직접 dispatch (각 워커에 한 번씩)
        this.workerInflight.set(worker, task);
        worker.postMessage(task.request);
      })),
    );
  }

  terminate(): void {
    for (const worker of this.workers) worker.terminate();
    this.workers = [];
    this.idleWorkers = [];
    this.pending = [];
    this.workerInflight.clear();
    this.initialized = false;
  }
}

export const imageAnalysisPool = new ImageAnalysisPool();
