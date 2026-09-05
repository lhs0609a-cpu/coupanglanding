/**
 * 대표컷 결정론적 품질 측정 (Layer 1) — "누끼가 못 고치는 것"만 잰다
 * ---------------------------------------------------------------------------
 * Phase B(ComfyUI SDXL / BiRefNet)가 배경·여백·비율을 어차피 새로 만든다.
 * 따라서 "흰배경인가"는 대표컷 선택 기준이 될 수 없다(고르나 마나 흰배경이 됨).
 * 여기서는 누끼가 복구하지 못하는 항목만 측정한다:
 *
 *   해상도      원본이 작으면 1000px 캔버스에서 뭉갠다        → 복구 불가
 *   선명도      초점이 나가면 끝                              → 복구 불가
 *   피사체 점유 너무 작으면 확대 시 화질저하                  → 복구 불가
 *   프레이밍    상품이 프레임 밖으로 잘림                     → 복구 불가
 *   단독성      콜라주/다수상품 → 쿠팡 대표컷 반려 사유       → 복구 불가
 *
 * sharp 만 쓴다(루트 node_modules 상주). transformers/BiRefNet/CLIP 불필요 →
 * 모델 다운로드도 GPU 도 없이 장당 수십 ms. image-selector(CLIP)의 대안이자
 * 그것이 미탑재일 때의 실질 대체재.
 *
 * ⚠️ 마스크는 테두리 배경색 추정으로 만든다. 단색 배경에서 정확하고 배경이
 *    복잡하면 흐려지므로, 그 신뢰도를 bgConfidence 로 함께 보고한다
 *    (조용히 틀리지 않게). 신뢰도가 낮으면 scoreImage 가 마스크 기반 항목의
 *    가중치를 자동으로 낮추고 해상도·선명도로 판단한다.
 */
import { readFileSync, statSync } from 'node:fs';

/** 측정용 고정 축소 크기 — 후보 간 점수가 비교 가능하려면 같은 스케일이어야 한다 */
const WORK = 384;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

let _sharpPromise = null;
let _sharpFailed = false;

/** sharp 지연 로드(1회). 실패 시 호출부가 폴백할 수 있도록 예외. */
async function ensureSharp() {
  if (_sharpFailed) throw new Error('sharp-unavailable');
  if (!_sharpPromise) {
    _sharpPromise = import('sharp').then((m) => m.default).catch((e) => { _sharpFailed = true; throw e; });
  }
  return _sharpPromise;
}

/** deps 로드 실패가 확정됐는지 — 호출부의 배치 폴백 판단용 (local-cutout 과 동일 패턴) */
export function metricsDepsFailed() { return _sharpFailed; }

/**
 * 라플라시안 분산 = 초점/선명도. 흐린 사진일수록 0 에 가깝다.
 * ⚠️ 호출 전 median(3) 필수 — 라플라시안은 가우시안 노이즈를 "선명함"으로 읽는다.
 *    실측(합성 노이즈 σ60): raw 1552 vs 선명한 실사 234 → 노이즈가 1등이 된다.
 *    median(3) 통과 시 노이즈 94.6 / 실사 204.8 로 순서가 바로잡힌다.
 *    (blur(1) 은 노이즈와 함께 진짜 엣지도 죽여서 234→31.8 — 쓰면 안 된다.)
 */
function laplacianVar(d, W, H) {
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const v = 4 * d[i] - d[i - 1] - d[i + 1] - d[i - W] - d[i + W];
      sum += v; sum2 += v * v; n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return Math.max(0, sum2 / n - mean * mean);
}

/**
 * 배경색을 "모서리 4곳"으로 추정하고, 배경과 다른 픽셀을 전경 마스크로 삼는다.
 *
 * ⚠️ 테두리 띠 전체로 추정하면 안 된다 — 상품이 프레임 밖으로 넘치는(=잘린) 사진은
 *    테두리의 67%가 상품색이라 배경 추정이 오염되고 마스크가 통째로 반전된다
 *    (실측: 흰 모서리 4개가 "상품 덩어리 4개"로 잡힘). 모서리는 상품이 넘쳐도
 *    마지막까지 배경으로 남으므로 추정 기준으로 안전하다.
 *
 * 그리고 "테두리가 배경과 다르다"는 사실 자체가 잘림의 직접 증거다(borderDeviation).
 * 이걸 마스크 신뢰도 저하로 처리하면 잘린 사진이 감점을 면제받는 역효과가 난다.
 */
function maskFromCornerBg(d, W, H, C) {
  const px = (x, y) => (y * W + x) * C;
  const patch = Math.max(3, Math.round(Math.min(W, H) * 0.10));

  // 모서리 4곳의 평균색 + 내부 산포(질감)
  const corners = [[0, 0], [W - patch, 0], [0, H - patch], [W - patch, H - patch]].map(([ox, oy]) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = oy; y < oy + patch; y++) for (let x = ox; x < ox + patch; x++) { const i = px(x, y); r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    const m = [r / n, g / n, b / n];
    let acc = 0;
    for (let y = oy; y < oy + patch; y++) for (let x = ox; x < ox + patch; x++) { const i = px(x, y); acc += (d[i] - m[0]) ** 2 + (d[i + 1] - m[1]) ** 2 + (d[i + 2] - m[2]) ** 2; }
    return { mean: m, std: Math.sqrt(acc / n / 3) };
  });

  // 채널별 중앙값 — 모서리 하나가 상품/로고에 먹혀도 나머지 3개가 이긴다
  const med = [0, 1, 2].map((ch) => {
    const v = corners.map((c) => c.mean[ch]).sort((a, b) => a - b);
    return (v[1] + v[2]) / 2;
  });
  const l1 = (m) => Math.abs(m[0] - med[0]) + Math.abs(m[1] - med[1]) + Math.abs(m[2] - med[2]);
  const cornerSpread = Math.max(...corners.map((c) => l1(c.mean)));   // 모서리끼리 얼마나 다른가 = 배경 그라데이션/잡배경
  const cornerTexture = corners.reduce((s, c) => s + c.std, 0) / 4;   // 모서리 자체의 질감 = 노이즈/패턴 배경

  // 임계값을 배경 질감에 적응시킨다 — 깨끗한 흰배경은 민감하게, 노이즈 배경은 둔감하게.
  const thr = Math.max(30, cornerTexture * 3);
  const on = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const i = p * C;
    const dist = Math.abs(d[i] - med[0]) + Math.abs(d[i + 1] - med[1]) + Math.abs(d[i + 2] - med[2]);
    on[p] = dist > thr ? 1 : 0;
  }

  // 테두리 띠 중 배경이 아닌 비율 = 상품이 프레임을 넘침(잘림)
  const band = Math.max(2, Math.round(Math.min(W, H) * 0.03));
  let dev = 0, tot = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!(x < band || x >= W - band || y < band || y >= H - band)) continue;
      tot++; if (on[y * W + x]) dev++;
    }
  }

  return {
    on,
    bgLum: (med[0] + med[1] + med[2]) / 3,
    cornerSpread,
    cornerTexture,
    borderDeviation: tot ? dev / tot : 0,
    // 모서리끼리 일치하고(그라데이션 아님) 질감이 낮을수록(단색) 마스크를 믿을 수 있다
    bgConfidence: clamp01((90 - cornerSpread) / 70) * clamp01((45 - cornerTexture) / 35),
  };
}

/** 4-이웃 연결성분 — 면적 내림차순. local-cutout.cropToMainProduct 와 동일 알고리즘. */
function components(on, W, H) {
  const N = W * H;
  const seen = new Uint8Array(N), stack = new Int32Array(N);
  const comps = [];
  for (let s = 0; s < N; s++) {
    if (!on[s] || seen[s]) continue;
    let sp = 0; stack[sp++] = s; seen[s] = 1;
    let area = 0, minx = W, miny = H, maxx = 0, maxy = 0;
    while (sp > 0) {
      const q = stack[--sp];
      const qx = q % W, qy = (q / W) | 0;
      area++;
      if (qx < minx) minx = qx; if (qx > maxx) maxx = qx;
      if (qy < miny) miny = qy; if (qy > maxy) maxy = qy;
      if (qx > 0)     { const t = q - 1; if (on[t] && !seen[t]) { seen[t] = 1; stack[sp++] = t; } }
      if (qx < W - 1) { const t = q + 1; if (on[t] && !seen[t]) { seen[t] = 1; stack[sp++] = t; } }
      if (qy > 0)     { const t = q - W; if (on[t] && !seen[t]) { seen[t] = 1; stack[sp++] = t; } }
      if (qy < H - 1) { const t = q + W; if (on[t] && !seen[t]) { seen[t] = 1; stack[sp++] = t; } }
    }
    comps.push({ area, minx, miny, maxx, maxy });
  }
  comps.sort((a, b) => b.area - a.area);
  return comps;
}

/** 마스크 픽셀 중 이미지 가장자리에 닿은 비율 — 상품이 잘렸는지 */
function edgeTouchRatio(on, W, H) {
  let touch = 0, total = 0;
  for (let p = 0; p < W * H; p++) {
    if (!on[p]) continue;
    total++;
    const x = p % W, y = (p / W) | 0;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) touch++;
  }
  return total ? touch / total : 0;
}

// ── 측정 캐시 — 같은 파일을 여러 번 재는 낭비를 없앤다 ──────────────────────
//   ⚡ 한 상품에서 같은 경로가 최소 3번 측정된다: 비전 후보 랭킹(measureCandidates) →
//      누끼 필요판정(looksCutout) → 누끼 게이트(gateCutout 의 원본 비교). 한 장당
//      sharp 디코드가 3회(메타 + 그레이 + 컬러)라 장당 수십~수백 ms 가 그대로 곱해진다.
//   키는 경로+크기+수정시각이라 파일이 바뀌면 자동 무효화된다(누끼로 새로 쓴 파일은 미스).
//   버퍼 입력은 캐시하지 않는다(동일성 판단 근거가 없다).
const _measCache = new Map();
const MEAS_CACHE_MAX = 512;

function measCacheKey(p) {
  try { const st = statSync(p); return `${p}|${st.size}|${Math.round(st.mtimeMs)}`; }
  catch { return null; }
}

/**
 * 사진 1장 측정 → 원시 지표(점수 아님).
 * @param {string|Buffer} input 파일경로 또는 버퍼
 * @returns {Promise<Object>} { minSide, aspect, sharpness, subjectRatio, edgeTouch, compCount, soloShare, bgStd, bgLum, bgConfidence }
 */
export async function measureImage(input) {
  if (typeof input === 'string') {
    const key = measCacheKey(input);
    if (key) {
      const hit = _measCache.get(key);
      if (hit) return hit;
      const p = measureRaw(input);
      _measCache.set(key, p);
      // 측정 실패(손상 파일 등)는 캐시에 남기지 않는다 — 다음 호출이 원래대로 예외를 받게.
      p.catch(() => { _measCache.delete(key); });
      if (_measCache.size > MEAS_CACHE_MAX) _measCache.delete(_measCache.keys().next().value);
      return p;
    }
  }
  return measureRaw(input);
}

async function measureRaw(input) {
  const sharp = await ensureSharp();
  const buf = typeof input === 'string' ? readFileSync(input) : input;

  const meta = await sharp(buf).metadata();
  const W0 = meta.width || 0, H0 = meta.height || 0;

  // ⭐ .rotate() = EXIF 방향(회전·미러) 적용 후 측정 — 뒤집힌 사진을 정방향 기준으로 평가.
  // median(3) 로 노이즈만 죽이고 엣지는 보존한 뒤 라플라시안 — 위 laplacianVar 주석 참조
  const g = await sharp(buf).rotate().greyscale().resize(WORK, WORK, { fit: 'inside' }).median(3)
    .raw().toBuffer({ resolveWithObject: true });
  const sharpness = laplacianVar(g.data, g.info.width, g.info.height);

  const c = await sharp(buf).rotate().toColourspace('srgb').removeAlpha()
    .resize(WORK, WORK, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = c.info;
  const { on, bgLum, cornerSpread, cornerTexture, borderDeviation, bgConfidence } = maskFromCornerBg(c.data, W, H, C);

  const comps = components(on, W, H);
  const maskArea = comps.reduce((s, x) => s + x.area, 0);
  const largest = comps[0]?.area || 0;
  const second = comps[1]?.area || 0;

  // 잡티(면적 1% 미만)는 덩어리로 세지 않는다 — 먼지·그림자 조각 오탐 방지.
  const significant = comps.filter((x) => x.area >= W * H * 0.01);

  // 최대 덩어리(=상품)의 bbox 가 이미지 변에 닿은 개수 = 잘림의 강건한 증거.
  //   테두리 픽셀 비율(borderDeviation)로 재면 노이즈 배경이 거짓양성을 내고(실측 27%),
  //   반대로 상품이 모서리까지 먹은 진짜 잘림은 bgConfidence 를 떨구며 감점을 면제받았다.
  //   최대 덩어리 bbox 는 흩뿌려진 노이즈 조각에 흔들리지 않아 둘을 정확히 가른다.
  const b = comps[0];
  const mainEdgeSides = b ? [b.minx <= 1, b.miny <= 1, b.maxx >= W - 2, b.maxy >= H - 2].filter(Boolean).length : 0;

  return {
    width: W0,
    height: H0,
    minSide: Math.min(W0, H0),
    aspect: W0 && H0 ? +(W0 / H0).toFixed(3) : 0,
    sharpness: +sharpness.toFixed(1),
    subjectRatio: +(maskArea / (W * H)).toFixed(4),
    edgeTouch: +edgeTouchRatio(on, W, H).toFixed(4),
    compCount: significant.length,
    soloShare: largest ? +(1 - second / largest).toFixed(4) : 0,
    mainEdgeSides,
    borderDeviation: +borderDeviation.toFixed(4),
    cornerSpread: +cornerSpread.toFixed(1),
    cornerTexture: +cornerTexture.toFixed(1),
    bgLum: +bgLum.toFixed(1),
    bgConfidence: +bgConfidence.toFixed(3),
  };
}

/** 가중치 — 하니스가 스윕할 수 있게 밖으로 뺀다 */
export const DEFAULT_WEIGHTS = {
  sharpness: 0.30,   // 초점 (복구 불가, 최우선)
  resolution: 0.20,  // 원본 픽셀 (복구 불가)
  subject: 0.25,     // 피사체 점유율
  solo: 0.15,        // 단독성(콜라주 아님)
  framing: 0.10,     // 잘리지 않음
};

/** 쿠팡 대표이미지 최소 해상도 */
const MIN_SIDE_HARD = 500;

/**
 * 하드 결함 = 쿠팡 반려 사유. 가중평균에 섞으면 나머지 항목이 희석해 버린다
 * (실측: 콜라주 사진이 다른 항목 만점으로 0.768 을 받아 3등 안에 들었다).
 * 그래서 곱셈 게이트로 분리한다 — 하나라도 걸리면 순위에서 밀려나야 한다.
 */
const GATES = [
  { key: 'resolution', mul: 0.3, test: (m) => m.minSide > 0 && m.minSide < MIN_SIDE_HARD,
    msg: (m) => `해상도 ${m.minSide}px < ${MIN_SIDE_HARD}` },
  { key: 'blur', mul: 0.4, test: (m, p) => p.sharpness < 0.25,
    msg: (m) => `초점 흐림(라플라시안 ${m.sharpness})` },
  { key: 'collage', mul: 0.5, test: (m) => m.compCount > 1 && m.bgConfidence > 0.5,
    msg: (m) => `덩어리 ${m.compCount}개(콜라주 의심)` },
  // 2면 이상 = 명백히 프레임을 넘침. 1면 접촉은 정상 구도에서도 나와 게이트하지 않는다.
  { key: 'cropped', mul: 0.5, test: (m) => m.mainEdgeSides >= 2 && m.bgConfidence > 0.25,
    msg: (m) => `상품이 ${m.mainEdgeSides}개 변에 닿음(잘림 의심)` },
];

/**
 * 원시 지표 → 0~1 점수 = 소프트 품질(가중평균) × 하드 결함 게이트(곱).
 *
 * 마스크 신뢰도(bgConfidence)가 낮으면 마스크 기반 3항목(subject/solo/framing)의
 * 가중치를 신뢰도만큼 줄이고 남은 무게를 해상도·선명도로 재분배한다
 * → 배경이 복잡한 사진에서 마스크 추정을 근거로 잘못 확신하지 않는다.
 */
export function scoreImage(m, weights = DEFAULT_WEIGHTS) {
  const parts = {
    // 300px=0, 1000px=1. 쿠팡 권장 1000 이상에서 만점.
    resolution: clamp01((m.minSide - 300) / 700),
    // 로그 스케일 — median(3) 통과 후 lapVar 는 흐림 1 ~ 선명 200 ~ 고밀도 2000 범위.
    sharpness: clamp01(Math.log10(1 + m.sharpness) / 3.3),
    // 이상 구간 0.25~0.75. 너무 작으면 확대 손실, 너무 크면 잘림 위험.
    subject: m.subjectRatio < 0.25 ? clamp01(m.subjectRatio / 0.25)
      : m.subjectRatio > 0.75 ? clamp01((1 - m.subjectRatio) / 0.25) : 1,
    // 2등 덩어리가 1등만큼 크면 콜라주 → 0.
    solo: clamp01(m.soloShare),
    // 가장자리 접촉 10% 이상이면 0.
    framing: clamp01(1 - m.edgeTouch / 0.1),
  };

  const maskBased = ['subject', 'solo', 'framing'];
  const w = { ...weights };
  let freed = 0;
  for (const k of maskBased) {
    const keep = w[k] * m.bgConfidence;
    freed += w[k] - keep;
    w[k] = keep;
  }
  // 회수한 무게를 "항상 믿을 수 있는" 두 항목에 원비율대로 재분배
  const solidTotal = w.resolution + w.sharpness;
  if (solidTotal > 0 && freed > 0) {
    w.resolution += freed * (w.resolution / solidTotal);
    w.sharpness += freed * (w.sharpness / solidTotal);
  }

  let quality = 0, wsum = 0;
  for (const k of Object.keys(parts)) { quality += parts[k] * (w[k] || 0); wsum += w[k] || 0; }
  quality = wsum ? quality / wsum : 0;

  const gates = [];
  let penalty = 1;
  for (const gate of GATES) {
    if (!gate.test(m, parts)) continue;
    gates.push(gate.msg(m));
    penalty *= gate.mul;
  }

  return { score: +(quality * penalty).toFixed(4), quality: +quality.toFixed(4), parts, gates, weights: w };
}

/**
 * "이미 누끼된(흰배경 단독) 컷인가" — 소싱 폴더의 main_images 에는 소싱처가 이미 배경을
 * 지워 둔 컷(converted_01.png 같은)이 들어 있는 경우가 많다. 그걸 또 누끼하면
 *   ① 시간이 몇 배로 들고(가장 느린 단계) ② 이미 깨끗한 사진을 다시 잘라 품질만 떨어진다.
 * → 대표컷이 이미 누끼면 가공을 통째로 건너뛴다(run-folder), 선택 단계에선 가점(image-selector).
 * @param {Object} m  measureImage 결과
 * @param {string} [filePath] 파일명 힌트(converted_/cutout/누끼 …)
 */
export function looksCutout(m, filePath = '') {
  const nameHint = /(^|[_\-/\\])(converted|cutout|nuki|누끼|white[_-]?bg|bg[_-]?removed)/i.test(String(filePath));
  if (!m) return nameHint;
  // 흰(밝은) 균일 배경 + 배경 판정 신뢰 + 피사체가 실재 = 누끼 결과물의 특징
  const whiteBg = m.bgLum >= 235 && m.bgConfidence >= 0.55 && m.subjectRatio >= 0.05 && m.subjectRatio <= 0.95;
  return whiteBg || (nameHint && m.bgConfidence >= 0.3);
}

/**
 * "업체가 각 잡고 찍은 스튜디오컷" 판별 — 지재권 위험이 가장 큰 부류.
 * ---------------------------------------------------------------------------
 * 왜 필요한가: 소싱처 대표/상세 이미지의 상당수는 **판매자가 촬영·보정한 상업용 사진**이다.
 *   이걸 그대로 우리 대표컷으로 올리면 분쟁 소지가 가장 크다. 반면 구매자 리뷰 실사나
 *   우리가 직접 만든 누끼본은 위험이 낮다. 그래서 대표 선정에서 이 부류를 뒤로 민다.
 *
 * 무엇으로 가르나(추가 모델 없이 sharp 지표만):
 *   · 규격 프레이밍   — 정사각(1:1)에 가깝고 해상도가 크다. 상업 촬영물의 납품 규격.
 *   · 균일한 스튜디오 조명 — 모서리 밝기 편차(cornerSpread)·질감(cornerTexture)이 거의 없다.
 *   · 깨끗한 배경     — bgConfidence 가 높고 배경이 밝다.
 * 구매자 실사는 생활 배경·임의 비율·불균일 조명이라 위 조건을 동시에 만족하기 어렵다.
 *
 * ⚠️ 우리가 만든 누끼본도 "흰 배경 + 정사각"이라 조건이 겹친다. 그건 지재권 위험이 없으므로
 *    호출부에서 looksCutout() 으로 먼저 걸러 이 판정을 적용하지 않는다.
 *
 * @returns {{studio:boolean, confidence:number, why:string[]}}
 */
export function looksStudioShot(m) {
  if (!m) return { studio: false, confidence: 0, why: [] };
  const why = [];
  let score = 0;
  // ① 규격 프레이밍 — 1:1 근접 + 큰 해상도
  const squarish = m.aspect >= 0.95 && m.aspect <= 1.05;
  if (squarish) { score += 0.35; why.push('정사각 규격'); }
  if (m.minSide >= 800) { score += 0.15; why.push('고해상도'); }
  // ② 스튜디오 조명 — 모서리 밝기 편차·질감이 거의 없다
  if (m.cornerSpread <= 12 && m.cornerTexture <= 8) { score += 0.3; why.push('균일 조명'); }
  // ③ 깨끗한 밝은 배경
  if (m.bgConfidence >= 0.6 && m.bgLum >= 200) { score += 0.3; why.push('깨끗한 배경'); }
  // ④ 피사체가 중앙에 온전히 — 프레임에 안 닿음(연출 구도)
  if (m.mainEdgeSides === 0 && m.subjectRatio >= 0.1) { score += 0.1; why.push('중앙 배치'); }
  const confidence = Math.min(1, +score.toFixed(2));
  // 조명·배경 둘 다 만족해야 스튜디오로 본다(하나만으론 밝은 곳에서 찍은 실사와 구분 안 됨).
  const studio = confidence >= 0.75 && m.bgConfidence >= 0.6 && m.cornerSpread <= 12;
  return { studio, confidence, why };
}

/**
 * 대표컷 후보 랭킹 — image-selector.selectBestMainImage 와 동일한 반환 형태라
 * run-folder 에 그대로 갈아끼울 수 있다(측정 후 결정).
 * @param {string[]} imagePaths
 * @param {{weights?:Object, onLog?:Function}} [o]
 * @returns {Promise<{path:string|null, ranked:Array<{path,score,metrics,parts,gates}>, method:string, error?:string}>}
 */
export async function selectBestMainImageL1(imagePaths, o = {}) {
  const paths = (imagePaths || []).filter(Boolean);
  if (paths.length === 0) return { path: null, ranked: [], method: 'none' };
  if (paths.length === 1) return { path: paths[0], ranked: [{ path: paths[0], score: null }], method: 'single' };

  const weights = o.weights || DEFAULT_WEIGHTS;
  const ranked = [];
  for (const p of paths) {
    try {
      const metrics = await measureImage(p);
      const { score, parts, gates } = scoreImage(metrics, weights);
      ranked.push({ path: p, score, metrics, parts, gates });
    } catch (e) {
      if (metricsDepsFailed()) {
        // sharp 미탑재 → 측정 자체가 불가. 첫컷 폴백(현재 동작과 동일, 무손상).
        return { path: paths[0], ranked: paths.map((x) => ({ path: x, score: null })), method: 'fallback-first', error: e.message };
      }
      o.onLog?.(`[L1] 측정 실패 ${p}: ${e.message}`);
      ranked.push({ path: p, score: 0, metrics: null, parts: null, gates: ['측정 실패'] });
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  return { path: ranked[0].path, ranked, method: 'l1' };
}
