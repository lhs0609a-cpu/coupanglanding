/**
 * 네이버 목록 수집 0건 탐침 — "왜 안 긁히나"를 추측하지 않고 실측한다.
 * ---------------------------------------------------------------------------
 * 검증하려는 가설 3가지:
 *   ① 숨긴 창(show:false)이라 목록이 안 그려진다 (렌더/IntersectionObserver 정지)
 *   ② 스크롤 대상이 body 가 아니라 내부 컨테이너다 (scrollTo 가 헛돈다)
 *   ③ 상품 링크 모양이 우리 정규식(naver.com/{store}/products/{n})과 다르다
 *
 * 같은 창 하나로 숨김 → 표시 순서로 재는 게 핵심이다. 창을 새로 만들면
 * 세션·referrer 가 달라져 비교가 오염된다.
 *
 * 실행:
 *   cd worker/desktop
 *   npx --yes electron@33 scripts/naver-list-probe.mjs 10007088
 */
import { app } from 'electron';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ScrapeWindow } from '../main/modules/naver-ingest/browser.mjs';
import { collectCardsJs, scrollStepJs, probePageJs } from '../main/modules/naver-ingest/inject.mjs';

const CAT = process.argv.find((a) => /^\d{6,}$/.test(a)) || '10007088';
/** 목록이 실제로 어느 호스트에 있는지 비교하려고 URL 을 통째로 바꿀 수 있게 둔다. */
const URL_OVERRIDE = (process.argv.find((a) => a.startsWith('--url=')) || '').slice(6);
const OUT = process.env.NAVER_PROBE_OUT || join(tmpdir(), 'naver-list-probe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 화면/스크롤 실태 — 숨김 창에서 무엇이 죽는지 보려고 렌더러 상태를 통째로 잰다. */
const metricsJs = `
(() => {
  const scrollables = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const oy = cs.overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 200) {
      scrollables.push({
        tag: el.tagName, cls: String(el.className || '').slice(0, 40),
        scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollTop: el.scrollTop,
      });
    }
  }
  const anchors = [...document.querySelectorAll('a[href]')];
  return {
    visibilityState: document.visibilityState,
    hidden: document.hidden,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    scrollY: window.scrollY,
    docScrollTop: document.scrollingElement ? document.scrollingElement.scrollTop : null,
    docScrollHeight: document.scrollingElement ? document.scrollingElement.scrollHeight : null,
    bodyScrollHeight: document.body ? document.body.scrollHeight : 0,
    bodyChildren: document.body ? document.body.children.length : 0,
    domNodes: document.getElementsByTagName('*').length,
    anchors: anchors.length,
    productsPlural: anchors.filter(a => (a.href||'').includes('/products/')).length,
    imgs: document.querySelectorAll('img').length,
    textLen: (document.body && document.body.innerText || '').length,
    hrefSample: anchors.slice(0, 40).map(a => (a.href||'').split('?')[0].slice(0, 120)),
  };
})()
`;

const report = { at: new Date().toISOString(), catId: CAT, phases: [] };

async function snap(sw, label) {
  const m = await sw.evaluate(metricsJs).catch((e) => ({ error: String(e?.message || e) }));
  let cards = null, cardsError = null;
  try { cards = await sw.evaluate(collectCardsJs); } catch (e) { cardsError = String(e?.message || e); }
  const p = await sw.evaluate(probePageJs).catch(() => null);
  const phase = {
    label,
    url: sw.url,
    metrics: m,
    cardCount: Array.isArray(cards) ? cards.length : null,
    cardsError,
    cardSamples: Array.isArray(cards) ? cards.slice(0, 5) : null,
    shapes: p?.shapes || null,
    productish: p?.productish || null,
    textHead: p?.text ? p.text.slice(0, 400) : null,
  };
  report.phases.push(phase);
  console.log(`\n[${label}] url=${phase.url}`);
  console.log(`  visibility=${m.visibilityState} hidden=${m.hidden} innerH=${m.innerHeight}`);
  console.log(`  scrollY=${m.scrollY} bodyScrollHeight=${m.bodyScrollHeight} docScrollHeight=${m.docScrollHeight}`);
  console.log(`  anchors=${m.anchors} /products/=${m.productsPlural} imgs=${m.imgs} dom=${m.domNodes} text=${m.textLen}`);
  console.log(`  내부 스크롤 컨테이너=${(m.scrollables || []).length ?? 'n/a'}  카드=${phase.cardCount} ${cardsError || ''}`);
  if (p?.shapes) console.log('  링크모양 top5:', p.shapes.slice(0, 5).map((s) => `${s.shape}×${s.n}`).join(' | '));
  return phase;
}

async function scrollTimes(sw, n, label) {
  for (let i = 0; i < n; i++) {
    await sw.evaluate(scrollStepJs).catch(() => {});
    await sleep(2500);
  }
  return snap(sw, label);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const sw = new ScrapeWindow(0);

  console.log('워밍업(네이버 → 쇼핑)…');
  const warm = await sw.warmUp();
  console.log('워밍업', warm ? 'ok' : '실패');

  console.log(`카테고리 이동(클릭) — ${CAT}`);
  const nav = await sw.gotoViaClick(URL_OVERRIDE || `https://shopping.naver.com/ns/category/${CAT}`, { timeoutMs: 20000 });
  report.nav = nav;
  report.detect = await sw.detect().catch(() => null);
  console.log('nav', JSON.stringify(nav), 'detect', JSON.stringify(report.detect));

  // 페이지 안에 이미 있는 진짜 링크를 클릭한다 — 우리가 만든 가짜 <a> 와 달리 referrer·경로가
  // 사람과 완전히 같다. "로그인 요구가 봇 판정 때문인지, 원래 그런지"는 이걸로만 갈린다.
  const CLICK_IN_PAGE = (process.argv.find((a) => a.startsWith('--click=')) || '').slice(8);
  if (CLICK_IN_PAGE) {
    await snap(sw, '0_클릭전');
    const navP = sw._waitForNavigation(20000);
    const clicked = await sw.evaluate(`
      (() => {
        const a = [...document.querySelectorAll('a[href]')].find(x => (x.href||'').includes(${JSON.stringify(CLICK_IN_PAGE)}));
        if (!a) return { found: false };
        a.scrollIntoView({ block: 'center' });
        a.click();
        return { found: true, href: a.href, text: (a.innerText||'').trim().slice(0,40) };
      })()
    `, true).catch((e) => ({ error: String(e?.message || e) }));
    console.log('페이지 내 링크 클릭:', JSON.stringify(clicked));
    report.clickInPage = clicked;
    report.clickNav = await navP;
    await sleep(3000);
    await sw.waitSpaReady().catch(() => {});
  }

  await snap(sw, '1_숨김_진입직후');
  await scrollTimes(sw, 3, '2_숨김_스크롤3회');

  console.log('\n창을 화면에 띄운다 →');
  sw.show();
  await sleep(4000);
  await snap(sw, '3_표시_직후');
  await scrollTimes(sw, 3, '4_표시_스크롤3회');

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
app.on('window-all-closed', () => { /* 창을 닫아도 스크립트가 끝날 때까지 유지 */ });
