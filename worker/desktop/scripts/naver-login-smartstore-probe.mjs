/**
 * 결정적 실측 — "네이버 로그인 세션이면 스마트스토어 429가 풀리는가?"
 * ---------------------------------------------------------------------------
 * 이 답 하나에 12,937건(감시 대상의 72%)의 운명이 걸려 있다.
 * 비로그인 실측은 이미 나왔다: smartstore 0/5 전부 429, brand 3/3 성공.
 * 여기서는 **같은 프로세스·같은 세션**에서 로그인부터 조회까지 한 번에 한다
 * (설치된 앱과 userData 가 달라 쿠키가 안 넘어오므로, 로그인도 여기서 해야 한다).
 *
 * 실행:
 *   cd worker/desktop
 *   npx --yes electron@33 scripts/naver-login-smartstore-probe.mjs ../../probe-urls.json
 */
import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const URLS_FILE = process.argv.find((a) => a.endsWith('.json'));
const LOG = process.env.PROBE_LOG || join(tmpdir(), 'naver-login-probe.log');
const say = (s) => { try { appendFileSync(LOG, s + '\n'); } catch {} process.stdout.write(s + '\n'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 실제 파서와 같은 권위값(__PRELOADED_STATE__)을 본다. */
const READ_JS = `
(() => {
  const o = { hasState:false, status:null, price:null, title:null, bodyLen:0 };
  try {
    o.bodyLen = ((document.body && document.body.innerText) || '').length;
    const s = window.__PRELOADED_STATE__;
    if (s) {
      o.hasState = true;
      const j = JSON.stringify(s);
      const m = j.match(/"productStatusType"\s*:\s*"([A-Z_]+)"/); if (m) o.status = m[1];
      const p = j.match(/"salePrice"\s*:\s*(\d+)/);              if (p) o.price = Number(p[1]);
      const t = j.match(/"name"\s*:\s*"([^"]{4,80})"/);           if (t) o.title = t[1];
    }
  } catch (e) { o.error = String(e && e.message || e); }
  return o;
})()`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const { NAVER_PARTITION, openLoginWindow, loginState, setMediaAllowed, installBlocker } =
    await import('../main/naver-session.mjs');
  const urls = JSON.parse(readFileSync(URLS_FILE, 'utf-8'));

  say(`파티션: ${NAVER_PARTITION}`);
  say('── 1단계: 네이버 로그인 ──────────────────────────────');

  let st = await loginState();
  if (!st.loggedIn) {
    await openLoginWindow({ onLog: (m) => say('  ' + m) });
    say('  ⏳ 로그인 창에서 로그인해 주세요(최대 10분 대기)…');
    for (let i = 0; i < 200; i++) {
      await sleep(3000);
      st = await loginState();
      if (st.loggedIn) break;
    }
  }
  if (!st.loggedIn) { say('❌ 로그인되지 않아 실측을 중단합니다.'); return app.exit(1); }
  say('  ✅ 로그인 확인됨');

  say('\n── 2단계: 조회 실측 ─────────────────────────────────');
  await installBlocker();
  setMediaAllowed(false);
  const win = new BrowserWindow({
    show: false, width: 1280, height: 900,
    webPreferences: { partition: NAVER_PARTITION, javascript: true, backgroundThrottling: false },
  });
  win.webContents.setAudioMuted(true);

  const load = (url) => new Promise((resolve) => {
    const wc = win.webContents;
    let http = 0, done = false;
    const t0 = Date.now();
    const timer = setTimeout(() => fin('timeout'), 30000);
    const onNav = (_e, _u, code) => { if (code) http = code; };
    const onFail = (_e, c, d, _u, main) => { if (main && c !== -3) fin(`load ${c} ${d}`); };
    const onFin = async () => {
      try { fin(null, await wc.executeJavaScript(READ_JS, true)); }
      catch (e) { fin('extract: ' + (e?.message || e)); }
    };
    function fin(err, data) {
      if (done) return; done = true;
      clearTimeout(timer);
      wc.removeListener('did-navigate', onNav);
      wc.removeListener('did-fail-load', onFail);
      wc.removeListener('did-finish-load', onFin);
      resolve({ http, err, data, ms: Date.now() - t0 });
    }
    wc.on('did-navigate', onNav); wc.on('did-fail-load', onFail); wc.on('did-finish-load', onFin);
    wc.loadURL(url).catch((e) => fin('loadURL: ' + (e?.message || e)));
  });

  const results = [];
  for (const [group, list] of [['smartstore', urls.smartstore || []], ['brand', urls.brand || []]]) {
    say(`\n[${group}]`);
    for (const url of list) {
      const r = await load(url);
      const ok = r.http && r.http < 400 && r.data?.hasState;
      const mark = r.http === 429 ? '❌ 429' : ok ? '✅ 성공' : `⚠️ ${r.http || r.err || '?'}`;
      say(`  ${mark}  ${(r.ms / 1000).toFixed(1)}초  ${r.data?.status || '-'}  ${(r.data?.title || '').slice(0, 30)}  ${url.slice(8, 60)}`);
      results.push({ group, url, http: r.http, ms: r.ms, ...r.data });
      await sleep(4000 + Math.random() * 3000);   // 페이싱 — 실측하려다 IP 를 태우면 안 된다
    }
  }

  const sum = (g) => {
    const rs = results.filter((r) => r.group === g);
    const okc = rs.filter((r) => r.http && r.http < 400 && r.hasState).length;
    return `${g}: ${okc}/${rs.length} 성공, 429 ${rs.filter((r) => r.http === 429).length}건`;
  };
  say('\n── 결과 ────────────────────────────────────────────');
  say('  ' + sum('smartstore'));
  say('  ' + sum('brand'));
  writeFileSync(join(tmpdir(), 'naver-login-probe.json'), JSON.stringify(results, null, 1));
  app.exit(0);
});
