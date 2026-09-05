/**
 * '카테고리' 메뉴가 왜 안 열리는지만 본다 — 최소 접촉 탐침.
 * ---------------------------------------------------------------------------
 * 수집 탐침(naver-chrome-collect-probe)은 300개를 실제로 긁어서 네이버를 크게 두드린다.
 * 여기서 알고 싶은 것은 하나뿐이라 **홈 한 장만** 연다:
 *   "화면에 '카테고리' 라는 글자를 가진 요소가 몇 개이고, 그중 눌리는 게 있는가."
 *
 * clickLink 가 보는 것과 **똑같은 판정**을 재현한다(크기·뷰포트·elementFromPoint).
 * 그래야 로그의 실패 이유와 이 결과를 나란히 놓고 읽을 수 있다.
 *
 * 실행:
 *   cd worker/desktop
 *   node scripts/naver-category-trigger-probe.mjs
 *
 * ⚠️ 도우미가 켜져 있으면 같은 프로필을 쥐고 있어 크롬이 안 뜬다 — 도우미를 끄고 실행할 것.
 */
import { join } from 'node:path';
import { ChromeBrowser } from '../main/modules/naver-ingest/chrome-cdp.mjs';

const PROFILE = process.env.MEGALOAD_CHROME_PROFILE
  || join(process.env.APPDATA || process.env.HOME || '.', 'megaload-desktop', 'chrome-profile');

const HOME = 'https://shopping.naver.com/ns/home';
const NAVER = 'https://www.naver.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** clickLink 의 판정을 그대로 옮긴 것 — 여기서 갈라지면 비교가 무의미해진다. */
const DUMP = `(() => {
  const vis = (e) => !!(e && (e.offsetWidth || e.offsetHeight));
  const judge = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return { verdict: 'zero-size' };
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return { verdict: 'offscreen' };
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const top = document.elementFromPoint(x, y);
    if (!top || !(top === el || el.contains(top) || top.contains(el))) {
      return { verdict: 'covered', coveredBy: top ? (top.tagName + '.' + String(top.className || '').slice(0, 40)) : 'none' };
    }
    return { verdict: 'CLICKABLE', x, y };
  };

  // ① finder 와 같은 모집단에서 '카테고리' 정확일치를 전부 모은다.
  const pool = [...document.querySelectorAll('a[href], button, [role="button"], [role="menuitem"]')];
  const exact = pool.filter((el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim() === '카테고리');
  const cands = exact.map((el, i) => {
    const r = el.getBoundingClientRect();
    return {
      i, tag: el.tagName, cls: String(el.className || '').slice(0, 60),
      w: Math.round(r.width), h: Math.round(r.height),
      x: Math.round(r.left), y: Math.round(r.top),
      visible: vis(el), ...judge(el),
    };
  });

  // ② 카테고리 앵커가 지금 화면에 있는가(메뉴가 열렸는지의 직접 증거).
  const anchors = [...document.querySelectorAll('a[href*="/ns/category/"]')].length;

  // ③ '카테고리' 를 **포함**하는 것들 — 정확일치가 0일 때 이름이 바뀌었는지 본다.
  const loose = pool
    .map((el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim())
    .filter((t) => t && t.length <= 20 && t.includes('카테고리'));

  // ④ 대분류 이름이 화면에 있는가(메뉴가 이미 열려 있는 경우).
  const rootSeen = ['신선식품', '패션의류', '화장품/미용', '디지털/가전']
    .filter((n) => (document.body.innerText || '').includes(n));

  return { url: location.href, vw: innerWidth, vh: innerHeight,
           exactCount: cands.length, candidates: cands, catAnchors: anchors,
           looseTexts: [...new Set(loose)].slice(0, 10), rootSeen };
})()`;

// ⚠️ 이 모듈들의 sleep 은 unref() 된 타이머라 Node 가 대기 중에 그냥 끝나 버린다 — 붙잡아 둔다.
const keepAlive = setInterval(() => {}, 1000);
const b = new ChromeBrowser({ profileDir: PROFILE, onLog: (m) => console.log('  ' + m) });
try {
  console.log('크롬 기동…');
  await b.launch();
  const page = await b.newPage();

  console.log('워밍업 — naver.com');
  await page.goto(NAVER, { settleMs: 1500 });
  await sleep(1200);

  console.log('쇼핑 홈으로');
  await page.goto(HOME, { settleMs: 3000 });
  await sleep(1500);

  console.log('\n── 진입 직후 ─────────────────────────────');
  const before = await page.evaluateJson(DUMP);
  console.log(JSON.stringify(before, null, 2));

  const d = await page.dismissPopups();
  console.log(`\n팝업 닫기: ${d?.closed ?? 0}개`);

  // 실제로 눌러 본다 — 구버전이 하던 것과 같은 호출.
  const r = await page.clickLink('text=카테고리', { hoverMs: [400, 700], timeoutMs: 1500 });
  console.log(`clickLink('text=카테고리') → ${JSON.stringify(r)}`);
  await sleep(1500);

  console.log('\n── 클릭 시도 뒤 ───────────────────────────');
  console.log(JSON.stringify(await page.evaluateJson(DUMP), null, 2));

  // ★ 메뉴가 열린 상태에서 **네이버가 실제로 주는 대분류 링크**를 통째로 본다.
  //   우리 트리의 id 와 여기가 어긋나면 선택자(a[href*="/ns/category/<id>"])가 영원히 안 맞는다.
  console.log('\n── 메뉴 안 카테고리 링크 (네이버 실제) ─────');
  const links = await page.evaluateJson(`(() => {
    return [...document.querySelectorAll('a[href*="/ns/category/"]')].map((a) => ({
      id: (String(a.href).match(/category\\/([0-9]+)/) || [])[1] || '',
      t: (a.innerText || a.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 24),
    })).slice(0, 45);
  })()`);
  for (const l of links || []) console.log(`  ${String(l.id).padEnd(12)} ${l.t}`);

  const hasRoot = await page.evaluate(
    `!!document.querySelector('a[href*="/ns/category/10006530"]')`,
  );
  console.log(`\n우리 트리의 신선식품 id=10006530 링크가 화면에 있는가? → ${hasRoot}`);
  const freshByName = (links || []).find((l) => l.t === '신선식품');
  console.log(`네이버가 지금 주는 신선식품 id → ${freshByName ? freshByName.id : '(메뉴에 없음)'}`);

  await page.close().catch(() => {});
} catch (e) {
  console.error('❌ 탐침 실패 —', e?.message || e);
  process.exitCode = 1;
} finally {
  await b.close().catch(() => {});
  clearInterval(keepAlive);
}
