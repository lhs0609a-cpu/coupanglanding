/**
 * 목록 수집(크롬판) — 눌러서 들어가고, 목표를 채울 때까지 형제 소분류로 이어간다.
 * ---------------------------------------------------------------------------
 * collect-list.mjs(Electron판)와 계약은 같다: { items, stopped } 를 돌려준다.
 * "300개 시켰는데 48개" 를 파고들어 나온 원인 **넷**을 각각 여기서 막는다(전부 실측 2026-08-25).
 *
 *  ① 진입 — 주소로 안 가고 **진짜 클릭**으로 내려간다(chrome-navigate).
 *     `Page.navigate` 로 목록 주소에 직행하면 "쇼핑 서비스 접속이 일시적으로 제한되었습니다".
 *
 *  ② 스크롤 — `window.scrollBy` 가 아니라 **진짜 휠**(Input.dispatchMouseEvent)로 내린다.
 *     scrollBy 는 1회차 뒤로 요청이 0건이었고, 휠은 계속 나갔다(상품 50→99, 카드 266→439).
 *     클릭과 같은 이야기다 — 자바스크립트로 만든 입력은 브라우저 입력 파이프라인을 안 탄다.
 *
 *  ③ 418 — 목록 더받기(`/ns/v1/search/paged-composite-cards?cursor=…`)가 418 을 돌려주면
 *     페이지는 **이미 받은 카드까지 되돌린다**(439장 → 253장). 겉으로는 그냥 "안 늘어남"
 *     이라 원인이 안 보인다. 응답 상태를 직접 듣고 쉬어 준다.
 *
 *  ④ 범위 — 소분류 한 칸으로 목표를 못 채우면 **형제 소분류로 이어간다.**
 *     예전에는 카테고리 1개만 훑고 끝냈다("신선식품 300개" → 한라봉/감귤류 48개, DB 실측).
 *     과일 아래 소분류가 28개라, 이어가면 300개는 충분히 나온다(340개 실측).
 */
import { collectCardsJs } from './inject.mjs';
import { descendToCategory, ancestorChain } from './chrome-navigate.mjs';
import naverGate from '../../naver-gate.mjs';

const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); t.unref?.(); });
const rand = (min, max) => min + Math.random() * (max - min);

/**
 * 신규 0건이 이만큼 연속되면 그 카테고리는 끝난 것으로 본다.
 * ⚠️ 회차가 잘아져서(380px) 이득은 **약 12회에 한 번** 들어온다 — 8 로 두면 아직 더 나올
 *    목록을 "끝" 으로 오판한다(실측: 4→8→20→32 회차에서 +47씩 들어왔다).
 */
const NO_NEW_STOP = 30;

/** 목록 페이지 왼쪽에 형제 소분류가 통째로 있다 — 거기서 다음 칸을 **눌러서** 옮긴다. */
const SIBLING_LINKS_JS = `(() => {
  const seen = new Map();
  for (const a of document.querySelectorAll('a[href*="/ns/category/"]')) {
    const id = (a.href.match(/category\\/(\\d+)/) || [])[1];
    if (!id || seen.has(id)) continue;
    if (a.getAttribute('aria-current') === 'true') continue;
    seen.set(id, (a.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 30));
  }
  return [...seen].map(([id, name]) => ({ id, name }));
})()`;

/**
 * 한 카테고리 페이지에서 목표까지(또는 더 안 나올 때까지) 긁는다.
 * @returns {Promise<{gained:number, stopped:string}>}
 */
/**
 * 한 번에 내리는 픽셀 폭 — 사람은 휠 한 칸에 100~120px 를 서너 칸씩 굴린다.
 * 크게 확 내리면 더받기 요청이 한꺼번에 몰려 418 을 부른다.
 */
const STEP_PX = [300, 480];

async function scrollHarvest(page, items, { target, onLog, onProgress, signal, pace = STEP_PX, skippedSoldOut = new Set() }) {
  const before = items.size;
  let noNew = 0;
  // 카테고리를 옮기면 풀리는 설정이 있다 — 훑기 시작할 때마다 다시 못을 박는다.
  await page.keepRendering?.();

  // ── 418 감시 ──────────────────────────────────────────────────────────
  // 목록 더 받아오기는 /ns/v1/search/paged-composite-cards 로 나간다. 너무 빨리 긁으면
  // 여기서 418 이 돌아오고, 페이지는 **이미 받은 카드까지 되돌린다**(439→253 실측).
  // 그래서 겉으로는 "그냥 안 늘어남" 으로 보인다 — 듣고 있지 않으면 영영 모른다.
  let saw418 = 0;
  let pagedOk = 0;
  let gated = 0;      // 게이트를 소비한 더받기 횟수
  const unwatch = page.watchResponses(({ status, url }) => {
    if (!/paged-composite-cards/.test(url)) return;
    if (status === 418 || status === 429) saw418 += 1;
    else if (status === 200) pagedOk += 1;
  });

  try {
  for (let i = 1; i <= 800; i++) {
    if (signal?.aborted) return { gained: items.size - before, stopped: '중단됨' };
    if (items.size >= target) return { gained: items.size - before, stopped: '목표 도달' };

    // ★ 게이트는 **실제로 요청이 나갔을 때만** 소비한다.
    //   회차마다 소비하면 분당 12건에 걸려 5초씩 끊기는데, 그 리듬이 사람과 달라서
    //   봇 판별에 걸린다. 스크롤 회차 대부분은 네트워크로 나가지 않는다(약 12회에 1번).
    if (pagedOk > gated) {
      gated = pagedOk;
      await naverGate.acquire('ingest', { signal });
      await naverGate.waitCooldown(signal);
    }

    const had = items.size;
    const hit = saw418;

    // ★ 사람처럼 굴린다 — 이게 그대로 성적이 된다(실측 2026-08-26, 같은 방식·다른 카테고리).
    //     크게 7연발 + 10초 정지, 마우스 안 움직임 → 더받기 1회 뒤 418 (91개)
    //     작게 1회 + 굴리기 직전 미세 이동      → 더받기 4회 뒤 418 (243개)
    //     + 멈춰서 구경 + 가끔 위로 되돌아가기  → **더받기 12회, 차단 0회 (641개)**
    //   목록이 안 늘어나는 건 스크롤이 안 돼서가 아니라 서버가 더받기를 거부해서였다.
    const up = Math.random() < 0.12;                       // 가끔 위로 되돌아본다
    await page.wheel({
      steps: 1,
      deltaY: up ? -Math.round(rand(120, 300)) : Math.round(rand(pace[0], pace[1])),
      pauseMs: [40, 90],
    });
    await sleep(rand(350, 900));

    // 7회마다 멈춰서 구경한다 — 그동안에도 손은 움직인다(가만히 있는 게 봇 신호다).
    if (i % 7 === 0) {
      const until = Date.now() + rand(1500, 3500);
      while (Date.now() < until) {
        await page.jiggle().catch(() => {});
        await sleep(rand(120, 320));
      }
    }

    // ★ 418 은 재시도로 못 푼다. 맞는 순간 그 페이지의 로더가 죽어서, 아무리 굴려도
    //   요청이 다시 안 나간다(실측 2026-08-26: 30초 쉬고 6·9회차 모두 +0).
    //   그 자리에서 버티는 건 시간만 버리고 IP 만 더 달군다 — 바로 접는다.
    if (saw418 > hit) {
      naverGate.triggerCooldown(false);
      return {
        gained: items.size - before,
        stopped: `네이버 봇 차단(418) — ${items.size}개에서 멈췄습니다(받은 것은 유지)`,
        blocked418: true,
      };
    }

    let cards = [];
    try { cards = (await page.evaluateJson(collectCardsJs)) || []; }
    catch (e) { onLog(`⚠️ 카드 추출 실패 — ${e?.message || e}`); }
    // 품절은 담지 않는다 — 등록도 못 하는 걸 카탈로그에 쌓아 봐야 셀러가 고른 뒤에야 안다.
    for (const c of cards) {
      if (!c?.productNo) continue;
      if (c.soldOut) { skippedSoldOut.add(String(c.productNo)); continue; }
      items.set(String(c.productNo), c);
    }

    onProgress?.({ collected: items.size, scrolls: i, gained: items.size - had });

    const det = await page.detect().catch(() => null);
    if (det?.blocked) {
      const ms = naverGate.triggerCooldown(false);
      return { gained: items.size - before, stopped: `차단 — ${Math.round(ms / 1000)}초 정지` };
    }
    if (det?.captcha) return { gained: items.size - before, stopped: '캡차 — 크롬 창에서 풀어주세요' };

    if (items.size === had) {
      if (++noNew >= NO_NEW_STOP) return { gained: items.size - before, stopped: '이 카테고리 끝' };
    } else noNew = 0;

    if (i % 15 === 0) await sleep(rand(8000, 12000));
    else if (i % 8 === 0) await sleep(rand(4000, 7000));
    // 800~1200 구간은 418 직전이다(설계도 §5-4: 카테고리당 약 1000개 한계).
    if (items.size >= 800 && items.size <= 1200) await sleep(rand(500, 1000));
  }
  return { gained: items.size - before, stopped: '스크롤 상한 도달' };
  } finally {
    unwatch();
    if (pagedOk || saw418) onLog(`  (목록 더받기 ${pagedOk}회 성공 · 418 ${saw418}회)`);
  }
}

/**
 * @param {ChromePage} page
 * @param {string} catId 시작 카테고리(소분류 권장)
 * @param {object} opts { target, sweepSiblings, onLog, onProgress, signal }
 * @returns {Promise<{items:Array, stopped:string, visited:Array}>}
 */
export async function collectCategoryViaChrome(page, catId, opts = {}) {
  const {
    target = 300,
    /** 목표를 못 채우면 형제 소분류로 이어간다. 끄면 예전처럼 한 칸만 훑는다. */
    sweepSiblings = true,
    onLog = () => {},
    onProgress = () => {},
    signal,
    /** 스크롤 회차 사이 간격 [min,max]ms — 이게 418 을 맞느냐 마느냐를 가른다. */
    pace = STEP_PX,
  } = opts;

  const items = new Map();
  const visited = [];
  /** 품절이라 건너뛴 상품 — 몇 개를 뺐는지 말해 줘야 "왜 적게 나오지"를 오해하지 않는다. */
  const skippedSoldOut = new Set();

  const nav = await descendToCategory(page, catId, { onLog });
  if (!nav.ok) return { items: [], stopped: nav.error || '목록 도달 실패', visited };

  let r = await scrollHarvest(page, items, { target, onLog, onProgress, signal, pace, skippedSoldOut });
  visited.push({ id: catId, gained: r.gained, stopped: r.stopped });
  onLog(`${catId} — ${r.gained}개 (${r.stopped})`);

  if (items.size >= target || !sweepSiblings || signal?.aborted) {
    if (skippedSoldOut.size) onLog(`품절 ${skippedSoldOut.size}개는 담지 않았습니다.`);
    return { items: [...items.values()], stopped: r.stopped, visited, soldOutSkipped: skippedSoldOut.size };
  }

  // ── 형제 소분류로 이어간다 ────────────────────────────────────────────
  // 목록 페이지 왼쪽에 형제가 통째로 있으므로 **화면에서 눌러** 옮긴다(주소 직행 금지).
  // 조상은 형제가 아니다 — 브레드크럼에도 같은 모양의 링크가 있어서 걸러내지 않으면
  //   '신선식품'(할아버지)까지 훑으러 간다(실측: zero-size 로 튕겼다).
  const ancestorIds = new Set(ancestorChain(catId).map((c) => String(c.id)));
  const siblings = (await page.evaluateJson(SIBLING_LINKS_JS).catch(() => [])) || [];
  const queue = siblings.filter((s) => !ancestorIds.has(String(s.id)));

  if (!queue.length) {
    onLog('형제 소분류를 화면에서 찾지 못했습니다 — 여기서 멈춥니다.');
    return { items: [...items.values()], stopped: r.stopped, visited };
  }
  onLog(`목표(${target})까지 ${target - items.size}개 부족 — 형제 소분류 ${queue.length}칸으로 이어갑니다.`);

  for (const sib of queue) {
    if (signal?.aborted) { r = { stopped: '중단됨' }; break; }
    if (items.size >= target) { r = { stopped: '목표 도달' }; break; }

    // ★ 맨 위로 먼저 올라간다. 직전 카테고리를 바닥까지 훑고 왔기 때문에 그대로 두면
    //   ① 왼쪽 분류 링크가 화면 밖이라 못 누르고,
    //   ② 눌러서 넘어가도 스크롤이 바닥에 남아 새 목록이 더 안 불러와진다
    //      (49개만 받고 끝났던 '오렌지' 가 이 경우였다 — 실측 2026-08-25).
    await page.evaluate('window.scrollTo(0, 0)').catch(() => {});
    await sleep(rand(800, 1400));

    const moved = await page.clickLink(`a[href*="/ns/category/${sib.id}"]`, { hoverMs: [500, 900], timeoutMs: 12000 });
    if (!moved.ok) { onLog(`  ↷ ${sib.name || sib.id} 건너뜀(${moved.reason})`); continue; }
    onLog(`  → ${sib.name || sib.id}`);
    // 새 목록이 그려질 시간을 주고, 스크롤도 맨 위에서 시작한다.
    await sleep(rand(2000, 3000));
    await page.evaluate('window.scrollTo(0, 0)').catch(() => {});
    await sleep(rand(800, 1200));

    r = await scrollHarvest(page, items, { target, onLog, onProgress, signal, pace, skippedSoldOut });
    visited.push({ id: sib.id, name: sib.name, gained: r.gained, stopped: r.stopped });
    onLog(`  ${sib.name || sib.id} — +${r.gained} (누적 ${items.size})`);

    if (/차단|캡차|중단/.test(r.stopped)) break;
  }

  naverGate.recordSuccess();
  if (skippedSoldOut.size) onLog(`품절 ${skippedSoldOut.size}개는 담지 않았습니다.`);
  return {
    soldOutSkipped: skippedSoldOut.size,
    items: [...items.values()],
    stopped: items.size >= target ? '목표 도달' : (r?.stopped || '더 나올 것이 없음'),
    visited,
  };
}
