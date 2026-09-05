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
 *     ⚠️ 418 은 **페이지 차단이 아니라 요청 한 건의 거절**이다. 화면은 멀쩡히 살아 있다
 *        (실측 2026-08-27: "봇 차단" 으로 접은 뒤에도 크롬 창에는 상품이 그대로 있었고
 *        사람이 굴리니 계속 받아왔다). 그래서 첫 418 에 접지 않는다 — 쉬었다 굴려 보고
 *        **정말 안 오는지 확인한 뒤에** 접는다. 아래 PROBE_AFTER_418 참고.
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

/**
 * 418 을 맞은 뒤 **접기 전에 확인하는 회차 수.**
 * 예전엔 첫 418 에 그 자리에서 접었다("맞는 순간 로더가 죽는다"고 봤다). 그 판단의 근거였던
 * 2026-08-26 측정은 하루에 탐침을 열 번 넘게 돌려 세션이 달아오른 상태에서 나온 것이고,
 * 8/27 에는 "봇 차단(418)" 으로 접은 **직후에도 크롬 창의 목록이 멀쩡히 살아 있었다.**
 * 죽었는지 아닌지는 추측할 일이 아니라 확인할 일이다 — 쉬었다 굴려서 이 회차 안에
 * 200 이 오거나 상품이 늘면 살아 있는 것이고, 아무것도 안 오면 그때 접는다.
 * (Electron 판은 원래 이 정책이었다 — collect-list.mjs:137 "3회면 30초 정지 후 계속")
 */
const PROBE_AFTER_418 = 12;

/** 회복 없이 **연달아** 이만큼 맞으면 더 버티지 않는다 — IP 만 달군다. */
const MAX_418_STREAK = 3;

/**
 * 회복을 몇 번 봤든 한 카테고리에서 418 을 이만큼 맞으면 접는다.
 * 연속 카운터만 두면 "418 → 회복 → 418 → 회복…" 이 끝없이 반복될 때 상한이 사라진다.
 * 그 상태는 이미 세션이 달아오른 것이라, 계속 두드릴수록 단기 밴이 장기 밴이 된다.
 */
const MAX_418_TOTAL = 12;

/** 418 뒤 쉬는 시간 — 사람이 "왜 안 나오지" 하고 잠깐 멈추는 정도. */
const REST_AFTER_418_MS = [20000, 40000];

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
  /**
   * 418 을 돌려준 주소 — 한 번은 로그에 적는다.
   * "정말 목록 더받기가 거절된 게 맞나, 엉뚱한 위젯 요청을 세고 있는 건 아닌가" 는
   * 추측으로 답할 수 없다. 진짜 더받기에는 cursor 가 붙는다 — 그것까지 적어 둔다.
   */
  let url418 = '';
  /** 418 응답의 본문 앞부분 — 차단 안내인지, 그냥 빈 껍데기인지 눈으로 본다. */
  let body418 = '';
  const unwatch = page.watchResponses(({ status, url, requestId }) => {
    if (!/paged-composite-cards/.test(url)) return;
    if (status === 418 || status === 429) {
      saw418 += 1;
      url418 = url;
      // 본문은 버퍼가 살아 있을 때만 읽힌다 — 여기서 바로 집는다(실패해도 그만).
      if (!body418) page.responseBody?.(requestId).then((b) => { if (b) body418 = b; }).catch(() => {});
    } else if (status === 200) pagedOk += 1;
  });

  /** 418 이후 회복을 확인하는 중이면 남은 회차. 0 이면 확인 중이 아니다. */
  let probe418 = 0;
  /** 418 을 맞고도 다시 받아온 횟수 — "차단이라더니 멀쩡하더라" 를 숫자로 남긴다. */
  let recovered418 = 0;
  /** 마지막 회복 이후 연속으로 맞은 418. 회복하면 0 으로 돌아간다. */
  let streak418 = 0;
  let shownUrl418 = false;

  const giveUp418 = (why) => {
    naverGate.triggerCooldown(false);
    return {
      gained: items.size - before,
      stopped: `네이버가 목록 더받기를 계속 거절합니다(418, ${why}) — ${items.size}개에서 멈췄습니다(받은 것은 유지)`,
      blocked418: true,
    };
  };

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
    const okBefore = pagedOk;

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

    let cards = [];
    try { cards = (await page.evaluateJson(collectCardsJs)) || []; }
    catch (e) { onLog(`⚠️ 카드 추출 실패 — ${e?.message || e}`); }
    // 품절·품절임박은 담지 않는다 — 등록도 못 하거나 등록 직전에 사라질 걸 카탈로그에 쌓아 봐야
    // 셀러는 고른 뒤에야 안다. 판정은 inject.mjs 의 soldOut(카드 배지 글자) 하나로 본다.
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

    // ── 418 — 접기 전에 정말 안 오는지 확인한다 ───────────────────────────
    // 이 회차에 뭐라도 들어왔으면(200 응답이든 새 상품이든) 로더는 살아 있는 것이다.
    const alive = items.size > had || pagedOk > okBefore;

    if (saw418 > hit) {
      if (!shownUrl418 && url418) {
        shownUrl418 = true;
        const hasCursor = /[?&]cursor=/.test(url418);
        onLog(`  (418 응답: ${url418.split('?')[0]} · ${hasCursor ? 'cursor 있음 = 목록 더받기가 맞습니다' : 'cursor 없음 = 더받기가 아닐 수 있습니다'})`);
        if (body418) onLog(`  (418 본문: ${body418.replace(/\s+/g, ' ').slice(0, 140)})`);
      }
      if (alive) {
        // 418 을 맞았는데 목록은 계속 온다 — 접을 이유가 없다.
        recovered418 += 1;
        streak418 = 0;
        probe418 = 0;
        // 회복은 첫 번째만 말한다 — 매번 찍으면 진짜 볼 로그가 묻힌다.
        if (recovered418 === 1) onLog(`418 이 왔지만 목록은 계속 옵니다(${items.size}개) — 접지 않고 이어갑니다.`);
      } else if (++streak418 >= MAX_418_STREAK) {
        onLog(`418 을 연속 ${streak418}회 맞는 동안 아무것도 못 받았습니다 — 여기서 접습니다.`);
        return giveUp418(`연속 ${streak418}회`);
      } else if (saw418 >= MAX_418_TOTAL) {
        // 회복을 봤더라도 여기까지 왔으면 세션이 달아오른 것이다 — 더 두드리면 밴이 깊어진다.
        onLog(`이 카테고리에서 418 을 ${saw418}회 맞았습니다 — 회복은 ${recovered418}회였지만 여기서 접습니다.`);
        return giveUp418(`누적 ${saw418}회`);
      } else {
        const restMs = Math.round(rand(REST_AFTER_418_MS[0], REST_AFTER_418_MS[1]));
        onLog(`네이버가 더받기를 거절했습니다(418) — 화면은 살아 있습니다. ${Math.round(restMs / 1000)}초 쉬었다 다시 굴려 봅니다.`);
        probe418 = PROBE_AFTER_418;
        await sleep(restMs);
      }
    } else if (probe418 > 0) {
      if (alive) {
        recovered418 += 1;
        streak418 = 0;
        probe418 = 0;
        if (recovered418 === 1) onLog(`418 뒤에도 목록이 다시 옵니다(${items.size}개) — 차단이 아니었습니다.`);
      } else if (--probe418 === 0) {
        onLog(`418 뒤 ${PROBE_AFTER_418}회를 굴려도 더 오지 않습니다 — 이번엔 진짜로 막혔습니다.`);
        return giveUp418(`확인 ${PROBE_AFTER_418}회 무응답`);
      }
    }

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
    if (pagedOk || saw418) {
      onLog(`  (목록 더받기 ${pagedOk}회 성공 · 418 ${saw418}회`
        + `${recovered418 ? ` · 418 뒤 회복 ${recovered418}회` : ''})`);
    }
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
  /** 품절·품절임박이라 건너뛴 상품 — 몇 개를 뺐는지 말해 줘야 "왜 적게 나오지"를 오해하지 않는다. */
  const skippedSoldOut = new Set();

  const nav = await descendToCategory(page, catId, { onLog });
  if (!nav.ok) return { items: [], stopped: nav.error || '목록 도달 실패', visited };

  let r = await scrollHarvest(page, items, { target, onLog, onProgress, signal, pace, skippedSoldOut });
  visited.push({ id: catId, gained: r.gained, stopped: r.stopped });
  onLog(`${catId} — ${r.gained}개 (${r.stopped})`);

  // ★ 418 로 접었으면 형제로 넘어가지 않는다. 방금 게이트에 쿨다운이 걸렸고 세션도 달아올라
  //   있어서, 옆 칸에서도 첫 더받기부터 418 을 맞는다 — 수확 없이 IP 만 더 달구는 길이다.
  //   (형제 훑기 안에서 맞았을 때 break 하는 것과 같은 판단을, 첫 칸에도 똑같이 적용한다)
  if (items.size >= target || r.blocked418 || !sweepSiblings || signal?.aborted) {
    if (skippedSoldOut.size) onLog(`품절·품절임박 ${skippedSoldOut.size}개는 담지 않았습니다.`);
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

    // 418 로 접었을 때는 문구가 아니라 플래그로 본다 — 문구를 고칠 때마다 이 줄이 조용히 죽는다.
    if (r.blocked418 || /차단|캡차|중단/.test(r.stopped)) break;
  }

  naverGate.recordSuccess();
  if (skippedSoldOut.size) onLog(`품절·품절임박 ${skippedSoldOut.size}개는 담지 않았습니다.`);
  return {
    soldOutSkipped: skippedSoldOut.size,
    items: [...items.values()],
    stopped: items.size >= target ? '목표 도달' : (r?.stopped || '더 나올 것이 없음'),
    visited,
  };
}
