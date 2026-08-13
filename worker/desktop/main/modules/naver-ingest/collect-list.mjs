/**
 * 카테고리 목록 수집 — 상세 페이지를 열지 않고 상품 카드를 긁는다.
 * ---------------------------------------------------------------------------
 * 왜 목록만 따로 긁나: 상세 추출은 상품 1건에 30~90초라 병목이다(하루 1만~1.5만건).
 * 반면 목록은 스크롤 1회에 수십 개가 나온다. 그래서 순서를 이렇게 나눈다.
 *     ① 목록으로 **넓게** 후보를 확보(제목·가격·썸네일·리뷰수)
 *     ② 관리자가 고른 것만 **깊게** 상세 추출
 * "다 가져올 순 없다"는 현실에 맞는 유일한 구조다.
 *
 * 페이싱(원본 이식 가이드 [14]): 스크롤 1회 = 게이트 슬롯 1개. 회차마다 2~4초 대기,
 * 8회마다 4~7초, 15회마다 8~12초 휴식. 800~1200개 구간은 418(봇 차단) 직전이라 더 쉰다.
 */
import naverGate from '../../naver-gate.mjs';
import { collectCardsJs, scrollStepJs, install418WatcherJs, read418Js, reset418Js } from './inject.mjs';
import { categoryUrl } from './categories.mjs';

const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t?.unref) t.unref(); });
const rand = (min, max) => min + Math.random() * (max - min);

/** 신규 0건이 이만큼 연속되면 그 카테고리는 끝난 것으로 본다(418 이력이 있으면 절반). */
const NO_NEW_STOP = 10;
const NO_NEW_STOP_AFTER_418 = 5;

/**
 * @param {object} pool  WindowPool
 * @param {string} catId 네이버 카테고리 id
 * @param {object} opts  { target, onLog, onProgress, signal }
 * @returns {Promise<{items:Array, stopped:string}>}
 */
export async function collectCategory(pool, catId, opts = {}) {
  const {
    target = 300,
    onLog = () => {},
    onProgress = () => {},
    signal,
  } = opts;

  const items = new Map();   // productNo → card
  let stopped = 'done';

  await naverGate.acquire('ingest', { signal });

  await pool.withWindow('list', async (sw) => {
    sw.status = 'working';
    sw.detail = `카테고리 ${catId}`;

    const nav = await sw.gotoViaClick(categoryUrl(catId), { timeoutMs: 20000 });
    if (!nav.ok) { stopped = `페이지 열기 실패 (${nav.error || 'unknown'})`; return; }

    const det = await sw.detect();
    if (det.captcha) { stopped = '캡차 — 도우미 창에서 풀어주세요'; sw.show(); return; }
    if (det.blocked) {
      const ms = naverGate.triggerCooldown(det.is429);
      stopped = `차단 — ${Math.round(ms / 1000)}초 정지`;
      return;
    }

    // 418 감시 설치(스크롤 중 네이버가 XHR 로 던지는 봇 차단 신호).
    await sw.evaluate(install418WatcherJs).catch(() => {});
    await sw.evaluate(reset418Js).catch(() => {});

    // 스크롤 전 1차 수집 — 첫 화면에 이미 수십 개가 있다.
    const first = await sw.evaluate(collectCardsJs).catch(() => []);
    for (const it of first || []) items.set(it.productNo, it);
    onProgress({ collected: items.size, scrolls: 0 });

    const maxScrolls = Math.max(100, Math.ceil(target / 30) + 20);
    let noNew = 0;
    let saw418 = false;

    for (let i = 1; i <= maxScrolls; i++) {
      if (signal?.aborted) { stopped = '중단됨'; return; }
      if (items.size >= target) { stopped = '목표 도달'; return; }

      // 스크롤도 네이버로 나가는 요청이다 — 게이트를 통과시킨다.
      await naverGate.acquire('ingest', { signal });
      await naverGate.waitCooldown(signal);

      const before = items.size;
      await sw.evaluate(scrollStepJs).catch(() => {});
      await sleep(rand(2000, 4000));

      const cards = await sw.evaluate(collectCardsJs).catch(() => []);
      for (const it of cards || []) items.set(it.productNo, it);

      const gained = items.size - before;
      onProgress({ collected: items.size, scrolls: i, gained });

      // 418 누적 확인 — 3회면 30초 정지 후 계속(가이드 [14]).
      const c418 = await sw.evaluate(read418Js).catch(() => 0);
      if (c418 >= 3) {
        saw418 = true;
        onLog(`⚠️ 네이버 봇 차단 신호(418) — 30초 쉬고 계속합니다 (수집 ${items.size}개)`);
        await sw.evaluate(reset418Js).catch(() => {});
        await sleep(30_000);
      }

      if (gained === 0) {
        noNew++;
        const limit = saw418 ? NO_NEW_STOP_AFTER_418 : NO_NEW_STOP;
        if (noNew >= limit) { stopped = '더 나올 것이 없음'; return; }
      } else {
        noNew = 0;
      }

      // 8회마다 짧은 휴식, 15회마다 긴 휴식.
      if (i % 15 === 0) await sleep(rand(8000, 12000));
      else if (i % 8 === 0) await sleep(rand(4000, 7000));

      // 800~1200 구간은 418 직전 — 회차마다 더 쉰다.
      if (items.size >= 800 && items.size <= 1200) await sleep(rand(500, 1000));
    }
    stopped = '스크롤 상한 도달';
  });

  naverGate.recordSuccess();
  return { items: [...items.values()], stopped };
}
