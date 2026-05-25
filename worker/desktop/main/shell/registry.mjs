// ============================================================
// 모듈 레지스트리 — main/modules/<id>/module.mjs 를 자동 발견·등록.
//   파일 하나를 떨어뜨리면 탭이 자동 생기고 같은 설치본/자동업데이트에 포함된다.
//   (= 미래 프로그램 자동 탑재. 통합 도우미의 핵심)
//
// 모듈 계약(default export):
//   { id, label, icon?, order?, ipc?:{'<id>:채널':(ctx,payload)=>}, events?:[],
//     trayItems?(ctx):[{label,click}], setup?(ctx), onQuit?(ctx) }
// ============================================================
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const MODULES_DIR = join(here, '..', 'modules');

/** modules/ 폴더의 모든 module.mjs 로드 + ctx 에 ipc/setup/tray 등록 */
export async function loadModules(ctx) {
  let ids = [];
  try {
    ids = readdirSync(MODULES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name);
  } catch { ids = []; }

  const modules = [];
  for (const id of ids) {
    try {
      const url = pathToFileURL(join(MODULES_DIR, id, 'module.mjs')).href;
      const mod = (await import(url)).default;
      if (mod && mod.id) modules.push(mod);
    } catch (e) {
      ctx.log('shell', `모듈 로드 실패 [${id}]: ${e.message}`);
    }
  }
  modules.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  const invokable = new Set();
  const events = new Set();
  const trayContribs = [];

  for (const mod of modules) {
    if (mod.ipc) {
      for (const [channel, handler] of Object.entries(mod.ipc)) {
        ctx.ipcMain.handle(channel, (_e, payload) => handler(ctx, payload));
        invokable.add(channel);
      }
    }
    (mod.events || []).forEach((e) => events.add(e));
    if (typeof mod.trayItems === 'function') trayContribs.push(mod.trayItems);
    if (typeof mod.setup === 'function') {
      try { await mod.setup(ctx); }
      catch (e) { ctx.log('shell', `setup 실패 [${mod.id}]: ${e.message}`); }
    }
  }

  const manifest = {
    modules: modules.map((m) => ({ id: m.id, label: m.label, icon: m.icon || '📦' })),
    invokable: [...invokable],
    events: [...events],
  };
  return { modules, manifest, trayContribs };
}
