/**
 * "배경 탭이면 카테고리 버튼을 못 누른다" 를 재현한다.
 * ---------------------------------------------------------------------------
 * 수집은 풀에서 빌린 탭에서 돈다. 그런데 그 탭이 **앞에 있지 않으면** 크롬이 렌더링을
 * 미룬다 — 레이아웃이 계산되지 않아 getBoundingClientRect() 가 0 을 돌려주고,
 * clickLink 는 zero-size 로 튕긴다. 그러면 카테고리 메뉴가 영영 안 열려 수집이 0개다.
 *
 * keepRendering() 은 그 억제를 푸는데(포커스 에뮬레이션 + 라이프사이클 active),
 * 지금은 **목록에 도착한 뒤**(scrollHarvest)에만 불린다 — 정작 필요한 건 내려가는 동안이다.
 *
 * 실행:  cd worker/desktop && node scripts/naver-bgtab-probe.mjs
 */
import { join } from 'node:path';
import { ChromeBrowser } from '../main/modules/naver-ingest/chrome-cdp.mjs';

const PROFILE = process.env.MEGALOAD_CHROME_PROFILE
  || join(process.env.APPDATA || process.env.HOME || '.', 'megaload-desktop', 'chrome-profile');
const HOME = 'https://shopping.naver.com/ns/home';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GEOM = `(() => {
  const el = [...document.querySelectorAll('a[href], button, [role="button"], [role="menuitem"]')]
    .find((e) => (e.innerText || e.textContent || '').replace(/\\s+/g, ' ').trim() === '카테고리');
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const sized = r.width >= 1 && r.height >= 1;
  const inView = !(r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth);
  return {
    found: true, w: Math.round(r.width), h: Math.round(r.height),
    x: Math.round(r.left), y: Math.round(r.top), vw: innerWidth, vh: innerHeight,
    sized, inView, visibility: document.visibilityState,
    verdict: !sized ? 'zero-size' : (!inView ? 'offscreen' : 'ok'),
  };
})()`;

const keepAlive = setInterval(() => {}, 1000);
const b = new ChromeBrowser({ profileDir: PROFILE, onLog: (m) => console.log('  ' + m) });
try {
  await b.launch();

  // 수집이 쓸 탭 — 먼저 만들고 쇼핑 홈을 연다.
  const work = await b.newPage();
  await work.goto(HOME, { settleMs: 3000 });
  await sleep(1000);

  console.log('\n① 작업 탭이 앞에 있을 때');
  console.log('   ' + JSON.stringify(await work.evaluateJson(GEOM)));

  // 다른 탭을 앞으로 — 로그인·캡차 창이 앞에 오는 실제 상황과 같다.
  const other = await b.newPage();
  await other.goto('https://www.naver.com', { settleMs: 1500 });
  await other.bringToFront();
  await sleep(2500);

  console.log('\n② 다른 탭이 앞으로 온 뒤 (= 수집 탭이 배경)');
  console.log('   ' + JSON.stringify(await work.evaluateJson(GEOM)));
  const r1 = await work.clickLink('text=카테고리', { hoverMs: [400, 700], timeoutMs: 1500 });
  console.log('   clickLink → ' + JSON.stringify(r1));
  await sleep(1200);
  const a1 = await work.evaluate(`document.querySelectorAll('a[href*="/ns/category/"]').length`);
  console.log(`   메뉴 열림? catAnchors=${a1}`);

  // 고치려는 것 — 내려가기 전에 keepRendering 을 건다.
  console.log('\n③ keepRendering() 을 건 뒤 (배경 탭 그대로)');
  await work.keepRendering();
  await sleep(800);
  console.log('   ' + JSON.stringify(await work.evaluateJson(GEOM)));
  const r2 = await work.clickLink('text=카테고리', { hoverMs: [400, 700], timeoutMs: 1500 });
  console.log('   clickLink → ' + JSON.stringify(r2));
  await sleep(1200);
  const a2 = await work.evaluate(`document.querySelectorAll('a[href*="/ns/category/"]').length`);
  console.log(`   메뉴 열림? catAnchors=${a2}`);
  const root = await work.evaluate(`!!document.querySelector('a[href*="/ns/category/10006530"]')`);
  console.log(`   신선식품(10006530) 링크 있음? ${root}`);

  await other.close().catch(() => {});
  await work.close().catch(() => {});
} catch (e) {
  console.error('❌ 탐침 실패 —', e?.message || e);
  process.exitCode = 1;
} finally {
  await b.close().catch(() => {});
  clearInterval(keepAlive);
}
