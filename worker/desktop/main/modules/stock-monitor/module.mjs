// 상품 모니터링 모듈 — 등록 상품의 네이버 원본 품절/가격을 가정 IP로 확인해 서버에 전송.
//   apps/desktop-monitor(별도 앱)의 핵심 로직 포팅. 64자 토큰(웹 발급)으로 인증.
//   서버 크론은 datacenter IP라 네이버 차단됨 → 이 모듈(가정 IP)이 실제 fetcher.
import { fetchNaverProduct } from './naver-fetch.mjs';

const CRON_TICK_MS = 2 * 60 * 1000;      // 2분마다 목록 fetch
const ITEM_INTERVAL_MS = 5000;           // 상품당 5~8초 (가정 IP라 안전마진)
const BATCH_FLUSH_SIZE = 10;
const BATCH_FLUSH_INTERVAL_MS = 60000;

let cronTimer = null, flushTimer = null, running = false;
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
  ctx.send('stock-monitor:log', `${ico} ${(m.source_url || '').slice(0, 55)} → ${r.status}${r.mainPrice ? ' ' + r.mainPrice.toLocaleString() + '원' : ''}`);
  ctx.send('stock-monitor:stats', { ...stats });
}
async function tick(ctx) {
  const v = await verifyToken(ctx);
  if (!v.valid) { ctx.send('stock-monitor:log', '인증 실패: ' + (v.error || '')); return; }
  const monitors = await fetchMonitors(ctx, 50);
  if (!monitors.length) { ctx.send('stock-monitor:log', '확인할 대상 없음 (대기)'); return; }
  ctx.send('stock-monitor:log', `${monitors.length}개 확인 시작…`);
  for (const m of monitors) {
    if (!running) break;
    try { await processOne(ctx, m); } catch (e) { ctx.send('stock-monitor:log', '처리 오류: ' + e.message); }
    if (pending.length >= BATCH_FLUSH_SIZE) await flush(ctx);
    await sleep(ITEM_INTERVAL_MS + Math.random() * 3000);
  }
  await flush(ctx);
}
function start(ctx) {
  if (running) return;
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
  trayItems: (ctx) => (running ? [{ label: '모니터링 정지', click: () => stop(ctx) }] : []),
  ipc: {
    'stock-monitor:state': (ctx) => ({ hasToken: !!tokenOf(ctx), running, stats }),
    'stock-monitor:set-token': (ctx, { token } = {}) => { ctx.store.set('monitorToken', (token || '').trim()); return true; },
    'stock-monitor:verify': (ctx) => verifyToken(ctx),
    'stock-monitor:start': (ctx) => { start(ctx); return true; },
    'stock-monitor:stop': (ctx) => { stop(ctx); return true; },
    'stock-monitor:open-web': (ctx) => { ctx.shell.openExternal(ctx.services.webOrigin + '/megaload/desktop-app'); return true; },
  },
  onQuit: (ctx) => stop(ctx),
};
