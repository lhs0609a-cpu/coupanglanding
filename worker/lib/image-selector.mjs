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

const MAIN_GOOD = 'a clean product photo on a plain white background';
const MAIN_LABELS = [
  MAIN_GOOD,
  'a product photo with text, letters, or infographic overlay',
  'a lifestyle photo with a person, hand, or model',
  'a collage showing multiple different products',
  'a blurry, dark, or low quality photo',
];

const DETAIL_KEEP = 'a product photo or product detail shot';
const DETAIL_LABELS = [
  DETAIL_KEEP,
  'an advertisement, promotion, or coupon banner',
  'a shipping, delivery, or return policy guide',
  'a review, rating, or chat screenshot',
  'a company logo or text-only banner',
];

/**
 * 대표이미지 후보 중 최적 1장 선택.
 * @param {string[]} imagePaths  main_images 후보 경로들
 * @param {{cacheDir?:string, onLog?:Function}} [o]
 * @returns {Promise<{path:string|null, ranked:Array<{path,score}>, method:string, error?:string}>}
 */
export async function selectBestMainImage(imagePaths, o = {}) {
  const paths = (imagePaths || []).filter(Boolean);
  if (paths.length === 0) return { path: null, ranked: [], method: 'none' };
  if (paths.length === 1) return { path: paths[0], ranked: [{ path: paths[0], score: null }], method: 'single' };

  let pipe;
  try { pipe = await ensureClip(o); }
  catch (e) { return { path: paths[0], ranked: paths.map((p) => ({ path: p, score: null })), method: 'fallback-first', error: e.message }; }

  const ranked = [];
  for (const p of paths) {
    try { const m = await classify(pipe, p, MAIN_LABELS); ranked.push({ path: p, score: +(m[MAIN_GOOD] || 0).toFixed(4) }); }
    catch { ranked.push({ path: p, score: 0 }); }
  }
  ranked.sort((a, b) => b.score - a.score);
  return { path: ranked[0].path, ranked, method: 'clip' };
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
  return { kept: kept.slice(0, max), dropped, method: 'clip' };
}
