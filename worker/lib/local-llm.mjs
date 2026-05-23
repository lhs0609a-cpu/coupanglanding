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
export async function generate({ model, prompt, system, options = {}, format } = {}) {
  if (!model) throw new Error('[local-llm] model 필요');
  const body = {
    model,
    prompt,
    system,
    stream: false,
    options: { temperature: 0.7, top_p: 0.9, num_ctx: 8192, ...options },
  };
  if (format) body.format = format;
  const t0 = Date.now();
  const r = await fetch(`${OLLAMA}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`[local-llm] HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const ms = Date.now() - t0;
  const evalCount = j.eval_count || 0;
  const evalNs = j.eval_duration || 0; // nanoseconds
  const tokPerSec = evalNs > 0 ? +(evalCount / (evalNs / 1e9)).toFixed(1) : 0;
  return { text: (j.response || '').trim(), ms, evalCount, tokPerSec };
}

/** JSON 응답을 안전 파싱 (코드펜스/잡텍스트 제거 후 첫 객체) */
export function parseJsonLoose(text) {
  if (!text) return null;
  let s = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return null; }
}
