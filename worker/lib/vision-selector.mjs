/**
 * 비전(VLM) 기반 이미지 선택/큐레이션 — 이미지를 "직접 보고" 고른다
 * ===========================================================================
 * CLIP 제로샷 라벨·L1 선명도·파일명 정규식 같은 휴리스틱("로직")이 실사용에서
 * 반복 오선택했다(성분 텍스처가 대표로, 로고/글자가 후보로, 배송배너가 상세로).
 * → 로컬 VLM(qwen2.5vl 등)이 실제 픽셀을 보고 판단하게 한다.
 *
 * ⚡ 속도 핵심: 후보 N장을 "번호 격자 한 장(contact sheet)"으로 합쳐 **상품당 1콜**로
 *    전부 판정한다(장당 1콜 = N배 느림을 피함). 인식 캐시(run-folder)와 결합하면
 *    재생성 시 0콜.
 *
 * 판정 결과(cell.type):
 *   product   — 상품 자체가 또렷이 보이는 사진(용기·포장·음식 등). 대표/상세 적합.
 *   texture   — 성분·크림·원물의 추상 접사(상품 형태 안 보임). 대표 부적합, 상세 보조.
 *   lifestyle — 사람이 들거나 착용/연출 장면. 대표 후순위.
 *   logo_text — 로고·브랜드마크·글자 위주 배너("참여하세요" 등). 전부 제외.
 *   delivery  — 배송/반품/쿠폰/공지 안내 배너. 전부 제외.
 *   review_ss — 채팅·별점·영수증·주문내역 캡처. 전부 제외.
 *   person    — 사람 얼굴/인물 위주(초상권). 대표/상세 제외(리뷰는 얼굴만 제외).
 *   other     — 상품과 무관.
 *
 * sharp 만 의존(루트 상주). VLM 미탑재/실패 시 호출부가 CLIP·L1 폴백을 쓰도록 신호한다.
 */

import { generateVision, parseJsonLoose } from './local-llm.mjs';
import { measureImage, scoreImage, looksCutout, metricsDepsFailed } from './image-metrics.mjs';
import { basename } from 'node:path';

// ── 대표컷 기하 심사 (VLM 이 못 보는 것) ─────────────────────────────────────
//   VLM 은 "무엇이 찍혔는가"는 잘 보지만 "상품이 프레임 밖으로 잘렸는가"는 반복해서 놓친다.
//   프롬프트에 "잘린 컷은 대표 부적합"이라고 써도 확대 접사를 대표로 고른다(실측).
//   → 의미 판정은 VLM, **기하 판정은 sharp(image-metrics)** 로 나눈다.
//      image-metrics 의 cropped 게이트(피사체가 2개 이상 변에 닿음)·해상도·초점을 그대로 쓴다.
//   sharp 미탑재면 null 을 돌려주고 호출부는 기존 VLM 선택을 그대로 쓴다(회귀 0).
async function measureCandidates(paths, { onLog } = {}) {
  const out = new Map();
  for (const p of paths) {
    try {
      const met = await measureImage(p);
      const { score } = scoreImage(met);
      out.set(p, {
        score,
        // mainEdgeSides = 피사체가 닿은 프레임 변의 수. 2개 이상이면 잘렸다고 본다
        // (1면 접촉은 바닥에 놓인 정상 구도에서도 나온다).
        cropped: met.mainEdgeSides >= 2 && met.bgConfidence > 0.25,
        cutout: looksCutout(met, p),
      });
    } catch {
      if (metricsDepsFailed()) { onLog?.('[비전] sharp 미탑재 — 기하 심사 생략(VLM 판정 그대로 사용)'); return null; }
    }
  }
  return out.size ? out : null;
}

let _sharpPromise = null;
let _sharpFailed = false;
async function ensureSharp() {
  if (_sharpFailed) throw new Error('sharp-unavailable');
  if (!_sharpPromise) _sharpPromise = import('sharp').then((m) => m.default).catch((e) => { _sharpFailed = true; throw e; });
  return _sharpPromise;
}
export function visionSharpFailed() { return _sharpFailed; }

const CELL = 300;         // 격자 셀 한 변(px) — 상품/텍스처/로고 구분에 충분
const GAP = 8;
const RED = '#E31837';

/** 단일 이미지를 흰배경 셀 버퍼로(contain 리사이즈). 실패 시 null. */
async function cellBuffer(sharp, imgPath, cell = CELL) {
  try {
    return await sharp(imgPath)
      .resize(cell, cell, { fit: 'contain', background: { r: 245, g: 245, b: 245 } })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    return null;
  }
}

/** 셀 좌상단 번호 배지 SVG 버퍼(1부터). */
function numberBadge(sharp, n, cell = CELL) {
  const svg =
    `<svg width="${cell}" height="${cell}" xmlns="http://www.w3.org/2000/svg">`
    + `<rect x="5" y="5" rx="7" ry="7" width="${n >= 10 ? 62 : 46}" height="40" fill="${RED}"/>`
    + `<text x="${(n >= 10 ? 62 : 46) / 2 + 5}" y="34" font-size="30" font-family="Arial,sans-serif" `
    + `font-weight="bold" fill="#ffffff" text-anchor="middle">${n}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * 후보 경로 배열 → 번호 격자 이미지 1장(base64 jpeg). 렌더 실패 셀은 제외하고
 * 실제 격자에 들어간 경로만 usedPaths 로 반환(번호=배열 인덱스+1 로 대응).
 * @returns {Promise<{b64:string, usedPaths:string[], cols:number}|null>}
 */
export async function buildContactSheet(paths, { max = 24, cell = CELL, maxCols = 4 } = {}) {
  const sharp = await ensureSharp();
  const src = (paths || []).filter(Boolean).slice(0, max);
  if (src.length === 0) return null;

  // 셀 버퍼 생성(렌더 실패는 스킵)
  const cells = [];
  for (const p of src) {
    const buf = await cellBuffer(sharp, p, cell);
    if (buf) cells.push({ path: p, buf });
  }
  if (cells.length === 0) return null;

  const cols = Math.min(maxCols, Math.ceil(Math.sqrt(cells.length)));
  const rows = Math.ceil(cells.length / cols);
  const W = cols * cell + GAP * (cols + 1);
  const H = rows * cell + GAP * (rows + 1);

  const composites = [];
  for (let i = 0; i < cells.length; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const left = GAP + c * (cell + GAP);
    const top = GAP + r * (cell + GAP);
    composites.push({ input: cells[i].buf, left, top });
    composites.push({ input: await numberBadge(sharp, i + 1, cell), left, top });
  }

  const sheet = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite(composites)
    .jpeg({ quality: 84 })
    .toBuffer();

  return { b64: sheet.toString('base64'), usedPaths: cells.map((c) => c.path), cols };
}

const VALID_TYPES = new Set(['product', 'texture', 'lifestyle', 'logo_text', 'delivery', 'review_ss', 'person', 'other']);

// ── 2단계: 대표 후보만 큰 해상도로 다시 보고 "잘렸는지" 판정 ─────────────────
//   1단계 격자는 후보를 최대 24칸(셀 300px)에 몰아넣어 전체를 훑는다. 유형 분류
//   (상품/로고/배너/캡처)는 그 해상도로 충분하지만, "이 병이 위아래로 잘렸는가"는
//   셀이 작아 답이 안 나오는 질문이다 — 실측으로 뚜껑도 바닥도 없는 확대 접사가
//   대표로 뽑혔다(아로마티카 알로에젤 converted_04).
//   sharp 의 기하 측정으로도 못 잡는다: 흰배경 누끼라 피사체가 프레임 변에 닿지 않고,
//   반투명 흰 병이라 테두리 배경색 마스크가 몸통을 배경으로 오인한다(피사체 40%로 측정,
//   실제 85%). → 결정론적 방법이 원리적으로 막히는 지점이라 VLM 에게 크게 보여주고 다시 묻는다.
const FULLFRAME_CELL = 560;   // 2×2 격자 = 약 1.1k 정사각 — 잘림이 눈에 보이는 크기
const FULLFRAME_MAX = 4;      // 후보 상위 4장만(콜 1회 추가로 끝내기 위해)

const FULLFRAME_SYSTEM =
  'You are a Korean e-commerce main-image auditor. You judge ONLY whether the product is fully '
  + 'visible inside each numbered cell, or whether it is cut off by the frame edge. '
  + 'Answer ONLY with JSON.';

/**
 * 대표 후보들을 큰 셀로 다시 보고 "상품이 온전히 들어왔는가"만 판정.
 * @param {string[]} paths  후보(상위 몇 장)
 * @returns {Promise<Map<string, {full:boolean, cut:string}> | null>} 실패 시 null(호출부는 1단계 결과 유지)
 */
export async function judgeFullFrame(paths, { model, onLog } = {}) {
  const src = (paths || []).filter(Boolean).slice(0, FULLFRAME_MAX);
  if (!model || src.length < 2) return null;   // 후보가 1장뿐이면 비교 의미 없음
  let sheet;
  try { sheet = await buildContactSheet(src, { max: FULLFRAME_MAX, cell: FULLFRAME_CELL, maxCols: 2 }); }
  catch { return null; }
  if (!sheet) return null;
  const n = sheet.usedPaths.length;

  const prompt =
    `한 상품의 대표이미지 후보 ${n}장을 번호(빨간 배지 1~${n}) 격자로 합친 것이다.\n`
    + `각 칸에 대해 **상품 전체가 프레임 안에 다 들어왔는지**만 판정하라.\n\n`
    + `- full=false (잘림): 상품의 일부가 사진 경계에서 끊겨 있다. 예) 병의 뚜껑이나 바닥이 안 보이는 확대 접사, `
    + `포장의 위/아래가 잘린 컷, 상품의 한쪽 면만 크게 찍혀 윤곽이 닫히지 않는 컷.\n`
    + `- full=true (온전): 상품의 위·아래·좌·우 윤곽이 모두 사진 안에서 닫혀 있고 보통 여백이 있다.\n\n`
    + `⚠️ 배경이 흰색이어도 상품 자체가 잘려 있으면 full=false 다. 확대되어 크게 보이는 것과 온전한 것은 다르다.\n`
    + `cut 에는 잘린 방향을 적어라(위/아래/좌/우, 여러 개면 쉼표. 온전하면 빈 문자열).\n\n`
    + `출력은 JSON만: {"cells":[{"i":1,"full":true,"cut":""},...(1~${n} 전부)]}`;

  let text;
  try {
    const res = await generateVision({
      model, system: FULLFRAME_SYSTEM, prompt, images: [sheet.b64], format: 'json',
      options: { num_predict: 300 },
    });
    text = res.text;
  } catch (e) {
    onLog?.(`[비전] 잘림 재확인 호출 실패(${String(e?.message || e).slice(0, 80)}) — 1단계 결과 유지`);
    return null;
  }
  const j = parseJsonLoose(text);
  if (!j || !Array.isArray(j.cells)) { onLog?.('[비전] 잘림 재확인 파싱 실패 — 1단계 결과 유지'); return null; }

  const out = new Map();
  for (const c of j.cells) {
    const i = Number(c.i);
    if (!Number.isInteger(i) || i < 1 || i > n) continue;
    out.set(sheet.usedPaths[i - 1], { full: c.full !== false, cut: String(c.cut || '').trim() });
  }
  return out.size ? out : null;
}

const JUDGE_SYSTEM =
  'You are a Korean e-commerce product-image auditor. You look at a numbered grid of candidate '
  + 'images for ONE product listing and classify each cell by what it actually shows. '
  + 'Answer ONLY with JSON. Be strict: a logo, a text banner, a shipping/coupon notice, a chat/'
  + 'rating/receipt screenshot, or an abstract ingredient/cream close-up is NOT a usable product photo.';

/**
 * 격자 이미지를 VLM 이 보고 셀별 유형 + 최적 대표 인덱스를 판정.
 * @param {string[]} paths
 * @param {{model:string, onLog?:Function, purpose?:'main'|'detail'|'review'}} o
 * @returns {Promise<{cells:Array<{i:number,path:string,type:string,productScore:number}>, bestMain:number, method:string}|null>}
 *   실패(VLM 미탑재/렌더 실패/파싱 실패) 시 null → 호출부가 폴백.
 */
export async function judgeImages(paths, { model, onLog, purpose = 'main' } = {}) {
  if (!model) return null;
  let sheet;
  try { sheet = await buildContactSheet(paths); }
  catch { return null; }
  if (!sheet) return null;
  const n = sheet.usedPaths.length;

  const prompt =
    `이 이미지는 한 상품의 후보 사진 ${n}장을 번호(빨간 배지 1~${n})가 붙은 격자로 합친 것이다.\n`
    + `각 번호 칸이 실제로 무엇을 보여주는지 보고 아래 유형 중 하나로 분류하라:\n`
    + `- "product": 상품 자체가 또렷이 보이는 사진(용기/병/포장/음식/기기 등 물건의 형태가 보임)\n`
    + `- "texture": 성분·크림·젤·원물의 추상 접사(상품의 형태는 안 보이고 질감/재료만)\n`
    + `- "lifestyle": 사람이 들거나 착용/사용하는 연출 장면\n`
    + `- "logo_text": 로고·브랜드마크·글자 위주 배너(예: "참여하세요", 상호 로고)\n`
    + `- "delivery": 배송/반품/교환/쿠폰/공지 안내 배너\n`
    + `- "review_ss": 채팅·별점·후기·영수증·주문내역 캡처(스크린샷)\n`
    + `- "person": 사람 얼굴/인물이 주인공\n`
    + `- "other": 상품과 무관\n\n`
    + `그리고 대표이미지로 가장 적합한 칸 하나(bestMain)를 골라라. 기준(우선순위): `
    + `① 상품이 프레임 안에 "온전히" 다 들어온 것(잘리거나 일부만 보이는 컷은 대표 부적합) `
    + `② 상품 하나만 정면으로 또렷하게 `
    + `③ 배경이 흰색/단색으로 깔끔한 것(지식재산권 안전). `
    + `texture/logo_text/delivery/review_ss/person 은 절대 대표가 될 수 없다. 상품이 잘린 컷보다 온전한 컷을 항상 우선한다.\n\n`
    + `출력은 JSON만: {"cells":[{"i":1,"type":"product","product":true},...(1~${n} 전부)],"bestMain":<번호>}`;

  let text;
  try {
    const res = await generateVision({ model, system: JUDGE_SYSTEM, prompt, images: [sheet.b64], format: 'json', options: { num_predict: 700 } });
    text = res.text;
  } catch (e) {
    onLog?.(`[비전] 판정 호출 실패(${String(e?.message || e).slice(0, 100)})`);
    return null;
  }
  const j = parseJsonLoose(text);
  if (!j || !Array.isArray(j.cells)) { onLog?.('[비전] 판정 JSON 파싱 실패 — 폴백'); return null; }

  const byIdx = new Map();
  for (const c of j.cells) {
    const i = Number(c.i);
    if (!Number.isInteger(i) || i < 1 || i > n) continue;
    let type = String(c.type || '').trim().toLowerCase();
    if (!VALID_TYPES.has(type)) type = c.product ? 'product' : 'other';
    byIdx.set(i, { type, product: !!c.product });
  }

  const cells = sheet.usedPaths.map((path, k) => {
    const info = byIdx.get(k + 1) || { type: 'other', product: false };
    // productScore: 대표 적합도(대표 선택 정렬용). product=1, lifestyle/texture 중간, 나머지 0.
    const score = info.type === 'product' ? 1
      : info.type === 'lifestyle' ? 0.5
      : info.type === 'texture' ? 0.35
      : 0;
    return { i: k, path, type: info.type, productScore: score };
  });

  // bestMain: VLM 지정 우선(단 product 여야 함), 아니면 productScore 최고.
  let bestMain = -1;
  const declared = Number(j.bestMain);
  if (Number.isInteger(declared) && declared >= 1 && declared <= n) {
    const cand = cells[declared - 1];
    if (cand && cand.type === 'product') bestMain = declared - 1;
  }
  if (bestMain < 0) {
    let top = -1;
    for (const c of cells) if (c.productScore > top && c.type === 'product') { top = c.productScore; bestMain = c.i; }
  }
  return { cells, bestMain, method: 'vision' };
}

// ── 유형 → 쓰임새 매핑 ───────────────────────────────────────────────────────
//   대표: product 만(정면 단독). 상세본문: 상품이 보이거나 성분/연출까지 허용.
//   리뷰컷: 구매자 실사용이라 product/연출 허용, 사람 얼굴·캡처·안내배너만 제외.
const MAIN_OK = new Set(['product']);
const DETAIL_OK = new Set(['product', 'texture', 'lifestyle']);
const REVIEW_OK = new Set(['product', 'lifestyle', 'texture']);

/**
 * 상품 1개의 대표/상세/리뷰 이미지를 VLM 이 "직접 보고" 큐레이션.
 * ---------------------------------------------------------------------------
 * 콜 수 = 상품당 2 (대표+상세 합쳐 1장 격자, 리뷰 1장 격자). 인식 캐시와 결합 시 재생성 0콜.
 * VLM 미탑재/판정 실패 시 null 반환 → 호출부가 기존 CLIP·L1 파이프라인으로 폴백.
 *
 * @param {{mainPool:string[], detailPool:string[], reviewPool:string[], model:string, onLog?:Function}} o
 * @returns {Promise<null | {
 *   mainImage: string|null, mainRanked: {path:string,score:number}[], mainConfident: boolean, mainReason: string|null,
 *   mainDroppedNamesPaths: string[],          // 대표 후보에서 제외할(로고/글자/배너 등) 경로
 *   detailKept: string[], detailDropped: {path:string,reason:string}[],
 *   reviewKept: string[], reviewDropped: {path:string,reason:string}[],
 *   promotedFromDetail: string|null,
 * }>}
 */
export async function visionCurateProduct({ mainPool = [], detailPool = [], reviewPool = [], model, onLog, kind = 'generic' } = {}) {
  // 과일·음식은 누끼(배경제거)를 하면 오히려 어색하다 — 배가 공중에 뜬 것처럼 보인다(실측).
  //   그래서 ① 이미 누끼된 컷을 대표로 우대하지 않고(오히려 후순위),
  //          ② 리뷰컷(구매자 실사)도 대표 후보로 올린다. 실물이 잘 보이는 게 낫다.
  const isFresh = kind === 'fruit' || kind === 'food';
  if (!model) return null;
  const uniq = (arr) => [...new Set((arr || []).filter(Boolean))];
  const main = uniq(mainPool);
  const detail = uniq(detailPool).filter((p) => !main.includes(p));
  const review = uniq(reviewPool);

  // 격자 1: 대표 후보 + 상세컷 함께(대표는 상세컷으로도 승격 가능하므로 한 판에 심사).
  //   ⚠️ 격자 상한(24)을 넘는 컷은 "미판정"이 된다 → 아래 상세 루프에서 미판정=보존으로
  //      처리해 유실을 막는다(judgeImages 가 실제로 격자에 넣은 컷만 typeOf 에 담긴다).
  const combined = [...main, ...detail].slice(0, 24);
  if (combined.length === 0 && review.length === 0) return null;

  const typeOf = new Map();      // path → type
  let bestMainPath = null;
  if (combined.length > 0) {
    const judged = await judgeImages(combined, { model, onLog, purpose: 'main' });
    if (!judged) return null;    // 대표 판정 실패 → 전체 폴백(반쪽 큐레이션 방지)
    for (const c of judged.cells) typeOf.set(c.path, c.type);
    if (judged.bestMain >= 0 && judged.cells[judged.bestMain]) bestMainPath = judged.cells[judged.bestMain].path;
  }

  // 격자 2: 리뷰컷(있을 때만).
  const reviewType = new Map();
  if (review.length > 0) {
    const rjudged = await judgeImages(review, { model, onLog, purpose: 'review' });
    if (rjudged) for (const c of rjudged.cells) reviewType.set(c.path, c.type);
  }

  const reasonKo = (t) => ({
    logo_text: '로고/글자 배너', delivery: '배송/안내 배너', review_ss: '후기/영수증 캡처',
    person: '사람 얼굴/인물', texture: '성분/질감 접사(상품 아님)', lifestyle: '연출컷', other: '상품 무관',
  }[t] || t);

  // 대표를 못 찾았으면(전 후보가 로고/텍스처/짤림) 리뷰이미지의 상품컷을 대표로 승격.
  //   지재권상 흰누끼가 이상적이지만, 마땅한 상품 정면컷이 아예 없으면 구매자 실사진이라도 쓴다.
  //   ⭐ 과일·음식은 "없을 때만"이 아니라 **항상** 리뷰 실사를 후보로 본다(누끼 결과가 어색하므로).
  let promotedFromReview = null;
  const reviewMainCandidates = isFresh
    ? review.filter((p) => reviewType.get(p) === 'product' || reviewType.get(p) === 'lifestyle')
    : [];
  if (!bestMainPath && review.length > 0) {
    const rp = review.find((p) => reviewType.get(p) === 'product') || review.find((p) => reviewType.get(p) === 'lifestyle');
    if (rp) { bestMainPath = rp; promotedFromReview = rp; }
  }

  // ── 기하 심사: 잘린 컷을 대표에서 밀어낸다 ────────────────────────────────
  //   VLM 이 product 로 본 컷 전부를 후보로 놓고 sharp 로 잰다.
  //   ① 잘리지 않은 후보가 하나라도 있으면 잘린 후보는 대표에서 제외한다.
  //   ② 남은 후보 중 VLM 의 선택(bestMainPath)이 살아 있으면 그대로 존중(의미 판단은 VLM 우선).
  //   ③ 아니면 기하 점수 1위로 교체.
  const productCands = [
    ...combined.filter((p) => typeOf.get(p) === 'product'),
    ...reviewMainCandidates,
  ];
  if (productCands.length > 1) {
    const geo = await measureCandidates(productCands, { onLog });
    if (geo) {
      const uncropped = productCands.filter((p) => !geo.get(p)?.cropped);
      const pool = uncropped.length ? uncropped : productCands;
      // 과일·음식: 누끼된 컷은 뒤로 민다(어색함). 그 외에는 누끼된 컷이 쿠팡 규격이라 유리.
      const rank = (p) => {
        const g = geo.get(p);
        if (!g) return 0;
        const cutoutAdj = isFresh ? (g.cutout ? 0.6 : 1.15) : (g.cutout ? 1.3 : 1);
        return g.score * cutoutAdj;
      };
      const sorted = [...pool].sort((a, b) => rank(b) - rank(a));
      const keptVlmPick = bestMainPath && pool.includes(bestMainPath);
      // VLM 선택이 잘림으로 탈락했거나, 과일인데 누끼컷을 골랐으면 교체한다.
      const vlmPickBad = bestMainPath && (!keptVlmPick || (isFresh && geo.get(bestMainPath)?.cutout));
      if (vlmPickBad && sorted[0]) {
        const why = !keptVlmPick ? '상품이 프레임 밖으로 잘림' : '과일·음식은 누끼컷이 어색함';
        onLog?.(`[비전] 대표 교체(${why}): ${basename(bestMainPath)} → ${basename(sorted[0])}`);
        bestMainPath = sorted[0];
      } else if (!bestMainPath && sorted[0]) {
        bestMainPath = sorted[0];
      }
      if (bestMainPath && reviewMainCandidates.includes(bestMainPath) && !promotedFromReview) {
        promotedFromReview = bestMainPath;
      }
    }
  }

  // 대표: product 만. bestMain 이 원래 대표풀이 아니면(상세컷) 승격 표시.
  let promotedFromDetail = null;
  if (bestMainPath && !main.includes(bestMainPath) && detail.includes(bestMainPath)) {
    promotedFromDetail = bestMainPath;
  }
  const mainConfident = !!bestMainPath;
  const mainReason = mainConfident ? null : '정면 단독 상품컷을 찾지 못함(전 후보가 로고/글자/텍스처/배너) — 리뷰컷도 없음';

  // 대표 후보 제외 목록 = 대표풀 중 product 가 아닌 것(로고/글자/배너/캡처/인물/무관).
  //   texture/lifestyle 은 "상품일 수도" 있어 후보로는 남기되 기본대표로는 안 뽑는다.
  const mainDroppedNamesPaths = main.filter((p) => {
    const t = typeOf.get(p);
    return t && !MAIN_OK.has(t) && t !== 'texture' && t !== 'lifestyle';
  });

  // 대표 랭킹(웹 재정렬용): product 를 앞으로, bestMain 을 최상단.
  const rankScore = (p) => {
    if (p === bestMainPath) return 3;
    const t = typeOf.get(p);
    return t === 'product' ? 2 : (t === 'lifestyle' || t === 'texture') ? 1 : 0;
  };
  const mainRanked = [...main].sort((a, b) => rankScore(b) - rankScore(a)).map((p) => ({ path: p, score: rankScore(p) }));

  // 상세: product/texture/lifestyle 유지, 나머지 제외. 승격된 대표컷은 상세에서 뺀다.
  //   ⚠️ 격자 상한을 넘어 판정되지 않은 컷(typeOf 에 없음)은 보존한다 — 유실 방지(안전 우선).
  const detailKept = [], detailDropped = [];
  for (const p of detail) {
    if (p === promotedFromDetail) { detailDropped.push({ path: p, reason: '대표로 승격' }); continue; }
    if (!typeOf.has(p)) { detailKept.push(p); continue; } // 미판정 → 보존
    const t = typeOf.get(p);
    if (DETAIL_OK.has(t)) detailKept.push(p);
    else detailDropped.push({ path: p, reason: reasonKo(t) });
  }

  // 리뷰: product/lifestyle/texture 유지, 사람/캡처/배너/무관 제외.
  const reviewKept = [], reviewDropped = [];
  for (const p of review) {
    if (p === promotedFromReview) continue; // 대표로 승격됨 → 본문 중복 제외
    const t = reviewType.get(p) || 'product'; // 리뷰 판정 실패분은 보존(안전 우선)
    if (REVIEW_OK.has(t)) reviewKept.push(p);
    else reviewDropped.push({ path: p, reason: reasonKo(t) });
  }

  return {
    mainImage: bestMainPath || main[0] || null,
    mainRanked,
    mainConfident,
    mainReason,
    mainDroppedNamesPaths,
    detailKept,
    detailDropped,
    reviewKept,
    reviewDropped,
    promotedFromDetail,
  };
}
