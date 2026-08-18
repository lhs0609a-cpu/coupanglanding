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
import { WindowPool, WINDOW_MIN, WINDOW_MAX, WINDOW_DEFAULT } from './window-pool.mjs';
import { runOne } from './runner.mjs';
import {
  probePageJs, probeProductJs, collectCardsJs, scrollStepJs, keepLoginJs, naverAutoLoginJs, loginPageStateJs,
} from './inject.mjs';
import { loginState, clearLogin, setMediaAllowed } from './browser.mjs';
import { persistLoginCookies } from '../../naver-session.mjs';
import {
  initCredentials, saveCredentials, clearCredentials, credentialInfo, hasCredentials,
  loadCredentials, encryptionAvailable,
} from '../../naver-credentials.mjs';
import { categoryUrl, listUrl } from './categories.mjs';
import {
  initCategories, listChildren, clearCategoryCache, knownMap, prewarmTree, prewarmInfo, exportTree,
  ROOT_CATEGORIES,
} from './categories.mjs';
import { collectCategory } from './collect-list.mjs';

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

export function initService({ store, send, userDataDir, getAccount }) {
  deps = { store, send: send || (() => {}), getAccount: getAccount || (() => null), userDataDir };
  naverGate.init(userDataDir);
  initCategories(store);
  initCredentials(store);
  const st = naverGate.state();
  if (st.cooling) {
    pushLog(`이전 실행에서 걸린 네이버 쿨다운이 ${Math.ceil(st.cooldownMsLeft / 1000)}초 남아 있습니다 — 그만큼 쉬고 시작합니다`);
  }
  naverGate.onChange(() => { if (pool) pushStatus(); });
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
  pool = new WindowPool({ onLog: pushLog, onStatus: pushStatus });
  pool.setCount(deps.store?.get('naverIngestWindows', WINDOW_DEFAULT) ?? WINDOW_DEFAULT);
  return pool;
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
  if (!pool) return true;
  await pool.stop();
  pushLog('수집을 멈추고 창을 정리했습니다.');
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
  return listChildren(p, parentId, { force, onLog: pushLog });
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

  // "하다 만 상태"를 남기지 않으려고 의도를 디스크에 적어 둔다 — 앱을 껐다 켜도 알아서 이어서 한다.
  deps.store?.set('naverIngestCatPrewarmWant', { depth, at: Date.now() });

  prewarmAbort = new AbortController();
  prewarm = { running: true, read: 0, failed: 0, level: 1, pending: 0, current: '', stopped: null, at: Date.now(), depth };
  pushLog(`카테고리 미리 읽기 시작 — ${depth >= 6 ? '끝까지(전체)' : depth >= 4 ? '세분류까지' : '소분류까지'}. 요청 간격(3~7초) 때문에 시간이 걸립니다.`);

  prewarmTree(p, {
    maxDepth: depth,
    onLog: pushLog,
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
    // 1회로는 "안 움직인 것"과 "움직였는데 더 없는 것"이 안 갈린다 — 3회 굴려 본다.
    for (let i = 0; i < 3; i++) {
      await sw.evaluate(scrollStepJs).catch(() => {});
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
export async function startCollect({ catId, catName = '', target = 300 }) {
  requireAdmin();
  if (!catId) throw new Error('카테고리를 선택하세요.');
  if (collection.running) throw new Error('이미 수집이 진행 중입니다.');

  const p = ensurePool();
  if (!p.running) { pushLog('창을 준비합니다…'); await p.start(); }

  // ★ 여기서 로그인을 기다리지 않는다. 캡차가 뜨면 사람이 풀 때까지 최대 10분인데, 그동안
  //   이 요청이 응답을 안 돌려줘서 웹 화면은 "눌렀는데 아무 일도 안 일어난다"가 된다(실측).
  //   로그인 복구는 아래 collectCategory 의 onNeedLogin 이 **창을 잡기 전에** 처리한다.
  collectAbort = new AbortController();
  collection = { catId, catName, items: [], stopped: null, at: Date.now(), running: true, progress: { collected: 0, scrolls: 0 } };
  pushLog(`수집 시작 — ${catName || catId} (목표 ${target}개)`);

  /**
   * 수집 도중 세션이 만료되면 창을 놓고 나온다(collect-list 는 그 자리에서 로그인을 못 한다 —
   * 창을 쥔 채로 창을 또 달라고 하면 창 1개짜리 설정에서 멈춘다). 되살리는 건 여기, 창 밖이다.
   */
  const runWithRelogin = async () => {
    const opts = {
      target,
      onLog: pushLog,
      onProgress: (pr) => { collection.progress = pr; },
      onNeedLogin: ensureNaverLogin,
      signal: collectAbort.signal,
    };
    const first = await collectCategory(p, catId, opts);
    if (first.stopped !== '네이버 로그인 필요' || collectAbort.signal.aborted) return first;
    const re = await ensureNaverLogin();
    if (!re?.ok) return first;
    const second = await collectCategory(p, catId, opts);
    // 만료 전에 모은 것도 결과다 — 버리지 않고 합친다.
    const merged = new Map(first.items.map((x) => [x.productNo, x]));
    for (const x of second.items) merged.set(x.productNo, x);
    return { items: [...merged.values()], stopped: second.stopped };
  };

  runWithRelogin().then(({ items, stopped }) => {
    collection = { ...collection, items, stopped, running: false, at: Date.now() };
    pushLog(`✅ 수집 완료 — ${items.length}개 (${stopped})`);
    pushStatus();
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

/** 수집 결과 — 큰 배열이라 status 와 분리해서 필요할 때만 가져간다. */
export function getCollection() {
  return collection;
}

/**
 * 네이버 로그인 창 — **사람이 직접 로그인한다**. 우리는 계정 정보를 받지도, 저장하지도 않는다.
 *
 * 왜 필요한가: 상품 목록(search.shopping.naver.com)은 로그인 세션이 없으면 nid 로그인 화면으로
 * 리다이렉트된다(실측). 확장프로그램 방식이 됐던 이유가 "이미 로그인된 크롬 안에서 돌아서" 였다.
 * 여기서 한 번 로그인해 두면 쿠키가 수집 전용 파티션(persist:naveringest)에 남아 이후는 무인이다.
 *
 * 로그인 화면은 사람이 봐야 하므로 이미지 차단을 잠시 푼다(보안문자가 안 보이면 진행 불가).
 */
export async function openNaverLogin() {
  // 게이트 없음 — 네이버 로그인은 **모든 셀러**가 각자 해야 한다(품절 감시의 전제).
  if (loginTask) return { ok: true, already: true };

  const p = ensurePool();
  if (!p.running) { pushLog('창을 준비합니다…'); await p.start(); }

  setMediaAllowed(true);
  pushLog('네이버 로그인 창을 엽니다 — 창에서 직접 로그인하세요. 한 번만 하면 이후 수집은 무인으로 진행됩니다.');

  loginTask = p.withWindow('list', async (sw) => {
    sw.status = 'login';
    sw.detail = '네이버 로그인 대기';
    await sw.gotoViaClick('https://nid.naver.com/nidlogin.login', { skipReady: true, timeoutMs: 20000 });
    sw.show();
    pushStatus();

    // "로그인 상태 유지"를 대신 켠다 — 이걸 놓치면 로그인은 되는데 앱을 끄는 순간 풀린다.
    // 화면이 아직 안 그려졌을 수 있어 잠깐씩 세 번 시도한다.
    for (let i = 0; i < 3; i++) {
      const k = await sw.evaluate(keepLoginJs).catch(() => null);
      if (k?.found) {
        pushLog(k.now
          ? '로그인 화면의 "로그인 상태 유지"를 켰습니다 — 이게 꺼져 있으면 앱을 껐다 켤 때마다 로그인이 풀립니다.'
          : '⚠️ "로그인 상태 유지"를 켜지 못했습니다 — 로그인 창에서 직접 체크해 주세요(안 켜면 앱 재시작마다 로그인이 풀립니다).');
        break;
      }
      await new Promise((r) => { const t = setTimeout(r, 1500); t.unref?.(); });
    }

    // 최대 15분 대기. 창을 열어 둔 채 무한정 잡고 있으면 수집 창이 영영 안 돌아온다.
    for (let i = 0; i < 180; i++) {
      await new Promise((r) => { const t = setTimeout(r, 5000); t.unref?.(); });
      const st = await loginState();
      if (st.loggedIn) {
        loginCache = { loggedIn: true, at: Date.now() };
        pushLog('✅ 네이버 로그인 완료 — 이제 목록 수집이 됩니다.');
        if (!st.persistent) {
          pushLog('⚠️ 이 로그인은 세션 쿠키라 앱을 껐다 켜면 풀립니다 — 로그인 창에서 "로그인 상태 유지"를 켜고 다시 로그인하면 유지됩니다.');
        }
        sw.hide();
        sw.status = 'idle';
        sw.detail = '';
        return { ok: true, loggedIn: true };
      }
    }
    pushLog('로그인 대기를 종료합니다(15분) — 필요하면 다시 눌러주세요.');
    sw.hide();
    sw.status = 'idle';
    return { ok: false, loggedIn: false };
  }).finally(() => {
    setMediaAllowed(false);
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
  const st = await loginState();
  if (st.loggedIn) return { ok: true, already: true };
  if (!hasCredentials()) return { ok: false, reason: 'no-credential' };
  if (autoLoginTask.running) return { ok: false, reason: 'running' };
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
  if (byHuman) humanBlockedAt = 0;
  if (autoLoginTask.running) return { ok: false, reason: 'running' };
  const creds = await loadCredentials();
  if (!creds) return { ok: false, reason: 'no-credential' };

  const p = ensurePool();
  // 로그인만을 위해 창을 켰다면 끝난 뒤 도로 접는다 — 품절 감시만 쓰는 셀러에게
  // 수집용 창 3개를 계속 띄워 두는 건 순수 낭비다(수집 중이면 건드리지 않는다).
  const startedForLogin = !p.running;
  if (!p.running) { pushLog('창을 준비합니다…'); await p.start(); }

  autoLoginTask = { running: true, at: Date.now(), result: null };
  pushStatus();

  const finish = (result) => {
    autoLoginTask = { running: false, at: Date.now(), result };
    pushStatus();
    return result;
  };

  try {
    return await p.withWindow('list', async (sw) => {
      sw.status = 'login';
      sw.detail = '자동 로그인';
      // 캡차가 뜨면 사람이 봐야 하므로 이미지 차단을 잠시 푼다(로그인 화면 동안만).
      setMediaAllowed(true);
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
        sw.show();
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
          sw.hide();
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
        sw.show();
        const msg = ps.captcha
          ? '🔐 네이버가 보안문자를 요구합니다 — 도우미 창에서 직접 풀어주세요. 풀면 자동으로 이어집니다.'
          : '🔐 네이버가 기기 등록/2단계 인증을 요구합니다 — 도우미 창에서 진행해 주세요. 끝나면 자동으로 이어집니다.';
        pushLog(msg);
        // 창만 띄우면 다른 작업 중인 사람은 못 본다. 품절 감시는 대개 뒤에서 도는 기능이라
        // 여기서 막히면 "왜 안 되지"만 남는다 → OS 알림으로 확실히 부른다.
        notifyHuman(ps.captcha
          ? '네이버 보안문자를 풀어주세요'
          : '네이버 추가 인증이 필요합니다');
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
            sw.hide();
            sw.status = 'idle';
            return finish({ ok: true, viaHuman: true });
          }
        }
        pushLog('로그인 대기를 종료합니다(10분).');
        sw.hide();
        return finish({ ok: false, reason: 'human-timeout' });
      }

      // ③ 그 밖 — 화면을 띄워 사람이 무슨 일인지 보게 한다(추측해서 재시도하지 않는다).
      pushLog(`자동 로그인이 끝나지 않았습니다${ps?.error ? ` — ${ps.error}` : ''}. 도우미 창을 띄웠습니다.`);
      sw.show();
      return finish({ ok: false, reason: 'unknown', error: ps?.error || '' });
    });
  } catch (e) {
    pushLog(`❌ 자동 로그인 실패 — ${e?.message || e}`);
    return finish({ ok: false, reason: String(e?.message || e) });
  } finally {
    setMediaAllowed(false);
    if (autoLoginTask.running) finish({ ok: false, reason: 'aborted' });
    if (startedForLogin && !collection.running) { try { await p.stop(); } catch { /* ignore */ } }
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
  slot?.sw?.show();
  return !!slot;
}

export function shutdown() {
  try { pool?.stop(); } catch { /* ignore */ }
}
