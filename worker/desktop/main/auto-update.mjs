// ============================================================
// 자동 업데이트 — Node fetch(undici) 기반 커스텀 업데이터.
//
// ⚠️ 왜 electron-updater 를 안 쓰나:
//   일부 Windows/보안SW 환경에서 Electron 의 net 모듈(electron-updater 가 사용)이
//   GitHub 피드 fetch 에서 "net::ERR_FAILED / Network service crashed" 또는 무응답(hang)으로
//   죽어 업데이트가 영원히 안 됨. 반면 워커 하트비트가 쓰는 Node 글로벌 fetch(undici)는 정상.
//   그래서 체크/다운로드를 Node fetch 로 직접 수행해 그 문제를 우회한다.
//
// 동작: 부팅 12초 후 + 6시간마다 latest.yml fetch → 버전 비교 → 새 버전이면 다이얼로그 →
//       수락 시 Setup.exe 다운로드 → sha512 검증 → 설치기 실행(NSIS customInit 이 실행중 앱 종료
//       후 설치 + runAfterFinish 로 재실행) → 앱 종료.
// 비용: GitHub Releases 무료. Windows(NSIS)만. 진행/오류는 tmp 로그에 기록.
// ============================================================
import { app, dialog, Notification } from 'electron';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const FEED = 'https://github.com/lhs0609a-cpu/coupanglanding/releases/download/megaload-desktop-update';
const AU_LOG = join(tmpdir(), 'megaload-autoupdate.log');
const ulog = (m) => { try { appendFileSync(AU_LOG, `[${new Date().toISOString()}] ${m}\n`); } catch { /* ignore */ } };

let initialized = false;
let declinedVersion = null;
let busy = false;

/** semver 비교: a>b 면 양수 */
function cmpVer(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
  return 0;
}

async function checkAndPrompt(getWindow, manual = false) {
  if (busy) return;
  const win = () => getWindow?.() ?? null;
  const say = async (box) => { const w = win(); return w ? dialog.showMessageBox(w, box) : dialog.showMessageBox(box); };
  let yml;
  try {
    const res = await fetch(`${FEED}/latest.yml`, { redirect: 'follow', cache: 'no-store' });
    if (!res.ok) { ulog(`feed HTTP ${res.status}`); if (manual) await say({ type: 'warning', title: '업데이트 확인', message: `업데이트 정보를 가져오지 못했습니다 (HTTP ${res.status}).`, detail: '잠시 후 다시 시도해주세요.' }); return; }
    yml = await res.text();
  } catch (e) { ulog(`feed fetch 실패: ${e.message}`); if (manual) await say({ type: 'warning', title: '업데이트 확인', message: '업데이트 정보를 가져오지 못했습니다.', detail: `네트워크 상태를 확인 후 다시 시도해주세요.\n(${e.message})` }); return; }

  const ver = (yml.match(/^version:\s*(.+)$/m) || [])[1]?.trim();
  const file = (yml.match(/^path:\s*(.+)$/m) || [])[1]?.trim() || 'MegaloadDesktop-Setup.exe';
  const sha = (yml.match(/^sha512:\s*(.+)$/m) || [])[1]?.trim();
  const cur = app.getVersion();
  ulog(`${manual ? '[수동] ' : ''}현재 v${cur}, 최신 v${ver}`);
  if (!ver || cmpVer(ver, cur) <= 0) {           // 이미 최신
    if (manual) await say({ type: 'info', title: '업데이트 확인', message: `이미 최신 버전입니다. (v${cur})` });
    return;
  }
  if (declinedVersion === ver && !manual) return; // 수동 확인은 거절 기록 무시

  const { response } = await say({
    type: 'info', buttons: ['지금 업데이트', '나중에'], defaultId: 0, cancelId: 1,
    title: '메가로드 도우미 업데이트',
    message: `새 버전 v${ver} 이(가) 있습니다.`,
    detail: '지금 업데이트하면 자동으로 다운로드한 뒤 설치하고 재시작합니다.\n(작업은 잠시 멈췄다가 설치 후 다시 시작됩니다.)',
  });
  if (response !== 0) { declinedVersion = ver; return; }
  await downloadAndInstall(ver, file, sha, win());
}

async function downloadAndInstall(ver, file, sha, win) {
  busy = true;
  const dest = join(tmpdir(), file);
  try {
    try { new Notification({ title: '메가로드 도우미', body: `v${ver} 다운로드 중…` }).show(); } catch { /* noop */ }
    const res = await fetch(`${FEED}/${file}`, { redirect: 'follow', cache: 'no-store' });
    if (!res.ok) throw new Error(`다운로드 HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // sha512 검증(있으면) — 손상/중간파일 설치 방지
    if (sha) {
      const got = createHash('sha512').update(buf).digest('base64');
      if (got !== sha) { throw new Error('sha512 불일치 — 다운로드 손상'); }
    }
    writeFileSync(dest, buf);
    ulog(`다운로드 완료 ${dest} (${buf.length}B)`);

    const box = {
      type: 'info', buttons: ['지금 재시작하여 설치', '나중에'], defaultId: 0, cancelId: 1,
      title: '업데이트 준비 완료', message: `v${ver} 다운로드가 완료되었습니다.`,
      detail: '지금 설치하면 앱이 종료되고 설치 후 자동으로 다시 실행됩니다.',
    };
    const { response } = win ? await dialog.showMessageBox(win, box) : await dialog.showMessageBox(box);
    if (response !== 0) { busy = false; return; }

    // NSIS 설치기 실행 → customInit 이 실행중 앱(MegaloadDesktop) 종료 후 설치 + runAfterFinish 로 재실행.
    spawn(dest, [], { detached: true, stdio: 'ignore' }).unref();
    app.isQuitting = true;
    setTimeout(() => app.quit(), 800);
  } catch (e) {
    ulog(`설치 실패: ${e.message}`);
    try { new Notification({ title: '메가로드 도우미', body: `업데이트 실패: ${e.message}` }).show(); } catch { /* noop */ }
    busy = false;
  }
}

/**
 * @param {object} opts
 * @param {() => import('electron').BrowserWindow | null} opts.getWindow
 */
export function setupAutoUpdate(opts) {
  if (!app.isPackaged) { ulog('dev 모드 — 업데이트 체크 비활성'); return; }
  if (initialized) return;
  initialized = true;
  const check = () => checkAndPrompt(opts.getWindow).catch((e) => ulog(`체크 예외: ${e.message}`));
  setTimeout(check, 12_000);                  // 부팅 12초 후
  setInterval(check, 6 * 60 * 60 * 1000);     // 이후 6시간마다
}

/** 수동 "업데이트 확인" — 최신이면 안내, 새 버전이면 다이얼로그. (앱의 버튼에서 호출) */
export function checkForUpdatesNow(getWindow) {
  return checkAndPrompt(getWindow, true).catch((e) => ulog(`수동체크 예외: ${e.message}`));
}
