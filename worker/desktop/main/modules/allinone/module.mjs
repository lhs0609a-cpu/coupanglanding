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
        // VRAM 부족으로 수십 분~수시간이 걸릴 상황이면 시작 전에 물어본다.
        //   (웹 경로는 이 훅이 없어 경고만 남기고 진행 — 브라우저에 모달을 띄울 수 없다)
        confirmSlow: async ({ products, etaText, fastText, freeGb }) => {
          const r = await ctx.dialog.showMessageBox({
            type: 'warning',
            buttons: ['그래도 계속', '취소'],
            defaultId: 1,
            cancelId: 1,
            title: '생성이 매우 느려집니다',
            message: `지금 시작하면 ${etaText} 걸립니다 (상품 ${products}개)`,
            detail:
              `사용 가능한 VRAM 이 ${freeGb}GB 뿐이라 AI 모델이 그래픽카드에 올라가지 못하고 CPU 로 처리됩니다.\n\n`
              + `다른 AI 프로그램(ComfyUI·음악/영상 생성 등)이나 무거운 앱을 닫고 다시 시작하면 `
              + `${fastText} 로 끝납니다.`,
          });
          return r.response === 0;
        },
        // 앱에서 시작한 생성 — 완료되면 웹 검수화면을 자동으로 연다(앱↔웹 왕복 제거).
        onDone: (code) => {
          if (code !== 0) return;
          try {
            const origin = ctx.services?.webOrigin || 'https://www.megaload.co.kr';
            // 크롬으로 연다(기본 브라우저엔 로그인 세션이 없어 검수화면 대신 로그인이 뜬다).
            ctx.openUrl(`${origin}/megaload/products/allinone`);
          } catch { /* 브라우저 열기 실패는 치명적 아님 — 결과는 이미 저장됨 */ }
        },
      });
    },
    'allinone:stop': () => { stopGeneration(); return true; },
    'allinone:open-folder': (ctx, { folder } = {}) => { if (folder) ctx.shell.openPath(folder); return true; },
  },
  onQuit: () => { stopGeneration(); },
};
