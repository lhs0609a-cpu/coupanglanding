import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.mjs';
import { ComfyManager } from './comfy-manager.mjs';
import { WorkerRunner } from './worker-runner.mjs';
import * as bootstrap from './bootstrap.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');
const DEFAULT_WORKFLOW = join(appRoot, 'runtime', 'workflows', 'sdxl-inpaint-thumbnail.example.json');

let win = null;
let tray = null;
let store, comfy, runner;
let installDir, comfyPort;
const stats = { processed: 0, ok: 0, fail: 0, current: null };

const single = app.requestSingleInstanceLock();
if (!single) app.quit();

function send(channel, payload) { win?.webContents.send(channel, payload); }

function setupServices() {
  const userData = app.getPath('userData');
  store = new Store(userData);
  installDir = join(userData, 'engine');
  comfyPort = store.get('comfyPort', 8188);
  comfy = new ComfyManager(installDir, { port: comfyPort, onLog: (m) => send('comfy:log', m) });
  runner = new WorkerRunner(userData, { onEvent: onWorkerEvent });
}

function onWorkerEvent(e) {
  if (e.type === 'claimed') stats.current = e.label;
  if (e.type === 'done') { stats.ok = e.ok; stats.processed = e.processed; stats.current = null; }
  if (e.type === 'error') { stats.fail = e.fail; stats.processed = e.processed; stats.current = null; }
  if (e.type === 'finished') stats.current = null;
  send('worker:event', e);
  updateTray();
}

function createWindow() {
  win = new BrowserWindow({
    width: 520, height: 680, resizable: true,
    title: '쿠팡 썸네일 워커',
    webPreferences: {
      preload: join(here, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.removeMenu();
  win.loadFile(join(appRoot, 'renderer', 'index.html'));
  win.on('close', (e) => {           // 닫기 → 트레이로 최소화 (백그라운드 유지)
    if (!app.isQuitting) { e.preventDefault(); win.hide(); }
  });
}

function trayIcon() {
  // 간단한 단색 아이콘 (별도 에셋 없이 동작)
  const img = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAQUlEQVR4nGNgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKBgFAFb4AAGcm5pVAAAAAElFTkSuQmCC',
  );
  return img;
}

function updateTray() {
  if (!tray) return;
  const status = runner?.running ? `실행 중 (성공 ${stats.ok}/${stats.processed})` : '정지됨';
  tray.setToolTip(`쿠팡 썸네일 워커 — ${status}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '창 열기', click: () => { win.show(); } },
    { type: 'separator' },
    runner?.running
      ? { label: '워커 정지', click: () => stopWorker() }
      : { label: '워커 시작', click: () => startWorker().catch(() => {}) },
    { type: 'separator' },
    { label: '종료', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
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

async function stopWorker() {
  await runner.stop();
  updateTray();
}

// ── IPC ───────────────────────────────────────────────────
function registerIpc() {
  ipcMain.handle('state:get', async () => ({
    installed: await bootstrap.isInstalled(installDir),
    comfyRunning: await comfy.isUp(),
    loggedIn: runner.loggedIn,
    running: runner.running,
    stats,
    settings: {
      supabaseUrl: store.get('supabaseUrl', ''),
      anonKey: store.get('anonKey', ''),
      email: store.get('email', ''),
      comfyArchiveUrl: store.get('comfyArchiveUrl', bootstrap.DEFAULTS.comfyArchiveUrl),
      modelUrl: store.get('modelUrl', bootstrap.DEFAULTS.modelUrl),
    },
  }));

  ipcMain.handle('gpu:check', () => bootstrap.checkGpu());

  ipcMain.handle('settings:save', (_e, patch) => { store.merge(patch); return true; });

  ipcMain.handle('install:start', async () => {
    await bootstrap.install({
      installDir,
      urls: {
        comfyArchiveUrl: store.get('comfyArchiveUrl', bootstrap.DEFAULTS.comfyArchiveUrl),
        modelUrl: store.get('modelUrl', bootstrap.DEFAULTS.modelUrl),
      },
      onProgress: (p) => send('install:progress', p),
    });
    return true;
  });

  ipcMain.handle('auth:login', async (_e, { supabaseUrl, anonKey, email, password }) => {
    await runner.login(supabaseUrl, anonKey, email, password);
    store.merge({ supabaseUrl, anonKey, email });   // 비밀번호는 저장 안 함 (.session.json 토큰만 캐시)
    return true;
  });

  ipcMain.handle('worker:start', async () => { await startWorker(); return true; });
  ipcMain.handle('worker:stop', async () => { await stopWorker(); return true; });
  ipcMain.handle('comfy:stop', async () => { await comfy.stop(); return true; });
  ipcMain.handle('logs:openData', () => shell.openPath(app.getPath('userData')));
}

app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

app.whenReady().then(async () => {
  setupServices();
  registerIpc();
  createWindow();
  tray = new Tray(trayIcon());
  updateTray();
  // 저장된 세션 자동 복구
  await runner.tryRestoreSession(store.get('supabaseUrl'), store.get('anonKey'));
});

app.on('before-quit', async (e) => {
  if (app.isQuitting) return;
  app.isQuitting = true;
  e.preventDefault();
  try { await stopWorker(); await comfy.stop(); } catch { /* ignore */ }
  app.quit();
});

app.on('window-all-closed', () => { /* 트레이 상주 — 종료 안 함 */ });
