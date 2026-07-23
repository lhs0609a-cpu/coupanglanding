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
 *   --limit N          앞 N개만 (테스트)
 *   --out <경로>       결과 prefix (기본 <폴더>/_allinone)
 *
 * 출력: <out>.generated.jsonl (레코드별 1줄) + <out>.review.html
 */
import { writeFileSync, appendFileSync, readFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { isUp, unload } from './lib/local-llm.mjs';
import { scanFolder } from './lib/folder-scanner.mjs';
import { generateBatch } from './lib/ai-batch.mjs';
import { resolveMarginLevel, presetBrackets } from './lib/margin-mini.mjs';
import { makeThumbnailProcessor } from './lib/thumbnail-batch.mjs';
import { buildReviewHtml } from './lib/review-html.mjs';
import { selectBestMainImage, curateDetailImages } from './lib/image-selector.mjs';
import { localCutoutToWhite, cutoutDepsFailed } from './lib/local-cutout.mjs';
import { measureImage, scoreImage, metricsDepsFailed } from './lib/image-metrics.mjs';

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

function parseArgs(argv) {
  const a = { _: [] };
  const flags = new Set(['no-thumb', 'thumb-force', 'no-image-ai', 'wait-comfy']);
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
  //   CPU에서 도는 CLIP이라 ollama(GPU)와 VRAM 경합 없음 → 텍스트 생성 전에 먼저 처리.
  //   transformers.js 미탑재(standalone CLI 등)면 selectBestMainImage 가 조용히 첫컷 폴백.
  if (!cli['no-image-ai']) {
    console.log(`[${ts()}] [이미지인식] 대표컷 선택 + 상세이미지 큐레이션 시작`);
    const onLog = (m) => console.log(`[${ts()}] ${m}`);
    let clipOff = false;
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (clipOff) { p.mainImageRanked = null; p.detailImagesKept = p.detailImages || []; p.detailDroppedNames = []; continue; }
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
      // 대표로 승격된 상세컷은 웹 상세목록에서도 빼준다(대표 + 상세 중복 노출 방지).
      if (promotedFromDetail) p.detailDroppedNames.push(path.basename(p.mainImage));
      p.detailDropped = det.dropped.length;
      const pickIco = String(main.method || '').startsWith('clip') ? '🎯' : '·';
      const detNote = (p.detailImages || []).length ? ` · 상세 ${p.detailImagesKept.length}/${p.detailImages.length}컷(광고 ${det.dropped.length} 제외)` : '';
      console.log(`[${ts()}][인식 ${i + 1}/${products.length}] ${pickIco} 대표=${path.basename(p.mainImage || '-')}${main.method === 'clip' && main.ranked[0]?.score != null ? ` (점수 ${main.ranked[0].score})` : ''}${detNote}`);
    }
  } else {
    console.log(`[${ts()}] [이미지인식] 생략(--no-image-ai) — 첫컷/원본 상세 유지`);
    for (const p of products) { p.detailImagesKept = p.detailImages || []; p.mainImageRanked = null; p.detailDroppedNames = []; p.mainConfident = true; p.mainReason = null; }
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
  console.log(`[${ts()}] [1/3] 텍스트 생성 시작 (모델 ${model})`);
  if (marginBrackets) console.log(`[${ts()}] 마진 프리셋 적용: ${marginLevel}`);
  const { summary } = await generateBatch(products, {
    model, sellerId: seller, maxDetailTokens, marginBrackets,
    onItem: (i, total, rec) => {
      records.push(rec);
      const flag = rec.needsReview ? '⚠️검수' : '✅';
      console.log(`[${ts()}][텍스트 ${i + 1}/${total}] ${flag} ${rec.displayName}  | ${rec.categoryPath} [${rec.categoryCode || '-'}] | ${(rec.ms / 1000).toFixed(1)}s`);
    },
  });

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
      for (let i = 0; i < products.length; i++) {
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
          console.log(`[${ts()}][이미지 ${i + 1}/${products.length}] ⚠️ 누끼 반려 → 원본 대표 (${gate.reason})`);
          continue;
        }
        rec.mainImage = res.path || rec.mainImage;
        rec.thumbProcessed = res.processed;
        if (res.processed) thumbsProcessed++;
        const ico = res.processed ? '🖼️' : '·';
        console.log(`[${ts()}][이미지 ${i + 1}/${products.length}] ${ico} ${path.basename(rec.mainImage)}${res.reason ? ' (' + res.reason + ')' : ''}`);
      }
    } else {
      // ComfyUI 미가동(GPU 없음 등) → BiRefNet CPU 누끼 폴백. 어떤 PC 에서도 배경제거·흰배경 자동.
      console.log(`[${ts()}] ComfyUI 미가동 → BiRefNet CPU 누끼 폴백 시도(GPU 불필요, 배경제거·흰배경 1:1)`);
      const onLog = (m) => console.log(`[${ts()}] ${m}`);
      let cpuOff = false;
      for (let i = 0; i < products.length; i++) {
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
              console.log(`[${ts()}][이미지 ${i + 1}/${products.length}] ⚠️ 누끼 반려 → 원본 대표 (${gate.reason})`);
            } else {
              rec.mainImage = dest;
              console.log(`[${ts()}][이미지 ${i + 1}/${products.length}] 🖼️ ${path.basename(dest)} (${label})`);
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
            console.log(`[${ts()}][이미지 ${i + 1}/${products.length}] · 누끼 실패 → 원본(${e.message})`);
          }
        }
      }
      thumbEnabled = thumbsProcessed > 0; // 하나라도 CPU 누끼 성공 시 가공됨 표시
      if (!thumbEnabled) for (const rec of records) rec.thumbProcessed = false;
    }
  } else {
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
  console.log(`상품당 평균(텍스트) ${(summary.avgMs / 1000).toFixed(1)}s · 텍스트단계 ${(summary.wallMs / 1000 / 60).toFixed(1)}분 · 후보=${summary.candidateSource}`);
  console.log(`레코드: ${outJsonl}`);
  console.log(`검수화면: ${outHtml}  ← 브라우저로 열어 검수/승인`);

  // 종료 시 엔진 VRAM 해제 — 유휴 점유 제거(다음 작업/다른 프로그램에 양보).
  await unload(model);            // ollama 모델 언로드
  await freeComfyVram(cli.comfy); // ComfyUI(SDXL) 언로드
  console.log(`[${ts()}] 엔진 VRAM 해제 완료(ollama·ComfyUI) — 유휴 점유 제거`);
}

main().catch((e) => { console.error('원큐 오류:', e.message); process.exit(1); });
