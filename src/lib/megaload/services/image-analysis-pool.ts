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
    //   상한 12→16: 고코어(16+) PC에서 상품 병렬 분석도 그만큼 늘어남. 로컬 CPU만 사용(서버/비용 무관).
    const poolSize = size ?? Math.min(16, Math.max(4, cores - 1));
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
          // 죽은 워커를 풀에서 제거 → isAvailable()/dispatch 정확도 유지.
          //   (로드 단계 실패 등으로 전 워커가 죽으면 isAvailable()=false → 메인스레드 폴백)
          this.workers = this.workers.filter((w) => w !== worker);
          this.idleWorkers = this.idleWorkers.filter((w) => w !== worker);
          try { worker.terminate(); } catch { /* already dead */ }
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
      // ★ 태스크 타임아웃: 워커가 (로드 실패/디코드 무한대기 등으로) 응답 안 하면
      //   파이프라인 전체가 영구 대기("시작조차 안 됨" 프리즈)에 빠진다. 25초 넘으면
      //   reject → 호출부(processProductInWorkerThread)가 메인스레드 폴백으로 이 상품만 처리.
      //   늦게 오는 응답은 settled 가드로 무시하고 handleMessage 가 워커를 idle 로 회수.
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        // pending 큐에 아직 남아있으면 제거 (dispatch 전 타임아웃)
        const pi = this.pending.indexOf(task);
        if (pi >= 0) this.pending.splice(pi, 1);
        console.warn(`[image-analysis-pool] task ${id} 타임아웃(25s) — 메인스레드 폴백`);
        reject(new Error('worker task timeout'));
      }, 25000);
      const task: PendingTask = {
        id,
        request: { id, op: 'analyzeProduct', args },
        resolve: (r) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          r ? resolve(r) : reject(new Error('null result'));
        },
        reject: (e) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(e);
        },
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

/**
 * 워커 스폰/동작 가능 여부를 실측한다 (사양 체크용).
 *
 * 실제 image-analysis.worker.ts 를 새로 띄워 clearCache 핑에 응답하는지 확인 →
 * "이미지 다양성 분석 워커가 이 PC/브라우저에서 실제로 뜨는가"를 그대로 검증한다.
 * (파이프라인이 멈추는 "시작조차 안 됨"의 진짜 원인 진단용)
 *
 * @returns ok: 워커가 응답하면 true, latencyMs: 스폰~첫응답 지연, error: 실패 사유
 */
export async function probeWorkerSupport(
  timeoutMs = 5000,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (typeof Worker === 'undefined') {
    return { ok: false, latencyMs: 0, error: 'Web Worker 미지원 브라우저' };
  }
  const start = now();
  let worker: Worker;
  try {
    worker = new Worker(new URL('./image-analysis.worker.ts', import.meta.url), { type: 'module' });
  } catch (e) {
    return { ok: false, latencyMs: 0, error: `워커 스폰 실패: ${e instanceof Error ? e.message : 'unknown'}` };
  }
  const w = worker;
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: { ok: boolean; latencyMs: number; error?: string }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      w.removeEventListener('message', onMsg);
      w.removeEventListener('error', onErr as EventListener);
      try { w.terminate(); } catch { /* already dead */ }
      resolve(r);
    };
    const timer = setTimeout(
      () => finish({ ok: false, latencyMs: now() - start, error: '워커 응답 타임아웃 — 로드 실패 추정' }),
      timeoutMs,
    );
    const onMsg = () => finish({ ok: true, latencyMs: now() - start });
    const onErr = (e: ErrorEvent) => finish({ ok: false, latencyMs: now() - start, error: `워커 오류: ${e.message || 'unknown'}` });
    w.addEventListener('message', onMsg);
    w.addEventListener('error', onErr as EventListener);
    // clearCache 는 인자 없이 워커가 처리 후 응답 → 가장 가벼운 왕복 핑
    w.postMessage({ id: -1, op: 'clearCache' });
  });
}
