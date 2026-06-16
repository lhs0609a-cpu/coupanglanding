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
      if (ctx.store.get('monitorEnabled') !== false && tokenOf(ctx)) {
        ctx.send('stock-monitor:log', '연결됨 — 품절 모니터링을 자동 시작합니다…');
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
