// 상품 모니터링 모듈 — 등록 상품의 네이버 원본 품절/가격을 가정 IP로 확인해 서버에 전송.
//   apps/desktop-monitor(별도 앱)의 핵심 로직 포팅. 64자 토큰(웹 발급)으로 인증.
//   서버 크론은 datacenter IP라 네이버 차단됨 → 이 모듈(가정 IP)이 실제 fetcher.
import { fetchNaverProduct, warmUpSession } from './naver-fetch.mjs';
// 네이버 로그인 — 스마트스토어는 비로그인 조회를 429 로 막는다(실측: brand 3/3 성공, smartstore 0/5).
// 세션은 소싱 수집과 공유하므로 어느 쪽에서 로그인하든 양쪽 다 적용된다.
import { openLoginWindow, clearLogin, loginState, isLoginWindowOpen } from '../../naver-session.mjs';
// 자동 로그인 — 계정을 한 번 저장해 두면 세션이 끊겨도 도우미가 알아서 다시 로그인한다.
// 로그인 세션이 하나이므로 구현도 한 곳(naver-ingest/service)만 두고 여기서 빌려 쓴다.
import {
  ensureNaverLogin, credentialStatus, saveNaverCredential, clearNaverCredential,
} from '../naver-ingest/service.mjs';

// ── 페이싱 ──
// 2026-08-10 실측으로 이 모듈이 별도 "메가로드 모니터링" 앱(v0.1.16)과 정책이 갈려 있던 게 드러났다.
// 이 모듈은 5~8초/건이었고 별도 앱은 30~75초/건 + 서킷브레이커였다. 관측상 네이버는 약 6건/분에서
// 차단하므로 5초 간격(=12건/분)은 차단선 위다. 통합 도우미로 일원화하기로 한 이상 검증된 쪽
// (별도 앱 v0.1.16 무차단 재설계)의 정책을 그대로 가져온다.
//
// 저속이어도 완주한다 — 서버 티어 스케줄러가 "due 인 것만" 내려주기 때문이다.
const CRON_TICK_MS = 2 * 60 * 1000;      // 2분마다 목록 fetch (서킷 OPEN 이면 skip)
const ITEM_BASE_MS = 30_000;             // 기본 30초 간격
const ITEM_FULLJITTER_MS = 45_000;       // + 0~45초 → 실제 30~75초(고정 주기 패턴 회피)
const BATCH_FLUSH_SIZE = 10;
const BATCH_FLUSH_INTERVAL_MS = 60000;

// ── 서킷브레이커 ──
// 429/503 은 상품이 아니라 IP 단위 신호다. 한 건이라도 뜨면 배치를 통째로 멈추고 IP 를 식힌다.
// 예전의 "연속 실패마다 +15초" 백오프는 429 를 맞으면서도 계속 조회해 차단을 깊게 만들었다.
const CIRCUIT_COOLDOWN_BASE_MS = 30 * 60 * 1000;    // 첫 트립 30분
const CIRCUIT_COOLDOWN_MAX_MS = 2 * 60 * 60 * 1000; // 상한 2시간
const CIRCUIT_BACKOFF_FACTOR = 1.5;                 // 연속 트립마다 ×1.5
// ★ 서킷은 **사이트별로 따로** 연다.
//   429 를 IP 단위 신호로만 다뤄 왔는데, 실측(2026-08-18)은 도메인 단위임을 보여준다:
//   같은 순간 같은 IP 로 brand.naver.com 3/3 통과 · smartstore.naver.com 0/5 429.
//   하나로 묶으면 smartstore 한 건의 429 가 멀쩡한 brand 까지 30→45→68분 통째로 재운다
//   (실측 로그에서 확인됨). 그 동안 아무것도 확인되지 않는다.
function siteOf(url) {
  if (/smartstore\.naver|shop\.naver/i.test(url || '')) return 'smartstore';
  if (/brand\.naver/i.test(url || '')) return 'brand';
  return 'other';
}
const SITES = ['smartstore', 'brand', 'other'];
const circuit = Object.fromEntries(SITES.map((k) => [k, { openUntil: 0, cooldownMs: CIRCUIT_COOLDOWN_BASE_MS }]));
const circuitOpen = (site) => Date.now() < circuit[site].openUntil;

function tripCircuit(ctx, site) {
  const c = circuit[site];
  const cooldown = Math.min(CIRCUIT_COOLDOWN_MAX_MS, c.cooldownMs);
  c.openUntil = Date.now() + cooldown;
  c.cooldownMs = Math.min(CIRCUIT_COOLDOWN_MAX_MS, Math.round(c.cooldownMs * CIRCUIT_BACKOFF_FACTOR));
  ctx.send('stock-monitor:log', `🔴 ${site} 속도제한 — ${Math.round(cooldown / 60000)}분 중단(다른 사이트는 계속 확인합니다)`);
}

// 같은 안내를 2분마다 반복해서 로그를 덮지 않도록.
let lastLoginWarnAt = 0;
let lastLoginNotifyAt = 0;

/**
 * 네이버 로그인이 없어 스마트스토어를 못 보고 있을 때 사람을 부른다.
 * 알림 → 창 띄우기 → 상품 모니터링 탭 열기까지 한 번에 이어야 실제로 로그인까지 간다.
 */
async function notifyLoginNeeded(ctx, skipped) {
  if (Date.now() - lastLoginNotifyAt < 6 * 60 * 60 * 1000) return;
  lastLoginNotifyAt = Date.now();
  try {
    const { Notification } = await import('electron');
    if (!Notification.isSupported()) return;
    const n = new Notification({
      title: '네이버 로그인이 필요합니다',
      // 알림에도 안심 문구를 한 줄 넣는다 — "왜 내 네이버 계정을?" 이 먼저 떠오르면
      // 창을 열어 보지도 않는다. 판단은 알림을 보는 그 순간에 일어난다.
      body: `스마트스토어 ${skipped}건의 품절을 확인하지 못하고 있습니다.\n`
        + '눌러서 로그인해 주세요 — 계정 정보는 이 PC 밖으로 나가지 않습니다.',
    });
    n.on('click', () => {
      try { ctx.showWindow?.(); } catch { /* ignore */ }
      try { ctx.send('shell:focus-module', { id: 'stock-monitor' }); } catch { /* ignore */ }
    });
    n.show();
  } catch { /* 알림 실패가 감시를 막지는 않는다 */ }
}

let cronTimer = null, flushTimer = null, running = false, ticking = false;
let pending = [];
const stats = { checked: 0, lastCheckAt: null, online: false };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tokenOf = (ctx) => (ctx.store.get('monitorToken') || '').trim();
const apiUrl = (ctx, path) => (ctx.store.get('apiBase') || ctx.services.webOrigin) + path;

/**
 * 이 PC 의 로컬 서버 주소를 쿼리로 덧붙인다(&lport=&lnonce=).
 * ---------------------------------------------------------------------------
 * 왜 품절 모니터가 이걸 나르나: 웹 올인원이 앱의 로컬 서버를 찾는 유일한 통로가
 * 세션(OAuth) 하트비트였는데, 그 세션은 만료·폐기되면 조용히 멈춘다
 * (실측: 세션 사망 1분 뒤 하트비트 정지 → 10시간 동안 웹에서 소싱 폴더 선택 불가).
 * 이 모듈의 토큰 인증은 만료가 없어 그 상황에서도 계속 서버에 닿는다 → 같은 주소를
 * 여기에도 실어 보내면 세션이 죽어도 웹이 앱을 찾는다.
 */
function withLocalEndpoint(ctx, url) {
  const p = ctx.services?.pair?.();
  if (!p?.port || !p?.nonce) return url;
  return `${url}&lport=${p.port}&lnonce=${encodeURIComponent(p.nonce)}`;
}

// ── 인증코드 자동 발급 ───────────────────────────────────────────────
// 도우미는 이미 로그인 세션(runner.session)을 갖고 있으므로, 그 access token 으로
// 서버에서 64자 인증코드를 자동 발급받는다 → 사용자가 코드를 복사·붙여넣을 필요 없음.
let lastAutoIssueAt = 0;
let warnedNoSession = false;
// 세션(runner.session)의 로그인 JWT 로 서버에서 64자 인증코드를 (재)발급받아 반환한다.
// ★ store 는 건드리지 않는다 — 호출자가 '성공했을 때만' 저장하게 해서, 재발급 실패 시
//   기존 토큰을 잃지 않도록 한다(예전 버그: 먼저 비우고 재발급 실패 → 토큰 유실로 영구 정지).
// 멱등: DB에 토큰이 있으면 그 값을, 없으면 신규를 돌려준다.
async function reissueToken(ctx) {
  const session = ctx.services?.runner?.session;
  if (!session) return null;
  try {
    const accessToken = await session.token();
    const res = await fetch(apiUrl(ctx, '/api/megaload/desktop/auth/self-issue'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      ctx.send('stock-monitor:log', `인증코드 재발급 실패(HTTP ${res.status}) ${t.slice(0, 120)}`);
      return null;
    }
    const d = await res.json().catch(() => ({}));
    return (d && d.token) ? d.token : null;
  } catch (e) {
    ctx.send('stock-monitor:log', '인증코드 재발급 오류: ' + e.message);
    return null;
  }
}

async function ensureToken(ctx) {
  if (tokenOf(ctx)) return true;
  const session = ctx.services?.runner?.session;
  if (!session) {
    // 앱 부팅 직후엔 세션 복구가 아직 안 됐을 수 있음 — 조용히 다음 틱 재시도(1회만 안내).
    if (!warnedNoSession) {
      ctx.send('stock-monitor:log', '로그인 대기 중 — 도우미 로그인(페어링)되면 인증코드를 자동 발급합니다');
      warnedNoSession = true;
    }
    return false;
  }
  warnedNoSession = false;
  // 발급 실패가 반복될 때(예: 쿠팡 미연동) 매 틱 폭주 방지 — 5분 쿨다운.
  if (Date.now() - lastAutoIssueAt < 5 * 60 * 1000) return false;
  lastAutoIssueAt = Date.now();
  const token = await reissueToken(ctx);
  if (token) {
    ctx.store.set('monitorToken', token);
    lastAutoIssueAt = 0; // 성공 — 쿨다운 해제
    ctx.send('stock-monitor:log', '🔑 로그인 세션으로 인증코드 자동발급 — 연결 완료');
    return true;
  }
  return false;
}

async function verifyToken(ctx) {
  const t = tokenOf(ctx);
  if (!t) return { valid: false, error: '토큰 없음' };
  try {
    const res = await fetch(withLocalEndpoint(ctx, apiUrl(ctx, `/api/megaload/desktop/auth?token=${encodeURIComponent(t)}`)), { headers: { Authorization: `Bearer ${t}` } });
    if (!res.ok) return { valid: false, error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) { return { valid: false, error: e.message }; }
}
async function fetchMonitors(ctx, limit = 50) {
  const t = tokenOf(ctx); if (!t) return [];
  const res = await fetch(withLocalEndpoint(ctx, apiUrl(ctx, `/api/megaload/desktop/monitors?limit=${limit}&minIntervalSec=21600&token=${encodeURIComponent(t)}`)), { headers: { Authorization: `Bearer ${t}` } });
  if (!res.ok) return [];
  const d = await res.json();
  // 서버 품질 게이트에 걸리면 조용히 0건이 아니라 이유를 보여준다 — "왜 아무것도 안 하지?" 를 막는다.
  if (d.paused && d.reason) ctx.send('stock-monitor:log', `⏸ ${d.reason}`);
  return d.monitors || [];
}
async function postResults(ctx, results) {
  const t = tokenOf(ctx); if (!t || !results.length) return;
  await fetch(apiUrl(ctx, `/api/megaload/desktop/results?token=${encodeURIComponent(t)}`), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ results }),
  });
}

async function flush(ctx) {
  if (!pending.length) return;
  const batch = pending.splice(0, pending.length);
  try { await postResults(ctx, batch); }
  catch (e) { pending.unshift(...batch); ctx.send('stock-monitor:log', '결과 전송 실패(재시도 예정): ' + e.message); }
}
async function processOne(ctx, m) {
  const r = await fetchNaverProduct(m.source_url);
  pending.push({ monitorId: m.id, status: r.status, mainPrice: r.mainPrice ?? null, options: r.options ?? null, errorClass: r.errorClass || null, fetchedAt: new Date().toISOString() });
  stats.checked++; stats.lastCheckAt = Date.now();
  const ico = r.status === 'in_stock' ? '✅' : r.status === 'sold_out' ? '⛔' : r.status === 'removed' ? '🗑' : '⚠';
  // 에러면 실제 사유(HTTP 429 / timeout / 예외)와 분류를 함께 찍어 진단 가능하게 한다.
  const detail = r.status === 'error'
    ? ` (${r.errorClass || '?'}: ${r.matchedPattern || '사유미상'})`
    : (r.mainPrice ? ' ' + r.mainPrice.toLocaleString() + '원' : '');
  ctx.send('stock-monitor:log', `${ico} ${(m.source_url || '').slice(0, 55)} → ${r.status}${detail}`);
  ctx.send('stock-monitor:stats', { ...stats });
  return r;
}
async function tick(ctx) {
  // 틱 겹침 방지 — 이전 틱(상품 많으면 수 분 소요)이 끝나기 전 새 틱이 겹쳐 돌면 요청이 폭주해 네이버 429 차단을 자초한다.
  if (ticking) return;
  // 전 사이트가 냉각 중일 때만 틱 자체를 건너뛴다(예전엔 하나만 막혀도 전체가 멈췄다).
  if (SITES.every(circuitOpen)) return;
  ticking = true;
  try {
    // 토큰이 없으면 로그인 세션으로 자동 발급 시도 — 실패 시 조용히 다음 틱 재시도.
    if (!tokenOf(ctx)) {
      const ok = await ensureToken(ctx);
      if (!ok) return;
    }
    let v = await verifyToken(ctx);
    if (!v.valid) {
      // ★ 자가복구(비파괴): 저장된 토큰이 서버 DB와 어긋나(폐기/재발급/환경 변경) 401/403 이면,
      //   세션으로 최신 토큰을 재동기화한다. self-issue 는 멱등이라 DB에 토큰이 있으면 그 값을,
      //   없으면 신규를 돌려줘 로컬↔DB 를 다시 맞춘다.
      //   ★ 새 토큰을 '성공적으로 받은 뒤에만' 교체한다 — 예전엔 먼저 토큰을 비워, 재발급이
      //     실패하면(세션 일시장애 등) 멀쩡할 수도 있는 토큰마저 잃고 영구 정지했다.
      const authRejected = /HTTP 40[013]/.test(v.error || '');
      const hasSession = !!ctx.services?.runner?.session;
      if (authRejected && hasSession) {
        ctx.send('stock-monitor:log', `인증 토큰 재동기화 시도(${v.error})`);
        const fresh = await reissueToken(ctx);
        if (fresh) {
          ctx.store.set('monitorToken', fresh);
          lastAutoIssueAt = 0;
          v = await verifyToken(ctx);
        }
      }
      if (!v.valid) {
        ctx.send('stock-monitor:log', '인증 실패: ' + (v.error || '') + (hasSession ? ' — 잠시 후 자동 재시도' : ' — 도우미 로그인(연결)이 필요합니다'));
        return;
      }
    }
    const monitors = await fetchMonitors(ctx, 50);
    if (!monitors.length) { ctx.send('stock-monitor:log', '확인할 대상 없음 (대기)'); return; }

    // ★ 비로그인 스마트스토어는 **가보지 않는다**.
    //   실측: 비로그인 smartstore 0/5 전부 429, 로그인하면 6/6 성공. 즉 안 될 걸 알면서 찔러
    //   429 를 받아 오는 셈이고, 그 429 가 서킷을 열어 멀쩡한 brand 까지 세운다.
    //   "되는 것까지 망치지 않는다"가 여기의 규칙이다.
    let login = await loginState();
    // 로그인이 끊겼는데 계정이 저장돼 있으면 조용히 다시 로그인한다 —
    // 이게 "앱만 켜 두면 알아서 돈다"의 전부다. 계정이 없으면 아무 일도 하지 않는다.
    if (!login.loggedIn && monitors.some((m) => siteOf(m.source_url) === 'smartstore')) {
      const r = await ensureNaverLogin().catch(() => null);
      if (r?.ok) login = await loginState();
    }
    const queue = [];
    let skipLogin = 0, skipCircuit = 0;
    for (const m of monitors) {
      const site = siteOf(m.source_url);
      if (circuitOpen(site)) { skipCircuit++; continue; }
      if (site === 'smartstore' && !login.loggedIn) { skipLogin++; continue; }
      queue.push({ m, site });
    }
    if (skipLogin && Date.now() - lastLoginWarnAt > 10 * 60 * 1000) {
      lastLoginWarnAt = Date.now();
      ctx.send('stock-monitor:log',
        `⚠️ 네이버 로그인이 없어 스마트스토어 ${skipLogin}건을 건너뜁니다 — 위 "네이버 로그인"을 눌러 한 번 로그인하세요.`);
      // ★ 패널 로그만으로는 아무도 모른다. 품절 감시는 뒤에서 도는 기능이라 셀러는 이 화면을
      //   열지 않고, 그래서 "로그인 안 해서 절반이 안 돌고 있다"를 몇 주씩 모른 채 지낸다.
      //   OS 알림으로 부르고, 누르면 창을 띄워 이 탭까지 열어 준다(엉뚱한 탭이면 소용없다).
      //   6시간에 한 번만 — 이건 알림이지 잔소리가 아니다.
      notifyLoginNeeded(ctx, skipLogin);
    }
    if (skipCircuit) ctx.send('stock-monitor:log', `⏸ 냉각 중이라 ${skipCircuit}건 보류(자동 재개)`);
    if (!queue.length) return;
    ctx.send('stock-monitor:log', `${queue.length}개 확인 시작…`);

    // 배치 전 세션 워밍업 — NNB 쿠키 갱신으로 "재방문 브라우저" 위장(429↓). 실패해도 무시.
    await warmUpSession();

    const tripped = new Set();
    for (const { m, site } of queue) {
      if (!running) break;
      if (tripped.has(site)) continue;   // 이번 배치에서 막힌 사이트만 건너뛴다
      let r;
      try { r = await processOne(ctx, m); } catch (e) { ctx.send('stock-monitor:log', '처리 오류: ' + e.message); }
      if (pending.length >= BATCH_FLUSH_SIZE) await flush(ctx);

      // 429/503 → **그 사이트만** 서킷 OPEN. 나머지 사이트는 이 배치를 계속 완주한다.
      // (단순 타임아웃은 rateLimited=false → 멈추지 않고 다음 상품으로 — 완주 우선.)
      if (r && r.rateLimited) {
        tripCircuit(ctx, site);
        tripped.add(site);
        await flush(ctx);
        if (SITES.every((x) => tripped.has(x) || circuitOpen(x))) break;
        continue;
      }
      // 정상 응답 → 그 사이트 회로 건강. 다음 트립은 다시 30분부터.
      if (r && r.status !== 'error') circuit[site].cooldownMs = CIRCUIT_COOLDOWN_BASE_MS;

      await sleep(ITEM_BASE_MS + Math.random() * ITEM_FULLJITTER_MS);
    }
    await flush(ctx);
  } finally {
    ticking = false;
  }
}
function start(ctx) {
  if (running) return;
  // 사용자가 켰음을 영속화 → 앱 재시작(또는 자동업데이트 후) 시 setup()에서 자동 재개.
  //   stop()에서는 플래그를 건드리지 않음(앱 종료 onQuit도 stop을 부르므로). 명시적 정지는
  //   ipc 'stock-monitor:stop' 핸들러에서만 플래그를 끈다.
  try { ctx.store.set('monitorEnabled', true); } catch { /* ignore */ }
  running = true; stats.online = true; ctx.send('stock-monitor:stats', { ...stats });
  void tick(ctx);
  cronTimer = setInterval(() => { if (running) void tick(ctx); }, CRON_TICK_MS);
  flushTimer = setInterval(() => void flush(ctx), BATCH_FLUSH_INTERVAL_MS);
}
function stop(ctx) {
  running = false; stats.online = false;
  if (cronTimer) { clearInterval(cronTimer); cronTimer = null; }
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  ctx?.send?.('stock-monitor:stats', { ...stats });
}

export default {
  id: 'stock-monitor',
  label: '상품 모니터링',
  icon: '📦',
  order: 0,
  events: ['stock-monitor:log', 'stock-monitor:stats'],
  // 앱 시작 시: 토큰이 있고 사용자가 명시적으로 "정지"하지 않았으면 자동 시작.
  //   ★ 기본값 ON — monitorEnabled 가 undefined(첫 실행/앱 전환) 여도 켠다.
  //     오직 명시적 정지(monitorEnabled===false)만 OFF. → "도우미 연결되면 모니터링도 자동",
  //     매번 수동 '시작' 누를 필요 없음(예전 함정: ===true 게이트라 첫 실행엔 영영 수동).
  //   토큰 무효면 tick 이 '인증 실패'만 로깅하고 idle(외부 호출 안 함)하므로 안전.
  setup: (ctx) => {
    try {
      // 토큰 유무와 무관하게 자동 시작 — 토큰이 없으면 tick 이 로그인 세션으로 자동 발급한다.
      //   (예전엔 tokenOf(ctx) 게이트라 코드 붙여넣기 전엔 영영 수동이었음)
      //   오직 명시적 정지(monitorEnabled===false)일 때만 시작 안 함.
      if (ctx.store.get('monitorEnabled') !== false) {
        ctx.send('stock-monitor:log', tokenOf(ctx)
          ? '연결됨 — 품절 모니터링을 자동 시작합니다…'
          : '품절 모니터링 자동 시작 — 로그인 세션으로 인증코드를 자동 발급합니다…');
        start(ctx);
      }
    } catch { /* ignore */ }
  },
  trayItems: (ctx) => (running ? [{ label: '모니터링 정지', click: () => { stop(ctx); try { ctx.store.set('monitorEnabled', false); } catch {} } }] : []),
  ipc: {
    'stock-monitor:state': async (ctx) => ({
      hasToken: !!tokenOf(ctx), running, stats,
      // 쿠키 판정이라 요청 0회 — 5초마다 물어도 네이버 예산을 쓰지 않는다.
      naverLogin: { ...(await loginState()), waiting: isLoginWindowOpen() },
      naverCredential: await credentialStatus().catch(() => ({ has: false, encryption: false })),
    }),
    'stock-monitor:set-token': (ctx, { token } = {}) => {
      ctx.store.set('monitorToken', (token || '').trim());
      // 코드 저장 즉시 자동 시작(명시적 정지 상태가 아니면) → "저장" 후 "시작"을 또 누를 필요 없음.
      if (tokenOf(ctx) && ctx.store.get('monitorEnabled') !== false) start(ctx);
      return true;
    },
    'stock-monitor:verify': (ctx) => verifyToken(ctx),
    'stock-monitor:start': (ctx) => { start(ctx); return true; },
    // 명시적 정지 — 자동 재개 플래그도 끔(다음 시작 때 자동 재개 안 함).
    'stock-monitor:stop': (ctx) => { stop(ctx); try { ctx.store.set('monitorEnabled', false); } catch {} return true; },
    'stock-monitor:open-web': (ctx) => { ctx.openUrl(ctx.services.webOrigin + '/megaload/desktop-app'); return true; },
    // 네이버 로그인 — 창에서 사람이 직접. 계정 정보는 이 앱을 거치지 않고 네이버로 바로 간다.
    'stock-monitor:naver-login': (ctx) => openLoginWindow({ onLog: (m) => ctx.send('stock-monitor:log', m) }),
    // 계정 저장 — 비밀번호는 OS 암호저장소(Windows DPAPI / macOS 키체인)에만 들어가고
    // 여기서 다시 읽어 나오는 경로가 없다. 암호화를 못 쓰는 PC 면 저장 자체를 거부한다.
    'stock-monitor:naver-cred-save': (_ctx, { id, pw } = {}) => saveNaverCredential({ id, pw }),
    'stock-monitor:naver-cred-clear': () => clearNaverCredential(),
    'stock-monitor:naver-logout': async (ctx) => {
      await clearLogin();
      ctx.send('stock-monitor:log', '네이버 로그아웃 — 다른 계정으로 다시 로그인할 수 있습니다.');
      return { ok: true };
    },
  },
  // 앱 종료 시엔 plain stop만(플래그 보존) → 다음 실행에서 자동 재개.
  onQuit: (ctx) => stop(ctx),
};
