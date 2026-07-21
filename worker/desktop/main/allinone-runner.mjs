// 올인원 생성 실행 코어 — run-folder.mjs 를 스폰하고 진행을 스트리밍한다.
//   두 진입점이 공유한다:
//   ① 앱 모듈(modules/allinone) — 네이티브 폴더창으로 고른 경로를 생성(경로 직독).
//   ② pair-server /allinone/generate — 웹이 업로드한 임시폴더를 생성(웹 주도).
// ⚠️ ollama(텍스트)·ComfyUI(누끼)가 떠 있어야 함(services 로 자동 기동).
import { spawn } from 'node:child_process';
import { join } from 'node:path';

let child = null;

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
  const args = [script, folder];
  if (noThumb) args.push('--no-thumb');

  child = spawn(process.execPath, args, {
    cwd: runtimeDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      MEGALOAD_HF_CACHE: join(paths.userData, 'hf-cache'),
    },
  });

  // 진행 이벤트를 앱 렌더러(send)와 호출자(onProgress: 웹 폴링용 pair-server)로 동시에 흘린다.
  const emitProgress = (p) => { send('allinone:progress', p); try { onProgress?.(p); } catch { /* skip */ } };
  const handle = (buf) => {
    for (const line of buf.toString('utf-8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      send('allinone:log', line);
      let m;
      if ((m = line.match(/\[인식\s+(\d+)\/(\d+)\]/))) emitProgress({ phase: 'recognize', done: +m[1], total: +m[2] });
      else if ((m = line.match(/\[텍스트\s+(\d+)\/(\d+)\]/))) emitProgress({ phase: 'text', done: +m[1], total: +m[2] });
      else if ((m = line.match(/\[이미지\s+(\d+)\/(\d+)\]/))) emitProgress({ phase: 'image', done: +m[1], total: +m[2] });
    }
  };
  child.stdout.on('data', handle);
  child.stderr.on('data', handle);
  child.on('exit', (code) => {
    child = null;
    // 성공 폴더를 기억 — 웹 /allinone/manifest·file·list 가 이 폴더를 읽는다.
    if (code === 0) { try { store?.set('lastAllinoneFolder', folder); } catch { /* skip */ } }
    onDone?.(code);
    send('allinone:done', { code });
  });
  child.on('error', (e) => {
    child = null;
    send('allinone:log', '실행 오류: ' + e.message);
    onDone?.(-1);
    send('allinone:done', { code: -1 });
  });
  return true;
}

export function stopGeneration() {
  if (child) { try { child.kill(); } catch { /* skip */ } child = null; }
}
