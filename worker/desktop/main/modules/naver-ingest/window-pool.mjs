/**
 * 동시 창 풀 — 관리자가 정한 개수만큼 수집 창을 띄우고 작업을 배분한다.
 * ---------------------------------------------------------------------------
 * 창을 늘리면 왜 빨라지나 (그리고 어디까지만 빨라지나):
 *   전역 게이트는 "네이버로 나가는 진입 횟수"(분당 12회)를 센다. 그런데 상품 1건 처리시간
 *   30~90초의 대부분은 요청이 아니라 **페이지 안에서의 대기**다(상세 이미지 lazy-load 스크롤,
 *   리뷰 페이지 순회, 렌더 대기). 그 시간에 게이트는 놀고 있다.
 *     창 1개 → 대기 시간만큼 슬롯이 비어 시간당 60건 수준
 *     창 3개 → 대기를 겹쳐 써서 게이트 상한을 채움
 *   즉 창은 **비어 있는 슬롯을 채우는 장치**지 게이트를 넘는 장치가 아니다. 20개로 늘려도
 *   총 요청량은 그대로고 늘어나는 건 RAM 뿐이다. 실효 구간은 2~4개.
 *
 * 배분 규칙:
 *   · 목록 수집은 **창 0번 하나로 고정**. 한 창이 처음부터 끝까지 스크롤해야 목록이 이어진다.
 *     여러 창이 같은 목록을 스크롤하면 중복만 쌓이고 418 위험만 커진다.
 *   · 상세 추출은 나머지 창이 병렬 처리. 목록 작업이 없으면 0번도 상세로 돌린다.
 *   · 차단이 감지되면(게이트 레벨 상승) 창 수를 자동으로 줄이고, 회복되면 설정값까지 되돌린다.
 */
import { ScrapeWindow } from './browser.mjs';
import naverGate from '../../naver-gate.mjs';

export const WINDOW_MIN = 1;
export const WINDOW_MAX = 6;
export const WINDOW_DEFAULT = 3;
/** 창을 동시에 띄우면 그 자체가 봇 시그널이다 — 기동 간격(가이드 [11-E]). */
const START_STAGGER_MS = 3000;

const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t?.unref) t.unref(); });

export class WindowPool {
  constructor({ onLog = () => {}, onStatus = () => {} } = {}) {
    this.onLog = onLog;
    this.onStatus = onStatus;
    this.configured = WINDOW_DEFAULT;
    this.slots = [];        // { sw, busy, role, index }
    this.running = false;
    this._waiters = [];     // { role, resolve }
    this._statusTimer = null;
  }

  /** 관리자가 설정한 창 개수. 즉시 반영되며 실행 중에도 바꿀 수 있다. */
  setCount(n) {
    this.configured = Math.max(WINDOW_MIN, Math.min(WINDOW_MAX, Number(n) || WINDOW_DEFAULT));
    if (this.running) this._reconcile().catch(() => {});
    return this.configured;
  }

  /** 게이트가 권하는 실효 창 수 — 차단이 있었으면 설정값보다 작다. */
  get effectiveCount() { return naverGate.suggestedWindows(this.configured); }

  async start() {
    if (this.running) return;
    this.running = true;
    await this._reconcile();
    // 창 수를 주기적으로 재조정한다(차단 → 감축, 회복 → 복귀).
    this._statusTimer = setInterval(() => {
      if (!this.running) return;
      this._reconcile().catch(() => {});
      this.onStatus(this.status());
    }, 10_000);
    if (this._statusTimer?.unref) this._statusTimer.unref();
  }

  async stop() {
    this.running = false;
    if (this._statusTimer) { clearInterval(this._statusTimer); this._statusTimer = null; }
    for (const s of this.slots) s.sw.close();
    this.slots = [];
    // 대기 중인 요청은 깨워서 정리한다(멈춤 상태로 매달려 있지 않게).
    for (const w of this._waiters.splice(0)) w.resolve(null);
    this.onStatus(this.status());
  }

  /** 설정/게이트 상태에 맞춰 창을 늘리거나 줄인다. */
  async _reconcile() {
    const target = this.effectiveCount;

    // 줄이기 — 놀고 있는 창부터 닫는다. 작업 중인 창은 끝난 뒤 다음 주기에 정리된다.
    while (this.slots.length > target) {
      const idx = [...this.slots].reverse().find((s) => !s.busy)?.index;
      if (idx === undefined) break;
      const i = this.slots.findIndex((s) => s.index === idx);
      this.slots[i].sw.close();
      this.slots.splice(i, 1);
      this.onLog(`창 ${idx + 1} 정리 — 차단 신호로 동시 창을 ${this.slots.length}개로 줄였습니다`);
    }

    // 늘리기 — 3초 간격으로 하나씩. 창마다 워밍업을 거친다.
    while (this.running && this.slots.length < target) {
      const index = this._nextFreeIndex();
      const sw = new ScrapeWindow(index);
      const slot = { sw, busy: false, role: null, index };
      this.slots.push(slot);
      this.onLog(`창 ${index + 1} 준비 중…`);
      const ok = await sw.warmUp();
      if (!ok) {
        this.onLog(`창 ${index + 1} 워밍업 실패 — 잠시 뒤 다시 시도합니다`);
        sw.close();
        this.slots = this.slots.filter((s) => s !== slot);
        break;
      }
      this._release(slot);   // 준비 끝 → 대기 중인 작업에 바로 넘겨준다
      if (this.slots.length < target) await sleep(START_STAGGER_MS);
    }
    this.onStatus(this.status());
  }

  _nextFreeIndex() {
    const used = new Set(this.slots.map((s) => s.index));
    for (let i = 0; i < WINDOW_MAX; i++) if (!used.has(i)) return i;
    return this.slots.length;
  }

  /**
   * 작업할 창 하나를 빌린다. 반드시 finally 에서 release 되도록 withWindow 를 쓸 것.
   *   role: 'list' → 0번 창 전용 / 'detail' → 나머지(없으면 0번도 허용)
   */
  _tryTake(role) {
    if (role === 'list') return this.slots.find((s) => !s.busy && s.index === 0) || null;
    const others = this.slots.filter((s) => !s.busy && s.index !== 0);
    if (others.length) return others[0];
    // 목록 작업이 돌고 있지 않으면 0번도 상세에 쓴다(창 1개 설정일 때 필수).
    const listBusy = this.slots.some((s) => s.busy && s.role === 'list');
    if (!listBusy) return this.slots.find((s) => !s.busy && s.index === 0) || null;
    return null;
  }

  _release(slot) {
    slot.busy = false;
    slot.role = null;
    // 대기열에서 이 창을 쓸 수 있는 첫 요청에 넘긴다.
    for (let i = 0; i < this._waiters.length; i++) {
      const w = this._waiters[i];
      const s = this._tryTake(w.role);
      if (s) {
        this._waiters.splice(i, 1);
        s.busy = true;
        s.role = w.role;
        w.resolve(s);
        return;
      }
    }
  }

  _acquire(role) {
    const s = this._tryTake(role);
    if (s) { s.busy = true; s.role = role; return Promise.resolve(s); }
    return new Promise((resolve) => this._waiters.push({ role, resolve }));
  }

  /** 창 하나를 빌려 fn(sw) 을 실행한다. 예외가 나도 창은 반드시 반납된다. */
  async withWindow(role, fn) {
    const slot = await this._acquire(role);
    if (!slot) return null;          // stop() 으로 깨어난 경우
    try {
      return await fn(slot.sw, slot);
    } finally {
      // 창이 죽었으면 반납 대신 정리한다(다음 _reconcile 이 새로 띄운다).
      if (!slot.sw.wc) {
        this.slots = this.slots.filter((s) => s !== slot);
        this.onStatus(this.status());
      } else {
        this._release(slot);
      }
    }
  }

  status() {
    return {
      running: this.running,
      configured: this.configured,
      effective: this.effectiveCount,
      active: this.slots.length,
      waiting: this._waiters.length,
      gate: naverGate.state(),
      windows: this.slots.map((s) => ({
        index: s.index,
        no: s.index + 1,
        busy: s.busy,
        role: s.role,
        status: s.sw.status,
        detail: s.sw.detail,
        url: s.sw.url,
      })),
    };
  }
}
