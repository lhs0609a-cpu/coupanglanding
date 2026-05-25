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
    'allinone:run': (ctx, { folder, noThumb } = {}) => {
      if (!folder) throw new Error('폴더를 먼저 선택하세요.');
      if (child) throw new Error('이미 생성이 진행 중입니다.');
      // run-folder.mjs 는 worker/ 루트(=앱 appRoot 의 상위). 상대 import(./lib)가 풀리도록 cwd 도 거기로.
      const workerRoot = join(ctx.paths.appRoot, '..');
      const script = join(workerRoot, 'run-folder.mjs');
      const args = [script, folder];
      if (noThumb) args.push('--no-thumb');

      child = spawn(process.execPath, args, {
        cwd: workerRoot,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      });

      const handle = (buf) => {
        for (const line of buf.toString('utf-8').split(/\r?\n/)) {
          if (!line.trim()) continue;
          ctx.send('allinone:log', line);
          let m;
          if ((m = line.match(/\[텍스트\s+(\d+)\/(\d+)\]/))) ctx.send('allinone:progress', { phase: 'text', done: +m[1], total: +m[2] });
          else if ((m = line.match(/\[이미지\s+(\d+)\/(\d+)\]/))) ctx.send('allinone:progress', { phase: 'image', done: +m[1], total: +m[2] });
        }
      };
      child.stdout.on('data', handle);
      child.stderr.on('data', handle);
      child.on('exit', (code) => { child = null; ctx.send('allinone:done', { code }); });
      child.on('error', (e) => { child = null; ctx.send('allinone:log', '실행 오류: ' + e.message); ctx.send('allinone:done', { code: -1 }); });
      return true;
    },
    'allinone:stop': () => { if (child) { try { child.kill(); } catch { /* skip */ } child = null; } return true; },
    'allinone:open-folder': (ctx, { folder } = {}) => { if (folder) ctx.shell.openPath(folder); return true; },
  },
  onQuit: () => { if (child) { try { child.kill(); } catch { /* skip */ } } },
};
