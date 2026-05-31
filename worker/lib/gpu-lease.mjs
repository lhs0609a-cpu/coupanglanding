/**
 * 단일 GPU 중재(arbiter) — 텍스트(LLM/Ollama)와 이미지(ComfyUI/SDXL)가 같은 GPU를
 * 동시에 쓰면 VRAM 스왑/부분 CPU 실행으로 둘 다 느려진다(특히 SDXL 10~40초).
 * 모든 GPU 작업을 한 줄로 직렬화하고, 모드가 바뀔 때만 onSwitch 훅(예: Ollama 언로드)을
 * 실행해 전환 비용을 최소화한다.
 *
 * ⚠️ 데스크탑 앱의 동시 루프(LLM 풀루프 + 이미지 풀루프) 경로에서만 사용한다.
 *    오프라인 배치 스크립트(16k 사전생성)는 이 모듈을 쓰지 않으므로 병렬성 영향 없음.
 */

let chain = Promise.resolve();
let currentMode = null; // 'llm' | 'image' | null

/**
 * GPU 작업을 모드별로 직렬 실행. 직전 모드와 다르면 onSwitch(from,to)를 먼저 await 한다.
 * @template T
 * @param {'llm'|'image'} mode
 * @param {() => Promise<T>} fn
 * @param {{ onSwitch?: (from: string|null, to: string) => Promise<void>|void }} [opts]
 * @returns {Promise<T>}
 */
export function withGpu(mode, fn, { onSwitch } = {}) {
  const result = chain.then(async () => {
    if (currentMode !== mode) {
      if (onSwitch) { try { await onSwitch(currentMode, mode); } catch { /* best-effort */ } }
      currentMode = mode;
    }
    return fn();
  });
  // 다음 작업이 이어붙도록 체인 갱신(에러는 삼켜 체인이 끊기지 않게).
  chain = result.then(() => {}, () => {});
  return result;
}

/** 현재 GPU를 점유 중인 모드(없으면 null). 진단/로그용. */
export function gpuMode() { return currentMode; }
