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
