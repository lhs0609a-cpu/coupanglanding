/**
 * 네이버 소싱 수집 서비스 — 수집 코어의 단일 소유자.
 * ---------------------------------------------------------------------------
 * 왜 모듈(module.mjs)에서 분리하나: 조종석이 둘이기 때문이다.
 *   ① 도우미 앱의 탭(IPC)
 *   ② 웹 대시보드(localhost pair-server 경유)  ← 관리자가 실제로 쓰는 쪽
 * 둘이 각자 창 풀을 만들면 같은 PC 에서 수집기가 두 벌 돌아 네이버 예산을 두 배로 태운다.
 * 그래서 풀·상태·로그를 여기 한 곳에 두고, 두 조종석은 이 함수들만 호출한다.
 *
 * 관리자 판정도 여기서 한다 — 도우미에 로그인된 계정의 role 이 기준이다.
 * (웹 화면을 숨기는 건 표시용일 뿐, 실제 차단은 이 게이트와 서버 API 가 한다)
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import naverGate from '../../naver-gate.mjs';
import { TabPool, WINDOW_MIN, WINDOW_MAX, WINDOW_DEFAULT } from './tab-pool.mjs';
import { ChromeTab } from './chrome-tab.mjs';
import { runOne } from './runner.mjs';
import {
  probePageJs, probeProductJs, collectCardsJs, keepLoginJs, naverAutoLoginJs, loginPageStateJs,
} from './inject.mjs';
import { loginState, clearLogin, persistLoginCookies } from '../../naver-session.mjs';
import { reviveSession, startKeepAlive, keepAliveState } from '../../naver-keepalive.mjs';
import {
  initCredentials, saveCredentials, clearCredentials, credentialInfo, hasCredentials,
  loadCredentials, encryptionAvailable,
} from '../../naver-credentials.mjs';
import { categoryUrl, listUrl } from './categories.mjs';
import {
  initCategories, listChildren, clearCategoryCache, knownMap, prewarmTree, prewarmInfo, exportTree,
  ROOT_CATEGORIES,
} from './categories.mjs';
import { collectCategoryViaChrome } from './collect-list-chrome.mjs';
import {
  initChromeSession, setAutoLoginHandler, ensureChromeLogin, ensureChromeBrowser,
  isChromeAvailable, closeChrome,
} from './chrome-session.mjs';
import { extractOne, ensureRoot, extractDetailJs, writeProductFolder } from './detail-extract.mjs';
import { isDetailExtractable } from './store-type.mjs';

/**
 * 상품이 아닌 배너 카드의 제목 — 웹 서버(api/.../products/route.ts)와 같은 목록이다.
 * 부분일치로 거르면 '전단행사 특가 사과 5kg' 같은 진짜 상품까지 날아간다 → **전체 일치만**.
 */
const BANNER_TITLES = new Set([
  '전단행사', '전단', '기획전', '이벤트', '행사', '특가', '특가전', '알뜰쇼핑', '오늘의특가',
]);

let pool = null;
let deps = {
  store: null,
  send: () => {},
  getAccount: () => null,
  userDataDir: null,
};

/** 웹이 폴링으로 가져갈 최근 로그. 앱 탭은 이벤트로 즉시 받지만 웹은 폴링이라 버퍼가 필요하다. */
const LOG_MAX = 200;
const logs = [];

function pushLog(message) {
  logs.push({ at: Date.now(), message });
  if (logs.length > LOG_MAX) logs.splice(0, logs.length - LOG_MAX);
  try { deps.send('naver-ingest:log', message); } catch { /* ignore */ }
}

function pushStatus() {
  try { deps.send('naver-ingest:status', getStatus()); } catch { /* ignore */ }
}

/**
 * 사람이 직접 해야만 넘어가는 순간(보안문자·2단계 인증)에 OS 알림을 띄운다.
 * 패널 로그만으로는 부족하다 — 품절 감시는 뒤에서 도는 기능이라 화면을 안 보고 있고,
 * 여기서 막히면 감시가 조용히 멈춘 채 며칠이 간다(과거 실측된 실패 방식이다).
 */
async function notifyHuman(body) {
  try {
    const { Notification } = await import('electron');
    if (!Notification.isSupported()) return;
    const n = new Notification({ title: '메가로드 도우미', body, urgency: 'critical' });
    n.on('click', () => { try { pool?.slots?.find((s) => s.sw?.status === 'login')?.sw?.show(); } catch { /* ignore */ } });
    n.show();
  } catch { /* 알림 실패는 흐름을 막지 않는다 */ }
}

/**
 * runAllinone: 추출이 끝난 폴더를 올인원(대표컷 선정·상세페이지 생성)에 그대로 넘기는 훅.
 * 여기서 startGeneration 을 직접 부르지 않는 이유는 그 함수가 ctx(services·paths·shell)를
 * 요구하는데 이 서비스는 그걸 모르기 때문이다. 모듈이 ctx 를 쥐고 있으니 모듈이 주입한다.
 */
export function initService({ store, send, userDataDir, getAccount, getToken, webOrigin, runAllinone }) {
  deps = {
    store, send: send || (() => {}), getAccount: getAccount || (() => null), userDataDir,
    // 상세 결과를 도우미가 **직접** 서버에 올리기 위한 것들(브라우저 탭에 기대지 않으려고).
    getToken: getToken || (() => null), webOrigin: webOrigin || null,
    runAllinone: runAllinone || null,
  };
  naverGate.init(userDataDir);
  initCategories(store);
  initCredentials(store);
  // 네이버로 나가는 **모든** 경로가 진짜 크롬을 쓴다 — Electron 창은 합성 이벤트(isTrusted=false)라
  // 목록은 50개에서 멈추고 상세는 차단을 부른다(실측 2026-08-25~27).
  initChromeSession({ userDataDir, onLog: pushLog });
  // 세션이 끊겼을 때 크롬이 스스로 다시 로그인할 수 있게 처리기를 꽂는다.
  // (chrome-session 이 service 를 import 하면 순환이라 방향을 뒤집었다)
  setAutoLoginHandler(() => ensureNaverLogin());
  const st = naverGate.state();
  if (st.cooling) {
    pushLog(`이전 실행에서 걸린 네이버 쿨다운이 ${Math.ceil(st.cooldownMsLeft / 1000)}초 남아 있습니다 — 그만큼 쉬고 시작합니다`);
  }
  naverGate.onChange(() => { if (pool) pushStatus(); });
  // 세션을 살려 두는 게 캡차를 막는 가장 확실한 방법이다 — 앱이 켜져 있는 동안 주기적으로
  // 네이버를 한 번씩 방문해 NID_SES 를 갱신한다(요청 1회, 로그인 화면을 거치지 않는다).
  startKeepAlive({ onLog: pushLog });

  /**
   * 앱을 켤 때 한 번 자동 로그인한다.
   * ---------------------------------------------------------------------------
   * ★ 왜 필요한가(실측 2026-08-27): 자동 로그인은 **작업을 시작할 때만** 돌고 있었다
   *   (수집·상세·카테고리·큐·품절감시 tick). 그래서 앱을 켜 두고 가만히 있으면 아무도
   *   부르지 않아, 계정을 저장해 둔 사람이 화면에서 "로그인 안 됨 — 스마트스토어 건너뜀"
   *   만 보게 됐다. 정작 그 화면에는 **"앱을 켤 때마다 알아서 다시 로그인합니다"** 라고
   *   적혀 있다. 화면이 약속한 것을 코드가 하지 않고 있었다.
   *
   * ★ 계정을 저장해 둔 사람에게만 한다. 그러지 않으면 소싱을 안 쓰는 셀러의 화면에도
   *   켤 때마다 크롬 창이 튀어나온다(ensureNaverLogin 은 크롬부터 띄운다).
   * ★ 조금 늦춘다 — 켜자마자 하면 다른 초기화와 겹치고, 네이버에도 "부팅하자마자 로그인"
   *   이라는 티가 난다. 안에서 쿨다운·캡차 차단은 ensureNaverLogin 이 알아서 지킨다.
   */
  if (hasCredentials()) {
    const t = setTimeout(() => { ensureNaverLogin().catch(() => {}); }, 8000);
    t.unref?.();
  }

  // 지난번에 켜 뒀으면 그대로 이어서 돈다 — 셀러 요청이 앱 재시작으로 방치되면 안 된다.
  //
  // ★ 기본값은 **켜짐 + 미리채움 끔**이다(idle:false).
  //
  //   예전 기본값은 미리채움 켜짐이었다. 근거는 "게이트가 분당 12건이라 셀러가 100개를 고른
  //   뒤에 뽑기 시작하면 8.3분이 사라진다" 였고, 그 산수 자체는 지금도 맞다. 그런데 대가를
  //   잘못 셌다: 미리채움은 서버에서 detail_status='none' 까지 긁어간다 — **아무도 요청한 적
  //   없는 상품**이다. 한 카테고리가 836개면 836 ÷ 12 = 약 70분 동안 네이버를 두드리는데,
  //   그중 셀러가 실제로 고르는 건 극히 일부다.
  //
  //   "남는 예산만 쓴다"는 것도 네이버 입장에서는 성립하지 않는다. 총 요청량은 같고, 그
  //   요청들이 419(SDW-E90419) 차단을 부르면 게이트가 전체를 멈춰서 **정작 셀러가 요청한
  //   상품이 뒤로 밀린다**. 팔지도 않을 상품을 뽑다가 파는 상품을 굶기는 셈이다.
  //   (실측 2026-08-28~31: 419 가 누적되며 상세 성공률이 88% → 0% 까지 떨어졌다.)
  //
  //   그래서 기본은 **요청된 것만** 뽑는다. 서버 라우트 주석("기본은 요청만")과도 이제 맞는다.
  //   미리채움이 필요하면 setQueueWorker({ on:true, idle:true }) 로 관리자가 명시적으로 켠다.
  /**
   * 큐 워커 기본값. idle=true 면 **요청이 없을 때 미수집분까지 채운다**.
   * ---------------------------------------------------------------------------
   * v0.5.4 에서 이걸 껐다 — 836개 카테고리 전체를 미리 뽑느라 70분 동안 네이버를 두드렸고,
   * 그게 419 를 불러 정작 셀러가 요청한 상품이 뒤로 밀렸기 때문이다. 그 판단은 그때 옳았다.
   * 이제 다시 켠다(사용자 확정 2026-09-02) — 전제가 바뀌었다:
   *   · 서버 큐가 **요청분을 먼저** 준다(detail_request_count DESC → requested_at ASC).
   *     미리채움은 남는 시간에만 얹히므로, 요청한 상품이 뒤로 밀리지 않는다.
   *   · 셀러 요청은 셀러 IP 가 나눠 가져간다(v0.5.9) — 관리자 도우미가 미리채움에 쓸 여유가 생겼다.
   *   · 무엇보다 **셀러 화면에는 상세가 확보된 것만 보인다.** 미리 채워 두지 않으면 카탈로그가
   *     비어 보인다 — 고를 것이 없는 카탈로그는 존재 이유가 없다.
   * ⚠️ 서버가 idle=1 을 **관리자에게만** 허용하므로, 셀러 도우미에 이 값이 켜져 있어도
   *    자기 요청분만 가져간다(남의 몫을 미리 뽑지 않는다).
   */
  const qw = store?.get('naverIngestQueueWorker', null) || { on: true, idle: true };
  if (qw.on) {
    queueOpts = { idle: !!qw.idle };
    queueTimer = setInterval(() => { queueTick().catch(() => {}); }, QUEUE_POLL_MS);
    if (queueTimer.unref) queueTimer.unref();
  }
  scheduleResume();
}

export function isAdmin() {
  return deps.getAccount()?.role === 'admin';
}

function requireAdmin() {
  const acc = deps.getAccount();
  if (!acc) throw new Error('메가로드에 먼저 연결하세요.');
  if (acc.role !== 'admin') throw new Error('관리자 계정만 사용할 수 있습니다.');
}

function ensurePool() {
  if (pool) return pool;
  pool = new TabPool({ onLog: pushLog, onStatus: pushStatus });
  pool.setCount(deps.store?.get('naverIngestWindows', WINDOW_DEFAULT) ?? WINDOW_DEFAULT);
  return pool;
}

/**
 * 풀에 속하지 않는 임시 탭 하나 — 로그인처럼 **한 번 하고 마는** 일에 쓴다.
 * ---------------------------------------------------------------------------
 * ★ 왜 풀에서 빌리지 않나: 교착 때문이다. 목록 수집은 'list'(0번) 탭을 몇 분씩 쥔 채로 도는데,
 *   그 도중 세션이 끊겨 자동 로그인이 다시 'list' 탭을 달라고 하면 서로를 영원히 기다린다.
 *   덤으로, 로그인 한 번 하려고 탭 3개짜리 풀을 통째로 띄웠다가 도로 접는 춤도 없어진다.
 */
const keptTabs = new Map();

async function withTempTab(label, fn) {
  // 지난번에 사람에게 보여주려고 남겨 둔 탭이 있으면 여기서 치운다(아래 keepOpen 참고).
  const prev = keptTabs.get(label);
  if (prev) { keptTabs.delete(label); try { prev.close(); } catch { /* ignore */ } }

  const sw = new ChromeTab(-1);
  sw.detail = label;
  try {
    await sw.ensure();
    return await fn(sw);
  } finally {
    /**
     * ★ 사람이 봐야 하는 화면(캡차·2단계·원인 불명)은 **닫지 않는다.** 닫아 버리면 방금
     *   "창에서 풀어주세요"라고 해 놓고 그 창을 빼앗는 꼴이다. 다음번 같은 일이 시작될 때
     *   치운다 — 그때는 사람이 이미 봤거나 관심이 없다는 뜻이므로.
     */
    if (sw.keepOpen) keptTabs.set(label, sw);
    else sw.close();
  }
}

/**
 * 네이버 로그인 상태 — 목록 페이지의 전제 조건이라 화면 맨 앞에 보여야 한다.
 * status 는 1초 폴링이므로 쿠키를 매번 읽지 않고 캐시를 쓰고, 오래됐으면 **기다리지 않고**
 * 뒤에서 갱신한다(폴링이 쿠키 I/O 때문에 느려지면 안 된다).
 */
let loginCache = { loggedIn: false, persistent: false, at: 0 };
let loginTask = null;

function refreshLoginSoon() {
  if (Date.now() - loginCache.at < 10_000) return;
  loginCache = { ...loginCache, at: Date.now() };
  loginState().then(async (st) => {
    const changed = st.loggedIn !== loginCache.loggedIn;
    loginCache = { loggedIn: !!st.loggedIn, persistent: !!st.persistent, at: Date.now() };
    // ★ 로그인 순간 한 번만 도장을 찍으면 안 된다(실측 2026-08-18): 네이버는 브라우징 도중
    //   NID_SES 를 **세션 쿠키로 계속 재발급**한다. 로그인 직후엔 영속이었는데 한 시간 감시가
    //   돌고 나면 NID_SES 만 사라져 있었고, 그래서 재시작하자 또 캡차였다.
    //   쿠키 조작은 네트워크 요청이 0회라 자주 해도 공짜다 — 상태 폴링에 얹어 계속 유지한다.
    if (st.loggedIn && !st.persistent) {
      const kept = await persistLoginCookies().catch(() => 0);
      if (kept) loginCache = { ...loginCache, persistent: true };
    }
    if (changed) pushStatus();
  }).catch(() => {});
}

const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); t.unref?.(); });

export function getStatus() {
  refreshLoginSoon();
  const base = {
    isAdmin: isAdmin(),
    account: deps.getAccount(),
    limits: { min: WINDOW_MIN, max: WINDOW_MAX, default: WINDOW_DEFAULT },
    naverLogin: {
      loggedIn: loginCache.loggedIn,
      // 세션 쿠키면 앱을 끄는 순간 풀린다 — 로그인 여부와 따로 알려야 화면이 원인을 말할 수 있다.
      persistent: loginCache.persistent,
      checkedAt: loginCache.at,
      waiting: !!loginTask,
      credential: credentialInfo(),          // 비밀번호는 여기 안 실린다(가린 아이디만)
      auto: { running: autoLoginTask.running, at: autoLoginTask.at, result: autoLoginTask.result },
      // 세션 유지(keep-alive)가 실제로 도는지 — 캡차를 막는 첫 방어선이라 보이게 둔다.
      //   지금까지 이 값이 어디에도 안 실려서, 유지가 죽어 있어도 알 방법이 없었다.
      keepAlive: keepAliveState(),
      // 연속 실패로 로그인 시도를 미루는 중이면 언제까지인지 — "왜 자동 로그인을 안 하지"의 답.
      backoffUntil: loginBackoffUntil,
    },
  };
  // 수집 진행 요약 — 결과 배열(수백 건)은 빼고 카운트만 실어 폴링을 가볍게 유지한다.
  base.collect = {
    catId: collection.catId,
    catName: collection.catName,
    running: collection.running,
    stopped: collection.stopped,
    count: collection.items.length,
    progress: collection.progress,
    at: collection.at,
  };
  base.queue = getQueueState();
  // 상세페이지 생성(올인원) 진행 — 앱 탭도 "지금 어디까지 왔나"를 같은 값으로 본다.
  base.gen = { ...genTask };
  base.detail = {
    running: detail.running, total: detail.total, done: detail.done,
    ok: detail.ok, failed: detail.failed, current: detail.current,
    rootDir: detail.rootDir, stopped: detail.stopped, at: detail.at,
  };
  // 카테고리 미리 읽기 — 웹이 "이미 다 읽었는지 / 지금 읽는 중인지"를 이걸로 판단한다.
  const info = prewarmInfo();
  base.prewarm = { ...prewarm, completedAt: info.at, completedDepth: info.depth, nodes: info.nodes };
  if (pool) return { ...base, ...pool.status() };
  return {
    ...base,
    running: false,
    configured: deps.store?.get('naverIngestWindows', WINDOW_DEFAULT) ?? WINDOW_DEFAULT,
    effective: 0, active: 0, waiting: 0, windows: [],
    gate: naverGate.state(),
  };
}

/** 웹 폴링용 — since(타임스탬프) 이후의 로그만 준다. */
export function getLogs(since = 0) {
  return logs.filter((l) => l.at > since);
}

export function setWindows(count) {
  requireAdmin();
  const n = ensurePool().setCount(count);
  deps.store?.set('naverIngestWindows', n);
  pushLog(`동시 창 ${n}개로 설정했습니다${n > 4 ? ' (4개를 넘으면 처리량은 안 늘고 메모리만 더 씁니다)' : ''}`);
  return n;
}

export async function start() {
  requireAdmin();
  const p = ensurePool();
  if (p.running) return p.status();
  pushLog(`수집 창 ${p.configured}개를 준비합니다…`);
  await p.start();
  pushLog('준비 완료.');
  return getStatus();
}

export async function stop() {
  // 순서가 중요하다 — 탭을 먼저 정리하고 브라우저를 닫는다. 반대로 하면 죽은 브라우저에
  // Target.closeTarget 을 쏘느라 매번 타임아웃을 기다린다.
  if (pool) await pool.stop();
  for (const [k, sw] of keptTabs) { keptTabs.delete(k); try { sw.close(); } catch { /* ignore */ } }
  await closeChrome();
  if (pool) pushLog('수집을 멈추고 창을 정리했습니다.');
  return true;
}

/**
 * 연결 확인 — 상품 1건을 클릭 이동으로 열어 상품명·가격을 뽑는다.
 * P0 의 합격 기준이 이것이다: "URL 을 직접 열지 않고 상품 1건 열기 성공".
 */
export async function testOne(url) {
  requireAdmin();
  if (!url) throw new Error('상품 URL 을 입력하세요.');
  const p = ensurePool();
  if (!p.running) { pushLog('창을 준비합니다…'); await p.start(); }
  pushLog(`테스트 시작 — ${url}`);
  const t0 = Date.now();
  const r = await runOne(p, url, {
    onLog: pushLog,
    onCaptcha: (i) => pushLog(`창 ${i + 1} 에서 캡차를 풀어주세요. (도우미 앱 창이 화면에 뜹니다)`),
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (r?.ok) {
    pushLog(`✅ 성공(${secs}초, 시도 ${r.attempt}회) — ${r.data.name} / ${r.data.price ? r.data.price.toLocaleString() + '원' : '가격 미확인'}`);
  } else {
    pushLog(`❌ 실패(${secs}초) — ${r?.error || '알 수 없음'}`);
  }
  return r;
}

// ── 카테고리 선택 수집 ────────────────────────────────────────────────
// "전부 긁기"는 불가능하다(네이버 1000개 한계 + 상세추출 병목). 관리자가 카테고리를 골라
// 그것만 수집한다. 수집 결과는 메모리에 들고 있다가 웹이 가져간다.

/** 마지막 수집 결과 — { catId, catName, items, stopped, at, running, progress } */
let collection = { catId: null, catName: '', items: [], stopped: null, at: 0, running: false, progress: null };
let collectAbort = null;

export async function categories(parentId, force = false) {
  requireAdmin();
  // 대분류는 상수라 네트워크·창이 필요 없다. 지금까지 발견한 트리(map)를 같이 줘서
  // 웹이 이미 아는 가지는 클릭 없이 바로 펼쳐 보여줄 수 있게 한다.
  if (!parentId) return { parentId: null, trail: [], children: ROOT_CATEGORIES, map: knownMap(), cached: true };
  const p = ensurePool();
  if (!p.running) await p.start();
  return listChildren(p, parentId, { force, onLog: pushLog, ensureLogin: ensureNaverLogin });
}

export function clearCategories() {
  requireAdmin();
  if (prewarm.running) throw new Error('미리 읽기가 도는 중입니다 — 먼저 중단하세요.');
  clearCategoryCache();
  pushLog('카테고리 캐시를 비웠습니다 — 다음 조회 때 네이버에서 다시 읽습니다.');
  return true;
}

// ── 카테고리 미리 읽기 ────────────────────────────────────────────────
// 고를 때마다 몇 초씩 기다리게 하지 않으려면 트리는 미리 다 읽혀 있어야 한다.
// 오래 걸리므로(소분류까지 20~40분) 시작만 하고 즉시 돌아가며, 진행은 status 로 본다.

let prewarm = {
  running: false, read: 0, failed: 0, level: 0, pending: 0, current: '', stopped: null, at: 0, depth: 3,
};
let prewarmAbort = null;

export async function startPrewarm({ depth = 3 } = {}) {
  requireAdmin();
  if (prewarm.running) return { ok: true, already: true };

  const p = ensurePool();
  if (!p.running) { pushLog('창을 준비합니다…'); await p.start(); }

  // ★ 소분류부터는 **목록 페이지**(로그인 전제)를 읽는다 — 로그인이 없으면 377개 카테고리가
  //   전부 3번씩 실패하며 페이지만 1,000장 넘게 연다. 시작 전에 한 번 확인하고 끊는 게 맞다.
  if (depth >= 3) {
    const login = await ensureNaverLogin().catch(() => ({ ok: false }));
    if (!login.ok) {
      pushLog('네이버 로그인이 필요합니다 — 소분류는 목록 페이지에만 있고 그 페이지는 로그인 없이 열리지 않습니다.');
      return { ok: false, error: '네이버 로그인이 필요합니다.' };
    }
  }

  // "하다 만 상태"를 남기지 않으려고 의도를 디스크에 적어 둔다 — 앱을 껐다 켜도 알아서 이어서 한다.
  deps.store?.set('naverIngestCatPrewarmWant', { depth, at: Date.now() });

  prewarmAbort = new AbortController();
  prewarm = { running: true, read: 0, failed: 0, level: 1, pending: 0, current: '', stopped: null, at: Date.now(), depth };
  pushLog(`카테고리 미리 읽기 시작 — ${depth >= 6 ? '끝까지(전체)' : depth >= 4 ? '세분류까지' : '소분류까지'}. 요청 간격(3~7초) 때문에 시간이 걸립니다.`);

  prewarmTree(p, {
    maxDepth: depth,
    onLog: pushLog,
    // 소분류는 목록 페이지에만 있고 그 페이지는 로그인이 전제다 — 세션이 끊기면 되살리고 이어간다.
    ensureLogin: ensureNaverLogin,
    signal: prewarmAbort.signal,
    onProgress: (pr) => { prewarm = { ...prewarm, ...pr }; },
  }).then((r) => {
    prewarm = { ...prewarm, running: false, stopped: r.stopped, read: r.read, failed: r.failed };
    // 끝까지 갔을 때만 의도를 지운다 — 중단이면 다음 실행에서 이어서 해야 하기 때문이다.
    if (!r.stopped) deps.store?.set('naverIngestCatPrewarmWant', null);
    pushLog(r.stopped
      ? `카테고리 미리 읽기 중단 — ${r.stopped} (읽은 페이지 ${r.read}장)`
      : `✅ 카테고리 미리 읽기 완료 — 페이지 ${r.read}장, 건너뜀 ${r.failed}건`);
    pushStatus();
  }).catch((e) => {
    prewarm = { ...prewarm, running: false, stopped: `실패: ${e?.message || e}` };
    pushLog(`❌ 카테고리 미리 읽기 실패 — ${e?.message || e}`);
    pushStatus();
  });

  pushStatus();
  return { ok: true, started: true };
}

/**
 * 페이지 진단 — 수집이 0건일 때 **추측하지 않으려고** 실제 페이지 구조를 떠서 파일로 남긴다.
 *
 * 목록이 안 그려진 건지, 링크 모양이 바뀐 건지, 이 페이지가 애초에 상품 목록이 아닌 건지,
 * 차단인 건지는 로그로는 전부 똑같이 "0건" 이다. 한 장만 열어(예산 1) 링크 모양 분포와
 * 본문 앞부분을 통째로 저장한다 — 그 파일 하나면 원인이 갈린다.
 */
export async function probePage(catId) {
  requireAdmin();
  if (!catId) throw new Error('카테고리를 먼저 고르세요.');

  const p = ensurePool();
  if (!p.running) { pushLog('창을 준비합니다…'); await p.start(); }

  pushLog(`페이지 진단 시작 — 카테고리 ${catId}`);
  // 진단은 한 장짜리라 로그인 복구를 기다려도 되지만, 캡차가 뜨면 10분을 매달리게 된다.
  // 이미 막힌 상태면 기다리지 않고 그대로 진단한다(로그인 화면이 찍히는 것도 정보다).
  await ensureNaverLogin().catch(() => null);
  await naverGate.acquire('ingest');

  const login = await loginState();
  const report = await p.withWindow('list', async (sw) => {
    // 메뉴 페이지는 상품이 없다 — 진단도 수집과 **같은 경로**(메뉴 → 목록)를 타야 의미가 있다.
    await sw.gotoViaClick(categoryUrl(catId), { timeoutMs: 20000 });
    const viaMenu = await sw.gotoViaPageLink(`search.shopping.naver.com/ns/category/${catId}`, { timeoutMs: 20000 });
    const nav = viaMenu.notFound
      ? await sw.gotoViaClick(listUrl(catId), { timeoutMs: 20000 })
      : viaMenu;
    const det = await sw.detect().catch(() => null);

    const first = await sw.evaluate(probePageJs).catch((e) => ({ error: String(e?.message || e) }));
    /**
     * 1회로는 "안 움직인 것"과 "움직였는데 더 없는 것"이 안 갈린다 — 3회 굴려 본다.
     * ★ 진짜 휠로 굴린다(scrollStepJs 의 window.scrollBy 가 아니라). 자바스크립트 스크롤은
     *   컴포지터를 안 거쳐서 무한스크롤이 **발화하지 않는다**(실측 2026-08-26: 6회차까지 +0).
     *   그걸로 진단하면 "더 안 나온다"는 잘못된 결론이 나온다 — 진단이 거짓말을 하면 안 된다.
     */
    for (let i = 0; i < 3; i++) {
      await sw.page.wheel({ steps: 3, deltaY: 600, pauseMs: [250, 450] }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2500));
    }
    const afterScroll = await sw.evaluate(probePageJs).catch((e) => ({ error: String(e?.message || e) }));

    // 수집기가 실제로 뭘 뱉는지도 같이 본다 — 여긴 평소 .catch(()=>[]) 로 삼켜지는 자리다.
    let cards = null, cardsError = null;
    try { cards = await sw.evaluate(collectCardsJs); }
    catch (e) { cardsError = String(e?.message || e); }

    return {
      at: new Date().toISOString(),
      catId,
      naverLogin: login,
      nav,
      detect: det,
      cardCount: Array.isArray(cards) ? cards.length : null,
      cardsError,
      cardSamples: Array.isArray(cards) ? cards.slice(0, 5) : null,
      first,
      afterScroll,
    };
  });

  // 창을 못 얻었으면(풀이 멈췄거나 다른 작업이 오래 쥐고 있음) 그 사실 자체가 진단 결과다.
  if (!report) {
    pushLog('페이지 진단을 하지 못했습니다 — 수집 창을 얻지 못했습니다(다른 작업이 쓰는 중).');
    return { ok: false, error: '수집 창을 얻지 못했습니다' };
  }

  naverGate.recordSuccess();

  let path = null;
  try {
    path = join(deps.userDataDir || '.', 'naver-probe.json');
    writeFileSync(path, JSON.stringify(report, null, 2));
    pushLog(`진단 파일 저장 — ${path}`);
  } catch (e) {
    pushLog(`진단 파일 저장 실패(결과는 응답에 있습니다) — ${e?.message || e}`);
  }

  if (report?.detect?.loginRequired || !login.loggedIn) {
    pushLog('진단 결과 — 네이버 로그인이 없어 목록 페이지가 로그인 화면으로 넘어갑니다. "네이버 로그인" 을 먼저 하세요.');
  }
  const c = report?.afterScroll?.counts;
  if (c) {
    pushLog(`진단 요약 — 링크 ${c.anchors}개 · /products/ ${c.hrefProductsPlural}개 · /product/ ${c.hrefProductSingular}개 · 이미지 ${c.imgs}개 · 카드 ${report.cardCount}개`);
  }
  return { ok: true, path, report };
}

/**
 * 상품 페이지 진단 — 옵션·상세이미지·리뷰이미지를 어디서 뽑아야 하는지 실측한다.
 * 상세 추출기를 짜기 전에 **한 장만 열어** 구조를 확인하는 용도다(예산 1).
 */
export async function probeProduct(url) {
  requireAdmin();
  if (!url) throw new Error('상품 URL 을 입력하세요.');
  const p = ensurePool();
  if (!p.running) { pushLog('창을 준비합니다…'); await p.start(); }
  await ensureNaverLogin().catch(() => null);

  pushLog(`상품 페이지 진단 — ${url}`);
  const r = await runOne(p, url, { onLog: pushLog, extract: probeProductJs });

  let path = null;
  try {
    path = join(deps.userDataDir || '.', 'naver-product-probe.json');
    writeFileSync(path, JSON.stringify(r, null, 2));
    pushLog(`상품 진단 파일 저장 — ${path}`);
  } catch (e) {
    pushLog(`상품 진단 저장 실패(결과는 응답에 있습니다) — ${e?.message || e}`);
  }
  return { ok: !!r?.ok, path, report: r };
}

/** 발견한 트리 통째로 — 제품에 동봉할 스냅샷(category-tree.json)을 만들 때 쓴다. */
export function exportCategories() {
  requireAdmin();
  return exportTree();
}

export function stopPrewarm() {
  requireAdmin();
  prewarmAbort?.abort();
  // 사람이 멈춘 것이므로 자동 이어하기도 끈다(다시 시작은 버튼으로).
  deps.store?.set('naverIngestCatPrewarmWant', null);
  pushLog('카테고리 미리 읽기를 중단합니다 — 지금까지 읽은 것은 저장돼 있습니다.');
  return true;
}

/**
 * 하다 만 미리 읽기를 앱 재시작 뒤에 스스로 이어서 한다.
 * "한 번 눌러 두면 알아서 끝난다" 가 되려면 앱 종료가 진행을 없던 일로 만들면 안 된다.
 * 관리자 계정이 붙기 전에는 시작할 수 없으므로, 붙을 때까지 조용히 기다렸다 시작한다.
 */
function scheduleResume() {
  const want = deps.store?.get('naverIngestCatPrewarmWant', null);
  if (!want?.depth) return;
  let tries = 0;
  const timer = setInterval(() => {
    if (++tries > 20) return clearInterval(timer);          // 10분 안에 로그인 안 되면 포기
    if (prewarm.running) return clearInterval(timer);
    if (!isAdmin()) return;
    clearInterval(timer);
    pushLog('지난번에 하다 만 카테고리 미리 읽기를 이어서 합니다.');
    startPrewarm({ depth: want.depth }).catch((e) => pushLog(`이어하기 실패 — ${e?.message || e}`));
  }, 30_000);
  timer.unref?.();
}

/**
 * 카테고리 1개 수집 시작. 오래 걸리므로 **기다리지 않고** 시작만 하고 돌아간다
 * (웹은 status 폴링으로 진행을 본다).
 */
/**
 * @param autoDetail      수집이 끝나면 상세 추출까지 이어서 실행한다(그다음은 올인원이 받는다).
 * @param autoDetailLimit 상세까지 가져올 개수. 0 이면 수집된 전부.
 *                        전량은 상품 1건에 페이지 1장이라 58개면 30~90분이고 네이버 차단
 *                        위험도 그만큼 커진다 — 그래서 개수를 고를 수 있게 둔다.
 */
export async function startCollect({ catId, catName = '', target = 300, autoDetail = false, autoDetailLimit = 0 }) {
  requireAdmin();
  if (!catId) throw new Error('카테고리를 선택하세요.');
  if (collection.running) throw new Error('이미 수집이 진행 중입니다.');

  /**
   * ★ 크롬이 없으면 여기서 끝낸다 — 창을 준비하기 **전에**.
   * 일렉트론 폴백은 없앴다. 예전 폴백은 이런 것들이었다:
   *   · 합성 입력이라 첫 화면 50개에서 멈춘다 — 300개를 시켜도 50개를 주고 "끝" 이라 한다.
   *   · 품절·품절임박을 거르지 않는다 — 등록 못 하는 줄이 카탈로그에 섞여 들어간다.
   * 반쯤 잘못된 결과를 조용히 내주느니 **왜 못 하는지 말하고 멈추는 게 낫다.**
   */
  if (!isChromeAvailable()) {
    pushLog('❌ 구글 크롬이 없어 수집할 수 없습니다. 크롬을 설치한 뒤 다시 눌러 주세요 — https://www.google.com/chrome/');
    throw new Error('구글 크롬이 필요합니다 — 설치 후 다시 시도해 주세요.');
  }

  /**
   * 탭 풀은 **필요할 때만** 띄운다.
   * ---------------------------------------------------------------------------
   * 목록 수집은 자기 탭 하나로 한다(아래 runViaChrome). 풀에서 빌리지 않는 이유가 둘이다:
   *   ① 수집은 몇 분씩 걸린다. 그동안 'list' 자리를 쥐고 있으면 카테고리 펼치기·페이지 진단이
   *      **응답 없이 매달린다** — 화면은 "눌렀는데 아무 일도 안 일어난다"가 된다.
   *   ② 쓰지도 않을 탭 2~4개가 수백 MB 를 물고 앉아 있고, 뒤이은 상세페이지 생성이
   *      RAM 부족으로 통째로 실패한다.
   * → 목록 수집에 풀은 필요 없다. 이어지는 **상세 추출** 때만 띄운다.
   */
  const p = ensurePool();
  if (autoDetail && !p.running) { pushLog('창을 준비합니다…'); await p.start(); }

  // ★ 여기서 로그인을 기다리지 않는다. 캡차가 뜨면 사람이 풀 때까지 최대 10분인데, 그동안
  //   이 요청이 응답을 안 돌려줘서 웹 화면은 "눌렀는데 아무 일도 안 일어난다"가 된다(실측).
  //   로그인 복구는 아래 runViaChrome 이 처리한다(ensureChromeLogin).
  collectAbort = new AbortController();
  collection = { catId, catName, items: [], stopped: null, at: Date.now(), running: true, progress: { collected: 0, scrolls: 0 } };
  pushLog(`수집 시작 — ${catName || catId} (목표 ${target}개)`);

  /**
   * 수집 도중 세션이 만료되면 창을 놓고 나온다(collect-list 는 그 자리에서 로그인을 못 한다 —
   * 창을 쥔 채로 창을 또 달라고 하면 창 1개짜리 설정에서 멈춘다). 되살리는 건 여기, 창 밖이다.
   */
  const opts = {
    target,
    /**
     * ★ 고른 카테고리 **하나만** 긁는다.
     * 목표를 못 채우면 형제 소분류로 이어가게 해 봤는데, 딸기를 골랐더니 한라봉/감귤류·오렌지가
     * 섞여 들어왔다. 사람이 '딸기'를 골랐으면 딸기만 나와야 한다 — 개수를 채우는 것보다
     * 고른 대로 나오는 게 먼저다. 여러 칸이 필요하면 사람이 여러 번 고르는 게 맞다.
     */
    sweepSiblings: false,
    onLog: pushLog,
    onProgress: (pr) => { collection.progress = pr; },
    signal: collectAbort.signal,
  };

  /**
   * 크롬으로 수집한다.
   * ---------------------------------------------------------------------------
   * 크롬을 CDP 로 조종하면 진짜 마우스·휠 입력이 들어가고(isTrusted=true), 같은 카테고리에서
   * 244개까지 나왔다(실측 2026-08-25~26). 자세한 근거는 collect-list-chrome.mjs 머리말.
   *
   * ★ 로그인 확보는 **탭을 열기 전에** 끝낸다. 로그인도 자기 탭이 필요한데, 수집 탭을 쥔 채로
   *   로그인을 시작하면 순서가 꼬인다.
   * ★ 수집은 **자기 탭**에서 돈다(풀 밖). 한 탭이 처음부터 끝까지 스크롤해야 목록이 이어지고,
   *   그동안 풀의 'list' 자리를 비워 둬야 카테고리 펼치기가 안 막힌다.
   */
  const runViaChrome = async () => {
    const r = await ensureChromeLogin({ waitMs: 300_000 });
    if (!r.ok) return { items: [], stopped: '네이버 로그인 필요' };
    return withTempTab(`목록 수집 — ${catName || catId}`, async (sw) => {
      sw.status = 'working';
      // 워밍업(네이버 → 쇼핑 홈)은 descendToCategory 가 알아서 한다 — 여기서 또 하면 진입만 두 번이다.
      return collectCategoryViaChrome(sw.page, catId, opts);
    });
  };

  /** 크롬 가용성은 이 함수 맨 앞에서 이미 걸렀다 — 여기는 실행 중 실패만 받는다. */
  const runCollect = async () => {
    try {
      return await runViaChrome();
    } catch (e) {
      pushLog(`❌ 크롬 수집 실패 — ${e?.message || e}`);
      return { items: [], stopped: `크롬 수집 실패 — ${e?.message || e}` };
    }
  };

  runCollect().then(async ({ items: raw, stopped }) => {
    // ── 담기 전에 거른다(실측 2026-08-20) ──────────────────────────────
    // 목록에는 상품이 아닌 배너 카드('전단행사' 같은 제목만 있는 줄)와, 상세를 뽑을 수 없는
    // 스토어(네이버 마켓·쇼핑윈도)가 섞여 온다. 그대로 두면 카탈로그에 **고를 수 없는 줄**이
    // 쌓이고, 셀러는 고른 뒤에야 안 된다는 걸 알게 된다. 여기서 빼고 몇 개를 뺐는지 말한다.
    const isBanner = (x) => {
      const t = String(x.title || '').trim();
      return !t || t.length < 2 || BANNER_TITLES.has(t) || !/\/products\/\d+/.test(String(x.url || ''));
    };
    const banners = raw.filter(isBanner);
    const rest = raw.filter((x) => !isBanner(x));
    const unsupported = rest.filter((x) => !isDetailExtractable(x.url));
    const items = rest.filter((x) => isDetailExtractable(x.url));

    collection = { ...collection, items, stopped, running: false, at: Date.now() };
    pushLog(`✅ 수집 완료 — ${items.length}개 (${stopped})`);
    if (banners.length || unsupported.length) {
      pushLog(`제외 ${banners.length + unsupported.length}개 — 배너·상품 아님 ${banners.length}, `
        + `상세 추출 미지원(마켓·윈도) ${unsupported.length}`);
    }
    pushStatus();

    // ── 상세까지 한 번에 ──────────────────────────────────────────────
    // 목록만 모아 두면 사람이 다시 골라 버튼을 또 눌러야 한다. 켜 두면 여기서 바로 이어지고,
    // 상세가 끝나면 올인원(대표컷·상세페이지 생성)까지 자동으로 간다 — 버튼 한 번에 검수까지.
    // 리뷰 많은 순으로 자른다: 개수를 제한할 때 아무거나 남기면 고를 이유가 없어진다.
    if (!autoDetail || collectAbort.signal.aborted || !items.length) return;
    const ordered = [...items].sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
    const picked = autoDetailLimit > 0 ? ordered.slice(0, autoDetailLimit) : ordered;
    const urls = picked.map((x) => x.url).filter(Boolean);
    if (!urls.length) return;
    pushLog(`이어서 상세 ${urls.length}개를 가져옵니다${autoDetailLimit > 0 ? ` (리뷰 많은 순 상위 ${autoDetailLimit}개)` : ''}.`);
    try {
      await startDetailExtract({ urls });
    } catch (e) {
      pushLog(`❌ 상세 추출을 시작하지 못했습니다 — ${e?.message || e}. 목록에서 골라 직접 실행할 수 있습니다.`);
    }
  }).catch((e) => {
    collection = { ...collection, running: false, stopped: `실패: ${e?.message || e}` };
    pushLog(`❌ 수집 실패 — ${e?.message || e}`);
    pushStatus();
  });

  return { ok: true, started: true };
}

export function stopCollect() {
  collectAbort?.abort();
  collection.running = false;
  pushLog('수집을 중단했습니다.');
  return true;
}


// ── 상세 추출 ─────────────────────────────────────────────────────────
// 목록은 "넓게", 상세는 "고른 것만 깊게" — 상품 1건에 페이지 1장을 열어야 하므로 여기가
// 병목이다(게이트 슬롯 1개 + 페이싱). 그래서 시작만 하고 즉시 돌아가며 진행은 status 로 본다.
// 결과는 올인원이 그대로 먹는 폴더다 — 이 다리가 놓이면 검수 후 등록까지 이어진다.

let detail = { running: false, total: 0, done: 0, ok: 0, failed: 0, current: '', rootDir: '', at: 0, stopped: null, results: [] };
let detailAbort = null;

export function getDetailState() {
  const { results, ...rest } = detail;
  return { ...rest, results: results.slice(-50) };   // 폴링이 무거워지지 않게 뒤쪽만
}


/**
 * 상세 결과를 서버에 올린다 — **도우미가 직접**.
 * 브라우저 탭에 기대면 몇 시간짜리 추출이 끝날 때 아무도 화면을 안 보고 있어 저장이 통째로
 * 유실된다(목록 수집에서 이미 겪었다). 이미지는 **URL 만** 보낸다 — 바이트는 서버에 두지 않는다.
 * 상품 1건이 원본 107MB 인데, 셀러는 등록 직전 CDN 에서 직접 받으면 되고 그 경로엔 안티봇이 없다.
 */
async function uploadDetail(result, data) {
  const token = await deps.getToken?.();   // 만료 시 refresh 까지 하므로 비동기다
  const origin = deps.webOrigin;
  if (!token || !origin) return { ok: false, reason: 'no-session' };
  const payload = result.ok ? {
    productNo: data.channelProductNo,
    originProductNo: data.originProductNo,
    ok: true,
    url: data.url,
    title: data.title || data.name,
    price: data.price,
    brand: data.brand,
    categoryPath: data.categoryPath,
    categoryId: data.categoryId,
    options: data.options,
    detailText: data.detailText,
    reviewTexts: data.reviewTexts,
    notice: data.notice,
    images: {
      main: data.mainImages || [],
      detail: data.detailImages || [],
      review: data.reviewImages || [],
    },
    folderPath: result.folder,
  } : { productNo: data.channelProductNo || '', ok: false, error: result.error };

  try {
    const res = await fetch(`${origin}/api/megaload/naver-sourcing/products/detail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

export async function startDetailExtract({ urls = [], rootDir = '', autoGenerate = true } = {}) {
  requireAdmin();
  const list = [...new Set((urls || []).filter((u) => typeof u === 'string' && u.includes('naver.com')))];
  if (!list.length) throw new Error('추출할 상품 URL 이 없습니다.');
  if (detail.running) throw new Error('이미 상세 추출이 진행 중입니다.');

  // 실행마다 제 폴더 — 이번에 뽑은 것만 생성·검수한다(누적 폴더 재생성 방지).
  const root = ensureRoot(join(rootDir || join(deps.userDataDir || '.', 'naver-sourcing'), runFolderName()));
  const p = ensurePool();
  if (!p.running) { pushLog('창을 준비합니다…'); await p.start(); }

  detailAbort = new AbortController();
  detail = { running: true, total: list.length, done: 0, ok: 0, failed: 0, current: '', rootDir: root, at: Date.now(), stopped: null, results: [] };
  pushLog(`상세 추출 시작 — ${list.length}건 · 저장 위치 ${root}`);
  pushLog('상품 1건에 페이지를 한 장 열어야 해서 건당 30~90초가 걸립니다.');

  (async () => {
    for (const url of list) {
      if (detailAbort.signal.aborted) { detail.stopped = '중단됨'; break; }
      // 로그인이 끊겨 있으면 되살린다(창을 잡기 전에 — 안 그러면 창 1개 설정에서 교착).
      await ensureNaverLogin().catch(() => null);
      detail.current = url;
      const r = await extractOne(p, url, root, { onLog: pushLog, signal: detailAbort.signal })
        .catch((e) => ({ ok: false, url, error: String(e?.message || e) }));
      detail.done += 1;
      if (r.ok) {
        detail.ok += 1;
        pushLog(`✅ ${detail.done}/${detail.total} ${String(r.name || '').slice(0, 40)} — 옵션 ${r.options}개 · 대표 ${r.mainImages}장 · 상세 ${r.detailImages}장 · 리뷰 ${r.reviewImages}장${r.hasNotice ? ' · 고시정보 있음' : ''}`);
      } else {
        detail.failed += 1;
        pushLog(`❌ ${detail.done}/${detail.total} 실패 — ${r.error}`);
      }
      // 건마다 바로 올린다 — 마지막에 몰아서 올리면 중간에 앱이 꺼질 때 전부 잃는다.
      const up = await uploadDetail(r, r.data || {});
      if (!up.ok && up.reason !== 'no-session') {
        pushLog(`⚠️ 서버 저장 실패(${up.reason}) — 폴더는 남아 있습니다: ${r.folder || ''}`);
      }
      // 폴더까지 만들고 나면 원본 data 는 메모리에 들고 있을 이유가 없다(수십 건이면 무겁다).
      delete r.data;
      detail.results.push(r);
    }
    detail.running = false;
    detail.current = '';
    detail.stopped = detail.stopped || '완료';
    pushLog(`상세 추출 ${detail.stopped} — 성공 ${detail.ok} · 실패 ${detail.failed} · 폴더 ${detail.rootDir}`);
    pushStatus();

    // ── 올인원으로 바로 넘긴다 ────────────────────────────────────────────
    // 여기까지가 "가져오기"이고, 대표컷 선정·상세페이지 생성은 올인원이 이미 할 줄 안다.
    // 사람이 폴더를 찾아 다시 고르게 만들면 그 사이에서 대부분 멈춘다 — 그래서 자동으로 잇는다.
    // 창을 먼저 접는 이유: 생성은 GPU·RAM 을 크게 쓰는데 수집 창 3개가 RAM 을 물고 있으면
    // 모델이 못 올라가 생성이 통째로 실패한다(allinone-runner 의 RAM 프리플라이트 참고).
    if (autoGenerate && detail.ok > 0 && !detailAbort.signal.aborted) {
      if (!deps.runAllinone) {
        pushLog('상세페이지 자동 생성을 건너뜁니다 — 이 실행 경로에는 올인원이 연결돼 있지 않습니다.');
      } else {
        // 크롬을 통째로 접는다 — 생성은 GPU·RAM 을 크게 쓰는데 탭 3개가 몇 백 MB 를 물고
        // 있으면 모델이 못 올라가 생성이 통째로 실패한다(allinone-runner 의 RAM 프리플라이트).
        try { await stop(); } catch { /* 창 정리 실패는 생성을 막지 않는다 */ }
        pushLog(`상세페이지 자동 생성을 시작합니다 — 상품 ${detail.ok}개. 끝나면 검수 화면이 열립니다.`);
        startAllinone(detail.rootDir, detail.ok);
      }
    }
  })().catch((e) => {
    detail = { ...detail, running: false, stopped: `실패: ${e?.message || e}` };
    pushLog(`❌ 상세 추출 실패 — ${e?.message || e}`);
    pushStatus();
  });

  return { ok: true, started: true, total: list.length, rootDir: root };
}

/**
 * 미리보기 — 상품 1건의 상세를 **폴더를 만들지 않고** 읽어서 그대로 돌려준다.
 * ---------------------------------------------------------------------------
 * 목록에는 제목·가격·썸네일·리뷰수뿐이라 "이걸 등록해도 되나"를 판단할 수 없다.
 * 그렇다고 판단하려고 상세 추출(폴더 생성 + 이미지 수십 장 다운로드)을 돌리면
 * 안 쓸 상품에도 그 비용을 낸다. 보는 것과 가져오는 것을 분리한다.
 *
 * 추출기는 상세 추출과 **같은 것**을 쓴다 — 미리보기에서 본 것과 실제로 가져오는 것이
 * 다르면 미리보기의 의미가 없다.
 */
export async function previewProduct(url) {
  if (!url) throw new Error('상품 URL 이 필요합니다.');
  const p = ensurePool();
  if (!p.running) { pushLog('창을 준비합니다…'); await p.start(); }
  await ensureNaverLogin().catch(() => null);

  const r = await runOne(p, url, { onLog: pushLog, extract: extractDetailJs });
  if (!r?.ok) return { ok: false, error: r?.error || '알 수 없음' };
  const d = r.data || {};
  if (d.error) return { ok: false, error: d.error };
  return { ok: true, data: d };
}

/**
 * 이번 실행만 담을 폴더 이름.
 * ---------------------------------------------------------------------------
 * ⭐ 왜 필요한가(실측 2026-08-21): 가져오기는 늘 같은 폴더에 쌓았고 생성은 **폴더 전체**를
 *   훑는다. 그래서 상품 1개를 새로 가져와도 이미 다 만들어 둔 8개까지 다시 생성했다
 *   (gen.products=1 인데 total=9). 50개·100개가 쌓이면 하나 추가할 때마다 100개를 재생성해
 *   GPU 시간을 통째로 버리고, 검수 화면에도 예전(이미 등록한) 상품이 계속 같이 떴다.
 *   → 실행마다 제 폴더를 판다. 생성도 검수도 "방금 고른 것"만 본다.
 *   이전 결과가 사라지는 건 아니다 — 폴더는 그대로 남고 검수 화면의 '이전 생성결과 불러오기'로 연다.
 */
function runFolderName(at = Date.now()) {
  const d = new Date(at);
  const p = (n) => String(n).padStart(2, '0');
  return `run-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

let importTask = { running: false, total: 0, done: 0, ok: 0, failed: 0, current: '', rootDir: '', stopped: null, at: 0 };

/**
 * 상세페이지 생성(올인원) 진행 — **가져오기 다음 단계**.
 * ---------------------------------------------------------------------------
 * 예전엔 폴더를 다 굽고 나면 웹 화면이 "준비 완료"에서 멈춰 있었다. 실제로는 그때부터가
 * 진짜 시간이 드는 구간(인식 → 글 생성 → 누끼)인데 화면에는 아무 신호가 없어서, 사람은
 * 끝난 줄 알고 나가거나 고장으로 여겼다. 러너가 이미 stdout 으로 단계·건수를 뱉고 있으므로
 * 그걸 여기 담아 두고 웹이 폴링해서 진행률·경과·남은시간을 그린다.
 *
 * reviewReady = 레코드 저장 완료(=검수 시작 가능). 대표컷 누끼는 그 뒤에도 계속 돈다 —
 * 사람을 누끼까지 기다리게 할 이유가 없어서 이 순간 웹이 검수 화면으로 넘어간다.
 */
let genTask = {
  running: false, folder: '', products: 0,
  phase: null, done: 0, total: 0,
  startedAt: 0, updatedAt: 0, reviewReady: false,
  code: null, error: null,
};
/** 웹이 이 진행을 지켜본 마지막 시각 — 브라우저 창을 또 열지 말지 판단한다. */
let genWatchedAt = 0;
/**
 * 검수 화면을 **웹이 직접 열었나**(이번 생성 한정).
 * 웹은 검수 준비가 되는 순간 스스로 그 화면으로 넘어가고 폴링을 멈춘다. 그러면 genWatchedAt
 * 은 그 시점에 멈춰 있는데, 남은 누끼가 몇 분씩 걸리면 "안 보고 있다"로 오판해 도우미가
 * 브라우저를 또 열어 같은 화면이 탭 두 개로 뜬다. 그래서 시간이 아니라 **사실**로 판단한다.
 */
let genHandedOff = false;

/**
 * 폴더 하나를 올인원으로 넘기고 진행을 genTask 에 적재한다.
 * 시작만 하고 즉시 돌아온다(생성은 수 분~수십 분).
 */
function startAllinone(folder, products) {
  if (typeof deps.runAllinone !== 'function') {
    pushLog('상세페이지 자동 생성을 건너뜁니다 — 이 실행 경로에는 올인원이 연결돼 있지 않습니다.');
    return false;
  }
  const now = Date.now();
  genHandedOff = false;          // 새 생성 — 검수 화면 인계 여부는 처음부터 다시 센다
  genTask = {
    running: true, folder, products: products || 0,
    phase: null, done: 0, total: 0,
    startedAt: now, updatedAt: now, reviewReady: false,
    code: null, error: null,
  };
  pushStatus();
  Promise.resolve()
    .then(() => deps.runAllinone({
      folder,
      onProgress: (p) => {
        genTask.phase = p?.phase || null;
        genTask.done = Number(p?.done) || 0;
        genTask.total = Number(p?.total) || 0;
        genTask.updatedAt = Date.now();
      },
      onReviewReady: () => {
        genTask.reviewReady = true;
        genTask.updatedAt = Date.now();
        pushStatus();
      },
      onDone: (code, reason) => {
        genTask.running = false;
        genTask.code = typeof code === 'number' ? code : null;
        genTask.error = code === 0 ? null : (reason || '생성이 실패했습니다.');
        genTask.updatedAt = Date.now();
        pushStatus();
      },
      // 웹 화면이 지켜보고 있으면 그 화면이 스스로 검수로 넘어간다 — 창을 또 열면 탭이 둘이 된다.
      shouldOpenReview: () => !genHandedOff && Date.now() - genWatchedAt > 60_000,
    }))
    .catch((e) => {
      genTask.running = false;
      genTask.error = String(e?.message || e);
      genTask.updatedAt = Date.now();
      pushLog(`❌ 상세페이지 생성을 시작하지 못했습니다 — ${genTask.error}. `
        + `올인원 화면에서 폴더 "${folder}" 를 직접 골라 실행하면 됩니다.`);
      pushStatus();
    });
  return true;
}

/**
 * 카탈로그에서 고른 상품을 **내 PC 로 가져온다** — 올인원 입력 폴더를 만든다.
 * ---------------------------------------------------------------------------
 * ★ 상세 추출과 결정적으로 다르다: **네이버 페이지를 열지 않는다.** 옵션·상세글·고시정보는
 *   관리자가 이미 받아 서버에 넣어 뒀고, 여기서 하는 일은 그 JSON 을 폴더로 굽고 이미지를
 *   CDN(pstatic)에서 받는 것뿐이다. CDN 은 로그인도 안티봇도 없다 —— 그래서 셀러는 네이버
 *   로그인도, 캡차도, 429 도 겪지 않는다. 이 구분이 이 설계의 핵심이다.
 * 그래서 건당 30~90초가 아니라 **몇 초**다.
 */
export async function importProducts({ products = [], rootDir = '', autoAllinone = true } = {}) {
  const list = (products || []).filter((p) => p && (p.productNo || p.channelProductNo));
  if (!list.length) throw new Error('가져올 상품이 없습니다.');
  if (importTask.running) throw new Error('이미 가져오기가 진행 중입니다.');

  // 실행마다 제 폴더 — 이번에 고른 것만 생성·검수한다(누적 폴더 재생성 방지).
  const root = ensureRoot(join(rootDir || join(deps.userDataDir || '.', 'naver-sourcing'), runFolderName()));
  importTask = { running: true, total: list.length, done: 0, ok: 0, failed: 0, current: '', rootDir: root, stopped: null, at: Date.now() };
  pushLog(`카탈로그에서 ${list.length}개를 가져옵니다 — 이미지만 받으므로 네이버 페이지는 열지 않습니다.`);
  pushStatus();

  /**
   * 상품을 **동시에** 굽는다.
   * ---------------------------------------------------------------------------
   * 예전엔 `for (const p of list)` 한 건씩이었다. 상품 1건은 이미지 25장을 받는 게 거의
   * 전부인데, 그 25장이 다 끝나야 다음 상품이 시작됐다 —— 100개면 3~8분이 이 배리어에서
   * 나왔다. 상품끼리는 서로를 참조하지 않는다(각자 제 폴더를 쓴다).
   *
   * ★ 네트워크로 나가는 양은 **1도 늘지 않는다.** 총량은 detail-extract 의 전역 예산
   *   (CDN_LANES)이 정하고, 여기서 늘어나는 것은 그 예산을 놀리지 않고 채우는 것뿐이다.
   *   상세 추출(네이버 페이지)과 달리 여기는 CDN 뿐이라 게이트·로그인·캡차가 없다.
   */
  const IMPORT_LANES = Math.max(1, Math.min(6, list.length));
  (async () => {
    let cursor = 0;
    const one = async (p) => {
      importTask.current = p.title || p.productNo;
      try {
        // writeProductFolder 가 기대하는 모양으로 맞춘다(상세 추출 결과와 동일한 계약).
        const saved = await writeProductFolder(root, {
          channelProductNo: String(p.productNo || p.channelProductNo),
          originProductNo: p.originProductNo || '',
          url: p.url || '',
          title: p.title || '',
          name: p.title || '',
          price: p.price || 0,
          brand: p.brand || '',
          categoryPath: p.categoryPath || '',
          categoryId: p.categoryId || '',
          options: p.options || [],
          detailText: p.detailText || '',
          notice: p.notice || null,
          mainImages: p.images?.main || [],
          detailImages: p.images?.detail || [],
          reviewImages: p.images?.review || [],
        }, { onLog: pushLog });
        importTask.ok += 1;
        // 진행 번호는 인덱스가 아니라 **완료 개수**다 — 동시 처리에선 순서대로 끝나지 않아
        //   인덱스를 쓰면 웹 진행바가 뒤로 튄다(ai-batch·run-folder 와 같은 이유).
        importTask.done += 1;
        pushLog(`✅ ${importTask.done}/${importTask.total} ${String(p.title || '').slice(0, 34)} — 대표 ${saved.mainImages}장 · 상세 ${saved.detailImages}장 · 리뷰 ${saved.reviewImages}장`);
      } catch (e) {
        importTask.failed += 1;
        importTask.done += 1;
        pushLog(`❌ ${importTask.done}/${importTask.total} 실패 — ${e?.message || e}`);
      }
    };
    const lane = async () => { while (cursor < list.length) await one(list[cursor++]); };
    await Promise.all(Array.from({ length: IMPORT_LANES }, lane));
    importTask.running = false;
    importTask.current = '';
    importTask.stopped = '완료';
    pushLog(`가져오기 완료 — 성공 ${importTask.ok} · 실패 ${importTask.failed} · ${importTask.rootDir}`);
    pushStatus();

    // 폴더가 준비됐으면 바로 올인원으로 넘긴다 — 사람이 폴더를 다시 고르지 않게.
    if (autoAllinone && importTask.ok) {
      pushLog(`상세페이지 자동 생성을 시작합니다 — 상품 ${importTask.ok}개. 끝나면 검수 화면이 열립니다.`);
      // ⚠️ importTask.running=false 와 genTask.running=true 사이에 await 를 두지 않는다.
      //    웹 폴링이 그 틈에 들어오면 "둘 다 안 돌고 있다"로 보고 진행 표시를 접어 버린다.
      startAllinone(importTask.rootDir, importTask.ok);
    }
  })().catch((e) => {
    importTask = { ...importTask, running: false, stopped: `실패: ${e?.message || e}` };
    pushLog(`❌ 가져오기 실패 — ${e?.message || e}`);
    pushStatus();
  });

  return { ok: true, started: true, total: list.length, rootDir: root };
}

/**
 * 가져오기 + 그다음 단계(상세페이지 생성) 상태를 한 번에 준다.
 * 폴링 요청이 하나여야 웹이 "가져오기 → 생성 → 검수"를 끊김 없이 한 줄로 그린다.
 * @param {{web?: boolean, handoff?: boolean}} opts
 *   web=true 면 웹이 지켜보는 중으로 기록하고, handoff=true 면 검수 화면을 웹이 직접 열었다고
 *   기록한다(둘 다 도우미가 브라우저를 중복으로 열지 않게 하는 신호다).
 */
export function getImportState({ web = false, handoff = false } = {}) {
  if (web) genWatchedAt = Date.now();
  if (handoff) genHandedOff = true;
  return { ...importTask, gen: { ...genTask } };
}

/**
 * 상세 요청 큐 처리 — 셀러가 카탈로그에서 고른 상품의 상세를 **관리자 도우미가 대신** 뽑는다.
 * ---------------------------------------------------------------------------
 * 왜 도우미가 도나: 셀러 PC 가 직접 네이버를 열면 셀러마다 로그인·캡차·429 를 겪는다. 요청은
 * 서버에 쌓이고, 네이버를 두드리는 IP 는 계속 관리자 하나뿐이어야 한다.
 *
 * 페이싱은 기존 게이트가 그대로 맡는다 — 이 루프가 별도 속도를 만들지 않는다. 한 번에 몇 건만
 * 쥐는 이유도 같다: 많이 쥐면 앱이 꺼졌을 때 그만큼 'running' 으로 묶인 채 남는다(서버가 30분
 * 뒤 회수하지만 그동안 셀러는 기다린다).
 */
let queueTimer = null;
let queueBusy = false;
let queueOpts = { idle: false };

const QUEUE_POLL_MS = 60_000;
/**
 * 한 판이 붙잡고 있을 수 있는 최대 시간. 큐가 마를 때까지 도는 구조라 상한이 없으면
 * idle 모드(미수집분 채우기)에서 한 판이 영영 끝나지 않는다 — 그러면 `kickQueue` 도,
 * 설정 변경도 계속 'busy' 로 튕긴다. 끊어도 손해가 없다: 다음 주기가 이어서 집는다.
 * 셀러 요청 100건은 8~12분이라 이 상한에 닿지 않는다.
 */
const DRAIN_MAX_MS = 20 * 60_000;

/**
 * 서버에서 다음 작업 묶음을 집어 온다.
 * limit 은 곧 "창 수" 다 — 창보다 많이 쥐어 봐야 앞에서 줄만 서고, 앱이 꺼지면 그만큼
 * 'running' 으로 묶인 채 30분을 남긴다(서버가 그때 회수한다).
 */
async function claimJobs(limit = 3) {
  const token = await deps.getToken?.();
  const origin = deps.webOrigin;
  if (!token || !origin) return [];
  try {
    const q = `?limit=${limit}${queueOpts.idle ? '&idle=1' : ''}`;
    const res = await fetch(`${origin}/api/megaload/naver-sourcing/products/queue${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j.jobs) ? j.jobs : [];
  } catch { return []; }
}

/** 상세 1건 — 뽑아서 서버에 올리고 결과를 로그로 남긴다. 예외를 밖으로 던지지 않는다. */
async function runQueueJob(p, job, root) {
  const r = await extractOne(p, job.url, root, { onLog: pushLog })
    .catch((e) => ({ ok: false, url: job.url, error: String(e?.message || e) }));
  // productNo 는 서버가 준 값을 쓴다 — 실패하면 data 가 없어 어디에 기록할지 모른다.
  const up = await uploadDetail(r, { ...(r.data || {}), channelProductNo: job.product_no });
  if (!up.ok && up.reason !== 'no-session') {
    pushLog(`⚠️ 요청 상세 저장 실패(${up.reason}) — ${job.title || job.product_no}`);
  }
  delete r.data;
  pushLog(r.ok
    ? `✅ 요청 처리 — ${String(job.title || '').slice(0, 34)}`
    : `❌ 요청 처리 실패 — ${String(job.title || '').slice(0, 34)}: ${r.error}`);
  return !!r.ok;
}

/**
 * 큐가 마를 때까지 **창 수만큼 동시에** 처리한다.
 * ---------------------------------------------------------------------------
 * 예전엔 3건을 `for...await` 로 한 건씩 처리하고 60초를 잤다. 창은 3개인데 1개만 일했고,
 * 100건이면 34번 잠들어 50~150분이 걸렸다 —— 웹의 대기 한도(8분)를 구조적으로 넘겼다.
 *
 * ★ 네이버에 가는 부하는 1도 늘지 않는다. 총량은 `naverGate`(평균 5초 간격, capacity 1)가
 *   강제하고 이 루프는 그 밖에 있다. 늘어나는 것은 **노는 창을 채우는 것뿐**이다.
 *
 * 사람이 직접 시킨 수집/추출이 끼어들면 **새로 집는 것만** 멈춘다. 이미 쥔 것(최대 창 수)은
 * 끝까지 처리한다 — 서버에 반납하는 길이 없어서, 버리면 30분간 'running' 으로 남는다.
 */
async function drainQueue(p, root, want, seed = []) {
  const buf = [...seed];
  const until = Date.now() + DRAIN_MAX_MS;
  let dry = false;
  let cut = false;
  let claiming = null;

  const take = async () => {
    for (;;) {
      if (buf.length) return buf.shift();
      if (dry) return null;
      if (detail.running || collection.running) { dry = true; return null; }
      if (Date.now() > until) { dry = true; cut = true; return null; }
      // 서버에 손을 뻗는 건 한 번에 하나만 — 동시에 부르면 창 수보다 많이 쥔다.
      if (!claiming) {
        claiming = claimJobs(want)
          .then((jobs) => { if (jobs.length) buf.push(...jobs); else dry = true; })
          .catch(() => { dry = true; })
          .finally(() => { claiming = null; });
      }
      await claiming;
    }
  };

  let done = 0;
  let ok = 0;
  const worker = async () => {
    for (;;) {
      const job = await take();
      if (!job) return;
      if (await runQueueJob(p, job, root)) ok += 1;
      done += 1;
    }
  };

  await Promise.all(Array.from({ length: want }, () => worker()));
  return { done, ok, cut };
}

/** 크롬 없음 안내는 한 번만 — 60초마다 같은 줄이 쌓이면 진짜 로그가 안 보인다. */
let noChromeWarned = false;

/** 셀러 도우미가 "로그인이 없어 쉰다"는 안내는 한 번만 — 60초마다 같은 줄을 쌓지 않는다. */
let noLoginWarned = false;

async function queueTick() {
  if (queueBusy || detail.running || collection.running) return;   // 사람이 시킨 일이 우선이다

  /**
   * ★ 셀러 도우미도 **자기 요청은 자기 IP 로** 뽑는다(2026-09-02).
   * ---------------------------------------------------------------------------
   * 원래는 관리자 도우미 한 대만 뽑았다. 그 한 대가 멈추면 셀러 전원이 멈췄고, 처리량도
   * 그 한 대의 분당 12건이 전부였다(실측: 10개를 골라도 매번 5개만 왔다).
   * 이제 서버가 셀러에게도 **자기가 요청한 것만** 내준다.
   *
   * ⚠️ 다만 **이미 로그인돼 있을 때만** 돈다. 여기서 자동 로그인을 돌리면 셀러마다 로그인
   *    시도가 붙고, 캡차는 정확히 그 시도에 붙는다(실측: 하루 4번) — 이 프로젝트가 계속
   *    피해 온 것이다. 로그인이 없으면 조용히 쉬고, 예전처럼 관리자 큐가 대신 뽑는다.
   *    즉 셀러에게 네이버 계정을 **요구하지 않는다.** 해 둔 사람만 자기 IP 를 쓴다.
   */
  if (!isAdmin()) {
    let loggedIn = false;
    try { loggedIn = !!(await loginState())?.loggedIn; } catch { loggedIn = false; }
    if (!loggedIn) {
      if (!noLoginWarned) {
        noLoginWarned = true;
        pushLog('네이버 로그인이 없어 상세 준비를 쉽니다 — 로그인해 두시면 고르신 상품의 상세를 '
          + '이 PC 에서 직접 준비합니다(더 빨리 옵니다). 안 하셔도 관리자 쪽에서 준비됩니다.');
      }
      return;
    }
    noLoginWarned = false;
  }

  // 이 워커는 기본으로 켜져 무인으로 돈다 — 크롬이 없으면 조용히 쉰다(에러를 매분 찍지 않는다).
  if (!isChromeAvailable()) {
    if (!noChromeWarned) {
      noChromeWarned = true;
      pushLog('구글 크롬이 없어 셀러 요청 상세 준비를 쉽니다 — 크롬을 설치하면 자동으로 다시 돕니다.');
    }
    return;
  }
  noChromeWarned = false;
  queueBusy = true;
  try {
    const p = ensurePool();
    // 차단이 감지되면 게이트가 권하는 창 수가 줄어든다 — 그 값을 그대로 따른다.
    const want = Math.max(1, p.effectiveCount);
    // 빈손인지 먼저 본다 — 큐가 비었는데 로그인·창을 깨우면 매분 헛되이 네이버를 두드린다.
    const seed = await claimJobs(want);
    if (!seed.length) return;

    // 로그인이 끊겨 있으면 되살린다(창을 잡기 전에 — 안 그러면 창 1개 설정에서 교착).
    //   ⚠️ 관리자에서만 한다. 셀러 경로는 위 게이트를 이미 통과했으므로 로그인이 살아 있고,
    //      여기서 굳이 로그인 흐름을 타면 캡차를 자초한다(셀러 PC 에서 캡차는 막다른 길이다).
    if (isAdmin()) await ensureNaverLogin().catch(() => null);
    if (!p.running) await p.start();
    const root = ensureRoot(join(deps.userDataDir || '.', 'naver-sourcing'));
    pushLog(`셀러 요청 상세를 처리합니다 — 창 ${want}개 동시, 큐가 빌 때까지.`);

    const run = await drainQueue(p, root, want, seed);
    pushLog(`요청 큐 정리 — 처리 ${run.done}건 · 성공 ${run.ok}건.`
      + (run.cut ? ' 남은 것은 다음 주기에 이어서 처리합니다.' : ''));
  } catch (e) {
    pushLog(`요청 큐 처리 오류 — ${e?.message || e}`);
  } finally {
    queueBusy = false;
  }
}

/**
 * 큐를 **지금 당장** 한 번 돌린다 — 셀러가 방금 요청을 걸었을 때 웹이 부른다.
 * ---------------------------------------------------------------------------
 * 자동 처리는 60초 주기라, 요청하자마자 걸리면 아무 일도 안 하는 채로 최대 1분을 흘려보낸다.
 * 상세 추출 자체가 1분 남짓인데 대기가 그만큼 더 붙으면 사람은 멈춘 걸로 본다.
 * 관리자가 아니면 서버가 작업을 안 주므로(claimJobs 가 빈 배열) 여기서 따로 막지 않는다.
 */
export function kickQueue() {
  if (queueBusy || detail.running || collection.running) return { ok: true, started: false, reason: 'busy' };
  queueTick().catch(() => { /* 실패는 다음 주기가 다시 집는다 */ });
  return { ok: true, started: true };
}

/** 큐 자동 처리 시작/중지. idle=true 면 요청이 없을 때 미수집분까지 채운다. */
export function setQueueWorker({ on = true, idle = false } = {}) {
  requireAdmin();
  queueOpts = { idle: !!idle };
  deps.store?.set('naverIngestQueueWorker', { on: !!on, idle: !!idle });
  if (queueTimer) { clearInterval(queueTimer); queueTimer = null; }
  if (!on) { pushLog('상세 요청 자동 처리를 껐습니다.'); pushStatus(); return { on: false }; }
  queueTimer = setInterval(() => { queueTick().catch(() => {}); }, QUEUE_POLL_MS);
  if (queueTimer.unref) queueTimer.unref();
  setTimeout(() => { queueTick().catch(() => {}); }, 5000).unref?.();
  pushLog(idle
    ? '상세 요청 자동 처리를 켰습니다 — 요청이 없을 때는 아직 안 받은 상품을 미리 채웁니다.'
    : '상세 요청 자동 처리를 켰습니다 — 셀러가 요청한 상품만 처리합니다.');
  pushStatus();
  return { on: true, idle: !!idle };
}

export function getQueueState() {
  // 기본값은 initService 와 같아야 한다 — 다르면 화면이 "꺼짐"이라 말하는데 실제로는 돌고 있다.
  const saved = deps.store?.get('naverIngestQueueWorker', null) || { on: true, idle: true };
  return { ...saved, running: !!queueTimer, busy: queueBusy };
}

export function stopDetailExtract() {
  detailAbort?.abort();
  detail.running = false;
  pushLog('상세 추출을 중단했습니다.');
  return { ok: true };
}

/** 수집 결과 — 큰 배열이라 status 와 분리해서 필요할 때만 가져간다. */
export function getCollection() {
  return collection;
}

/**
 * 네이버 로그인 창 — **사람이 직접 로그인한다**. 우리는 계정 정보를 받지도, 저장하지도 않는다.
 *
 * 왜 필요한가: 상품 목록(search.shopping.naver.com)은 로그인 세션이 없으면 nid 로그인 화면으로
 * 리다이렉트된다(실측). 확장프로그램 방식이 됐던 이유가 "이미 로그인된 크롬 안에서 돌아서" 였다.
 * 여기서 한 번 로그인해 두면 쿠키가 크롬 프로필(userData/chrome-profile)에 남아 이후는 무인이다.
 * 그 프로필 하나를 수집·상세·카테고리·품절 감시가 **전부 공유한다** — 저장소가 둘로 갈렸을 때
 * "✅ 자동 로그인 성공" 직후에 "로그인이 필요합니다"가 찍히던 모순이 그래서 사라졌다.
 *
 * 로그인 화면은 사람이 봐야 하므로 이 탭에서는 이미지를 막지 않는다(보안문자가 안 보이면 진행 불가).
 */
export async function openNaverLogin() {
  // 게이트 없음 — 네이버 로그인은 **모든 셀러**가 각자 해야 한다(품절 감시의 전제).
  if (loginTask) return { ok: true, already: true };

  pushLog('네이버 로그인 창을 엽니다 — 크롬 창에서 직접 로그인하세요. 한 번만 하면 이후 수집은 무인으로 진행됩니다.');

  loginTask = withTempTab('네이버 로그인 대기', async (sw) => {
    sw.status = 'login';
    // 보안문자가 보여야 사람이 풀 수 있다 — 이 탭에서는 이미지를 막지 않는다.
    await sw.setMediaBlocked(false);
    await sw.gotoViaClick('https://nid.naver.com/nidlogin.login', { skipReady: true, timeoutMs: 20000 });
    await sw.show();
    pushStatus();

    // "로그인 상태 유지"를 대신 켠다 — 이걸 놓치면 로그인은 되는데 앱을 끄는 순간 풀린다.
    // 화면이 아직 안 그려졌을 수 있어 잠깐씩 세 번 시도한다.
    for (let i = 0; i < 3; i++) {
      const k = await sw.evaluate(keepLoginJs).catch(() => null);
      if (k?.found) {
        // 체크를 못 켜도 로그인은 유지된다(도우미가 쿠키에 직접 만료시각을 붙인다) —
        // 사람에게 겁을 주지 않는다. 켜면 네이버 쪽 세션도 길어지니 시도는 계속 한다.
        if (k.now) pushLog('로그인 화면의 "로그인 상태 유지"를 켰습니다.');
        break;
      }
      await new Promise((r) => { const t = setTimeout(r, 1500); t.unref?.(); });
    }

    // 최대 15분 대기. 창을 열어 둔 채 무한정 잡고 있으면 수집 창이 영영 안 돌아온다.
    for (let i = 0; i < 180; i++) {
      await new Promise((r) => { const t = setTimeout(r, 5000); t.unref?.(); });
      const st = await loginState();
      if (st.loggedIn) {
        // 세션 쿠키로 왔으면 여기서 만료시각을 붙인다 — 사람에게 "로그인 상태 유지를 켜라"고
        // 떠넘기던 자리다. 그 체크는 캡차 화면을 지나면 저절로 풀려서 지킬 수가 없었다.
        const kept = st.persistent ? 0 : await persistLoginCookies().catch(() => 0);
        loginCache = { loggedIn: true, persistent: !!(st.persistent || kept), at: Date.now() };
        pushLog(st.persistent || kept
          ? '✅ 네이버 로그인 완료 — 이제 목록 수집이 됩니다. 앱을 껐다 켜도 유지됩니다.'
          : '✅ 네이버 로그인 완료 — 이제 목록 수집이 됩니다.');
        sw.status = 'idle';
        sw.detail = '';
        return { ok: true, loggedIn: true };
      }
    }
    pushLog('로그인 대기를 종료합니다(15분) — 필요하면 다시 눌러주세요.');
    sw.status = 'idle';
    return { ok: false, loggedIn: false };
  }).finally(() => {
    loginTask = null;
    pushStatus();
  });

  return { ok: true, started: true };
}

// ── 자동 로그인 ───────────────────────────────────────────────────────
// 로그인은 이 파이프라인에서 **사람 손이 필요한 유일한 단계**였다. 세션이 끊길 때마다
// 수집이 통째로 멈추므로, 계정을 한 번 넣어 두면 도우미가 알아서 다시 로그인한다.
//
// 넘지 않는 선 3가지 (지키지 않으면 계정이 위험해진다):
//   ① 비밀번호 오류면 **재시도하지 않는다**. 반복 실패는 계정 잠금이다. 저장을 지우고 멈춘다.
//   ② 캡차·2단계 인증은 뚫지 않는다. 창을 사람에게 띄우고 기다린다.
//   ③ 비밀번호는 로그·상태·응답 어디에도 안 싣는다(naver-credentials.mjs 규칙 ②③).

let autoLoginTask = { running: false, at: 0, result: null };

/**
 * 사람이 풀어야 하는 벽(캡차·2단계)에 막힌 시각.
 * ★ 왜 필요한가(실측 2026-08-18): 캡차 대기가 10분 만에 끝나자마자 자동으로 다시 로그인을
 *   시도해 또 캡차를 받았다. 사람이 자리에 없으면 이게 계속 반복된다 — 이미 429 를 26번
 *   맞은 IP 로 로그인 폼을 두드리는 짓이라 상황을 악화시키고 계정도 위험해진다.
 *   막힌 뒤에는 **자동 재시도를 멈추고** 사람이 버튼을 누를 때까지 기다린다.
 */
let humanBlockedAt = 0;
const HUMAN_BLOCK_QUIET_MS = 30 * 60 * 1000;

/**
 * 로그인 실패 백오프 — **캡차를 부르는 건 로그인 시도 그 자체다.**
 * ---------------------------------------------------------------------------
 * 실측 2026-08-28. 세션이 죽어 있는 동안 이런 패턴이 찍혔다:
 *   10:19 로그인 시도 → 보안문자 → 10:29 대기 종료
 *   11:01 로그인 시도 → 보안문자 → 11:11 종료
 *   12:17 로그인 시도 → 보안문자 → 12:27 종료
 * 30분 고정 침묵(HUMAN_BLOCK_QUIET_MS)만으로는 "한 시간에 한 번씩 로그인 폼을 두드리는"
 * 패턴이 그대로 남는다. 네이버 입장에서 이건 정확히 자동화의 모양이고, 그래서 시도할 때마다
 * 또 캡차가 붙는다 — 실패가 실패를 부르는 고리다.
 *
 * 그래서 **연속 실패 횟수만큼 간격을 배로 늘린다.** 성공하면 그 자리에서 0 으로 되돌린다.
 * 사람이 "지금 자동 로그인"을 누르면 해제한다 — 사람이 화면 앞에 있으면 캡차는 문제가 아니다.
 */
const LOGIN_BACKOFF_BASE_MS = 30 * 60 * 1000;   // 첫 실패 뒤 30분
const LOGIN_BACKOFF_MAX_MS = 6 * 60 * 60 * 1000; // 상한 6시간 — 그 이상은 사람을 부르는 게 맞다
let loginFailStreak = 0;
let loginBackoffUntil = 0;

/**
 * 보안문자를 통과한 뒤 네이버가 로그인 화면으로 되돌릴 때, 자동으로 다시 제출해 보는 횟수.
 * ★ 작게 잡는 이유: 되돌림이 세 번 넘게 반복되면 그건 재제출로 풀리는 문제가 아니다.
 *   그런데도 계속 제출하면 **그 시도 자체가 다음 캡차를 부른다**(위 백오프 주석의 그 고리).
 *   사람은 이미 창 앞에 있으므로, 상한을 넘으면 조용히 넘겨주는 편이 항상 낫다.
 */
const RELOGIN_MAX_TRIES = 3;

/** 실패를 기록하고 다음 시도 가능 시각을 민다. */
function noteLoginFailure(reason) {
  loginFailStreak++;
  const wait = Math.min(LOGIN_BACKOFF_MAX_MS, LOGIN_BACKOFF_BASE_MS * 2 ** (loginFailStreak - 1));
  loginBackoffUntil = Date.now() + wait;
  pushLog(`자동 로그인이 ${loginFailStreak}회 연속 실패했습니다(${reason}) — `
    + `${Math.round(wait / 60000)}분 동안 시도하지 않습니다. 로그인 시도가 잦을수록 보안문자가 더 자주 붙습니다.`);
}

/** 성공 — 고리를 끊는다. */
function noteLoginSuccess() {
  loginFailStreak = 0;
  loginBackoffUntil = 0;
}

/** 자동 로그인이 가능한 상태인지 — 웹 화면이 버튼을 켤지 말지 판단하는 값. */
export async function credentialStatus() {
  // 게이트 없음 — 네이버 로그인은 **모든 셀러**가 각자 해야 한다(품절 감시의 전제).
  return { ...credentialInfo(), encryption: await encryptionAvailable() };
}

export async function saveNaverCredential({ id, pw }) {
  // 게이트 없음 — 네이버 로그인은 **모든 셀러**가 각자 해야 한다(품절 감시의 전제).
  const info = await saveCredentials(id, pw);
  pushLog(`네이버 계정을 저장했습니다 (${info.idMasked}) — 이제 세션이 끊기면 도우미가 알아서 다시 로그인합니다.`);
  pushStatus();
  // 저장 즉시 한 번 시도한다 — "저장은 됐는데 되는지는 모른다"를 남기지 않는다.
  return autoLoginNow();
}

export function clearNaverCredential() {
  // 게이트 없음 — 네이버 로그인은 **모든 셀러**가 각자 해야 한다(품절 감시의 전제).
  clearCredentials();
  pushLog('저장된 네이버 계정을 지웠습니다 — 자동 로그인이 꺼집니다.');
  pushStatus();
  return { ok: true };
}

/**
 * 수집·진단이 시작될 때 부른다. 로그인돼 있으면 아무 일도 하지 않고,
 * 끊겼는데 계정이 저장돼 있으면 조용히 다시 로그인한다.
 */
export async function ensureNaverLogin() {
  // ★ 크롬을 먼저 띄운다. loginState() 는 크롬이 안 떠 있으면 마지막 확인값(stale)을 돌려주는데,
  //   그 값으로 판단하면 두 가지 오답이 난다: 멀쩡한 로그인을 못 봐서 쓸데없이 자동 로그인을
  //   돌리거나(그게 캡차다), 이미 풀린 로그인을 살아 있다고 보고 수집이 통째로 헛돈다.
  //   여기까지 온 호출자는 어차피 곧 네이버를 두드린다 — 띄워도 손해가 아니다.
  await ensureChromeBrowser().catch(() => null);
  const st = await loginState();
  if (st.loggedIn) { noteLoginSuccess(); return { ok: true, already: true }; }

  // ★ 로그인은 **마지막 수단**이다. 캡차는 로그인 시도에 붙기 때문이다(실측: 하루 4번).
  //   ① 반쪽 세션(NID_AUT 는 있고 NID_SES 만 없음)이면 네이버 방문 1회로 되살아난다 —
  //      로그인 화면을 아예 거치지 않으므로 캡차가 뜰 자리가 없다.
  if (st.hasAuth) {
    const rev = await reviveSession({ onLog: pushLog }).catch(() => null);
    if (rev?.loggedIn) {
      loginCache = { loggedIn: true, persistent: true, at: Date.now() };
      noteLoginSuccess();        // 로그인 화면을 안 거치고 살아났다 — 실패 집계를 끌 이유가 충분하다
      pushStatus();
      return { ok: true, revived: true };
    }
  }

  //   ② 네이버가 지금 우리를 막고 있는 중이면(429 쿨다운) 그건 **세션 문제가 아니다**.
  //      이때 로그인을 시도하면 이미 달아오른 IP 로 로그인 폼을 두드리는 꼴이라 캡차를 자초한다.
  const gate = naverGate.state();
  if (gate.cooling) {
    pushLog(`네이버가 막고 있는 중이라(${Math.ceil(gate.cooldownMsLeft / 1000)}초) 로그인은 미룹니다 — 캡차를 자초하지 않기 위해서입니다.`);
    // ⚠️ 이건 로그인 실패가 아니다(시도조차 안 했다). 백오프에 세면 쿨다운 위에 백오프가
    //    또 얹혀 복구가 몇 배로 늦어진다 — 게이트가 풀리면 바로 다시 시도해야 한다.
    return { ok: false, reason: 'cooling' };
  }

  if (!hasCredentials()) return { ok: false, reason: 'no-credential' };
  if (autoLoginTask.running) return { ok: false, reason: 'running' };
  // ★ 연속 실패 백오프 — 로그인 시도 자체가 캡차를 부르므로, 실패가 쌓이면 간격을 벌린다.
  //   (사람이 "지금 자동 로그인"을 누르면 autoLoginNow 가 이 값을 푼다.)
  if (Date.now() < loginBackoffUntil) {
    return { ok: false, reason: 'backoff', retryInMs: loginBackoffUntil - Date.now() };
  }
  // 방금 캡차/2단계에 막혔으면 자동으로는 다시 시도하지 않는다 — 사람이 없는데 반복해 봐야
  // 네이버에 로그인 시도만 쌓인다. 사람이 "지금 자동 로그인"을 누르면 그때 다시 간다.
  if (Date.now() - humanBlockedAt < HUMAN_BLOCK_QUIET_MS) {
    pushLog('네이버가 사람 확인(보안문자/2단계)을 요구한 상태라 자동 재시도를 멈춥니다 — 화면의 "지금 자동 로그인"을 눌러 창에서 한 번 통과시켜 주세요.');
    return { ok: false, reason: 'human-required' };
  }
  return autoLoginNow();
}

/** 사람이 직접 누른 경우 — 위 조용히-기다리기를 해제하고 간다. */
export async function autoLoginNow({ byHuman = false } = {}) {
  // 사람이 화면 앞에 있으면 캡차는 막힘이 아니다 — 침묵도 백오프도 푼다.
  if (byHuman) { humanBlockedAt = 0; noteLoginSuccess(); }
  if (autoLoginTask.running) return { ok: false, reason: 'running' };
  const creds = await loadCredentials();
  if (!creds) return { ok: false, reason: 'no-credential' };

  autoLoginTask = { running: true, at: Date.now(), result: null };
  pushStatus();

  const finish = (result) => {
    // ★ 여기가 유일한 종료 지점이다 — 성공·실패·캡차·타임아웃이 전부 이 문을 지난다.
    //   그래서 백오프 집계도 여기 한 곳에서만 한다(경로마다 넣으면 반드시 하나를 빠뜨린다).
    if (result?.ok) noteLoginSuccess();
    else if (result?.reason && result.reason !== 'running' && result.reason !== 'no-credential') {
      noteLoginFailure(result.reason);
    }
    autoLoginTask = { running: false, at: Date.now(), result };
    pushStatus();
    return result;
  };

  try {
    // ★ 풀에서 빌리지 않고 임시 탭을 쓴다(withTempTab 머리말 참고) — 목록 수집이 0번 탭을 쥔
    //   동안 세션이 끊기면, 풀에서 빌리는 구조로는 서로를 영원히 기다린다.
    return await withTempTab('자동 로그인', async (sw) => {
      sw.status = 'login';
      // 캡차가 뜨면 사람이 봐야 하므로 이 탭에서는 이미지를 막지 않는다.
      await sw.setMediaBlocked(false);
      pushLog('네이버 자동 로그인을 시도합니다…');

      await naverGate.acquire('ingest');
      const nav = await sw.gotoViaClick('https://nid.naver.com/nidlogin.login', { skipReady: true, timeoutMs: 20000 });
      if (!nav.ok) {
        pushLog(`자동 로그인 실패 — 로그인 화면을 열지 못했습니다(${nav.error || 'unknown'}).`);
        return finish({ ok: false, reason: 'nav-failed' });
      }
      await sleep(1500);

      const filled = await sw.evaluate(naverAutoLoginJs(creds.id, creds.pw))
        .catch((e) => ({ ok: false, reason: String(e?.message || e) }));
      // 여기서 자격증명의 수명은 끝난다 — 아래로 흘려보내지 않는다.
      creds.pw = '';

      if (!filled?.ok) {
        pushLog(`자동 로그인 실패 — 로그인 화면을 다루지 못했습니다(${filled?.reason || 'unknown'}). 창에서 직접 로그인해 주세요.`);
        sw.keepOpen = true;
        await sw.show();
        return finish({ ok: false, reason: filled?.reason || 'fill-failed' });
      }

      // 제출 결과는 화면 문구가 아니라 **쿠키**로 본다(문구는 자주 바뀌고 오판한다).
      for (let i = 0; i < 25; i++) {
        await sleep(1000);
        const st = await loginState();
        if (st.loggedIn) {
          loginCache = { loggedIn: true, persistent: !!st.persistent, at: Date.now() };
          // 세션 쿠키로 왔으면 만료시각을 붙여 디스크에 남긴다 — 재시작마다 캡차를 다시 푸는 일을 없앤다.
          const kept = st.persistent ? 0 : await persistLoginCookies();
          pushLog(st.persistent || kept
            ? '✅ 네이버 자동 로그인 성공 — 이 PC 에 로그인이 남아 도우미를 껐다 켜도 유지됩니다.'
            : '✅ 네이버 자동 로그인 성공 — 다만 세션 쿠키라 앱을 끄면 풀립니다(다음 실행 때 다시 자동 로그인합니다).');
          sw.status = 'idle';
          sw.detail = '';
          return finish({ ok: true, persistent: !!st.persistent });
        }
      }

      const ps = await sw.evaluate(loginPageStateJs).catch(() => null);

      // ① 자격증명 오류 — 절대 재시도하지 않는다.
      if (ps?.badCredential) {
        clearCredentials();
        pushLog('❌ 저장된 네이버 아이디/비밀번호가 맞지 않습니다 — 저장을 지웠습니다. 반복 시도는 계정 잠금 위험이 있어 하지 않습니다. 계정을 다시 저장해 주세요.');
        return finish({ ok: false, reason: 'bad-credential' });
      }

      // ② 캡차 / 2단계 인증 — 사람에게 넘기고 기다린다(최대 10분).
      if (ps?.captcha || ps?.needHuman) {
        // 사람이 없으면 자동 재시도를 멈춘다 — 통과하면 아래에서 바로 해제한다.
        humanBlockedAt = Date.now();
        sw.keepOpen = true;
        await sw.show();
        const msg = ps.captcha
          ? '🔐 네이버가 보안문자를 요구합니다 — 크롬 창에서 직접 풀어주세요. 풀면 자동으로 이어집니다.'
          : '🔐 네이버가 기기 등록/2단계 인증을 요구합니다 — 크롬 창에서 진행해 주세요. 끝나면 자동으로 이어집니다.';
        pushLog(msg);
        // 창만 띄우면 다른 작업 중인 사람은 못 본다. 품절 감시는 대개 뒤에서 도는 기능이라
        // 여기서 막히면 "왜 안 되지"만 남는다 → OS 알림으로 확실히 부른다.
        notifyHuman(ps.captcha
          ? '네이버 보안문자를 풀어주세요'
          : '네이버 추가 인증이 필요합니다');
        /**
         * ★ 캡차를 푼 **뒤**가 진짜 막힌 자리였다(실측 2026-09-03).
         * 사람이 보안문자를 맞게 풀어도 네이버는 로그인을 시켜 주지 않는다. 로그인 화면으로
         * 되돌리고 "다시 로그인해 주세요."만 띄운다 — 아이디는 남아 있고 **폼은 제출되지
         * 않은 상태**다. 그런데 이 대기 루프는 쿠키만 봤다:
         *     캡차 통과 → 아무도 다시 제출하지 않음 → 쿠키 영원히 안 생김 → 10분 뒤 timeout
         * 게다가 그 타임아웃이 finish() 에서 **실패로 집계**돼 백오프가 30분→1시간→2시간으로
         * 늘어난다. 사람이 제대로 풀어 준 것이 다음 로그인을 더 멀리 미루는 고리였다.
         *
         * 그래서 대기 중에 화면도 같이 본다 — 캡차가 사라지고 로그인 폼만 남아 있으면
         * **우리가 다시 채워 넣고 제출한다.** 캡차를 푸는 게 아니라(그건 여전히 사람 몫이다),
         * 사람이 푼 뒤에 남는 마지막 한 걸음을 대신하는 것뿐이다.
         */
        let resubmits = 0;
        let cappedLogged = false;
        for (let i = 0; i < 120; i++) {
          await sleep(5000);
          const st = await loginState();
          if (st.loggedIn) {
            loginCache = { loggedIn: true, persistent: !!st.persistent, at: Date.now() };
            // ★ 캡차를 사람이 푼 경우가 특히 중요하다 — 그 화면을 거치면 "로그인 상태 유지"
            //   체크가 풀려 세션 쿠키로 발급된다. 그대로 두면 재시작마다 또 캡차다.
            const kept = st.persistent ? 0 : await persistLoginCookies();
            humanBlockedAt = 0;                     // 통과했으니 조용히-기다리기 해제
            pushLog(st.persistent || kept
              ? '✅ 네이버 로그인 완료 — 이 PC 에 로그인이 남아 도우미를 껐다 켜도 유지됩니다.'
              : '✅ 네이버 로그인 완료 — 이어서 진행합니다.');
            sw.keepOpen = false;                    // 다 끝났으니 탭은 정리해도 된다
            sw.status = 'idle';
            return finish({ ok: true, viaHuman: true });
          }

          // 쿠키가 아직 없다 — 화면이 어느 단계인지 본다.
          const cur = await sw.evaluate(loginPageStateJs).catch(() => null);
          if (!cur) continue;                       // 페이지 전환 중이면 다음 회차에 다시 본다

          // 규칙 ① — 비밀번호 오류면 **여기서 끊는다**. 반복 제출은 계정 잠금이다.
          if (cur.badCredential) {
            clearCredentials();
            pushLog('❌ 저장된 네이버 아이디/비밀번호가 맞지 않습니다 — 저장을 지웠습니다. '
              + '반복 시도는 계정 잠금 위험이 있어 하지 않습니다. 계정을 다시 저장해 주세요.');
            return finish({ ok: false, reason: 'bad-credential' });
          }

          // 규칙 ② — 아직 보안문자·2단계가 떠 있으면 사람 차례다. 건드리지 않고 기다린다.
          if (cur.captchaVisible || cur.needHuman) continue;

          // 캡차가 사라졌는데 로그인 폼이 그대로 = 네이버가 되돌려 보낸 상태. 다시 채워 제출한다.
          if (cur.onLoginPage && cur.hasForm) {
            if (resubmits >= RELOGIN_MAX_TRIES) {
              // ⚠️ 상한을 넘기면 **더 두드리지 않는다** — 되돌림이 반복된다는 건 재제출로 풀리는
              //    문제가 아니라는 뜻이고, 계속 제출하면 그게 곧 다음 캡차다. 창은 이미 떠 있으니
              //    사람이 직접 끝내면 위 쿠키 검사가 그대로 잡는다.
              if (!cappedLogged) {
                cappedLogged = true;
                pushLog('보안문자를 통과해도 네이버가 계속 로그인 화면으로 되돌립니다 — 크롬 창에서 직접 로그인해 주세요.');
              }
              continue;
            }
            resubmits++;
            pushLog(cur.reloginPrompt
              ? `네이버가 "다시 로그인"을 요구합니다 — 자동으로 다시 입력합니다(${resubmits}/${RELOGIN_MAX_TRIES}).`
              : `보안문자 화면이 지나갔지만 로그인이 안 된 상태입니다 — 자동으로 다시 입력합니다(${resubmits}/${RELOGIN_MAX_TRIES}).`);
            // 규칙 ③ — 비밀번호는 그때그때 꺼내 쓰고 즉시 버린다(첫 제출 뒤 이미 지웠다).
            const again = await loadCredentials().catch(() => null);
            if (!again) {
              pushLog('저장된 계정이 없어 다시 입력하지 못했습니다 — 크롬 창에서 직접 로그인해 주세요.');
              continue;
            }
            const re = await sw.evaluate(naverAutoLoginJs(again.id, again.pw)).catch(() => null);
            again.pw = '';
            if (!re?.ok) pushLog(`다시 입력에 실패했습니다(${re?.reason || 'unknown'}) — 크롬 창에서 직접 로그인해 주세요.`);
          }
        }
        pushLog('로그인 대기를 종료합니다(10분).');
        return finish({ ok: false, reason: 'human-timeout' });
      }

      // ③ 그 밖 — 화면을 띄워 사람이 무슨 일인지 보게 한다(추측해서 재시도하지 않는다).
      pushLog(`자동 로그인이 끝나지 않았습니다${ps?.error ? ` — ${ps.error}` : ''}. 크롬 창을 띄웠습니다.`);
      sw.keepOpen = true;
      await sw.show();
      return finish({ ok: false, reason: 'unknown', error: ps?.error || '' });
    });
  } catch (e) {
    pushLog(`❌ 자동 로그인 실패 — ${e?.message || e}`);
    return finish({ ok: false, reason: String(e?.message || e) });
  } finally {
    if (autoLoginTask.running) finish({ ok: false, reason: 'aborted' });
  }
}

/** 로그인 세션 삭제 — 다른 네이버 계정으로 바꿀 때. */
export async function naverLogout() {
  // 게이트 없음 — 네이버 로그인은 **모든 셀러**가 각자 해야 한다(품절 감시의 전제).
  await clearLogin();
  loginCache = { loggedIn: false, at: Date.now() };
  pushLog('네이버 로그인 세션을 지웠습니다.');
  pushStatus();
  return { ok: true };
}

export function showWindow(index) {
  const slot = pool?.slots?.find((s) => s.index === index);
  slot?.sw?.show().catch(() => {});
  return !!slot;
}

/**
 * 앱 종료 — 크롬을 반드시 닫는다.
 * ★ 예전에는 크롬을 안 닫았다(일렉트론 창은 프로세스가 죽으면 같이 죽으니 문제가 없었다).
 *   이제 네이버 접속이 전부 크롬이라 안 닫으면 도우미를 껐는데도 크롬이 프로필을 쥔 채
 *   남는다 — 다음 실행이 "도우미용 크롬이 이미 떠 있습니다" 로 시작한다.
 */
export async function shutdown() {
  // 끄기 직전에 쿠키를 디스크에 밀어 넣는다 — 안 그러면 다음 실행이 로그아웃 상태로 시작하고
  // 그 로그인 시도가 곧 캡차다(오늘 이 경로로 여러 번 겪었다).
  try { await persistLoginCookies().catch(() => {}); } catch { /* ignore */ }
  try { await stop(); } catch { /* ignore */ }
}
