#!/usr/bin/env node
/**
 * 쿠팡 썸네일 일괄 재생성 워커 (로컬 GPU / ComfyUI SDXL)
 *
 * 로컬 ComfyUI에 연결해, 배치 루트의 product_* 폴더 main_images 누끼 PNG를
 * SDXL 워크플로로 재생성한다. 의존성 0 (Node 18+).
 *
 * 사용:
 *   node regenerate-thumbnails.mjs --root "C:\배치폴더" [옵션]
 *
 * 옵션:
 *   --root <경로>        배치 루트 (product_* 들을 포함). config의 root보다 우선.
 *   --comfy <url>        ComfyUI 주소 (기본 http://127.0.0.1:8188)
 *   --workflow <경로>    API-format 워크플로 JSON (기본 workflows/sdxl-inpaint-thumbnail.example.json)
 *   --write <모드>       sibling(기본,비파괴) | inplace(원본 백업 후 교체)
 *   --all-main           대표후보 전체 재생성 (기본: 정렬 첫 장만 = 대표 썸네일)
 *   --limit <N>          앞에서 N개 상품만 (테스트용)
 *   --test <이미지경로>  단일 이미지만 처리해 옆에 *.regen.png 저장 (워크플로 검증용)
 *   --force              이미 생성된 결과가 있어도 다시 생성 (기본: 건너뜀=resume)
 *   --timeout <초>       장당 타임아웃 (기본 300)
 *   --dry-run            대상만 출력하고 생성하지 않음
 *
 * config.json (스크립트와 같은 폴더, 옵션): 위 값들의 기본치 + prompt 지정.
 */

import { readFile, writeFile, mkdir, rename, access } from 'node:fs/promises';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as comfy from './lib/comfyui-client.mjs';
import { collectTargets } from './lib/folder-walk.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fs = { readFile };

// ── 인자 파싱 ──────────────────────────────────────────────
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const flags = new Set(['all-main', 'force', 'dry-run']);
    if (flags.has(key)) { args[key] = true; continue; }
    args[key] = argv[++i];
  }
  return args;
}

const exists = (p) => access(p).then(() => true, () => false);

const DEFAULT_POSITIVE =
  'professional Coupang e-commerce product thumbnail, the product centered on a pure seamless white studio background (#FFFFFF), soft diffused studio lighting, subtle natural contact shadow directly beneath the product, photorealistic commercial product photography, sharp focus, clean and minimal, 1:1 square composition';
const DEFAULT_NEGATIVE =
  'text, watermark, logo, extra objects, props, lifestyle scene, hands, people, colored background, gradient background, dark shadows, blurry, low quality, distorted, deformed, duplicated product, frame, border';

async function loadConfig() {
  const p = join(__dirname, 'config.json');
  if (await exists(p)) {
    try { return JSON.parse(await readFile(p, 'utf8')); }
    catch (e) { console.warn(`⚠️  config.json 파싱 실패 — 무시: ${e.message}`); }
  }
  return {};
}

function ts() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
function log(msg) { console.log(`[${ts()}] ${msg}`); }

async function appendProgress(logPath, record) {
  await writeFile(logPath, JSON.stringify(record) + '\n', { flag: 'a' });
}

// ── 단일 이미지 처리 ────────────────────────────────────────
async function processOne(opts, srcPath) {
  const buf = await readFile(srcPath);
  const inputName = `coupang_in_${Date.now()}_${basename(srcPath)}`.replace(/[^\w.\-]/g, '_');
  return comfy.generateThumbnail(opts.comfyUrl, {
    imageBuffer: buf,
    inputName,
    workflow: opts.workflow,
    positivePrompt: opts.positive,
    negativePrompt: opts.negative,
    nodeIds: opts.nodeIds,
    timeoutMs: opts.timeoutMs,
  });
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const cfg = await loadConfig();

  const comfyUrl = (cli.comfy || cfg.comfyUrl || 'http://127.0.0.1:8188').replace(/\/$/, '');
  const workflowPath = resolve(cli.workflow || cfg.workflow || join(__dirname, 'workflows/sdxl-inpaint-thumbnail.example.json'));
  const opts = {
    comfyUrl,
    positive: cfg.positivePrompt || DEFAULT_POSITIVE,
    negative: cfg.negativePrompt || DEFAULT_NEGATIVE,
    nodeIds: cfg.nodeIds || {},
    timeoutMs: (Number(cli.timeout) || cfg.timeoutSec || 300) * 1000,
  };

  // 1) ComfyUI 헬스 + 워크플로 로드 (dry-run은 헬스체크 건너뜀 — 오프라인 미리보기 가능)
  if (!cli['dry-run']) {
    log(`ComfyUI 연결 확인: ${comfyUrl}`);
    let health;
    try { health = await comfy.checkHealth(comfyUrl); }
    catch (e) { console.error(`❌ ${e.message}`); process.exit(1); }
    log(`✅ ComfyUI ${health.comfyVersion} · ${health.device} (VRAM ${health.vramTotalMb}MB)`);
  }

  try { opts.workflow = await comfy.loadWorkflow(fs, workflowPath); }
  catch (e) { console.error(`❌ 워크플로 로드 실패 (${workflowPath}):\n${e.message}`); process.exit(1); }
  log(`워크플로: ${workflowPath}`);

  // 2) --test: 단일 이미지 검증 모드
  if (cli.test) {
    const srcPath = resolve(cli.test);
    log(`🧪 테스트 1장: ${srcPath}`);
    const out = await processOne(opts, srcPath);
    const dest = srcPath.replace(/\.(jpg|jpeg|png|webp)$/i, '') + '.regen.png';
    await writeFile(dest, out);
    log(`✅ 저장: ${dest} (${Math.round(out.length / 1024)}KB) — 원본과 비교 확인하세요`);
    return;
  }

  // 3) 배치 대상 수집
  const root = resolve(cli.root || cfg.root || '');
  if (!cli.root && !cfg.root) {
    console.error('❌ --root <배치폴더> 가 필요합니다 (또는 config.json의 root).');
    process.exit(1);
  }
  log(`배치 루트: ${root}`);
  const writeMode = cli.write || cfg.write || 'sibling';
  let targets = await collectTargets(root, !!cli['all-main']);
  if (cli.limit) targets = targets.slice(0, Number(cli.limit));
  const totalImages = targets.reduce((s, t) => s + t.images.length, 0);
  log(`대상: 상품 ${targets.length}개 · 이미지 ${totalImages}장 · write=${writeMode}${cli.force ? ' · force' : ' · resume'}`);

  if (cli['dry-run']) {
    for (const t of targets) log(`  ${t.productCode}: ${t.images.join(', ')}`);
    log('dry-run 종료 (생성 안 함).');
    return;
  }
  if (writeMode === 'inplace') {
    log('⚠️  inplace 모드: 원본은 main_images_original/ 로 백업 후 main_images/ 를 교체합니다.');
  }

  // 4) 처리 루프 (GPU는 직렬 — 동시성 1)
  const progressLog = join(root, `thumbnail-regen-${Date.now()}.ndjson`);
  let done = 0, ok = 0, skip = 0, fail = 0;
  const startedAt = Date.now();

  for (const t of targets) {
    for (const imgName of t.images) {
      done++;
      const srcPath = join(t.mainImagesDir, imgName);
      const tag = `[${done}/${totalImages}] ${t.productCode}/${imgName}`;

      // 결과 경로 + resume 판정
      const siblingDir = join(t.dir, 'main_images_regen');
      const outName = imgName.replace(/\.(jpg|jpeg|webp)$/i, '.png');
      const siblingOut = join(siblingDir, outName);
      if (!cli.force && writeMode === 'sibling' && (await exists(siblingOut))) {
        skip++; log(`⏭️  ${tag} — 이미 있음 (resume)`); continue;
      }

      try {
        const out = await processOne(opts, srcPath);

        if (writeMode === 'inplace') {
          const backupDir = join(t.dir, 'main_images_original');
          await mkdir(backupDir, { recursive: true });
          await rename(srcPath, join(backupDir, imgName));      // 원본 보존
          await writeFile(join(t.mainImagesDir, outName), out);  // 동일 위치에 교체본
        } else {
          await mkdir(siblingDir, { recursive: true });
          await writeFile(siblingOut, out);
        }
        ok++;
        const eta = Math.round(((Date.now() - startedAt) / done) * (totalImages - done) / 1000);
        log(`✅ ${tag} (${Math.round(out.length / 1024)}KB) · 남은 ETA ~${eta}s`);
        await appendProgress(progressLog, { ts: ts(), productCode: t.productCode, image: imgName, status: 'ok' });
      } catch (e) {
        fail++;
        log(`❌ ${tag} — ${e.message}`);
        await appendProgress(progressLog, { ts: ts(), productCode: t.productCode, image: imgName, status: 'error', error: e.message });
      }
    }
  }

  log(`완료: 성공 ${ok} · 건너뜀 ${skip} · 실패 ${fail} (총 ${totalImages})`);
  log(`진행 로그: ${progressLog}`);
  if (writeMode === 'sibling') {
    log('비파괴 모드로 생성됨 (main_images_regen/). 결과 확인 후 --write inplace 로 실제 교체하세요.');
  }
}

main().catch((e) => { console.error('치명적 오류:', e); process.exit(1); });
