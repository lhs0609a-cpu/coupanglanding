// ============================================================
// 백그라운드 모니터링 cron
//
// 동작:
//   1. 5분마다 토큰 검증 + 모니터 목록 fetch
//   2. 모니터 1개씩 순차 처리 (5~9초 jitter — 사용자 IP라 빠르게 가능하나 안전 마진)
//   3. 결과 누적 → 10개씩 묶어 Vercel API 전송
//   4. 통계 store 갱신
// ============================================================

import { fetchMonitors, postResults, verifyToken, type ResultPayload, type MonitorTask } from './api-client';
import { fetchNaverProduct } from './naver-fetcher';
import { getStore } from './store';

// 페이싱 — 가정 IP 기준 네이버 스마트스토어 안전선 안쪽
// v0.1.10: v0.1.9 의 3~5초 페이싱은 ~44% 429 발생. 5~8초 로 완화 + 429 백오프 추가.
// 분당 ~9건. 2519개 한 바퀴 약 4.5시간 (전 사이클 3시간 → 약간 늘어남, 대신 성공률 ↑).
const CRON_TICK_MS = 2 * 60 * 1000; // 2분마다 모니터 목록 fetch (배치 종료 후 idle gap 단축)
const ITEM_INTERVAL_MS = 5000; // 5초 base + jitter → 실제 5~8초
const ITEM_JITTER_MS = 3000;
const BATCH_FLUSH_SIZE = 10; // 10개 모이면 즉시 전송
const BATCH_FLUSH_INTERVAL_MS = 60000; // 1분마다 강제 flush

// 429/transient 연속 감지 시 cool-down
// 3회 연속 transient → 60초 휴식 (IP throttling 회복 시간 확보)
const TRANSIENT_BACKOFF_THRESHOLD = 3;
const TRANSIENT_BACKOFF_MS = 60_000;

let cronTimer: NodeJS.Timeout | null = null;
let flushTimer: NodeJS.Timeout | null = null;
let isProcessing = false;
const pendingResults: ResultPayload[] = [];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function startMonitorCron(): void {
  if (cronTimer) return;
  console.log('[monitor-cron] 시작');
  // 즉시 1회 실행
  void tick();
  cronTimer = setInterval(() => void tick(), CRON_TICK_MS);
  flushTimer = setInterval(() => void flushPending(), BATCH_FLUSH_INTERVAL_MS);
}

export function stopMonitorCron(): void {
  if (cronTimer) { clearInterval(cronTimer); cronTimer = null; }
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  console.log('[monitor-cron] 정지');
}

async function tick(): Promise<void> {
  if (isProcessing) {
    console.log('[monitor-cron] 이전 tick 진행 중 — 스킵');
    return;
  }
  isProcessing = true;
  try {
    // 토큰 검증
    const auth = await verifyToken();
    if (!auth.valid) {
      console.warn('[monitor-cron] 토큰 무효 (만료=' + (auth.expired ? 'Y' : 'N') + ')');
      return;
    }

    // 모니터 목록 fetch
    const monitors = await fetchMonitors(50);
    if (monitors.length === 0) {
      console.log('[monitor-cron] 처리할 모니터 없음 (다음 tick 대기)');
      return;
    }
    console.log(`[monitor-cron] ${monitors.length}개 모니터 처리 시작`);

    let consecutiveTransient = 0;
    for (const m of monitors) {
      const lastStatus = await processMonitor(m);

      // 429 (transient) 연속 감지 → cool-down
      if (lastStatus === 'transient') {
        consecutiveTransient++;
        if (consecutiveTransient >= TRANSIENT_BACKOFF_THRESHOLD) {
          console.warn(`[monitor-cron] transient ${consecutiveTransient}회 연속 — ${TRANSIENT_BACKOFF_MS / 1000}초 휴식`);
          await flushPending(); // 휴식 전 결과 비우기
          await sleep(TRANSIENT_BACKOFF_MS);
          consecutiveTransient = 0;
        }
      } else {
        consecutiveTransient = 0;
      }

      // 결과 batch flush 트리거
      if (pendingResults.length >= BATCH_FLUSH_SIZE) await flushPending();
      await sleep(ITEM_INTERVAL_MS + Math.random() * ITEM_JITTER_MS);
    }

    await flushPending();
  } catch (err) {
    console.error('[monitor-cron] tick 실패:', err);
  } finally {
    isProcessing = false;
  }
}

/** 단건 처리. 반환값: 결과의 errorClass (backoff 판정용) — 'transient' | 'naver' | 'infra' | null */
async function processMonitor(m: MonitorTask): Promise<'transient' | 'naver' | 'infra' | null> {
  const store = getStore();
  try {
    const result = await fetchNaverProduct(m.source_url);
    pendingResults.push({
      monitorId: m.id,
      status: result.status,
      mainPrice: result.mainPrice,
      options: result.options,
      matchedPattern: result.matchedPattern,
      errorClass: result.errorClass,
      fetchedAt: new Date().toISOString(),
    });
    // 통계 갱신
    const total = (store.get('totalChecked') as number | undefined) || 0;
    store.set('totalChecked', total + 1);
    store.set('lastCheckAt', new Date().toISOString());
    if (result.status === 'error') {
      const errs = (store.get('totalErrors') as number | undefined) || 0;
      store.set('totalErrors', errs + 1);
      return result.errorClass || 'naver';
    }
    return null;
  } catch (err) {
    console.warn(`[monitor-cron] processMonitor 실패 (${m.id}):`, err);
    pendingResults.push({
      monitorId: m.id,
      status: 'error',
      matchedPattern: err instanceof Error ? err.message.slice(0, 80) : 'unknown',
      errorClass: 'naver',
      fetchedAt: new Date().toISOString(),
    });
    return 'naver';
  }
}

async function flushPending(): Promise<void> {
  if (pendingResults.length === 0) return;
  const batch = pendingResults.splice(0, pendingResults.length);
  try {
    const res = await postResults(batch);
    console.log(`[monitor-cron] 전송 완료: ${res.updated}/${batch.length}`);
  } catch (err) {
    console.error('[monitor-cron] flushPending 실패:', err);
    // 실패 시 다시 큐에 (1번까지만)
    pendingResults.unshift(...batch.slice(0, BATCH_FLUSH_SIZE));
  }
}
