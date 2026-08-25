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
/**
 * 모델 하나가 VRAM 에서 차지하는 대략의 크기(MB) — 이름의 파라미터 수로 본다.
 * (설치 파일 크기 실측: exaone3.5:7.8b 4.77GB · qwen2.5:7b 4.68GB · qwen2.5:3b 1.93GB)
 */
export function estimateModelMb(model) {
  const s = String(model || '').toLowerCase();
  const m = s.match(/(\d+(?:\.\d+)?)\s*b(?![a-z])/);
  const b = m ? Number(m[1]) : 7.8;
  if (!Number.isFinite(b)) return 5000;
  // q4 기준 ≈ 0.62GB/1B + 오버헤드. 7.8B→5.0GB, 3B→2.2GB, 14B→9.3GB 로 실측과 맞는다.
  return Math.round(b * 620 + 200);
}

/** 슬롯 1개가 더 쓰는 KV 캐시(MB). 아래 KV 양자화(q8_0)까지 켜므로 넉넉히 잡아도 남는다. */
const KV_PER_SLOT_MB = 300;
/** 컴퓨트 버퍼·단편화 몫 — 여기까지 쓰면 OOM 이 난다. */
const VRAM_RESERVE_MB = 1200;

/**
 * 지금 남은 VRAM 에서 **이 모델을 올리고 남는 만큼** 슬롯을 연다.
 * ---------------------------------------------------------------------------
 * ⚠️ 예전엔 남은 VRAM 절대값으로 끊었다(11GB→6, 9GB→4, 8GB→2, 그 외 1). 그 숫자는
 *    **7.8B 모델을 전제로 한 것**이라, 저사양 PC 에서 정반대로 작동했다:
 *    남은 VRAM 이 4.5GB 인 PC 는 어차피 작은 모델(3B≈2.2GB)을 고르는데도 "8GB 미만"이라는
 *    이유로 슬롯 1개를 받았다. 실제로는 2.3GB 가 남아 3~4개를 돌릴 수 있었다 —
 *    저사양일수록 병렬이 더 중요한데(단일 처리량이 낮으니) 거기서만 병렬을 껐던 셈이다.
 * → 모델 크기를 빼고 계산한다. 어떤 구간도 예전보다 줄어들지 않는다(전 구간 순증).
 * @param {number} freeMb  지금 남은 VRAM
 * @param {string} model   실제로 올릴 모델
 * @returns {number} 1~6
 */
export function slotsForVram(freeMb, model) {
  const head = (freeMb || 0) - estimateModelMb(model) - VRAM_RESERVE_MB;
  if (head <= 0) return 1;
  // 상한 6 — 실측에서 6 동시가 2.43배로 최고였고 8 부터는 슬롯 초과로 오히려 떨어졌다.
  return Math.max(1, Math.min(6, Math.floor(head / KV_PER_SLOT_MB)));
}

export async function pickNumParallel({ model } = {}) {
  const gpu = await checkGpu().catch(() => ({ ok: false, vramFreeMb: 0 }));
  if (!gpu.ok) return 1;                       // CPU 추론은 병렬이 이득이 없다(코어 경합)
  return slotsForVram(gpu.vramFreeMb || 0, model);
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
      // ★ 사용자가 지정한 값은 존중하되 **1 은 존중하지 않는다**(실측 2026-08-19).
      //   이 PC 에 OLLAMA_NUM_PARALLEL=1 이 사용자 환경변수로 박혀 있었고, 그 탓에 도우미가
      //   ollama 를 직접 띄워도 슬롯 1개로 띄웠다 — 코드의 병렬화가 전부 무효인 상태였다.
      //   1 을 일부러 고른 사람은 사실상 없다(옛 설치·옛 안내 문구의 흔적이다). 반면 2 이상은
      //   의도가 분명하므로 그대로 따른다. 배려하려던 규칙이 정반대로 작동하고 있었다.
      const userSet = Number(process.env.OLLAMA_NUM_PARALLEL);
      // ⭐ 어떤 모델을 올릴지 알고 나서 슬롯을 정한다 — 호출부(allinone-runner)가 start() 전에
      //   this.model 을 확정해 둔다. 작은 모델이면 같은 VRAM 으로 슬롯을 더 열 수 있다.
      const np = Number.isFinite(userSet) && userSet >= 2 ? userSet : await pickNumParallel({ model: this.model });
      if (Number.isFinite(userSet) && userSet === 1 && np > 1) {
        this.onLog(`[속도] OLLAMA_NUM_PARALLEL=1 이 설정돼 있어 생성이 순차로 묶여 있었습니다 — `
          + `VRAM 여유를 보고 ${np}개 동시로 올려 띄웁니다.`);
      }
      this.numParallel = np;
      const env = {
        ...process.env,
        OLLAMA_HOST: HOST,
        OLLAMA_MODELS: join(ollamaDir(this.installDir), 'models'),
        OLLAMA_NUM_PARALLEL: String(np),
        // ── 저사양 PC 를 위한 KV 캐시 절약 ────────────────────────────────────
        //   실측(RTX 4060 Ti, 올인원_속도_설계도 §1-1): 최대 처리량은 194 → 193 tok/s 로
        //   **변화 없다**. 대신 동시 8 에서 무너지던 것이 무너지지 않았다(151 → 193).
        //   즉 이건 속도 옵션이 아니라 **슬롯 안정성·KV 메모리 절감** 옵션이고,
        //   슬롯 하나가 아쉬운 8GB 급 GPU 에서 정확히 그만큼 이득이 된다.
        //   q8_0 은 KV 를 절반으로 줄이면서 품질 손실이 사실상 없는 구간이다.
        //   ⚠️ 사용자가 직접 설정해 뒀으면 그 값을 존중한다(아래 ...직접설정 우선).
        OLLAMA_FLASH_ATTENTION: process.env.OLLAMA_FLASH_ATTENTION || '1',
        OLLAMA_KV_CACHE_TYPE: process.env.OLLAMA_KV_CACHE_TYPE || 'q8_0',
        // ── 텍스트·비전 두 모델이 서로를 밀어내지 않게 ──────────────────────────
        //   올인원은 텍스트(exaone3.5)와 비전(qwen2.5vl)을 **동시에** 쓴다(--vision-overlap).
        //   한 자리만 허용되면 호출마다 상대를 내리고 자기를 올린다 — 실측(2026-08-25,
        //   RTX 4060 Ti)에서 이 재적재가 호출당 3.5~10.2초였다. 판정 자체(prefill 1~3.7초 +
        //   decode 0.3초)보다 크다. 상품 100개면 이것만으로 10분이 넘게 사라진다.
        //   VRAM 이 모자라면 ollama 가 알아서 하나만 올린다 — 이 값은 "허용"이지 강제가 아니다.
        //   ⚠️ 우리가 ollama 를 **직접 띄울 때만** 적용된다. 이미 떠 있는 서버(트레이 앱·다른
        //      프로그램이 띄운 것)에는 못 미친다 — 그 경우는 allinone-runner 가 경고한다.
        OLLAMA_MAX_LOADED_MODELS: process.env.OLLAMA_MAX_LOADED_MODELS || '2',
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
      // ★ 예전엔 여기서 "환경변수를 직접 설정하세요"라고 안내만 했다. 그 안내를 읽고 실제로
      //   설정하는 사람은 거의 없고(로그는 아무도 안 본다), 그동안 모든 생성이 2배 느리게
      //   돌았다. 공식 ollama 설치본은 로그인 시 자동 실행되므로 이 상태가 오히려 표준이다.
      //   → 안전 조건이 맞으면 우리가 인수한다(재시작). 안 되면 예전처럼 안내로 물러난다.
      if (this.numParallel <= 1) await this._takeOverIdleOllama({ timeoutMs });
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

  /**
   * 남이 띄운 ollama 가 요청을 하나씩만 처리할 때, **유휴 상태면** 우리가 인수한다.
   * ---------------------------------------------------------------------------
   * 왜 이렇게까지 하나: 슬롯 1개는 이 프로젝트의 실측으로 2.0~2.4배 손해다
   *   (RTX 4060 Ti: 미설정 48 tok/s → =3 은 104 → =6 은 125). 공식 ollama 는 로그인 시
   *   자동 실행되므로 대부분의 PC 가 이 상태이고, 안내 문구로는 아무것도 바뀌지 않았다.
   *
   * 남의 프로세스를 내리는 일이라 조건을 좁게 잡는다 — 하나라도 어긋나면 건드리지 않는다:
   *   ① 지금 **아무 모델도 돌고 있지 않다**(/api/ps 가 비어 있다). 남이 쓰는 중이면 절대 금지.
   *   ② GPU 가 있고 여유 VRAM 이 8GB 이상 — 우리가 인수해서 얻을 게 실제로 있을 때만.
   *   ③ 재기동에 실패하면 곧바로 알린다. 이 경우 사용자는 ollama 를 잃으므로 침묵하면 안 된다.
   */
  async _takeOverIdleOllama({ timeoutMs = 120_000 } = {}) {
    const gpu = await checkGpu().catch(() => ({ ok: false, vramFreeMb: 0 }));
    const want = await pickNumParallel();
    if (!gpu.ok || (gpu.vramFreeMb || 0) < 8000 || want <= 1) return false;

    // ① 유휴 확인 — 남이 쓰는 중인 서버를 내리는 것은 어떤 속도 이득보다도 나쁘다.
    let busy = true;
    try {
      const r = await fetch(`${BASE}/api/ps`);
      const j = r.ok ? await r.json() : null;
      busy = !j || !Array.isArray(j.models) || j.models.length > 0;
    } catch { busy = true; }
    if (busy) {
      this.onLog('[속도] 실행 중인 ollama 가 순차 처리(1개)지만 지금 사용 중이라 그대로 둡니다 — '
        + '생성이 평소보다 느릴 수 있습니다.');
      return false;
    }

    this.onLog(`[속도] 실행 중인 ollama 가 요청을 하나씩만 처리합니다 — 유휴 상태라 `
      + `동시 ${want}개로 다시 띄웁니다(텍스트 생성이 약 2배 빨라집니다).`);
    try {
      const { execFile } = await import('node:child_process');
      const kill = (cmd, args) => new Promise((res) => execFile(cmd, args, () => res()));
      if (process.platform === 'win32') await kill('taskkill', ['/IM', 'ollama.exe', '/F']);
      else await kill('pkill', ['-f', 'ollama serve']);
      // 포트가 풀릴 때까지 잠깐 — 곧바로 띄우면 EADDRINUSE 로 우리 것도 못 뜬다.
      for (let i = 0; i < 20 && (await this.isUp()); i++) await sleep(500);
    } catch { /* 종료 실패는 아래 재확인에서 걸린다 */ }

    if (await this.isUp()) {
      this.onLog('[속도] 기존 ollama 를 내리지 못했습니다 — 순차 처리로 계속합니다(느려도 동작은 합니다).');
      return false;
    }
    try {
      await this.start({ timeoutMs });     // 이제 우리가 띄운다 → 슬롯이 확정된다
      return true;
    } catch (e) {
      this.onLog(`❌ ollama 재기동 실패 — ${e.message}. ollama 를 수동으로 다시 실행해 주세요.`);
      throw e;
    }
  }

  /**
   * 모델을 미리 VRAM 에 올려 둔다(예열).
   * ---------------------------------------------------------------------------
   * 예열이 없으면 **첫 상품이 모델 로딩 비용을 통째로 뒤집어쓴다**. 7.8B Q4 는 5GB라
   * 디스크에서 올리는 데 수십 초가 걸리고, 동시 레인이 여럿이면 그 레인들이 전부 로딩을
   * 기다리다 한꺼번에 몰린다(실측 8/12: 앞 2건이 248초·607초, 나머지 6건은 9~30초).
   * 사용자 눈에는 "생성이 멈췄다"로 보이는 구간이기도 하다.
   *
   * keep_alive 를 길게 잡는 이유: 기본값 5분이라 배치 중간에 잠깐 쉬면 모델이 내려가고
   * 다음 상품이 또 로딩을 문다. 생성이 도는 동안은 붙잡아 둔다.
   */
  /**
   * 지금 메모리에 상주 중인 **다른 모델을 내린다** — 우리가 쓸 모델만 남긴다.
   * ---------------------------------------------------------------------------
   * 왜 필요한가(실측 2026-08-22): GPU 가 없는 PC 는 모델이 **시스템 RAM** 에 산다. 그런데 예열은
   * 모델을 30분씩 붙잡아 두므로, 실행마다 고른 모델이 다르면 llama-server 가 겹쳐 쌓인다.
   * 실제로 16GB PC 에서 7.8B(4.3GB)와 3B(1.9GB)가 동시에 상주해 여유 RAM 이 0.7GB 까지 떨어졌고,
   * 그 상태에서 시작한 생성이 엔진 준비 단계에서 죽었다 — 아무도 안 쓰는 모델이 원인이었다.
   *
   * keep_alive:0 은 **예약**이다. 진행 중인 요청을 끊지 않고 그게 끝나면 내린다 —— 그래서
   * 다른 기능이 마침 그 모델을 쓰고 있어도 그 작업을 깨뜨리지 않는다.
   * @returns {Promise<Array<{name:string, mb:number}>>} 내리기를 건 모델들(로그용)
   */
  async unloadOthers(keep = this.model) {
    const freed = [];
    try {
      const r = await fetch(`${BASE}/api/ps`);
      if (!r.ok) return freed;
      const j = await r.json();
      for (const m of j.models || []) {
        const name = m.name || m.model;
        if (!name || name === keep) continue;
        try {
          await fetch(`${BASE}/api/generate`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: name, keep_alive: 0 }),
          });
          freed.push({ name, mb: Math.round((m.size || 0) / (1024 * 1024)) });
        } catch { /* 한 개 실패해도 나머지는 내린다 */ }
      }
    } catch { /* 조회 실패면 아무것도 하지 않는다 — 되찾을 게 있는지조차 모른다 */ }
    return freed;
  }

  async warmUp(model = this.model, keepAlive = '30m') {
    try {
      const t0 = Date.now();
      const r = await fetch(`${BASE}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt: '안녕', stream: false, keep_alive: keepAlive, options: { num_predict: 1 } }),
      });
      if (!r.ok) return false;
      await r.json().catch(() => null);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      this.onLog(`[속도] 모델 예열 완료 (${secs}초) — 첫 상품이 로딩을 기다리지 않습니다.`);
      return true;
    } catch (e) {
      // 예열 실패는 생성을 막지 않는다 — 예전처럼 첫 상품이 로딩을 물 뿐이다.
      this.onLog(`[속도] 모델 예열 생략 — ${e.message}`);
      return false;
    }
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
