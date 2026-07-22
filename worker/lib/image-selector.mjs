/**
 * CLIP 기반 이미지 인식 — 대표이미지 자동추천 + 상세이미지 큐레이션 (완전 로컬)
 * ---------------------------------------------------------------------------
 * transformers.js(zero-shot-image-classification, CLIP)로 사진 "내용"을 읽어
 *   1) main_images 후보 중 쿠팡이 좋아하는 대표컷(흰배경·단독·정면·선명)을 점수화해 선택
 *   2) detail_images 에서 광고/배송안내/리뷰캡처/로고 등 비상품 컷을 걸러 상품 상세컷만 큐레이션
 *
 * ⚠️ transformers.js/sharp 는 무겁고 packaged Electron top-level import 시 실패하면
 *    메인이 죽으므로 "실제 호출 시" 지연 로딩한다(thumbnail-processor 와 동일 패턴).
 *    로드 실패(=standalone CLI 등 미탑재) 시 조용히 폴백:
 *      - 대표: 첫 번째 후보  · 상세: 원본 전부(광고 파일명 필터는 스캐너가 이미 함)
 *    → 인식이 없어도 파이프라인은 그대로 동작(오늘과 동일), 있으면 품질 향상.
 */

import { measureImage, scoreImage, metricsDepsFailed } from './image-metrics.mjs';

const MODEL = 'Xenova/clip-vit-base-patch32';

let _pipePromise = null;
let _loadFailed = false;

/** CLIP 파이프라인 1회 로드(지연). 실패 시 이후 호출은 즉시 폴백. */
async function ensureClip({ cacheDir, onLog } = {}) {
  if (_loadFailed) throw new Error('clip-unavailable');
  if (_pipePromise) return _pipePromise;
  _pipePromise = (async () => {
    const tf = await import('@huggingface/transformers');
    tf.env.allowLocalModels = false;
    const dir = cacheDir || process.env.MEGALOAD_HF_CACHE;
    if (dir) tf.env.cacheDir = dir;
    onLog?.(`[이미지인식] CLIP 모델 로드 중(${MODEL}, 최초 1회 다운로드)…`);
    const pipe = await tf.pipeline('zero-shot-image-classification', MODEL, {
      progress_callback: (p) => {
        if (p?.status === 'progress' && p.progress != null && Math.round(p.progress) % 25 === 0) {
          onLog?.(`[이미지인식] 모델 다운로드 ${Math.round(p.progress)}%`);
        }
      },
    });
    onLog?.('[이미지인식] CLIP 준비 완료');
    return pipe;
  })().catch((e) => { _loadFailed = true; throw e; });
  return _pipePromise;
}

/** 이미지 1장을 후보 라벨로 분류 → {label: score} (softmax) */
async function classify(pipe, imgPath, labels) {
  const out = await pipe(imgPath, labels); // [{label, score}] 내림차순
  const m = {};
  for (const o of out) m[o.label] = o.score;
  return m;
}

// ⭐ 긍정 기준은 "흰배경"이 아니라 "정면·단독·완전한 상품"이다.
//    누끼(local-cutout)가 어차피 배경을 흰색으로 바꾸고 상품을 88%로 꽉 채운다 →
//    "흰배경인가"로 고르면 이미 납작한 흰바탕인 네이버 "N" 로고가 최고점을 받아 뽑힌다
//    (실측: 이 배치의 N 로고·장갑 손 오선택 원인). 그래서 누끼가 못 고치는 것만 본다:
//    정면인가 · 상품 하나만인가 · 안 잘렸나 · 선명한가.
const MAIN_GOOD = 'a clear front-facing photo of one whole single product';
const MAIN_LOGO = 'a logo, brand icon, app symbol, letter mark, or blank placeholder image';
const MAIN_LIFESTYLE = 'a photo of a product held in a hand or worn by a person';
const MAIN_ANGLE = 'a back view, tilted angle, or close-up cropped part of a product';
const MAIN_LABELS = [
  MAIN_GOOD,
  'a product photo with text, letters, or infographic overlay',
  MAIN_LIFESTYLE,
  MAIN_ANGLE,
  MAIN_LOGO,
  'a collage showing multiple different products',
  'a blurry, dark, or low quality photo',
];
// top 라벨이 이 집합이면 "대표컷 부적합" — MAIN_GOOD(정면·단독·완전)이 아니면 감점, 로고는 하드 반려.
const MAIN_BAD_TOP = new Set(MAIN_LABELS.slice(1));

const DETAIL_KEEP = 'a product photo or product detail shot';
const DETAIL_LABELS = [
  DETAIL_KEEP,
  'an advertisement, promotion, or coupon banner',
  'a shipping, delivery, or return policy guide',
  'a review, rating, or chat screenshot',
  'a company logo or text-only banner',
];

/** CLIP softmax 결과 → 대표컷 의미 판정. semanticFactor 1(적합)~0.05(로고 하드반려). */
function mainSemantics(m) {
  const good = +(m[MAIN_GOOD] || 0).toFixed(4);
  const entries = Object.entries(m).sort((a, b) => b[1] - a[1]);
  const topLabel = entries[0]?.[0] || '';
  const isLogo = topLabel === MAIN_LOGO || (m[MAIN_LOGO] || 0) >= 0.45;
  const isLifestyle = topLabel === MAIN_LIFESTYLE;
  const isBadTop = MAIN_BAD_TOP.has(topLabel);
  // 로고/플레이스홀더는 어떤 경우에도 대표컷이 되면 안 된다 → 사실상 반려.
  let factor;
  if (isLogo) factor = 0.05;
  else if (!isBadTop) factor = 1;            // MAIN_GOOD 이 top
  else if (isLifestyle) factor = 0.55;       // 연출/손 컷 — 원본 있으면 밀려남
  else factor = 0.4;                          // 텍스트오버레이/콜라주/저화질 top
  // MAIN_GOOD 확신이 아주 낮으면(≤0.2) top 이 아니어도 추가 감점
  if (good <= 0.2) factor *= 0.6;
  return { good, topLabel, isLogo, isBadTop, factor };
}

/**
 * 대표이미지 후보 중 최적 1장 선택.
 *   ⭐ 두 신호를 결합한다:
 *     ① CLIP 의미 분류 — 로고/플레이스홀더/연출컷/텍스트오버레이를 걸러낸다(N 로고 문제).
 *     ② L1 결정론 품질(image-metrics, sharp) — 해상도·선명도·콜라주·프레이밍(누끼가 못 고치는 것).
 *   최종점수 = L1품질 × CLIP의미계수. 로고는 계수 0.05 로 사실상 반려.
 *   deps 가용성에 따라 자동 폴백: 둘 다 → 결합 / CLIP만 / L1만 / 둘 다 없으면 첫컷.
 * @param {string[]} imagePaths  main_images 후보 경로들
 * @param {{cacheDir?:string, onLog?:Function}} [o]
 * @returns {Promise<{path:string|null, ranked:Array, method:string, confident:boolean, reason?:string, error?:string}>}
 *   confident=false 면 run-folder 가 needsReview 로 표기(전 후보가 로고/저품질일 때).
 */
export async function selectBestMainImage(imagePaths, o = {}) {
  const paths = (imagePaths || []).filter(Boolean);
  if (paths.length === 0) return { path: null, ranked: [], method: 'none', confident: false };

  // ── CLIP 지연로드(선택적) ──
  let pipe = null;
  try { pipe = await ensureClip(o); } catch { pipe = null; }

  const ranked = [];
  let l1Off = false;
  for (const p of paths) {
    let good = null, factor = 1, isLogo = false, topLabel = null;
    if (pipe) {
      try { const s = mainSemantics(await classify(pipe, p, MAIN_LABELS)); good = s.good; factor = s.factor; isLogo = s.isLogo; topLabel = s.topLabel; }
      catch { /* 이 컷만 CLIP 실패 → 의미계수 중립 */ }
    }
    // L1 결정론 품질(sharp) — 미탑재면 1회만 감지 후 이후 스킵.
    let l1 = null;
    if (!l1Off) {
      try { const met = await measureImage(p); l1 = scoreImage(met).score; }
      catch (e) { if (metricsDepsFailed()) l1Off = true; }
    }
    // 결합: 기준점 = L1(있으면) 아니면 CLIP good(있으면) 아니면 0.5(중립).
    const base = l1 != null ? l1 : (good != null ? good : 0.5);
    const score = +(base * factor).toFixed(4);
    ranked.push({ path: p, score, good, l1: l1 != null ? +l1.toFixed(4) : null, topLabel, isLogo });
  }
  ranked.sort((a, b) => b.score - a.score);

  const noSignal = !pipe && l1Off;                       // 둘 다 미탑재 → 순수 첫컷 폴백
  const method = noSignal ? 'fallback-first' : pipe ? (l1Off ? 'clip' : 'clip+l1') : 'l1';
  const best = ranked[0];
  // 신호가 있을 때만 사유를 매긴다 — deps 미탑재(noSignal)면 판단 불가이므로 flag 하지 않는다.
  const reason = noSignal || !best ? undefined
    : best.isLogo ? '로고/플레이스홀더만 있음(실제 상품 사진 없음)'
    : (best.l1 != null && best.l1 < 0.3) ? `대표컷 품질 낮음(${best.l1})`
    : (best.good != null && best.good < 0.25) ? '흰배경 단독컷 아님(연출/텍스트 컷)'
    : undefined;
  // 확신 = 사유 없음(noSignal 포함). 사유가 있으면 run-folder 가 needsReview 로 승격.
  const confident = !reason;
  return { path: best ? best.path : null, ranked, method, confident, reason };
}

/**
 * 상세이미지 큐레이션 — 비상품(광고/배송안내/리뷰/로고) 컷 제거, 원본 순서 보존.
 * @param {string[]} imagePaths  detail_images 후보 경로들
 * @param {{cacheDir?:string, onLog?:Function, max?:number, minKeep?:number}} [o]
 * @returns {Promise<{kept:Array<{path,score}>, dropped:Array<{path,reason,score}>, method:string, error?:string}>}
 */
export async function curateDetailImages(imagePaths, o = {}) {
  const paths = (imagePaths || []).filter(Boolean);
  const max = o.max ?? 12;
  const minKeep = o.minKeep ?? 0.35;
  if (paths.length === 0) return { kept: [], dropped: [], method: 'none' };

  let pipe;
  try { pipe = await ensureClip(o); }
  catch (e) { return { kept: paths.slice(0, max).map((p) => ({ path: p, score: null })), dropped: [], method: 'fallback-all', error: e.message }; }

  const kept = [], dropped = [];
  for (const p of paths) {
    try {
      const m = await classify(pipe, p, DETAIL_LABELS);
      const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
      if (top[0] === DETAIL_KEEP && m[DETAIL_KEEP] >= minKeep) kept.push({ path: p, score: +m[DETAIL_KEEP].toFixed(4) });
      else dropped.push({ path: p, reason: top[0], score: +(m[DETAIL_KEEP] || 0).toFixed(4) });
    } catch {
      kept.push({ path: p, score: null }); // 분류 실패는 보존(안전 우선)
    }
  }
  // ⚠️ 전부 광고/배너로 판정돼 kept 가 0 이 되면 상세페이지에 이미지가 하나도 안 들어간다.
  //    네이버 소싱분은 상세컷이 텍스트 위주라 CLIP 이 전량 드롭하기 쉽다. 최소한 상품컷
  //    점수(DETAIL_KEEP)가 높은 순으로 minRescue 장은 되살려 "이미지 0장"을 막는다.
  const minRescue = o.minRescue ?? 3;
  if (kept.length === 0 && dropped.length > 0) {
    const rescued = [...dropped].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, minRescue);
    const rescuedSet = new Set(rescued.map((r) => r.path));
    return {
      kept: rescued.map((r) => ({ path: r.path, score: r.score })),
      dropped: dropped.filter((d) => !rescuedSet.has(d.path)),
      method: 'clip-rescue',
    };
  }
  return { kept: kept.slice(0, max), dropped, method: 'clip' };
}
