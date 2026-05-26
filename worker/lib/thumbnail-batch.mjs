/**
 * 대표이미지 ComfyUI 가공 — 배치 연결 어댑터
 * ---------------------------------------------------------------------------
 * 올인원 파이프라인이 상품 1건의 "대표 후보 사진(실제 상품 사진)"을 받아
 * ComfyUI(SDXL 인페인트/img2img)로 누끼·흰배경 스튜디오 컷으로 가공한다.
 * ⚠️ 텍스트→이미지 가짜 생성이 아니라 "실제 사진을 가공"하는 경로(쿠팡 정책 준수).
 *
 * 설계:
 *   makeThumbnailProcessor() 가 워크플로/프롬프트를 1회 로드하고 헬스체크.
 *   - ComfyUI 미가동/로드 실패 → ready:false, process()는 원본 경로 그대로 폴백.
 *   - 정상 → process(srcPath, folderPath) 가 가공 PNG를 main_images_regen/ 에
 *     비파괴 저장하고 그 경로를 반환. 이미 있으면 재사용(resume).
 *
 * regenerate-thumbnails.mjs(전체 배치 CLI)와 동일한 워크플로/프롬프트/저장규칙.
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as comfy from './comfyui-client.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const exists = (p) => access(p).then(() => true, () => false);

/** 기본 워크플로 위치 탐색 — lib/(worker) 와 평면 runtime/ 양쪽 지원 */
function defaultWorkflowPath() {
  const name = 'sdxl-inpaint-thumbnail.example.json';
  const candidates = [
    join(__dirname, '..', 'workflows', name), // worker/lib → worker/workflows
    join(__dirname, 'workflows', name),        // runtime/ (평면) → runtime/workflows
  ];
  return candidates.find((p) => existsSync(p)) || candidates[0];
}

export const DEFAULT_POSITIVE =
  'professional Coupang e-commerce product thumbnail, the product centered on a pure seamless white studio background (#FFFFFF), soft diffused studio lighting, subtle natural contact shadow directly beneath the product, photorealistic commercial product photography, sharp focus, clean and minimal, 1:1 square composition';
export const DEFAULT_NEGATIVE =
  'text, watermark, logo, extra objects, props, lifestyle scene, hands, people, colored background, gradient background, dark shadows, blurry, low quality, distorted, deformed, duplicated product, frame, border';

/**
 * 썸네일 가공기를 1회 초기화. ComfyUI 가 없으면 폴백 모드로 동작(에러 throw 안 함).
 * @param {Object} [o]
 * @param {string} [o.comfyUrl='http://127.0.0.1:8188']
 * @param {string} [o.workflowPath]   API-format 워크플로 JSON (기본 sdxl-inpaint)
 * @param {string} [o.positive] @param {string} [o.negative]
 * @param {Object} [o.nodeIds]  @param {number} [o.timeoutMs=300000]
 * @returns {Promise<{ready:boolean, info:string, process:(srcPath:string, folderPath:string, opts?:{force?:boolean})=>Promise<{path:string, processed:boolean, reason?:string}>}>}
 */
export async function makeThumbnailProcessor(o = {}) {
  const comfyUrl = (o.comfyUrl || 'http://127.0.0.1:8188').replace(/\/$/, '');
  const workflowPath = resolve(o.workflowPath || defaultWorkflowPath());
  const positive = o.positive || DEFAULT_POSITIVE;
  const negative = o.negative || DEFAULT_NEGATIVE;
  const nodeIds = o.nodeIds || {};
  const timeoutMs = o.timeoutMs ?? 300_000;

  let ready = false, info = '', workflow = null;
  try {
    const health = await comfy.checkHealth(comfyUrl);
    workflow = await comfy.loadWorkflow({ readFile }, workflowPath);
    ready = true;
    info = `ComfyUI ${health.comfyVersion} · ${health.device} (VRAM ${health.vramTotalMb}MB)`;
  } catch (e) {
    ready = false;
    info = `ComfyUI 미연결 — 원본 사진으로 폴백: ${e.message}`;
  }

  /** 가공본 저장 경로: <folderPath>/main_images_regen/<원본명>.png */
  function destFor(srcPath, folderPath) {
    const outName = basename(srcPath).replace(/\.(jpg|jpeg|webp|png)$/i, '.png');
    return join(folderPath || dirname(dirname(srcPath)), 'main_images_regen', outName);
  }

  async function process(srcPath, folderPath, opts = {}) {
    if (!srcPath) return { path: null, processed: false, reason: '대표 사진 없음' };
    if (!ready) return { path: srcPath, processed: false, reason: 'comfy-offline' };

    const dest = destFor(srcPath, folderPath);
    if (!opts.force && (await exists(dest))) {
      return { path: dest, processed: true, reason: 'resume' };
    }
    try {
      const buf = await readFile(srcPath);
      const inputName = `coupang_in_${Date.now()}_${basename(srcPath)}`.replace(/[^\w.\-]/g, '_');
      const out = await comfy.generateThumbnail(comfyUrl, {
        imageBuffer: buf, inputName, workflow,
        positivePrompt: positive, negativePrompt: negative, nodeIds, timeoutMs,
      });
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, out);
      return { path: dest, processed: true };
    } catch (e) {
      // 단건 실패는 파이프라인을 막지 않는다 — 원본으로 폴백.
      return { path: srcPath, processed: false, reason: `가공 실패: ${e.message}` };
    }
  }

  return { ready, info, process, comfyUrl, workflowPath };
}
