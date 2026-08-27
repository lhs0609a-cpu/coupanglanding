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
 *   node scripts/naver-login-smartstore-probe.mjs ../../probe-urls.json
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { withProbeTab } from './_probe-tab.mjs';
import { ensureChromeLogin, naverCookieState } from '../main/modules/naver-ingest/chrome-session.mjs';

const URLS_FILE = process.argv.find((a) => a.endsWith('.json'));
const LOG = process.env.PROBE_LOG || join(tmpdir(), 'naver-login-probe.log');
const say = (s) => { try { appendFileSync(LOG, s + '\n'); } catch { /* 로그 파일은 있으면 좋은 것 */ } process.stdout.write(s + '\n'); };
const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); t.unref?.(); });

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

withProbeTab(async (tab) => {
  const urls = JSON.parse(readFileSync(URLS_FILE, 'utf-8'));

  say('── 1단계: 네이버 로그인 ──────────────────────────────');
  let st = await naverCookieState();
  if (!st.loggedIn) {
    say('  ⏳ 크롬 창에서 로그인해 주세요(최대 10분 대기)…');
    // ensureChromeLogin 은 ChromePage 를 받는다(ChromeTab 이 아니라) — 안쪽 페이지를 넘긴다.
    await ensureChromeLogin({ waitMs: 10 * 60 * 1000, tab: tab.page });
    st = await naverCookieState();
  }
  if (!st.loggedIn) { say('❌ 로그인되지 않아 실측을 중단합니다.'); return 1; }
  say('  ✅ 로그인 확인됨');

  say('\n── 2단계: 조회 실측 ─────────────────────────────────');
  // 이미지/폰트를 막아 페이지당 시간을 줄인다 — 여기서 재는 건 429 여부지 그림이 아니다.
  await tab.setMediaBlocked(true);

  /** 상태코드는 Document 응답을 들어서 잡는다 — CDP 이동은 상태코드를 안 준다. */
  const load = async (url) => {
    let http = 0;
    const unwatch = tab.page.watchResponses(({ status, type }) => { if (type === 'Document') http = status; });
    const t0 = Date.now();
    try {
      const nav = await tab.gotoViaClick(url, { timeoutMs: 25000 });
      if (!nav.ok) return { http, err: nav.error, data: null, ms: Date.now() - t0 };
      const data = await tab.evaluate(READ_JS).catch((e) => ({ error: String(e?.message || e) }));
      return { http: http || 200, err: null, data, ms: Date.now() - t0 };
    } finally {
      unwatch();
    }
  };

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
  return 0;
}, { warmUp: true })
  .then((code) => process.exit(code ?? 0))
  .catch((e) => { say('❌ ' + (e?.stack || e)); process.exit(1); });
