/**
 * 로컬 LLM 클라이언트 (ollama HTTP API)
 * ---------------------------------------------------------------------------
 * 워커(로컬 GPU)에서 ollama( http://127.0.0.1:11434 )로 텍스트를 생성한다.
 * 의존성 0 — fetch(빌트인)만 사용. 클라우드 호출 없음(완전 로컬/오프라인).
 *
 * 모델 권장(4060 Ti 16GB): qwen2.5:7b-instruct (한국어 양호) 또는 exaone3.5:7.8b.
 */

const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

/** ollama 데몬이 떠 있는지 */
export async function isUp() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { method: 'GET' });
    return r.ok;
  } catch { return false; }
}

/** 설치된 모델 목록 */
export async function listModels() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`);
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
export async function generate({ model, prompt, system, options = {}, format, keep_alive } = {}) {
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
  // 연결 실패(fetch failed/ECONNREFUSED 등)는 ollama 가 모델 로딩 중 일시적으로 응답을 못하거나
  // 메모리압박으로 잠깐 재시작할 때 난다 → 짧게 재시도하면 그대로 이어진다(HTTP 4xx/5xx 는 재시도 안 함).
  let j;
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(`${OLLAMA}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`[local-llm] HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      j = await r.json();
      break;
    } catch (e) {
      const msg = String(e?.message || e);
      const networkish = !/HTTP \d{3}/.test(msg) &&
        (/fetch failed|ECONNREFUSED|ECONNRESET|socket hang up|network|timeout|EPIPE/i.test(msg) || e?.cause);
      if (!networkish || attempt >= 3) throw e;
      await new Promise((res) => setTimeout(res, 2000 * (attempt + 1))); // 2s,4s,6s
    }
  }
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
export async function generateVision({ model, prompt, images = [], system, options = {}, format, keep_alive, timeoutMs } = {}) {
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
  let j;
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(`${OLLAMA}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
      });
      if (!r.ok) throw new Error(`[local-llm] vision HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      j = await r.json();
      break;
    } catch (e) {
      // ⚠️ 상한 초과(Abort)는 **재시도하지 않는다**. 여기서 재시도하면 느린 PC 가 상한을
      //    3배로 다시 기다리게 돼(2·4·6초 백오프까지) 상한을 둔 의미가 사라진다.
      //    메시지에 'timeout' 이 들어가 아래 networkish 에 걸리므로 먼저 걸러낸다.
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw e;
      const msg = String(e?.message || e);
      const networkish = !/HTTP \d{3}/.test(msg) &&
        (/fetch failed|ECONNREFUSED|ECONNRESET|socket hang up|network|timeout|EPIPE/i.test(msg) || e?.cause);
      if (!networkish || attempt >= 3) throw e;
      await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
    }
  }
  return { text: (j.response || '').trim(), ms: Date.now() - t0 };
}

/** 모델이 설치돼 있는지(태그 정확/접두 일치 모두 허용 — 'qwen2.5vl:7b' ↔ 'qwen2.5vl:7b-...' ). */
export async function hasModel(model) {
  if (!model) return false;
  const names = await listModels();
  const base = model.split(':')[0];
  return names.some((n) => n === model || n.startsWith(model) || n.split(':')[0] === base);
}

/**
 * 모델이 없으면 ollama 로 pull(스트리밍 진행 로그). 이미 있으면 즉시 true.
 * 실패해도 throw 하지 않고 false 반환(호출부가 폴백하도록).
 * @returns {Promise<boolean>} 최종 사용 가능 여부
 */
export async function ensureModel(model, { onLog } = {}) {
  if (!model) return false;
  try {
    if (await hasModel(model)) return true;
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
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** 현재 VRAM/메모리에 로드돼 "떠 있는" 모델 이름 목록 (/api/ps). 베스트에포트. */
export async function psLoaded() {
  try {
    const r = await fetch(`${OLLAMA}/api/ps`);
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
 * @returns {Promise<number[][]>} 벡터 배열
 */
export async function embed(model, input) {
  const r = await fetch(`${OLLAMA}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input }),
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
