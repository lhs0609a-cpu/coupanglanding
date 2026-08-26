/**
 * 목록 무한스크롤 탐침 — "사람이 내리면 계속 나오는데 우리는 왜 안 나오나"를 실측한다.
 * ---------------------------------------------------------------------------
 * naver-list-probe.mjs 는 메뉴 페이지에서 멈춘다(상품 0개). 여기서는 목록 주소로 바로 가서
 * 스크롤 회차마다 아래를 전부 기록한다.
 *   · 문서 높이 / scrollY / 카드 수         → 실제로 더 붙었나
 *   · fetch·XHR 호출 수와 마지막 주소       → 로더가 발화는 했나 (안 했으면 센티넬 문제)
 *   · IntersectionObserver 생성·콜백 수     → 센티넬이 관찰은 되고 있나
 *   · scroll 이벤트 수                      → 우리 scrollTo 가 이벤트를 만들긴 하나
 *
 * 숨긴 창 → 보이는 창 순서로 같은 창에서 재는 게 핵심이다(세션·referrer 오염 방지).
 *
 * 실행:
 *   cd worker/desktop
 *   electron scripts/naver-list-scroll-probe.mjs 10007229 --user-data-dir=<프로필>
 */
import { app } from 'electron';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ScrapeWindow } from '../main/modules/naver-ingest/browser.mjs';
import { collectCardsJs, scrollStepJs } from '../main/modules/naver-ingest/inject.mjs';

const CAT = process.argv.find((a) => /^\d{6,}$/.test(a)) || '10007229';
const ROUNDS = Number((process.argv.find((a) => a.startsWith('--rounds=')) || '').slice(9)) || 6;
const OUT = process.env.NAVER_PROBE_OUT || join(tmpdir(), 'naver-list-scroll-probe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 페이지에 계측기를 심는다 — 로더가 발화했는지는 이걸로만 알 수 있다. */
const installSpyJs = `
(() => {
  if (window.__spy) return 'already';
  const s = { fetch: 0, xhr: 0, scrollEvents: 0, ioNew: 0, ioCb: 0, lastUrls: [] };
  window.__spy = s;
  const of = window.fetch;
  window.fetch = function (...a) {
    s.fetch++;
    try { const u = String(a[0]?.url || a[0]); s.lastUrls.push(u.slice(0, 200)); if (s.lastUrls.length > 25) s.lastUrls.shift(); } catch (e) {}
    return of.apply(this, a);
  };
  const oo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u, ...r) {
    s.xhr++;
    try { s.lastUrls.push('XHR ' + String(u).slice(0, 200)); if (s.lastUrls.length > 25) s.lastUrls.shift(); } catch (e) {}
    return oo.call(this, m, u, ...r);
  };
  window.addEventListener('scroll', () => { s.scrollEvents++; }, { passive: true, capture: true });
  const OIO = window.IntersectionObserver;
  if (OIO) {
    window.IntersectionObserver = function (cb, opts) {
      s.ioNew++;
      return new OIO((entries, obs) => { s.ioCb++; return cb(entries, obs); }, opts);
    };
    window.IntersectionObserver.prototype = OIO.prototype;
  }
  return 'installed';
})()
`;

const metricsJs = `
(() => {
  const a = [...document.querySelectorAll('a[href]')];
  const se = document.scrollingElement;
  return {
    visibility: document.visibilityState,
    innerH: window.innerHeight,
    scrollY: window.scrollY,
    bodyH: document.body ? document.body.scrollHeight : 0,
    docH: se ? se.scrollHeight : 0,
    anchors: a.length,
    products: a.filter(x => /\\/products\\/\\d+/.test(x.href || '')).length,
    cards: document.querySelectorAll('[class*="basicProductCard"]').length,
    imgs: document.querySelectorAll('img').length,
    dom: document.getElementsByTagName('*').length,
    spy: window.__spy ? JSON.parse(JSON.stringify(window.__spy)) : null,
  };
})()
`;

const report = { at: new Date().toISOString(), catId: CAT, rounds: [] };

async function measure(sw, label) {
  const m = await sw.evaluate(metricsJs).catch((e) => ({ error: String(e?.message || e) }));
  let cards = 0;
  try { cards = (await sw.evaluate(collectCardsJs) || []).length; } catch (e) { /* ignore */ }
  const row = { label, url: sw.url, collectCards: cards, ...m };
  report.rounds.push(row);
  const sp = m.spy || {};
  console.log(
    `[${label}] docH=${m.docH} bodyH=${m.bodyH} scrollY=${m.scrollY} | 상품링크=${m.products} 카드DOM=${m.cards} 수집기=${cards}`
    + ` | fetch=${sp.fetch} xhr=${sp.xhr} scrollEv=${sp.scrollEvents} ioNew=${sp.ioNew} ioCb=${sp.ioCb}`,
  );
  return row;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const sw = new ScrapeWindow(0);

  console.log('워밍업…');
  console.log('워밍업', (await sw.warmUp()) ? 'ok' : '실패');

  const listUrl = `https://search.shopping.naver.com/ns/category/${CAT}`;
  console.log(`목록으로 이동(클릭) — ${listUrl}`);
  report.nav = await sw.gotoViaClick(listUrl, { timeoutMs: 25000 });
  report.detect = await sw.detect().catch(() => null);
  console.log('nav', JSON.stringify(report.nav), 'detect', JSON.stringify(report.detect));
  await sleep(3000);

  console.log('계측기 설치:', await sw.evaluate(installSpyJs).catch((e) => String(e)));
  await measure(sw, 'A0_숨김_진입');

  for (let i = 1; i <= ROUNDS; i++) {
    await sw.evaluate(scrollStepJs).catch(() => {});
    await sleep(2500);
    await measure(sw, `A${i}_숨김_스크롤${i}`);
  }

  console.log('\n창을 띄운다 →');
  sw.show();
  await sleep(4000);
  await sw.evaluate(installSpyJs).catch(() => {});
  await measure(sw, 'B0_표시_직후');

  for (let i = 1; i <= ROUNDS; i++) {
    await sw.evaluate(scrollStepJs).catch(() => {});
    await sleep(2500);
    await measure(sw, `B${i}_표시_스크롤${i}`);
  }

  // 사람처럼 조금씩 내리기 — 한 번에 바닥으로 점프하는 것과 다른지 본다.
  console.log('\n사람처럼 조금씩 내리기 →');
  for (let i = 1; i <= ROUNDS; i++) {
    await sw.evaluate(`
      (async () => {
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        for (let k = 0; k < 8; k++) {
          window.scrollBy({ top: Math.round(window.innerHeight * 0.6), behavior: 'smooth' });
          await wait(350);
        }
        return window.scrollY;
      })()
    `).catch(() => {});
    await sleep(2500);
    await measure(sw, `C${i}_표시_사람스크롤${i}`);
  }

  const html = await sw.evaluate('document.documentElement.outerHTML').catch(() => '');
  writeFileSync(join(OUT, 'rendered.html'), String(html));
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n산출물: ${OUT}`);
  sw.close();
  app.quit();
}

app.whenReady().then(() => {
  main().catch((e) => {
    console.error('탐침 실패:', e?.stack || e);
    try { writeFileSync(join(OUT, 'report.json'), JSON.stringify({ ...report, fatal: String(e?.message || e) }, null, 2)); } catch { /* ignore */ }
    app.quit();
  });
});
app.on('window-all-closed', () => { /* 스크립트가 끝날 때까지 유지 */ });
