// ============================================================
// 자동 업데이트 — electron-updater + GitHub Releases 피드
//
// 동작:
//   1. 패키징된 앱에서만 활성 (dev 빌드는 update 피드가 없어 skip)
//   2. 부팅 10초 후 + 6시간마다 GitHub 릴리스의 latest.yml 과 현재 버전 비교
//   3. 새 버전 발견 → "지금 업데이트하시겠습니까?" 다이얼로그 (autoDownload=false)
//   4. 수락 → 백그라운드 다운로드 → 완료 시 "재시작하여 설치" 다이얼로그
//   5. 수락 → quitAndInstall() → NSIS 가 설치 후 자동 재실행(runAfterFinish)
//
// 비용: GitHub Releases 피드는 무료(이미 사용 중). 외부 유료 호출 없음.
//
// 제약:
//   - Windows(NSIS)만 무서명 자동업데이트 가능. macOS 는 코드 서명 필수라
//     현재 미서명 빌드에서는 동작하지 않음(에러는 조용히 무시됨).
//   - 닭-달걀: 이 모듈이 없는 버전(예 v0.1.11)에 깐 사용자는 다음 버전을
//     한 번 수동 설치해야 하고, 그 이후 버전부터 자동 업데이트가 적용됨.
// ============================================================

import { app, dialog, BrowserWindow, Notification } from 'electron';
import { autoUpdater } from 'electron-updater';

let initialized = false;
let declinedVersion: string | null = null; // 같은 버전을 거절하면 세션 내 재알림 안 함

interface SetupOpts {
  getMainWindow: () => BrowserWindow | null;
  /** 설치 직전 호출 — index.ts 의 isQuitting 플래그를 세워 창 close 가 트레이 최소화로 가로채지 않게 함 */
  onBeforeInstall: () => void;
}

export function setupAutoUpdate(opts: SetupOpts): void {
  // 패키징 안 된 dev 빌드는 update 피드(app-update.yml)가 없어 즉시 에러 → skip
  if (!app.isPackaged) {
    console.log('[auto-update] dev 모드 — 업데이트 체크 비활성');
    return;
  }
  if (initialized) return;
  initialized = true;

  // 사용자에게 먼저 묻고 다운로드(자동 다운로드 X) — "설치하시겠습니까?" 흐름
  autoUpdater.autoDownload = false;
  // 다운로드된 업데이트는 다음 종료 시 자동 설치 ('나중에' 선택 시에도 결국 적용)
  autoUpdater.autoInstallOnAppQuit = true;

  // 새 버전 감지 → 설치 여부 질문
  autoUpdater.on('update-available', async (info) => {
    if (declinedVersion === info.version) return; // 이번 세션에 이미 거절한 버전
    const win = opts.getMainWindow();
    const boxOpts = {
      type: 'info' as const,
      buttons: ['지금 업데이트', '나중에'],
      defaultId: 0,
      cancelId: 1,
      title: 'Megaload Monitor 업데이트',
      message: `새 버전 v${info.version} 이(가) 있습니다.`,
      detail: '지금 업데이트하면 자동으로 다운로드한 뒤 재시작하여 최신 버전으로 전환됩니다.\n(모니터링은 잠시 멈췄다가 설치 후 자동으로 다시 시작됩니다.)',
    };
    const { response } = win
      ? await dialog.showMessageBox(win, boxOpts)
      : await dialog.showMessageBox(boxOpts);

    if (response === 0) {
      autoUpdater.downloadUpdate().catch((e) => console.error('[auto-update] 다운로드 실패:', e));
      try {
        new Notification({ title: 'Megaload Monitor', body: `v${info.version} 다운로드를 시작합니다…` }).show();
      } catch { /* Notification 미지원 무시 */ }
    } else {
      declinedVersion = info.version;
    }
  });

  // 다운로드 완료 → 재시작 설치 여부 질문
  autoUpdater.on('update-downloaded', async (info) => {
    const win = opts.getMainWindow();
    const boxOpts = {
      type: 'info' as const,
      buttons: ['지금 재시작하여 설치', '나중에'],
      defaultId: 0,
      cancelId: 1,
      title: 'Megaload Monitor 업데이트 준비 완료',
      message: `v${info.version} 다운로드가 완료되었습니다.`,
      detail: '지금 재시작하면 설치 후 자동으로 다시 실행되어 모니터링을 이어갑니다.\n나중에 선택해도 다음 종료 시 자동으로 설치됩니다.',
    };
    const { response } = win
      ? await dialog.showMessageBox(win, boxOpts)
      : await dialog.showMessageBox(boxOpts);

    if (response === 0) {
      opts.onBeforeInstall(); // isQuitting=true → 창 close 가 트레이 최소화로 가로채지 않게
      autoUpdater.quitAndInstall();
    }
    // '나중에' → autoInstallOnAppQuit=true 라 다음 종료 시 설치됨
  });

  // 네트워크/피드 오류는 사용자에게 알리지 않고 조용히 무시 (다음 체크 때 재시도).
  // ⚠️ 반드시 핸들러를 두어야 함 — 없으면 'error' 이벤트가 unhandled 로 전파되어
  //    index.ts 의 self-heal relaunch 를 유발할 수 있음.
  autoUpdater.on('error', (err) => {
    console.error('[auto-update] error:', err instanceof Error ? err.message : err);
  });

  const check = () => {
    autoUpdater.checkForUpdates().catch((e) => console.error('[auto-update] 체크 실패:', e));
  };
  setTimeout(check, 10_000);                 // 부팅 10초 후 (초기 로딩 방해 최소화)
  setInterval(check, 6 * 60 * 60 * 1000);    // 이후 6시간마다
}
