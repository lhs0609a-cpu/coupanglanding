/**
 * 실제 내려가기 경로(descendToCategory)를 **그대로** 돌리며 매 단계를 찍는다.
 * ---------------------------------------------------------------------------
 * 지금까지 두 가설이 실측으로 깨졌다:
 *   · 숨은 '카테고리' 동명 요소가 먼저 잡힌다  → 아니다(정확일치 1개, CLICKABLE)
 *   · 배경 탭이라 좌표가 0 이다               → 아니다(배경에서도 정상, 클릭도 됨)
 * 남은 차이는 **로그인 상태**다. 로그인한 홈은 FOR YOU 피드가 깔려 화면 구성이 다르다.
 *
 * ⚠️ 도우미를 끄고 실행해야 한다 — 같은 프로필을 쥐고 있으면 크롬이 안 뜬다.
 *
 * 실행:  cd worker/desktop && node scripts/naver-descend-probe.mjs
 */
import { join } from 'node:path';
import { ChromeBrowser } from '../main/modules/naver-ingest/chrome-cdp.mjs';
import { descendToCategory, ancestorChain } from '../main/modules/naver-ingest/chrome-navigate.mjs';

const PROFILE = process.env.MEGALOAD_CHROME_PROFILE
  || join(process.env.APPDATA || process.env.HOME || '.', 'megaload-desktop', 'chrome-profile');
const CAT = process.argv.find((a) => /^\d{6,}$/.test(a)) || '10007229';   // 기본: 감/홍시
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 홈에 도착한 직후의 상태 — rootSel 이 이미 있는지가 핵심이다. */
const state = (rootId) => `(() => {
  const anchors = [...document.querySelectorAll('a[href*="/ns/category/"]')];
  const rootSel = document.querySelectorAll('a[href*="/ns/category/${rootId}"]');
  const geom = [...rootSel].slice(0, 5).map((el) => {
    const r = el.getBoundingClientRect();
    const sized = r.width >= 1 && r.height >= 1;
    const inView = !(r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth);
    let hit = false, by = 'n/a';
    if (sized && inView) {
      const t = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      hit = !!(t && (t === el || el.contains(t) || t.contains(el)));
      by = t ? (t.tagName + '.' + String(t.className || '').slice(0, 36)) : 'none';
    }
    return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top),
             sized, inView, hit, by,
             verdict: !sized ? 'zero-size' : (!inView ? 'offscreen' : (hit ? 'CLICKABLE' : 'covered')) };
  });
  return { catAnchors: anchors.length, rootMatches: rootSel.length, rootGeom: geom,
           loggedIn: (document.body.innerText || '').includes('마이쇼핑'),
           scrollY: Math.round(scrollY), docH: Math.round(document.body.scrollHeight) };
})()`;

const keepAlive = setInterval(() => {}, 1000);
const b = new ChromeBrowser({ profileDir: PROFILE, onLog: (m) => console.log('  [크롬] ' + m) });
try {
  await b.launch();
  const page = await b.newPage();

  const chain = ancestorChain(CAT);
  const rootId = chain[0]?.id;
  console.log(`대상: ${chain.map((c) => c.name || c.id).join(' > ')}  (root=${rootId})`);

  // ── 홈에 도착한 직후를 먼저 본다 (descendToCategory 가 rootSel 을 검사하는 그 시점) ──
  await page.goto('https://www.naver.com', { settleMs: 1500 });
  await sleep(1200);
  await page.goto('https://shopping.naver.com/ns/home', { settleMs: 3000 });
  await sleep(1200);
  console.log('\n── 홈 도착 직후 (rootSel 검사 시점) ─────────');
  console.log('  ' + JSON.stringify(await page.evaluateJson(state(rootId))));
  console.log('  ⇒ rootMatches 가 0 이 아니면 descendToCategory 는 카테고리 메뉴를 **열지 않고** 넘어간다.');

  // ── 진짜 경로를 돈다 ────────────────────────────────────────────────
  console.log('\n── descendToCategory 실행 ───────────────────');
  const r = await descendToCategory(page, CAT, { onLog: (m) => console.log('  ' + m), warm: false });
  console.log('\n결과: ' + JSON.stringify({ ok: r.ok, error: r.error, url: r.url, at: r.at }));
  console.log('\n── 끝난 뒤 화면 ─────────────────────────────');
  console.log('  ' + JSON.stringify(await page.evaluateJson(state(rootId))));

  await page.close().catch(() => {});
} catch (e) {
  console.error('❌ 탐침 실패 —', e?.message || e);
  process.exitCode = 1;
} finally {
  await b.close().catch(() => {});
  clearInterval(keepAlive);
}
