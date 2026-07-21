// 올인원 생성 실행 코어 — run-folder.mjs 를 스폰하고 진행을 스트리밍한다.
//   두 진입점이 공유한다:
//   ① 앱 모듈(modules/allinone) — 네이티브 폴더창으로 고른 경로를 생성(경로 직독).
//   ② pair-server /allinone/generate — 웹이 업로드한 임시폴더를 생성(웹 주도).
// ⚠️ ollama(텍스트)·ComfyUI(누끼)가 떠 있어야 함(services 로 자동 기동).
import { spawn } from 'node:child_process';
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

  return { gpu, strong, scarce, model, detailTokens: strong ? 600 : 400, installedCount: installed.length };
}

export function isGenerating() { return !!child; }

/**
 * 폴더 하나를 올인원 생성한다. 성공 시 lastAllinoneFolder 를 갱신해
 * 웹 /allinone/* 직독이 이 폴더의 결과를 읽게 한다.
 * @returns {Promise<boolean>} 시작됐으면 true(완료는 onDone 으로 통지)
 */
export async function startGeneration({
  services, paths, store, send, folder, noThumb = false, onDone, onProgress,
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
    + `→ 모델 ${profile.model} · 상세 ${profile.detailTokens}토큰 (짧은필드 병렬)`);
  if (profile.scarce) {
    send('allinone:log',
      `⚠️ 남은 VRAM 이 ${gb(profile.gpu.vramFreeMb)}GB 뿐입니다 — 다른 프로그램이 그래픽카드를 점유 중입니다. `
      + `AI 생성이 CPU 로 밀려 매우 느려집니다. 브라우저·다른 AI 도구 등 무거운 프로그램을 닫으면 몇 배 빨라집니다.`);
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
  if (!noThumb) {
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
  const args = [script, folder, '--model', profile.model, '--detail-tokens', String(profile.detailTokens)];
  if (noThumb) args.push('--no-thumb');

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

  // 진행 이벤트를 앱 렌더러(send)와 호출자(onProgress: 웹 폴링용 pair-server)로 동시에 흘린다.
  const emitProgress = (p) => { send('allinone:progress', p); try { onProgress?.(p); } catch { /* skip */ } };
  const handle = (buf) => {
    for (const line of buf.toString('utf-8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      send('allinone:log', line);
      pushBuf(recent, line, 40);
      if (/오류|error|exception|traceback|실패|OOM|out of memory|HTTP\s?[45]\d\d|❌/i.test(line)) pushBuf(errLines, line, 8);
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
