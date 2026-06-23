// 상품 모니터링 모듈 — 등록 상품의 네이버 원본 품절/가격을 가정 IP로 확인해 서버에 전송.
//   apps/desktop-monitor(별도 앱)의 핵심 로직 포팅. 64자 토큰(웹 발급)으로 인증.
//   서버 크론은 datacenter IP라 네이버 차단됨 → 이 모듈(가정 IP)이 실제 fetcher.
import { fetchNaverProduct } from './naver-fetch.mjs';

const CRON_TICK_MS = 2 * 60 * 1000;      // 2분마다 목록 fetch
const ITEM_INTERVAL_MS = 5000;           // 상품당 5~8초 (가정 IP라 안전마진)
const BATCH_FLUSH_SIZE = 10;
const BATCH_FLUSH_INTERVAL_MS = 60000;

let cronTimer = null, flushTimer = null, running = false, ticking = false;
let pending = [];
const stats = { checked: 0, lastCheckAt: null, online: false };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tokenOf = (ctx) => (ctx.store.get('monitorToken') || '').trim();
const apiUrl = (ctx, path) => (ctx.store.get('apiBase') || ctx.services.webOrigin) + path;

// ── 인증코드 자동 발급 ───────────────────────────────────────────────
// 도우미는 이미 로그인 세션(runner.session)을 갖고 있으므로, 그 access token 으로
// 서버에서 64자 인증코드를 자동 발급받는다 → 사용자가 코드를 복사·붙여넣을 필요 없음.
let lastAutoIssueAt = 0;
let warnedNoSession = false;
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
  try {
    const accessToken = await session.token();
    const res = await fetch(apiUrl(ctx, '/api/megaload/desktop/auth/self-issue'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      ctx.send('stock-monitor:log', `자동 연결 실패(HTTP ${res.status}) ${t.slice(0, 120)}`);
      return false;
    }
    const d = await res.json().catch(() => ({}));
    if (d && d.token) {
      ctx.store.set('monitorToken', d.token);
      lastAutoIssueAt = 0; // 성공 — 쿨다운 해제
      ctx.send('stock-monitor:log', '🔑 로그인 세션으로 인증코드 자동발급 — 연결 완료');
      return true;
    }
    ctx.send('stock-monitor:log', '자동 연결 실패: 토큰 응답이 비어 있음');
    return false;
  } catch (e) {
    ctx.send('stock-monitor:log', '자동 연결 오류: ' + e.message);
    return false;
  }
}

async function verifyToken(ctx) {
  const t = tokenOf(ctx);
  if (!t) return { valid: false, error: '토큰 없음' };
  try {
    const res = await fetch(apiUrl(ctx, `/api/megaload/desktop/auth?token=${encodeURIComponent(t)}`), { headers: { Authorization: `Bearer ${t}` } });
    if (!res.ok) return { valid: false, error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) { return { valid: false, error: e.message }; }
}
async function fetchMonitors(ctx, limit = 50) {
  const t = tokenOf(ctx); if (!t) return [];
  const res = await fetch(apiUrl(ctx, `/api/megaload/desktop/monitors?limit=${limit}&minIntervalSec=21600&token=${encodeURIComponent(t)}`), { headers: { Authorization: `Bearer ${t}` } });
  if (!res.ok) return [];
  const d = await res.json();
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
  ticking = true;
  try {
    // 토큰이 없으면 로그인 세션으로 자동 발급 시도 — 실패 시 조용히 다음 틱 재시도.
    if (!tokenOf(ctx)) {
      const ok = await ensureToken(ctx);
      if (!ok) return;
    }
    const v = await verifyToken(ctx);
    if (!v.valid) { ctx.send('stock-monitor:log', '인증 실패: ' + (v.error || '')); return; }
    const monitors = await fetchMonitors(ctx, 50);
    if (!monitors.length) { ctx.send('stock-monitor:log', '확인할 대상 없음 (대기)'); return; }
    ctx.send('stock-monitor:log', `${monitors.length}개 확인 시작…`);
    let backoffStreak = 0;
    for (const m of monitors) {
      if (!running) break;
      let r;
      try { r = await processOne(ctx, m); } catch (e) { ctx.send('stock-monitor:log', '처리 오류: ' + e.message); }
      if (pending.length >= BATCH_FLUSH_SIZE) await flush(ctx);
      // 429/일시오류(transient) 연속 시 점진 백오프 — 네이버 레이트리밋에서 회복(최대 +60초).
      if (r && r.errorClass === 'transient') {
        backoffStreak = Math.min(backoffStreak + 1, 4);
        if (backoffStreak === 1) ctx.send('stock-monitor:log', '⏳ 네이버 속도제한 감지 — 간격을 늘립니다');
      } else {
        backoffStreak = 0;
      }
      await sleep(ITEM_INTERVAL_MS + Math.random() * 3000 + backoffStreak * 15000);
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
    'stock-monitor:state': (ctx) => ({ hasToken: !!tokenOf(ctx), running, stats }),
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
    'stock-monitor:open-web': (ctx) => { ctx.shell.openExternal(ctx.services.webOrigin + '/megaload/desktop-app'); return true; },
  },
  // 앱 종료 시엔 plain stop만(플래그 보존) → 다음 실행에서 자동 재개.
  onQuit: (ctx) => stop(ctx),
};
