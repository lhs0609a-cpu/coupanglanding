// ============================================================
// 백그라운드 모니터링 cron
//
// 동작:
//   1. 5분마다 토큰 검증 + 모니터 목록 fetch
//   2. 모니터 1개씩 순차 처리 (5~9초 jitter — 사용자 IP라 빠르게 가능하나 안전 마진)
//   3. 결과 누적 → 10개씩 묶어 Vercel API 전송
//   4. 통계 store 갱신
// ============================================================

import { Notification } from 'electron';
import { fetchMonitors, postResults, verifyToken, type ResultPayload, type MonitorTask } from './api-client';
import { fetchNaverProduct } from './naver-fetcher';
import { getStore } from './store';

// 페이싱 — 가정 IP 기준 네이버 스마트스토어 안전선 안쪽
// v0.1.10: v0.1.9 의 3~5초 페이싱은 ~44% 429 발생. 5~8초 로 완화 + 429 백오프 추가.
// v0.1.11: 토큰 만료 시 조용히 멈추던 버그 수정 — isLoggedIn 해제 + 알림 + cron 정지(재로그인 시 재개).
// v0.1.14: 429 완화 — 페이싱 8~12초 + AIMD 적응형 지연 + 조회 헤더/지속쿠키 위장(naver-fetcher).
// 분당 ~9건. 2519개 한 바퀴 약 4.5시간 (전 사이클 3시간 → 약간 늘어남, 대신 성공률 ↑).
const CRON_TICK_MS = 2 * 60 * 1000; // 2분마다 모니터 목록 fetch (배치 종료 후 idle gap 단축)
// v0.1.14: 429 완화 — base 5→8초, jitter 3→4초(실제 8~12초) + AIMD 적응형.
const ITEM_INTERVAL_MS = 8000; // base 8초
const ITEM_JITTER_MS = 4000;   // + 0~4초 jitter → 실제 8~12초
const BATCH_FLUSH_SIZE = 10; // 10개 모이면 즉시 전송
const BATCH_FLUSH_INTERVAL_MS = 60000; // 1분마다 강제 flush

// 429/transient 연속 감지 시 cool-down
// 3회 연속 transient → 60초 휴식 (IP throttling 회복 시간 확보)
const TRANSIENT_BACKOFF_THRESHOLD = 3;
const TRANSIENT_BACKOFF_MS = 60_000;

// AIMD 적응형 지연 — 429(transient) 뜨면 곱셈 증가, 성공하면 덧셈 감소.
// 네이버 스로틀링에 실시간 적응해 429 를 최소화(고정 페이싱보다 효과적).
const ADAPTIVE_MAX_MS = 30_000;   // 지연 상한 30초
const ADAPTIVE_INC_FACTOR = 1.5;  // 429 시 ×1.5
const ADAPTIVE_DEC_MS = 1_000;    // 성공 시 −1초 (base 까지)
let adaptiveDelayMs = ITEM_INTERVAL_MS; // 모듈 전역 — tick 간 스로틀링 상태 유지

let cronTimer: NodeJS.Timeout | null = null;
let flushTimer: NodeJS.Timeout | null = null;
let watchdogTimer: NodeJS.Timeout | null = null;
let isProcessing = false;
const pendingResults: ResultPayload[] = [];

// ── 워치독 ──
// 마지막으로 처리에 성공한 시각. tick 진입 자체가 아니라 "한 건이라도 처리/전송 성공" 시점.
// 1시간 동안 갱신 안 되면 cron 이 사실상 멈춘 것 → self relaunch 로 회복.
let lastSuccessAt = Date.now();
const WATCHDOG_INTERVAL_MS = 5 * 60 * 1000; // 5분마다 검사
const WATCHDOG_IDLE_THRESHOLD_MS = 60 * 60 * 1000; // 1시간 무활동 = freeze 판정

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function startMonitorCron(): void {
  if (cronTimer) return;
  console.log('[monitor-cron] 시작');
  lastSuccessAt = Date.now();
  // 즉시 1회 실행
  void tick();
  cronTimer = setInterval(() => void tick(), CRON_TICK_MS);
  flushTimer = setInterval(() => void flushPending(), BATCH_FLUSH_INTERVAL_MS);
  // 워치독 — cron 시작 시점에만 동작 (stop 후엔 비활성)
  watchdogTimer = setInterval(() => {
    const idleMs = Date.now() - lastSuccessAt;
    if (idleMs > WATCHDOG_IDLE_THRESHOLD_MS) {
      console.warn(`[monitor-cron] 워치독 — ${Math.floor(idleMs / 60000)}분 무활동 → self relaunch 요청`);
      const relaunch = (globalThis as { __safeRelaunch?: (reason: string) => void }).__safeRelaunch;
      if (relaunch) {
        relaunch(`watchdog idle ${Math.floor(idleMs / 60000)}min`);
      } else {
        // fallback — handle 없으면 cron 만 재시작 (in-process 회복 시도)
        stopMonitorCron();
        startMonitorCron();
      }
    }
  }, WATCHDOG_INTERVAL_MS);
}

export function stopMonitorCron(): void {
  if (cronTimer) { clearInterval(cronTimer); cronTimer = null; }
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
  console.log('[monitor-cron] 정지');
}

/** 토큰 만료/거부 시 사용자에게 재로그인 필요를 알린다 (조용한 정지 방지) */
function notifyTokenExpired(): void {
  try {
    new Notification({
      title: 'Megaload Monitor — 재로그인 필요',
      body: '인증코드가 만료되어 품절 동기화가 멈췄습니다. 메가로드 웹에서 코드를 재발급해 다시 로그인하세요.',
    }).show();
  } catch { /* Notification 미지원 환경 무시 */ }
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
      // 영구 토큰 정책 — 자동 만료 없음. 401 은 사용자가 명시적으로 web 에서 폐기한 경우만.
      //   - 명시적 폐기: 로그아웃 처리 + 알림 (cron 정지, 재로그인 필요)
      //   - 그 외 (네트워크 일시 실패, 5xx, 타임아웃 등): 로그인 유지 + 다음 tick 재시도
      const explicitlyRevoked = (auth.error || '').includes('401') || (auth.error || '').includes('not found or revoked');
      if (explicitlyRevoked) {
        console.warn('[monitor-cron] 토큰 명시적 폐기 — 로그인 해제 후 cron 정지');
        getStore().set('isLoggedIn', false);
        notifyTokenExpired();
        stopMonitorCron();
      } else {
        console.warn('[monitor-cron] 토큰 검증 일시 실패(네트워크?) — 다음 tick 재시도:', auth.error);
      }
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

      // AIMD 적응형 지연 갱신 + 429 연속 감지 cool-down
      if (lastStatus === 'transient') {
        // 429 → 곱셈 증가 (네이버가 지금 느리라고 신호)
        adaptiveDelayMs = Math.min(ADAPTIVE_MAX_MS, Math.round(adaptiveDelayMs * ADAPTIVE_INC_FACTOR));
        consecutiveTransient++;
        if (consecutiveTransient >= TRANSIENT_BACKOFF_THRESHOLD) {
          console.warn(`[monitor-cron] transient ${consecutiveTransient}회 연속 — ${TRANSIENT_BACKOFF_MS / 1000}초 휴식 (지연 ${adaptiveDelayMs}ms)`);
          await flushPending(); // 휴식 전 결과 비우기
          await sleep(TRANSIENT_BACKOFF_MS);
          consecutiveTransient = 0;
        }
      } else {
        consecutiveTransient = 0;
        // 성공(정상 응답) → 덧셈 감소로 base 까지 서서히 회복
        if (lastStatus === null) {
          adaptiveDelayMs = Math.max(ITEM_INTERVAL_MS, adaptiveDelayMs - ADAPTIVE_DEC_MS);
        }
      }

      // 결과 batch flush 트리거
      if (pendingResults.length >= BATCH_FLUSH_SIZE) await flushPending();
      await sleep(adaptiveDelayMs + Math.random() * ITEM_JITTER_MS);
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
    // 통계 갱신 + 워치독 heartbeat
    const total = (store.get('totalChecked') as number | undefined) || 0;
    store.set('totalChecked', total + 1);
    store.set('lastCheckAt', new Date().toISOString());
    lastSuccessAt = Date.now(); // 한 건 처리 성공 = cron 살아있음

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
    lastSuccessAt = Date.now(); // 전송 성공도 cron 정상 신호
  } catch (err) {
    console.error('[monitor-cron] flushPending 실패:', err);
    // 실패 시 다시 큐에 (1번까지만)
    pendingResults.unshift(...batch.slice(0, BATCH_FLUSH_SIZE));
  }
}
