// ============================================================
// 메가로드 도우미 — 통합 데스크탑 셸
//   셸이 단일인스턴스·창·트레이·자동업데이트·로그인(페어링)을 담당하고,
//   기능은 main/modules/<id>/module.mjs 플러그인으로 자동 탑재된다.
//   (미래 프로그램도 모듈 파일만 추가하면 같은 설치본/자동업데이트로 따라 들어옴)
// ============================================================
import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog, Notification } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { rpc, isPermanentAuthError } from '../runtime/supabase-rest.mjs';
import { Store } from './store.mjs';
import naverGate from './naver-gate.mjs';
// 네이버 로그인을 앱 재시작·재부팅 너머로 살려 두는 장치 — 어느 탭을 여는지와 무관하게 항상 돈다.
import { initNaverSession, installCookiePersistence, persistLoginCookies, flushCookies } from './naver-session.mjs';
// 수집 코어 — 앱 탭(modules/naver-ingest/module.mjs)과 웹(pair-server)이 같은 인스턴스를 쓴다.
import * as naverIngest from './modules/naver-ingest/service.mjs';
import { ComfyManager } from './comfy-manager.mjs';
import { OllamaManager } from './ollama-manager.mjs';
import { WorkerRunner } from './worker-runner.mjs';
import { AdRunner } from './ad-runner.mjs';
import { startPairServer } from './pair-server.mjs';
import { startGeneration, setEngineGate, isGenerating } from './allinone-runner.mjs';
import * as bootstrap from './bootstrap.mjs';
import { setupAutoUpdate, checkForUpdatesNow } from './auto-update.mjs';
import { loadModules } from './shell/registry.mjs';
import { openUrl } from './open-url.mjs';
import { maskPayload, maskInternalNames } from './mask-internal.mjs';

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

// ⚠️ 화면에 나가는 모든 문자열은 여기 한 곳을 지난다 — 내부 엔진·모델 이름을 기능 이름으로
//    치환해 내보낸다(영업비밀). 워커 stdout 을 그대로 흘리는 올인원 로그까지 여기서 걸린다.
function send(channel, payload) { win?.webContents.send(channel, maskPayload(payload)); }
function log(scope, message) { send('thumbnail-gpu:comfy-log', `[${scope}] ${message}`); }

/**
 * ── 엔진 유휴 해제(램 반납) ───────────────────────────────────────────────────
 * ComfyUI(SDXL)와 ollama 는 합쳐 5~10GB 를 문다. 예전엔 한 번 뜨면 **앱을 끌 때까지**
 * 절대 안 내려갔다 — 하루 종일 켜 두는 프로그램이 쓰지도 않는 램을 그만큼 붙들고 있었고,
 * 사용자가 다른 일(게임·영상·크롬)을 하려면 도우미를 통째로 꺼야 했다.
 * 이제 할 일이 하나도 없어지는 순간 둘 다 내린다. 다시 필요해지면 잡을 집은 루프가
 * ensureEngineFor 로 알아서 띄운다 — 사람이 누를 일은 없다.
 *
 * ⚠️ SETTLE 은 "즉시"를 깎으려는 값이 **아니라** 뜯었다 붙였다를 막는 최소 간격이다.
 *    재생성 잡은 0.7초마다 폴링으로 들어오고 웹에서 여러 건이 잇달아 떨어진다. 진짜 0초로
 *    내리면 잡과 잡 사이마다 5GB 모델을 다시 올리게 되어, 램은 못 돌려받고 대기시간만 늘어난다.
 *    0 으로 두면 정말 즉시 내린다(설정 engineIdleSettleMs).
 */
const ENGINE_IDLE_SETTLE_MS = 15_000;
const engineHold = new Set();      // 'thumb' | 'llm' | 'allinone'
let engineIdleTimer = null;

function holdEngines(tag) {
  engineHold.add(tag);
  if (engineIdleTimer) { clearTimeout(engineIdleTimer); engineIdleTimer = null; }
}

function releaseEngines(tag) {
  engineHold.delete(tag);
  scheduleEngineRelease();
}

function scheduleEngineRelease() {
  /**
   * ★ 안전망 — 붙잡기는 이벤트로 놓는데, 이벤트는 유실될 수 있다(루프가 예외로 죽거나,
   *   놓는 신호를 안 쏘고 끝나거나). 한 번 새면 엔진이 **영원히** 안 내려가고, 사용자에게는
   *   "안 쓰는데 계속 메모리를 물고 있다"로 보인다 — 이 기능의 존재 이유가 통째로 사라진다.
   *   그래서 놓을지 판단할 때마다 **실제로 그 일이 도는 중인지** 다시 확인한다.
   *   이벤트가 진실의 원천이 아니라, 프로세스/루프 상태가 진실의 원천이다.
   */
  if (engineHold.has('allinone') && !isGenerating()) engineHold.delete('allinone');
  if (engineHold.has('thumb') && !runner?.running) engineHold.delete('thumb');
  if (engineHold.has('llm') && !runner?.llmRunning) engineHold.delete('llm');
  if (engineHold.size) return;
  if (engineIdleTimer) clearTimeout(engineIdleTimer);
  const settle = Math.max(0, Number(store?.get('engineIdleSettleMs', ENGINE_IDLE_SETTLE_MS)) || 0);
  engineIdleTimer = setTimeout(() => {
    engineIdleTimer = null;
    if (engineHold.size) return;                 // 그 사이 새 작업이 들어왔다
    shutdownIdleEngines().catch(() => {});
  }, settle);
  engineIdleTimer.unref?.();
}

async function shutdownIdleEngines() {
  const freed = [];
  try { if (comfy?.proc) { await comfy.stop(); freed.push('ComfyUI'); } } catch { /* ignore */ }
  // ★ includeForeign — 이 PC 에 따로 깔린 ollama 가 포트를 물려받아 모델을 다시 올리면
  //   내린 의미가 없다(실측: 1초 만에 4.9GB 재적재). 반납할 때는 그쪽까지 정리한다.
  try {
    // 실제로 떠 있었을 때만 "내렸다"고 말한다 — 아무것도 없었는데 로그를 남기면 거짓말이 된다.
    const wasUp = !!ollama?.proc || !!(await ollama?.isUp());
    await ollama?.stop({ includeForeign: true });
    if (wasUp) freed.push('ollama');
  } catch { /* ignore */ }
  if (freed.length) {
    send('thumbnail-gpu:comfy-log',
      `[유휴] 할 일이 없어 ${freed.join(' · ')} 을(를) 내렸습니다 — 메모리를 돌려드립니다. 다음 작업 때 자동으로 다시 띄웁니다.`);
    updateTray();
  }
}

/**
 * 잡을 집은 루프가 부른다 — 필요한 엔진을 띄우고, 끝날 때까지 유휴 해제를 막는다.
 * @param {'thumb'|'llm'} tag
 */
async function ensureEngineFor(tag) {
  holdEngines(tag);
  if (tag === 'thumb') await comfy.start();
  else await ollama.start();
}

// ── 썸네일 워커 헬퍼 (모듈이 ctx.services 로 호출) ──
function onWorkerEvent(e) {
  // 엔진 유휴 판정 — 잡을 집으면 붙잡고, 큐가 비면 놓는다. 두 루프(썸네일·LLM)가
  //   같은 이벤트 모양을 쓰므로 여기 한 곳이면 둘 다 덮인다.
  const tag = e.scope === 'llm' ? 'llm' : 'thumb';
  if (e.type === 'claimed') holdEngines(tag);
  else if (e.type === 'idle' || e.type === 'finished' || e.type === 'stopped') releaseEngines(tag);

  if (e.type === 'claimed') stats.current = e.label;
  if (e.type === 'done') { stats.ok = e.ok; stats.processed = e.processed; stats.current = null; }
  if (e.type === 'error') { stats.fail = e.fail; stats.processed = e.processed; stats.current = null; }
  if (e.type === 'finished') stats.current = null;
  send('thumbnail-gpu:worker-event', e);
  updateTray();
}
async function startWorker() {
  if (!(await bootstrap.isInstalled(installDir))) throw new Error('엔진이 아직 설치되지 않았습니다.');
  // ★ 여기서 ComfyUI 를 미리 띄우지 않는다. 워커를 켠다고 잡이 있는 것은 아니라서,
  //   예전에는 앱을 켜 두기만 해도 SDXL 이 램에 상주했다. 이제 잡을 집은 순간
  //   루프가 ensureEngineFor('thumb') 로 띄운다(첫 잡만 기동 시간을 한 번 낸다).
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

  // VC++ 재배포 패키지 — GPU 유무·ComfyUI 설치 여부와 무관하게 항상 보장한다.
  //   누끼(BiRefNet CPU)와 CLIP 대표컷은 onnxruntime 을 쓰는데, 이게 낡으면 DLL 로드가
  //   조용히 실패해 원본 사진만 남는다(에러도 안 남). isInstalled() 조기반환보다 먼저 둔 이유.
  //   레지스트리 조회뿐이라 이미 충족되면 사실상 비용 0.
  try {
    await bootstrap.ensureVCRedist({
      installDir,
      onProgress: (p) => send('allinone:log', `[VC++] ${p.detail || p.phase}${p.pct != null && p.pct < 100 ? ' ' + p.pct + '%' : ''}`),
    });
  } catch { /* ensureVCRedist 는 throw 하지 않지만 방어 */ }

  if (await bootstrap.isInstalled(installDir)) return;
  autoInstallDone = true;
  try {
    const gpu = await bootstrap.checkGpu();
    if (!gpu.ok) {
      send('thumbnail-gpu:comfy-log',
        '[자동설치] NVIDIA GPU 미탐지 — AI 썸네일(이미지 생성 ~6.5GB)은 GPU가 필요해 자동설치를 생략합니다. ' +
        '텍스트 엔진만 준비합니다. GPU 장착 후 AI 썸네일 탭 "엔진 설치/확인"으로 받으세요.');
      await bootstrap.ensureOllama({
        installDir,
        onProgress: (p) => send('allinone:log', `[텍스트 엔진] ${p.detail || p.phase}${p.pct != null ? ' ' + p.pct + '%' : ''}`),
      });
      return;
    }
    send('thumbnail-gpu:comfy-log',
      '[자동설치] 최초 1회 엔진 자동 설치 시작 — 이미지 생성·누끼·텍스트 엔진을 한 번에 받습니다(수 GB, 백그라운드). ' +
      '완료되면 AI 썸네일이 자동 시작됩니다.');
    await installEngine(); // bootstrap.install(전체) → autoStartIfReady
  } catch (e) {
    send('thumbnail-gpu:comfy-log', '[자동설치] 실패 — AI 썸네일 탭 "엔진 설치/확인"으로 재시도하세요: ' + (e.message || e));
  }
}

/**
 * 로컬 모델 보장 — 텍스트·임베딩(ollama.start 내부) + 이미지 인식(여기서 추가).
 *   · 설치본/자동업데이트본 양쪽 모두 로그인 직후 1회 실행된다.
 *   · 실패해도 생성은 막지 않는다(첫 생성 때 run-folder 가 다시 시도한다).
 *
 * ⚠️ 이미지 인식 모델은 **GPU 유무와 무관하게 항상 받는다**(사용자 결정 2026-08-12).
 *    예전엔 nvidia-smi 로 GPU 를 못 찾으면 건너뛰었는데, 그 판정이 자주 틀렸다 —
 *    NVIDIA 카드가 있어도 nvidia-smi 가 PATH 에 없으면 "GPU 없음"으로 오판했고,
 *    그 PC 는 웹 배지가 영영 "미설치 · 생성 시 자동 설치" 인 채로 남았다
 *    (생성을 아무리 돌려도 같은 가드에 다시 걸리므로 그 안내 자체가 거짓이었다).
 *    이제 판정은 **속도 경고를 띄울지**에만 쓰고, 다운로드는 막지 않는다.
 *    받지 않으려면 설정에서 ollamaVisionModel 을 비우면 된다.
 */
let modelsEnsured = false;
async function ensureLocalModels() {
  if (modelsEnsured) return;
  modelsEnsured = true;
  try {
    await ollama.start();   // ollama 미설치면 설치·기동까지 + 텍스트(·임베딩) 모델 보장
    const visionModel = store.get('ollamaVisionModel', bootstrap.DEFAULTS.ollamaVisionModel);
    if (!visionModel) return;   // 사용자가 명시적으로 비운 경우만 생략
    const gpu = await bootstrap.checkGpu();
    if (!gpu.ok) {
      send('allinone:log', '[이미지 인식] GPU 가속을 찾지 못했습니다 — 모델(~6GB)은 그대로 설치하지만, '
        + '생성 시 상품당 수십 초~수 분이 걸릴 수 있습니다. (NVIDIA 그래픽카드가 있는데 이 메시지가 보이면 드라이버를 확인하세요)');
    } else {
      send('allinone:log', `[이미지 인식] ${gpu.name} 감지 — 인식 모델을 준비합니다.`);
    }
    await ollama.ensureModel(visionModel, '~6GB');
  } catch (e) {
    send('allinone:log', `[모델 준비] 실패 — 첫 생성 때 다시 시도합니다: ${e?.message || e}`);
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

  // ★ 로컬 모델(텍스트·임베딩·이미지 인식)은 **엔진 설치 여부와 무관하게** 보장한다.
  //   autoInstallIfNeeded() 는 "엔진 미설치" 일 때만 호출되므로(아래 180행), 이미 엔진이 깔린
  //   PC — 즉 **자동업데이트로 새 버전이 올라온 기존 사용자** — 는 그 경로를 영영 안 탄다.
  //   그래서 새로 추가된 이미지 인식 모델을 못 받는다. 로그인돼 있으면 여기서 1회 맞춘다.
  if (runner.loggedIn) void ensureLocalModels();

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
  // 네이버 예산 게이트 — 품절 감시(stock-monitor)와 소싱 수집(naver-ingest)이 공유한다.
  //   쿨다운을 디스크에 남겨, 밴 중에 앱을 재시작해도 그대로 쉬게 한다(재시작 회피 = 밴 악화).
  naverGate.init(userData);
  // 네이버 로그인 상태 캐시 — 크롬은 필요할 때만 뜨는데, 안 떠 있는 동안 "로그아웃"이라고
  //   답하면 앱을 켜자마자 화면이 로그인을 요구하고 품절 감시가 스마트스토어를 통째로 건너뛴다.
  initNaverSession(userData);
  // 네이버 로그인 쿠키 상시 유지 — 로그인은 사람이 손으로 하는 유일한 단계라 한 번으로 끝나야 한다.
  //   특정 탭(소싱)의 상태 폴링에 얹어 두었더니 그 화면을 안 여는 사람에겐 영영 안 돌았다 → 셸에서 건다.
  installCookiePersistence().catch(() => {});
  installDir = join(userData, 'engine');
  comfyPort = store.get('comfyPort', 8188);
  comfy = new ComfyManager(installDir, { port: comfyPort, onLog: (m) => send('thumbnail-gpu:comfy-log', m) });
  // ⚠️ 임베딩 모델(bge-m3, ~1.2GB)은 **카테고리 임베딩 인덱스가 실제로 동봉돼 있을 때만** 받는다.
  //    인덱스(cat-embeddings.*)는 용량 때문에 git 에서 제외돼 배포본에 들어가지 않는다
  //    → 지금까지 1.2GB 를 받아 놓고 한 번도 쓰지 못했다(첫 실행이 그만큼 느려짐).
  //    인덱스를 넣어 배포하면 이 조건이 자동으로 켜진다.
  const hasEmbedIndex = existsSync(join(appRoot, 'runtime', 'data', 'cat-embeddings.meta.json'));
  ollama = new OllamaManager(installDir, {
    model: store.get('ollamaModel', bootstrap.DEFAULTS.ollamaModel),
    embedModel: hasEmbedIndex ? store.get('ollamaEmbedModel', bootstrap.DEFAULTS.ollamaEmbedModel) : null,
    onLog: (m) => send('allinone:log', m),
  });
  runner = new WorkerRunner(userData, {
    onEvent: onWorkerEvent,
    appVersion: app.getVersion(),
    // 유휴일 때 내려간 엔진을, 잡을 집은 루프가 스스로 다시 띄우게 하는 통로.
    ensureEngine: ensureEngineFor,
    // pair 서버는 이 시점 뒤에 뜨므로 지연 평가 — 매 하트비트마다 현재 포트를 읽는다.
    getLocalEndpoint: () => (pair ? { port: pair.port, nonce: pair.nonce } : null),
  });
  ads = new AdRunner({ getSession: () => runner.session, onEvent: (e) => send('ads:event', e) });
  // 올인원 생성은 시작/종료 자리가 allinone-runner 안에 있다 — 게이트를 그쪽에 넘겨준다.
  setEngineGate({ hold: holdEngines, release: releaseEngines });
}

function buildContext() {
  return {
    app, ipcMain, shell, dialog,
    // 모듈은 shell.openExternal 대신 이걸 쓴다 — 크롬(로그인 세션 있는 브라우저)으로 연다.
    //  실패 시 내부에서 기본 브라우저로 폴백하므로 호출부는 신경 쓸 게 없다.
    openUrl: (url) => openUrl(url, shell, (m) => log('shell', m)),
    // 모듈이 사람을 불러야 할 때(로그인 필요·보안문자 등) 창을 앞으로 가져온다.
    // 트레이에 내려가 있으면 알림만으로는 아무 일도 일어나지 않는다.
    showWindow: () => {
      try {
        if (!win || win.isDestroyed()) return false;
        if (win.isMinimized()) win.restore();
        win.show(); win.focus();
        return true;
      } catch { return false; }
    },
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
    account: runner.account, // { email, userId, role } | null — 어느 계정으로 연결됐는지
    sessionError: runner.sessionError, // 끊긴 이유(있으면 렌더러가 빨간 안내로 표시)
    webOrigin: WEB_ORIGIN,
    appTitle: APP_TITLE,
    appVersion: app.getVersion(),
  }));
  // 로그아웃 — 저장 세션을 지우고 루프·하트비트를 멈춘다(하트비트는 session null 이면 자동 중단).
  //   이후 "메가로드 연결"로 다른 계정 페어링 가능. 웹 표시등도 곧 미연결로 바뀐다.
  ipcMain.handle('shell:logout', async () => {
    await runner.logout();
    pair?.resetPaired?.();
    return true;
  });
  ipcMain.handle('shell:pair-open', () => {
    if (!pair) throw new Error('페어링 서버 준비 안 됨');
    // 크롬으로 연다 — 기본 브라우저(Edge 등)엔 메가로드 로그인 세션이 없어
    // 페어링 화면에서 다시 로그인해야 하는 일이 생긴다.
    void openUrl(`${WEB_ORIGIN}/worker/activate?port=${pair.port}&nonce=${encodeURIComponent(pair.nonce)}`, shell);
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
  manifest.invokable.push('shell:state', 'shell:pair-open', 'shell:logout', 'shell:open-data', 'shell:asset', 'shell:selftest', 'shell:check-update', 'shell:open-update-log');
  // shell:focus-module — 모듈이 "사람이 지금 이 화면을 봐야 한다"고 말할 수 있는 통로.
  //   품절 감시처럼 뒤에서 도는 기능은 막혀도 아무도 모른 채 며칠이 간다(실측된 실패 방식).
  manifest.events.push('shell:pair-done', 'shell:focus-module');
  registerShellIpc(manifest);

  // OS 시작 시 자동 실행 등록 (다운로드 후 일일이 안 켜도 부팅마다 백그라운드 상주).
  // ⚠️ args 는 Windows 전용 옵션이다 — 맥에서는 무시되므로 창이 그대로 뜬다.
  //    맥의 대응 옵션은 openAsHidden 이고, 부팅 실행 여부는 wasOpenedAtLogin(맥 전용)으로 안다.
  try { app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true, args: ['--hidden'] }); }
  catch { /* 비지원 환경 무시 */ }
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
  // ⭐ 셸 하트비트는 워커 루프와 무관하게 항상 돈다 → 웹이 도우미를 발견하는 가장 확실한 지점.
  //    그래서 앱 버전(구버전 안내용)과 로컬 서버 주소(올인원 결과 직독용)를 여기서도 보낸다.
  //    p_* 는 서버 함수에서 DEFAULT 라, 마이그레이션 전이어도 이 호출은 그대로 동작한다.
  //
  // ⚠️ 실패를 삼키지 않는다 — 과거엔 .catch(()=>{}) 로 무음이었다. 그 결과:
  //    세션(리프레시 토큰)이 죽으면 하트비트만 조용히 멈추는데, loggedIn 은 "세션 객체가 있냐"라
  //    앱은 계속 "✅ 메가로드 연결됨"을 보여줬다. 사용자에겐 앱이 멀쩡해 보이는데
  //    웹에선 로컬 서버 주소(port/nonce)가 갱신 안 돼 올인원 폴더 선택이 막힌다
  //    (실측: 세션 만료 1분 뒤 하트비트 정지 → 10시간 동안 아무도 모름).
  //    → 인증이 영구히 깨졌으면 세션을 버리고 UI 를 "미연결"로 되돌려 재연결을 유도한다.
  let hbFailStreak = 0;
  const sendHeartbeat = () => {
    if (!runner?.session) return;
    rpc(runner.session, 'worker_heartbeat', {
      p_worker_id: SHELL_WORKER_ID,
      p_hostname: hostname(),
      p_app_version: app.getVersion(),
      p_local_endpoint: pair ? { port: pair.port, nonce: pair.nonce } : null,
    }).then(() => {
      if (hbFailStreak) { hbFailStreak = 0; runner.clearSessionError(); }
    }).catch((e) => {
      hbFailStreak++;
      // 영구(리프레시 토큰 폐기) → 즉시 확정. 일시 오류라도 10회(=5분) 연속이면 사실상 죽은 것.
      const dead = isPermanentAuthError(e) || hbFailStreak >= 10;
      const why = isPermanentAuthError(e)
        ? '메가로드 로그인 세션이 만료됐습니다.'
        : `메가로드 서버에 ${hbFailStreak}회 연속 연결 실패했습니다.`;
      send('thumbnail-gpu:comfy-log', `[연결] 하트비트 실패(${hbFailStreak}회): ${e?.message || e}`);
      if (!dead) return;
      void runner.invalidateSession(`${why} 사이드바의 "메가로드 연결"을 눌러 다시 연결해 주세요.`).then(() => {
        hbFailStreak = 0;
        try {
          new Notification({ title: APP_TITLE, body: `${why} 앱을 열어 다시 연결해 주세요 — 그때까지 올인원·썸네일·재생성이 동작하지 않습니다.` }).show();
        } catch { /* 알림 미지원 무시 */ }
      });
    });
  };

  // 저장된 세션 자동 복구 — 부팅 직후 네트워크가 아직 안 올라와도 자가치유하도록 재시도.
  //   한 번 실패에 포기하면(과거 동작) "재부팅하면 매번 미연결"이 된다. 일시 오류면
  //   10→20→…→60초 백오프로 계속 재시도하고, 복구할 세션 자체가 없을(false) 때만 멈춘다.
  const restoreSessionWithRetry = async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        const ok = await runner.tryRestoreSession(SUPABASE_URL, SUPABASE_ANON_KEY);
        if (ok) { sendHeartbeat(); autoStartIfReady(); }
        return; // 성공 or "복구할 세션 없음(재페어링 필요)" → 재시도 중단
      } catch (e) {
        const wait = Math.min(60_000, 10_000 * (attempt + 1));
        send('thumbnail-gpu:comfy-log',
          `[세션] 자동 복구 일시 실패 — ${Math.round(wait / 1000)}초 뒤 재시도합니다: ${e?.message || e}`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  };
  // 백그라운드로 돌린다(await 금지) — 오프라인이어도 아래 페어링 서버가 떠서
  // 사용자가 수동 재연결은 언제든 할 수 있어야 하기 때문.
  void restoreSessionWithRetry();

  // 로컬 서버 — ① 웹이 세션 토큰 전달(페어링) ② 웹 올인원 화면이 생성결과·이미지 직독
  pair = await startPairServer({
    // 업로드·생성물을 userData 하위(영속)에 둔다 — tmpdir 은 재시작·정리에 사라져
    // 방금 만든 결과까지 날아갔다(실측: 앱 재시작 후 lastAllinoneFolder manifest 404).
    dataDir: app.getPath('userData'),
    // /health 가 신원과 함께 알려준다 — 웹이 "이 PC 도우미"를 DB 없이 확정하는 데 쓴다.
    appVersion: app.getVersion(),
    // 올인원 생성을 끝낸 폴더 → 웹이 폴더를 다시 고르지 않아도 결과를 읽어간다.
    getAllinoneFolder: () => store.get('lastAllinoneFolder', null),
    // 웹 사이드바 '최신으로 업데이트' 버튼 → 앱 내부 자동업데이트 확인/적용을 킥.
    onCheckUpdate: () => checkForUpdatesNow(() => win),
    // 웹 '네이버 소싱' 화면이 이 통로로 수집을 조종한다. 수집 코어(창 풀)는 service 가 단독
    // 소유하므로, 앱 탭과 웹 어느 쪽에서 조작해도 수집기는 한 벌만 돈다.
    naverIngest,
    // 웹 업로드 생성 — 웹이 소싱폴더를 업로드한 임시폴더로 올인원 생성 실행.
    //   웹이 이미 검수화면에 있으므로 브라우저 자동열기는 안 한다(gen-status 폴링으로 자동 로드).
    onGenerate: (folder, { noThumb, onDone, onProgress, onReviewReady } = {}) => startGeneration({
      services: { ollama, comfy, webOrigin: WEB_ORIGIN },
      paths: { appRoot, userData: app.getPath('userData') },
      store, send, folder, noThumb, onDone, onProgress,
      // 웹에서 시작한 생성도 "검수 시작 가능" 시점을 따로 알린다 — 누끼는 그 뒤에도 계속 돈다.
      onReviewReady,
    }),
    // 웹이 "이 도우미가 지금 로그인돼 있나"를 /health 로 물어볼 수 있게 한다.
    //   세션이 죽었을 때만 웹이 조용히 재페어링하므로, 이 값이 곧 자동 재연결의 방아쇠다.
    getSessionState: () => ({ loggedIn: runner.loggedIn, account: runner.account }),
    onPair: async (tokens, { silent = false } = {}) => {
      await runner.pair(SUPABASE_URL, SUPABASE_ANON_KEY, tokens);
      send('shell:pair-done', true);
      // 사람이 "메가로드 연결"을 눌러 온 경우에만 창을 띄운다. 웹이 자동으로 붙인
      // 재연결(silent)에서 창을 띄우면 브라우저를 쓰던 사용자에게서 포커스를 뺏는다.
      if (!silent) { win?.show(); win?.focus(); }
      sendHeartbeat();
      autoStartIfReady();
    },
  });

  sendHeartbeat();
  setInterval(sendHeartbeat, 30_000);
  /**
   * ★ 유휴 반납 스윕 — 위 안전망은 releaseEngines() 가 불릴 때만 도는데, 붙잡기가 **샌**
   *   경우엔 그 호출 자체가 오지 않는다. 그러면 안전망이 있어도 영영 실행되지 않는다.
   *   주기적으로 한 번씩 두드려, 새더라도 1분 안에 스스로 회복하게 한다.
   *   (주기 60초 > 안정화 15초라 타이머가 밀려 굶는 일은 없다.)
   */
  const sweep = setInterval(() => { try { scheduleEngineRelease(); } catch { /* ignore */ } }, 60_000);
  sweep.unref?.();
  autoStartIfReady();
}).catch((e) => {
  // 시작 중 예외가 나면 조용히 죽지 않고 원인을 보여준다(= "아무것도 안 뜸" 방지/진단).
  try { dialog.showErrorBox('메가로드 도우미 시작 오류', String(e?.stack || e?.message || e)); } catch { /* ignore */ }
});

app.on('before-quit', async (e) => {
  if (app.isQuitting) return;
  app.isQuitting = true;
  e.preventDefault();
  // ★ 끄기 직전에 네이버 쿠키에 만료시각을 다시 찍는다. 세션 쿠키로 남아 있으면 브라우저가
  //   닫히는 순간 사라져 다음 실행이 로그아웃으로 시작하고, 그 로그인 시도가 곧 캡차다.
  //   쿠키 조작은 네트워크 요청이 0회라 종료가 느려질 일도 없다.
  try { await persistLoginCookies(); await flushCookies(); } catch { /* ignore */ }
  // ★ 크롬을 반드시 닫는다. 네이버 접속이 전부 크롬이라, 안 닫으면 도우미를 껐는데도 크롬이
  //   프로필을 쥔 채 남아 다음 실행이 "도우미용 크롬이 이미 떠 있습니다" 로 시작한다.
  //   (모듈 onQuit 훅은 shell/registry.mjs 가 호출하지 않으므로 여기서 직접 부른다)
  try { await naverIngest.shutdown(); } catch { /* ignore */ }
  try { ads?.stop(); await runner?.stopLlmLoop(); await stopWorker(); await comfy.stop(); await ollama?.stop(); await pair?.close(); } catch { /* ignore */ }
  app.quit();
});

app.on('window-all-closed', () => { /* 트레이 상주 */ });
