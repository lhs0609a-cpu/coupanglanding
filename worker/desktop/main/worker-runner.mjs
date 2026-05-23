/** 로그인 + 풀 루프 시작/정지 래퍼 (공통 runtime/pull-loop 사용) */
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Session } from '../runtime/supabase-rest.mjs';
import { loadWorkflow } from '../runtime/comfyui-client.mjs';
import { runPullLoop } from '../runtime/pull-loop.mjs';
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
  }

  get running() { return !!this.abort; }
  get loggedIn() { return !!this.session; }

  async login(supabaseUrl, anonKey, email, password) {
    const s = new Session(supabaseUrl, anonKey, join(this.userDataDir, '.session.json'));
    await s.loadOrLogin(email, password);
    this.session = s;
  }

  /** 웹 페어링으로 받은 세션 주입 */
  async pair(supabaseUrl, anonKey, sessionTokens) {
    const s = new Session(supabaseUrl, anonKey, join(this.userDataDir, '.session.json'));
    await s.seed(sessionTokens);
    this.session = s;
  }

  /** 저장된 세션(.session.json)으로 자동 로그인 시도 — 성공 시 true */
  async tryRestoreSession(supabaseUrl, anonKey) {
    if (!supabaseUrl || !anonKey) return false;
    try {
      const s = new Session(supabaseUrl, anonKey, join(this.userDataDir, '.session.json'));
      const ok = await s.tryRestore();
      if (ok) { this.session = s; return true; }
      return false;
    } catch { return false; }
  }

  async start({ comfyUrl, workflowPath, positivePrompt, negativePrompt, timeoutSec = 300, pollSec = 5 }) {
    if (this.running) return;
    if (!this.session) throw new Error('로그인이 필요합니다.');
    const workflow = await loadWorkflow(fsp, workflowPath);
    this.abort = new AbortController();
    const host = hostname();
    const workerId = `${host}-${randomUUID().slice(0, 8)}`;

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
      // 1단계: 누끼 + 흰배경 + 1:1 무크롭 합성(상품 픽셀 보존). ComfyUI 생성 대신 사용.
      // 모델(BiRefNet_lite)은 userData/hf-cache 에 최초 1회 다운로드 후 영구 캐시.
      processImage: (buf) => processCutoutThumbnail(buf, { cacheDir: join(this.userDataDir, 'hf-cache') }),
    }).catch((e) => this.onEvent({ type: 'error', message: e.message }))
      .finally(() => { this.abort = null; this.loopPromise = null; });
  }

  async stop() {
    if (this.abort) this.abort.abort();
    try { await this.loopPromise; } catch { /* ignore */ }
  }
}
