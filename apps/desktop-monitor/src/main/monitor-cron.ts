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
import { fetchNaverProduct, warmUpSession } from './naver-fetcher';
import { getStore } from './store';

// 페이싱 — 가정 IP 기준 네이버 스마트스토어 안전선 안쪽
// v0.1.10: v0.1.9 의 3~5초 페이싱은 ~44% 429 발생. 5~8초 로 완화 + 429 백오프 추가.
// v0.1.11: 토큰 만료 시 조용히 멈추던 버그 수정 — isLoggedIn 해제 + 알림 + cron 정지(재로그인 시 재개).
// v0.1.14: 429 완화 — 페이싱 8~12초 + AIMD 적응형 지연 + 조회 헤더/지속쿠키 위장(naver-fetcher).
// v0.1.15: base 8→12초 + 세션 워밍업 + 서버 15분 백오프.
// ─────────────────────────────────────────────────────────────────────────
// v0.1.16 무차단 재설계 P2 — "429 절대 무해" 목표.
//   ① 보수적 페이싱: 30~75초 full-jitter(평균 ~1.1건/분) — 관측상 6건/분에 차단되므로 3~6배 안전마진.
//      서버 티어 스케줄러(P1)가 due 인 것만 내려주므로 이 저속으로도 전량 완주.
//   ② 서킷브레이커(핵심): 429/503 1회라도 뜨면 회로 OPEN → 30분+ 완전 중단(IP 회복). 재개는
//      쿨다운 후 첫 조회(half-open 탐침)가 성공할 때. 연속 트립 시 쿨다운 ×1.5(상한 2h).
//      → 어떤 429 도 누적/증폭 불가. AIMD+연속카운트 방식을 이 서킷브레이커로 대체.
const CRON_TICK_MS = 2 * 60 * 1000; // 2분마다 모니터 목록 fetch (서킷 OPEN 이면 skip)
const ITEM_BASE_MS = 30_000;        // 기본 30초 간격
const ITEM_FULLJITTER_MS = 45_000;  // + 0~45초 full-jitter → 실제 30~75초(고정 주기 패턴 회피)
const BATCH_FLUSH_SIZE = 10;        // 10개 모이면 즉시 전송
const BATCH_FLUSH_INTERVAL_MS = 60_000; // 1분마다 강제 flush

// ── 서킷브레이커 상태(모듈 전역 — tick 간 유지) ──
const CIRCUIT_COOLDOWN_BASE_MS = 30 * 60 * 1000;  // 첫 트립 쿨다운 30분
const CIRCUIT_COOLDOWN_MAX_MS = 2 * 60 * 60 * 1000; // 쿨다운 상한 2시간
const CIRCUIT_BACKOFF_FACTOR = 1.5;                 // 쿨다운 중 재트립 시 ×1.5
const RETRY_AFTER_MAX_MS = 2 * 60 * 60 * 1000;      // 네이버 Retry-After 존중 상한
let circuitOpenUntil = 0;                            // 이 시각까지 조회 완전 중단
let circuitCooldownMs = CIRCUIT_COOLDOWN_BASE_MS;   // 다음 트립 시 적용할 쿨다운(연속 트립마다 증가)

/** 429/503 감지 → 회로 OPEN. Retry-After 가 있으면 그와 현재 쿨다운 중 큰 쪽. 다음 쿨다운은 ×1.5. */
function tripCircuit(retryAfterMs?: number): void {
  const retryAfter = retryAfterMs != null ? Math.min(RETRY_AFTER_MAX_MS, retryAfterMs) : 0;
  const cooldown = Math.min(CIRCUIT_COOLDOWN_MAX_MS, Math.max(circuitCooldownMs, retryAfter));
  circuitOpenUntil = Date.now() + cooldown;
  console.warn(`[monitor-cron] 🔴 429/503 감지 → 서킷 OPEN, ${Math.round(cooldown / 60000)}분 완전 중단(IP 회복 대기)${retryAfter ? `, Retry-After ${Math.round(retryAfter / 1000)}s` : ''}`);
  // 다음 트립은 더 길게(연속 차단이면 IP 가 깊이 flagged 된 것)
  circuitCooldownMs = Math.min(CIRCUIT_COOLDOWN_MAX_MS, Math.round(circuitCooldownMs * CIRCUIT_BACKOFF_FACTOR));
}

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
    // 서킷 OPEN(의도된 IP 냉각) 중이면 무활동이 정상 — relaunch 하면 쿨다운을 깨 429 재발.
    if (Date.now() < circuitOpenUntil) return;
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
  // 서킷 OPEN(429 냉각 중)이면 조회 완전 skip — 쿨다운 끝나면 자동 재개
  if (Date.now() < circuitOpenUntil) {
    console.log(`[monitor-cron] 🔴 서킷 OPEN — ${Math.ceil((circuitOpenUntil - Date.now()) / 60000)}분 쿨다운 중, 조회 skip`);
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

    // 배치 시작 전 세션 워밍업 — NNB 쿠키 갱신으로 "재방문 브라우저" 위장(429↓). 실패해도 무시.
    await warmUpSession();

    for (const m of monitors) {
      const { cls: lastStatus, retryAfterMs, rateLimited } = await processMonitor(m);

      // 실제 429/503 감지 → 서킷 OPEN 후 이 배치 즉시 중단. 어떤 429 도 누적/증폭 불가.
      // (단순 타임아웃은 rateLimited=false → 정지 안 하고 다음 상품으로 — 완주 우선.)
      if (rateLimited) {
        tripCircuit(retryAfterMs);
        await flushPending(); // 중단 전 수집분 전송
        break;
      }
      // 정상 응답 → 회로 건강. 쿨다운을 base 로 리셋(다음 트립은 다시 30분부터).
      if (lastStatus === null) circuitCooldownMs = CIRCUIT_COOLDOWN_BASE_MS;

      // 결과 batch flush 트리거
      if (pendingResults.length >= BATCH_FLUSH_SIZE) await flushPending();
      // 다음 아이템 전 대기 — 30~75초 full-jitter (보수적 페이싱)
      await sleep(ITEM_BASE_MS + Math.random() * ITEM_FULLJITTER_MS);
    }

    await flushPending();
  } catch (err) {
    console.error('[monitor-cron] tick 실패:', err);
  } finally {
    isProcessing = false;
  }
}

/** 단건 처리. 반환: errorClass + Retry-After + rateLimited(429/503 인지 — 서킷 트립 판정용). */
type ProcessOutcome = { cls: 'transient' | 'naver' | 'infra' | null; retryAfterMs?: number; rateLimited?: boolean };
async function processMonitor(m: MonitorTask): Promise<ProcessOutcome> {
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
      // 실제 속도제한(429/503)만 서킷 트립 대상 — 단순 타임아웃/네트워크 blip 은 제외(30분 정지 오작동 방지).
      const rateLimited = /HTTP 429|HTTP 503|속도제한/.test(result.matchedPattern || '');
      return { cls: result.errorClass || 'naver', retryAfterMs: result.retryAfterMs, rateLimited };
    }
    return { cls: null };
  } catch (err) {
    console.warn(`[monitor-cron] processMonitor 실패 (${m.id}):`, err);
    pendingResults.push({
      monitorId: m.id,
      status: 'error',
      matchedPattern: err instanceof Error ? err.message.slice(0, 80) : 'unknown',
      errorClass: 'naver',
      fetchedAt: new Date().toISOString(),
    });
    return { cls: 'naver' };
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
