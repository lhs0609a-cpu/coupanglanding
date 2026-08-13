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
import naverGate from '../../naver-gate.mjs';
import { WindowPool, WINDOW_MIN, WINDOW_MAX, WINDOW_DEFAULT } from './window-pool.mjs';
import { runOne } from './runner.mjs';

let pool = null;
let deps = {
  store: null,
  send: () => {},
  getAccount: () => null,
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

export function initService({ store, send, userDataDir, getAccount }) {
  deps = { store, send: send || (() => {}), getAccount: getAccount || (() => null) };
  naverGate.init(userDataDir);
  const st = naverGate.state();
  if (st.cooling) {
    pushLog(`이전 실행에서 걸린 네이버 쿨다운이 ${Math.ceil(st.cooldownMsLeft / 1000)}초 남아 있습니다 — 그만큼 쉬고 시작합니다`);
  }
  naverGate.onChange(() => { if (pool) pushStatus(); });
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

export function getStatus() {
  const base = {
    isAdmin: isAdmin(),
    account: deps.getAccount(),
    limits: { min: WINDOW_MIN, max: WINDOW_MAX, default: WINDOW_DEFAULT },
  };
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

export function showWindow(index) {
  const slot = pool?.slots?.find((s) => s.index === index);
  slot?.sw?.show();
  return !!slot;
}

export function shutdown() {
  try { pool?.stop(); } catch { /* ignore */ }
}
