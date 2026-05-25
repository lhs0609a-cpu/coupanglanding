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
    'ads:capture-open': async (ctx) => { await ctx.services.ads.openCapture(); return true; },
    'ads:capture-save': async (ctx) => {
      const fp = join(ctx.paths.userData, 'wing-capture.html');
      await ctx.services.ads.saveCaptureHtml(fp);
      ctx.shell.showItemInFolder(fp);
      return fp;
    },
  },
};
