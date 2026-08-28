// 올인원 생성 실행 코어 — run-folder.mjs 를 스폰하고 진행을 스트리밍한다.
//   두 진입점이 공유한다:
//   ① 앱 모듈(modules/allinone) — 네이티브 폴더창으로 고른 경로를 생성(경로 직독).
//   ② pair-server /allinone/generate — 웹이 업로드한 임시폴더를 생성(웹 주도).
// ⚠️ ollama(텍스트)·ComfyUI(누끼)가 떠 있어야 함(services 로 자동 기동).
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkGpu, checkSystemRam } from './bootstrap.mjs';

// 모델이 CPU 로 내려갈 때(VRAM 부족) 필요한 시스템 RAM 여유(MB) — **경고 기준일 뿐 모델을
//   낮추는 데는 쓰지 않는다**(freemem 은 출렁여서 좋은 PC 를 강등시킬 수 있다. pickGenProfile 주석).
//   3B q4 ≈ 1.9GB + 컨텍스트. 이보다 여유가 없으면 모델 적재 자체가 실패할 수 있다
//   (실측 사고: CPU_REPACK 3.1GiB 할당 실패 → llama-server 사망 → 생성 0건).
const RAM_FOR_SMALL_MB = 3000;
import { serverParallelHint } from './ollama-manager.mjs';
import { listModels, explainLlmError } from '../runtime/local-llm.mjs';
import { maskInternalNames } from './mask-internal.mjs';
import { resolveSourceTitles } from './source-title.mjs';

let child = null;

/**
 * 하드웨어에 맞춰 "어떤 PC 에서도 빠르게" 생성 설정을 고른다.
 *   ⭐ 판단 기준은 총 VRAM 이 아니라 **"지금 남은(free) VRAM"** 이다.
 *      16GB GPU 라도 다른 앱(브라우저·다른 AI 도구 등)이 VRAM 을 점유 중이면 7.8B(≈5GB)를
 *      GPU 에 못 올려 CPU 로 스필 → 10배 넘게 느려진다(실측: 남은 0.8GB일 때 3tok/s).
 *      그래서 지금 올릴 수 있는 크기에 맞춰 모델을 고른다.
 *   - free ≥ 5GB : 7.8B (품질 유지 + 병렬로 빠르게)
 *   - 그 외      : 2.4B (작아서 빠듯한 VRAM 에도 최대한 GPU 에 올라감)
 * (짧은 필드 3종 병렬화는 ai-generator 에서 하드웨어와 무관하게 항상 적용됨.)
 *
 * ⚠️ 예전엔 여기서 상세 토큰도 낮췄다(강 600 / 약 400). **효과가 없을 뿐 아니라 해로웠다** —
 *    num_predict 는 "목표"가 아니라 **상한**이라 낮춰도 생성이 빨라지지 않고 글이 잘릴 뿐이고,
 *    잘린 글은 길이 검증(공백제외 550자)에 걸려 재생성 1회를 더 부른다.
 *    실측(qwen2.5:3b-instruct, 4상품): 상한 400 → 재생성 4/4 강제 · 통과 0/4 · 평균 436자
 *                                     상한 800 → 재생성 3/4 · 통과 2/4 · 평균 616자 (평균 시간도 더 짧음)
 *    그래서 상세 토큰은 하드웨어로 조절하지 않는다(ai-generator 가 품질 하한 800 을 강제).
 */
export async function pickGenProfile() {
  const gpu = await checkGpu().catch(() => ({ ok: false, name: null, vramMb: 0, vramFreeMb: 0 }));
  const freeMb = gpu.vramFreeMb ?? 0;
  // ── 시스템 RAM 게이트 ────────────────────────────────────────────────────
  //   VRAM 에 다 못 올라간 레이어는 RAM 으로 내려간다(CPU 오프로드). RAM 도 없으면
  //   llama-server 가 통째로 죽어 **생성이 0건**이 된다(실측 사고: CPU_REPACK 3.1GiB 실패).
  //   7.8B(q4 ≈ 4.4GB)를 쓰려면 스필을 감당할 RAM 여유가 있어야 한다.
  const ram = checkSystemRam();
  //   ⚠️ **RAM 으로 모델을 낮추지는 않는다.** freemem() 은 값이 심하게 출렁인다 —
  //      같은 32GB PC 에서 작업 중 1.1GB, 유휴 5.0GB 로 실측됐다(윈도우 Available MBytes 와는 일치).
  //      이걸 모델 선택 기준으로 쓰면 멀쩡한 PC 가 순간 수치 때문에 저사양으로 강등된다
  //      (맥에서 freemem() 을 믿었다가 겪은 사고와 같은 함정 — checkGpuMac 주석 참조).
  //   ⭐ 대신 **CPU 로 내려갈 수밖에 없는 상황에서만** RAM 을 본다:
  //      VRAM 에 통째로 올라가면(strong) 스필이 없어 RAM 은 사실상 무관하다.
  //      VRAM 이 모자라 오프로드가 일어날 때만 RAM 부족이 곧 사망이다(CPU_REPACK 실패).
  const strong = gpu.ok && freeMb >= 5000;
  const willUseCpu = !gpu.ok || freeMb < 5000;
  const ramTight = ram.reliable && willUseCpu && ram.freeMb < RAM_FOR_SMALL_MB;
  // 남은 VRAM 이 극히 적으면(다른 프로그램이 GPU 점유) 작은 모델조차 스필한다 → 사용자에게 알린다.
  const scarce = gpu.ok && freeMb < 1500;

  // ⭐ 설치된 모델 중에서 고른다 — 없는 모델을 pull 하다 실패/지연(→ fetch failed)하는 걸 피한다.
  //   티어별 선호순으로, 이미 깔린 첫 모델을 쓴다. 하나도 없으면 대표값(그때만 pull).
  let installed = [];
  try { installed = await listModels(); } catch { /* ollama 아직 미기동 → 기본값 */ }
  const STRONG_PREFS = ['exaone3.5:7.8b', 'qwen2.5:7b-instruct', 'qwen2.5:7b'];
  // ⚠️ 예전엔 SMALL_PREFS 끝에 'exaone3.5:7.8b' 가 있었다 — **저사양 티어가 7.8B 를 고르는 버그**.
  //    OllamaManager 기본 모델이 exaone3.5:7.8b 라 어느 PC든 그건 이미 깔려 있고, 작은 모델은
  //    안 깔려 있다. 그래서 "약한 PC" 판정을 받고도 installed 검색이 7.8B 에 걸려 큰 모델이
  //    선택됐다(→ VRAM 초과 → RAM 스필 → CPU_REPACK 실패로 전멸). 작은 티어는 끝까지 작게 간다.
  const SMALL_PREFS = ['qwen2.5:3b-instruct', 'exaone3.5:2.4b', 'qwen2.5:3b'];
  const prefs = strong ? STRONG_PREFS : SMALL_PREFS;
  const model = prefs.find((n) => installed.some((m) => m === n)) || prefs[0];

  // ⚡ 동시 생성 개수 — 단일 GPU 라도 ollama 는 여러 요청을 한 배치로 디코딩한다.
  //    상품 1개씩 순차로 돌리면 GPU 가 놀아서(디코딩은 메모리 대역폭 병목) 처리량이 크게 손해다.
  //    다만 동시 요청마다 KV 캐시가 따로 필요하니 **모델을 올리고 남는 VRAM** 만큼만 늘린다.
  //      free ≥ 11GB → 6개 / ≥ 9GB → 4개 / ≥ 8GB → 2개 / 그 외 → 1개(예전과 동일 = 안전)
  //    ⚠️ ollama 쪽 OLLAMA_NUM_PARALLEL 이 같이 올라가야 실제로 동시에 돈다 — 아니면 줄서기라
  //       빨라지지 않을 뿐 아니라 **오히려 느려진다**(실측: 슬롯 1개에 6개 던지면 0.89배).
  //       그래서 최종값은 startGeneration 이 서버 슬롯 수로 한 번 더 깎는다.
  //
  // ⭐ 상한을 3 → 6 으로(pickNumParallel 과 같은 실측 근거: 6 동시 = 2.43배 vs 3 동시 = 2.02배).
  //    시간의 대부분을 차지하는 **상세글이 상품당 1콜**이라, 동시 상품 수가 곧 동시 요청 수다.
  //    슬롯만 6 으로 올리고 여기를 3 에 두면 남는 3 슬롯이 놀아서 이득이 사라진다.
  //    기존 구간은 낮추지 않으므로 어떤 PC 도 예전보다 느려지지 않는다.
  const concurrency = freeMb >= 11000 ? 6 : freeMb >= 9000 ? 4 : freeMb >= 8000 ? 2 : 1;
  // 인식(비전)은 이미지 컨텍스트(num_ctx 8192)라 슬롯당 KV 가 텍스트보다 훨씬 크다 →
  //   여유가 확실할 때만 2개. 1이면 예전과 동일한 순차 인식이다.
  const recogConcurrency = freeMb >= 11000 ? 2 : 1;
  /**
   * 비전 판정을 텍스트 생성과 **동시에** 돌려도 되는가 = 두 모델이 함께 상주할 수 있는가.
   *   텍스트 7.8B(≈4.8GB) + 비전 7B(≈5.7GB) + KV·여유 ≈ 13GB.
   *   들어가면 인식 시간이 텍스트 뒤로 숨는다(실측 A/B: 함께 상주해도 장당 8.6초 → 5.0초로 오히려 빨랐다).
   *   못 들어가면 서로 밀어내며 호출마다 재적재(15~34초)가 걸려 훨씬 느려지므로, 확실할 때만 켠다.
   */
  const visionOverlap = gpu.ok && strong && freeMb >= 13000;

  return {
    gpu, strong, scarce, model, ram, ramTight,
    concurrency, recogConcurrency, visionOverlap, installedCount: installed.length,
  };
}

export function isGenerating() { return !!child; }

// ── 예상 소요시간 ────────────────────────────────────────────────────────────
//   ⚠️ 예전엔 "GPU 면 상품당 60초" 한 값이었다. 그 60초는 **동시 1개 · 인식 순차 · 격자 300px**
//      시절의 값이라, 지금 구조(동시 6개 · 인식 겹치기 · 격자 176px)에서는 실제보다 훨씬 크다.
//      100개면 "약 100분"이라고 말하게 되는데 실제로는 그 1/5 이다 — 시작 전에 사람을 돌려세우는
//      숫자였다. 예상치는 **지금 이 PC 가 실제로 쓸 설정**에서 나와야 한다.
//
//   구성요소(실측 근거는 레포 루트 올인원_속도_설계도.md):
const TEXT_SEC_SEQ = 25;      // 동시 1개일 때 상품당 텍스트(≈1,160토큰 ÷ 46.7 tok/s). §1-1
//   동시 처리 배수 — 같은 GPU 로 총 처리량이 몇 배가 되는가(§1-1 실측). 6에서 포화한다.
const TEXT_SPEEDUP = { 1: 1.00, 2: 1.88, 3: 2.60, 4: 3.39, 5: 3.85, 6: 4.15 };
const VISION_SEC = 3;         // 176px 격자 · 상품당 2콜(대표+리뷰). §14. 겹치면(P3) 0 이다.
const THUMB_SEC = 2;          // 누끼 — 대부분 '이미 누끼됨/과일'로 생략되고, 남는 것도 동시 3건
const FIXED_OVERHEAD_SEC = 60; // 모델 콜드 적재·스캔·저장 등 상품 수와 무관한 몫
const SEC_PER_PRODUCT_CPU = 360;  // VRAM 부족 = 모델이 CPU 로 내려간 상태(실측 인식만 2~7분)
const VISION_VRAM_MB = 5700;

/** 폴더의 product_* 개수 — 예상 시간 계산용(스캔 실패해도 생성은 진행). */
function countProducts(folder) {
  try {
    return readdirSync(folder, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^product_/i.test(d.name)).length;
  } catch { return 0; }
}

/** 사람이 읽는 소요시간 */
const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); t.unref?.(); });

function humanMin(sec) {
  const m = Math.round(sec / 60);
  if (m < 1) return '1분 미만';
  if (m < 60) return `약 ${m}분`;
  return `약 ${Math.floor(m / 60)}시간 ${m % 60}분`;
}

/**
 * 생성 전 예상 소요시간 산정. degraded=true 면 VRAM 부족으로 CPU 처리가 되는 상태.
 * @returns {{products:number, degraded:boolean, etaSec:number, etaText:string, freeMb:number}}
 */
export function estimateGeneration(folder, profile) {
  const products = countProducts(folder);
  const freeMb = profile?.gpu?.vramFreeMb ?? 0;
  const degraded = !profile?.gpu?.ok || freeMb < VISION_VRAM_MB;
  let per;
  if (degraded) {
    per = SEC_PER_PRODUCT_CPU;
  } else {
    const c = Math.max(1, Math.min(6, profile?.concurrency || 1));
    const text = TEXT_SEC_SEQ / (TEXT_SPEEDUP[c] || 1);
    // 겹치면 인식은 텍스트 뒤로 통째로 숨는다(P3) — 시간에 더하지 않는다.
    const vision = profile?.visionOverlap ? 0 : VISION_SEC / Math.max(1, profile?.recogConcurrency || 1);
    per = text + vision + THUMB_SEC;
  }
  const etaSec = Math.round(Math.max(1, products) * per) + (degraded ? 0 : FIXED_OVERHEAD_SEC);
  return { products, degraded, etaSec, etaText: humanMin(etaSec), freeMb, perProductSec: Math.round(per * 10) / 10 };
}

/**
 * 폴더 하나를 올인원 생성한다. 성공 시 lastAllinoneFolder 를 갱신해
 * 웹 /allinone/* 직독이 이 폴더의 결과를 읽게 한다.
 * @returns {Promise<boolean>} 시작됐으면 true(완료는 onDone 으로 통지)
 */
export async function startGeneration({
  services, paths, store, send, folder, noThumb = false, onDone, onProgress,
  // VRAM 부족으로 매우 느려질 때 사용자에게 물어보는 훅(앱 UI 전용).
  //   미지정(웹 경로)이면 묻지 않고 경고만 남기고 진행한다.
  confirmSlow,
  /**
   * 검수를 시작할 수 있게 된 순간(레코드 저장 완료). 대표컷 누끼는 그 뒤에도 계속 돈다.
   * 누끼는 등록 시점에만 필요한 작업이라 사람을 그때까지 기다리게 할 이유가 없다.
   * 미지정이면 예전처럼 onDone(프로세스 종료) 때 한 번만 알린다.
   */
  onReviewReady,
}) {
  if (!folder) throw new Error('폴더가 지정되지 않았습니다.');
  if (child) throw new Error('이미 생성이 진행 중입니다.');

  // 생성이 도는 동안에는 엔진(ComfyUI·ollama)이 내려가면 안 된다. 아래 모든 종료 경로에서
  // 놓아 준다 — 혹시 빠뜨려도 main.mjs 가 isGenerating() 으로 다시 확인하므로 영구 점유는 없다.
  holdEngines();

  // ── 하드웨어 자동 적응 — "어떤 PC 에서도 빠르게" ──────────────────────────
  //   GPU 감지해 모델/상세토큰을 자동 선택하고, ollama 가 그 모델을 갖도록(없으면 pull) 맞춘다.
  const profile = await pickGenProfile();
  const gb = (mb) => (Math.round(((mb || 0) / 1024) * 10) / 10);
  send('allinone:log',
    `[속도] 하드웨어: ${profile.gpu.ok
      ? `${profile.gpu.name} · VRAM 남음 ${gb(profile.gpu.vramFreeMb)}/${gb(profile.gpu.vramMb)}GB`
      : 'GPU 없음(CPU)'} `
    // 동시 처리 수는 엔진 슬롯을 확인한 뒤 확정되므로 여기서 말하지 않는다(아래 [속도] 줄에서 확정값).
    // 상세 토큰은 하드웨어와 무관한 고정 하한이라 말하지 않는다(예전엔 "상세 400토큰"이라 찍었는데
    //   실제로는 800 으로 올라가고 있어서 사용자에게 거짓을 말하고 있었다).
    // RAM 도 함께 찍는다 — 모델이 못 뜨는 사고의 실제 원인이 VRAM 이 아니라 RAM 이었다.
    + ` · RAM 남음 ${gb(profile.ram.freeMb)}/${gb(profile.ram.totalMb)}GB`
    + `→ 모델 ${profile.model}`);
  // ── RAM 프리플라이트 ──────────────────────────────────────────────────────
  //   VRAM 이 모자라면 모델 레이어가 RAM 으로 내려간다. RAM 도 없으면 llama-server 가
  //   통째로 죽어 생성이 0건이 된다(실측: CPU_REPACK 3.1GiB 할당 실패로 100개 전멸).
  //
  //   ★ 순서가 중요하다: **먼저 되찾고, 다시 재고, 그다음에 판단한다.**
  //     예전엔 경고만 하고 그대로 진행했는데, 그 경고를 읽는 사람은 없고 몇 분 뒤 "생성이
  //     실패했습니다" 한 줄만 남았다. 게다가 모자란 RAM 의 상당 부분은 **아무도 안 쓰는
  //     상주 모델**이었다 — 사용자에게 프로그램을 닫으라고 하기 전에 우리 것부터 치운다.
  let ramNow = profile.ram;
  if (services?.ollama && !profile.gpu.ok) {
    const freed = await services.ollama.unloadOthers(profile.model).catch(() => []);
    if (freed.length) {
      const mb = freed.reduce((s, f) => s + (f.mb || 0), 0);
      send('allinone:log',
        `[메모리] 쓰지 않는 AI 모델 ${freed.length}개(약 ${gb(mb)}GB)를 메모리에서 내립니다 — `
        + `이 PC 는 GPU 가 없어 모델이 시스템 메모리를 씁니다.`);
      // 내리기는 예약이고 프로세스가 실제로 내려가는 데도 시간이 걸린다(4GB짜리는 몇 초).
      // 충분히 회수될 때까지만 기다린다 — 회수되면 곧바로 나간다.
      for (let i = 0; i < 4; i++) {
        await sleep(1500);
        ramNow = checkSystemRam();
        if (!ramNow.reliable || ramNow.freeMb >= RAM_FOR_SMALL_MB) break;
      }
    }
  }
  //   되찾은 뒤에도 모자라면 **시작하지 않는다**. 여기서 밀어붙여 봐야 몇 분 태우고 같은
  //   자리에서 죽는다 — 그 몇 분과 "왜 실패했는지 모름"을 사용자에게 남기지 않는다.
  ramNow = checkSystemRam();
  const stillTight = ramNow.reliable && !profile.gpu.ok && ramNow.freeMb < RAM_FOR_SMALL_MB;
  if (stillTight) {
    const reason = `시스템 메모리가 부족해 시작하지 않았습니다 — 지금 쓸 수 있는 메모리가 `
      + `${gb(ramNow.freeMb)}GB 뿐이고 AI 모델을 올리려면 최소 ${gb(RAM_FOR_SMALL_MB)}GB 가 필요합니다. `
      + `이 PC 는 GPU 가 없어 모델이 시스템 메모리에서 돕니다 — 크롬(탭이 많으면 수 GB)이나 `
      + `다른 AI·영상 프로그램을 닫고 다시 눌러주세요. `
      + `가상 메모리(페이지파일)가 꺼져 있어도 같은 증상이 납니다.`;
    send('allinone:log', '⛔ ' + reason);
    onDone?.(-1, reason);
    freeEngines();
    send('allinone:done', { code: -1, reason });
    return false;
  }
  // 막을 정도는 아니지만 빠듯한 구간 — 판정은 **회수 뒤의 최신 값**으로 한다(profile.ram 은
  // 회수 전 값이라 이미 해결된 문제를 계속 경고하게 된다).
  if (ramNow.reliable && !profile.gpu.ok && ramNow.freeMb < RAM_FOR_SMALL_MB * 1.5) {
    send('allinone:log',
      `⚠️ 지금 쓸 수 있는 시스템 RAM 이 ${gb(ramNow.freeMb)}GB 로 빠듯합니다 — `
      + `생성이 느리거나 중간에 실패할 수 있습니다. 여유가 되면 무거운 프로그램을 닫아주세요.`);
  }
  // ── 같은 엔진을 쓰는 다른 프로그램이 있는가 ────────────────────────────────
  //   ollama 는 한 대에 하나뿐이다. 다른 프로그램이 제 모델을 계속 올리면 우리 모델이 그때마다
  //   **밀려났다가 다시 올라온다.** 실측(2026-08-25, RTX 4060 Ti): 이 재적재가 호출당
  //   3.5~10.2초였고, 정작 판정 자체는 1~3.7초였다 — 즉 시간의 대부분이 "짐 옮기기"였다.
  //   VRAM 도 RAM 도 넉넉해 보이므로 기존 경고에는 전혀 걸리지 않는다. 그래서 따로 본다.
  //   막지는 않는다(남의 프로그램이다) — 다만 왜 느린지는 정직하게 말한다.
  try {
    const r = await fetch('http://127.0.0.1:11434/api/ps', { signal: AbortSignal.timeout(3000) });
    const loaded = (await r.json())?.models || [];
    const ourBase = (n) => String(n || '').split(':')[0];
    const ours = new Set([ourBase(profile.model), 'qwen2.5vl', 'bge-m3']);
    const foreign = loaded.filter((m) => !ours.has(ourBase(m.name)));
    if (foreign.length) {
      send('allinone:log',
        `⚠️ 다른 프로그램이 같은 AI 엔진(ollama)에 모델을 올려 두고 있습니다 — `
        + `${foreign.map((m) => `${m.name}(${gb((m.size || 0) / 1048576)}GB)`).join(', ')}. `
        + `그 프로그램이 계속 사용 중이면 우리 모델이 호출마다 밀려났다 다시 올라와 `
        + `상품 1개마다 수 초씩(실측 3.5~10초) 더 걸립니다. 끝내 놓고 시작하면 그만큼 빨라집니다.`);
    }
  } catch { /* 엔진이 아직 안 떴거나 응답이 없으면 판단하지 않는다 — 경고는 확실할 때만 */ }

  // ── 예상 소요시간 안내 ─────────────────────────────────────────────────────
  //   "얼마나 걸릴지"를 안 알려주면 느린 실행이 고장으로 보인다(실측 문의: VRAM 0.6GB 상태에서
  //   인식 1건에 2~8분 걸리자 "생성이 안 된다"고 판단). 시작 전에 숫자로 말한다.
  const est = estimateGeneration(folder, profile);
  // "정상이면 얼마"는 이 PC 가 **정상 동작할 때의 설정**으로 다시 계산한다(고정값 금지).
  const fast = humanMin(estimateGeneration(folder, {
    ...profile, gpu: { ...profile.gpu, ok: true, vramFreeMb: 14000 },
    concurrency: 6, recogConcurrency: 2, visionOverlap: true,
  }).etaSec);
  send('allinone:log',
    `[예상] 상품 ${est.products}개 · ${est.etaText} 소요 예상`
    + (est.degraded ? ` (VRAM 부족으로 CPU 처리 — 정상이면 ${fast})` : ` (상품당 약 ${est.perProductSec}초)`));
  if (est.degraded) {
    send('allinone:log',
      `⚠️ 지금 쓸 수 있는 VRAM 이 ${gb(est.freeMb)}GB 뿐이라 AI 모델이 그래픽카드에 못 올라갑니다. `
      + `다른 AI 프로그램(ComfyUI·음악/영상 생성 등)이나 무거운 앱을 닫고 다시 시작하면 `
      + `${est.etaText} → ${fast} 로 줄어듭니다.`);
    // 앱에서 시작한 경우엔 물어본다 — 웹 경로(confirmSlow 없음)는 경고만 남기고 진행.
    if (typeof confirmSlow === 'function') {
      let go = true;
      try {
        go = await confirmSlow({
          products: est.products, etaText: est.etaText, fastText: fast, freeGb: gb(est.freeMb),
        });
      } catch { go = true; }   // 확인창 자체가 실패하면 막지 않는다
      if (!go) {
        send('allinone:log', '생성을 시작하지 않았습니다 — 무거운 프로그램을 닫고 다시 눌러주세요.');
        onDone?.(0, null);
        freeEngines();
        send('allinone:done', { code: 0, canceled: true });
        return false;
      }
    }
  }
  if (services?.ollama) services.ollama.model = profile.model; // ensureModel 이 이 모델을 pull/확인

  // ── 원본 상품명 조회와 엔진 기동을 **동시에** 진행 ────────────────────────
  //   원본명 조회는 네트워크(안티봇 회피용 4초 페이싱, 최대 120초)이고 엔진 기동은 디스크/GPU 라
  //   서로 자원을 안 뺏는다. 예전엔 순차라 "링크 조회가 끝날 때까지" 엔진이 놀고 있었다.
  //   둘 다 끝난 뒤에 run-folder 를 띄우므로 스캐너가 읽는 _source-titles.json 은 그대로 보장된다.
  //
  //   원본 상품명이 필요한 이유: 소싱 폴더의 product.json.name 이 분류 라벨 반복·설명 문장인
  //   경우가 많아(실측 8건 중 5건) 노출명·옵션추출·카테고리가 통째로 오염된다.
  //   ⚠️ 반드시 여기(Electron 메인)에서 해야 한다 — 안티봇 때문에 순수 Node 프로세스는 못 뚫는다.
  //   실패해도 생성은 그대로 진행한다(기존 이름 폴백).
  const titlesTask = (async () => {
    try {
      const t = await resolveSourceTitles(folder, (m) => send('allinone:log', m));
      if (t.filled || t.cached || t.failed) {
        send('allinone:log',
          `[원본명] 링크에서 ${t.filled}건 확보`
          + (t.cached ? ` · 캐시 ${t.cached}건` : '')
          + (t.failed ? ` · 실패 ${t.failed}건(기존 상품명 사용)` : ''));
      }
    } catch (e) {
      send('allinone:log', `[원본명] 조회 생략(${String(e?.message || e).slice(0, 80)}) — 기존 상품명으로 진행합니다.`);
    }
  })();

  // 엔진 자동 기동 — ollama 는 없으면 자동 설치·기동·모델 다운로드까지.
  send('allinone:log', '엔진 준비 중 — ollama(텍스트 생성)…');
  const ollamaTask = Promise.resolve(services?.ollama?.start());
  // ⚠️ 엔진이 실패해도 원본명 조회는 끝까지 기다린다 — 안 그러면 그 작업이 배경에 남아
  //    다음 실행과 겹친다(같은 폴더에 동시 쓰기). 실패 판정은 그 뒤에 한다.
  const [ollamaRes] = await Promise.allSettled([ollamaTask, titlesTask]);
  if (ollamaRes.status === 'rejected') {
    const e = ollamaRes.reason;
    // ★ 사유를 **반드시** 실어 보낸다. 예전엔 onDone(-1) 만 불러서, 웹 화면에는 사유 없는
    //   "생성이 실패했습니다." 한 줄만 떴고 진짜 원문은 이 앱의 로그 패널에만 남았다.
    //   그 패널을 열어 두는 사람은 없다 — 실패를 진단할 수 없게 만드는 건 실패보다 나쁘다.
    //   (자식 프로세스 실패 경로는 원래 사유를 넘기고 있었다. 여기만 빠져 있었다.)
    const reason = maskInternalNames(
      'AI 엔진을 준비하지 못했습니다 — ' + explainLlmError(String(e?.message || e)));
    send('allinone:log', '❌ ' + reason);
    onDone?.(-1, reason);
    freeEngines();
    send('allinone:done', { code: -1, reason });
    return false;
  }

  // ── 서버가 실제로 소화하는 동시 요청 수에 맞춰 깎는다 ─────────────────────
  //   슬롯이 1개인데 3~6개를 던지면 줄서기라 이득이 없고 오히려 느려진다(실측 0.89배).
  //   도우미가 띄운 ollama 는 위에서 남은 VRAM 만큼 슬롯을 열어 뒀다.
  const slots = serverParallelHint(services?.ollama);
  const genConcurrency = Math.max(1, Math.min(profile.concurrency, slots));
  const recogConcurrency = Math.max(1, Math.min(profile.recogConcurrency, slots));
  send('allinone:log',
    `[속도] 동시 처리 — 텍스트 상품 ${genConcurrency}개 · 이미지인식 ${recogConcurrency}개 (엔진 슬롯 ${slots}개)`);
  // ── ComfyUI(누끼) VRAM 스왑 — 텍스트 단계 동안 ComfyUI 를 내려 VRAM 을 ollama 에 몰아준다 ──
  //   ComfyUI 프로세스는 cudaMallocAsync 로 큰 VRAM 풀을 물고 있어 /free 로는 안 돌아온다(실측).
  //   그래서 텍스트 동안 아예 프로세스를 내리고, 누끼 단계 직전(run-folder 가 [2/3] 마커를 찍을 때)
  //   다시 올린다. run-folder 는 --wait-comfy 로 누끼 전에 ComfyUI 기동을 기다린다.
  //   GPU 없거나 noThumb 이면 스왑 불필요(기존대로).
  const useComfySwap = !noThumb && profile.gpu.ok && !!services?.comfy;
  if (useComfySwap) {
    try {
      send('allinone:log', '🔀 텍스트 단계: ComfyUI 를 잠시 내려 VRAM 을 확보합니다(누끼 단계에서 자동 재기동).');
      await services.comfy.stop();
    } catch { /* 안 떠 있으면 무시 */ }
  } else if (!noThumb) {
    try {
      send('allinone:log', '엔진 준비 중 — ComfyUI(대표사진 누끼)…');
      await services?.comfy?.start();
    } catch (e) {
      // 누끼 엔진 실패는 치명적 아님 — 텍스트만 진행(원본 사진 폴백).
      send('allinone:log', '⚠️ ComfyUI 준비 실패 — 누끼 없이 텍스트만 진행: ' + (e.message || e));
    }
  }

  const runtimeDir = join(paths.appRoot, 'runtime');
  const script = join(runtimeDir, 'run-folder.mjs');
  // --detail-tokens 는 넘기지 않는다 — run-folder 기본값(800)이 곧 품질 하한이고,
  //   그보다 낮추면 잘려서 재생성만 늘었다(위 pickGenProfile 주석의 실측).
  const args = [
    script, folder,
    '--model', profile.model,
    '--concurrency', String(genConcurrency),
    '--recog-concurrency', String(recogConcurrency),
  ];
  // 비전 판정 1회 상한 — GPU 있으면 상품당 수 초라 3분은 사실상 안 걸리는 안전망이고,
  // 없으면 90초에서 끊어 그 상품만 휴리스틱으로 넘긴다(생성이 통째로 멈추는 것 방지).
  args.push('--vision-timeout', String(profile.gpu.ok ? 180_000 : 90_000));
  // GPU 가 아예 없으면 비전 모델(5.6GB)을 새로 받지 않는다 — 받아도 상한 초과로 못 쓰는 일이 잦다.
  //   실측(num_gpu=0 재현): 최소 조건 1콜 88.0초(같은 PC GPU 15.0초)인데 상품당 2콜을 동시에 던진다.
  //   이미 설치된 PC 는 그대로 쓰고, 상한 초과가 반복되면 run-folder 가 알아서 접는다(회로차단).
  if (!profile.gpu.ok) args.push('--no-vision-pull');
  if (noThumb) args.push('--no-thumb');
  // 누끼를 사람의 대기시간 밖으로 — 레코드를 먼저 저장해 검수를 시작하게 하고, 가공은 이어서 돈다.
  //   결과물(이미지·레코드)은 동일하고 순서만 바뀐다. 100개 기준 3~8분을 대기에서 걷어낸다.
  else args.push('--defer-thumb');
  // 두 모델이 함께 상주할 VRAM 이 있으면 비전 판정을 텍스트와 동시에 — 인식 시간이 통째로 숨는다.
  if (profile.visionOverlap) {
    args.push('--vision-overlap');
    send('allinone:log', '[속도] 이미지 인식을 텍스트 생성과 동시에 진행합니다(VRAM 여유 확인됨).');
  }
  if (useComfySwap) args.push('--wait-comfy'); // 누끼 전에 ComfyUI 기동을 기다리게

  // ── 모델 예열 ────────────────────────────────────────────────────────────
  // 여기서 미리 올려 두지 않으면 첫 상품이 로딩(7.8B Q4 = 5GB)을 통째로 문다. 동시 레인이
  // 여럿이면 그 레인들이 다 같이 로딩을 기다리다 한꺼번에 몰려 앞 몇 건만 몇 분씩 걸린다
  // (실측 8/12: 앞 2건 248초·607초, 나머지 6건 9~30초 — 앞 2건이 전체 시간의 85%였다).
  // 실패해도 그냥 예전 동작이라 기다리지 않고 진행한다.
  // ★ 붙잡아 두는 시간을 하드웨어로 나눈다. GPU 가 있으면 모델은 VRAM 에 살고 시스템 RAM 을
  //   건드리지 않으니 30분을 잡아도 손해가 없다. GPU 가 없으면 그 30분이 곧 **시스템 RAM 점유**다
  //   — 실측: 예열만 하고 죽은 실행이 4.3GB 를 30분간 붙잡아 다음 실행을 굶겼다.
  //   생성이 도는 동안은 요청마다 시계가 갱신되므로 짧게 잡아도 중간에 내려가지 않는다.
  try {
    await services?.ollama?.warmUp?.(profile.model, profile.gpu.ok ? '30m' : '5m');
  } catch { /* 예열 실패는 생성을 막지 않는다 */ }

  child = spawn(process.execPath, args, {
    cwd: runtimeDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      MEGALOAD_HF_CACHE: join(paths.userData, 'hf-cache'),
    },
  });

  // 실패 사유를 잃지 않도록 최근 로그·에러 라인을 버퍼링해 둔다.
  //   예전엔 onDone(code) 만 넘겨 pair-server 가 sess.error 를 못 채웠고 → 웹엔 "로그 확인하세요"만.
  const recent = [];       // 최근 라인(마지막 수단)
  const errLines = [];     // 에러/오류로 보이는 라인(우선 노출)
  const pushBuf = (arr, line, cap) => { arr.push(line); if (arr.length > cap) arr.shift(); };
  let comfyRestarting = false; // 누끼 마커에 ComfyUI 재기동 1회만
  let reviewReady = false;     // 검수 시작 가능 통지는 1회만

  // 진행 이벤트를 앱 렌더러(send)와 호출자(onProgress: 웹 폴링용 pair-server)로 동시에 흘린다.
  const emitProgress = (p) => { send('allinone:progress', p); try { onProgress?.(p); } catch { /* skip */ } };
  const handle = (buf) => {
    for (const line of buf.toString('utf-8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      send('allinone:log', line);
      pushBuf(recent, line, 40);
      if (/오류|error|exception|traceback|실패|OOM|out of memory|HTTP\s?[45]\d\d|❌/i.test(line)) pushBuf(errLines, line, 8);
      // 누끼 단계 진입 마커([2/3] ollama 언로드) → 내려뒀던 ComfyUI 를 지금 올린다.
      //   run-folder 는 --wait-comfy 로 ComfyUI 가 준비될 때까지 기다렸다가 GPU 누끼를 한다.
      if (useComfySwap && !comfyRestarting && /\[2\/3\].*ollama\s*모델\s*언로드/.test(line)) {
        comfyRestarting = true;
        send('allinone:log', '🔀 누끼 단계: ComfyUI 를 다시 올립니다…');
        services.comfy.start().catch((e) =>
          send('allinone:log', '⚠️ ComfyUI 재기동 실패(누끼는 CPU 폴백): ' + (e.message || e)));
      }
      // 검수 시작 가능 시점 — 레코드가 저장된 순간이다(누끼는 뒤에서 계속 돈다).
      //   ⚠️ 폴더 기억을 여기서 해야 웹 /allinone/manifest 가 지금 결과를 읽는다.
      //      예전엔 프로세스 종료 때만 기억해서, 미리 열어 준 검수 화면이 빈 화면이었다.
      if (!reviewReady && /\[검수준비완료\]/.test(line)) {
        reviewReady = true;
        try { store?.set('lastAllinoneFolder', folder); } catch { /* skip */ }
        send('allinone:review-ready', { folder });
        try { onReviewReady?.(folder); } catch { /* 화면 열기 실패는 생성을 막지 않는다 */ }
      }
      let m;
      if ((m = line.match(/\[인식\s+(\d+)\/(\d+)\]/))) emitProgress({ phase: 'recognize', done: +m[1], total: +m[2] });
      else if ((m = line.match(/\[텍스트\s+(\d+)\/(\d+)\]/))) emitProgress({ phase: 'text', done: +m[1], total: +m[2] });
      else if ((m = line.match(/\[이미지\s+(\d+)\/(\d+)\]/))) emitProgress({ phase: 'image', done: +m[1], total: +m[2] });
    }
  };
  // 실패 사유 요약 — 에러 라인 우선, 없으면 최근 몇 줄, 그것도 없으면 종료코드/시그널.
  // ⚠️ 이 문구는 pair-server 를 거쳐 **웹 화면**에 그대로 뜬다 — 워커 로그 원문이라
  //    엔진·모델 이름이 섞여 있다. 내보내기 전에 기능 이름으로 치환한다(영업비밀).
  const buildReason = (code, signal) => {
    // 원문(llama-server 스택)만 보내면 사용자가 원인을 알 수 없다 → 해석을 앞에 붙여 보낸다.
    if (errLines.length) return maskInternalNames(explainLlmError(errLines.slice(-3).join(' / ')));
    if (signal) return `프로세스가 강제 종료됨(${signal}) — 메모리 부족(VRAM/RAM)일 수 있습니다.`;
    if (recent.length) return maskInternalNames(recent.slice(-3).join(' / '));
    return `생성 프로세스가 종료됨(code=${code})`;
  };

  child.stdout.on('data', handle);
  child.stderr.on('data', handle);
  child.on('exit', (code, signal) => {
    child = null;
    // 성공 폴더를 기억 — 웹 /allinone/manifest·file·list 가 이 폴더를 읽는다.
    if (code === 0) { try { store?.set('lastAllinoneFolder', folder); } catch { /* skip */ } }
    // ★ [검수준비완료] 마커는 **누끼할 대표컷이 있을 때만** 나온다 — 과일·음식 배치처럼
    //   누끼를 통째로 건너뛰면 한 번도 안 나온다. 그때도 검수는 시작할 수 있어야 하므로
    //   정상 종료를 준비완료로 본다. "성공하면 반드시 한 번은 발화"가 이 콜백의 계약이다.
    if (code === 0 && !reviewReady) {
      reviewReady = true;
      send('allinone:review-ready', { folder });
      try { onReviewReady?.(folder); } catch { /* 화면 열기 실패는 결과를 무효화하지 않는다 */ }
    }
    const reason = code === 0 ? null : buildReason(code, signal);
    if (reason) send('allinone:log', `❌ 생성 실패: ${reason}`);
    onDone?.(code, reason);
    freeEngines();
    send('allinone:done', { code, reason });
  });
  child.on('error', (e) => {
    child = null;
    const reason = '실행 오류: ' + e.message;
    send('allinone:log', reason);
    onDone?.(-1, reason);
    freeEngines();
    send('allinone:done', { code: -1, reason });
  });
  return true;
}

/**
 * 엔진 유휴 게이트 — main.mjs 가 시작할 때 한 번 꽂는다.
 * ★ 왜 여기서 주입받나: startGeneration 은 두 곳(웹 통로 main.mjs, 앱 탭 modules/allinone)
 *   에서 불린다. 호출부마다 붙이면 한쪽을 빠뜨렸을 때 **엔진이 영영 안 내려간다** —
 *   빠뜨려도 티가 안 나는 종류의 실수라, 붙잡고 놓는 자리를 여기 한 곳으로 모은다.
 */
let engineGate = null;
export function setEngineGate(g) { engineGate = g; }
const holdEngines = () => { try { engineGate?.hold('allinone'); } catch { /* ignore */ } };
const freeEngines = () => { try { engineGate?.release('allinone'); } catch { /* ignore */ } };

export function stopGeneration() {
  if (child) { try { child.kill(); } catch { /* skip */ } child = null; }
}
