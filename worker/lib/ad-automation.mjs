/**
 * 쿠팡 애즈 입찰 자동조정 — 워커 모듈 (P1 뼈대)
 * ---------------------------------------------------------------------------
 * 쿠팡은 광고 캠페인/입찰 관리 API가 없으므로, 이 모듈은 윙 광고화면을
 * Electron 내장 Chromium(BrowserWindow)으로 직접 조작한다.
 *
 *   evaluateBid()    — 순수 함수. 성과+규칙 → 입찰 조정안 계산 (지금 완성, 테스트 가능)
 *   collectMetrics() — 윙 광고 리포트 화면 읽기            (P2: 실제 DOM 셀렉터 필요)
 *   applyBidChange() — 윙 광고화면에서 입찰가 변경          (P3: 실제 DOM 셀렉터 필요)
 *   ensureWingSession() — 윙 로그인 세션 확인/대기          (P3)
 *
 * ⚠️ collectMetrics/applyBidChange는 윙 실제 화면 HTML을 확보해야 채울 수 있어
 *    지금은 명시적으로 throw 하는 스텁이다. (P2/P3에서 구현)
 */

/**
 * @typedef {Object} BidRule
 * @property {number} targetRoas            목표 ROAS(%) — 300 = 3배
 * @property {number} roasTolerancePct      목표 대비 ±여유(%) 안이면 유지
 * @property {number} minBid                입찰가 하한(원)
 * @property {number} maxBid                입찰가 상한(원)
 * @property {number} stepPct               1회 조정 폭(%)
 * @property {number} dailyMaxChangePct     하루 누적 변동 상한(%)
 * @property {boolean} pauseOnZeroConv
 * @property {number} zeroConvMinClicks
 * @property {number} zeroConvMinSpend
 *
 * @typedef {Object} Metrics
 * @property {number} clicks
 * @property {number} spend          광고비(원)
 * @property {number} sales          전환매출(원)
 * @property {number} conversions
 *
 * @typedef {Object} BidDecision
 * @property {'up'|'down'|'hold'|'pause'} action
 * @property {number} newBid         적용할 입찰가(원). hold면 currentBid와 동일
 * @property {number|null} measuredRoas
 * @property {string} reason         사람이 읽는 사유
 */

/** 값 범위 클램프 */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * 입찰 조정안 계산 — 순수 함수(부작용 없음).
 * 하루 누적 변동 상한(dailyMaxChangePct)을 넘지 않도록 step을 줄인다.
 *
 * @param {Object} o
 * @param {number} o.currentBid                현재 입찰가(원)
 * @param {Metrics} o.metrics                  룩백 기간 합계 성과
 * @param {BidRule} o.rule
 * @param {number} [o.changedTodayPct=0]        오늘 이미 변동된 누적 %(절대값)
 * @returns {BidDecision}
 */
export function evaluateBid({ currentBid, metrics, rule, changedTodayPct = 0 }) {
  const { spend, sales, clicks, conversions } = metrics;

  // 데이터 부족 → 유지 (성급한 조정 방지)
  if (!spend || spend <= 0) {
    return { action: 'hold', newBid: currentBid, measuredRoas: null, reason: '광고비 데이터 없음 — 유지' };
  }

  const roas = (sales / spend) * 100; // %
  const measuredRoas = Math.round(roas);

  // 전환 0인데 클릭·비용이 임계 이상이면 강하게 인하/중단
  if (rule.pauseOnZeroConv && conversions === 0 &&
      clicks >= rule.zeroConvMinClicks && spend >= rule.zeroConvMinSpend) {
    const cut = clamp(Math.round(currentBid * (1 - rule.stepPct / 100)), rule.minBid, rule.maxBid);
    const atFloor = cut <= rule.minBid;
    return {
      action: atFloor ? 'pause' : 'down',
      newBid: cut,
      measuredRoas,
      reason: `전환 0 (클릭 ${clicks}, 광고비 ${spend.toLocaleString()}원) → ${atFloor ? '하한 도달, 중단 권장' : `입찰 -${rule.stepPct}%`}`,
    };
  }

  const hi = rule.targetRoas * (1 + rule.roasTolerancePct / 100);
  const lo = rule.targetRoas * (1 - rule.roasTolerancePct / 100);

  // 목표 근처면 유지
  if (roas <= hi && roas >= lo) {
    return { action: 'hold', newBid: currentBid, measuredRoas, reason: `ROAS ${measuredRoas}% ≈ 목표 ${rule.targetRoas}% (±${rule.roasTolerancePct}%) — 유지` };
  }

  // 오늘 남은 변동 여력으로 step 제한
  const remaining = Math.max(0, rule.dailyMaxChangePct - changedTodayPct);
  const effStep = Math.min(rule.stepPct, remaining);
  if (effStep <= 0) {
    return { action: 'hold', newBid: currentBid, measuredRoas, reason: `일일 변동 상한(${rule.dailyMaxChangePct}%) 도달 — 내일까지 유지` };
  }

  if (roas > hi) {
    // 효율 좋음 → 입찰 ↑ (노출 확대)
    const up = clamp(Math.round(currentBid * (1 + effStep / 100)), rule.minBid, rule.maxBid);
    if (up === currentBid) {
      return { action: 'hold', newBid: currentBid, measuredRoas, reason: `ROAS ${measuredRoas}% 높지만 상한(${rule.maxBid}원) 도달 — 유지` };
    }
    return { action: 'up', newBid: up, measuredRoas, reason: `ROAS ${measuredRoas}% > 목표 ${rule.targetRoas}% → 입찰 +${effStep}% (${currentBid}→${up}원)` };
  }

  // roas < lo → 효율 나쁨 → 입찰 ↓
  const down = clamp(Math.round(currentBid * (1 - effStep / 100)), rule.minBid, rule.maxBid);
  if (down === currentBid) {
    return { action: 'hold', newBid: currentBid, measuredRoas, reason: `ROAS ${measuredRoas}% 낮지만 하한(${rule.minBid}원) 도달 — 유지` };
  }
  return { action: 'down', newBid: down, measuredRoas, reason: `ROAS ${measuredRoas}% < 목표 ${rule.targetRoas}% → 입찰 -${effStep}% (${currentBid}→${down}원)` };
}

// ───────────────────────────────────────────────────────────────────────────
// 아래는 윙 실제 DOM이 필요한 부분 — P2/P3에서 구현 (지금은 명시적 스텁)
// ───────────────────────────────────────────────────────────────────────────

const NOT_IMPL = (fn) =>
  new Error(`[ad-automation] ${fn}() 미구현 — 윙 광고화면 DOM 확보 후 P2/P3에서 구현 예정`);

/**
 * 윙 광고화면이 로그인된 세션인지 확인. 미로그인이면 로그인 창을 띄우고 대기.
 * 비밀번호는 저장하지 않는다(사용자가 직접 1회 로그인 → 쿠키 세션 유지).
 * @param {import('electron').BrowserWindow} _win
 * @returns {Promise<boolean>}
 */
export async function ensureWingSession(_win) {
  throw NOT_IMPL('ensureWingSession');
}

/**
 * 윙 광고 리포트에서 캠페인/키워드 성과를 읽어온다.
 * @param {import('electron').BrowserWindow} _win
 * @param {{ lookbackDays: number }} _opts
 * @returns {Promise<Array<{campaignId:string, campaignName:string, keyword:string|null, currentBid:number} & Metrics>>}
 */
export async function collectMetrics(_win, _opts) {
  throw NOT_IMPL('collectMetrics');
}

/**
 * 윙 광고화면에서 특정 캠페인/키워드의 입찰가를 변경한다.
 * @param {import('electron').BrowserWindow} _win
 * @param {{campaignId:string, keyword:string|null, newBid:number}} _target
 * @returns {Promise<{ok:boolean, screenshotPath?:string, error?:string}>}
 */
export async function applyBidChange(_win, _target) {
  throw NOT_IMPL('applyBidChange');
}
