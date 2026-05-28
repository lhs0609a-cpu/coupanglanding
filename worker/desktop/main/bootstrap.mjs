/**
 * 첫 실행 설치기: NVIDIA 점검 → ComfyUI 포터블 다운로드/7z 해제 → SDXL 모델 다운로드.
 * 모든 단계는 onProgress({ phase, pct, detail }) 로 진행률을 보고한다.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, stat, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { path7za } from '7zip-bin';

// 환경마다 릴리스 자산명이 바뀔 수 있어 settings 로 override 가능 (main 에서 주입).
export const DEFAULTS = {
  comfyArchiveUrl: 'https://github.com/comfyanonymous/ComfyUI/releases/latest/download/ComfyUI_windows_portable_nvidia.7z',
  modelUrl: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors?download=true',
  modelFileName: 'sd_xl_base_1.0.safetensors',
  // 이미지 생성 가속용 SDXL Lightning 8스텝 LoRA (~400MB) — img2img 워크플로가 26→8스텝(약 2배 빠름).
  loraUrl: 'https://huggingface.co/ByteDance/SDXL-Lightning/resolve/main/sdxl_lightning_8step_lora.safetensors?download=true',
  loraFileName: 'sdxl_lightning_8step_lora.safetensors',
};

const exists = (p) => stat(p).then(() => true, () => false);

/** NVIDIA 드라이버/ GPU 점검 (nvidia-smi) */
export function checkGpu() {
  return new Promise((resolve) => {
    const p = spawn('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader'], { shell: true });
    let out = '';
    p.stdout?.on('data', (d) => (out += d));
    p.on('error', () => resolve({ ok: false, name: null }));
    p.on('close', (code) => {
      if (code === 0 && out.trim()) resolve({ ok: true, name: out.trim().split('\n')[0].trim() });
      else resolve({ ok: false, name: null });
    });
  });
}

/** 포터블 ComfyUI 루트(run_*.bat 가 있는 폴더) 추정 */
export function comfyRoot(installDir) {
  return join(installDir, 'ComfyUI_windows_portable');
}
export function checkpointsDir(installDir) {
  return join(comfyRoot(installDir), 'ComfyUI', 'models', 'checkpoints');
}
export function lorasDir(installDir) {
  return join(comfyRoot(installDir), 'ComfyUI', 'models', 'loras');
}

/** 설치 완료 여부 — 실행 bat + 체크포인트 1개 이상 */
export async function isInstalled(installDir) {
  const root = comfyRoot(installDir);
  const hasBat = (await exists(join(root, 'run_nvidia_gpu.bat'))) || (await exists(join(root, 'run_cpu.bat')));
  if (!hasBat) return false;
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

/** 7z 압축해제 (7zip-bin 동봉 바이너리) — stdout 의 NN% 파싱 */
function extract7z(archive, destDir, onProgress) {
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
 * 전체 설치 흐름.
 * @param {object} o
 * @param {string} o.installDir   userData 하위 설치 경로
 * @param {object} o.urls         { comfyArchiveUrl, modelUrl, modelFileName }
 * @param {(p:{phase:string,pct:number,detail?:string})=>void} o.onProgress
 */
export async function install({ installDir, urls = {}, onProgress = () => {} }) {
  const u = { ...DEFAULTS, ...urls };
  await mkdir(installDir, { recursive: true });

  // 1) ComfyUI 포터블
  if (!(await exists(join(comfyRoot(installDir), 'run_nvidia_gpu.bat')))) {
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

  onProgress({ phase: 'done', pct: 100 });
}
