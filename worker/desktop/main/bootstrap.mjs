/**
 * 첫 실행 설치기 — Windows / macOS 양쪽 지원.
 *
 *   Windows : NVIDIA 점검 → ComfyUI 포터블(임베디드 파이썬 동봉) 7z 해제 → 모델 다운로드
 *   macOS   : Metal 점검 → 독립 파이썬 + ComfyUI 소스 + torch(MPS) 구성 → 모델 다운로드
 *
 * 맥에는 ComfyUI 포터블 배포판이 없다(윈도 전용 임베디드 파이썬을 동봉한 것이라서).
 * 그래서 맥에서는 python-build-standalone 으로 격리 파이썬을 깔고 소스를 직접 세운다.
 * 시스템 파이썬을 쓰지 않는 이유: macOS 기본 python3 는 Xcode CLT 설치를 요구하고,
 * homebrew 파이썬은 사용자마다 유무·버전이 제각각이라 설치 성공률이 들쭉날쭉하다.
 *
 * 모든 단계는 onProgress({ phase, pct, detail }) 로 진행률을 보고한다.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, stat, readdir, rm, rename, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { totalmem, freemem, cpus } from 'node:os';
import { path7za } from '7zip-bin';

// ── 플랫폼 ──────────────────────────────────────────────────────────────────
export const IS_WIN = process.platform === 'win32';
export const IS_MAC = process.platform === 'darwin';
/**
 * Apple Silicon 여부 — Metal(MPS) 가속이 되는 유일한 맥이다.
 * Intel 맥은 torch 가 CPU 로만 돌아 SDXL 한 장에 수 분이 걸린다(사실상 사용 불가).
 * 그래서 이미지 엔진은 Apple Silicon 에서만 설치한다 — 8GB 를 받아놓고 못 쓰는 게 더 나쁘다.
 */
export const IS_APPLE_SILICON = IS_MAC && process.arch === 'arm64';

// 환경마다 릴리스 자산명이 바뀔 수 있어 settings 로 override 가능 (main 에서 주입).
export const DEFAULTS = {
  comfyArchiveUrl: 'https://github.com/comfyanonymous/ComfyUI/releases/latest/download/ComfyUI_windows_portable_nvidia.7z',
  modelUrl: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors?download=true',
  modelFileName: 'sd_xl_base_1.0.safetensors',
  // 이미지 생성 가속용 SDXL Lightning 8스텝 LoRA (~400MB) — img2img 워크플로가 26→8스텝(약 2배 빠름).
  loraUrl: 'https://huggingface.co/ByteDance/SDXL-Lightning/resolve/main/sdxl_lightning_8step_lora.safetensors?download=true',
  loraFileName: 'sdxl_lightning_8step_lora.safetensors',
  // 대표이미지 자동 누끼용 ComfyUI 커스텀 노드(InspyrenetRembg) — custom_nodes 에 설치.
  // 인페인트 워크플로가 이 노드로 사진→상품 마스크를 만들어 배경만 흰 스튜디오로 재생성한다.
  rembgNodeUrl: 'https://github.com/john-mnz/ComfyUI-Inspyrenet-Rembg/archive/refs/heads/main.zip',
  // 텍스트 생성용 ollama 포터블 바이너리(zip) + 기본 모델. 올인원의 노출명·카테고리·옵션·상세·가격 생성에 필요.
  // run-folder.mjs 기본 모델과 일치시켜 모델 불일치(미보유) 방지.
  ollamaZipUrl: 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip',
  ollamaModel: 'exaone3.5:7.8b',
  // 카테고리 의미매칭 임베딩 모델. cat-embeddings.meta.json 이 이 모델로 빌드됨 —
  // 미설치면 임베딩 매처가 404 → 토큰매칭으로 조용히 저하(카테고리 오분류). 반드시 함께 pull.
  ollamaEmbedModel: 'bge-m3',
  // 이미지 인식(대표/상세컷 선별) 모델 ~6GB. 예전엔 설치 목록에 없어서 **첫 올인원 생성 때**
  // run-folder 가 그제서야 pull 했고, 설치만 하고 생성을 안 돌린 PC 는 계속 미설치였다
  // (웹 뱃지가 그 상태를 "도우미 업데이트 필요" 로 오표시하기도 했다). 이제 설치·자동업데이트
  // 단계에서 함께 받는다. GPU 없는 PC 는 CPU 로 사실상 못 돌리므로 받지 않는다(용량 낭비 방지).
  ollamaVisionModel: 'qwen2.5vl:7b',
  // VC++ 2015-2022 재배포 패키지(x64). onnxruntime-node(@huggingface/transformers)가 이걸 요구한다 —
  // 없거나 낡으면 onnxruntime_binding.node 가 "DLL initialization routine failed" 로 로드 실패하고,
  // 그 결과 누끼(BiRefNet CPU)·CLIP 대표컷이 에러 없이 조용히 꺼진다(원본 사진만 남아 눈치채기 어려움).
  vcRedistUrl: 'https://aka.ms/vs/17/release/vc_redist.x64.exe',
  // onnxruntime 1.21 기준 안전선. 14.29(VS2019) 에서 실패 확인됨.
  vcRedistMinMinor: 40,

  // ── macOS 전용 ────────────────────────────────────────────────────────────
  // ollama 맥 배포본은 유니버설 바이너리(arm64+x64 한 파일) 하나뿐이다 → 아키텍처 분기 불필요.
  ollamaDarwinUrl: 'https://github.com/ollama/ollama/releases/latest/download/ollama-darwin.tgz',
  // 맥용 ComfyUI 포터블이 없으므로 소스 아카이브를 받아 직접 세운다.
  comfySourceUrl: 'https://github.com/comfyanonymous/ComfyUI/archive/refs/heads/master.zip',
  // python-build-standalone — 자산명에 "버전+빌드날짜"가 박혀 있어 latest/download 가 통하지 않는다.
  //   반드시 고정 태그로 핀한다(재현 가능 + 자산명 변경으로 인한 404 방지).
  pythonDarwinTag: '20260807',
  pythonDarwinVersion: '3.11.15',
};

/** macOS 독립 파이썬 tarball URL — 아키텍처(arm64/x64)에 따라 자산명이 다르다. */
export function pythonDarwinUrl(u = DEFAULTS) {
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  const name = `cpython-${u.pythonDarwinVersion}+${u.pythonDarwinTag}-${arch}-apple-darwin-install_only.tar.gz`;
  // 파일명의 '+' 는 경로 세그먼트에서는 리터럴이지만, 프록시·CDN 이 쿼리 규칙으로 오해해
  // 공백으로 바꾸는 사례가 있어 명시적으로 인코딩한다.
  return `https://github.com/astral-sh/python-build-standalone/releases/download/${u.pythonDarwinTag}/${name.replace('+', '%2B')}`;
}

const exists = (p) => stat(p).then(() => true, () => false);

/**
 * 로컬 GPU 엔진 스택이 이 OS 에서 설치 가능한가.
 *
 * 이 부트스트랩이 받는 것들은 전부 Windows 전용 산출물이다:
 *   ComfyUI_windows_portable_nvidia.7z · ollama-windows-amd64.zip · vc_redist.x64.exe
 * 게다가 GPU 점검은 nvidia-smi 에 의존하는데 요즘 맥에는 NVIDIA GPU 가 없다.
 *
 * 맥 빌드에서 이 가드가 없으면 앱이 Windows 용 zip 을 수백 MB 받아놓고 실행에 실패한다
 * (바깥 try/catch 덕에 죽지는 않지만 사용자 대역폭·시간만 버린다).
 * → 애초에 시도하지 않고 조용히 건너뛴다.
 */
export function localEngineSupported() {
  return IS_WIN || IS_MAC;
}

/**
 * 이미지 생성(ComfyUI + SDXL + 누끼) 을 이 기기에서 쓸 수 있는가.
 * 텍스트/비전(ollama)과 달리 GPU 가속이 없으면 실사용이 불가능하다:
 *   Windows  — NVIDIA(CUDA)
 *   macOS    — Apple Silicon(Metal/MPS). Intel 맥은 CPU 뿐이라 제외.
 */
export function imageEngineSupported() {
  return IS_WIN || IS_APPLE_SILICON;
}

/**
 * Apple Silicon 이 GPU 로 실제로 쓸 수 있는 통합 메모리 비율(보수적).
 * macOS 는 기본적으로 총 메모리의 2/3~3/4 까지 GPU 에 내주지만, OS·앱 몫을 빼고
 * SDXL 과 LLM 이 번갈아 올라가는 상황을 감안해 0.6 으로 잡는다.
 *   8GB  → 4.8GB  (작은 모델 — 7.8B 를 올리면 스왑)
 *   16GB → 9.6GB  (7.8B + 슬롯 2)
 *   24GB → 14.4GB (7.8B + 슬롯 3)
 */
const MAC_UNIFIED_USABLE = 0.6;

/**
 * Apple Silicon GPU 점검.
 * 통합 메모리라 VRAM 이 따로 없다 — GPU 가 시스템 RAM 을 그대로 쓴다.
 *
 * ⚠️ **freemem() 을 그대로 쓰면 안 된다.** macOS 는 남는 RAM 을 전부 페이지 캐시로 잡아
 *    freemem() 이 16GB 기기에서도 1~3GB 로 보고된다(캐시는 필요할 때 즉시 회수된다).
 *    그런데 호출부는 이 값으로 모델 크기와 동시 슬롯을 정한다:
 *      pickGenProfile  — vramFreeMb >= 5000 이라야 7.8B, < 1500 이면 '부족' 취급
 *      pickNumParallel — >= 8000 이라야 슬롯 2 이상
 *    즉 freemem() 을 믿으면 **성능 좋은 맥이 전부 저사양으로 강등**된다(모델·동시성 동시 하락).
 *    → 통합 메모리의 실사용 가능분을 기준으로 삼고, 실제 free 가 그보다 크면 그걸 쓴다.
 */
function checkGpuMac() {
  if (!IS_APPLE_SILICON) return { ok: false, name: null, vramMb: 0, vramFreeMb: 0 };
  const mb = (b) => Math.round(b / (1024 * 1024));
  const total = mb(totalmem());
  return {
    ok: true,
    name: `${cpus()[0]?.model || 'Apple Silicon'} (Metal)`,
    vramMb: total,
    vramFreeMb: Math.max(mb(freemem()), Math.floor(total * MAC_UNIFIED_USABLE)),
  };
}

/** NVIDIA 드라이버/ GPU 점검 (nvidia-smi). vramMb=총량, vramFreeMb="지금 남은" VRAM. */
export function checkGpu() {
  if (IS_MAC) return Promise.resolve(checkGpuMac());
  // Windows·맥 외에서는 nvidia-smi 를 찾을 이유가 없다(불필요한 spawn 방지).
  if (!IS_WIN) return Promise.resolve({ ok: false, name: null, vramMb: 0, vramFreeMb: 0 });
  return new Promise((resolve) => {
    const p = spawn('nvidia-smi', ['--query-gpu=name,memory.total,memory.free', '--format=csv,noheader'], { shell: true });
    let out = '';
    p.stdout?.on('data', (d) => (out += d));
    p.on('error', () => resolve({ ok: false, name: null, vramMb: 0, vramFreeMb: 0 }));
    p.on('close', (code) => {
      if (code === 0 && out.trim()) {
        // 예: "NVIDIA GeForce RTX 4060 Ti, 16380 MiB, 844 MiB"
        const first = out.trim().split('\n')[0].trim();
        const parts = first.split(',');
        const name = (parts[0] || '').trim();
        const num = (s) => { const m = String(s || '').match(/([\d.]+)\s*MiB/i); return m ? Math.round(parseFloat(m[1])) : 0; };
        resolve({ ok: true, name, vramMb: num(parts[1]), vramFreeMb: num(parts[2]) });
      } else resolve({ ok: false, name: null, vramMb: 0, vramFreeMb: 0 });
    });
  });
}

/**
 * ComfyUI 실행 루트.
 *   Windows — 포터블 압축을 풀면 생기는 ComfyUI_windows_portable (run_*.bat 가 있는 곳)
 *   macOS   — 소스를 그대로 둔 ComfyUI
 */
export function comfyRoot(installDir) {
  return join(installDir, IS_WIN ? 'ComfyUI_windows_portable' : 'ComfyUI');
}
/**
 * main.py·models·custom_nodes 가 있는 ComfyUI 본체 폴더.
 * 윈도 포터블은 루트 안에 ComfyUI/ 가 한 겹 더 있고, 맥 소스 배치는 루트가 곧 본체다.
 * (이 한 겹 차이 때문에 모델 경로가 어긋나면 SDXL 을 받아놓고도 체크포인트가 안 보인다.)
 */
export function comfyAppDir(installDir) {
  return IS_WIN ? join(comfyRoot(installDir), 'ComfyUI') : comfyRoot(installDir);
}
export function checkpointsDir(installDir) {
  return join(comfyAppDir(installDir), 'models', 'checkpoints');
}
export function lorasDir(installDir) {
  return join(comfyAppDir(installDir), 'models', 'loras');
}
export function customNodesDir(installDir) {
  return join(comfyAppDir(installDir), 'custom_nodes');
}
export function ollamaDir(installDir) {
  return join(installDir, 'ollama');
}
export function ollamaExePath(installDir) {
  return join(ollamaDir(installDir), IS_WIN ? 'ollama.exe' : 'ollama');
}
/** ComfyUI·pip 를 돌릴 파이썬 실행파일. */
export function embeddedPython(installDir) {
  return IS_WIN
    ? join(comfyRoot(installDir), 'python_embeded', 'python.exe')
    : join(installDir, 'python', 'bin', 'python3');
}

/**
 * 포터블 ollama 바이너리 보장 — idempotent. ollama.exe 가 없으면 zip 다운로드·해제.
 * (모델은 서버 기동 후 OllamaManager.ensureModel 에서 받는다.) 실패 시 throw.
 */
export async function ensureOllama({ installDir, url, onProgress = () => {} } = {}) {
  if (!localEngineSupported()) {
    onProgress({ phase: 'ollama', pct: 100, detail: '이 운영체제에서는 로컬 텍스트 엔진을 지원하지 않습니다' });
    return null;
  }
  // 맥은 유니버설 tgz, 윈도는 zip — 호출부가 url 을 안 주면 플랫폼 기본값을 쓴다.
  const src = url || (IS_WIN ? DEFAULTS.ollamaZipUrl : DEFAULTS.ollamaDarwinUrl);
  const exe = ollamaExePath(installDir);
  if (await exists(exe)) { onProgress({ phase: 'ollama', pct: 100, detail: 'ollama 이미 설치됨' }); return exe; }
  const dir = ollamaDir(installDir);
  await mkdir(dir, { recursive: true });
  const archive = join(installDir, IS_WIN ? 'ollama_portable.zip' : 'ollama_portable.tgz');
  onProgress({ phase: 'ollama-download', pct: 0, detail: 'ollama 다운로드(~수백MB)' });
  await downloadFile(src, archive, (pct) => onProgress({ phase: 'ollama-download', pct }));
  onProgress({ phase: 'ollama-extract', pct: 0, detail: 'ollama 설치' });
  if (IS_WIN) await extract7z(archive, dir, (pct) => onProgress({ phase: 'ollama-extract', pct }));
  else await extractTarGz(archive, dir);
  await rm(archive, { force: true });
  // tar 는 권한을 보존하지만, 압축본에 실행비트가 빠져 있으면 spawn 이 EACCES 로 죽는다.
  if (!IS_WIN) await chmod(exe, 0o755).catch(() => {});
  onProgress({ phase: 'ollama', pct: 100, detail: 'ollama 준비 완료' });
  return exe;
}
/**
 * 설치된 VC++ 2015-2022 재배포 패키지(x64) 버전 조회.
 * @returns {Promise<{major:number, minor:number, raw:string}|null>} 미설치면 null
 */
export function checkVCRedist() {
  return new Promise((resolve) => {
    const p = spawn('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64', '/v', 'Version'],
      { windowsHide: true });
    let out = '';
    p.stdout?.on('data', (d) => (out += d));
    p.on('error', () => resolve(null));
    p.on('close', () => {
      // 예: "    Version    REG_SZ    v14.51.36247.00"
      const m = out.match(/v?(\d+)\.(\d+)\.[\d.]+/);
      resolve(m ? { major: Number(m[1]), minor: Number(m[2]), raw: m[0] } : null);
    });
  });
}

/**
 * VC++ 재배포 패키지 보장 — idempotent. 없거나 minor 가 기준 미만이면 다운로드 후 설치.
 * ⚠️ 설치 관리자가 관리자 권한을 요구하므로 UAC 프롬프트가 뜬다(사용자 승인 필요).
 * ⚠️ 실패해도 throw 하지 않는다 — 누끼만 못 쓰고 텍스트 생성은 정상 동작하므로 설치를 막지 않는다.
 * @returns {Promise<boolean>} 최종적으로 요건을 만족하면 true
 */
export async function ensureVCRedist({ installDir, url = DEFAULTS.vcRedistUrl, minMinor = DEFAULTS.vcRedistMinMinor, onProgress = () => {} } = {}) {
  // VC++ 재배포 패키지는 Windows 개념이다 — 다른 OS 에서는 레지스트리 조회부터 무의미.
  if (!IS_WIN) return true;
  try {
    const cur = await checkVCRedist();
    if (cur && (cur.major > 14 || (cur.major === 14 && cur.minor >= minMinor))) {
      onProgress({ phase: 'vcredist', pct: 100, detail: `VC++ 재배포 패키지 확인됨 (${cur.raw})` });
      return true;
    }
    const why = cur ? `설치본 ${cur.raw} 이 낡음(14.${minMinor} 이상 필요)` : '미설치';
    onProgress({ phase: 'vcredist-download', pct: 0, detail: `VC++ 재배포 패키지 ${why} — 다운로드(~25MB)` });
    await mkdir(installDir, { recursive: true });
    const exe = join(installDir, 'vc_redist.x64.exe');
    await downloadFile(url, exe, (pct) => onProgress({ phase: 'vcredist-download', pct }));

    onProgress({ phase: 'vcredist-install', pct: 0, detail: 'VC++ 재배포 패키지 설치 — 관리자 권한 창(UAC)이 뜨면 승인하세요' });
    // vc_redist.x64.exe 는 매니페스트로 스스로 승격을 요청한다 → 별도 elevate 불필요.
    const code = await new Promise((resolve) => {
      const p = spawn(exe, ['/install', '/quiet', '/norestart'], { windowsHide: true });
      p.on('error', () => resolve(-1));
      p.on('close', (c) => resolve(c));
    });
    await rm(exe, { force: true });

    // 0=성공, 3010=성공(재부팅 필요), 1638=더 최신 버전이 이미 설치됨
    if (code === 0 || code === 3010 || code === 1638) {
      onProgress({ phase: 'vcredist', pct: 100, detail: code === 3010 ? 'VC++ 설치 완료(재부팅 후 적용)' : 'VC++ 재배포 패키지 준비 완료' });
      return true;
    }
    // 1602 = 사용자가 UAC 취소
    onProgress({ phase: 'vcredist', pct: 100, detail: code === 1602
      ? 'VC++ 설치 취소됨 — 누끼·AI 대표컷이 비활성화됩니다(텍스트 생성은 정상)'
      : `VC++ 설치 실패(코드 ${code}) — 누끼·AI 대표컷 비활성화` });
    return false;
  } catch (e) {
    onProgress({ phase: 'vcredist', pct: 100, detail: `VC++ 준비 생략(${String(e.message).slice(0, 60)}) — 누끼 비활성화 가능` });
    return false;
  }
}

/**
 * 파이썬으로 명령 실행 (pip 등). 실패 시 reject.
 * @param {(line:string)=>void} [onLine] 진행 표시용 — torch 설치는 수 GB·수 분이라
 *        아무 출력도 없으면 앱이 멈춘 것처럼 보인다. pip 의 상태줄을 그대로 흘려보낸다.
 */
function runPython(py, args, cwd, onLine) {
  return new Promise((resolve, reject) => {
    const p = spawn(py, args, { cwd, windowsHide: true });
    let err = '';
    const feed = (d) => {
      const s = String(d);
      if (onLine) for (const l of s.split(/\r?\n/)) { const t = l.trim(); if (t) onLine(t); }
      return s;
    };
    p.stdout?.on('data', feed);
    p.stderr?.on('data', (d) => { err += feed(d); });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`pip 실패(${code}): ${err.slice(-300)}`))));
  });
}

/** 커스텀 노드의 requirements.txt 를 임베디드 파이썬으로 설치(있을 때만). */
async function installNodeDeps(installDir, nodeDir, onProgress) {
  const py = embeddedPython(installDir);
  const req = join(nodeDir, 'requirements.txt');
  if (!(await exists(py)) || !(await exists(req))) return;
  onProgress({ phase: 'rembg-deps', pct: 0, detail: '누끼 노드 의존성 설치(pip, 수 분 소요)' });
  await runPython(py, ['-s', '-m', 'pip', 'install', '-r', req], comfyRoot(installDir));
}

/**
 * 누끼 커스텀 노드(InspyrenetRembg) 보장 — idempotent.
 * custom_nodes 에 이미 있으면 의존성만 보장 후 스킵, 없으면 zip 다운로드·해제 + pip 설치.
 * ⚠️ 실패해도 throw 하지 않는다(누끼 노드 없으면 워커가 원본 사진으로 폴백 + 안내).
 */
export async function ensureRembgNode({ installDir, url = DEFAULTS.rembgNodeUrl, onProgress = () => {} } = {}) {
  try {
    const cnDir = customNodesDir(installDir);
    await mkdir(cnDir, { recursive: true });
    const present = (await readdir(cnDir).catch(() => [])).find((d) => d.toLowerCase().includes('inspyrenet'));
    if (present) {
      await installNodeDeps(installDir, join(cnDir, present), onProgress);
      onProgress({ phase: 'rembg', pct: 100, detail: '누끼 노드 이미 설치됨' });
      return true;
    }
    onProgress({ phase: 'rembg-download', pct: 0, detail: '누끼 노드(Inspyrenet) 다운로드' });
    const zip = join(installDir, 'inspyrenet_node.zip');
    await downloadFile(url, zip, (pct) => onProgress({ phase: 'rembg-download', pct }));
    onProgress({ phase: 'rembg-extract', pct: 0, detail: '누끼 노드 설치' });
    await extract7z(zip, cnDir, (pct) => onProgress({ phase: 'rembg-extract', pct }));
    await rm(zip, { force: true });
    const dir = (await readdir(cnDir)).find((d) => d.toLowerCase().includes('inspyrenet'));
    if (dir) await installNodeDeps(installDir, join(cnDir, dir), onProgress);
    onProgress({ phase: 'rembg', pct: 100, detail: '누끼 노드 준비 완료' });
    return true;
  } catch (e) {
    onProgress({ phase: 'rembg', pct: 100, detail: `누끼 노드 자동설치 실패(${String(e.message).slice(0, 60)}) — ComfyUI-Manager 에서 'Inspyrenet' 수동 설치` });
    return false;
  }
}

/** 설치 완료 여부 — 실행 진입점(윈도: bat / 맥: main.py+파이썬) + 체크포인트 1개 이상 */
export async function isInstalled(installDir) {
  const root = comfyRoot(installDir);
  const hasRunner = IS_WIN
    ? (await exists(join(root, 'run_nvidia_gpu.bat'))) || (await exists(join(root, 'run_cpu.bat')))
    : (await exists(join(comfyAppDir(installDir), 'main.py'))) && (await exists(embeddedPython(installDir)));
  if (!hasRunner) return false;
  try {
    const files = await readdir(checkpointsDir(installDir));
    return files.some((f) => f.endsWith('.safetensors') || f.endsWith('.ckpt'));
  } catch { return false; }
}

/** 진행률 스트리밍 다운로드 */
async function downloadFile(url, dest, onProgress) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`다운로드 실패 ${res.status}: ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let received = 0;
  const reader = res.body.getReader();
  const stream = new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) { this.push(null); return; }
      received += value.length;
      if (total) onProgress?.(Math.round((received / total) * 100), received, total);
      this.push(Buffer.from(value));
    },
  });
  await pipeline(stream, createWriteStream(dest));
}

/**
 * 동봉 7za 에 실행 권한 보장(맥·리눅스 전용, 1회).
 * npm 패키지에는 0755 로 들어 있지만, 압축·복사·서명 과정에서 실행비트가 떨어지면
 * spawn 이 EACCES 로 죽고 "압축 해제 실패"라는 원인 불명 에러만 남는다.
 * chmod 는 이미 실행 가능해도 무해하므로 그냥 한 번 걸어 둔다.
 */
let _7zaChmodDone = false;
async function ensure7zaExecutable() {
  if (IS_WIN || _7zaChmodDone) return;
  _7zaChmodDone = true;
  await chmod(path7za, 0o755).catch(() => {});
}

/** 7z 압축해제 (7zip-bin 동봉 바이너리) — stdout 의 NN% 파싱 */
async function extract7z(archive, destDir, onProgress) {
  await ensure7zaExecutable();
  return new Promise((resolve, reject) => {
    const p = spawn(path7za, ['x', archive, `-o${destDir}`, '-y', '-bsp1'], { windowsHide: true });
    let err = '';
    p.stdout?.on('data', (d) => {
      const m = String(d).match(/(\d+)%/);
      if (m) onProgress?.(Number(m[1]));
    });
    p.stderr?.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`7z 해제 실패(${code}): ${err.slice(0, 300)}`))));
  });
}

/**
 * tar.gz/tgz 해제 — macOS 기본 tar 사용.
 * 7za 로도 되지만 gzip→tar 2패스라 중간 tar 파일이 디스크에 남고(수 GB) 느리다.
 * tar 는 실행 권한도 그대로 보존한다(ollama 바이너리에 중요).
 */
function extractTarGz(archive, destDir) {
  return new Promise((resolve, reject) => {
    const p = spawn('tar', ['-xzf', archive, '-C', destDir]);
    let err = '';
    p.stderr?.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`tar 해제 실패(${code}): ${err.slice(0, 300)}`))));
  });
}

/**
 * 전체 설치 흐름.
 * @param {object} o
 * @param {string} o.installDir   userData 하위 설치 경로
 * @param {object} o.urls         { comfyArchiveUrl, modelUrl, modelFileName }
 * @param {(p:{phase:string,pct:number,detail?:string})=>void} o.onProgress
 */
/**
 * macOS 이미지 엔진 구성 — 독립 파이썬 + ComfyUI 소스 + torch(MPS).
 * 윈도 포터블 한 방에 끝나는 것과 달리 세 단계라, 각 단계가 idempotent 해야 한다
 * (수 GB 다운로드 중 끊기는 일이 흔해서 재실행으로 이어붙일 수 있어야 한다).
 */
async function installMacImageEngine({ installDir, u, onProgress }) {
  const py = embeddedPython(installDir);

  // 1-a) 격리 파이썬
  if (!(await exists(py))) {
    const tgz = join(installDir, 'python_standalone.tar.gz');
    onProgress({ phase: 'comfy-download', pct: 0, detail: `독립 파이썬 ${u.pythonDarwinVersion} 다운로드 (~30MB)` });
    await downloadFile(pythonDarwinUrl(u), tgz, (pct) => onProgress({ phase: 'comfy-download', pct }));
    onProgress({ phase: 'comfy-extract', pct: 0, detail: '파이썬 설치' });
    await extractTarGz(tgz, installDir);   // → installDir/python/bin/python3
    await rm(tgz, { force: true });
    await chmod(py, 0o755).catch(() => {});
  }

  // 1-b) ComfyUI 소스
  const app = comfyAppDir(installDir);
  if (!(await exists(join(app, 'main.py')))) {
    const zip = join(installDir, 'comfyui_src.zip');
    onProgress({ phase: 'comfy-download', pct: 0, detail: 'ComfyUI 소스 다운로드' });
    await downloadFile(u.comfySourceUrl, zip, (pct) => onProgress({ phase: 'comfy-download', pct }));
    onProgress({ phase: 'comfy-extract', pct: 0, detail: 'ComfyUI 압축 해제' });
    await extract7z(zip, installDir, (pct) => onProgress({ phase: 'comfy-extract', pct }));
    await rm(zip, { force: true });
    // GitHub 소스 zip 은 ComfyUI-master/ 처럼 브랜치명이 붙은 폴더로 풀린다 → 고정 이름으로 정규화.
    const found = (await readdir(installDir).catch(() => [])).find((d) => /^ComfyUI-/i.test(d));
    if (found) await rename(join(installDir, found), app);
  }
  if (!(await exists(join(app, 'main.py')))) throw new Error('ComfyUI 소스 배치 실패 (main.py 없음)');

  // 1-c) torch(MPS) + ComfyUI 의존성. 수 GB·수 분이라 pip 출력을 그대로 흘려보낸다.
  const log = (detail) => onProgress({ phase: 'comfy-deps', pct: 50, detail });
  onProgress({ phase: 'comfy-deps', pct: 0, detail: 'PyTorch(Metal) 설치 — 수 GB, 수 분 소요' });
  await runPython(py, ['-m', 'pip', 'install', '--upgrade', 'pip'], installDir, log);
  await runPython(py, ['-m', 'pip', 'install', 'torch', 'torchvision'], installDir, log);
  await runPython(py, ['-m', 'pip', 'install', '-r', join(app, 'requirements.txt')], installDir, log);
  onProgress({ phase: 'comfy-deps', pct: 100, detail: 'ComfyUI 의존성 준비 완료' });
}

export async function install({ installDir, urls = {}, onProgress = () => {} }) {
  if (!imageEngineSupported()) {
    // 사용자가 "엔진 설치/확인"을 눌렀을 때도 조용히 실패하지 않고 이유를 알린다.
    throw new Error(IS_MAC
      ? '이미지 생성 엔진(ComfyUI·SDXL)은 Apple Silicon(M1 이상) 맥에서만 지원됩니다. Intel 맥은 GPU 가속이 없어 한 장에 수 분이 걸립니다 — 텍스트·이미지인식 생성은 그대로 사용할 수 있습니다.'
      : '이미지 생성 엔진(ComfyUI·SDXL)은 Windows + NVIDIA GPU 또는 Apple Silicon 맥에서 지원됩니다.');
  }
  const u = { ...DEFAULTS, ...urls };
  await mkdir(installDir, { recursive: true });

  // 1) ComfyUI — 윈도는 포터블 한 방, 맥은 파이썬+소스+torch 3단계.
  if (IS_MAC) {
    await installMacImageEngine({ installDir, u, onProgress });
  } else if (!(await exists(join(comfyRoot(installDir), 'run_nvidia_gpu.bat')))) {
    const archive = join(installDir, 'comfyui_portable.7z');
    onProgress({ phase: 'comfy-download', pct: 0, detail: 'ComfyUI 포터블 다운로드 시작' });
    await downloadFile(u.comfyArchiveUrl, archive, (pct) => onProgress({ phase: 'comfy-download', pct }));
    onProgress({ phase: 'comfy-extract', pct: 0, detail: '압축 해제 중 (수 분 소요)' });
    await extract7z(archive, installDir, (pct) => onProgress({ phase: 'comfy-extract', pct }));
    await rm(archive, { force: true });
  } else {
    onProgress({ phase: 'comfy-download', pct: 100, detail: '이미 설치됨' });
    onProgress({ phase: 'comfy-extract', pct: 100 });
  }

  // 2) SDXL 모델
  const cpDir = checkpointsDir(installDir);
  await mkdir(cpDir, { recursive: true });
  const modelPath = join(cpDir, u.modelFileName);
  if (!(await exists(modelPath))) {
    onProgress({ phase: 'model-download', pct: 0, detail: `${u.modelFileName} (~6.5GB)` });
    await downloadFile(u.modelUrl, modelPath, (pct) => onProgress({ phase: 'model-download', pct }));
  } else {
    onProgress({ phase: 'model-download', pct: 100, detail: '이미 있음' });
  }

  // 3) SDXL Lightning LoRA (이미지 생성 가속 — 26→8스텝). 실패해도 설치는 진행(기본 26스텝 폴백 가능).
  if (u.loraUrl && u.loraFileName) {
    try {
      const lDir = lorasDir(installDir);
      await mkdir(lDir, { recursive: true });
      const loraPath = join(lDir, u.loraFileName);
      if (!(await exists(loraPath))) {
        onProgress({ phase: 'lora-download', pct: 0, detail: `${u.loraFileName} (~400MB, 생성 가속)` });
        await downloadFile(u.loraUrl, loraPath, (pct) => onProgress({ phase: 'lora-download', pct }));
      } else {
        onProgress({ phase: 'lora-download', pct: 100, detail: '이미 있음' });
      }
    } catch (e) {
      onProgress({ phase: 'lora-download', pct: 100, detail: `LoRA 생략(${String(e.message).slice(0, 60)})` });
    }
  }

  // 4) 누끼 커스텀 노드(InspyrenetRembg) — 대표이미지 자동 누끼에 필요. 실패해도 설치는 완료 처리.
  await ensureRembgNode({ installDir, url: u.rembgNodeUrl, onProgress });

  // 5) ollama 바이너리(텍스트 LLM) — 모델은 첫 올인원 실행 시 받음. 실패해도 설치는 완료 처리.
  // url 을 넘기지 않으면 ensureOllama 가 플랫폼(윈도 zip / 맥 tgz)에 맞는 기본값을 고른다.
  try { await ensureOllama({ installDir, url: IS_WIN ? u.ollamaZipUrl : u.ollamaDarwinUrl, onProgress }); }
  catch (e) { onProgress({ phase: 'ollama', pct: 100, detail: `ollama 생략(${String(e.message).slice(0, 60)})` }); }

  onProgress({ phase: 'done', pct: 100 });
}
