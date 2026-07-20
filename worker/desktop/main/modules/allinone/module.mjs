// 올인원 생성 모듈 — 앱 네이티브 폴더창으로 고른 경로를 생성한다(경로 직독, 복사 없음).
//   폴더 선택 → [텍스트 전체생성] → ollama 언로드 → [이미지 전체가공] → _allinone.generated.jsonl
//   완료 시 웹 검수화면을 자동으로 연다(웹은 도우미 결과를 자동 로드).
// ⚠️ 실제 생성 코어는 ../../allinone-runner.mjs (웹 업로드 생성과 공유).
import { startGeneration, stopGeneration } from '../../allinone-runner.mjs';

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
      return startGeneration({
        services: ctx.services,
        paths: ctx.paths,
        store: ctx.store,
        send: ctx.send,
        folder,
        noThumb: !!noThumb,
        // 앱에서 시작한 생성 — 완료되면 웹 검수화면을 자동으로 연다(앱↔웹 왕복 제거).
        onDone: (code) => {
          if (code !== 0) return;
          try {
            const origin = ctx.services?.webOrigin || 'https://www.megaload.co.kr';
            ctx.shell?.openExternal(`${origin}/megaload/products/allinone`);
          } catch { /* 브라우저 열기 실패는 치명적 아님 — 결과는 이미 저장됨 */ }
        },
      });
    },
    'allinone:stop': () => { stopGeneration(); return true; },
    'allinone:open-folder': (ctx, { folder } = {}) => { if (folder) ctx.shell.openPath(folder); return true; },
  },
  onQuit: () => { stopGeneration(); },
};
