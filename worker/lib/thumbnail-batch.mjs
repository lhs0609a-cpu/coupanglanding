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

// EXIF 방향(회전·미러)을 픽셀에 굽는다 — ComfyUI(PIL)는 EXIF 방향을 기본 적용하지 않아,
//   세로/회전/거울상 사진이 뒤집힌 채 누끼돼 글자가 반전/회전된다. sharp 로 미리 정규화한다.
//   sharp 미탑재/실패 시 원본 버퍼 그대로(현행 동작, 무손상).
let _sharpOrientP = null;
async function orientBuffer(buf) {
  try {
    if (!_sharpOrientP) _sharpOrientP = import('sharp').then((m) => m.default);
    const sharp = await _sharpOrientP;
    return await sharp(buf).rotate().toBuffer();
  } catch {
    return buf;
  }
}

/** 미설치 노드별 설치 힌트(누끼 노드 등 자주 막히는 것 안내). */
function why(missing) {
  if (missing.includes('InspyrenetRembg')) {
    return `누끼 노드(InspyrenetRembg)가 없습니다 — ComfyUI-Manager > Custom Nodes 에서 'Inspyrenet' 검색 설치(첫 실행 시 모델 자동 다운로드).`;
  }
  return '';
}

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
    // 누끼 등 커스텀 노드가 설치돼 있는지 확인 — 없으면 매 이미지가 조용히 실패/폴백하므로
    // 여기서 한 번에 잡아 명확히 안내하고, 차라리 전체를 원본 폴백시킨다(시간 낭비 방지).
    const missing = comfy.missingNodeTypes(workflow, await comfy.listNodeTypes(comfyUrl));
    if (missing.length > 0) {
      ready = false;
      info = `워크플로 노드 미설치 [${missing.join(', ')}] — 원본 사진으로 폴백. ` +
        why(missing) +
        ` ComfyUI-Manager 에서 해당 커스텀 노드를 설치 후 다시 실행하세요.`;
    } else {
      ready = true;
      info = `ComfyUI ${health.comfyVersion} · ${health.device} (VRAM ${health.vramTotalMb}MB) · 누끼 자동`;
    }
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
      const buf = await orientBuffer(await readFile(srcPath)); // EXIF 방향 굽기(뒤집힘·거울상 방지)
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
