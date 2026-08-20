/**
 * 소분류(depth 3) 탐침 — "중분류 페이지에 소분류가 있기는 한가"를 실측한다.
 * ---------------------------------------------------------------------------
 * 배경: prewarm 을 depth 8 로 완주했는데 중분류 376개가 **전부 자식 0개**로 캐시됐다
 * (관리자 PC settings.json 실측). 그래서 확인해야 할 것은 두 가지다.
 *   ① 렌더된 페이지에 애초에 소분류 링크가 있는가 (없다면 다른 출처를 찾아야 한다)
 *   ② 페이지가 XHR 로 카테고리 JSON 을 받아 오는가 (있다면 376장을 열 이유가 없다)
 *
 * 실행:
 *   cd worker/desktop
 *   npx --yes electron@33 scripts/naver-category-probe.mjs 10000132
 */
import { app, session } from 'electron';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ScrapeWindow } from '../main/modules/naver-ingest/browser.mjs';

const CAT = process.argv.find((a) => /^\d{6,}$/.test(a)) || '10000132';
const OUT = process.env.NAVER_PROBE_OUT || join(tmpdir(), 'naver-cat-probe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 링크를 **어디에 있는 것인지까지** 함께 본다 — 전역 메뉴와 사이드바를 갈라야 하기 때문이다. */
const linksJs = `
(() => { try {
  const out = [];
  const seen = [];
  for (const a of document.querySelectorAll('a[href*="/ns/category/"]')) {
    const m = (a.getAttribute('href') || '').match(/\/ns\/category\/(\d+)/);
    if (!m) continue;
    const span = a.querySelector('span');
    const name = ((span && span.textContent) || a.textContent || '').replace(/\s+/g, ' ').trim();
    // 조상 태그 사슬 — nav/aside/header 안인지, 본문인지가 여기서 갈린다.
    const chain = [];
    let el = a.parentElement;
    for (let i = 0; i < 8 && el; i++, el = el.parentElement) {
      chain.push(el.tagName.toLowerCase() + (el.getAttribute('role') ? '[' + el.getAttribute('role') + ']' : ''));
    }
    const r = a.getBoundingClientRect();
    out.push({
      id: m[1], name,
      aria: a.getAttribute('aria-current') || null,
      chain: chain.join('>'),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width),
      visible: r.width > 0 && r.height > 0,
    });
  }
  return {
    href: location.href,
    total: out.length,
    links: out,
    textLen: (document.body && document.body.innerText || '').length,
    text: (document.body && document.body.innerText || '').slice(0, 1500),
  };
  } catch (e) { return { error: String(e && e.stack || e) }; }
})()
`;

const report = { at: new Date().toISOString(), catId: CAT, xhr: [], phases: [] };

async function snap(sw, label) {
  const r = await sw.evaluate(linksJs).catch((e) => ({ error: String(e?.message || e) }));
  report.phases.push({ label, ...r });
  console.log(`\n[${label}] ${r.href || ''}`);
  console.log(`  카테고리 링크 ${r.total} 개 · 본문 ${r.textLen}자`);
  if (r.links) {
    const byChain = {};
    for (const l of r.links) byChain[l.chain] = (byChain[l.chain] || 0) + 1;
    console.log('  조상 사슬 top:', Object.entries(byChain).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([c, n]) => `${n}×${c}`).join(' | '));
  }
  return r;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  // XHR 전량 기록 — 카테고리 JSON API 가 있으면 여기 찍힌다.
  const ses = session.fromPartition('persist:naveringest');
  ses.webRequest.onCompleted({ urls: ['<all_urls>'] }, (d) => {
    if (d.resourceType === 'image' || d.resourceType === 'font' || d.resourceType === 'stylesheet') return;
    report.xhr.push({ t: d.resourceType, s: d.statusCode, url: d.url.slice(0, 300) });
  });

  const sw = new ScrapeWindow(0);
  console.log('워밍업…');
  await sw.warmUp().catch(() => null);

  console.log(`카테고리 이동 — ${CAT}`);
  const nav = await sw.gotoViaClick(`https://shopping.naver.com/ns/category/${CAT}`, { timeoutMs: 20000 });
  report.nav = nav;
  report.detect = await sw.detect().catch(() => null);
  console.log('nav', JSON.stringify(nav), 'detect', JSON.stringify(report.detect));

  await snap(sw, '1_진입직후');
  await sleep(4000);
  await snap(sw, '2_4초후');
  sw.show();
  await sleep(5000);
  await snap(sw, '3_표시_5초후');

  const html = await sw.evaluate('document.documentElement.outerHTML').catch(() => '');
  writeFileSync(join(OUT, `rendered-${CAT}.html`), String(html));
  writeFileSync(join(OUT, `report-${CAT}.json`), JSON.stringify(report, null, 2));
  console.log(`\nXHR ${report.xhr.length}건`);
  for (const x of report.xhr.filter((x) => x.t === 'xhr' || x.t === 'fetch').slice(0, 40)) {
    console.log(`  ${x.s} ${x.t} ${x.url}`);
  }
  console.log(`\n산출물: ${OUT}`);
  sw.close();
  app.quit();
}

app.whenReady().then(() => {
  main().catch((e) => {
    console.error('탐침 실패:', e?.stack || e);
    try { writeFileSync(join(OUT, `report-${CAT}.json`), JSON.stringify({ ...report, fatal: String(e?.message || e) }, null, 2)); } catch { /* ignore */ }
    app.quit();
  });
});
app.on('window-all-closed', () => { /* 스크립트가 끝날 때까지 유지 */ });
