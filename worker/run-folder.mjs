#!/usr/bin/env node
/**
 * 올인원 원큐 CLI — 폴더 하나 → 검수 직전까지 전부 자동
 * ===========================================================================
 *   node run-folder.mjs <소싱폴더> [옵션]
 *
 * 소싱폴더: product_<코드>/ 들을 담은 상위 폴더
 *   각 폴더: product.json + product_summary.txt(URL:) + main_images/
 *
 * 흐름:
 *   1) 폴더 스캔        → 상품 목록 (노출명 원본·가격·원본링크·대표후보 사진)
 *   2) 로컬 LLM 생성     → 노출상품명·카테고리(+코드)·옵션·상세페이지·키워드·판매가
 *   3) 대표이미지 가공   → ComfyUI(SDXL)로 실제 사진을 누끼·흰배경 스튜디오 컷
 *   4) 검수화면 생성     → review.html (카드: 대표이미지·노출명·링크·가격·옵션·상세)
 *
 * 옵션:
 *   --model <이름>     LLM (기본 exaone3.5:7.8b)
 *   --margin <레벨>    마진 프리셋: -3~+3 또는 c1~c3(보수)/a1~a3(공격)/default (기본 구간)
 *   --seller <id>      아이템위너 회피 시드 (기본 seller-A)
 *   --comfy <url>      ComfyUI 주소 (기본 http://127.0.0.1:8188)
 *   --workflow <경로>  API-format 워크플로 JSON
 *   --no-thumb         대표이미지 가공 건너뜀(텍스트만)
 *   --thumb-force      가공본이 있어도 다시 생성(기본: resume)
 *   --detail-tokens N  상세 최대 토큰 (기본 800)
 *   --concurrency N    동시에 생성할 상품 수 (기본 1. 남은 VRAM 넉넉하면 2~3 이 크게 빠름)
 *   --recog-concurrency N  동시에 인식할 상품 수 (기본 1. 비전은 GPU 라 VRAM 넉넉할 때만)
 *   --no-overlap       이미지인식을 텍스트와 동시에 돌리지 않고 예전처럼 먼저 끝냄(디버그)
 *   --no-recog-cache   이미지인식 캐시 무시(사진 그대로여도 다시 분석)
 *   --limit N          앞 N개만 (테스트)
 *   --out <경로>       결과 prefix (기본 <폴더>/_allinone)
 *
 * 출력: <out>.generated.jsonl (레코드별 1줄) + <out>.review.html
 */
import { writeFileSync, appendFileSync, readFileSync, mkdirSync, existsSync, renameSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { isUp, unload, ensureModel } from './lib/local-llm.mjs';
import { scanFolder } from './lib/folder-scanner.mjs';
import { generateBatch } from './lib/ai-batch.mjs';
import { resolveMarginLevel, presetBrackets } from './lib/margin-mini.mjs';
import { makeThumbnailProcessor } from './lib/thumbnail-batch.mjs';
import { buildReviewHtml } from './lib/review-html.mjs';
import { selectBestMainImage, curateDetailImages, curateReviewImages } from './lib/image-selector.mjs';
import { visionCurateProduct } from './lib/vision-selector.mjs';
import { categoryKind } from './lib/ai-prompts.mjs';
import { localCutoutToWhite, cutoutDepsFailed } from './lib/local-cutout.mjs';
import { measureImage, scoreImage, metricsDepsFailed, looksCutout } from './lib/image-metrics.mjs';

/**
 * 누끼 가공본 품질 게이트 — 가공본이 원본보다 나쁘면 대표로 쓰지 않는다.
 * ---------------------------------------------------------------------------
 * ⚠️ 예전엔 누끼 결과물이 "무조건" 대표였다(웹도 [...regen, ...원본] 으로 0번 고정).
 *    그래서 누끼가 거꾸로/잘림/빈컷으로 나와도 그대로 대표가 됐다(실측: 발아현미 역상,
 *    혼합곡 잘림, 표지 안보임). 대표 후보 원본은 CLIP+L1 로 점수를 받는데 정작 최종
 *    대표가 되는 가공본만 아무 검증이 없었다.
 * → 가공본도 같은 L1 척도로 재서, 빈컷이거나 원본보다 뚜렷이 나쁘면 반려한다.
 * @returns {Promise<{rejected:boolean, reason?:string}>}
 */
async function gateCutout(cutoutPath, originalPath) {
  if (metricsDepsFailed()) return { rejected: false }; // sharp 미탑재 → 판단 불가(기존 동작 유지)
  try {
    const cm = await measureImage(cutoutPath);
    // ① 빈컷/플레이스홀더 — 누끼가 피사체를 통째로 날린 경우(흰 캔버스만 남음).
    if (cm.bgConfidence >= 0.6 && cm.subjectRatio <= 0.05) {
      return { rejected: true, reason: '누끼 결과가 빈 이미지(피사체 소실)' };
    }
    const cs = scoreImage(cm).score;
    // ② 원본 대비 뚜렷한 열화(잘림/왜곡 등) — 20% 이상 나빠지면 원본을 쓴다.
    const om = await measureImage(originalPath);
    const os = scoreImage(om).score;
    if (os > 0 && cs < os * 0.8) {
      return { rejected: true, reason: `누끼 품질 저하(가공 ${cs} < 원본 ${os})` };
    }
    return { rejected: false };
  } catch {
    return { rejected: false }; // 측정 실패는 기존 동작 유지(안전 우선)
  }
}

/**
 * 이미지 인식 결과 캐시 — 같은 사진이면 CLIP/L1 을 다시 돌리지 않는다.
 * ---------------------------------------------------------------------------
 * 인식(CPU CLIP)은 상품당 사진 수에 비례해 수 초씩 든다(대표 후보 17장이면 체감된다).
 * 사진이 안 바뀌었으면 결과도 같으므로, 파일 목록+크기+수정시각 서명으로 캐시한다.
 * → 같은 폴더 재생성(모델 바꿔서 다시, 중간에 죽어서 다시)은 인식 단계가 사실상 0초.
 *
 * ⚠️ 캐시 버전(RECOG_CACHE_VERSION) — 인식 "방식"이 바뀌면 옛 캐시를 무효화해야 한다.
 *    실측: 옛 CLIP 으로 생성한 폴더를 비전(v0.2.63+) 으로 재생성하면 이미지가 그대로라
 *    캐시가 적중 → 비전을 건너뛰고 옛 CLIP 오선택(성분 텍스처 대표)을 그대로 재사용했다.
 *    버전이 다르면 캐시 미스로 처리해 비전이 다시 돌게 한다.
 */
const RECOG_CACHE_VERSION = 2; // 1=CLIP/L1, 2=비전(VLM)
function imagesSignature(p) {
  const files = [...(p.mainImages || []), ...(p.detailImages || []), ...(p.reviewImages || [])];
  const h = createHash('sha1');
  for (const f of files.sort()) {
    let s = '';
    try { const st = statSync(f); s = `${st.size}:${Math.round(st.mtimeMs)}`; } catch { s = 'x'; }
    h.update(`${path.basename(f)}|${s}\n`);
  }
  return h.digest('hex').slice(0, 16);
}
function loadRecogCache(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; }
}
function saveRecogCache(file, cache) {
  try { writeFileSync(file, JSON.stringify(cache)); } catch { /* 캐시는 실패해도 무해 */ }
}

function parseArgs(argv) {
  const a = { _: [] };
  const flags = new Set(['no-thumb', 'thumb-force', 'no-image-ai', 'wait-comfy', 'no-overlap', 'no-recog-cache']);
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) { a._.push(t); continue; }
    const k = t.slice(2);
    if (flags.has(k)) { a[k] = true; continue; }
    a[k] = argv[++i];
  }
  return a;
}

function ts() { return new Date().toTimeString().slice(0, 8); }

/**
 * ComfyUI 의 VRAM 을 회수한다(POST /free). 두 곳에서 쓴다:
 *   ① 텍스트 단계 시작 전 — 이전 실행이 남긴 SDXL 을 내려 ollama 가 VRAM 을 온전히 쓰게.
 *   ② 전체 종료 시 — 유휴 상태로 VRAM 을 물고 있지 않게(다른 작업/프로그램에 양보).
 * ComfyUI 가 안 떠 있으면 조용히 실패(무해). 두 엔진이 동시에 VRAM 을 물지 않게 하는 핵심.
 */
async function freeComfyVram(comfyUrl) {
  const url = (comfyUrl || 'http://127.0.0.1:8188').replace(/\/$/, '');
  try {
    await fetch(`${url}/free`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
      signal: AbortSignal.timeout(8000),
    });
    return true;
  } catch { return false; }
}

/**
 * ComfyUI 가 응답할 때까지 기다린다(누끼 단계 직전). 앱이 텍스트 동안 내려둔 ComfyUI 를
 * [2/3] 마커에서 다시 올리므로, 여기서 기동 완료를 기다렸다가 GPU 누끼를 한다.
 * 타임아웃이면 false → 호출부가 CPU 누끼로 폴백.
 */
async function waitForComfy(comfyUrl, timeoutMs = 90000) {
  const url = (comfyUrl || 'http://127.0.0.1:8188').replace(/\/$/, '');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${url}/system_stats`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) return true;
    } catch { /* 아직 기동 중 */ }
    await new Promise((res) => setTimeout(res, 2000));
  }
  return false;
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const folder = cli._[0];
  if (!folder) {
    console.error('사용법: node run-folder.mjs <소싱폴더> [--model exaone3.5:7.8b] [--no-thumb] [--limit N]');
    process.exit(1);
  }
  const model = cli.model || 'exaone3.5:7.8b';
  const seller = cli.seller || 'seller-A';
  const maxDetailTokens = Number(cli['detail-tokens']) || 800;
  const outPrefix = cli.out || path.join(path.resolve(folder), '_allinone');
  // 마진 프리셋: --margin <-3..+3 | c1~c3 | a1~a3 | default>. 없으면 기본 구간.
  const marginLevel = resolveMarginLevel(cli.margin);
  if (cli.margin && !marginLevel) { console.error(`❌ 알 수 없는 --margin 값: ${cli.margin} (사용: -3~+3, c1~c3, a1~a3, default)`); process.exit(1); }
  const marginBrackets = marginLevel && marginLevel !== 'default' ? presetBrackets(marginLevel) : undefined;

  // 0) ollama 확인
  if (!(await isUp())) { console.error('❌ ollama 미응답 (http://127.0.0.1:11434) — ollama serve 후 다시 실행'); process.exit(1); }

  // 1) 폴더 스캔
  console.log(`[${ts()}] 폴더 스캔: ${path.resolve(folder)}`);
  let products;
  try { products = scanFolder(folder); }
  catch (e) { console.error(`❌ 스캔 실패: ${e.message}`); process.exit(1); }
  if (cli.limit) products = products.slice(0, Number(cli.limit));
  if (products.length === 0) { console.error('❌ product_* 폴더를 찾지 못했습니다.'); process.exit(1); }
  console.log(`[${ts()}] 상품 ${products.length}개 발견`);

  // ── Phase 0) 이미지 인식 (CLIP·CPU) — 대표컷 자동추천 + 상세이미지 큐레이션 ─────────
  //   ⚡ CLIP 은 CPU, LLM 은 GPU 라 서로 자원을 안 뺏는다 → 예전처럼 순차로 기다릴 이유가 없다.
  //      인식을 백그라운드로 돌리면서 텍스트 생성을 동시에 시작한다(= 인식 시간이 통째로 숨는다).
  //      텍스트 생성은 사진과 무관하고, 사진 관련 필드는 두 단계가 다 끝난 뒤 레코드에 채운다.
  // ── 비전 모델 준비 — 이미지를 "직접 보고" 고른다(휴리스틱 아님) ─────────────
  //   qwen2.5vl 등. 미설치면 자동 pull. 실패/생략 시 CLIP·L1 휴리스틱으로 폴백.
  //   ⚠️ VLM 은 GPU 를 쓰므로 텍스트(ollama)와 동시(overlap) 실행 불가 → 인식을
  //      텍스트보다 먼저 끝내고, 끝나면 VLM 을 언로드해 텍스트에 VRAM 을 넘긴다.
  const visionModel = cli['vision-model'] || process.env.MEGALOAD_VISION_MODEL || 'qwen2.5vl:7b';
  /**
   * 비전 판정 1회 상한(ms). 초과하면 그 상품만 CLIP·L1 휴리스틱으로 폴백한다.
   *   GPU 있는 PC 는 상품당 수 초라 넉넉히 줘도 걸릴 일이 없고,
   *   GPU 없는 PC 는 7B VLM 이 호출당 수 분이라 상한이 없으면 생성이 멈춘 것처럼 보인다.
   *   호출부(allinone-runner)가 하드웨어를 보고 값을 넘긴다. 미지정이면 무제한(기존 동작).
   */
  const visionTimeoutMs = Number(cli['vision-timeout']) || 0;
  let visionReady = false;
  if (!cli['no-image-ai'] && !cli['no-vision']) {
    visionReady = await ensureModel(visionModel, { onLog: (m) => console.log(`[${ts()}] ${m}`) });
    if (visionReady) {
      console.log(`[${ts()}] [이미지인식] 비전 모델 사용: ${visionModel} (이미지를 직접 보고 대표/상세/리뷰 큐레이션)`);
      // VLM 은 GPU 를 쓴다 — 이전 실행이 남긴 ComfyUI(SDXL) VRAM 을 먼저 회수해 OOM 을 막는다.
      if (await freeComfyVram(cli.comfy)) console.log(`[${ts()}] [이미지인식] ComfyUI VRAM 회수 → 비전에 양보`);
    } else {
      console.log(`[${ts()}] [이미지인식] 비전 모델 미탑재 → CLIP·L1 휴리스틱 폴백`);
    }
  }
  const overlap = !cli['no-image-ai'] && !cli['no-overlap'] && !visionReady;
  const recogCacheFile = outPrefix + '.recog.json';
  const recogCache = cli['no-recog-cache'] ? {} : loadRecogCache(recogCacheFile);
  let recogHits = 0;

  // 인식 동시 처리 수 — 1 이면 예전과 완전히 동일한 순차 동작.
  //   비전(VLM)은 GPU 를 쓰므로 호출부(도우미)가 남은 VRAM 을 보고 정한다(--recog-concurrency).
  const recogConcurrency = Math.max(1, Number(cli['recog-concurrency']) || 1);
  const runRecognition = async () => {
    console.log(`[${ts()}] [이미지인식] 대표컷 선택 + 상세이미지 큐레이션 시작${overlap ? ' (텍스트 생성과 동시 진행)' : ''}`
      + (recogConcurrency > 1 ? ` · 동시 ${recogConcurrency}개` : ''));
    const onLog = (m) => console.log(`[${ts()}] ${m}`);
    let clipOff = false;
    // ⚠️ 진행 번호는 인덱스가 아니라 **완료 개수**다 — 동시 처리에선 인덱스 순으로 끝나지 않아
    //    i 를 쓰면 웹 진행바가 뒤로 튄다(ai-batch 와 같은 이유).
    let recogDone = 0;
    const recogOne = async (i) => {
      const p = products[i];
      // ① 캐시 적중 — 사진이 그대로면 지난 인식 결과를 그대로 쓴다(CLIP 0회).
      const sig = imagesSignature(p);
      const hit = recogCache[p.id || p.folderPath];
      // 캐시 버전 불일치(옛 CLIP 결과)면 미적중 처리 → 비전이 다시 판정한다.
      if (hit && hit.v === RECOG_CACHE_VERSION && hit.sig === sig && hit.mainImage && existsSync(hit.mainImage)) {
        p.mainImage = hit.mainImage;
        p.mainImageRanked = hit.mainImageRanked || null;
        p.detailImagesKept = hit.detailImagesKept || p.detailImages || [];
        p.detailDroppedNames = hit.detailDroppedNames || [];
        p.mainDroppedNames = hit.mainDroppedNames || [];
        p.reviewImagesKept = hit.reviewImagesKept || p.reviewImages || [];
        p.reviewDroppedNames = hit.reviewDroppedNames || [];
        p.mainConfident = hit.mainConfident !== false;
        p.mainReason = hit.mainReason || null;
        recogHits++;
        recogDone++;
        return;
      }
      if (clipOff) { p.mainImageRanked = null; p.detailImagesKept = p.detailImages || []; p.detailDroppedNames = []; p.mainDroppedNames = []; p.reviewImagesKept = p.reviewImages || []; p.reviewDroppedNames = []; recogDone++; return; }

      // ── 비전(VLM) 경로 — 이미지를 직접 보고 대표/상세/리뷰를 한 번에 큐레이션 ──
      if (visionReady) {
        // 소싱 원본 분류 + 상품명으로 품목 종류를 본다(쿠팡 카테고리는 아직 안 정해졌다 —
        //   카테고리 확정은 Phase A 텍스트 단계다). 과일·음식이면 누끼 없이 실물컷을 쓴다.
        const vKind = categoryKind(p.categoryPath || '', p.originalName || '');
        const vc = await visionCurateProduct({
          mainPool: p.mainImages || (p.mainImage ? [p.mainImage] : []),
          detailPool: p.detailImages || [],
          reviewPool: p.reviewImages || [],
          model: visionModel, onLog, kind: vKind, timeoutMs: visionTimeoutMs,
        });
        if (vc) {
          if (vc.mainImage) p.mainImage = vc.mainImage;
          p.mainImageRanked = vc.mainRanked;
          p.mainConfident = vc.mainConfident;
          p.mainReason = vc.mainReason;
          p.detailImagesKept = vc.detailKept;
          p.detailDroppedNames = vc.detailDropped.map((d) => path.basename(d.path));
          p.mainDroppedNames = (vc.mainDroppedNamesPaths || []).map((pp) => path.basename(pp));
          if (vc.promotedFromDetail) {
            const b = path.basename(vc.promotedFromDetail);
            console.log(`[${ts()}] [비전] 상세컷을 대표로 승격: ${b}`);
            if (!p.detailDroppedNames.includes(b)) p.detailDroppedNames.push(b);
          }
          p.reviewImagesKept = vc.reviewKept;
          p.reviewDroppedNames = vc.reviewDropped.map((d) => path.basename(d.path));
          recogCache[p.id || p.folderPath] = {
            sig, v: RECOG_CACHE_VERSION, mainImage: p.mainImage, mainImageRanked: p.mainImageRanked,
            detailImagesKept: p.detailImagesKept, detailDroppedNames: p.detailDroppedNames,
            mainDroppedNames: p.mainDroppedNames,
            reviewImagesKept: p.reviewImagesKept, reviewDroppedNames: p.reviewDroppedNames,
            mainConfident: p.mainConfident, mainReason: p.mainReason,
          };
          if (++recogDone % 5 === 0) saveRecogCache(recogCacheFile, recogCache);
          const detN = (p.detailImages || []).length ? ` · 상세 ${p.detailImagesKept.length}/${p.detailImages.length}컷` : '';
          const mdN = p.mainDroppedNames.length ? ` · 대표후보 로고/배너 ${p.mainDroppedNames.length} 제외` : '';
          // 비전은 overlap 불가(GPU) → 항상 대괄호 마커로 진행률 패널을 구동한다.
          console.log(`[${ts()}] [인식 ${recogDone}/${products.length}] 👁️ 대표=${path.basename(p.mainImage || '-')}${detN}${mdN}`);
          return;
        }
        console.log(`[${ts()}] [비전] ${p.id} 판정 실패 → 이 상품만 CLIP 폴백`);
      }

      const mainPool = p.mainImages || (p.mainImage ? [p.mainImage] : []);
      // ⭐ 대표 후보를 폴더 경계 너머로 확장 — main_images/detail_images 는 소싱처가 나눈 것일 뿐,
      //    상세 폴더에 더 좋은 정면 단독컷이 들어있는 경우가 많다(실측: 상품이 안 보이는 대표컷).
      //    자격 심사는 image-selector 가 한다(CLIP 가용 + 정면 단독컷 확정일 때만 승격).
      const main = await selectBestMainImage(mainPool, { onLog, extraCandidates: p.detailImages || [] });
      if (main.method === 'fallback-first') { clipOff = true; console.log(`[${ts()}] [이미지인식] CLIP 미탑재 — 첫컷 폴백(${main.error})`); }
      const promotedFromDetail = !!main.path && !mainPool.includes(main.path);
      if (main.path) p.mainImage = main.path;             // 최적 대표컷으로 교체
      p.mainImageRanked = main.ranked;
      // 전 후보가 로고/플레이스홀더/저품질이면 confident=false → 아래에서 needsReview 로 표기.
      p.mainConfident = main.confident !== false;
      p.mainReason = main.reason || null;
      if (promotedFromDetail) console.log(`[${ts()}] [이미지인식] 상세컷을 대표로 승격: ${path.basename(main.path)}`);
      // 대표로 승격된 상세컷은 상세 목록에서 제외(같은 사진이 대표+상세에 중복 노출 방지).
      const detailPool = (p.detailImages || []).filter((d) => d !== p.mainImage);
      const det = await curateDetailImages(detailPool, { onLog });
      p.detailImagesKept = det.kept.map((k) => k.path);
      // CLIP 이 광고/배송/리뷰컷으로 판단해 버린 파일명 — 웹 등록이 스캔한 상세이미지에서 정확히 이것만 제외한다.
      p.detailDroppedNames = det.dropped.map((d) => path.basename(d.path));
      p.mainDroppedNames = []; // CLIP 은 대표후보를 제외하지 않고 점수로 뒤로 미룰 뿐(비전 경로만 명시 제외)
      // 대표로 승격된 상세컷은 웹 상세목록에서도 빼준다(대표 + 상세 중복 노출 방지).
      if (promotedFromDetail) p.detailDroppedNames.push(path.basename(p.mainImage));
      p.detailDropped = det.dropped.length;
      // 리뷰컷 — 상세페이지 본문 1순위 이미지. 사람 얼굴·채팅캡처·영수증·무관사진을 걸러낸다.
      const rev = await curateReviewImages(p.reviewImages || [], { onLog });
      p.reviewImagesKept = rev.kept.map((k) => k.path);
      p.reviewDroppedNames = rev.dropped.map((d) => path.basename(d.path));
      if (rev.dropped.length) {
        const faces = rev.dropped.filter((d) => d.reason === '사람 얼굴/인물').length;
        console.log(`[${ts()}] [리뷰컷] ${p.id}: ${rev.kept.length}/${(p.reviewImages || []).length}장 사용`
          + ` (제외 ${rev.dropped.length}${faces ? `, 사람 ${faces}` : ''})`);
      }
      // 인식 결과 캐시 — 다음 실행에서 사진이 그대로면 CLIP 을 건너뛴다.
      recogCache[p.id || p.folderPath] = {
        sig, v: RECOG_CACHE_VERSION, mainImage: p.mainImage, mainImageRanked: p.mainImageRanked,
        detailImagesKept: p.detailImagesKept, detailDroppedNames: p.detailDroppedNames,
        mainDroppedNames: p.mainDroppedNames || [],
        reviewImagesKept: p.reviewImagesKept, reviewDroppedNames: p.reviewDroppedNames,
        mainConfident: p.mainConfident, mainReason: p.mainReason,
      };
      if (++recogDone % 5 === 0) saveRecogCache(recogCacheFile, recogCache); // 중간에 죽어도 앞부분은 보존
      const pickIco = String(main.method || '').startsWith('clip') ? '🎯' : '·';
      const detNote = (p.detailImages || []).length ? ` · 상세 ${p.detailImagesKept.length}/${p.detailImages.length}컷(광고 ${det.dropped.length} 제외)` : '';
      // ⚠️ 텍스트와 동시 진행 중이면 `[인식 n/n]` 진행 마커를 쓰지 않는다 — 웹 진행패널이
      //    인식↔텍스트 사이를 왔다갔다 하며 단계 표시가 튄다. 로그로만 남긴다.
      const tag = overlap ? `인식 ${recogDone}/${products.length}` : `[인식 ${recogDone}/${products.length}]`;
      console.log(`[${ts()}]${overlap ? ' ' : ''}${tag} ${pickIco} 대표=${path.basename(p.mainImage || '-')}${main.method === 'clip' && main.ranked[0]?.score != null ? ` (점수 ${main.ranked[0].score})` : ''}${detNote}`);
    };

    // 레인 방식 동시 실행 — recogConcurrency=1 이면 예전 순차 루프와 동일하다.
    //   ⚠️ 상품끼리는 서로를 참조하지 않는다(각자 자기 p 만 채운다) → 결과는 동시성과 무관하게 같다.
    //      실패는 상품 단위로 삼키지 않는다(기존과 동일하게 runRecognition 호출부가 통째로 폴백).
    const rLanes = Math.max(1, Math.min(recogConcurrency, products.length));
    let rCursor = 0;
    const rLane = async () => { while (rCursor < products.length) await recogOne(rCursor++); };
    await Promise.all(Array.from({ length: rLanes }, rLane));

    saveRecogCache(recogCacheFile, recogCache);
    if (recogHits) console.log(`[${ts()}] [이미지인식] 캐시 재사용 ${recogHits}/${products.length}건 — 사진이 그대로라 다시 분석하지 않음`);
  };

  // 인식 실행 계획: 동시(overlap) / 순차 / 생략
  let recogPromise = Promise.resolve();
  if (!cli['no-image-ai']) {
    recogPromise = runRecognition().catch((e) => {
      // 인식이 죽어도 생성은 계속 — 사진은 원본/첫컷으로 폴백.
      console.log(`[${ts()}] ⚠️ 이미지인식 실패(원본 사진 유지): ${e.message}`);
      for (const p of products) {
        if (!p.detailImagesKept) p.detailImagesKept = p.detailImages || [];
        if (!p.mainDroppedNames) p.mainDroppedNames = [];
        if (p.mainConfident === undefined) { p.mainConfident = true; p.mainReason = null; p.mainImageRanked = null; p.detailDroppedNames = []; }
      }
    });
    if (!overlap) await recogPromise;
    // 비전 경로였다면(overlap 불가) 인식이 끝났으니 VLM 을 내려 텍스트(ollama)에 VRAM 을 넘긴다.
    if (visionReady) { await unload(visionModel); console.log(`[${ts()}] [이미지인식] 비전 모델 언로드 → 텍스트에 VRAM 양보`); }
  } else {
    console.log(`[${ts()}] [이미지인식] 생략(--no-image-ai) — 첫컷/원본 상세 유지`);
    for (const p of products) { p.detailImagesKept = p.detailImages || []; p.mainImageRanked = null; p.detailDroppedNames = []; p.mainDroppedNames = []; p.reviewImagesKept = p.reviewImages || []; p.reviewDroppedNames = []; p.mainConfident = true; p.mainReason = null; }
  }

  // ── Phase A) 전체 텍스트 생성 (ollama 가 GPU 점유) ───────────────────────
  //   ⚠️ 16GB GPU 를 ollama·ComfyUI 가 동시에 쓰면 VRAM 경합으로 둘 다 느려진다.
  //   그래서 텍스트를 "전부" 먼저 끝내고(2-A), ollama 모델을 내린 뒤(2-B)
  //   대표이미지를 "전부" 가공한다(2-C). 단계마다 GPU 를 독점 → thrashing 회피.
  const outJsonl = outPrefix + '.generated.jsonl';
  // ⚠️ 여기서 기존 파일을 비우지 않는다. 예전엔 시작 시 truncate 했는데,
  //    중간에 죽으면 0바이트 파일만 남아 웹이 "레코드 0건" 으로 보였다.
  //    → Phase C 에서 .tmp 로 쓰고 rename 하는 원자적 교체로 바꿨다(부분 결과 노출 없음).
  const records = [];
  // 텍스트 단계 전, ComfyUI 가 물고 있던 VRAM 을 회수해 ollama 에 양보(두 엔진 동시 점유 제거).
  const freedBefore = await freeComfyVram(cli.comfy);
  if (freedBefore) console.log(`[${ts()}] [1/3] 텍스트 전 ComfyUI VRAM 회수 완료 → ollama 에 양보`);
  const genConcurrency = Math.max(1, Number(cli.concurrency) || 1);
  console.log(`[${ts()}] [1/3] 텍스트 생성 시작 (모델 ${model}${genConcurrency > 1 ? ` · 동시 ${genConcurrency}개` : ''})`);
  if (marginBrackets) console.log(`[${ts()}] 마진 프리셋 적용: ${marginLevel}`);
  const { records: genRecords, summary } = await generateBatch(products, {
    model, sellerId: seller, maxDetailTokens, marginBrackets, concurrency: genConcurrency,
    onItem: (i, total, rec, doneCount) => {
      const flag = rec.needsReview ? '⚠️검수' : '✅';
      // 진행 숫자는 "완료 개수" — 병렬이면 인덱스 순으로 안 끝나므로 i 를 쓰면 진행바가 뒤로 튄다.
      console.log(`[${ts()}][텍스트 ${doneCount ?? i + 1}/${total}] ${flag} ${rec.displayName}  | ${rec.categoryPath} [${rec.categoryCode || '-'}] | ${(rec.ms / 1000).toFixed(1)}s`);
    },
  });
  records.push(...genRecords);

  // ── 이미지 인식(백그라운드) 합류 ─────────────────────────────────────────
  //   텍스트와 동시에 돌렸으므로 여기서 끝나기를 기다린다(대개 이미 끝나 있다).
  //   ⚠️ 레코드의 사진 필드는 인식 전 값이 담겼을 수 있으니 지금 확정값으로 덮는다.
  if (overlap) {
    console.log(`[${ts()}] [1/3] 이미지인식 합류 대기…`);
    await recogPromise;
  }
  for (let i = 0; i < products.length; i++) {
    const p = products[i], rec = records[i];
    if (!rec) continue;
    if (p.mainImage) rec.mainImage = p.mainImage;
    rec.mainImageRanked = p.mainImageRanked ?? null;
    rec.detailImages = Array.isArray(p.detailImagesKept) ? p.detailImagesKept : (p.detailImages || []);
    rec.detailDroppedNames = Array.isArray(p.detailDroppedNames) ? p.detailDroppedNames : [];
    rec.mainDroppedNames = Array.isArray(p.mainDroppedNames) ? p.mainDroppedNames : [];
    rec.reviewImages = Array.isArray(p.reviewImagesKept) ? p.reviewImagesKept : (p.reviewImages || []);
    rec.reviewDroppedNames = Array.isArray(p.reviewDroppedNames) ? p.reviewDroppedNames : [];
  }

  // ── 대표컷 신뢰도 병합 — 전 후보가 로고/저품질이면 검수 대상으로 승격 ──────────
  //   이래야 웹 검수화면이 자동승인을 풀고 카드에 "대표컷 확인" 경고를 띄운다(N 로고 방지).
  let mainFlagged = 0;
  for (let i = 0; i < products.length; i++) {
    const p = products[i], rec = records[i];
    if (!rec || p.mainConfident !== false) continue;
    rec.needsReview = true;
    rec.mainImageWarning = p.mainReason || '대표컷 확인 필요';
    if (Array.isArray(rec.qualityIssues)) rec.qualityIssues.push(`대표이미지: ${rec.mainImageWarning}`);
    mainFlagged++;
  }
  if (mainFlagged) console.log(`[${ts()}] ⚠️ 대표컷 검수 필요 ${mainFlagged}건 (로고/저품질 후보만 존재)`);

  // ── Phase B) 대표이미지 가공 (ComfyUI 가 GPU 점유) ──────────────────────
  let thumbsProcessed = 0;
  let thumbEnabled = !cli['no-thumb'];

  // ⭐ "이미 누끼된 컷은 다시 누끼하지 않는다" ────────────────────────────────
  //   소싱 폴더 main_images 에는 소싱처가 배경을 이미 지워 둔 컷(converted_01.png 등)이
  //   들어 있는 경우가 많다. 그걸 또 누끼하면 파이프라인에서 가장 느린 단계를 통째로
  //   낭비하고(상품당 수~수십 초), 멀쩡한 사진을 다시 잘라 품질만 떨어진다.
  //   → 대표컷이 이미 흰배경 단독컷이면 그대로 쓴다. 전부 그렇다면 ComfyUI 는 아예 안 띄운다.
  const needCutout = [];
  let alreadyCut = 0;
  let freshSkipped = 0;   // 과일·음식이라 누끼를 건너뛴 건수
  let imgDone = 0;          // 진행표시용 — 실제로 가공한 건수(건너뛴 건 세지 않는다)
  if (thumbEnabled) {
    for (let i = 0; i < products.length; i++) {
      const p = products[i], rec = records[i];
      if (!p.mainImage) { if (rec) rec.thumbProcessed = null; continue; }
      // ⭐ 과일·음식은 누끼를 뜨지 않는다 — 배경을 지우면 과일이 공중에 뜬 것처럼 어색해진다(실측).
      //    카테고리는 Phase A 에서 확정됐으므로 생성된 레코드의 분류를 쓰고,
      //    없으면 소싱 원본 분류로 판단한다.
      const kind = categoryKind(rec?.categoryPath || p.categoryPath || '', p.originalName || '');
      if (kind === 'fruit' || kind === 'food') {
        if (rec) { rec.mainImage = p.mainImage; rec.thumbProcessed = false; rec.thumbSkipped = '과일·음식은 누끼 없이 원본 사용'; }
        freshSkipped++;
        continue;
      }
      let cut = false;
      try { cut = looksCutout(await measureImage(p.mainImage), p.mainImage); }
      catch { cut = metricsDepsFailed() ? looksCutout(null, p.mainImage) : false; }
      if (cut) {
        alreadyCut++;
        if (rec) { rec.mainImage = p.mainImage; rec.thumbProcessed = false; rec.thumbSkipped = '이미 누끼된 대표컷'; }
      } else {
        needCutout.push(i);
      }
    }
    if (alreadyCut) console.log(`[${ts()}] 대표이미지: ${alreadyCut}건은 이미 누끼된 컷 → 재가공 생략(그대로 사용)`);
    if (freshSkipped) console.log(`[${ts()}] 대표이미지: ${freshSkipped}건은 과일·음식 → 누끼 생략(원본 실물컷 사용)`);
    if (needCutout.length === 0) {
      thumbEnabled = false;
      console.log(`[${ts()}] [2/3] 누끼가 필요한 대표컷 없음 — 이미지 가공 단계 전체 생략(ComfyUI 기동 안 함)`);
      await unload(model); // VRAM 은 그래도 반납
    }
  }

  if (thumbEnabled) {
    // ollama 모델 언로드 → VRAM 을 ComfyUI 에 양보. (앱은 이 마커를 보고 내려뒀던 ComfyUI 를 올린다)
    console.log(`[${ts()}] [2/3] ollama 모델 언로드(VRAM 회수) → ComfyUI 준비`);
    await unload(model);
    // 앱이 텍스트 동안 ComfyUI 를 내려둔 경우(--wait-comfy) 지금 기동 완료를 기다린다.
    if (cli['wait-comfy']) {
      console.log(`[${ts()}] [2/3] ComfyUI 기동 대기 중…(텍스트 동안 내려둔 누끼 엔진 재기동)`);
      const up = await waitForComfy(cli.comfy, 90000);
      console.log(`[${ts()}] [2/3] ComfyUI ${up ? '준비됨 → GPU 누끼' : '대기 초과 → CPU 누끼 폴백'}`);
    }
    const thumb = await makeThumbnailProcessor({ comfyUrl: cli.comfy, workflowPath: cli.workflow });
    console.log(`[${ts()}] 대표이미지: ${thumb.ready ? '✅ ' + thumb.info : '⚠️ ' + thumb.info}`);
    if (thumb.ready) {
      for (const i of needCutout) {
        const p = products[i], rec = records[i];
        if (!p.mainImage) { rec.thumbProcessed = null; continue; }
        const res = await thumb.process(p.mainImage, p.folderPath, { force: !!cli['thumb-force'] });
        // 가공본 품질 게이트 — 원본보다 나쁘면 대표로 쓰지 않는다(웹도 이 신호로 기본선택 이동).
        let gate = { rejected: false };
        if (res.path && res.path !== p.mainImage) gate = await gateCutout(res.path, p.mainImage);
        if (gate.rejected) {
          rec.mainImage = p.mainImage;          // 원본을 대표로
          rec.thumbRejected = true;
          rec.thumbRejectReason = gate.reason;
          rec.thumbProcessed = res.processed;   // 가공본 자체는 존재(후보로는 남는다)
          if (res.processed) thumbsProcessed++;
          console.log(`[${ts()}][이미지 ${++imgDone}/${needCutout.length}] ⚠️ 누끼 반려 → 원본 대표 (${gate.reason})`);
          continue;
        }
        rec.mainImage = res.path || rec.mainImage;
        rec.thumbProcessed = res.processed;
        if (res.processed) thumbsProcessed++;
        const ico = res.processed ? '🖼️' : '·';
        console.log(`[${ts()}][이미지 ${++imgDone}/${needCutout.length}] ${ico} ${path.basename(rec.mainImage)}${res.reason ? ' (' + res.reason + ')' : ''}`);
      }
    } else {
      // ComfyUI 미가동(GPU 없음 등) → BiRefNet CPU 누끼 폴백. 어떤 PC 에서도 배경제거·흰배경 자동.
      console.log(`[${ts()}] ComfyUI 미가동 → BiRefNet CPU 누끼 폴백 시도(GPU 불필요, 배경제거·흰배경 1:1)`);
      const onLog = (m) => console.log(`[${ts()}] ${m}`);
      let cpuOff = false;
      for (const i of needCutout) {
        const p = products[i], rec = records[i];
        if (!p.mainImage) { rec.thumbProcessed = null; continue; }
        if (cpuOff) { rec.thumbProcessed = false; continue; }
        const dest = path.join(p.folderPath || path.dirname(path.dirname(p.mainImage)), 'main_images_regen',
          path.basename(p.mainImage).replace(/\.(jpg|jpeg|webp|png)$/i, '.png'));
        try {
          const useCutout = async (label) => {
            const gate = await gateCutout(dest, p.mainImage);
            rec.thumbProcessed = true; thumbsProcessed++;
            if (gate.rejected) {
              rec.mainImage = p.mainImage;      // 원본을 대표로(가공본은 후보로 남음)
              rec.thumbRejected = true;
              rec.thumbRejectReason = gate.reason;
              console.log(`[${ts()}][이미지 ${++imgDone}/${needCutout.length}] ⚠️ 누끼 반려 → 원본 대표 (${gate.reason})`);
            } else {
              rec.mainImage = dest;
              console.log(`[${ts()}][이미지 ${++imgDone}/${needCutout.length}] 🖼️ ${path.basename(dest)} (${label})`);
            }
          };
          if (!cli['thumb-force'] && existsSync(dest)) {
            await useCutout('resume');
            continue;
          }
          const buf = await localCutoutToWhite(readFileSync(p.mainImage), { onLog });
          mkdirSync(path.dirname(dest), { recursive: true });
          writeFileSync(dest, buf);
          await useCutout('CPU 누끼');
        } catch (e) {
          rec.thumbProcessed = false;
          if (cutoutDepsFailed()) {
            cpuOff = true; // sharp/transformers 미탑재(standalone CLI 등) → 이후 전부 원본 유지
            console.log(`[${ts()}] BiRefNet 미탑재 — 원본 사진 유지(${e.message})`);
          } else {
            console.log(`[${ts()}][이미지 ${++imgDone}/${needCutout.length}] · 누끼 실패 → 원본(${e.message})`);
          }
        }
      }
      thumbEnabled = thumbsProcessed > 0; // 하나라도 CPU 누끼 성공 시 가공됨 표시
      if (!thumbEnabled) for (const rec of records) rec.thumbProcessed = false;
    }
  } else if (cli['no-thumb']) {
    console.log(`[${ts()}] [2/3] 대표이미지 가공 생략(--no-thumb)`);
  }
  summary.thumbsProcessed = thumbEnabled ? thumbsProcessed : null;

  // ── Phase C) 레코드 저장 + 검수화면 ──────────────────────────────────────
  console.log(`[${ts()}] [3/3] 레코드 저장 + 검수화면 생성`);
  // 원자적 교체: .tmp 에 완전히 쓴 뒤 rename. 중간에 죽어도 이전 결과가 살아남는다.
  writeFileSync(outJsonl + '.tmp', records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  renameSync(outJsonl + '.tmp', outJsonl);
  const outHtml = outPrefix + '.review.html';
  writeFileSync(outHtml + '.tmp', buildReviewHtml(records, summary), 'utf8');
  renameSync(outHtml + '.tmp', outHtml);

  console.log(`\n=== 요약 ===`);
  console.log(`총 ${summary.total} · 통과 ${summary.ok} · 검수필요 ${summary.needsReview}` + (thumbEnabled ? ` · 대표가공 ${thumbsProcessed}/${summary.total}` : ' · 대표가공 생략'));
  console.log(`상품당 평균(텍스트) ${(summary.avgMs / 1000).toFixed(1)}s · 텍스트단계 ${(summary.wallMs / 1000 / 60).toFixed(1)}분 · 동시 ${summary.concurrency}개 · 후보=${summary.candidateSource}`);
  console.log(`레코드: ${outJsonl}`);
  console.log(`검수화면: ${outHtml}  ← 브라우저로 열어 검수/승인`);

  // 종료 시 엔진 VRAM 해제 — 유휴 점유 제거(다음 작업/다른 프로그램에 양보).
  await unload(model);            // ollama 모델 언로드
  await freeComfyVram(cli.comfy); // ComfyUI(SDXL) 언로드
  console.log(`[${ts()}] 엔진 VRAM 해제 완료(ollama·ComfyUI) — 유휴 점유 제거`);
}

main().catch((e) => { console.error('원큐 오류:', e.message); process.exit(1); });
