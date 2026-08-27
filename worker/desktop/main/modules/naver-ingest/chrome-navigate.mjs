/**
 * 카테고리까지 **눌러서** 내려간다 — 설계도 §5-3 의 구현.
 * ---------------------------------------------------------------------------
 * 실측 2026-08-25: 목록 주소로 곧장 가면 네이버가
 *   "쇼핑 서비스 접속이 일시적으로 제한되었습니다"
 * 를 돌려준다. 주소창으로 가는 건 사람이 쇼핑하는 경로가 아니기 때문이다.
 *
 * 그래서 사람이 하는 그대로 간다.
 *   ① shopping.naver.com/ns/home        ← 주소로 여는 건 여기 한 번뿐이다
 *   ② 대분류에 hover → 메뉴가 열린다
 *   ③ 중분류 클릭
 *   ④ 소분류 클릭
 *   ⑤ 목록 페이지 도착 → 무한스크롤
 *
 * 모든 클릭은 chrome-cdp 의 Input.dispatchMouseEvent 다(isTrusted=true).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); t.unref?.(); });

const HOME = 'https://shopping.naver.com/ns/home';
const NAVER = 'https://www.naver.com';

/**
 * 대분류 이름 — 트리 스냅샷은 "부모ID → 자식들" 이라 **대분류 자신의 이름은 없다**(누구의
 * 자식도 아니므로). 단일 출처인 categories.mjs 에서 가져오되, 그 모듈은 electron 을 타고
 * 들어가므로 **실패해도 무시한다**(탐침을 순수 node 로 돌릴 수 있어야 한다).
 * 이름이 없어도 이동은 된다 — 링크 선택자는 id 로 잡기 때문이고, 이름은 hover 폴백·로그용이다.
 */
const _rootNames = new Map();
import('./categories.mjs')
  .then((m) => { for (const c of m.ROOT_CATEGORIES || []) _rootNames.set(String(c.id), c.name); })
  .catch(() => { /* 순수 node 실행 — 이름 없이 간다 */ });

let _tree = null;
function tree() {
  if (_tree) return _tree;
  try {
    _tree = JSON.parse(readFileSync(join(HERE, 'category-tree.json'), 'utf8'));
  } catch {
    _tree = { map: {} };
  }
  return _tree;
}

/**
 * 리프까지의 조상 사슬 — [{id,name}, …, {id:catId,name}].
 * 트리 스냅샷(category-tree.json)은 부모ID → 자식배열 형태라 뒤집어서 찾는다.
 */
export function ancestorChain(catId) {
  const map = tree().map || {};
  const parentOf = new Map();
  const nameOf = new Map();
  for (const [pid, children] of Object.entries(map)) {
    for (const c of children || []) {
      parentOf.set(String(c.id), String(pid));
      nameOf.set(String(c.id), c.name);
    }
  }
  const chain = [];
  let cur = String(catId);
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.unshift({ id: cur, name: nameOf.get(cur) || _rootNames.get(cur) || '' });
    cur = parentOf.get(cur);
  }
  return chain;
}

/**
 * 카테고리 메뉴에서 한 칸 내려간다.
 * 링크가 아직 안 그려졌으면 상위 이름에 hover 해서 메뉴를 연 뒤 다시 본다(설계도 ③: 8회 재시도).
 */
async function stepInto(page, node, parentName, onLog) {
  const sel = `a[href*="/ns/category/${node.id}"]`;

  for (let attempt = 1; attempt <= 8; attempt++) {
    const r = await page.clickLink(sel, { hoverMs: [600, 1000] });
    if (r.ok) { onLog(`  ↳ ${node.name || node.id} 클릭됨`); return { ok: true }; }

    // 팝업이 링크를 덮고 있으면 눌러 봐야 팝업이 눌린다 — 먼저 치운다.
    if (r.reason === 'covered') {
      const d = await page.dismissPopups();
      onLog(`  · 팝업이 링크를 덮고 있어 닫았습니다(${d?.closed ?? 0}개, ${r.coveredBy || '?'})`);
      await sleep(700);
      continue;
    }
    if (r.reason === 'not-found') {
      // ★ 팝업은 페이지가 뜬 **뒤에** 나타난다(쿠폰·멤버십 등). 진입 직전에 한 번 닫는 것만으로는
      //   부족해서, 링크를 못 찾을 때마다 다시 치운다. 실측 2026-08-26: "시크릿 쿠폰" 팝업이
      //   화면을 덮은 채라 카테고리 메뉴가 안 열렸고(catAnchors=0) 수집이 0개로 끝났다.
      const d = await page.dismissPopups();
      if (d?.closed) { onLog(`  · 팝업 ${d.closed}개를 닫았습니다.`); await sleep(700); }

      // 메뉴가 아직 안 열렸다 — 상위 이름에 마우스를 올려 연다.
      if (parentName) {
        await page.evaluate(`(() => {
          const want = ${JSON.stringify(parentName)};
          const el = [...document.querySelectorAll('a,button,li,span')]
            .find(x => (x.innerText||'').replace(/\\s+/g,' ').trim() === want);
          if (el) { el.scrollIntoView({block:'center'}); el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true})); }
          return !!el;
        })()`).catch(() => {});
      }
      // 대분류는 '카테고리' 메뉴가 열려야 화면에 나온다. 팝업 때문에 못 열렸을 수 있으니
      // (위에서 방금 치웠다) 다시 열어 본다 — 부모가 없는 첫 단계에만 해당한다.
      if (!parentName) {
        for (const trigger of ['text=카테고리', 'button[class*="ategory"]', '[class*="categoryButton"]']) {
          const opened = await page.clickLink(trigger, { hoverMs: [300, 600], timeoutMs: 1200 }).catch(() => null);
          if (opened && (opened.ok || opened.reason === 'no-navigation')) break;
        }
        await sleep(800);
      }

      // 이름으로도 한 번 노려본다(링크에 id 가 안 붙는 메뉴가 있다).
      if (node.name) {
        const byText = await page.clickLink(`text=${node.name}`, { hoverMs: [600, 1000] });
        if (byText.ok) { onLog(`  ↳ ${node.name} 클릭됨(이름)`); return { ok: true }; }
      }
      await sleep(500);
      continue;
    }
    if (r.reason === 'no-navigation') { await sleep(800); continue; }
    await sleep(500);
  }
  // 못 찾았으면 **화면에 뭐가 있었는지** 남긴다 — 이게 없으면 다음 사람이 또 추측한다.
  const sample = await page.evaluateJson(`(() => {
    const cat = [...document.querySelectorAll('a[href*="/ns/category/"]')]
      .map(a => ({ id: (a.href.match(/category\\/(\\d+)/)||[])[1], t: (a.innerText||'').replace(/\\s+/g,' ').trim().slice(0,20) }))
      .filter(x => x.id);
    return { url: location.href, catAnchors: cat.length, sample: cat.slice(0, 25),
             buttons: [...document.querySelectorAll('button')].map(b => (b.innerText||'').trim().slice(0,18)).filter(Boolean).slice(0, 25) };
  })()`).catch(() => null);
  return { ok: false, error: `${node.name || node.id} 링크를 찾지 못했습니다`, sample };
}

/**
 * 목표 카테고리의 **상품 목록 페이지**까지 눌러서 도달한다.
 * @returns {Promise<{ok:boolean, url?:string, error?:string, detect?:object}>}
 */
export async function descendToCategory(page, catId, { onLog = () => {}, warm = true } = {}) {
  const chain = ancestorChain(catId);
  if (!chain.length) return { ok: false, error: `카테고리 ${catId} 를 트리에서 찾지 못했습니다` };
  onLog(`경로: ${chain.map((c) => c.name || c.id).join(' > ')}`);

  // 워밍업 — 네이버를 먼저 들르고 쇼핑으로 간다(설계도 §6 ②).
  if (warm) {
    await page.goto(NAVER, { settleMs: 1500 });
    await sleep(1200);
  }
  await page.goto(HOME, { settleMs: 3000 });

  let det = await page.detect();
  if (det?.blocked) return { ok: false, error: '네이버가 접속을 제한했습니다 — 잠시 뒤에 다시 시도하세요.', detect: det };
  if (det?.loginRequired) return { ok: false, error: '네이버 로그인이 필요합니다.', detect: det };

  // 홈은 팝업(멤버십 가입 등)을 자주 띄운다 — 내려가기 전에 치운다.
  const dismissed = await page.dismissPopups();
  if (dismissed?.closed) { onLog(`팝업 ${dismissed.closed}개를 닫았습니다.`); await sleep(800); }

  // 대분류 링크는 '카테고리' 메뉴를 열어야 화면에 나온다 — 없으면 그냥 넘어간다(있는 곳도 있다).
  const rootSel = `a[href*="/ns/category/${chain[0].id}"]`;
  if (!(await page.evaluate(`!!document.querySelector(${JSON.stringify(rootSel)})`).catch(() => false))) {
    for (const trigger of ['text=카테고리', 'button[class*="ategory"]', '[class*="categoryButton"]']) {
      const opened = await page.clickLink(trigger, { hoverMs: [400, 700], timeoutMs: 1500 }).catch(() => null);
      // 메뉴 열기는 주소가 안 바뀌는 게 정상이라 no-navigation 도 성공으로 본다.
      if (opened && (opened.ok || opened.reason === 'no-navigation')) { onLog('카테고리 메뉴를 열었습니다.'); break; }
    }
    await sleep(1200);
  }

  // ② ~ ④ — 대분류부터 목표까지 한 칸씩 눌러 내려간다.
  let strays = 0;
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    const parentName = i > 0 ? chain[i - 1].name : null;
    const r = await stepInto(page, node, parentName, onLog);
    if (!r.ok) { onLog(`화면 실태: ${JSON.stringify(r.sample || {}).slice(0, 600)}`); return { ok: false, error: r.error, at: node, sample: r.sample }; }

    // ★ 엉뚱한 데로 끌려갔는지 본다. 팝업을 눌러 멤버십 가입 페이지로 간 적이 있다
    //   (실측 2026-08-25). 그대로 두면 그다음 단계는 영영 링크를 못 찾는다.
    const at = String(await page.url());
    if (!/shopping\.naver\.com|search\.shopping\.naver\.com/.test(at)) {
      if (++strays > 2) return { ok: false, error: `쇼핑 밖으로 끌려갔습니다 — ${at}` };
      onLog(`⚠️ 쇼핑 밖으로 나갔습니다(${at.slice(0, 60)}) — 홈으로 돌아가 다시 내려갑니다.`);
      await page.goto(HOME, { settleMs: 3000 });
      await page.dismissPopups();
      await sleep(800);
      i = -1;                       // 처음부터 다시 (다음 루프에서 i=0)
      continue;
    }

    det = await page.detect();
    if (det?.blocked) return { ok: false, error: '내려가는 중 네이버가 접속을 제한했습니다.', detect: det };
    if (det?.captcha) return { ok: false, error: '캡차가 떴습니다 — 크롬 창에서 풀어주세요.', detect: det };
  }

  // ⑤ 아직 메뉴 페이지(shopping.naver.com)라면 화면의 진짜 목록 링크를 눌러 넘어간다.
  const url = await page.url();
  if (!/search\.shopping\.naver\.com\/ns\/category/.test(String(url))) {
    const r = await page.clickLink(`a[href*="search.shopping.naver.com/ns/category/${catId}"]`, { hoverMs: [500, 900] });
    if (!r.ok) {
      onLog(`⚠️ 목록 링크를 못 찾았습니다(${r.reason}) — 현재 위치: ${url}`);
      return { ok: false, error: '목록 페이지 링크를 찾지 못했습니다', url };
    }
  }

  const finalUrl = await page.url();
  det = await page.detect();
  if (det?.blocked) return { ok: false, error: '목록 페이지에서 접속이 제한됐습니다.', detect: det };
  onLog(`목록 도착 — ${finalUrl}`);
  return { ok: true, url: finalUrl, detect: det };
}
