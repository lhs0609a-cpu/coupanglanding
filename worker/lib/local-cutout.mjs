/**
 * 로컬 CPU 누끼 (BiRefNet) — ComfyUI/GPU 없이 배경제거 + 흰배경 1:1
 * ---------------------------------------------------------------------------
 * transformers.js(background-removal, BiRefNet_lite) + sharp 로 실제 사진의
 * 배경만 제거하고 순백 1:1 캔버스 중앙정렬. GPU 불필요(onnxruntime CPU).
 *   ComfyUI(SDXL) 미가동 PC 에서도 대표이미지 누끼가 자동 처리되도록 하는 폴백.
 *   ComfyUI 는 "스튜디오컷 재생성"(더 예쁨·GPU 필요), 이건 "실물 배경제거"(픽셀 보존).
 *
 * ⚠️ sharp/transformers 는 데스크톱 node_modules 에만 존재(worker deps=∅).
 *    지연로딩 + 실패 시 예외 → 호출부가 원본 사진으로 폴백(오늘과 동일, 무손상).
 * ⚠️ 데스크톱 thumbnail-processor.mjs(품절동기화용)의 cutout 로직과 동일 규칙.
 */

const MODEL = 'onnx-community/BiRefNet_lite';
const CANVAS = 1000;
const PAD_RATIO = 0.06;

let _deps = null;
let _removerPromise = null;
let _depsFailed = false;

async function ensureDeps(cacheDir) {
  if (_depsFailed) throw new Error('cutout-deps-unavailable');
  if (_deps) return _deps;
  try {
    const sharp = (await import('sharp')).default;
    const tf = await import('@huggingface/transformers');
    tf.env.allowLocalModels = false;
    const dir = cacheDir || process.env.MEGALOAD_HF_CACHE;
    if (dir) tf.env.cacheDir = dir;
    _deps = { sharp, pipeline: tf.pipeline, RawImage: tf.RawImage };
    return _deps;
  } catch (e) {
    _depsFailed = true;
    throw e;
  }
}

async function getRemover(cacheDir, onLog) {
  const { pipeline } = await ensureDeps(cacheDir);
  if (!_removerPromise) {
    onLog?.(`[누끼] BiRefNet 모델 로드 중(${MODEL}, 최초 1회 다운로드)…`);
    _removerPromise = pipeline('background-removal', MODEL, { dtype: 'fp32' });
  }
  return _removerPromise;
}

/** 누끼(RGBA)에서 가장 큰 상품 덩어리 bbox 로 크롭 — 여러 상품/여백 제거해 단일상품 확대 */
async function cropToMainProduct(sharp, cutoutPng) {
  try {
    const meta = await sharp(cutoutPng).metadata();
    const W0 = meta.width, H0 = meta.height;
    if (!W0 || !H0) return cutoutPng;
    const LW = Math.min(400, W0), scale = Math.min(400, W0) / W0;
    const LH = Math.max(1, Math.round(H0 * scale));
    const raw = await sharp(cutoutPng).resize(LW, LH, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
    const N = LW * LH;
    const on = new Uint8Array(N);
    for (let i = 0; i < N; i++) on[i] = raw[i * 4 + 3] > 96 ? 1 : 0;
    const seen = new Uint8Array(N), stack = new Int32Array(N);
    let best = { area: 0, minx: 0, miny: 0, maxx: 0, maxy: 0 };
    for (let s = 0; s < N; s++) {
      if (!on[s] || seen[s]) continue;
      let sp = 0; stack[sp++] = s; seen[s] = 1;
      let area = 0, minx = LW, miny = LH, maxx = 0, maxy = 0;
      while (sp > 0) {
        const q = stack[--sp]; const qx = q % LW, qy = (q / LW) | 0;
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
    if (best.area === 0 || best.area / N < 0.02) return cutoutPng;
    const pad = 0.08;
    let x0 = best.minx / scale, y0 = best.miny / scale, x1 = (best.maxx + 1) / scale, y1 = (best.maxy + 1) / scale;
    const bw = x1 - x0, bh = y1 - y0;
    x0 = Math.max(0, x0 - bw * pad); y0 = Math.max(0, y0 - bh * pad);
    x1 = Math.min(W0, x1 + bw * pad); y1 = Math.min(H0, y1 + bh * pad);
    const left = Math.round(x0), top = Math.round(y0);
    const width = Math.max(1, Math.round(x1 - x0)), height = Math.max(1, Math.round(y1 - y0));
    if (width >= W0 * 0.96 && height >= H0 * 0.96) return cutoutPng;
    return sharp(cutoutPng).extract({ left, top, width, height }).png().toBuffer();
  } catch {
    return cutoutPng;
  }
}

/**
 * 사진 버퍼 → 배경제거 + 순백 1:1 PNG 버퍼.
 * @param {Buffer} inputBuffer  원본 사진
 * @param {{cacheDir?:string, canvas?:number, padRatio?:number, onLog?:Function}} [o]
 * @returns {Promise<Buffer>}   흰배경 1:1 누끼 PNG (실패 시 예외 → 호출부 폴백)
 */
export async function localCutoutToWhite(inputBuffer, o = {}) {
  const canvas = o.canvas ?? CANVAS;
  const padRatio = o.padRatio ?? PAD_RATIO;
  const { sharp, RawImage } = await ensureDeps(o.cacheDir);
  const remove = await getRemover(o.cacheDir, o.onLog);

  // 0) 우리 sharp 로 직접 sRGB raw 픽셀 디코딩 → RawImage 수동 구성.
  //    transformers 내부 fromBlob(번들 sharp)이 일부 Windows/색공간에서
  //    "colourspace: parameter space not set" 로 죽는 문제를 우회한다.
  const { data, info } = await sharp(inputBuffer)
    .toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const image = new RawImage(new Uint8ClampedArray(data), info.width, info.height, info.channels);

  // 1) 누끼 (RGBA)
  const out = await remove(image);
  const fg = Array.isArray(out) ? out[0] : out;
  let png = await sharp(Buffer.from(fg.data), { raw: { width: fg.width, height: fg.height, channels: fg.channels } }).png().toBuffer();
  try { png = await sharp(png).trim().png().toBuffer(); } catch { /* 트림 실패 무시 */ }

  // 2) 메인 상품 크롭 → 여백/잡동사니 제거
  png = await cropToMainProduct(sharp, png);

  // 3) 순백 1:1 중앙정렬
  const inner = Math.max(1, Math.round(canvas * (1 - padRatio * 2)));
  const resized = await sharp(png).resize(inner, inner, { fit: 'inside' }).png().toBuffer();
  const m = await sharp(resized).metadata();
  return sharp({ create: { width: canvas, height: canvas, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: resized, left: Math.max(0, Math.round((canvas - (m.width || inner)) / 2)), top: Math.max(0, Math.round((canvas - (m.height || inner)) / 2)) }])
    .png().toBuffer();
}

/** deps(sharp/transformers) 로드 실패가 확정됐는지 — 호출부가 배치 폴백 판단에 사용 */
export function cutoutDepsFailed() { return _depsFailed; }
