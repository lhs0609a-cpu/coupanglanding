/**
 * 품절 체크를 "진짜 브라우저로 한 장씩 여는" 방식의 실측 탐침.
 * ---------------------------------------------------------------------------
 * 재는 것 2가지 — 둘 다 "가능한가?" 의 답을 좌우한다.
 *   ① 성공률: 네이버가 통과시키는가(429/캡차 없이 상태를 읽히는가)
 *   ② 건당 시간: 이게 곧 PC 1대의 시간당 처리량 상한이다
 *
 * 경로 2개를 같은 URL 로 비교한다.
 *   A. loadURL 직접 이동  ← 지금 stock-monitor/naver-fetch.mjs 가 쓰는 방식
 *   B. 클릭 이동          ← naver-ingest 가 쓰는 방식(어제 실측으로 통과 확인)
 *
 * 실행:
 *   cd worker/desktop
 *   npx --yes electron@33 scripts/stock-browser-probe.mjs <urls.json>
 */
import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ScrapeWindow } from '../main/modules/naver-ingest/browser.mjs';

const URLS_FILE = process.argv.find((a) => a.endsWith('.json'));
const OUT = process.env.STOCK_PROBE_OUT || join(tmpdir(), 'stock-browser-probe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 재고 상태 판정 — 실제 파서와 같은 권위값(__PRELOADED_STATE__)을 본다. */
const readStateJs = `
(() => {
  const out = { hasState: false, statusType: null, price: null, title: null, bodyLen: 0 };
  try {
    out.bodyLen = (document.body && document.body.innerText || '').length;
    const s = window.__PRELOADED_STATE__;
    if (s) {
      out.hasState = true;
      const j = JSON.stringify(s);
      const m = j.match(/"productStatusType"\\s*:\\s*"([A-Z_]+)"/);
      if (m) out.statusType = m[1];
      const p = j.match(/"salePrice"\\s*:\\s*(\\d+)/);
      if (p) out.price = Number(p[1]);
      const t = j.match(/"name"\\s*:\\s*"([^"]{4,80})"/);
      if (t) out.title = t[1];
    }
    if (!out.title) {
      const og = document.querySelector('meta[property="og:title"]');
      if (og) out.title = og.content;
    }
  } catch (e) { out.error = String(e && e.message || e); }
  return out;
})()
`;

const report = { at: new Date().toISOString(), rows: [] };

async function measure(sw, url, method) {
  const t0 = Date.now();
  let nav;
  if (method === 'loadURL') {
    // 지금 방식 재현 — 진입점 없이 상품 주소로 곧장.
    const wc = sw.wc;
    nav = await new Promise((resolve) => {
      let status = 0, settled = false;
      const done = (r) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r) } };
      const timer = setTimeout(() => done({ ok: false, status, error: 'timeout' }), 25000);
      const onNav = (_e, _u, code) => { if (code) status = code };
      const onFin = () => done({ ok: true, status: status || 200 });
      const onFail = (_e, c, d, _u, isMain) => { if (isMain && c !== -3) done({ ok: false, status, error: `${c} ${d}` }) };
      wc.once('did-finish-load', onFin);
      wc.once('did-fail-load', onFail);
      wc.on('did-navigate', onNav);
      wc.loadURL(url).catch((e) => done({ ok: false, status, error: String(e?.message || e) }));
    });
  } else {
    nav = await sw.gotoViaClick(url, { timeoutMs: 25000, skipReady: true });
  }

  // SPA 라 로드 완료 != 데이터. 상태가 나올 때까지 최대 8초 기다린다.
  let state = null;
  for (let i = 0; i < 8; i++) {
    state = await sw.evaluate(readStateJs).catch(() => null);
    if (state?.hasState || (state?.bodyLen ?? 0) > 800) break;
    await sleep(1000);
  }
  const det = await sw.detect().catch(() => null);
  const ms = Date.now() - t0;

  const row = {
    method, url,
    ms,
    navStatus: nav.status, navError: nav.error || null,
    landedOn: sw.url.slice(0, 80),
    captcha: det?.captcha ?? null,
    blocked: det?.blocked ?? null,
    loginRequired: det?.loginRequired ?? null,
    hasState: state?.hasState ?? false,
    statusType: state?.statusType ?? null,
    price: state?.price ?? null,
    bodyLen: state?.bodyLen ?? 0,
    ok: !!(state?.hasState && state?.statusType),
  };
  report.rows.push(row);
  console.log(`  [${method}] ${(ms / 1000).toFixed(1)}s status=${row.navStatus} state=${row.hasState} ${row.statusType || ''} ${row.ok ? '✅' : '❌'} ${row.navError || ''}`);
  return row;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const urls = JSON.parse(readFileSync(URLS_FILE, 'utf8'));
  const sw = new ScrapeWindow(0);

  console.log('워밍업(네이버 → 쇼핑)…');
  console.log('워밍업', (await sw.warmUp()) ? 'ok' : '실패');

  for (const url of urls) {
    console.log(`\n${url}`);
    await measure(sw, url, 'loadURL');
    await sleep(3000);
    await measure(sw, url, 'click');
    await sleep(3000);
  }

  // 요약 — 방식별 성공률과 중앙값.
  const summary = {};
  for (const m of ['loadURL', 'click']) {
    const rs = report.rows.filter((r) => r.method === m);
    const okN = rs.filter((r) => r.ok).length;
    const times = rs.map((r) => r.ms).sort((a, b) => a - b);
    summary[m] = {
      n: rs.length,
      ok: okN,
      성공률: rs.length ? `${Math.round((okN / rs.length) * 100)}%` : '-',
      중앙값초: times.length ? (times[Math.floor(times.length / 2)] / 1000).toFixed(1) : null,
      시간당처리량_1대: times.length ? Math.round(3600 / (times[Math.floor(times.length / 2)] / 1000)) : null,
    };
  }
  report.summary = summary;
  console.log('\n=== 요약 ===');
  console.log(JSON.stringify(summary, null, 2));
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`산출물: ${OUT}`);
  sw.close();
  app.quit();
}

app.whenReady().then(() => main().catch((e) => {
  console.error('탐침 실패:', e?.stack || e);
  app.quit();
}));
app.on('window-all-closed', () => {});
