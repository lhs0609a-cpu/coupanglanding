// ============================================================
// 메가로드 도우미 — 통합 데스크탑 셸
//   셸이 단일인스턴스·창·트레이·자동업데이트·로그인(페어링)을 담당하고,
//   기능은 main/modules/<id>/module.mjs 플러그인으로 자동 탑재된다.
//   (미래 프로그램도 모듈 파일만 추가하면 같은 설치본/자동업데이트로 따라 들어옴)
// ============================================================
import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { Store } from './store.mjs';
import { ComfyManager } from './comfy-manager.mjs';
import { WorkerRunner } from './worker-runner.mjs';
import { AdRunner } from './ad-runner.mjs';
import { startPairServer } from './pair-server.mjs';
import * as bootstrap from './bootstrap.mjs';
import { setupAutoUpdate } from './auto-update.mjs';
import { loadModules } from './shell/registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');
const DEFAULT_WORKFLOW = join(appRoot, 'runtime', 'workflows', 'sdxl-inpaint-thumbnail.example.json');

// ── 임베드 설정 (공개키 — 사용자 입력 불필요) ─────────────────────────
const SUPABASE_URL = 'https://dwfhcshvkxyokvtbgluw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3Zmhjc2h2a3h5b2t2dGJnbHV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MzExODEsImV4cCI6MjA4ODAwNzE4MX0.i4WbW-k6oaHX-LqJ2VDd14RAK-g8C9a5bHVEkwF1GPM';
const WEB_ORIGIN = 'https://www.megaload.co.kr';
const APP_TITLE = '메가로드 도우미';

let win = null;
let tray = null;
let store, comfy, runner, pair, ads;
let installDir, comfyPort;
let trayContribs = [];
const stats = { processed: 0, ok: 0, fail: 0, current: null };

const single = app.requestSingleInstanceLock();
if (!single) app.quit();

function send(channel, payload) { win?.webContents.send(channel, payload); }
function log(scope, message) { send('thumbnail-gpu:comfy-log', `[${scope}] ${message}`); }

// ── 썸네일 워커 헬퍼 (모듈이 ctx.services 로 호출) ──
function onWorkerEvent(e) {
  if (e.type === 'claimed') stats.current = e.label;
  if (e.type === 'done') { stats.ok = e.ok; stats.processed = e.processed; stats.current = null; }
  if (e.type === 'error') { stats.fail = e.fail; stats.processed = e.processed; stats.current = null; }
  if (e.type === 'finished') stats.current = null;
  send('thumbnail-gpu:worker-event', e);
  updateTray();
}
async function startWorker() {
  if (!(await bootstrap.isInstalled(installDir))) throw new Error('엔진이 아직 설치되지 않았습니다.');
  await comfy.start();
  await runner.start({
    comfyUrl: comfy.url,
    workflowPath: store.get('workflowPath', DEFAULT_WORKFLOW),
    positivePrompt: store.get('positivePrompt'),
    negativePrompt: store.get('negativePrompt'),
    timeoutSec: store.get('timeoutSec', 300),
    pollSec: store.get('pollSec', 5),
  });
  updateTray();
}
async function stopWorker() { await runner.stop(); updateTray(); }
async function installEngine() {
  await bootstrap.install({
    installDir,
    urls: {
      comfyArchiveUrl: store.get('comfyArchiveUrl', bootstrap.DEFAULTS.comfyArchiveUrl),
      modelUrl: store.get('modelUrl', bootstrap.DEFAULTS.modelUrl),
    },
    onProgress: (p) => send('thumbnail-gpu:install-progress', p),
  });
  autoStartIfReady();
}
async function autoStartIfReady() {
  try {
    if (runner.running || !runner.loggedIn) return;
    if (!(await bootstrap.isInstalled(installDir))) return;
    await startWorker();
    send('thumbnail-gpu:auto-started', true);
  } catch (e) {
    send('thumbnail-gpu:auto-started', false);
    log('auto', '자동 시작 실패: ' + (e.message || e));
  }
}

function setupServices() {
  const userData = app.getPath('userData');
  store = new Store(userData);
  installDir = join(userData, 'engine');
  comfyPort = store.get('comfyPort', 8188);
  comfy = new ComfyManager(installDir, { port: comfyPort, onLog: (m) => send('thumbnail-gpu:comfy-log', m) });
  runner = new WorkerRunner(userData, { onEvent: onWorkerEvent });
  ads = new AdRunner({ getSession: () => runner.session, onEvent: (e) => send('ads:event', e) });
}

function buildContext() {
  return {
    app, ipcMain, shell, dialog,
    paths: { userData: app.getPath('userData'), appRoot },
    store, send, log,
    services: {
      comfy, runner, ads, bootstrap,
      installDir, stats,
      startWorker, stopWorker, installEngine, autoStartIfReady,
      pair: () => pair, webOrigin: WEB_ORIGIN,
    },
  };
}

function createWindow() {
  win = new BrowserWindow({
    width: 560, height: 680, resizable: true,
    title: APP_TITLE,
    webPreferences: { preload: join(here, 'preload.mjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.removeMenu();
  win.loadFile(join(appRoot, 'renderer', 'index.html'));
  win.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
}

function trayIcon() {
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAQUlEQVR4nGNgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKBgFAFb4AAGcm5pVAAAAAElFTkSuQmCC',
  );
}

function updateTray() {
  if (!tray) return;
  const status = runner?.running ? `실행 중 (성공 ${stats.ok}/${stats.processed})` : '대기 중';
  tray.setToolTip(`${APP_TITLE} — ${status}`);
  const ctx = buildContext();
  const moduleItems = [];
  for (const fn of trayContribs) {
    try { moduleItems.push(...(fn(ctx) || [])); } catch { /* skip */ }
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '창 열기', click: () => { win.show(); } },
    ...(moduleItems.length ? [{ type: 'separator' }, ...moduleItems] : []),
    { type: 'separator' },
    { label: '종료', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

function registerShellIpc(manifest) {
  // 렌더러 preload 가 sync 로 모듈/채널 목록을 가져감
  ipcMain.on('shell:manifest', (e) => { e.returnValue = manifest; });

  ipcMain.handle('shell:state', async () => ({
    loggedIn: runner.loggedIn,
    paired: !!pair && pair.isPaired(),
    webOrigin: WEB_ORIGIN,
    appTitle: APP_TITLE,
  }));
  ipcMain.handle('shell:pair-open', () => {
    if (!pair) throw new Error('페어링 서버 준비 안 됨');
    shell.openExternal(`${WEB_ORIGIN}/worker/activate?port=${pair.port}&nonce=${encodeURIComponent(pair.nonce)}`);
    return true;
  });
  ipcMain.handle('shell:open-data', () => shell.openPath(app.getPath('userData')));

  // 모듈 패널 자산(panel.html/panel.js) 을 IPC 로 읽어 렌더러에 전달 — file:// fetch 차단 회피.
  ipcMain.handle('shell:asset', (_e, { id, file } = {}) => {
    if (!/^[a-z0-9-]+$/i.test(id || '') || !/^[a-z0-9.]+$/i.test(file || '')) throw new Error('잘못된 자산 경로');
    return readFileSync(join(appRoot, 'renderer', 'modules', id, file), 'utf-8');
  });
}

app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

app.whenReady().then(async () => {
  setupServices();

  const ctx = buildContext();
  const { manifest, trayContribs: contribs } = await loadModules(ctx);
  trayContribs = contribs;
  // 셸 채널을 manifest 에 합쳐 preload allowlist 에 포함
  manifest.invokable.push('shell:state', 'shell:pair-open', 'shell:open-data', 'shell:asset');
  manifest.events.push('shell:pair-done');
  registerShellIpc(manifest);

  createWindow();
  tray = new Tray(trayIcon());
  updateTray();

  setupAutoUpdate({ getWindow: () => win });

  // 저장된 세션 자동 복구
  await runner.tryRestoreSession(SUPABASE_URL, SUPABASE_ANON_KEY);

  // 로컬 페어링 서버 (웹이 세션 토큰 전달)
  pair = await startPairServer({
    onPair: async (tokens) => {
      await runner.pair(SUPABASE_URL, SUPABASE_ANON_KEY, tokens);
      send('shell:pair-done', true);
      win?.show(); win?.focus();
      autoStartIfReady();
    },
  });

  autoStartIfReady();
});

app.on('before-quit', async (e) => {
  if (app.isQuitting) return;
  app.isQuitting = true;
  e.preventDefault();
  try { ads?.stop(); await stopWorker(); await comfy.stop(); await pair?.close(); } catch { /* ignore */ }
  app.quit();
});

app.on('window-all-closed', () => { /* 트레이 상주 */ });
