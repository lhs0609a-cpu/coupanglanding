// 썸네일 GPU 모듈 — ComfyUI 엔진 설치 + 누끼/재생성 워커 실행.
// 서비스(comfy/runner/bootstrap)는 셸이 ctx.services 로 주입. 무거운 엔진은 이 탭을 쓸 때만 설치.
export default {
  id: 'thumbnail-gpu',
  label: 'AI 썸네일',
  icon: '🖼️',
  order: 2,
  events: [
    'thumbnail-gpu:install-progress',
    'thumbnail-gpu:worker-event',
    'thumbnail-gpu:comfy-log',
    'thumbnail-gpu:auto-started',
  ],
  trayItems: (ctx) =>
    ctx.services.runner.running
      ? [{ label: 'AI 썸네일 정지', click: () => ctx.services.stopWorker().catch(() => {}) }]
      : [{ label: 'AI 썸네일 시작', click: () => ctx.services.startWorker().catch(() => {}) }],
  ipc: {
    'thumbnail-gpu:state': async (ctx) => ({
      installed: await ctx.services.bootstrap.isInstalled(ctx.services.installDir),
      comfyRunning: await ctx.services.comfy.isUp(),
      running: ctx.services.runner.running,
      loggedIn: ctx.services.runner.loggedIn,
      stats: ctx.services.stats,
    }),
    'thumbnail-gpu:gpu-check': (ctx) => ctx.services.bootstrap.checkGpu(),
    'thumbnail-gpu:install': async (ctx) => { await ctx.services.installEngine(); return true; },
    'thumbnail-gpu:start': async (ctx) => { await ctx.services.startWorker(); return true; },
    'thumbnail-gpu:stop': async (ctx) => { await ctx.services.stopWorker(); return true; },
  },
};
