/**
 * 포터블 ollama 생명주기 관리 — ComfyManager 와 같은 패턴.
 *   start(): 바이너리 보장(없으면 다운로드) → `ollama serve` 기동 → /api/tags 헬스 대기
 *            → 기본 모델 보장(없으면 /api/pull 스트리밍으로 다운로드, 진행률 로그).
 *   stop():  프로세스 트리 종료.
 * 모델/바이너리는 installDir/ollama/ 아래에 격리 저장(OLLAMA_MODELS).
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ensureOllama, ollamaDir } from './bootstrap.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOST = '127.0.0.1:11434';
const BASE = `http://${HOST}`;

export class OllamaManager {
  constructor(installDir, { model = 'exaone3.5:7.8b', embedModel = 'bge-m3', onLog = () => {} } = {}) {
    this.installDir = installDir;
    this.model = model;
    this.embedModel = embedModel; // 카테고리 임베딩 매칭용 (없으면 카테고리 정확도 저하)
    this.onLog = onLog;
    this.proc = null;
  }

  async isUp() {
    try { const r = await fetch(`${BASE}/api/tags`); return r.ok; } catch { return false; }
  }

  /** 바이너리 보장 → serve 기동 → 모델 보장. 이미 떠 있으면 모델만 보장. */
  async start({ timeoutMs = 120_000 } = {}) {
    if (!(await this.isUp())) {
      const exe = await ensureOllama({
        installDir: this.installDir,
        onProgress: (p) => this.onLog(`[ollama] ${p.detail || p.phase}${p.pct != null ? ' ' + p.pct + '%' : ''}`),
      });
      const env = {
        ...process.env,
        OLLAMA_HOST: HOST,
        OLLAMA_MODELS: join(ollamaDir(this.installDir), 'models'),
        // ⚠️ OLLAMA_NUM_PARALLEL 을 강제하지 않는다(과거 =3 강제가 문제였음).
        //   ComfyUI(누끼)가 VRAM 을 점유한 상태에서 7.8B 를 3배 컨텍스트로 올리면 16GB 를 넘겨
        //   OOM → 텍스트 단계 진입 시 프로세스가 죽었다. 미설정이면 ollama 가 "남은 VRAM"을 보고
        //   1~4 를 자동 선택한다(여유 있으면 병렬로 빠르게, 빠듯하면 1 로 안전). 짧은필드 3종
        //   Promise.all 은 num_parallel=1 이어도 큐잉될 뿐이라 안전하다. 사용자가 명시했으면 존중(...process.env).
      };
      this.onLog('[ollama] serve 시작');
      this.proc = spawn(exe, ['serve'], { env, windowsHide: true });
      this.proc.stdout?.on('data', (d) => this.onLog('[ollama] ' + String(d).trimEnd()));
      this.proc.stderr?.on('data', (d) => this.onLog('[ollama] ' + String(d).trimEnd()));
      this.proc.on('exit', (c) => { this.onLog(`[ollama] 종료 (code=${c})`); this.proc = null; });

      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await this.isUp()) break;
        if (!this.proc) throw new Error('ollama 프로세스가 비정상 종료되었습니다.');
        await sleep(1500);
      }
      if (!(await this.isUp())) throw new Error('ollama 헬스 대기 타임아웃');
      this.onLog('✅ ollama 준비 완료');
    } else {
      this.onLog('[ollama] 이미 실행 중');
    }
    await this.ensureModel(this.model, '~5GB');
    // 카테고리 임베딩 모델도 보장 — 없으면 임베딩 매처가 404 → 토큰매칭 저하(오분류).
    if (this.embedModel) {
      try {
        await this.ensureModel(this.embedModel, '~1.2GB');
      } catch (e) {
        // 임베딩 모델은 실패해도 치명적 아님(토큰매칭 폴백) — 경고만.
        this.onLog(`⚠️ 임베딩 모델(${this.embedModel}) 준비 실패 — 카테고리 정확도 저하 가능: ${e.message}`);
      }
    }
    return BASE;
  }

  async hasModel(model = this.model) {
    try {
      const r = await fetch(`${BASE}/api/tags`);
      const d = await r.json();
      const names = (d.models || []).map((m) => m.name);
      const family = model.split(':')[0];
      return names.some((n) => n === model || n.startsWith(family + ':'));
    } catch { return false; }
  }

  /** 모델이 없으면 /api/pull 스트리밍으로 받음(5% 단위 진행률 로그). */
  async ensureModel(model = this.model, sizeHint = '') {
    if (await this.hasModel(model)) { this.onLog(`[ollama] 모델 확인: ${model}`); return; }
    this.onLog(`[ollama] 모델 다운로드 시작: ${model}${sizeHint ? ` (${sizeHint}, 최초 1회)` : ''}`);
    const res = await fetch(`${BASE}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
    });
    if (!res.ok || !res.body) throw new Error(`모델 pull 실패 HTTP ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', lastPct = -1;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let o;
        try { o = JSON.parse(line); } catch { continue; }
        if (o.error) throw new Error(`모델 pull 오류: ${o.error}`);
        if (o.total && o.completed != null) {
          const pct = Math.floor((o.completed / o.total) * 100);
          if (pct !== lastPct && pct % 5 === 0) { this.onLog(`[ollama] ${model} ${pct}%`); lastPct = pct; }
        } else if (o.status) {
          this.onLog(`[ollama] ${o.status}`);
        }
      }
    }
    if (!(await this.hasModel(model))) throw new Error(`모델 pull 후에도 모델이 확인되지 않습니다: ${model}`);
    this.onLog(`✅ ollama 모델 준비: ${model}`);
  }

  async stop() {
    if (!this.proc) return;
    const pid = this.proc.pid;
    this.proc = null;
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    } else {
      try { process.kill(pid, 'SIGTERM'); } catch { /* ignore */ }
    }
  }
}
