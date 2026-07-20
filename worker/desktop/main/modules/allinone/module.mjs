// 올인원 생성 모듈 — run-folder.mjs 파이프라인을 앱에서 실행하고 진행을 실시간 스트리밍.
//   폴더 선택 → [텍스트 전체생성] → ollama 언로드 → [이미지 전체가공] → _allinone.generated.jsonl
//   생성이 끝나면 웹 "올인원 등록(폴더)" 에서 폴더를 불러와 검수·등록.
// ⚠️ ollama(텍스트) + ComfyUI(이미지)가 떠 있어야 함. dev(npm start)에서 worker/run-folder.mjs 를 실행.
import { spawn } from 'node:child_process';
import { join } from 'node:path';

let child = null;

export default {
  id: 'allinone',
  label: '올인원 생성',
  icon: '⚙️',
  order: 1,
  events: ['allinone:log', 'allinone:progress', 'allinone:done'],
  ipc: {
    'allinone:pick-folder': async (ctx) => {
      const r = await ctx.dialog.showOpenDialog({ properties: ['openDirectory'], title: '소싱 폴더 선택 (product_*/ 들을 담은 상위 폴더)' });
      return r.canceled ? null : r.filePaths[0];
    },
    'allinone:run': async (ctx, { folder, noThumb } = {}) => {
      if (!folder) throw new Error('폴더를 먼저 선택하세요.');
      if (child) throw new Error('이미 생성이 진행 중입니다.');

      // 엔진 자동 기동 — run-folder.mjs 는 ollama(텍스트)·ComfyUI(누끼) 가 떠 있어야 동작하므로
      // 스폰 전에 도우미가 보장한다. ollama 는 없으면 자동 설치·기동·모델 다운로드까지 한다.
      try {
        ctx.send('allinone:log', '엔진 준비 중 — ollama(텍스트 생성)…');
        await ctx.services.ollama?.start();
      } catch (e) {
        ctx.send('allinone:log', '❌ ollama 준비 실패: ' + (e.message || e));
        ctx.send('allinone:done', { code: -1 });
        return false;
      }
      if (!noThumb) {
        try {
          ctx.send('allinone:log', '엔진 준비 중 — ComfyUI(대표사진 누끼)…');
          await ctx.services.comfy?.start();
        } catch (e) {
          // 누끼 엔진 실패는 치명적이지 않음 — 텍스트만 진행(원본 사진 폴백).
          ctx.send('allinone:log', '⚠️ ComfyUI 준비 실패 — 누끼 없이 텍스트만 진행: ' + (e.message || e));
        }
      }

      // sync-runtime 가 runtime/ 에 복사한 run-folder.mjs 실행 (dev+packaged 모두 번들 포함).
      const runtimeDir = join(ctx.paths.appRoot, 'runtime');
      const script = join(runtimeDir, 'run-folder.mjs');
      const args = [script, folder];
      if (noThumb) args.push('--no-thumb');

      child = spawn(process.execPath, args, {
        cwd: runtimeDir,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          // CLIP(이미지인식) 모델 캐시 — BiRefNet 등과 같은 userData/hf-cache 공유(재다운로드 방지)
          MEGALOAD_HF_CACHE: join(ctx.paths.userData, 'hf-cache'),
        },
      });

      const handle = (buf) => {
        for (const line of buf.toString('utf-8').split(/\r?\n/)) {
          if (!line.trim()) continue;
          ctx.send('allinone:log', line);
          let m;
          if ((m = line.match(/\[인식\s+(\d+)\/(\d+)\]/))) ctx.send('allinone:progress', { phase: 'recognize', done: +m[1], total: +m[2] });
          else if ((m = line.match(/\[텍스트\s+(\d+)\/(\d+)\]/))) ctx.send('allinone:progress', { phase: 'text', done: +m[1], total: +m[2] });
          else if ((m = line.match(/\[이미지\s+(\d+)\/(\d+)\]/))) ctx.send('allinone:progress', { phase: 'image', done: +m[1], total: +m[2] });
        }
      };
      child.stdout.on('data', handle);
      child.stderr.on('data', handle);
      child.on('exit', (code) => {
        child = null;
        if (code === 0) {
          // 생성 성공한 폴더를 기억 — 웹 올인원 화면이 폴더를 다시 고르지 않고
          // localhost(pair-server /allinone/*)로 이 폴더의 결과를 바로 읽어간다.
          try { ctx.store?.set('lastAllinoneFolder', folder); } catch { /* skip */ }
          // ⭐ 완료 시 웹 검수화면을 자동으로 연다 — 사용자가 앱↔웹을 오가지 않게.
          //   웹은 마운트되며 도우미 로컬서버에서 이 결과를 자동 로드한다(버튼 클릭 불필요).
          try {
            const origin = ctx.services?.webOrigin || 'https://www.megaload.co.kr';
            ctx.shell?.openExternal(`${origin}/megaload/products/allinone`);
          } catch { /* 브라우저 열기 실패는 치명적 아님 — 결과는 이미 저장됨 */ }
        }
        ctx.send('allinone:done', { code });
      });
      child.on('error', (e) => { child = null; ctx.send('allinone:log', '실행 오류: ' + e.message); ctx.send('allinone:done', { code: -1 }); });
      return true;
    },
    'allinone:stop': () => { if (child) { try { child.kill(); } catch { /* skip */ } child = null; } return true; },
    'allinone:open-folder': (ctx, { folder } = {}) => { if (folder) ctx.shell.openPath(folder); return true; },
  },
  onQuit: () => { if (child) { try { child.kill(); } catch { /* skip */ } } },
};
