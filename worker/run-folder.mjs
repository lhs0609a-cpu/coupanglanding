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

function parseArgs(argv) {
  const a = { _: [] };
  const flags = new Set(['no-thumb', 'thumb-force', 'no-image-ai']);
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
      const main = await selectBestMainImage(p.mainImages || (p.mainImage ? [p.mainImage] : []), { onLog });
      if (main.method === 'fallback-first') { clipOff = true; console.log(`[${ts()}] [이미지인식] CLIP 미탑재 — 첫컷 폴백(${main.error})`); }
      if (main.path) p.mainImage = main.path;             // 최적 대표컷으로 교체
      p.mainImageRanked = main.ranked;
      const det = await curateDetailImages(p.detailImages || [], { onLog });
      p.detailImagesKept = det.kept.map((k) => k.path);
      // CLIP 이 광고/배송/리뷰컷으로 판단해 버린 파일명 — 웹 등록이 스캔한 상세이미지에서 정확히 이것만 제외한다.
      p.detailDroppedNames = det.dropped.map((d) => path.basename(d.path));
      p.detailDropped = det.dropped.length;
      const pickIco = main.method === 'clip' ? '🎯' : '·';
      const detNote = (p.detailImages || []).length ? ` · 상세 ${p.detailImagesKept.length}/${p.detailImages.length}컷(광고 ${det.dropped.length} 제외)` : '';
      console.log(`[${ts()}][인식 ${i + 1}/${products.length}] ${pickIco} 대표=${path.basename(p.mainImage || '-')}${main.method === 'clip' && main.ranked[0]?.score != null ? ` (점수 ${main.ranked[0].score})` : ''}${detNote}`);
    }
  } else {
    console.log(`[${ts()}] [이미지인식] 생략(--no-image-ai) — 첫컷/원본 상세 유지`);
    for (const p of products) { p.detailImagesKept = p.detailImages || []; p.mainImageRanked = null; p.detailDroppedNames = []; }
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

  // ── Phase B) 대표이미지 가공 (ComfyUI 가 GPU 점유) ──────────────────────
  let thumbsProcessed = 0;
  let thumbEnabled = !cli['no-thumb'];
  if (thumbEnabled) {
    // ollama 모델 언로드 → VRAM 을 ComfyUI 에 양보
    console.log(`[${ts()}] [2/3] ollama 모델 언로드(VRAM 회수) → ComfyUI 준비`);
    await unload(model);
    const thumb = await makeThumbnailProcessor({ comfyUrl: cli.comfy, workflowPath: cli.workflow });
    console.log(`[${ts()}] 대표이미지: ${thumb.ready ? '✅ ' + thumb.info : '⚠️ ' + thumb.info}`);
    if (thumb.ready) {
      for (let i = 0; i < products.length; i++) {
        const p = products[i], rec = records[i];
        if (!p.mainImage) { rec.thumbProcessed = null; continue; }
        const res = await thumb.process(p.mainImage, p.folderPath, { force: !!cli['thumb-force'] });
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
          if (!cli['thumb-force'] && existsSync(dest)) {
            rec.mainImage = dest; rec.thumbProcessed = true; thumbsProcessed++;
            console.log(`[${ts()}][이미지 ${i + 1}/${products.length}] 🖼️ ${path.basename(dest)} (resume)`);
            continue;
          }
          const buf = await localCutoutToWhite(readFileSync(p.mainImage), { onLog });
          mkdirSync(path.dirname(dest), { recursive: true });
          writeFileSync(dest, buf);
          rec.mainImage = dest; rec.thumbProcessed = true; thumbsProcessed++;
          console.log(`[${ts()}][이미지 ${i + 1}/${products.length}] 🖼️ ${path.basename(dest)} (CPU 누끼)`);
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
}

main().catch((e) => { console.error('원큐 오류:', e.message); process.exit(1); });
