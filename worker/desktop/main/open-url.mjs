// ============================================================
// 링크 열기 — 크롬 우선
//
// 왜: shell.openExternal 은 OS 기본 브라우저를 쓴다. 기본이 Edge 인 PC 에서는
//     메가로드 로그인 세션이 없는 브라우저가 떠서 "로그인 세션 만료" 화면을 보게 된다.
//     사용자가 실제로 로그인해 쓰는 건 크롬이므로 크롬으로 연다.
//
// 이미 크롬이 떠 있으면 새 프로세스는 기존 인스턴스에 URL 을 넘기고 즉시 종료된다
// → 기존 창·기본 프로필·로그인 세션 그대로 재사용된다(새 프로필/시크릿 아님).
//
// 크롬이 없거나 실행이 실패하면 기존 동작(shell.openExternal)으로 폴백한다.
// 링크가 안 열리는 것보다 다른 브라우저로라도 열리는 게 낫다.
// ============================================================
import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** null = 아직 안 찾음 / '' = 찾았지만 없음(재탐색 안 함) / 경로 = 크롬 실행파일 */
let cachedChrome = null;

function candidatePaths() {
  if (process.platform === 'win32') {
    const dirs = [
      process.env['PROGRAMFILES'],
      process.env['PROGRAMFILES(X86)'],
      process.env['LOCALAPPDATA'],
    ].filter(Boolean);
    return dirs.map((d) => join(d, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      join(homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
    ];
  }
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
}

/** 윈도우 레지스트리에서 크롬 경로 조회 (설치 위치를 옮긴 경우 대비) */
function chromeFromRegistry() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve('');
    const key = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe';
    let pending = 2;
    let found = '';
    for (const root of ['HKLM', 'HKCU']) {
      execFile('reg', ['query', `${root}\\${key}`, '/ve'], { windowsHide: true }, (err, stdout) => {
        if (!err && stdout) {
          // 출력 예: "    (기본값)    REG_SZ    C:\Program Files\Google\Chrome\Application\chrome.exe"
          const m = stdout.match(/REG_SZ\s+(.+chrome\.exe)/i);
          if (m && existsSync(m[1].trim())) found = found || m[1].trim();
        }
        if (--pending === 0) resolve(found);
      });
    }
  });
}

/** 크롬 실행파일 경로. 없으면 ''. (진단·테스트용으로 export) */
export async function findChrome() {
  if (cachedChrome !== null) return cachedChrome;
  const hit = candidatePaths().find((p) => existsSync(p));
  cachedChrome = hit || await chromeFromRegistry();
  return cachedChrome;
}

/**
 * URL 을 크롬으로 연다. 실패하면 기본 브라우저로 폴백.
 *
 * @param {string} url
 * @param {{ openExternal: (u: string) => unknown }} shell electron shell
 * @param {(msg: string) => void} [log]
 */
export async function openUrl(url, shell, log) {
  const fallback = (why) => {
    log?.(`[열기] ${why} — 기본 브라우저로 엽니다.`);
    try { shell?.openExternal(url); } catch { /* 여기서 더 할 수 있는 게 없다 */ }
  };
  let chrome = '';
  try { chrome = await findChrome(); } catch { /* 탐색 실패 = 없음 취급 */ }
  if (!chrome) return fallback('크롬이 설치돼 있지 않습니다');

  try {
    // detached + unref: 도우미를 껐다 켜도 브라우저는 영향받지 않는다.
    const child = spawn(chrome, [url], { detached: true, stdio: 'ignore', windowsHide: false });
    // spawn 은 실행파일이 없거나 권한 문제일 때 비동기로 error 를 던진다 → 그때 폴백.
    child.once('error', (e) => {
      cachedChrome = '';   // 다음 호출부터는 탐색 건너뛰고 바로 기본 브라우저
      fallback(`크롬 실행 실패(${e.message})`);
    });
    child.unref();
    log?.('[열기] 크롬으로 엽니다.');
  } catch (e) {
    cachedChrome = '';
    fallback(`크롬 실행 실패(${e.message})`);
  }
}
