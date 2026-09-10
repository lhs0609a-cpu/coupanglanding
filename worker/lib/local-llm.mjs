/**
 * 로컬 LLM 클라이언트 (ollama HTTP API)
 * ---------------------------------------------------------------------------
 * 워커(로컬 GPU)에서 ollama( http://127.0.0.1:11434 )로 텍스트를 생성한다.
 * 의존성 0 — fetch(빌트인)만 사용. 클라우드 호출 없음(완전 로컬/오프라인).
 *
 * 모델 권장(4060 Ti 16GB): qwen2.5:7b-instruct (한국어 양호) 또는 exaone3.5:7.8b.
 */

import { setTimeout as delay } from 'node:timers/promises';

const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const GENERATE_TIMEOUT_MS = 300_000;
const HEALTH_TIMEOUT_MS = 5000;

/**
 * 엔진이 작업 **도중에** 사라졌을 때 돌아오기를 기다리는 상한.
 * ---------------------------------------------------------------------------
 * 실측 사고(2026-09-10): 상품 50개짜리 작업이 10분쯤 돌던 중 ollama 가 내려갔다. 그때
 * 아래 재시도는 2·4·6초, 합쳐 12초만 버텼다 — 엔진이 다시 뜨고 5GB 모델을 올리는 데는
 * 그보다 훨씬 오래 걸린다. 그래서 상품 3개가 연달아 `fetch failed` 로 죽었고, 배치의
 * "연속 3건 실패" 규칙에 걸려 **남은 47개가 통째로 버려졌다**(성공 0건).
 * 엔진 확인은 시작할 때 한 번뿐이라(run-folder 의 90초 대기) 도중에 죽는 건 아무도 안 봤다.
 * → 도중에 사라져도 시작할 때와 똑같이 기다린다. 도우미가 다시 올리면 그대로 이어진다.
 */
// ⚠️ 환경변수는 **부를 때마다** 읽는다. 모듈 적재 시점에 한 번 읽으면 이 상수를 바꿔
//    확인할 방법이 없어진다(테스트가 3분을 기다리게 된다).
const engineReturnWaitMs = () => Number(process.env.MEGALOAD_ENGINE_RETURN_WAIT_MS) || 180_000;
/**
 * 기다려 봤는데 안 돌아왔다 — 이 시간 동안은 나머지 상품이 기다리지 않고 곧바로 접는다.
 * 대기 상한보다 길 이유가 없다(짧게 기다리기로 했으면 짧게 냉각한다).
 */
const engineGoneCooldownMs = () => Math.min(30_000, engineReturnWaitMs());
/** 한 호출이 엔진 복귀를 기다려 주는 횟수(돌아왔다가 또 죽는 경우의 안전핀). */
const MAX_ENGINE_RESUMES = 2;
const ENGINE_GONE_MSG = 'AI 엔진(ollama)이 작업 도중에 내려갔고 돌아오지 않았습니다.';

const engineLog = (m) => console.log(`[엔진] ${m}`);

/**
 * llama-server 원문 오류를 사람이 읽고 **행동할 수 있는 문장**으로 바꾼다.
 * ---------------------------------------------------------------------------
 * 실측 사고에서 사용자가 본 화면(그대로 노출됐다):
 *   HTTP 500: {"error":"llama-server process has terminated: exit status 1:
 *   ggml_backend_cpu_buffer_type_alloc_buffer: failed to allocate buffer of size
 *   3359637504\nalloc_tensor_range: failed to allocate CPU_REPACK
 * → 원인은 "시스템 RAM 부족"인데 이 문장으로는 아무도 알 수 없다. 해석을 앞에 붙인다.
 *   (원문은 뒤에 남긴다 — 진단에 필요하다.)
 * @param {string} raw
 * @returns {string}
 */
export function explainLlmError(raw) {
  const s = String(raw || '');
  // CPU 버퍼 할당 실패 = 시스템 RAM 부족(VRAM 아님). projector CPU offload 실패도 같은 뿌리.
  if (/cpu_buffer_type_alloc_buffer|alloc_tensor_range|CPU_REPACK|projector CPU offload/i.test(s)) {
    return '메모리(RAM) 부족으로 AI 모델을 올리지 못했습니다. 크롬(탭이 많으면 수 GB)이나 다른 AI·영상 프로그램을 닫고 다시 시도하세요'
      + '(가상 메모리/페이지파일이 꺼져 있어도 같은 증상이 납니다). 원문: ' + s.slice(0, 200);
  }
  if (/cudaMalloc|CUDA (error )?out of memory|out of memory/i.test(s)) {
    return '그래픽카드 메모리(VRAM) 부족으로 모델을 올리지 못했습니다. 다른 AI·영상 프로그램을 닫고 다시 시도하세요. 원문: ' + s.slice(0, 200);
  }
  if (/llama-server (process has terminated|startup failed)/i.test(s)) {
    return 'AI 엔진(llama-server)이 시작하지 못했습니다. 메모리 부족이 가장 흔한 원인이니 다른 프로그램을 닫고 다시 시도하세요. 원문: ' + s.slice(0, 200);
  }
  // ★ `fetch failed` 는 Node 가 "그 주소로 연결 자체가 안 됨"일 때 내는 말이다. 여기서 그
  //   주소는 이 PC 의 ollama 한 곳뿐이라 뜻이 하나로 정해진다 — **엔진이 없다**.
  //   그런데 그대로 노출하면 사용자에게는 네트워크·서버 문제로 읽힌다(실측 2026-09-10:
  //   화면에 딱 'fetch failed' 네 글자만 떴고, 그걸로는 아무도 원인을 알 수 없었다).
  if (/fetch failed|ECONNREFUSED|ECONNRESET|socket hang up/i.test(s)) {
    return 'AI 엔진(ollama)에 연결하지 못했습니다 — 엔진이 꺼져 있거나 다시 올라오는 중입니다.'
      + ' 메모리(RAM·VRAM)가 모자라 엔진이 꺼지는 경우가 가장 흔하니, 크롬 탭이나 다른 AI·영상 프로그램을 닫고 다시 시도하세요.'
      + ' 원문: ' + s.slice(0, 200);
  }
  return s;
}

/** ollama 데몬이 떠 있는지 */
export async function isUp() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { method: 'GET', signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    return r.ok;
  } catch { return false; }
}

/**
 * 엔진이 돌아올 때까지 기다린다 — "연결 자체가 안 되는" 상태에서만 부른다.
 * @returns {Promise<boolean>} 돌아왔으면 true
 */
export async function waitUntilUp({ timeoutMs = engineReturnWaitMs(), onLog = engineLog } = {}) {
  const deadline = Date.now() + timeoutMs;
  let announced = false;
  for (;;) {
    if (await isUp()) {
      if (announced) onLog('엔진이 돌아왔습니다 — 남은 상품을 이어서 처리합니다.');
      return true;
    }
    if (Date.now() >= deadline) return false;
    if (!announced) {
      announced = true;
      // ⚠️ 이 문장에 '실패' 라는 낱말을 넣지 않는다 — 앱이 로그에서 그 낱말을 찾아 오류
      //    요약(allinone-runner 의 errLines)에 담기 때문에, 회복된 일이 실패로 보고된다.
      onLog(`엔진 응답이 끊겼습니다 — 도우미가 다시 올릴 때까지 최대 ${Math.round(timeoutMs / 1000)}초 기다립니다(작업은 이어집니다).`);
    }
    await delay(1500);
  }
}

/**
 * 여러 상품이 **동시에** 엔진이 사라진 걸 발견한다(레인 3~6개). 각자 3분씩 따로 기다리면
 * 안 되고, 하나의 대기를 함께 기다려야 한다. 그래서 대기를 모듈 단위로 하나만 둔다.
 *   · 호출부의 signal 은 공유 대기에 넘기지 않는다 — 한 상품이 취소됐다고 다른 상품의
 *     대기까지 깨면 안 된다. 취소는 race 로 그 상품만 빠져나가게 한다.
 *   · 한 번 기다려도 안 왔으면 잠시 냉각한다 — 남은 상품이 3분씩 더 매달릴 이유가 없다.
 */
let enginePendingWait = null;
let engineGoneUntil = 0;
async function awaitEngineReturn({ signal } = {}) {
  if (Date.now() < engineGoneUntil) return false;
  if (!enginePendingWait) {
    enginePendingWait = waitUntilUp()
      .then((ok) => {
        if (!ok) engineGoneUntil = Date.now() + engineGoneCooldownMs();
        return ok;
      })
      .finally(() => { enginePendingWait = null; });
  }
  const shared = enginePendingWait;
  if (!signal) return shared;
  return Promise.race([shared, new Promise((_res, rej) => {
    if (signal.aborted) return rej(signal.reason);
    signal.addEventListener('abort', () => rej(signal.reason), { once: true });
  })]);
}

/**
 * /api/generate 한 번 — 텍스트·비전이 같이 쓴다(재시도 규칙이 한 곳에만 있어야 한다).
 * ---------------------------------------------------------------------------
 * "연결이 안 된다"에는 서로 다른 두 가지가 섞여 있다 — 엔진이 잠깐 못 받는 것(모델 적재 중,
 * 메모리 압박으로 순간 멈춤)과 엔진이 아예 없어진 것. 앞은 몇 초 뒤 그대로 이어지고,
 * 뒤는 몇 초를 기다려도 소용없다. **추측하지 말고 엔진에게 직접 물어본다**(/api/tags).
 */
async function postGenerate(body, { timeoutMs, signal, label = '' } = {}) {
  const budget = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.floor(timeoutMs) : GENERATE_TIMEOUT_MS;
  let resumes = 0;
  for (let attempt = 0; ; attempt++) {
    // ★ 상한은 **시도마다 새로** 준다. 예전엔 루프 밖에서 한 번 만들어 모든 시도가 하나의
    //   예산을 나눠 썼다 — 엔진 복귀를 3분 기다리면 돌아온 엔진에게 남은 시간이 거의 없어
    //   곧바로 또 끊긴다. 기다린 시간은 생성 시간이 아니다.
    const timed = AbortSignal.timeout(budget);
    const requestSignal = signal ? AbortSignal.any([signal, timed]) : timed;
    try {
      const r = await fetch(`${OLLAMA}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: requestSignal,
      });
      if (!r.ok) throw new Error(`[local-llm] ${label}HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return await r.json();
    } catch (e) {
      // 호출부가 끊었으면 그대로 올린다(상품 취소·전체 중단).
      if (signal?.aborted) throw signal.reason ?? e;
      // ⚠️ 상한 초과(Abort)는 **재시도하지 않는다**. 재시도하면 느린 PC 가 상한을 몇 배로
      //    다시 기다리게 돼 상한을 둔 의미가 사라진다(메시지에 'timeout' 이 들어가서
      //    아래 networkish 에 걸리므로 여기서 먼저 걸러낸다).
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw e;
      const msg = String(e?.message || e);
      const networkish = !/HTTP \d{3}/.test(msg)
        && (/fetch failed|ECONNREFUSED|ECONNRESET|socket hang up|network|timeout|EPIPE/i.test(msg) || e?.cause);
      if (!networkish) throw e;
      if (!(await isUp())) {
        // 엔진이 없어졌다 — 몇 초 백오프는 의미가 없다. 돌아올 때까지 기다린다.
        if (resumes >= MAX_ENGINE_RESUMES) throw new Error(`${ENGINE_GONE_MSG} 원문: ${msg.slice(0, 120)}`);
        resumes++;
        if (!(await awaitEngineReturn({ signal }))) throw new Error(`${ENGINE_GONE_MSG} 원문: ${msg.slice(0, 120)}`);
        attempt = -1;      // 돌아왔으면 재시도 횟수를 되돌린다(아래 attempt++ 로 0)
        continue;
      }
      // 엔진은 살아 있다 — 예전처럼 짧게 기다렸다 다시 던진다.
      if (attempt >= 3) throw e;
      await delay(2000 * (attempt + 1), undefined, { signal: signal ?? undefined });
    }
  }
}

/** 설치된 모델 목록 */
export async function listModels() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.models || []).map((m) => m.name);
  } catch { return []; }
}

/**
 * 단발 생성 (non-stream). 토큰 수/소요시간 메트릭을 함께 반환.
 * @param {Object} o
 * @param {string} o.model
 * @param {string} o.prompt
 * @param {string} [o.system]
 * @param {Object} [o.options]  ollama options (temperature, num_predict, …)
 * @param {string} [o.format]   'json' 이면 JSON 강제
 * @returns {Promise<{text:string, ms:number, evalCount:number, tokPerSec:number}>}
 */
export async function generate({ model, prompt, system, options = {}, format, keep_alive, timeoutMs = GENERATE_TIMEOUT_MS, signal } = {}) {
  if (!model) throw new Error('[local-llm] model 필요');
  const body = {
    model,
    prompt,
    system,
    stream: false,
    // 모델을 VRAM에 30분 유지 → 매 생성마다 콜드 로드(5.5초) 반복 방지(웜 0.2초).
    keep_alive: keep_alive ?? '30m',
    options: { temperature: 0.7, top_p: 0.9, num_ctx: 4096, num_gpu: 99, ...options },
  };
  if (format) body.format = format;
  const t0 = Date.now();
  // 연결 실패(fetch failed/ECONNREFUSED 등)의 처리는 postGenerate 한 곳에 있다 —
  // 엔진이 잠깐 못 받는 것이면 짧게 재시도하고, 아예 사라진 것이면 돌아올 때까지 기다린다.
  const j = await postGenerate(body, { timeoutMs, signal });
  const ms = Date.now() - t0;
  const evalCount = j.eval_count || 0;
  const evalNs = j.eval_duration || 0; // nanoseconds
  const tokPerSec = evalNs > 0 ? +(evalCount / (evalNs / 1e9)).toFixed(1) : 0;
  return { text: (j.response || '').trim(), ms, evalCount, tokPerSec };
}

/**
 * 비전 생성 — 이미지를 "직접 보고" 판단하는 VLM 호출(ollama /api/generate + images).
 * ---------------------------------------------------------------------------
 * CLIP 제로샷 라벨/파일명 규칙 같은 휴리스틱이 아니라, 모델이 실제 픽셀을 보고 답한다.
 * @param {Object} o
 * @param {string} o.model            비전 모델(qwen2.5vl:7b 등)
 * @param {string} o.prompt
 * @param {string[]} o.images         base64(JPEG/PNG) 문자열 배열 — data: 접두사 없이 순수 base64
 * @param {string} [o.system]
 * @param {Object} [o.options]
 * @param {string} [o.format]         'json' 이면 JSON 강제
 * @returns {Promise<{text:string, ms:number}>}
 */
/**
 * @param {number} [timeoutMs] 한 번의 비전 호출 상한. 초과하면 AbortError 로 끊는다.
 *   GPU 없는 PC 에서 7B VLM 은 호출당 수 분이 걸린다 — 상한이 없으면 생성이 하염없이 멈춘 것처럼
 *   보인다(느린 건 실패가 아니라서 폴백도 안 걸린다). 호출부가 이 값을 넘겨 상품 단위로
 *   빠르게 CLIP 휴리스틱 폴백시킬 수 있게 한다. 미지정이면 무제한(기존 동작).
 */
export async function generateVision({ model, prompt, images = [], system, options = {}, format, keep_alive, timeoutMs = GENERATE_TIMEOUT_MS, signal } = {}) {
  if (!model) throw new Error('[local-llm] vision model 필요');
  const body = {
    model,
    prompt,
    system,
    images,                                // ollama: base64 배열(순수 base64)
    stream: false,
    keep_alive: keep_alive ?? '30m',
    // 비전은 결정적 판정이 중요 → temperature 낮게. num_ctx 는 이미지 토큰 여유.
    options: { temperature: 0.1, top_p: 0.9, num_ctx: 8192, num_gpu: 99, ...options },
  };
  if (format) body.format = format;
  const t0 = Date.now();
  const j = await postGenerate(body, { timeoutMs, signal, label: 'vision ' });
  return { text: (j.response || '').trim(), ms: Date.now() - t0 };
}

/** 모델이 설치돼 있는지(태그 정확/접두 일치 모두 허용 — 'qwen2.5vl:7b' ↔ 'qwen2.5vl:7b-...' ). */
export async function hasModel(model) {
  if (!model) return false;
  const names = await listModels();
  const requested = model.includes(':') ? model : `${model}:latest`;
  return names.some((n) => (n.includes(':') ? n : `${n}:latest`) === requested);
}

/**
 * 모델이 없으면 ollama 로 pull(스트리밍 진행 로그). 이미 있으면 즉시 true.
 * 실패해도 throw 하지 않고 false 반환(호출부가 폴백하도록).
 * @param {{onLog?:Function, noPull?:boolean}} [o]
 *   noPull=true 면 **다운로드하지 않는다**(이미 있으면 그대로 씀). GPU 없는 PC 에
 *   비전 모델 5.6GB 를 받게 해놓고 정작 판정은 상한 초과로 못 쓰는 낭비를 막는다.
 * @returns {Promise<boolean>} 최종 사용 가능 여부
 */
export async function ensureModel(model, { onLog, noPull = false } = {}) {
  if (!model) return false;
  try {
    if (await hasModel(model)) return true;
    if (noPull) {
      onLog?.(`[비전] ${model} 미설치 — 이 PC 는 GPU 가속이 없어 자동 다운로드(수 GB)를 생략합니다. 기본 방식(CLIP)으로 처리합니다.`);
      return false;
    }
    onLog?.(`[비전] ${model} 미설치 — 자동 다운로드 시작(최초 1회, 수 GB)…`);
    const r = await fetch(`${OLLAMA}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
    });
    if (!r.ok || !r.body) { onLog?.(`[비전] pull 실패(HTTP ${r.status})`); return false; }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '', lastPct = -1;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const s = JSON.parse(line);
          if (s.total && s.completed) {
            const pct = Math.floor((s.completed / s.total) * 100);
            if (pct >= lastPct + 10) { lastPct = pct; onLog?.(`[비전] 다운로드 ${pct}%`); }
          }
          if (s.error) { onLog?.(`[비전] pull 오류: ${s.error}`); return false; }
        } catch { /* 부분 라인 무시 */ }
      }
    }
    const ok = await hasModel(model);
    onLog?.(ok ? `[비전] ${model} 준비 완료` : `[비전] ${model} 다운로드 확인 실패`);
    return ok;
  } catch (e) {
    onLog?.(`[비전] 모델 준비 실패(${String(e?.message || e).slice(0, 120)}) — 휴리스틱 폴백`);
    return false;
  }
}

/**
 * 모델을 GPU/메모리에서 언로드 (keep_alive:0). VRAM 을 ComfyUI 등에 양보할 때 사용.
 * 실패해도 throw 하지 않음(베스트에포트).
 */
export async function unload(model) {
  if (!model) return false;
  try {
    const r = await fetch(`${OLLAMA}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, keep_alive: 0 }),
      signal: AbortSignal.timeout(15_000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** 현재 VRAM/메모리에 로드돼 "떠 있는" 모델 이름 목록 (/api/ps). 베스트에포트. */
export async function psLoaded() {
  try {
    const r = await fetch(`${OLLAMA}/api/ps`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.models || []).map((m) => m.name).filter(Boolean);
  } catch { return []; }
}

/**
 * 지금 로드돼 있는 모든 ollama 모델을 즉시 언로드해 VRAM 을 비운다(ComfyUI/SDXL 양보용).
 * 로드된 게 없으면 아무 것도 안 함(네트워크 1회). 언로드한 모델 이름 배열을 반환.
 */
export async function freeVram() {
  const loaded = await psLoaded();
  if (loaded.length === 0) return [];
  await Promise.all(loaded.map((m) => unload(m)));
  return loaded;
}

/**
 * 임베딩 (ollama /api/embed). input: string | string[].
 *
 * ⚠️ **상한이 반드시 있어야 한다**(실측 2026-08-25). 예전엔 `fetch` 에 signal 이 없었다.
 *    카테고리 후보를 뽑는 이 호출은 상품마다 1회 걸리는데, 한 번이라도 응답이 안 오면
 *    `candidatesFor` 가 거기서 영원히 서고 **생성 전체가 멈춘다** — 오류도 로그도 없이.
 *    재현: 이 PC 에서 벤치가 첫 상품에서 CPU 1초만 쓴 채 몇 분을 매달렸다(다른 프로그램이
 *    같은 ollama 를 쓰고 있어 임베딩 모델이 자리를 못 잡은 상태였다).
 *    상한을 넘기면 던지고, 호출부는 **토큰 매칭으로 폴백한다**(원래 설계된 길이다).
 * @returns {Promise<number[][]>} 벡터 배열
 */
//    상한값은 **넉넉해야 한다** — 이건 성능 손잡이가 아니라 "영원히 멈추지 않게" 하는 안전장치다.
//    실측: 임베딩 모델(bge-m3) 첫 호출은 적재만 16.6초다. 15초로 잡았더니 정상 PC 의 첫 상품이
//    곧바로 상한에 걸려 **멀쩡한 임베딩 매칭을 버리고** 토큰 폴백으로 갔다(카테고리 정확도 손해).
const EMBED_TIMEOUT_MS = Math.max(3000, Number(process.env.MEGALOAD_EMBED_TIMEOUT_MS) || 60_000);
export async function embed(model, input, { timeoutMs } = {}) {
  const r = await fetch(`${OLLAMA}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(timeoutMs || EMBED_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`[local-llm] embed HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j.embeddings || [];
}

/** JSON 응답을 안전 파싱 (코드펜스/잡텍스트 제거 후 첫 객체) */
export function parseJsonLoose(text) {
  if (!text) return null;
  let s = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return null; }
}
