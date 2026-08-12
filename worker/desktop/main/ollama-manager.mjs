/**
 * 포터블 ollama 생명주기 관리 — ComfyManager 와 같은 패턴.
 *   start(): 바이너리 보장(없으면 다운로드) → `ollama serve` 기동 → /api/tags 헬스 대기
 *            → 기본 모델 보장(없으면 /api/pull 스트리밍으로 다운로드, 진행률 로그).
 *   stop():  프로세스 트리 종료.
 * 모델/바이너리는 installDir/ollama/ 아래에 격리 저장(OLLAMA_MODELS).
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ensureOllama, ollamaDir, checkGpu } from './bootstrap.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOST = '127.0.0.1:11434';
const BASE = `http://${HOST}`;

/**
 * 동시 처리 슬롯 수(OLLAMA_NUM_PARALLEL)를 남은 VRAM 으로 정한다.
 * ---------------------------------------------------------------------------
 * ⚠️ 예전 주석은 "미설정이면 ollama 가 남은 VRAM 을 보고 1~4 를 자동 선택한다"였는데,
 *    현재 ollama 는 그렇지 않다 — **미설정이면 항상 1**이다. 실측(RTX 4060 Ti, 남은 13.6GB):
 *      미설정  : 3개 동시 요청 = 48 tok/s (단일 49 tok/s 대비 0.98배 = 그냥 줄서기)
 *      =3 설정 : 3개 동시 요청 = 104 tok/s (2.02배), 6개 = 125 tok/s (2.43배)
 *    즉 ai-generator 의 짧은필드 Promise.all 과 ai-batch 의 상품 동시 레인이 **전부 무효**였다.
 *
 * v0.2.48 의 사고("=3 강제 → ComfyUI 공존 시 OOM")를 되풀이하지 않기 위해:
 *   ① 총량이 아니라 **지금 남은 VRAM** 으로 정한다(그때는 무조건 3이었다).
 *   ② 슬롯 1개는 KV 캐시 몫이 필요하다 — 실측 5361MB(7.8B·num_ctx 4096·3슬롯)로
 *      단일 대비 +0.5GB 수준이라, 여유를 넉넉히 잡고도 안전하다.
 *   ③ 사용자가 직접 지정했으면 그 값을 존중한다(...process.env 가 뒤에 오지 않도록 주의).
 *
 * ⭐ 슬롯 상한을 3 → 6 으로 올린다(위 실측을 그대로 쓴다).
 *    같은 측정에서 6 슬롯이 2.43배로 3 슬롯(2.02배)보다 **+20%** 빨랐는데, 코드는 3 에서
 *    멈춰 있어 그 구간을 버리고 있었다. 메모리 비용은 작다 — 실측 5361MB 가 "7.8B 모델 +
 *    3 슬롯 KV" 합계이고 단일 대비 +0.5GB 였으므로, 슬롯당 KV 는 0.2GB 미만이다.
 *    6 슬롯이라도 모델 포함 6GB 안쪽이라 11GB 여유면 5GB 를 남긴다.
 *
 *    ⚠️ 기존 구간은 절대 낮추지 않는다(순수 증가). 어떤 PC 도 예전보다 적은 슬롯을 받지
 *       않으므로, 이 변경으로 느려지는 경우는 구조적으로 없다.
 * @returns {Promise<number>} 슬롯 수(1~6)
 */
export async function pickNumParallel() {
  const gpu = await checkGpu().catch(() => ({ ok: false, vramFreeMb: 0 }));
  if (!gpu.ok) return 1;                       // CPU 추론은 병렬이 이득이 없다(코어 경합)
  const free = gpu.vramFreeMb || 0;
  if (free >= 11000) return 6;                 // 예전 3 → 실측상 +20%
  if (free >= 9000) return 4;
  if (free >= 8000) return 2;
  return 1;                                     // 빠듯하면 예전과 동일(안전)
}

/**
 * 지금 떠 있는 ollama 가 실제로 몇 개를 동시에 처리하는가.
 *   우리가 띄웠으면 우리가 준 값, 아니면 이 프로세스가 물려받은 환경변수(사용자가 시스템에
 *   설정해 둔 경우), 그것도 없으면 ollama 기본값 1.
 * → 호출부(pickGenProfile)가 이 값을 넘겨 **서버가 소화 못 할 만큼 동시에 던지지 않게** 한다
 *   (실측: 슬롯 1개인데 6개를 던지면 오히려 0.89배로 느려진다).
 */
export function serverParallelHint(manager) {
  if (manager?.numParallel) return manager.numParallel;
  const env = Number(process.env.OLLAMA_NUM_PARALLEL);
  return Number.isFinite(env) && env >= 1 ? env : 1;
}

export class OllamaManager {
  constructor(installDir, { model = 'exaone3.5:7.8b', embedModel = 'bge-m3', onLog = () => {} } = {}) {
    this.installDir = installDir;
    this.model = model;
    this.embedModel = embedModel; // 카테고리 임베딩 매칭용 (없으면 카테고리 정확도 저하)
    this.onLog = onLog;
    this.proc = null;
    // 이 서버가 동시에 처리하는 요청 수. 우리가 띄웠을 때만 확정값을 안다(아니면 null).
    this.numParallel = null;
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
      // 동시 처리 슬롯 — 남은 VRAM 기준(위 pickNumParallel 주석 참조).
      //   미설정이면 ollama 는 1 로 동작해 코드의 병렬화가 전부 무효가 된다(실측).
      //   사용자가 시스템에 직접 설정해 뒀으면 그 값을 그대로 존중한다.
      const userSet = Number(process.env.OLLAMA_NUM_PARALLEL);
      const np = Number.isFinite(userSet) && userSet >= 1 ? userSet : await pickNumParallel();
      this.numParallel = np;
      const env = {
        ...process.env,
        OLLAMA_HOST: HOST,
        OLLAMA_MODELS: join(ollamaDir(this.installDir), 'models'),
        OLLAMA_NUM_PARALLEL: String(np),
      };
      this.onLog(`[ollama] serve 시작 (동시 처리 ${np}개${np > 1 ? '' : ' — VRAM 여유가 없어 순차'})`);
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
      // 우리가 띄운 서버가 아니다(사용자가 직접 설치·실행 중인 ollama 등) → 기동 옵션을 못 준다.
      //   이 경우 동시 처리는 물려받은 환경변수로만 알 수 있고, 없으면 ollama 기본값 1 이다.
      //   1 인데 VRAM 여유가 크면 "그냥 두면 2배 느린" 상태이므로 해결법을 함께 알린다.
      this.numParallel = serverParallelHint(null);
      this.onLog('[ollama] 이미 실행 중');
      if (this.numParallel <= 1) {
        const gpu = await checkGpu().catch(() => ({ ok: false, vramFreeMb: 0 }));
        if (gpu.ok && (gpu.vramFreeMb || 0) >= 8000) {
          this.onLog('[속도] 실행 중인 ollama 가 요청을 하나씩만 처리합니다(기본값). '
            + '시스템 환경변수 OLLAMA_NUM_PARALLEL=3 을 설정하고 ollama 를 다시 시작하면 '
            + '텍스트 생성이 약 2배 빨라집니다. (도우미가 직접 띄운 ollama 는 자동 적용됩니다)');
        }
      }
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
