/** 로그인 + 풀 루프 시작/정지 래퍼 (공통 runtime/pull-loop 사용) */
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { Session } from '../runtime/supabase-rest.mjs';
import { loadWorkflow, generateThumbnail } from '../runtime/comfyui-client.mjs';
import { runPullLoop } from '../runtime/pull-loop.mjs';
// ⚠️ runLlmPullLoop 는 startLlmLoop() 안에서 동적 import 한다 — 이 파일이 패키지에 누락돼도
//    (top-level import 였을 때처럼) 메인 프로세스가 로드 단계에서 죽지 않게 하기 위함.
import { processCutoutThumbnail } from './thumbnail-processor.mjs';

const DEFAULT_POSITIVE =
  'professional Coupang e-commerce product thumbnail, the product centered on a pure seamless white studio background (#FFFFFF), soft diffused studio lighting, subtle natural contact shadow directly beneath the product, photorealistic commercial product photography, sharp focus, clean and minimal, 1:1 square composition';
const DEFAULT_NEGATIVE =
  'text, watermark, logo, extra objects, props, lifestyle scene, hands, people, colored background, gradient background, dark shadows, blurry, low quality, distorted, deformed, duplicated product, frame, border';

const fsp = await import('node:fs/promises');

export class WorkerRunner {
  constructor(userDataDir, { onEvent = () => {} } = {}) {
    this.userDataDir = userDataDir;
    this.onEvent = onEvent;
    this.session = null;
    this.abort = null;
    this.loopPromise = null;
    // LLM 재생성 루프(텍스트) — 썸네일 루프와 독립. 로그인되면 상시 폴링(가벼움).
    this.llmAbort = null;
    this.llmLoopPromise = null;
  }

  get running() { return !!this.abort; }
  get loggedIn() { return !!this.session; }

  async login(supabaseUrl, anonKey, email, password) {
    const s = new Session(supabaseUrl, anonKey, join(this.userDataDir, '.session.json'));
    await s.loadOrLogin(email, password);
    this.session = s;
    this.startLlmLoop();
  }

  /** 웹 페어링으로 받은 세션 주입 */
  async pair(supabaseUrl, anonKey, sessionTokens) {
    const s = new Session(supabaseUrl, anonKey, join(this.userDataDir, '.session.json'));
    await s.seed(sessionTokens);
    this.session = s;
    this.startLlmLoop();
  }

  /** 저장된 세션(.session.json)으로 자동 로그인 시도 — 성공 시 true */
  async tryRestoreSession(supabaseUrl, anonKey) {
    if (!supabaseUrl || !anonKey) return false;
    try {
      const s = new Session(supabaseUrl, anonKey, join(this.userDataDir, '.session.json'));
      const ok = await s.tryRestore();
      if (ok) { this.session = s; this.startLlmLoop(); return true; }
      return false;
    } catch { return false; }
  }

  /** 로그인되면 상시 도는 LLM 재생성 폴링 루프 (노출상품명/상세글/옵션/카테고리). */
  startLlmLoop() {
    if (this.llmAbort || !this.session) return;
    this.llmAbort = new AbortController();
    const host = hostname();
    const workerId = `${host}-llm`;
    // 동적 import — 파일 누락/로드 실패해도 앱 본체엔 영향 없음(LLM 재생성만 비활성).
    this.llmLoopPromise = import('../runtime/llm-pull-loop.mjs')
      .then(({ runLlmPullLoop }) => runLlmPullLoop({
        session: this.session,
        workerId,
        hostname: host,
        pollMs: 700,   // 활성 시 0.7초로 빠르게 집음(루프 내부에서 장기 유휴 시 자동 백오프)
        signal: this.llmAbort.signal,
        onEvent: (e) => this.onEvent({ scope: 'llm', ...e }),
      }))
      .catch((e) => this.onEvent({ type: 'warn', message: `LLM 루프 종료: ${e.message}` }))
      .finally(() => { this.llmAbort = null; this.llmLoopPromise = null; });
  }

  async stopLlmLoop() {
    if (this.llmAbort) this.llmAbort.abort();
    try { await this.llmLoopPromise; } catch { /* ignore */ }
  }

  async start({ comfyUrl, workflowPath, positivePrompt, negativePrompt, timeoutSec = 300, pollSec = 5 }) {
    if (this.running) return;
    if (!this.session) throw new Error('로그인이 필요합니다.');
    const workflow = await loadWorkflow(fsp, workflowPath);
    this.abort = new AbortController();
    const host = hostname();
    const workerId = `${host}-${randomUUID().slice(0, 8)}`;

    // 재생성(regenerate) 모드용 SDXL img2img — ComfyUI(GPU)가 수행.
    // 같은 workflows/ 폴더의 img2img-thumbnail 워크플로 로드. 실패 시 재생성 비활성(누끼 폴백).
    let img2imgFn = undefined;
    try {
      const i2iWf = await loadWorkflow(fsp, join(dirname(workflowPath), 'img2img-thumbnail.example.json'));
      // SDXL Lightning LoRA 미설치 환경 폴백 — 워크플로를 기존 26스텝 base 로 되돌려 깨지지 않게.
      try {
        const loraName = i2iWf['9']?.inputs?.lora_name;
        if (loraName) {
          let hasLora = false;
          try {
            const oi = await (await fetch(`${comfyUrl}/object_info/LoraLoader`)).json();
            const list = oi?.LoraLoader?.input?.required?.lora_name?.[0] || [];
            hasLora = Array.isArray(list) && list.includes(loraName);
          } catch { hasLora = false; }
          if (!hasLora) {
            delete i2iWf['9'];
            if (i2iWf['3']?.inputs) i2iWf['3'].inputs.clip = ['1', 1];
            if (i2iWf['4']?.inputs) i2iWf['4'].inputs.clip = ['1', 1];
            if (i2iWf['6']?.inputs) Object.assign(i2iWf['6'].inputs, { model: ['1', 0], steps: 26, cfg: 7, sampler_name: 'dpmpp_2m', scheduler: 'karras' });
            this.onEvent({ type: 'warn', message: 'Lightning LoRA 미설치 — 기존 26스텝으로 진행(LoRA 설치 시 자동 가속).' });
          }
        }
      } catch { /* 폴백 점검 실패 시 워크플로 원본 사용 */ }
      img2imgFn = (rgbPng, positivePrompt, negativePrompt) => generateThumbnail(comfyUrl, {
        imageBuffer: rgbPng,
        inputName: `i2i_${randomUUID().slice(0, 8)}.png`,
        workflow: i2iWf,
        positivePrompt: positivePrompt || undefined, // 상품명 기반(없으면 워크플로 기본값)
        negativePrompt: negativePrompt || undefined,
        timeoutMs: timeoutSec * 1000,
      });
    } catch (e) {
      this.onEvent({ type: 'warn', message: `img2img 워크플로 로드 실패 — 재생성 비활성: ${e.message}` });
    }

    this.loopPromise = runPullLoop({
      session: this.session,
      comfyUrl,
      workflow,
      defaultPositive: positivePrompt || DEFAULT_POSITIVE,
      defaultNegative: negativePrompt || DEFAULT_NEGATIVE,
      timeoutMs: timeoutSec * 1000,
      pollMs: pollSec * 1000,
      workerId,
      hostname: host,
      signal: this.abort.signal,
      onEvent: this.onEvent,
      // 기본: 누끼+흰배경 1:1. job.mode==='regenerate' 면 prefill+SDXL img2img+재누끼.
      // 모델(BiRefNet_lite)은 userData/hf-cache 에 최초 1회 다운로드 후 영구 캐시.
      processImage: (buf, job) => processCutoutThumbnail(buf, {
        cacheDir: join(this.userDataDir, 'hf-cache'),
        mode: job?.mode,
        regenPrompt: job?.prompt,
        regenNegative: job?.negative_prompt,
        img2imgFn,
      }),
    }).catch((e) => this.onEvent({ type: 'error', message: e.message }))
      .finally(() => { this.abort = null; this.loopPromise = null; });
  }

  async stop() {
    if (this.abort) this.abort.abort();
    try { await this.loopPromise; } catch { /* ignore */ }
  }
}
