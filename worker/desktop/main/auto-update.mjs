// ============================================================
// 자동 업데이트 — electron-updater (generic 프로바이더 + 고정 태그)
//
// 동작:
//   1. 패키징된 앱에서만 활성 (dev 실행은 update 피드 없음 → skip)
//   2. 부팅 12초 후 + 6시간마다 고정 URL 의 latest.yml 과 현재 버전 비교
//   3. 새 버전 발견 → "지금 업데이트하시겠습니까?" 다이얼로그 (autoDownload=false)
//   4. 수락 → 백그라운드 다운로드 → 완료 시 "재시작하여 설치" → quitAndInstall
//   5. 설치 후 자동 재실행(quitAndInstall isForceRunAfter=true)
//
// ⚠️ 모니터 앱과 같은 GitHub repo 를 쓰므로, github 프로바이더의 "최신 릴리스"
//    모호성을 피하려 generic 프로바이더 + 고정 태그(gpu-worker-update)를 사용한다.
//    electron-updater 는 항상 같은 URL 의 latest.yml 만 읽어 모니터 릴리스와 충돌하지 않는다.
//
// 비용: GitHub Releases 호스팅 무료. 외부 유료 호출 없음.
// 제약: Windows(NSIS)만. macOS 는 코드 서명 필요해 제외(에러는 조용히 무시).
// ============================================================

import { app, dialog, Notification } from 'electron';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

let initialized = false;
let declinedVersion = null;

/**
 * @param {object} opts
 * @param {() => import('electron').BrowserWindow | null} opts.getWindow
 */
export function setupAutoUpdate(opts) {
  if (!app.isPackaged) {
    console.log('[auto-update] dev 모드 — 업데이트 체크 비활성');
    return;
  }
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false;          // 먼저 묻고 다운로드
  autoUpdater.autoInstallOnAppQuit = true;   // '나중에' 선택 시에도 다음 종료 때 설치

  autoUpdater.on('update-available', async (info) => {
    if (declinedVersion === info.version) return;
    const win = opts.getWindow?.() ?? null;
    const box = {
      type: 'info',
      buttons: ['지금 업데이트', '나중에'],
      defaultId: 0,
      cancelId: 1,
      title: '메가로드 도우미 업데이트',
      message: `새 버전 v${info.version} 이(가) 있습니다.`,
      detail: '지금 업데이트하면 자동으로 다운로드한 뒤 재시작하여 최신 버전으로 전환됩니다.\n(작업은 잠시 멈췄다가 설치 후 자동으로 다시 시작됩니다.)',
    };
    const { response } = win ? await dialog.showMessageBox(win, box) : await dialog.showMessageBox(box);
    if (response === 0) {
      autoUpdater.downloadUpdate().catch((e) => console.error('[auto-update] 다운로드 실패:', e));
      try { new Notification({ title: '메가로드 도우미', body: `v${info.version} 다운로드를 시작합니다…` }).show(); } catch { /* noop */ }
    } else {
      declinedVersion = info.version;
    }
  });

  autoUpdater.on('update-downloaded', async (info) => {
    const win = opts.getWindow?.() ?? null;
    const box = {
      type: 'info',
      buttons: ['지금 재시작하여 설치', '나중에'],
      defaultId: 0,
      cancelId: 1,
      title: '메가로드 도우미 업데이트 준비 완료',
      message: `v${info.version} 다운로드가 완료되었습니다.`,
      detail: '지금 재시작하면 설치 후 자동으로 다시 실행됩니다.\n나중에 선택해도 다음 종료 시 자동으로 설치됩니다.',
    };
    const { response } = win ? await dialog.showMessageBox(win, box) : await dialog.showMessageBox(box);
    if (response === 0) {
      // 설치 후 자동 재실행(isForceRunAfter=true). before-quit 의 정리(comfy/worker 정지)는 그대로 실행됨.
      autoUpdater.quitAndInstall(false, true);
    }
  });

  // 네트워크/피드 오류는 조용히 무시 (다음 체크 때 재시도). 핸들러 필수(미처리 시 throw 전파).
  autoUpdater.on('error', (err) => {
    console.error('[auto-update] error:', err?.message || err);
  });

  const check = () => autoUpdater.checkForUpdates().catch((e) => console.error('[auto-update] 체크 실패:', e));
  setTimeout(check, 12_000);                  // 부팅 12초 후
  setInterval(check, 6 * 60 * 60 * 1000);     // 이후 6시간마다
}
