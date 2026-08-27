/**
 * 상품 1건 처리 시퀀스 — 이 프로젝트의 본체.
 * ---------------------------------------------------------------------------
 * 순서가 곧 설계다(원본 이식 가이드 [20]). 특히:
 *   · 게이트 통과 → 재시도 루프 진입. 재시도마다 쿨다운을 먼저 소화한다.
 *   · **캡차를 차단보다 먼저** 본다. 캡차를 차단으로 처리하면 풀 기회를 날린다.
 *   · 차단이면 전역 쿨다운을 걸어 **모든 창을 함께** 멈춘다.
 *   · 중복은 게이트 통과 **전에** 거른다 — 예산을 쓰지 않기 위해서다.
 */
import naverGate from '../../naver-gate.mjs';
import { probeJs } from './inject.mjs';

const MAX_ATTEMPTS = 6;
const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t?.unref) t.unref(); });

/** 스토어 ID 자리에 오면 안 되는 값 — 목록에서 딸려오는 수집 노이즈다. */
const BAD_STORE_IDS = new Set(['search', 'products', 'category', 'best', 'new', 'sale', 'event']);

export function parseProductUrl(url) {
  const productCode = (String(url).match(/\/products\/(\d+)/) || [])[1] || null;
  if (!productCode) return { ok: false, error: '상품 URL 이 아닙니다' };
  const storeId = (String(url).match(/(?:smartstore|brand)\.naver\.com\/([^/]+)/) || [])[1] || null;
  // 'main' 은 리다이렉트용 URL 이라 허용해야 한다.
  if (storeId && storeId !== 'main' && BAD_STORE_IDS.has(storeId)) {
    return { ok: false, error: `잘못된 스토어 ID: ${storeId}` };
  }
  const urlType = url.includes('brand.naver.com') ? 'brand' : 'smartstore';
  return { ok: true, productCode, storeId, urlType };
}

/**
 * 캡차 대기 — 기본 정책은 **사람이 푼다**.
 * 창을 화면에 띄우고, 관리자가 풀어서 캡차 화면을 벗어나면 자동으로 이어간다.
 * 무인 배치에서는 waitMs 를 짧게 줘서 그냥 포기하고 다음 잡으로 넘어가게 한다.
 */
async function waitForCaptchaCleared(sw, { waitMs, onLog, onCaptcha }) {
  sw.status = 'captcha';
  onLog?.(`⚠️ 창 ${sw.index + 1} — 캡차가 떴습니다. 창에서 직접 풀어주세요 (자동으로 이어집니다)`);
  onCaptcha?.(sw.index);
  // ★ await 한다. 일렉트론 창에서는 show() 가 동기였지만 크롬 탭은 앞으로 가져오는 데
  //   CDP 왕복이 필요하다 — 안 기다리면 "창에서 풀어주세요" 라고 해 놓고 그 창이 아직
  //   뒤에 있는 채로 3초 폴링이 시작된다.
  await sw.show();
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(3000);
    const d = await sw.detect();
    if (!d.captcha) {
      onLog?.(`✅ 창 ${sw.index + 1} — 캡차 통과, 계속합니다`);
      sw.hide();
      sw.status = 'idle';
      await sleep(2000);
      return true;
    }
  }
  sw.hide();
  sw.status = 'idle';
  return false;
}

/**
 * 상품 페이지를 열고 최소 정보를 뽑는다(P0/P1 공통 진입).
 *   opts.extract: 페이지 안에서 실행할 추출 JS. 생략하면 probeJs(상품명·가격만).
 *   opts.captchaWaitMs: 캡차를 사람이 풀 때까지 기다릴 시간. 0 이면 즉시 포기.
 */
export async function openProduct(sw, url, opts = {}) {
  const {
    extract = probeJs,
    captchaWaitMs = 180_000,
    // ★ 전체 시간 상한. 없을 때 실측(2026-08-20): 지원하지 않는 마켓 상품 1건이 재시도 6회 ×
    //   캡차 대기까지 겹쳐 **7분 넘게** 창과 큐 자리를 잡은 채 running 으로 남았다.
    //   끝나지 않는 작업은 실패보다 나쁘다 — 아무도 그 사실을 모르기 때문이다.
    timeoutMs = 240_000,
    onLog = () => {},
    onCaptcha,
    signal,
  } = opts;

  const parsed = parseProductUrl(url);
  if (!parsed.ok) return { ok: false, error: parsed.error, retryable: false };

  const deadline = Date.now() + timeoutMs;
  let lastError = 'unknown';
  let sawBlock = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) return { ok: false, error: 'aborted', retryable: false };
    if (Date.now() >= deadline) {
      sw.status = 'idle';
      return {
        ok: false,
        error: `시간 초과(${Math.round(timeoutMs / 1000)}초) — ${lastError}`,
        retryable: true,
      };
    }
    await naverGate.waitCooldown(signal);

    // ── 이동 (클릭) ─────────────────────────────────────────
    sw.status = 'working';
    sw.detail = parsed.productCode;
    const nav = await sw.gotoViaClick(url, { timeoutMs: url.includes('/main/products/') ? 20000 : 15000 });
    if (!nav.ok && !sw.url.includes('/products/')) {
      lastError = nav.error || 'navigation failed';
      naverGate.recordFailure();
      await sleep(2000 + Math.random() * 1500);
      continue;
    }

    // ── 판정 (캡차 먼저!) ───────────────────────────────────
    const det = await sw.detect();
    if (det.captcha) {
      // 캡차 대기도 전체 상한 안에서만 한다 — 남은 시간이 없으면 기다리지 않고 실패로 끝낸다.
      const waitMs = Math.min(captchaWaitMs, Math.max(0, deadline - Date.now()));
      const cleared = waitMs > 0
        ? await waitForCaptchaCleared(sw, { waitMs, onLog, onCaptcha })
        : false;
      if (!cleared) {
        lastError = 'CAPTCHA';
        // 캡차는 차단이 아니다 — 쿨다운을 걸지 않는다. 다만 속도는 한 단계 낮춘다.
        naverGate.recordFailure();
        continue;
      }
    } else if (det.blocked) {
      sawBlock = true;
      const ms = naverGate.triggerCooldown(det.is429);
      onLog(`🔴 차단 감지${det.is429 ? '(429)' : ''} — ${Math.round(ms / 1000)}초 동안 전체 정지`);
      lastError = 'BLOCKED_PAGE';
      continue;
    }

    // ── 사람처럼 굴기 → 추출 ────────────────────────────────
    await sw.humanize();
    let data = null;
    try {
      data = await sw.evaluate(extract);
    } catch (e) {
      lastError = `추출 실패: ${e.message}`;
      naverGate.recordFailure();
      await sleep(2000 + Math.random() * 1500);
      continue;
    }

    // ★ 추출기가 스스로 밝힌 실패 이유를 먼저 쓴다.
    //   상세 추출기는 왜 못 가져왔는지 정확히 알고 돌려준다('상품 API 실패 404',
    //   'channelId/productNo 를 못 찾음'). 그런데 아래 상품명 게이트가 그 값을 덮어
    //   전부 "페이지가 덜 로드됨"으로 보고했다 — 원인이 다른 실패들이 같은 얼굴로 나와
    //   진단이 불가능했다(실측: 상세 추출 1건 실패의 진짜 이유를 로그로 알 수 없었다).
    if (data && data.error) {
      lastError = String(data.error).slice(0, 200);
      naverGate.recordFailure();
      await sleep(2000);
      continue;
    }

    // 상품명이 비었으면 SPA 가 덜 그려진 것이다 — 이 게이트가 껍데기 저장을 막는다.
    if (!data?.name || data.name === 'NAVER' || data.name === 'Unknown') {
      lastError = `유효하지 않은 상품명(${data?.name || '없음'}) — 페이지가 덜 로드됨`;
      naverGate.recordFailure();
      await sleep(2000);
      continue;
    }

    naverGate.recordSuccess();
    sw.status = 'idle';
    return {
      ok: true,
      attempt,
      url: sw.url,
      productCode: parsed.productCode,
      storeId: parsed.storeId,
      urlType: parsed.urlType,
      data,
    };
  }

  sw.status = 'idle';
  return {
    ok: false,
    error: sawBlock ? `BLOCKED_ALL_RETRIES (${lastError})` : lastError,
    retryable: true,
  };
}

/**
 * 게이트 슬롯을 얻은 뒤 창을 빌려 1건 처리 — 호출부(잡 루프)가 쓰는 표준 진입점.
 * 중복 검사는 **이 함수 밖에서** 끝내고 들어와야 한다(예산 낭비 방지).
 */
export async function runOne(pool, url, opts = {}) {
  await naverGate.acquire('ingest', { signal: opts.signal });
  return pool.withWindow('detail', (sw) => openProduct(sw, url, opts));
}
