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
async function cellBuffer(sharp, imgPath) {
  try {
    return await sharp(imgPath)
      .resize(CELL, CELL, { fit: 'contain', background: { r: 245, g: 245, b: 245 } })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    return null;
  }
}

/** 셀 좌상단 번호 배지 SVG 버퍼(1부터). */
function numberBadge(sharp, n) {
  const svg =
    `<svg width="${CELL}" height="${CELL}" xmlns="http://www.w3.org/2000/svg">`
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
export async function buildContactSheet(paths, { max = 24 } = {}) {
  const sharp = await ensureSharp();
  const src = (paths || []).filter(Boolean).slice(0, max);
  if (src.length === 0) return null;

  // 셀 버퍼 생성(렌더 실패는 스킵)
  const cells = [];
  for (const p of src) {
    const buf = await cellBuffer(sharp, p);
    if (buf) cells.push({ path: p, buf });
  }
  if (cells.length === 0) return null;

  const cols = Math.min(4, Math.ceil(Math.sqrt(cells.length)));
  const rows = Math.ceil(cells.length / cols);
  const W = cols * CELL + GAP * (cols + 1);
  const H = rows * CELL + GAP * (rows + 1);

  const composites = [];
  for (let i = 0; i < cells.length; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const left = GAP + c * (CELL + GAP);
    const top = GAP + r * (CELL + GAP);
    composites.push({ input: cells[i].buf, left, top });
    composites.push({ input: await numberBadge(sharp, i + 1), left, top });
  }

  const sheet = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite(composites)
    .jpeg({ quality: 84 })
    .toBuffer();

  return { b64: sheet.toString('base64'), usedPaths: cells.map((c) => c.path), cols };
}

const VALID_TYPES = new Set(['product', 'texture', 'lifestyle', 'logo_text', 'delivery', 'review_ss', 'person', 'other']);

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
export async function visionCurateProduct({ mainPool = [], detailPool = [], reviewPool = [], model, onLog } = {}) {
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
  let promotedFromReview = null;
  if (!bestMainPath && review.length > 0) {
    const rp = review.find((p) => reviewType.get(p) === 'product') || review.find((p) => reviewType.get(p) === 'lifestyle');
    if (rp) { bestMainPath = rp; promotedFromReview = rp; }
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
