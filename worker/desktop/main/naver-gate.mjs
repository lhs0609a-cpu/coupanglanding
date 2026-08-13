/**
 * 네이버 단일 예산 게이트 — 이 프로세스에서 네이버로 나가는 **모든** 요청의 유일한 관문.
 * ---------------------------------------------------------------------------
 * 왜 하나여야 하나:
 *   도우미는 이미 네이버를 두드리고 있다(stock-monitor 가 셀러들의 품절/가격을 가정 IP 로 확인).
 *   여기에 소싱 수집기가 같은 PC·같은 IP 로 요청을 얹으면, 수집이 성공해도 **품절 모니터가 먼저
 *   죽는다**. 그건 셀러에게 바로 피해가 간다. 과거 429 증폭 루프로 이미 크게 데인 지점이라
 *   (오류 상품을 백오프 없이 매 tick 재조회 → IP 계속 hot), 두 소비자가 예산을 나눠 쓰도록
 *   관문을 하나로 강제한다.
 *
 * 설계 규칙 (원본: naveritem 이식 가이드 [11]):
 *   · 페이싱은 **단조 시계**(performance.now)로 잰다. Date.now 는 NTP 동기화/서머타임 점프 때
 *     토큰을 한꺼번에 뱉어 레이트리밋이 무너진다.
 *   · 쿨다운 만료 시각은 반대로 **벽시계**(Date.now)로 디스크에 남긴다. 앱을 재시작해도 유지돼야
 *     하기 때문이다. 밴 중에 재시작해서 즉시 재요청하면 단기 밴이 2~24시간 장기 밴으로 악화된다.
 *   · 한쪽이 막히면 **양쪽 다 멈춘다**. 소비자별 쿨다운은 금지 — 한쪽이 쉬는 동안 다른 쪽이
 *     계속 때려서 IP 밴만 깊어진다.
 *   · 속도는 **하락 전용**. 기준선(레벨 1) 아래로는 절대 가속하지 않는다. "차단 직전까지
 *     가속"은 스크래핑에서 명백한 결함이다.
 *
 * 우선순위: 'monitor'(품절 감시) > 'ingest'(소싱 수집). 수집은 남는 예산만 쓴다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── 페이싱 기본값 ──
// 요청 간 3~7초(평균 5초) → 분당 약 12회. 소비자를 몇 개로 늘려도 총량은 여기서 강제된다.
const MIN_MS = 3000;
const JITTER_MS = 4000;

// ── 쿨다운 (지수 백오프, 상한 있음) ──
const COOLDOWN_BASE_MS = 60_000;      // 일반 차단 60초부터
const COOLDOWN_BASE_429_MS = 90_000;  // 429 는 더 무겁게 90초부터
const COOLDOWN_CAP_MS = 180_000;      // 일반 상한 3분
const COOLDOWN_CAP_429_MS = 300_000;  // 429 상한 5분
const COOLDOWN_JITTER_MS = 15_000;

// ── 적응형 속도 레벨 (상품 간 대기. 게이트와 별개로 소비자가 쓴다) ──
// 기본 시작은 레벨 1 이다(0 아님). 레벨 0 은 회복해도 내려가지 않는 봉인된 값 — 존재 이유는
// "가장 빠른 구간이 어디였나"의 기록일 뿐이고, 운영 중엔 쓰지 않는다.
const DELAY_TABLE = {
  single: [[2000, 4000], [4000, 7000], [8000, 14000], [15000, 25000]],
  worker: [[1500, 3000], [3000, 5000], [6000, 10000], [12000, 20000]],
};
const MIN_LEVEL = 1;
const MAX_LEVEL = 3;
const RECOVER_STREAK = 8;          // 연속 성공 8회면 한 단계 회복
const RECOVER_STREAK_FAST = 5;     // 연속 5회 + 마지막 차단이 2분 이상 전이면 회복
const RECOVER_QUIET_MS = 120_000;

const PRIORITY = { monitor: 0, ingest: 1 };

const now = () => performance.now();
const rand = (n) => Math.random() * n;

class NaverGate {
  constructor() {
    this._nextAllowedAt = 0;      // 단조 시계 기준 다음 슬롯 시각
    this._waiters = [];           // { priority, seq, resolve, reject, signal }
    this._seq = 0;
    this._pumpTimer = null;

    this.cooldownUntil = 0;       // 벽시계(Date.now) 기준 — 영속 대상
    this.blockStreak = 0;
    this.level = MIN_LEVEL;
    this.successStreak = 0;
    this.lastBlockAt = 0;

    this.stats = { granted: 0, monitorGranted: 0, ingestGranted: 0, blocks: 0, blocks429: 0 };

    this._statePath = null;
    this._listeners = new Set();
    this._loaded = false;
  }

  /**
   * 영속 경로 지정 + 저장된 쿨다운 복원. main 의 setupServices 에서 1회 호출한다.
   * 호출하지 않아도 동작은 하지만, 그 경우 재시작으로 쿨다운이 리셋된다(= 밴 악화 위험).
   */
  init(userDataDir) {
    this._statePath = join(userDataDir || tmpdir(), 'naver-gate.json');
    this._load();
    return this;
  }

  _load() {
    if (this._loaded) return;
    this._loaded = true;
    try {
      const s = JSON.parse(readFileSync(this._statePath, 'utf8'));
      // 벽시계 기준이라 재시작 후에도 남은 시간이 그대로 유효하다.
      if (Number.isFinite(s.cooldownUntil) && s.cooldownUntil > Date.now()) {
        this.cooldownUntil = s.cooldownUntil;
        this.blockStreak = Number(s.blockStreak) || 0;
      }
      // 레벨은 보수적으로만 복원한다 — 저장값이 기준선보다 빠르면 무시.
      const lv = Number(s.level);
      if (Number.isFinite(lv)) this.level = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, lv));
    } catch { /* 파일 없음/손상 → 기본값으로 시작 */ }
  }

  _save() {
    if (!this._statePath) return;
    try {
      writeFileSync(this._statePath, JSON.stringify({
        cooldownUntil: this.cooldownUntil,
        blockStreak: this.blockStreak,
        level: this.level,
        savedAt: Date.now(),
      }));
    } catch { /* 저장 실패가 페이싱을 막을 이유는 없다 */ }
  }

  // ── 구독 (UI 표시용) ──
  onChange(cb) { this._listeners.add(cb); return () => this._listeners.delete(cb); }
  _emit() { for (const cb of this._listeners) { try { cb(this.state()); } catch { /* ignore */ } } }

  state() {
    const cdLeft = Math.max(0, this.cooldownUntil - Date.now());
    return {
      cooldownMsLeft: cdLeft,
      cooling: cdLeft > 0,
      blockStreak: this.blockStreak,
      level: this.level,
      successStreak: this.successStreak,
      waiting: this._waiters.length,
      waitingMonitor: this._waiters.filter((w) => w.priority === PRIORITY.monitor).length,
      stats: { ...this.stats },
    };
  }

  /**
   * 슬롯 1개를 얻는다. 반환되면 "지금 네이버로 요청 1건 나가도 된다"는 뜻이다.
   *   priority: 'monitor' | 'ingest'
   *   opts.signal: AbortSignal — 대기 중 취소(창이 닫히거나 중단 눌렀을 때)
   * ★ 실제로 페이지를 여는 모든 경로가 이 함수를 통과해야 한다.
   *   (중복 스킵으로 페이지를 안 여는 경우는 통과 불필요 — 예산을 안 쓰므로)
   */
  acquire(priority = 'ingest', opts = {}) {
    this._load();
    const p = PRIORITY[priority] ?? PRIORITY.ingest;
    return new Promise((resolve, reject) => {
      const w = { priority: p, seq: this._seq++, resolve, reject, signal: opts.signal, kind: priority };
      if (w.signal?.aborted) return reject(new Error('aborted'));
      if (w.signal) {
        w.onAbort = () => {
          const i = this._waiters.indexOf(w);
          if (i >= 0) this._waiters.splice(i, 1);
          reject(new Error('aborted'));
          this._schedulePump();
        };
        w.signal.addEventListener('abort', w.onAbort, { once: true });
      }
      this._waiters.push(w);
      this._schedulePump();
    });
  }

  _schedulePump(delayMs = 0) {
    if (this._pumpTimer) clearTimeout(this._pumpTimer);
    // ★ unref 하지 않는다 — 이 타이머는 "대기 중인 acquire 를 깨우는" 유일한 수단이라,
    //   unref 하면 이벤트 루프가 비었다고 판단해 대기자를 영영 안 깨우고 끝나버린다.
    //   (실제로 그렇게 만들었다가 검증에서 unsettled promise 로 잡혔다)
    this._pumpTimer = setTimeout(() => { this._pumpTimer = null; this._pump(); }, Math.max(0, delayMs));
  }

  _pump() {
    if (!this._waiters.length) return;

    // ① 쿨다운이 걸려 있으면 우선순위와 무관하게 전원 대기. 한쪽이 막히면 양쪽 다 멈춘다.
    const cdLeft = this.cooldownUntil - Date.now();
    if (cdLeft > 0) return this._schedulePump(Math.min(cdLeft, 5000));

    // ② 다음 슬롯 시각까지 대기
    const t = now();
    if (t < this._nextAllowedAt) return this._schedulePump(this._nextAllowedAt - t);

    // ③ 우선순위 → 도착순으로 1명만 통과시킨다(capacity 1).
    this._waiters.sort((a, b) => (a.priority - b.priority) || (a.seq - b.seq));
    const w = this._waiters.shift();
    if (w.signal && w.onAbort) { try { w.signal.removeEventListener('abort', w.onAbort); } catch { /* ignore */ } }

    // 슬롯 예약은 **동기적으로** 끝낸다 — 예약과 소비 사이에 await 가 끼면 동시에 통과한다.
    this._nextAllowedAt = Math.max(t, this._nextAllowedAt) + MIN_MS + rand(JITTER_MS);

    this.stats.granted++;
    if (w.kind === 'monitor') this.stats.monitorGranted++; else this.stats.ingestGranted++;
    w.resolve();

    if (this._waiters.length) this._schedulePump(this._nextAllowedAt - now());
    this._emit();
  }

  /**
   * 차단당했다 — 전 소비자 정지. is429 면 더 길게 식힌다.
   * 반환값: 이번에 적용된 쿨다운(ms). 로그용.
   */
  triggerCooldown(is429 = false) {
    this._load();
    this.blockStreak++;
    this.stats.blocks++;
    if (is429) this.stats.blocks429++;
    const base = is429 ? COOLDOWN_BASE_429_MS : COOLDOWN_BASE_MS;
    const cap = is429 ? COOLDOWN_CAP_429_MS : COOLDOWN_CAP_MS;
    const ms = Math.min(base * 2 ** (this.blockStreak - 1), cap) + rand(COOLDOWN_JITTER_MS);
    // max 를 쓰는 이유: 이미 더 긴 쿨다운이 걸려 있으면 짧은 값으로 덮어써 풀어주면 안 된다.
    this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + ms);
    this.recordBlock();
    this._save();
    this._emit();
    this._schedulePump();
    return Math.round(ms);
  }

  /** 남은 쿨다운을 소화한다. 소비자가 재시도 루프 앞에서 호출. */
  async waitCooldown(signal) {
    for (;;) {
      const left = this.cooldownUntil - Date.now();
      if (left <= 0) return;
      if (signal?.aborted) throw new Error('aborted');
      // 여기도 unref 금지 — 이 타이머가 await 를 푸는 유일한 수단이다.
      await new Promise((r) => setTimeout(r, Math.min(left, 5000)));
    }
  }

  // ── 적응형 속도 (하락 전용) ──
  recordBlock() {
    this.level = Math.min(MAX_LEVEL, this.level + 2);
    this.successStreak = 0;
    this.lastBlockAt = Date.now();
    this._save();
  }

  recordFailure() {
    // 차단이 아닌 일반 실패(타임아웃 등)는 한 단계만, 그것도 2 까지만 올린다.
    this.level = Math.min(2, this.level + 1);
    this.successStreak = 0;
  }

  recordSuccess() {
    this.successStreak++;
    this.blockStreak = 0;
    const quiet = Date.now() - this.lastBlockAt > RECOVER_QUIET_MS;
    const canRecover = this.successStreak >= RECOVER_STREAK
      || (this.successStreak >= RECOVER_STREAK_FAST && quiet);
    if (canRecover && this.level > MIN_LEVEL) {
      this.level--;
      this.successStreak = 0;
      this._save();
      this._emit();
    }
  }

  /** 상품 간 대기(ms). mode: 'single'(창 1개) | 'worker'(여러 창) */
  getDelay(mode = 'worker') {
    const [min, max] = (DELAY_TABLE[mode] || DELAY_TABLE.worker)[this.level] || [4000, 7000];
    return Math.round(min + rand(max - min));
  }

  /**
   * 지금 띄워도 되는 창 개수. 관리자가 4로 설정해뒀어도 네이버가 싫어하면 알아서 줄인다.
   *   레벨 1(기준선) = 설정값 그대로, 레벨이 오를수록 1개씩 감축.
   */
  suggestedWindows(configured) {
    const n = Math.max(1, Number(configured) || 1);
    return Math.max(1, n - (this.level - MIN_LEVEL));
  }
}

export const naverGate = new NaverGate();
export default naverGate;
