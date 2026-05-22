import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.mjs';
import { ComfyManager } from './comfy-manager.mjs';
import { WorkerRunner } from './worker-runner.mjs';
import { AdRunner } from './ad-runner.mjs';
import { startPairServer } from './pair-server.mjs';
import * as bootstrap from './bootstrap.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');
const DEFAULT_WORKFLOW = join(appRoot, 'runtime', 'workflows', 'sdxl-inpaint-thumbnail.example.json');

// ── 임베드 설정 (공개키 — 사용자 입력 불필요) ─────────────────────────
const SUPABASE_URL = 'https://dwfhcshvkxyokvtbgluw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3Zmhjc2h2a3h5b2t2dGJnbHV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MzExODEsImV4cCI6MjA4ODAwNzE4MX0.i4WbW-k6oaHX-LqJ2VDd14RAK-g8C9a5bHVEkwF1GPM';
const WEB_ORIGIN = 'https://www.megaload.co.kr';

let win = null;
let tray = null;
let store, comfy, runner, pair, ads;
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
  ads = new AdRunner({ getSession: () => runner.session, onEvent: (e) => send('ads:event', e) });
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
    width: 520, height: 620, resizable: true,
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
  win.on('close', (e) => {
    if (!app.isQuitting) { e.preventDefault(); win.hide(); }
  });
}

function trayIcon() {
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

async function autoStartIfReady() {
  try {
    if (runner.running) return;
    if (!runner.loggedIn) return;
    if (!(await bootstrap.isInstalled(installDir))) return;
    await startWorker();
    send('auto:started', true);
  } catch (e) {
    send('auto:started', false);
    send('comfy:log', '자동 시작 실패: ' + (e.message || e));
  }
}

// ── IPC ───────────────────────────────────────────────────
function registerIpc() {
  ipcMain.handle('state:get', async () => ({
    installed: await bootstrap.isInstalled(installDir),
    comfyRunning: await comfy.isUp(),
    loggedIn: runner.loggedIn,
    running: runner.running,
    paired: !!pair && pair.isPaired(),
    webOrigin: WEB_ORIGIN,
    stats,
  }));

  ipcMain.handle('gpu:check', () => bootstrap.checkGpu());

  ipcMain.handle('install:start', async () => {
    await bootstrap.install({
      installDir,
      urls: {
        comfyArchiveUrl: store.get('comfyArchiveUrl', bootstrap.DEFAULTS.comfyArchiveUrl),
        modelUrl: store.get('modelUrl', bootstrap.DEFAULTS.modelUrl),
      },
      onProgress: (p) => send('install:progress', p),
    });
    // 설치 완료 후, 이미 로그인되어 있으면 자동 시작
    autoStartIfReady();
    return true;
  });

  ipcMain.handle('pair:open', () => {
    if (!pair) throw new Error('페어링 서버 준비 안 됨');
    const url = `${WEB_ORIGIN}/worker/activate?port=${pair.port}&nonce=${encodeURIComponent(pair.nonce)}`;
    shell.openExternal(url);
    return true;
  });

  ipcMain.handle('worker:start', async () => { await startWorker(); return true; });
  ipcMain.handle('worker:stop', async () => { await stopWorker(); return true; });
  ipcMain.handle('comfy:stop', async () => { await comfy.stop(); return true; });
  ipcMain.handle('logs:openData', () => shell.openPath(app.getPath('userData')));

  // ── 광고 자동화 (베타) ──
  ipcMain.handle('ads:run-once', async () => { await ads.runOnce(); return true; });
  ipcMain.handle('ads:start', async () => { await ads.start(); return true; });
  ipcMain.handle('ads:stop', () => { ads.stop(); return true; });
  ipcMain.handle('ads:capture-open', async () => { await ads.openCapture(); return true; });
  ipcMain.handle('ads:capture-save', async () => {
    const fp = join(app.getPath('userData'), 'wing-capture.html');
    await ads.saveCaptureHtml(fp);
    shell.showItemInFolder(fp);
    return fp;
  });
}

app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

app.whenReady().then(async () => {
  setupServices();
  registerIpc();
  createWindow();
  tray = new Tray(trayIcon());
  updateTray();

  // 1) 저장된 세션 자동 복구 (임베드된 SUPABASE_URL/anon 사용)
  await runner.tryRestoreSession(SUPABASE_URL, SUPABASE_ANON_KEY);

  // 2) 로컬 페어링 서버 시작 (웹이 세션 토큰 전달용)
  pair = await startPairServer({
    onPair: async (tokens) => {
      await runner.pair(SUPABASE_URL, SUPABASE_ANON_KEY, tokens);
      send('pair:done', true);
      win?.show(); win?.focus();
      // 페어 직후, 엔진이 설치되어 있으면 자동 워커 시작
      autoStartIfReady();
    },
  });

  // 3) 이미 로그인되어 있고 엔진도 설치되어 있으면 자동 시작
  autoStartIfReady();
});

app.on('before-quit', async (e) => {
  if (app.isQuitting) return;
  app.isQuitting = true;
  e.preventDefault();
  try { ads?.stop(); await stopWorker(); await comfy.stop(); await pair?.close(); } catch { /* ignore */ }
  app.quit();
});

app.on('window-all-closed', () => { /* 트레이 상주 — 종료 안 함 */ });
