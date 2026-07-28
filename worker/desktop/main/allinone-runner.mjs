// 올인원 생성 실행 코어 — run-folder.mjs 를 스폰하고 진행을 스트리밍한다.
//   두 진입점이 공유한다:
//   ① 앱 모듈(modules/allinone) — 네이티브 폴더창으로 고른 경로를 생성(경로 직독).
//   ② pair-server /allinone/generate — 웹이 업로드한 임시폴더를 생성(웹 주도).
// ⚠️ ollama(텍스트)·ComfyUI(누끼)가 떠 있어야 함(services 로 자동 기동).
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkGpu } from './bootstrap.mjs';
import { listModels } from '../runtime/local-llm.mjs';

let child = null;

/**
 * 하드웨어에 맞춰 "어떤 PC 에서도 빠르게" 생성 설정을 고른다.
 *   ⭐ 판단 기준은 총 VRAM 이 아니라 **"지금 남은(free) VRAM"** 이다.
 *      16GB GPU 라도 다른 앱(브라우저·다른 AI 도구 등)이 VRAM 을 점유 중이면 7.8B(≈5GB)를
 *      GPU 에 못 올려 CPU 로 스필 → 10배 넘게 느려진다(실측: 남은 0.8GB일 때 3tok/s).
 *      그래서 지금 올릴 수 있는 크기에 맞춰 모델을 고른다.
 *   - free ≥ 5GB : 7.8B + 상세 600 (품질 유지 + 병렬로 빠르게)
 *   - 그 외      : 2.4B + 상세 400 (작아서 빠듯한 VRAM 에도 최대한 GPU 에 올라감)
 * (짧은 필드 3종 병렬화는 ai-generator 에서 하드웨어와 무관하게 항상 적용됨.)
 */
export async function pickGenProfile() {
  const gpu = await checkGpu().catch(() => ({ ok: false, name: null, vramMb: 0, vramFreeMb: 0 }));
  const freeMb = gpu.vramFreeMb ?? 0;
  const strong = gpu.ok && freeMb >= 5000;
  // 남은 VRAM 이 극히 적으면(다른 프로그램이 GPU 점유) 작은 모델조차 스필한다 → 사용자에게 알린다.
  const scarce = gpu.ok && freeMb < 1500;

  // ⭐ 설치된 모델 중에서 고른다 — 없는 모델을 pull 하다 실패/지연(→ fetch failed)하는 걸 피한다.
  //   티어별 선호순으로, 이미 깔린 첫 모델을 쓴다. 하나도 없으면 대표값(그때만 pull).
  let installed = [];
  try { installed = await listModels(); } catch { /* ollama 아직 미기동 → 기본값 */ }
  const STRONG_PREFS = ['exaone3.5:7.8b', 'qwen2.5:7b-instruct', 'qwen2.5:7b'];
  const SMALL_PREFS = ['qwen2.5:3b-instruct', 'exaone3.5:2.4b', 'qwen2.5:3b', 'exaone3.5:7.8b'];
  const prefs = strong ? STRONG_PREFS : SMALL_PREFS;
  const model = prefs.find((n) => installed.some((m) => m === n)) || prefs[0];

  // ⚡ 동시 생성 개수 — 단일 GPU 라도 ollama 는 여러 요청을 한 배치로 디코딩한다.
  //    상품 1개씩 순차로 돌리면 GPU 가 놀아서(디코딩은 메모리 대역폭 병목) 처리량이 크게 손해다.
  //    다만 동시 요청마다 KV 캐시가 따로 필요하니 **모델을 올리고 남는 VRAM** 만큼만 늘린다.
  //      free ≥ 11GB → 3개 / ≥ 8GB → 2개 / 그 외 → 1개(예전과 동일 = 안전)
  //    ollama 쪽 OLLAMA_NUM_PARALLEL 도 같은 값으로 맞춰야 실제로 동시에 돈다(아니면 큐잉).
  const concurrency = freeMb >= 11000 ? 3 : freeMb >= 8000 ? 2 : 1;

  return { gpu, strong, scarce, model, detailTokens: strong ? 600 : 400, concurrency, installedCount: installed.length };
}

export function isGenerating() { return !!child; }

// ── 예상 소요시간 ────────────────────────────────────────────────────────────
//   실측 기준(RTX 4060 Ti):
//     · GPU 적재 정상 : 상품당 약 60초 (인식 22초 + 텍스트/이미지)
//     · VRAM 부족     : 상품당 약 6분  (실측 인식만 2분14초/7분39초/4분38초 — 비전 7B 가
//                                      GPU 에 못 올라가 CPU 로 돈다)
//   여유 VRAM 이 비전 모델(약 5.7GB)을 못 담으면 "느린 모드"로 본다.
const SEC_PER_PRODUCT_GPU = 60;
const SEC_PER_PRODUCT_CPU = 360;
const VISION_VRAM_MB = 5700;

/** 폴더의 product_* 개수 — 예상 시간 계산용(스캔 실패해도 생성은 진행). */
function countProducts(folder) {
  try {
    return readdirSync(folder, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^product_/i.test(d.name)).length;
  } catch { return 0; }
}

/** 사람이 읽는 소요시간 */
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
  const per = degraded ? SEC_PER_PRODUCT_CPU : SEC_PER_PRODUCT_GPU;
  const etaSec = Math.max(1, products) * per;
  return { products, degraded, etaSec, etaText: humanMin(etaSec), freeMb };
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
}) {
  if (!folder) throw new Error('폴더가 지정되지 않았습니다.');
  if (child) throw new Error('이미 생성이 진행 중입니다.');

  // ── 하드웨어 자동 적응 — "어떤 PC 에서도 빠르게" ──────────────────────────
  //   GPU 감지해 모델/상세토큰을 자동 선택하고, ollama 가 그 모델을 갖도록(없으면 pull) 맞춘다.
  const profile = await pickGenProfile();
  const gb = (mb) => (Math.round(((mb || 0) / 1024) * 10) / 10);
  send('allinone:log',
    `[속도] 하드웨어: ${profile.gpu.ok
      ? `${profile.gpu.name} · VRAM 남음 ${gb(profile.gpu.vramFreeMb)}/${gb(profile.gpu.vramMb)}GB`
      : 'GPU 없음(CPU)'} `
    + `→ 모델 ${profile.model} · 상세 ${profile.detailTokens}토큰 · 상품 동시 ${profile.concurrency}개 (짧은필드 병렬)`);
  // ── 예상 소요시간 안내 ─────────────────────────────────────────────────────
  //   "얼마나 걸릴지"를 안 알려주면 느린 실행이 고장으로 보인다(실측 문의: VRAM 0.6GB 상태에서
  //   인식 1건에 2~8분 걸리자 "생성이 안 된다"고 판단). 시작 전에 숫자로 말한다.
  const est = estimateGeneration(folder, profile);
  const fast = humanMin(Math.max(1, est.products) * SEC_PER_PRODUCT_GPU);
  send('allinone:log',
    `[예상] 상품 ${est.products}개 · ${est.etaText} 소요 예상`
    + (est.degraded ? ` (VRAM 부족으로 CPU 처리 — 정상이면 ${fast})` : ''));
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
        send('allinone:done', { code: 0, canceled: true });
        return false;
      }
    }
  }
  if (services?.ollama) services.ollama.model = profile.model; // ensureModel 이 이 모델을 pull/확인

  // 엔진 자동 기동 — ollama 는 없으면 자동 설치·기동·모델 다운로드까지.
  try {
    send('allinone:log', '엔진 준비 중 — ollama(텍스트 생성)…');
    await services?.ollama?.start();
  } catch (e) {
    send('allinone:log', '❌ ollama 준비 실패: ' + (e.message || e));
    onDone?.(-1);
    send('allinone:done', { code: -1 });
    return false;
  }
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
  const args = [
    script, folder,
    '--model', profile.model,
    '--detail-tokens', String(profile.detailTokens),
    '--concurrency', String(profile.concurrency),
  ];
  if (noThumb) args.push('--no-thumb');
  if (useComfySwap) args.push('--wait-comfy'); // 누끼 전에 ComfyUI 기동을 기다리게

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
      let m;
      if ((m = line.match(/\[인식\s+(\d+)\/(\d+)\]/))) emitProgress({ phase: 'recognize', done: +m[1], total: +m[2] });
      else if ((m = line.match(/\[텍스트\s+(\d+)\/(\d+)\]/))) emitProgress({ phase: 'text', done: +m[1], total: +m[2] });
      else if ((m = line.match(/\[이미지\s+(\d+)\/(\d+)\]/))) emitProgress({ phase: 'image', done: +m[1], total: +m[2] });
    }
  };
  // 실패 사유 요약 — 에러 라인 우선, 없으면 최근 몇 줄, 그것도 없으면 종료코드/시그널.
  const buildReason = (code, signal) => {
    if (errLines.length) return errLines.slice(-3).join(' / ');
    if (signal) return `프로세스가 강제 종료됨(${signal}) — 메모리 부족(VRAM/RAM)일 수 있습니다.`;
    if (recent.length) return recent.slice(-3).join(' / ');
    return `생성 프로세스가 종료됨(code=${code})`;
  };

  child.stdout.on('data', handle);
  child.stderr.on('data', handle);
  child.on('exit', (code, signal) => {
    child = null;
    // 성공 폴더를 기억 — 웹 /allinone/manifest·file·list 가 이 폴더를 읽는다.
    if (code === 0) { try { store?.set('lastAllinoneFolder', folder); } catch { /* skip */ } }
    const reason = code === 0 ? null : buildReason(code, signal);
    if (reason) send('allinone:log', `❌ 생성 실패: ${reason}`);
    onDone?.(code, reason);
    send('allinone:done', { code, reason });
  });
  child.on('error', (e) => {
    child = null;
    const reason = '실행 오류: ' + e.message;
    send('allinone:log', reason);
    onDone?.(-1, reason);
    send('allinone:done', { code: -1, reason });
  });
  return true;
}

export function stopGeneration() {
  if (child) { try { child.kill(); } catch { /* skip */ } child = null; }
}
