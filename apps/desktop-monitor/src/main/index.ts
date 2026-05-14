// ============================================================
// Megaload Desktop Monitor — Electron Main Process Entry
//
// 역할:
//   - Electron 앱 부팅
//   - 트레이 아이콘 생성 (백그라운드 상주)
//   - OS 시작 시 자동 실행 등록
//   - 설정 창 (renderer) 핸들링
//   - Phase 3에서 백그라운드 cron 추가 예정
// ============================================================

import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } from 'electron';
import path from 'node:path';
import { setupAutoLaunch, getAutoLaunchEnabled } from './auto-launch';
import { getStore } from './store';

// 단일 인스턴스 락 — 중복 실행 차단
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const isDev = process.argv.includes('--dev');
const RENDERER_PATH = path.join(__dirname, '..', 'renderer', 'index.html');

// ─── 설정 창 생성 ─────────────────────────────────────────────
function createMainWindow(): void {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 920,
    height: 640,
    minWidth: 720,
    minHeight: 480,
    title: 'Megaload Monitor',
    icon: getIconPath(),
    show: false, // 처음엔 숨김 (트레이로 시작)
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(RENDERER_PATH);

  // 창 닫기 → 종료 X, 트레이로 최소화 (백그라운드 동작 유지)
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// ─── 트레이 아이콘 ─────────────────────────────────────────────
function createTray(): void {
  const icon = nativeImage.createFromPath(getIconPath());
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Megaload Monitor — 품절 동기화 중');
  rebuildTrayMenu();

  // 트레이 더블클릭 → 창 표시
  tray.on('double-click', () => createMainWindow());
}

function rebuildTrayMenu(): void {
  if (!tray) return;
  const autoLaunch = getAutoLaunchEnabled();
  const store = getStore();
  const lastCheck = store.get('lastCheckAt') as string | undefined;
  const totalChecked = (store.get('totalChecked') as number | undefined) || 0;

  const menu = Menu.buildFromTemplate([
    { label: 'Megaload Monitor', enabled: false },
    { type: 'separator' },
    { label: `누적 체크: ${totalChecked.toLocaleString()}건`, enabled: false },
    { label: `마지막 체크: ${lastCheck ? formatRelativeTime(lastCheck) : '-'}`, enabled: false },
    { type: 'separator' },
    { label: '설정 창 열기', click: () => createMainWindow() },
    { label: 'OS 시작 시 자동 실행', type: 'checkbox', checked: autoLaunch, click: (item) => {
      setupAutoLaunch(item.checked).catch((e) => console.error('auto-launch toggle 실패:', e));
      rebuildTrayMenu();
    } },
    { type: 'separator' },
    { label: '종료 (모니터링 멈춤)', click: () => {
      const choice = dialog.showMessageBoxSync(mainWindow ?? new BrowserWindow({ show: false }), {
        type: 'warning',
        buttons: ['종료', '취소'],
        defaultId: 1,
        cancelId: 1,
        title: 'Megaload Monitor',
        message: '정말 종료하시겠습니까?',
        detail: '종료하면 품절/가격 모니터링이 멈춥니다.',
      });
      if (choice === 0) {
        isQuitting = true;
        app.quit();
      }
    } },
  ]);
  tray.setContextMenu(menu);
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

function getIconPath(): string {
  const icoPath = path.join(__dirname, '..', '..', 'build', 'icon.png');
  return icoPath;
}

// ─── 두 번째 인스턴스 시도 → 기존 창 표시 ─────────────────────
app.on('second-instance', () => {
  createMainWindow();
});

// ─── 앱 부팅 ──────────────────────────────────────────────────
app.whenReady().then(async () => {
  // 첫 실행 시 자동 실행 ON (사용자 명시적 OFF 시까지)
  const store = getStore();
  if (!store.has('autoLaunchInitialized')) {
    await setupAutoLaunch(true);
    store.set('autoLaunchInitialized', true);
  }

  createTray();

  // dev 모드 또는 첫 실행 시 창 표시 (로그인 필요)
  if (isDev || !store.get('isLoggedIn')) {
    createMainWindow();
    mainWindow?.show();
  }

  // 트레이 메뉴 정기 갱신 (마지막 체크 시각 등)
  setInterval(rebuildTrayMenu, 30_000);
});

// ─── 모든 창 닫혀도 앱은 종료하지 않음 (트레이 유지) ──────────
app.on('window-all-closed', (e: Event) => {
  e.preventDefault();
});

app.on('before-quit', () => {
  isQuitting = true;
});

// ─── IPC: renderer ↔ main 통신 ─────────────────────────────────
ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:get-stats', () => {
  const store = getStore();
  return {
    totalChecked: (store.get('totalChecked') as number | undefined) || 0,
    lastCheckAt: store.get('lastCheckAt') as string | undefined,
    isLoggedIn: !!store.get('isLoggedIn'),
    autoLaunch: getAutoLaunchEnabled(),
  };
});
ipcMain.handle('app:set-auto-launch', async (_e, enabled: boolean) => {
  await setupAutoLaunch(enabled);
  rebuildTrayMenu();
  return getAutoLaunchEnabled();
});
ipcMain.handle('app:hide-window', () => {
  mainWindow?.hide();
});
