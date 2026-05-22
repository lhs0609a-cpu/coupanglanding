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
 * 윙 광고화면 셀렉터/URL 설정 — 실제 DOM 확보 후 '__TODO__' 를 채운다.
 * 값이 채워지면 collectMetrics 는 코드 수정 없이 동작한다(설정 주도).
 */
export const WING = {
  loginUrl: 'https://wing.coupang.com/',
  reportUrl: '__TODO__',            // 광고 성과 리포트 페이지 URL
  loggedInSelector: '__TODO__',     // 로그인 상태에서만 존재하는 요소(예: 헤더 셀러명)
  metricsTable: {
    rowSelector: '__TODO__',        // 캠페인/키워드 한 행(tr 등)
    campaignIdAttr: '__TODO__',     // 행에서 캠페인 식별자를 담은 속성(data-campaign-id 등)
    cell: {                         // 행 내부 상대 셀렉터 — textContent 를 숫자 파싱
      campaignName: '__TODO__',
      keyword: null,                // 키워드 단위가 아니면 null 유지
      impressions: '__TODO__',
      clicks: '__TODO__',
      spend: '__TODO__',
      sales: '__TODO__',
      conversions: '__TODO__',
      currentBid: '__TODO__',
    },
  },
  bidEdit: {
    bidInputSelector: '__TODO__',
    saveButtonSelector: '__TODO__',
  },
  // B-1: 캠페인 ON/OFF·삭제 (행 내 또는 전역 셀렉터)
  campaignActions: {
    offToggleSelector: '__TODO__',     // 캠페인을 끄는 토글/버튼
    deleteButtonSelector: '__TODO__',  // 삭제 버튼
    confirmButtonSelector: '__TODO__', // 삭제 확인 모달의 확인 버튼
  },
  // B-2: 캠페인 생성/상품 추가 흐름 — 다단계 UX라 DOM 확보 후 채움
  campaignCreate: {
    url: '__TODO__',
    flow: '__TODO__',
  },
};

function assertConfigured(obj, label) {
  if (JSON.stringify(obj).includes('__TODO__')) {
    throw new Error(`[ad-automation] ${label}: 윙 셀렉터 미설정(__TODO__) — 실제 화면 DOM 확보 후 WING 설정을 채우세요.`);
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
 * 윙 로그인 세션 확인. 미로그인이면 로그인 페이지를 띄우고 사용자가 직접 로그인할
 * 때까지 대기(비밀번호 저장 안 함 — 쿠키 세션 유지). 로그인되면 true.
 * @param {import('electron').BrowserWindow} win
 */
export async function ensureWingSession(win, { timeoutMs = 180000 } = {}) {
  assertConfigured(WING.loggedInSelector, 'ensureWingSession(loggedInSelector)');
  await win.loadURL(WING.reportUrl !== '__TODO__' ? WING.reportUrl : WING.loginUrl);
  try { await waitFor(win, WING.loggedInSelector, timeoutMs); return true; }
  catch { return false; }
}

/**
 * 윙 광고 리포트에서 캠페인/키워드 성과를 읽어온다. (설정 주도 추출)
 * ⚠️ 기간(lookbackDays) 적용용 날짜선택 UI 조작은 DOM 확보 후 추가 필요.
 * @param {import('electron').BrowserWindow} win
 * @param {{ lookbackDays?: number }} [_opts]
 * @returns {Promise<Array<{campaignId:string,campaignName:string,keyword:string|null,currentBid:number}&Metrics>>}
 */
export async function collectMetrics(win, _opts = {}) {
  assertConfigured(WING.reportUrl, 'collectMetrics(reportUrl)');
  assertConfigured(WING.metricsTable, 'collectMetrics(metricsTable)');
  const cfg = WING.metricsTable;
  await win.loadURL(WING.reportUrl);
  await waitFor(win, cfg.rowSelector);
  return win.webContents.executeJavaScript(`(() => {
    const parseNum = (t) => { if (t==null) return 0; const n=String(t).replace(/[^0-9.\\-]/g,''); return n===''?0:Number(n); };
    const out = [];
    document.querySelectorAll(${JSON.stringify(cfg.rowSelector)}).forEach((row) => {
      const txt = (sel) => sel ? (row.querySelector(sel)?.textContent ?? '') : '';
      out.push({
        campaignId: ${cfg.campaignIdAttr !== '__TODO__' ? `row.getAttribute(${JSON.stringify(cfg.campaignIdAttr)}) || ''` : `''`},
        campaignName: txt(${JSON.stringify(cfg.cell.campaignName)}).trim(),
        keyword: ${cfg.cell.keyword ? `(txt(${JSON.stringify(cfg.cell.keyword)}).trim() || null)` : 'null'},
        impressions: parseNum(txt(${JSON.stringify(cfg.cell.impressions)})),
        clicks: parseNum(txt(${JSON.stringify(cfg.cell.clicks)})),
        spend: parseNum(txt(${JSON.stringify(cfg.cell.spend)})),
        sales: parseNum(txt(${JSON.stringify(cfg.cell.sales)})),
        conversions: parseNum(txt(${JSON.stringify(cfg.cell.conversions)})),
        currentBid: parseNum(txt(${JSON.stringify(cfg.cell.currentBid)})),
      });
    });
    return out;
  })()`);
}

/**
 * 윙 광고화면에서 특정 캠페인의 입찰가를 변경한다. (설정 주도)
 * 행 탐색(campaignIdAttr) → 입찰 입력칸 값 교체(React 제어 input 대응) → 저장 클릭.
 * ⚠️ 저장 후 확인 모달/토스트 처리와 증빙 스크린샷은 윙 실제 UX 확인 후 보강 필요.
 * @param {import('electron').BrowserWindow} win
 * @param {{campaignId:string, keyword:string|null, newBid:number}} target
 * @returns {Promise<{ok:boolean, screenshotUrl?:string, error?:string}>}
 */
export async function applyBidChange(win, { campaignId, newBid }) {
  assertConfigured(WING.bidEdit, 'applyBidChange(bidEdit)');
  assertConfigured(WING.metricsTable.rowSelector, 'applyBidChange(rowSelector)');
  assertConfigured(WING.metricsTable.campaignIdAttr, 'applyBidChange(campaignIdAttr)');
  const cfg = WING;
  return win.webContents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll(${JSON.stringify(cfg.metricsTable.rowSelector)})];
    const row = rows.find(r => (r.getAttribute(${JSON.stringify(cfg.metricsTable.campaignIdAttr)}) || '') === ${JSON.stringify(String(campaignId))});
    if (!row) return { ok:false, error:'행을 찾지 못함: ' + ${JSON.stringify(String(campaignId))} };
    const input = row.querySelector(${JSON.stringify(cfg.bidEdit.bidInputSelector)});
    if (!input) return { ok:false, error:'입찰 입력칸 없음' };
    // React 제어 input 대응: prototype native setter 로 값 설정 후 이벤트 발생
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, String(${Number(newBid)}));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const save = row.querySelector(${JSON.stringify(cfg.bidEdit.saveButtonSelector)})
      || document.querySelector(${JSON.stringify(cfg.bidEdit.saveButtonSelector)});
    if (!save) return { ok:false, error:'저장 버튼 없음' };
    save.click();
    return { ok:true };
  })()`);
}

/** 행 탐색 후 OFF 토글 클릭 (설정 주도). @returns {Promise<{ok,error?}>} */
export async function toggleCampaign(win, { campaignId, on = false }) {
  assertConfigured(WING.campaignActions.offToggleSelector, 'toggleCampaign(offToggleSelector)');
  assertConfigured(WING.metricsTable.rowSelector, 'toggleCampaign(rowSelector)');
  const cfg = WING;
  return win.webContents.executeJavaScript(`(() => {
    const row = [...document.querySelectorAll(${JSON.stringify(cfg.metricsTable.rowSelector)})]
      .find(r => (r.getAttribute(${JSON.stringify(cfg.metricsTable.campaignIdAttr)}) || '') === ${JSON.stringify(String(campaignId))});
    if (!row) return { ok:false, error:'행을 찾지 못함: ' + ${JSON.stringify(String(campaignId))} };
    const t = row.querySelector(${JSON.stringify(cfg.campaignActions.offToggleSelector)});
    if (!t) return { ok:false, error:'OFF 토글 없음' };
    // TODO: 현재 ON/OFF 상태 확인 후 목표 상태(${on ? 'ON' : 'OFF'})와 다를 때만 클릭 — DOM 확보 후
    t.click();
    return { ok:true };
  })()`);
}

/** 행 탐색 → 삭제 버튼 → 확인 모달 (설정 주도). 되돌릴 수 없으니 승인 모드 권장. */
export async function deleteCampaign(win, { campaignId }) {
  assertConfigured(WING.campaignActions, 'deleteCampaign(campaignActions)');
  assertConfigured(WING.metricsTable.rowSelector, 'deleteCampaign(rowSelector)');
  const cfg = WING;
  const r1 = await win.webContents.executeJavaScript(`(() => {
    const row = [...document.querySelectorAll(${JSON.stringify(cfg.metricsTable.rowSelector)})]
      .find(r => (r.getAttribute(${JSON.stringify(cfg.metricsTable.campaignIdAttr)}) || '') === ${JSON.stringify(String(campaignId))});
    if (!row) return { ok:false, error:'행을 찾지 못함' };
    const del = row.querySelector(${JSON.stringify(cfg.campaignActions.deleteButtonSelector)});
    if (!del) return { ok:false, error:'삭제 버튼 없음' };
    del.click();
    return { ok:true };
  })()`);
  if (!r1.ok) return r1;
  // 확인 모달 대기 후 확인 클릭
  try {
    await waitFor(win, WING.campaignActions.confirmButtonSelector, 8000);
    return win.webContents.executeJavaScript(`(() => {
      const c = document.querySelector(${JSON.stringify(cfg.campaignActions.confirmButtonSelector)});
      if (!c) return { ok:false, error:'삭제 확인 버튼 없음' };
      c.click();
      return { ok:true };
    })()`);
  } catch { return { ok:false, error:'삭제 확인 모달이 안 떴습니다' }; }
}

/**
 * 상품을 광고 캠페인에 자동 등록. 캠페인 생성/상품추가는 다단계 UX라
 * 실제 흐름은 윙 화면 확보 후 P-B에서 구현. (입찰·일예산은 인자로 받음)
 * @returns {Promise<{ok:boolean, campaignId?:string, error?:string}>}
 */
export async function registerItem(_win, _opts) {
  assertConfigured(WING.campaignCreate, 'registerItem(campaignCreate)');
  throw new Error('[ad-automation] registerItem: 윙 캠페인 생성/상품추가 흐름 미구현 — 화면 확보 후 구현');
}
