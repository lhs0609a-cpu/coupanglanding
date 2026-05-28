// ============================================================
// 썸네일 처리
//   기본(cutout): BiRefNet 누끼 + 흰배경 1:1 무크롭 — 상품 픽셀 보존(완벽 재현)
//   재생성(regenerate, PT 원클릭): 누끼 → 파임 prefill → SDXL img2img(전체 균일 재생성)
//                                  → 재누끼 → 흰배경 1:1
//     · 잘림/지저분/흐림 대표사진을 "깨끗한 스튜디오 컷"으로. 인페인트와 달리 패치 경계 없음.
//     · img2img 는 ComfyUI(GPU) 가 수행(img2imgFn 주입). 실패 시 누끼 결과로 폴백.
//     · 생성이라 실물과 미세 차이 → PT 가 확인 후 사용(원클릭 옵션).
//
// 모델: onnx-community/BiRefNet_lite (MIT). userData/hf-cache 에 최초 1회 캐시.
// ============================================================

// ⚠️ sharp(네이티브) + @huggingface/transformers(onnxruntime 네이티브)는 무겁고,
//    패키징된 Electron 에서 top-level import 시 로드 실패하면 메인 프로세스가
//    창을 띄우기도 전에 즉시 죽는다(= "앱이 아무것도 안 뜸"). 그래서 지연 로딩한다 —
//    썸네일 누끼/재생성을 실제로 호출할 때만 로드하고, 실패해도 앱·다른 모듈(LLM 등)은 정상.
let sharp, pipeline, env, RawImage;
let _depsPromise = null;
async function ensureDeps() {
  if (!_depsPromise) {
    _depsPromise = (async () => {
      sharp = (await import('sharp')).default;
      const tf = await import('@huggingface/transformers');
      pipeline = tf.pipeline; env = tf.env; RawImage = tf.RawImage;
    })();
  }
  return _depsPromise;
}

const MODEL = 'onnx-community/BiRefNet_lite';
const CANVAS = 1000;
const PAD_RATIO = 0.06;
const WORK = 1024;        // img2img 작업 해상도 (SDXL 친화)

let _removerPromise = null;
function getRemover(cacheDir) {
  if (!_removerPromise) {
    env.allowLocalModels = false;
    if (cacheDir) env.cacheDir = cacheDir;
    _removerPromise = pipeline('background-removal', MODEL, { dtype: 'fp32' });
  }
  return _removerPromise;
}

/** 누끼 → 투명 트림된 RGBA PNG */
async function cutout(inputBuffer, cacheDir) {
  const remove = await getRemover(cacheDir);
  const out = await remove(await RawImage.fromBlob(new Blob([inputBuffer])));
  const fg = Array.isArray(out) ? out[0] : out;
  const png = await sharp(Buffer.from(fg.data), { raw: { width: fg.width, height: fg.height, channels: fg.channels } }).png().toBuffer();
  try { return await sharp(png).trim().png().toBuffer(); } catch { return png; }
}

/** 누끼 RGBA → 순백 1:1 무크롭 */
async function composeWhite(cutoutPng, canvas = CANVAS, padRatio = PAD_RATIO) {
  const inner = Math.max(1, Math.round(canvas * (1 - padRatio * 2)));
  const resized = await sharp(cutoutPng).resize(inner, inner, { fit: 'inside' }).png().toBuffer();
  const m = await sharp(resized).metadata();
  return sharp({ create: { width: canvas, height: canvas, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: resized, left: Math.max(0, Math.round((canvas - (m.width || inner)) / 2)), top: Math.max(0, Math.round((canvas - (m.height || inner)) / 2)) }])
    .png().toBuffer();
}

/** 누끼 RGBA → WORK 정사각 RGB(흰배경). 파인 부분(볼록껍질)은 상품 평균색으로 prefill → 둥근 실루엣 */
async function prefillOnWhite(cutoutPng) {
  const S = WORK;
  const sq = await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp(cutoutPng).resize(Math.round(S * 0.9), Math.round(S * 0.9), { fit: 'inside' }).toBuffer(), gravity: 'center' }])
    .png().toBuffer();
  const raw = await sharp(sq).raw().toBuffer(); // RGBA
  const alpha = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) alpha[i] = raw[i * 4 + 3];

  // 상품 평균색
  let ar = 0, ag = 0, ab = 0, ac = 0;
  for (let i = 0; i < S * S; i++) if (alpha[i] > 128) { ar += raw[i * 4]; ag += raw[i * 4 + 1]; ab += raw[i * 4 + 2]; ac++; }
  if (!ac) return null;
  ar = ar / ac | 0; ag = ag / ac | 0; ab = ab / ac | 0;

  // 볼록껍질 (행별 좌/우 극점 → monotone chain)
  const pts = [];
  for (let y = 0; y < S; y++) { let l = -1, r = -1; for (let x = 0; x < S; x++) if (alpha[y * S + x] > 128) { if (l < 0) l = x; r = x; } if (l >= 0) { pts.push([l, y]); pts.push([r, y]); } }
  if (pts.length < 3) return null;
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  const up = []; for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  const hull = lo.slice(0, -1).concat(up.slice(0, -1));
  const inP = (px, py) => { let c = false; for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) { const xi = hull[i][0], yi = hull[i][1], xj = hull[j][0], yj = hull[j][1]; if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) c = !c; } return c; };

  // RGB: 상품=원본, 파임(껍질 안 & 투명)=평균색, 그 외=흰색
  const rgb = Buffer.alloc(S * S * 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    if (alpha[i] > 128) { rgb[i * 3] = raw[i * 4]; rgb[i * 3 + 1] = raw[i * 4 + 1]; rgb[i * 3 + 2] = raw[i * 4 + 2]; }
    else if (inP(x, y)) { rgb[i * 3] = ar; rgb[i * 3 + 1] = ag; rgb[i * 3 + 2] = ab; }
    else { rgb[i * 3] = 255; rgb[i * 3 + 1] = 255; rgb[i * 3 + 2] = 255; }
  }
  return sharp(rgb, { raw: { width: S, height: S, channels: 3 } }).png().toBuffer();
}

/**
 * 누끼(RGBA) 에서 "메인(가장 큰) 상품" 덩어리를 찾아 그 영역으로 크롭한다.
 *   여러 상품/잡동사니가 찍힌 사진에서 가장 큰 연결요소(=주요 상품)만 남겨,
 *   이어지는 img2img 가 "단일 상품 확대 정면"을 안정적으로 만들도록.
 *   (서로 붙은 상품은 한 덩어리라 분리는 안 되지만, 배경 여백을 잘라 확대 효과는 있음)
 * @param {Buffer} cutoutPng  투명 배경 RGBA PNG
 * @returns {Promise<Buffer>}
 */
async function cropToMainProduct(cutoutPng) {
  try {
    const meta = await sharp(cutoutPng).metadata();
    const W0 = meta.width, H0 = meta.height;
    if (!W0 || !H0) return cutoutPng;
    // 라벨링은 축소본(최대 400px)에서 — 빠르게. bbox 는 원본 비율로 환산.
    const LW = Math.min(400, W0);
    const scale = LW / W0;
    const LH = Math.max(1, Math.round(H0 * scale));
    const raw = await sharp(cutoutPng).resize(LW, LH, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
    const N = LW * LH;
    const on = new Uint8Array(N);
    for (let i = 0; i < N; i++) on[i] = raw[i * 4 + 3] > 96 ? 1 : 0;
    // 4-연결 연결요소 라벨링(스택 flood fill) → 최대 면적 덩어리의 bbox
    const seen = new Uint8Array(N);
    const stack = new Int32Array(N);
    let best = { area: 0, minx: 0, miny: 0, maxx: 0, maxy: 0 };
    for (let s = 0; s < N; s++) {
      if (!on[s] || seen[s]) continue;
      let sp = 0; stack[sp++] = s; seen[s] = 1;
      let area = 0, minx = LW, miny = LH, maxx = 0, maxy = 0;
      while (sp > 0) {
        const q = stack[--sp];
        const qx = q % LW, qy = (q / LW) | 0;
        area++;
        if (qx < minx) minx = qx; if (qx > maxx) maxx = qx;
        if (qy < miny) miny = qy; if (qy > maxy) maxy = qy;
        if (qx > 0)      { const n = q - 1;  if (on[n] && !seen[n]) { seen[n] = 1; stack[sp++] = n; } }
        if (qx < LW - 1) { const n = q + 1;  if (on[n] && !seen[n]) { seen[n] = 1; stack[sp++] = n; } }
        if (qy > 0)      { const n = q - LW; if (on[n] && !seen[n]) { seen[n] = 1; stack[sp++] = n; } }
        if (qy < LH - 1) { const n = q + LW; if (on[n] && !seen[n]) { seen[n] = 1; stack[sp++] = n; } }
      }
      if (area > best.area) best = { area, minx, miny, maxx, maxy };
    }
    if (best.area === 0 || best.area / N < 0.02) return cutoutPng; // 내용 없음/노이즈 → 원본
    // bbox → 원본 해상도 + 8% 패딩
    const pad = 0.08;
    let x0 = best.minx / scale, y0 = best.miny / scale;
    let x1 = (best.maxx + 1) / scale, y1 = (best.maxy + 1) / scale;
    const bw = x1 - x0, bh = y1 - y0;
    x0 = Math.max(0, x0 - bw * pad); y0 = Math.max(0, y0 - bh * pad);
    x1 = Math.min(W0, x1 + bw * pad); y1 = Math.min(H0, y1 + bh * pad);
    const left = Math.round(x0), top = Math.round(y0);
    const width = Math.max(1, Math.round(x1 - x0)), height = Math.max(1, Math.round(y1 - y0));
    // 이미 거의 전체면(잘라낼 여백 거의 없음) 굳이 크롭 안 함
    if (width >= W0 * 0.96 && height >= H0 * 0.96) return cutoutPng;
    return sharp(cutoutPng).extract({ left, top, width, height }).png().toBuffer();
  } catch (e) {
    console.warn('[thumb] 메인상품 크롭 실패 → 원본 사용:', e?.message || e);
    return cutoutPng;
  }
}

/**
 * 누끼(RGBA)에서 '명백히 기울어진 직사각형 상품'만 수평 보정(deskew).
 * 안전 원칙 — 더 나빠질 일이 없게:
 *   1) 잘린 상품(경계 접촉↑)·둥근/불규칙 상품(직사각도 낮음)·미세각(<4°)·과대각(>22°)은 건드리지 않음
 *   2) 추정각으로 ±양방향 회전 후 '축정렬 bbox 면적이 실제로 더 작아질 때만' 적용(아니면 원본)
 * @param {Buffer} cutoutPng 투명배경 RGBA
 */
async function deskewIfTilted(cutoutPng) {
  try {
    const meta = await sharp(cutoutPng).metadata();
    const W0 = meta.width, H0 = meta.height;
    if (!W0 || !H0) return cutoutPng;
    const LW = Math.min(360, W0), scale = (Math.min(360, W0)) / W0;
    const LH = Math.max(1, Math.round(H0 * scale));
    const raw = await sharp(cutoutPng).resize(LW, LH, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
    const on = (x, y) => raw[(y * LW + x) * 4 + 3] > 96;

    // 경계 접촉 → 잘림 의심 시 보정 안 함(형태 불완전)
    let edgeHits = 0;
    for (let x = 0; x < LW; x++) { if (on(x, 0)) edgeHits++; if (on(x, LH - 1)) edgeHits++; }
    for (let y = 0; y < LH; y++) { if (on(0, y)) edgeHits++; if (on(LW - 1, y)) edgeHits++; }
    if (edgeHits / (2 * (LW + LH)) > 0.12) return cutoutPng;

    // 윤곽점 → 볼록껍질
    const pts = [];
    for (let y = 0; y < LH; y++) { let l = -1, r = -1; for (let x = 0; x < LW; x++) if (on(x, y)) { if (l < 0) l = x; r = x; } if (l >= 0) { pts.push([l, y]); pts.push([r, y]); } }
    if (pts.length < 8) return cutoutPng;
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = []; for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    const up = []; for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    const hull = lo.slice(0, -1).concat(up.slice(0, -1));
    if (hull.length < 4) return cutoutPng;
    let hullArea = 0; for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) hullArea += hull[j][0] * hull[i][1] - hull[i][0] * hull[j][1];
    hullArea = Math.abs(hullArea) / 2;
    if (hullArea < LW * LH * 0.03) return cutoutPng;

    // 최소면적 외접 사각형 각도(0~89° 스윕) + 직사각도
    let bestArea = Infinity, bestDeg = 0;
    for (let deg = 0; deg < 90; deg++) {
      const t = deg * Math.PI / 180, ct = Math.cos(t), st = Math.sin(t);
      let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
      for (const [px, py] of hull) { const rx = px * ct - py * st, ry = px * st + py * ct; if (rx < mnx) mnx = rx; if (rx > mxx) mxx = rx; if (ry < mny) mny = ry; if (ry > mxy) mxy = ry; }
      const area = (mxx - mnx) * (mxy - mny);
      if (area < bestArea) { bestArea = area; bestDeg = deg; }
    }
    if (hullArea / bestArea < 0.72) return cutoutPng; // 직사각형 아님 → 보정 안 함
    let ang = bestDeg > 45 ? bestDeg - 90 : bestDeg;
    if (Math.abs(ang) < 4 || Math.abs(ang) > 22) return cutoutPng; // 미세/과대각 제외

    // ±양방향 회전 후 더 반듯해진(트림 면적 작은) 쪽만 채택. 둘 다 원본보다 안 작으면 원본 유지.
    const trimArea = async (a) => {
      try {
        const r = await sharp(cutoutPng).rotate(a, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).trim().png().toBuffer();
        const m = await sharp(r).metadata();
        return { area: (m.width || 1e9) * (m.height || 1e9), buf: r };
      } catch { return { area: Infinity, buf: cutoutPng }; }
    };
    const base = (await sharp(cutoutPng).trim().metadata().catch(() => ({}))) || {};
    const baseArea = (base.width || W0) * (base.height || H0);
    const pos = await trimArea(ang), neg = await trimArea(-ang);
    const best = pos.area <= neg.area ? pos : neg;
    return best.area < baseArea * 0.97 ? best.buf : cutoutPng; // 3%+ 더 반듯할 때만 적용
  } catch (e) {
    console.warn('[thumb] deskew 건너뜀:', e?.message || e);
    return cutoutPng;
  }
}

/**
 * @param {Buffer} inputBuffer
 * @param {{canvas?:number,padRatio?:number,cacheDir?:string,
 *          mode?:'cutout'|'regenerate', img2imgFn?:(rgbPng:Buffer)=>Promise<Buffer>}} [opts]
 */
export async function processCutoutThumbnail(inputBuffer, { canvas = CANVAS, padRatio = PAD_RATIO, cacheDir, mode = 'cutout', img2imgFn, regenPrompt, regenNegative } = {}) {
  await ensureDeps(); // 무거운 네이티브 의존성 지연 로딩 (이 함수가 실제 호출될 때만)
  const cut = await cutout(inputBuffer, cacheDir);

  if (mode === 'regenerate' && img2imgFn) {
    try {
      const main = await cropToMainProduct(cut);              // 메인(가장 큰) 상품만 크롭 → 단일상품 확대
      const prefilled = await prefillOnWhite(main);           // 파임 채운 흰배경 입력
      if (prefilled) {
        const regen = await img2imgFn(prefilled, regenPrompt, regenNegative); // 상품명 프롬프트로 img2img
        const recut = await cutout(regen, cacheDir);          // 재누끼
        return composeWhite(recut, canvas, padRatio);
      }
    } catch (e) {
      console.warn('[thumb] 재생성 실패 → 누끼 폴백:', e?.message || e);
    }
  }

  // 누끼 모드(및 재생성 폴백): 메인 상품 크롭 → 수평보정(기울어진 직사각 상품만) → 중앙정렬 흰배경.
  //   실물 글자 그대로 보존(재생성 X). deskew 는 자기검증식이라 더 반듯해질 때만 적용.
  const main = await cropToMainProduct(cut);
  const leveled = await deskewIfTilted(main);
  return composeWhite(leveled, canvas, padRatio);
}
