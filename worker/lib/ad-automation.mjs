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

/**
 * 캠페인 단위 액션(OFF) 판정 — 순수 함수.
 * "광고비 N원 소진 & 판매(전환매출)가 기준 이하" → OFF.
 * @param {Object} o
 * @param {Metrics & {spend:number, sales:number}} o.metrics  룩백 합계
 * @param {{autoOffEnabled:boolean, offSpendThreshold:number, offMaxSales:number}} o.rule
 * @returns {{action:'off', reason:string}|null}
 */
export function evaluateCampaignAction({ metrics, rule }) {
  if (!rule.autoOffEnabled) return null;
  const spend = metrics.spend ?? 0;
  const sales = metrics.sales ?? 0;
  if (spend >= rule.offSpendThreshold && sales <= rule.offMaxSales) {
    return {
      action: 'off',
      reason: `광고비 ${Math.round(spend).toLocaleString()}원 소진 & 판매 ${Math.round(sales).toLocaleString()}원 ≤ 기준 ${Number(rule.offMaxSales).toLocaleString()}원 → 캠페인 OFF`,
    };
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// 아래는 윙 실제 DOM이 필요한 부분 — P2/P3에서 구현 (지금은 명시적 스텁)
// ───────────────────────────────────────────────────────────────────────────

/**
 * 쿠팡 애즈 광고관리 화면 셀렉터 — 실제 캡처(2026-05) 기준으로 채움.
 * react-table(rt-*) 구조 + data-bigfoot-component 안정 앵커 사용.
 * 캠페인 식별자(id)가 DOM에 없어 "캠페인 이름"(.dashboard-title)으로 행을 찾는다.
 */
export const WING = {
  loginUrl: 'https://wing.coupang.com/',
  adsUrl: 'https://advertising.coupang.com/marketing/dashboard/sales',  // 광고 관리(매출 성장) — "모든 캠페인" 표가 있는 화면
  loggedInSelector: '#cap-sidebar',                        // 로그인 상태에서만 존재하는 좌측 사이드바
  table: {
    panel: '[data-bigfoot-component="campaigns_table"]',
    headerCell: '.rt-thead .rt-th',                        // 라벨로 컬럼 index 매핑
    row: '.rt-tbody .rt-tr',
    name: '[data-bigfoot-component="campaign_name"] .dashboard-title',
    cell: '.rt-td',
    onSwitch: 'button[role="switch"]',                     // aria-checked 로 ON/OFF 상태
    // 헤더 라벨(부분일치) → 우리 지표
    labels: {
      spend: ['집행 광고비'],
      sales: ['광고 전환매출', '전환매출'],
      conversions: ['판매수', '전환수'],
      clicks: ['클릭수', '클릭'],
      impressions: ['노출'],
      budget: ['예산'],
      roas: ['광고수익률'],
    },
  },
  // 예산/입찰 수정 — 캠페인 레벨은 "예산". 수정 팝업 DOM 추가 캡처 필요.
  budgetEdit: { __todo: '__TODO__' },
  // 삭제 — 행 메뉴/버튼 DOM 추가 캡처 필요.
  deleteAction: { __todo: '__TODO__' },
  // 캠페인 생성/상품추가 — 다단계 UX, 추가 캡처 필요.
  campaignCreate: { __todo: '__TODO__' },
};

function assertConfigured(obj, label) {
  if (JSON.stringify(obj).includes('__TODO__')) {
    throw new Error(`[ad-automation] ${label}: 윙 셀렉터 미설정(__TODO__) — 해당 화면 DOM 캡처 후 WING 설정을 채우세요.`);
  }
}

/** 페이지 안에서 selector 가 나타날 때까지 폴링 대기 */
function waitFor(win, selector, timeoutMs = 15000) {
  return win.webContents.executeJavaScript(`new Promise((res, rej) => {
    const t0 = Date.now();
    const id = setInterval(() => {
      if (document.querySelector(${JSON.stringify(selector)})) { clearInterval(id); res(true); }
      else if (Date.now() - t0 > ${timeoutMs}) { clearInterval(id); rej(new Error('timeout: ' + ${JSON.stringify(selector)})); }
    }, 300);
  })`);
}

/**
 * 윙 로그인 세션 확인. adsUrl 이 설정돼 있으면 그 화면으로 이동, 아니면 현재 페이지에서
 * 사이드바(#cap-sidebar) 존재로 판단. 미로그인이면 로그인 페이지를 띄우고 대기.
 * @param {import('electron').BrowserWindow} win
 */
export async function ensureWingSession(win, { timeoutMs = 180000 } = {}) {
  if (WING.adsUrl && !WING.adsUrl.includes('__TODO__')) await win.loadURL(WING.adsUrl);
  try { await waitFor(win, WING.loggedInSelector, 8000); return true; }
  catch { /* 미로그인 → 로그인 페이지 띄우고 대기 */ }
  await win.loadURL(WING.loginUrl);
  try { await waitFor(win, WING.loggedInSelector, timeoutMs); return true; }
  catch { return false; }
}

/**
 * 쿠팡 애즈 "모든 캠페인" 표에서 캠페인별 성과/상태를 읽는다.
 * 헤더 라벨로 컬럼 index 를 동적 매핑(컬럼 순서/구성 바뀌어도 견고).
 * 캠페인 식별자는 이름(name)을 사용(DOM에 id 없음).
 * @param {import('electron').BrowserWindow} win
 * @returns {Promise<Array<{campaignId:string,campaignName:string,keyword:null,on:boolean|null,budget:number,currentBid:number}&Metrics>>}
 */
export async function collectMetrics(win, _opts = {}) {
  if (WING.adsUrl && !WING.adsUrl.includes('__TODO__')) await win.loadURL(WING.adsUrl);
  await waitFor(win, WING.table.row, 20000);
  const t = WING.table;
  return win.webContents.executeJavaScript(`(() => {
    const parseNum = (s) => { if (s==null) return 0; const n=String(s).replace(/[^0-9.\\-]/g,''); return n===''?0:Number(n); };
    const norm = (s) => (s||'').replace(/\\s+/g,' ').trim();
    const panel = document.querySelector(${JSON.stringify(t.panel)}) || document;
    const heads = [...panel.querySelectorAll(${JSON.stringify(t.headerCell)})].map(th => norm(th.textContent));
    const colOf = (cands) => { for (const c of cands) { const i = heads.findIndex(h => h.includes(c)); if (i>=0) return i; } return -1; };
    const idx = {
      spend: colOf(${JSON.stringify(t.labels.spend)}),
      sales: colOf(${JSON.stringify(t.labels.sales)}),
      conversions: colOf(${JSON.stringify(t.labels.conversions)}),
      clicks: colOf(${JSON.stringify(t.labels.clicks)}),
      impressions: colOf(${JSON.stringify(t.labels.impressions)}),
      budget: colOf(${JSON.stringify(t.labels.budget)}),
    };
    const out = [];
    panel.querySelectorAll(${JSON.stringify(t.row)}).forEach((row) => {
      const name = norm(row.querySelector(${JSON.stringify(t.name)})?.textContent);
      if (!name) return;
      const sw = row.querySelector(${JSON.stringify(t.onSwitch)});
      const on = sw ? sw.getAttribute('aria-checked') === 'true' : null;
      const cells = [...row.querySelectorAll(${JSON.stringify(t.cell)})];
      const val = (i) => (i >= 0 && cells[i]) ? parseNum(cells[i].textContent) : 0;
      const budget = val(idx.budget);
      out.push({
        campaignId: name, campaignName: name, keyword: null, on,
        impressions: val(idx.impressions), clicks: val(idx.clicks),
        spend: val(idx.spend), sales: val(idx.sales), conversions: val(idx.conversions),
        budget, currentBid: budget,
      });
    });
    return out;
  })()`);
}

/**
 * 캠페인 ON/OFF — 이름으로 행을 찾아 ant-switch 토글. 현재 상태가 목표와 다를 때만 클릭.
 * @param {import('electron').BrowserWindow} win
 * @param {{campaignId:string, on?:boolean}} t  campaignId = 캠페인 이름
 */
export async function toggleCampaign(win, { campaignId, on = false }) {
  const cfg = WING.table;
  return win.webContents.executeJavaScript(`(() => {
    const norm = (s) => (s||'').replace(/\\s+/g,' ').trim();
    const panel = document.querySelector(${JSON.stringify(cfg.panel)}) || document;
    const row = [...panel.querySelectorAll(${JSON.stringify(cfg.row)})]
      .find(r => norm(r.querySelector(${JSON.stringify(cfg.name)})?.textContent) === ${JSON.stringify(String(campaignId))});
    if (!row) return { ok:false, error:'행을 찾지 못함: ' + ${JSON.stringify(String(campaignId))} };
    const sw = row.querySelector(${JSON.stringify(cfg.onSwitch)});
    if (!sw) return { ok:false, error:'ON/OFF 토글 없음' };
    const checked = sw.getAttribute('aria-checked') === 'true';
    if (checked === ${on ? 'true' : 'false'}) return { ok:true, noop:true };
    sw.click();
    return { ok:true };
  })()`);
}

/**
 * 예산/입찰 변경 — 캠페인 레벨은 "예산" 수정. 수정 팝업 DOM 추가 캡처 필요.
 * (키워드 단위 입찰은 별도 화면)
 */
export async function applyBidChange(_win, _t) {
  assertConfigured(WING.budgetEdit, 'applyBidChange(budgetEdit)');
  throw new Error('[ad-automation] applyBidChange: 예산 수정 팝업 DOM 미확보 — "예산" 클릭 시 화면 캡처 필요');
}

/** 캠페인 삭제 — 삭제 버튼/메뉴 DOM 추가 캡처 필요. */
export async function deleteCampaign(_win, _t) {
  assertConfigured(WING.deleteAction, 'deleteCampaign(deleteAction)');
  throw new Error('[ad-automation] deleteCampaign: 삭제 버튼 DOM 미확보 — 캠페인 행 메뉴/삭제 화면 캡처 필요');
}

/** 상품 광고 자동 등록 — 캠페인 생성 흐름 DOM 추가 캡처 필요. */
export async function registerItem(_win, _opts) {
  assertConfigured(WING.campaignCreate, 'registerItem(campaignCreate)');
  throw new Error('[ad-automation] registerItem: "캠페인 추가" 생성 흐름 DOM 미확보 — 캡처 필요');
}
