/**
 * smartstore 429 우회 경로 탐침.
 * ---------------------------------------------------------------------------
 * 실측(2026-08-18): brand.naver.com 은 0.3~0.7초에 통과하는데 smartstore.naver.com 은
 * 상품 주소로 곧장 가면 **5/5 전부 429**. 클릭 이동으로 바꿔도 동일했다.
 * 그래서 "어떻게 들어가느냐" 를 바꿔 가며 통과 조건을 찾는다.
 *
 *   A. 스토어 홈 경유   : smartstore.naver.com/<store> 를 먼저 열고 → 상품으로 클릭
 *   B. 모바일 UA        : m.smartstore.naver.com 쪽 게이트가 느슨한 경우가 있다
 *   C. 검색 경유        : 네이버 쇼핑에서 들어온 것처럼 referrer 를 만든다
 *
 * 실행: cd worker/desktop && npx --yes electron@33 scripts/stock-smartstore-probe.mjs <urls.json>
 */
import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ScrapeWindow } from '../main/modules/naver-ingest/browser.mjs';

const URLS_FILE = process.argv.find((a) => a.endsWith('.json'));
const OUT = process.env.STOCK_PROBE_OUT || join(tmpdir(), 'stock-smartstore-probe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readStateJs = `
(() => {
  const out = { hasState: false, statusType: null, bodyLen: 0, title: document.title };
  try {
    out.bodyLen = (document.body && document.body.innerText || '').length;
    const s = window.__PRELOADED_STATE__;
    if (s) {
      out.hasState = true;
      const m = JSON.stringify(s).match(/"productStatusType"\\s*:\\s*"([A-Z_]+)"/);
      if (m) out.statusType = m[1];
    }
  } catch (e) { out.error = String(e && e.message || e); }
  return out;
})()
`;

const report = { at: new Date().toISOString(), rows: [] };

async function read(sw) {
  let st = null;
  for (let i = 0; i < 6; i++) {
    st = await sw.evaluate(readStateJs).catch(() => null);
    if (st?.hasState) break;
    await sleep(1000);
  }
  return st;
}

async function record(sw, url, method, nav, t0) {
  const st = await read(sw);
  const row = {
    method, url, ms: Date.now() - t0,
    navStatus: nav?.status ?? null, navError: nav?.error || null,
    landedOn: sw.url.slice(0, 90),
    hasState: st?.hasState ?? false, statusType: st?.statusType ?? null,
    bodyLen: st?.bodyLen ?? 0,
    ok: !!(st?.hasState && st?.statusType),
  };
  report.rows.push(row);
  console.log(`  [${method}] ${(row.ms / 1000).toFixed(1)}s status=${row.navStatus} ${row.ok ? '✅ ' + row.statusType : '❌'} ${row.navError || ''}`);
  return row;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const all = JSON.parse(readFileSync(URLS_FILE, 'utf8'));
  const urls = all.filter((u) => u.includes('smartstore.naver.com')).slice(0, 4);
  const sw = new ScrapeWindow(0);
  console.log('워밍업…', (await sw.warmUp()) ? 'ok' : '실패');

  for (const url of urls) {
    const store = (url.match(/smartstore\.naver\.com\/([^/]+)/) || [])[1];
    console.log(`\n${url}`);

    // A. 스토어 홈을 먼저 들러 그 도메인의 쿠키를 받은 뒤 상품으로.
    let t0 = Date.now();
    const home = await sw.gotoViaClick(`https://smartstore.naver.com/${store}`, { timeoutMs: 25000, skipReady: true });
    await sleep(1500);
    console.log(`  (스토어 홈 status=${home.status} ${home.error || ''})`);
    const nav = await sw.gotoViaClick(url, { timeoutMs: 25000, skipReady: true });
    await record(sw, url, 'store-home-first', nav, t0);
    await sleep(3000);

    // B. 모바일 도메인.
    t0 = Date.now();
    const mUrl = url.replace('smartstore.naver.com', 'm.smartstore.naver.com');
    const mNav = await sw.gotoViaClick(mUrl, { timeoutMs: 25000, skipReady: true });
    await record(sw, mUrl, 'mobile', mNav, t0);
    await sleep(3000);
  }

  const summary = {};
  for (const m of ['store-home-first', 'mobile']) {
    const rs = report.rows.filter((r) => r.method === m);
    summary[m] = {
      n: rs.length, ok: rs.filter((r) => r.ok).length,
      중앙값초: rs.length ? (rs.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rs.length / 2)] / 1000).toFixed(1) : null,
    };
  }
  report.summary = summary;
  console.log('\n=== 요약 ===');
  console.log(JSON.stringify(summary, null, 2));
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  sw.close();
  app.quit();
}

app.whenReady().then(() => main().catch((e) => { console.error(e?.stack || e); app.quit() }));
app.on('window-all-closed', () => {});
