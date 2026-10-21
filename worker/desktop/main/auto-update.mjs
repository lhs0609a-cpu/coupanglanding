// ============================================================
// 자동 업데이트 — Node fetch(undici) 기반 커스텀 업데이터.
//
// ⚠️ 왜 electron-updater 를 안 쓰나:
//   일부 Windows/보안SW 환경에서 Electron 의 net 모듈(electron-updater 가 사용)이
//   GitHub 피드 fetch 에서 "net::ERR_FAILED / Network service crashed" 또는 무응답(hang)으로
//   죽어 업데이트가 영원히 안 됨. 반면 워커 하트비트가 쓰는 Node 글로벌 fetch(undici)는 정상.
//   그래서 체크/다운로드를 Node fetch 로 직접 수행해 그 문제를 우회한다.
//
// 동작: 부팅 12초 후 + 1시간마다 latest.yml fetch → 버전 비교 → 새 버전이면 **묻지 않고**
//       Setup.exe 다운로드 → sha512 검증 → 하는 작업이 없을 때(2분 연속 유휴) 설치기 실행
//       (NSIS customInit 이 실행중 앱 종료 후 설치 + runAfterFinish 로 재실행) → 앱 종료.
//       작업 중이면 끝날 때까지 기다리고, 그 전에 앱이 꺼지면 종료 시점에 설치한다.
// 비용: GitHub Releases 무료. Windows(NSIS)만. 진행/오류는 tmp 로그에 기록.
// ============================================================
import { app, dialog, Notification, shell } from 'electron';
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
// 다운로드 완료됐지만 아직 설치 차례(유휴)를 못 만난 설치본 — 유휴가 오거나 앱이 꺼질 때 설치.
//   트레이 상주 앱이라 재시작을 잘 안 해 업데이트가 영영 안 깔리던 문제 해소(0.2.31에 묶이던 케이스).
let pendingInstall = null;

/** semver 비교: a>b 면 양수 */
function cmpVer(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
  return 0;
}

/** 맥 사용자가 새 dmg 를 받으러 갈 곳(다운로드 단일 허브). */
const MAC_DOWNLOAD_PAGE = 'https://www.megaload.co.kr/megaload/settings?tab=localgpu';

/**
 * macOS 업데이트 안내 — **자동 설치는 구조적으로 불가능**하다.
 * Squirrel.Mac(electron-updater)은 서명된 앱만 교체할 수 있는데 이 앱은 코드서명이 없다
 * (Apple Developer 계정 미등록). 서명 없이 교체를 시도하면 Gatekeeper 가 막고,
 * 최악의 경우 설치본이 깨져 앱이 아예 안 열린다.
 *
 * 그래서 맥에서는 "새 버전이 나왔다"는 사실만 알리고 다운로드 페이지를 열어 준다.
 * 알리지도 않던 예전 동작은 맥 사용자가 구버전에 영영 묶인다는 뜻이었다.
 */
async function macCheckAndNotify(getWindow, manual = false) {
  const win = () => getWindow?.() ?? null;
  const say = async (box) => { const w = win(); return w ? dialog.showMessageBox(w, box) : dialog.showMessageBox(box); };
  let ver;
  try {
    const res = await fetch(`${FEED}/latest.yml`, { redirect: 'follow', cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ver = ((await res.text()).match(/^version:\s*(.+)$/m) || [])[1]?.trim();
  } catch (e) {
    ulog(`[mac] feed 실패: ${e.message}`);
    if (manual) await say({ type: 'warning', title: '업데이트 확인', message: '업데이트 정보를 가져오지 못했습니다.', detail: e.message });
    return;
  }
  const cur = app.getVersion();
  ulog(`[mac]${manual ? ' [수동]' : ''} 현재 v${cur}, 최신 v${ver}`);
  if (!ver || cmpVer(ver, cur) <= 0) {
    if (manual) await say({ type: 'info', title: '업데이트 확인', message: `이미 최신 버전입니다. (v${cur})` });
    return;
  }
  if (!manual && declinedVersion === ver) return;   // 이번 버전은 이미 "나중에" 를 눌렀다
  const r = await say({
    type: 'info',
    title: '새 버전이 있습니다',
    message: `메가로드 도우미 v${ver} 가 나왔습니다. (현재 v${cur})`,
    detail: 'macOS 는 자동 업데이트를 지원하지 않아 새 설치파일(dmg)을 직접 받아야 합니다.\n'
      + '[다운로드 페이지 열기] 를 누르면 받는 곳으로 이동합니다.',
    buttons: ['다운로드 페이지 열기', '나중에'],
    defaultId: 0,
    cancelId: 1,
  });
  if (r.response === 0) { try { await shell.openExternal(MAC_DOWNLOAD_PAGE); } catch { /* noop */ } }
  else declinedVersion = ver;
}

/**
 * 지금 설치(=앱 종료)해도 되는가. 하는 일이 없을 때만 true.
 * main 이 넘겨준 판정이 없거나 그 판정이 터지면 **설치하지 않는다** — 작업을 끊는 쪽이 늦는 쪽보다 나쁘다.
 */
let isAppBusy = () => false;
function safeBusy() {
  try { return !!isAppBusy(); } catch (e) { ulog(`작업 상태 확인 예외(${e.message}) — 바쁜 것으로 본다`); return true; }
}

/** 하는 일이 없어질 때까지 기다렸다가 설치한다 — 이 간격으로 다시 본다. */
const IDLE_POLL_MS = 60_000;
/** 비어 보여도 곧바로 끄지 않는다 — 다음 작업이 바로 이어 붙는 틈일 수 있어 이만큼 연속으로 비어야 한다. */
const IDLE_SETTLE_MS = 2 * 60_000;
let idleTimer = null;
let idleSince = 0;

async function checkAndPrompt(getWindow, manual = false) {
  if (busy) {
    if (manual) await say(getWindow, { type: 'info', title: '업데이트 확인', message: '새 버전을 받는 중입니다. 받는 대로 자동으로 설치됩니다.' });
    return;
  }
  let yml;
  try {
    const res = await fetch(`${FEED}/latest.yml`, { redirect: 'follow', cache: 'no-store' });
    if (!res.ok) { ulog(`feed HTTP ${res.status}`); if (manual) await say(getWindow, { type: 'warning', title: '업데이트 확인', message: `업데이트 정보를 가져오지 못했습니다 (HTTP ${res.status}).`, detail: '잠시 후 다시 시도해주세요.' }); return; }
    yml = await res.text();
  } catch (e) { ulog(`feed fetch 실패: ${e.message}`); if (manual) await say(getWindow, { type: 'warning', title: '업데이트 확인', message: '업데이트 정보를 가져오지 못했습니다.', detail: `네트워크 상태를 확인 후 다시 시도해주세요.\n(${e.message})` }); return; }

  const ver = (yml.match(/^version:\s*(.+)$/m) || [])[1]?.trim();
  const file = (yml.match(/^path:\s*(.+)$/m) || [])[1]?.trim() || 'MegaloadDesktop-Setup.exe';
  const sha = (yml.match(/^sha512:\s*(.+)$/m) || [])[1]?.trim();
  const cur = app.getVersion();
  ulog(`${manual ? '[수동] ' : ''}현재 v${cur}, 최신 v${ver}`);
  if (!ver || cmpVer(ver, cur) <= 0) {           // 이미 최신
    if (manual) await say(getWindow, { type: 'info', title: '업데이트 확인', message: `이미 최신 버전입니다. (v${cur})` });
    return;
  }
  // 이미 받아 두고 설치 차례만 기다리는 중이면 다시 받지 않는다.
  if (pendingInstall && cmpVer(pendingInstall.ver, ver) >= 0) {
    if (manual) await say(getWindow, { type: 'info', title: '업데이트 확인', message: `v${pendingInstall.ver} 을(를) 받아 두었습니다.`, detail: '지금 하는 작업이 끝나면 자동으로 설치하고 다시 켜집니다.' });
    return;
  }

  // ★ 예전엔 여기서 "지금 업데이트 / 나중에" 를 물었다. 트레이 상주 앱이라 창을 보는 사람이
  //   드물어, 그 다이얼로그가 뜬 채 몇 주씩 구버전에 묶였다(고친 버그가 사용자에게 안 닿았다).
  //   → 묻지 않고 받는다. 설치 시점은 아래 installWhenIdle 이 작업을 보고 고른다.
  if (manual) void say(getWindow, { type: 'info', title: '업데이트 확인', message: `새 버전 v${ver} 을(를) 받습니다.`, detail: '다 받으면 하는 작업이 없을 때 자동으로 설치하고 다시 켜집니다.' });
  await downloadAndQueue(ver, file, sha);
}

async function say(getWindow, box) {
  const w = getWindow?.() ?? null;
  return w ? dialog.showMessageBox(w, box) : dialog.showMessageBox(box);
}

async function downloadAndQueue(ver, file, sha) {
  busy = true;
  const dest = join(tmpdir(), file);
  try {
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
    // 받아 둔 것은 앱이 어떻게 꺼지든(트레이 종료·PC 종료 전 수동 종료) 그때 설치된다 — before-quit 참조.
    pendingInstall = { dest, ver };
    installWhenIdle();
  } catch (e) {
    ulog(`다운로드 실패: ${e.message}`);   // 다음 주기 체크에서 다시 시도한다 — 사용자에게 띄울 일은 아니다
  } finally {
    busy = false;
  }
}

/**
 * 하는 일이 없을 때 설치한다. 작업 중이면 끝날 때까지 기다린다(작업을 끊지 않는다).
 * 연속으로 IDLE_SETTLE_MS 동안 비어 있어야 설치한다 — 작업 사이의 짧은 틈에 끄지 않게.
 */
function installWhenIdle() {
  if (idleTimer) return;
  idleSince = 0;
  const tick = () => {
    idleTimer = null;
    if (!pendingInstall) return;
    if (safeBusy()) {
      if (idleSince) ulog('작업이 시작돼 설치를 다시 미룹니다');
      idleSince = 0;
    } else if (!idleSince) {
      idleSince = Date.now();
    } else if (Date.now() - idleSince >= IDLE_SETTLE_MS) {
      launchInstaller('유휴');
      return;
    }
    idleTimer = setTimeout(tick, IDLE_POLL_MS);
    idleTimer.unref?.();
  };
  tick();
}

/**
 * NSIS 설치기 실행 → customInit 이 실행중 앱(MegaloadDesktop) 종료 후 설치 + runAfterFinish 로 재실행.
 * ⚠️ 반드시 OS 셸로 실행해 앱의 프로세스 트리/잡오브젝트 "밖"에서 돌게 한다.
 *    그냥 spawn/cmd start 하면 설치기가 앱의 자식이 되어, 설치기 customInit 의
 *    `taskkill /F /IM MegaloadDesktop.exe /T`(/T=트리) 또는 앱 잡오브젝트 종료에 설치기 자신까지 죽어
 *    → 앱만 종료되고 설치가 무반응으로 멈춘다(0.2.19~0.2.23 버그, OS레벨 테스트로 확인).
 *  ① shell.openPath = ShellExecute(탐색기가 실행) = 사용자가 더블클릭한 것과 동일(트리/잡 밖) — 가장 안전.
 *  ② 실패 시 WMI(Win32_Process.Create, 부모=WmiPrvSE)로 폴백.
 */
async function launchInstaller(why) {
  const job = pendingInstall;
  if (!job) return;
  pendingInstall = null;    // before-quit 이 같은 설치기를 한 번 더 띄우지 않게
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  ulog(`설치 시작(${why}) v${job.ver}`);
  try { new Notification({ title: '메가로드 도우미', body: `v${job.ver} 으로 업데이트합니다 — 잠시 후 자동으로 다시 켜집니다.` }).show(); } catch { /* noop */ }
  let launched = false;
  try {
    const openErr = await shell.openPath(job.dest);   // '' 이면 성공
    if (!openErr) { launched = true; ulog(`설치기 실행(shell.openPath): ${job.dest}`); }
    else ulog(`shell.openPath 실패(${openErr}) — WMI 폴백`);
  } catch (e3) { ulog(`shell.openPath 예외(${e3.message}) — WMI 폴백`); }
  if (!launched) {
    try {
      const psScript = `Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='"${job.dest}"'} | Out-Null`;
      const enc = Buffer.from(psScript, 'utf16le').toString('base64');
      spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', enc], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      ulog(`설치기 실행(WMI 폴백): ${job.dest}`);
      await new Promise((r) => setTimeout(r, 4000));  // WMI 모듈 로드+생성 시간 확보
    } catch (e) {
      ulog(`설치기 실행 실패: ${e.message} — 다음 종료 때 다시 시도`);
      pendingInstall = job;
      return;
    }
  }
  if (why === '종료') return;  // 이미 꺼지는 중이다
  app.isQuitting = true;
  setTimeout(() => app.quit(), 2000);
}

/**
 * @param {object} opts
 * @param {() => import('electron').BrowserWindow | null} opts.getWindow
 * @param {() => boolean} [opts.isBusy]  지금 작업 중인가 — true 인 동안은 설치를 미룬다
 */
export function setupAutoUpdate(opts) {
  if (!app.isPackaged) { ulog('dev 모드 — 업데이트 체크 비활성'); return; }
  if (initialized) return;
  // 자동 설치는 Windows 전용이다 — latest.yml 의 NSIS Setup.exe 를 받아 실행한다.
  // 맥은 서명이 없어 앱 교체가 불가능하므로(위 macCheckAndNotify 주석) 알림만 띄운다.
  if (process.platform === 'darwin') {
    initialized = true;
    const mc = () => macCheckAndNotify(opts.getWindow).catch((e) => ulog(`[mac] 체크 예외: ${e.message}`));
    setTimeout(mc, 12_000);
    setInterval(mc, 6 * 60 * 60 * 1000);
    return;
  }
  if (process.platform !== 'win32') { ulog(`${process.platform} — 자동업데이트 미지원(수동 재설치)`); return; }
  initialized = true;
  if (typeof opts.isBusy === 'function') isAppBusy = opts.isBusy;
  // 받아 두었는데 유휴를 못 만나고 앱이 꺼지면 — 그때 설치한다(트리/잡 밖에서 도는 shell.openPath).
  app.on('before-quit', () => {
    if (pendingInstall) void launchInstaller('종료');
  });
  const check = () => checkAndPrompt(opts.getWindow).catch((e) => ulog(`체크 예외: ${e.message}`));
  setTimeout(check, 12_000);                  // 부팅 12초 후
  // 1시간마다 — 고친 버전이 하루 안에 모두에게 닿게. latest.yml 은 수백 바이트라 부담이 없다.
  setInterval(check, 60 * 60 * 1000);
}

/** 수동 "업데이트 확인" — 최신이면 안내, 새 버전이면 받아서 유휴 때 설치. (앱의 버튼에서 호출) */
export function checkForUpdatesNow(getWindow) {
  const fn = process.platform === 'darwin' ? macCheckAndNotify : checkAndPrompt;
  return fn(getWindow, true).catch((e) => ulog(`수동체크 예외: ${e.message}`));
}
