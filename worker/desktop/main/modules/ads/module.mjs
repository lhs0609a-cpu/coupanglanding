// 광고 자동화 모듈 (베타) — 쿠팡 윙 DOM 직접 조작. ad-runner 는 셸이 ctx.services.ads 로 주입.
import { join } from 'node:path';

export default {
  id: 'ads',
  label: '광고 자동화',
  icon: '📢',
  order: 3,
  events: ['ads:event'],
  ipc: {
    'ads:verify': async (ctx) => { await ctx.services.ads.verify(); return true; },
    'ads:run-once': async (ctx) => { await ctx.services.ads.runOnce(); return true; },
    'ads:start': async (ctx) => { await ctx.services.ads.start(); return true; },
    'ads:stop': async (ctx) => { ctx.services.ads.stop(); return true; },
    // 부팅 자동 실행 on/off 저장 — 켜면 다음 실행부터 로그인+활성규칙 조건에서 스케줄이 자동 시작.
    'ads:set-auto': async (ctx, payload) => {
      const on = !!payload?.on;
      ctx.store.set('adsAutoRun', on);
      if (on) { ctx.services.ads.autoStart?.().catch(() => {}); }
      else { ctx.services.ads.stop(); }
      return on;
    },
    'ads:get-auto': async (ctx) => ctx.store.get('adsAutoRun', false),
    'ads:capture-open': async (ctx) => { await ctx.services.ads.openCapture(); return true; },
    'ads:capture-save': async (ctx) => {
      const fp = join(ctx.paths.userData, 'wing-capture.html');
      await ctx.services.ads.saveCaptureHtml(fp);
      ctx.shell.showItemInFolder(fp);
      return fp;
    },
  },
};
