// ============================================================
// 메가로드 도우미 — 통합 데스크탑 셸
//   셸이 단일인스턴스·창·트레이·자동업데이트·로그인(페어링)을 담당하고,
//   기능은 main/modules/<id>/module.mjs 플러그인으로 자동 탑재된다.
//   (미래 프로그램도 모듈 파일만 추가하면 같은 설치본/자동업데이트로 따라 들어옴)
// ============================================================
import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog, Notification } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { rpc } from '../runtime/supabase-rest.mjs';
import { Store } from './store.mjs';
import { ComfyManager } from './comfy-manager.mjs';
import { OllamaManager } from './ollama-manager.mjs';
import { WorkerRunner } from './worker-runner.mjs';
import { AdRunner } from './ad-runner.mjs';
import { startPairServer } from './pair-server.mjs';
import * as bootstrap from './bootstrap.mjs';
import { setupAutoUpdate, checkForUpdatesNow } from './auto-update.mjs';
import { loadModules } from './shell/registry.mjs';

// ⚠️ 자동업데이트 피드 fetch 시 "net::ERR_FAILED / Network service crashed" 회피.
//    일부 Windows/보안SW 환경에서 Electron 네트워크 서비스 샌드박스가 죽어 electron-updater 가 실패함.
//    (app.commandLine 은 app ready 전에 호출해야 적용됨)
app.commandLine.appendSwitch('disable-features', 'NetworkServiceSandbox');

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
let store, comfy, runner, pair, ads, ollama;
let installDir, comfyPort;
let trayContribs = [];
let installing = false;        // 엔진 설치 진행 중(자동·수동 중복 방지)
let autoInstallDone = false;   // 이번 세션 자동설치 1회만 시도(실패 시 수동 버튼/앱 재시작으로 재시도)
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
  if (installing) return;            // 자동/수동 중복 설치 방지
  installing = true;
  try {
    await bootstrap.install({
      installDir,
      urls: {
        comfyArchiveUrl: store.get('comfyArchiveUrl', bootstrap.DEFAULTS.comfyArchiveUrl),
        modelUrl: store.get('modelUrl', bootstrap.DEFAULTS.modelUrl),
      },
      onProgress: (p) => send('thumbnail-gpu:install-progress', p),
    });
  } finally {
    installing = false;
  }
  autoStartIfReady();
}

/**
 * 로그인(페어링) 직후 엔진을 백그라운드로 "한 번에" 자동 설치한다.
 *   - 도우미를 깔면 AI 썸네일(ComfyUI·SDXL·누끼)·텍스트(ollama)까지 따로 안 누르고 자동 준비.
 *   - NVIDIA GPU 없으면 SDXL(6.5GB)은 못 돌리므로 자동 다운로드 생략(낭비 방지) → 텍스트 엔진만.
 *   - 세션당 1회만 시도. 실패 시 AI 썸네일 탭 "엔진 설치/확인"으로 수동 재시도 가능.
 */
async function autoInstallIfNeeded() {
  if (autoInstallDone || installing || !runner.loggedIn) return;
  if (await bootstrap.isInstalled(installDir)) return;
  autoInstallDone = true;
  try {
    const gpu = await bootstrap.checkGpu();
    if (!gpu.ok) {
      send('thumbnail-gpu:comfy-log',
        '[자동설치] NVIDIA GPU 미탐지 — AI 썸네일(ComfyUI/SDXL ~6.5GB)은 GPU가 필요해 자동설치를 생략합니다. ' +
        '텍스트 엔진(ollama)만 준비합니다. GPU 장착 후 AI 썸네일 탭 "엔진 설치/확인"으로 받으세요.');
      await bootstrap.ensureOllama({
        installDir,
        onProgress: (p) => send('allinone:log', `[ollama] ${p.detail || p.phase}${p.pct != null ? ' ' + p.pct + '%' : ''}`),
      });
      return;
    }
    send('thumbnail-gpu:comfy-log',
      '[자동설치] 최초 1회 엔진 자동 설치 시작 — ComfyUI·SDXL·누끼 노드·ollama 를 한 번에 받습니다(수 GB, 백그라운드). ' +
      '완료되면 AI 썸네일이 자동 시작됩니다.');
    await installEngine(); // bootstrap.install(전체) → autoStartIfReady
  } catch (e) {
    send('thumbnail-gpu:comfy-log', '[자동설치] 실패 — AI 썸네일 탭 "엔진 설치/확인"으로 재시도하세요: ' + (e.message || e));
  }
}

async function autoStartIfReady() {
  // 광고 자동화 옵트인 자동시작 — 로그인돼 있고 "자동 실행"을 켠 경우에만.
  // (썸네일 엔진 설치 여부와 무관하므로 아래 엔진 가드보다 먼저 시도)
  try {
    if (runner.loggedIn && store.get('adsAutoRun', false)) {
      ads.autoStart?.().catch(() => {});
    }
  } catch { /* 광고 자동시작 실패는 썸네일 자동시작을 막지 않음 */ }

  try {
    if (runner.running || !runner.loggedIn) return;
    // 아직 엔진 미설치면 조용히 넘어가지 말고 백그라운드 자동설치를 킥(1회). 설치 끝나면 여기 다시 들어와 시작.
    if (!(await bootstrap.isInstalled(installDir))) { void autoInstallIfNeeded(); return; }
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
  ollama = new OllamaManager(installDir, {
    model: store.get('ollamaModel', bootstrap.DEFAULTS.ollamaModel),
    embedModel: store.get('ollamaEmbedModel', bootstrap.DEFAULTS.ollamaEmbedModel),
    onLog: (m) => send('allinone:log', m),
  });
  runner = new WorkerRunner(userData, { onEvent: onWorkerEvent });
  ads = new AdRunner({ getSession: () => runner.session, onEvent: (e) => send('ads:event', e) });
}

function buildContext() {
  return {
    app, ipcMain, shell, dialog,
    paths: { userData: app.getPath('userData'), appRoot },
    store, send, log,
    services: {
      comfy, ollama, runner, ads, bootstrap,
      installDir, stats,
      startWorker, stopWorker, installEngine, autoStartIfReady,
      pair: () => pair, webOrigin: WEB_ORIGIN,
    },
  };
}

function createWindow(startHidden = false) {
  win = new BrowserWindow({
    width: 560, height: 680, resizable: true, show: false,
    title: APP_TITLE,
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.removeMenu();
  win.loadFile(join(appRoot, 'renderer', 'index.html'));
  // 부팅으로 자동 실행된 경우 창을 띄우지 않고 트레이에만 상주(백그라운드). 직접 실행이면 표시.
  win.once('ready-to-show', () => { if (!startHidden) win.show(); });
  win.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
}

function trayIcon() {
  // 완전 불투명 브랜드레드(#E31837) 사각 배지 + 흰색 볼드 'M' 32x32 (투명 픽셀 0).
  //   이전 로켓 아이콘은 투명 배경 + 얇은 선이라 어두운 트레이에서 안 보였음 →
  //   불투명 솔리드 배경 + 고대비 글리프로 교체해 밝은/어두운 트레이 모두에서 또렷하게 식별.
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAACXBIWXMAACxLAAAsSwGlPZapAAABpklEQVR42mOo5ZWjKWIA4scS5jRCoxaMWAteOMe+Sa1CRo+lLbHqfx1VgKzshWscURZ8nrX8Pyp4FZaDafozfe//f/4iK/uycC2ZFnxZshHTgvd1E9CVkWzB7z8Q+u/7j09kbdCU/Tx7BVkNORb8PHP5/19oILyOLUZW89w86P+/f1A1ZFvw49i5X9fvQNhf1+5AVvOxfTpE/POCtRT44NzVzzOXQdj/vnx7omgPV/PrGtTit5m15Fvw6+rtlx6JcP2g9ApJx/aREJE/j58/twkj34Lftx8Aub/vPoRwv23dDw2f/nkQkU9TF1PBgo/ds6Gh9OPnUzVnsJWPICIvXGKpYMFzy2C4EW+z61+6xUNl7z4EyVJuASjJn7sKTUsrt3zsmgVhf+yZTTUL3tf0QmP1yfOfpy5Cw8cugmoWPNP1RORYcP76deUWNMdRxQIg+n7gBHKx86F1KpUteJvbiDD+37/nZoFUtuCJksO/r9+gOfz0JUShRIYFr+OKP01eBEQfGiYii78rboWIvw7Pgws+1XaHCALRm8Ty0Up/1AJaWUDT5jsAFmcInmEIo5wAAAAASUVORK5CYII=',
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
    appVersion: app.getVersion(),
  }));
  ipcMain.handle('shell:pair-open', () => {
    if (!pair) throw new Error('페어링 서버 준비 안 됨');
    shell.openExternal(`${WEB_ORIGIN}/worker/activate?port=${pair.port}&nonce=${encodeURIComponent(pair.nonce)}`);
    return true;
  });
  ipcMain.handle('shell:open-data', () => shell.openPath(app.getPath('userData')));
  ipcMain.handle('shell:check-update', () => { checkForUpdatesNow(() => win); return true; });
  // 자동업데이트 로그 파일 열기 — 업데이트가 안 될 때 무슨 일이 있었는지 사용자가 직접 확인.
  ipcMain.handle('shell:open-update-log', () => shell.openPath(join(tmpdir(), 'megaload-autoupdate.log')));

  // 렌더러 자가진단 — shell.js 가 로드 끝나면 호출. healthcheck 가 이 파일을 읽어 "UI 실제 렌더" 검증.
  ipcMain.handle('shell:selftest', (_e, payload = {}) => {
    try {
      writeFileSync(join(tmpdir(), 'megaload-desktop-selftest.json'),
        JSON.stringify({ ...payload, ver: app.getVersion(), t: Date.now() }));
    } catch { /* ignore */ }
    return true;
  });

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
  manifest.invokable.push('shell:state', 'shell:pair-open', 'shell:open-data', 'shell:asset', 'shell:selftest', 'shell:check-update', 'shell:open-update-log');
  manifest.events.push('shell:pair-done');
  registerShellIpc(manifest);

  // OS 시작 시 자동 실행 등록 (다운로드 후 일일이 안 켜도 부팅마다 백그라운드 상주).
  try { app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] }); } catch { /* 비지원 환경 무시 */ }
  const openedAtLogin = app.getLoginItemSettings().wasOpenedAtLogin || process.argv.includes('--hidden');
  createWindow(openedAtLogin); // 부팅 자동실행이면 창 숨김(트레이만), 직접 실행이면 창 표시
  tray = new Tray(trayIcon());
  tray.on('click', () => { win?.show(); win?.focus(); });        // 좌클릭으로 창 열기
  tray.on('double-click', () => { win?.show(); win?.focus(); });
  updateTray();

  // 백그라운드(숨김)로 떴으면 사용자가 인지하도록 1회 알림 — 트레이 아이콘을 못 찾는 문제 완화.
  if (openedAtLogin) {
    try {
      new Notification({ title: APP_TITLE, body: '백그라운드에서 실행 중입니다. 작업표시줄 오른쪽 트레이의 빨간 아이콘을 클릭하면 창이 열립니다.' }).show();
    } catch { /* 알림 미지원 무시 */ }
  }

  setupAutoUpdate({ getWindow: () => win });

  // 로그인(세션) 상태면 30초마다 하트비트 → 웹 연결 표시등이 "연결됨"으로 표시(썸네일 워커 미가동이어도).
  const SHELL_WORKER_ID = `${hostname()}-app`;
  const sendHeartbeat = () => {
    if (!runner?.session) return;
    rpc(runner.session, 'worker_heartbeat', { p_worker_id: SHELL_WORKER_ID, p_hostname: hostname() }).catch(() => {});
  };

  // 저장된 세션 자동 복구
  await runner.tryRestoreSession(SUPABASE_URL, SUPABASE_ANON_KEY);

  // 로컬 페어링 서버 (웹이 세션 토큰 전달)
  pair = await startPairServer({
    onPair: async (tokens) => {
      await runner.pair(SUPABASE_URL, SUPABASE_ANON_KEY, tokens);
      send('shell:pair-done', true);
      win?.show(); win?.focus();
      sendHeartbeat();
      autoStartIfReady();
    },
  });

  sendHeartbeat();
  setInterval(sendHeartbeat, 30_000);
  autoStartIfReady();
}).catch((e) => {
  // 시작 중 예외가 나면 조용히 죽지 않고 원인을 보여준다(= "아무것도 안 뜸" 방지/진단).
  try { dialog.showErrorBox('메가로드 도우미 시작 오류', String(e?.stack || e?.message || e)); } catch { /* ignore */ }
});

app.on('before-quit', async (e) => {
  if (app.isQuitting) return;
  app.isQuitting = true;
  e.preventDefault();
  try { ads?.stop(); await runner?.stopLlmLoop(); await stopWorker(); await comfy.stop(); await ollama?.stop(); await pair?.close(); } catch { /* ignore */ }
  app.quit();
});

app.on('window-all-closed', () => { /* 트레이 상주 */ });
