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
import { measureImage, scoreImage, looksCutout, looksStudioShot, metricsDepsFailed } from './image-metrics.mjs';
import { basename } from 'node:path';

// ── 대표컷 기하 심사 (VLM 이 못 보는 것) ─────────────────────────────────────
//   VLM 은 "무엇이 찍혔는가"는 잘 보지만 "상품이 프레임 밖으로 잘렸는가"는 반복해서 놓친다.
//   프롬프트에 "잘린 컷은 대표 부적합"이라고 써도 확대 접사를 대표로 고른다(실측).
//   → 의미 판정은 VLM, **기하 판정은 sharp(image-metrics)** 로 나눈다.
//      image-metrics 의 cropped 게이트(피사체가 2개 이상 변에 닿음)·해상도·초점을 그대로 쓴다.
//   sharp 미탑재면 null 을 돌려주고 호출부는 기존 VLM 선택을 그대로 쓴다(회귀 0).
async function measureCandidates(paths, { onLog } = {}) {
  const out = new Map();
  // ⚡ 측정은 순수 CPU(sharp) 라 서로 기다릴 이유가 없다 — 후보 20여 장이면 순차는 체감된다.
  //    결과는 경로별로 Map 에 넣으므로 완료 순서와 무관하다(판정 결과 동일).
  const measured = await Promise.all(paths.map(async (p) => {
    try { return { p, met: await measureImage(p) }; }
    catch { return { p, met: null }; }
  }));
  let depsFailed = false;
  for (const { p, met } of measured) {
    if (!met) { if (metricsDepsFailed()) depsFailed = true; continue; }
    const { score } = scoreImage(met);
    const cutout = looksCutout(met, p);
    // 업체 각잡은 스튜디오컷 판별(지재권 위험). 우리가 만든 누끼본은 흰배경·정사각이라
    //   조건이 겹치므로 여기서 제외한다 — 누끼는 우리 산출물이라 위험이 없다.
    const st = cutout ? { studio: false, confidence: 0 } : looksStudioShot(met);
    out.set(p, {
      score,
      // mainEdgeSides = 피사체가 닿은 프레임 변의 수. 2개 이상이면 잘렸다고 본다
      // (1면 접촉은 바닥에 놓인 정상 구도에서도 나온다).
      // ⚠️ 이 값으로 후보를 **탈락시키지는 않는다**(게이트 제거, 위 랭킹 주석 참조).
      cropped: met.mainEdgeSides >= 2 && met.bgConfidence > 0.25,
      cutout,
      studio: st.studio,
      studioConfidence: st.confidence,
    });
  }
  if (depsFailed) { onLog?.('[비전] sharp 미탑재 — 기하 심사 생략(VLM 판정 그대로 사용)'); return null; }
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

// 번호 배지는 상품이 바뀌어도 "번호+셀크기"가 같으면 픽셀이 완전히 같다 → 한 번만 렌더한다.
//   상품마다 24장씩 SVG→PNG 를 다시 굽던 낭비 제거(결과 이미지는 바이트 단위로 동일).
const _badgeCache = new Map();

/** 셀 좌상단 번호 배지 SVG 버퍼(1부터). */
function numberBadge(sharp, n, cell = CELL) {
  const key = `${n}|${cell}`;
  const hit = _badgeCache.get(key);
  if (hit) return hit;
  const svg =
    `<svg width="${cell}" height="${cell}" xmlns="http://www.w3.org/2000/svg">`
    + `<rect x="5" y="5" rx="7" ry="7" width="${n >= 10 ? 62 : 46}" height="40" fill="${RED}"/>`
    + `<text x="${(n >= 10 ? 62 : 46) / 2 + 5}" y="34" font-size="30" font-family="Arial,sans-serif" `
    + `font-weight="bold" fill="#ffffff" text-anchor="middle">${n}</text></svg>`;
  const p = sharp(Buffer.from(svg)).png().toBuffer();
  _badgeCache.set(key, p);
  p.catch(() => _badgeCache.delete(key)); // 렌더 실패는 캐시에 남기지 않는다
  return p;
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
  //   ⚡ 리사이즈는 서로 독립이라 동시에 굽는다. 순서는 src 순으로 유지하므로 격자 배치와
  //      번호(=배열 인덱스+1)는 예전과 완전히 동일하다.
  const bufs = await Promise.all(src.map((p) => cellBuffer(sharp, p, cell)));
  const cells = [];
  for (let i = 0; i < src.length; i++) if (bufs[i]) cells.push({ path: src[i], buf: bufs[i] });
  if (cells.length === 0) return null;

  const cols = Math.min(maxCols, Math.ceil(Math.sqrt(cells.length)));
  const rows = Math.ceil(cells.length / cols);
  const W = cols * cell + GAP * (cols + 1);
  const H = rows * cell + GAP * (rows + 1);

  const badges = await Promise.all(cells.map((_, i) => numberBadge(sharp, i + 1, cell)));
  const composites = [];
  for (let i = 0; i < cells.length; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const left = GAP + c * (cell + GAP);
    const top = GAP + r * (cell + GAP);
    composites.push({ input: cells[i].buf, left, top });
    composites.push({ input: badges[i], left, top });
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
export async function judgeImages(paths, { model, onLog, purpose = 'main', timeoutMs } = {}) {
  if (!model) return null;
  let sheet;
  try { sheet = await buildContactSheet(paths); }
  catch { return null; }
  if (!sheet) return null;
  const n = sheet.usedPaths.length;

  // ── 1차: 압축 출력(코드 배열) ────────────────────────────────────────────
  //   ⚡ 실측(24칸): 현행 객체 배열은 출력 313토큰·decode 6.33초인데, 판정 내용은
  //      칸당 유형 하나가 전부다. 코드 배열로 받으면 56토큰·1.15초 (-82%).
  //      비전 단계 시간의 2/3 가 "같은 판정을 길게 받아쓰는" 데 쓰이고 있었다.
  //   판정 기준(프롬프트 본문)은 한 글자도 바꾸지 않는다 — 포장만 줄인다.
  //   칸 수가 안 맞게 오면 아래에서 **현행 스키마로 한 번 더 물어본다**(무손실 폴백).
  const byIdx = new Map();
  let declaredBest = NaN;

  const judgeBody =
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
    + `texture/logo_text/delivery/review_ss/person 은 절대 대표가 될 수 없다. 상품이 잘린 컷보다 온전한 컷을 항상 우선한다.\n\n`;

  // 유형 → 한 글자 코드(출력 전용). 의미는 위 정의 그대로다.
  const CODE_TO_TYPE = {
    p: 'product', x: 'texture', l: 'lifestyle', g: 'logo_text',
    d: 'delivery', s: 'review_ss', h: 'person', o: 'other',
  };

  const ask = async (prompt, numPredict) => {
    try {
      const res = await generateVision({
        model, system: JUDGE_SYSTEM, prompt, images: [sheet.b64],
        format: 'json', options: { num_predict: numPredict }, timeoutMs,
      });
      return parseJsonLoose(res.text);
    } catch (e) {
      // 상한 초과는 "이 PC 가 느린 것"이라 실패와 구분해 알린다 — 사용자가 원인을 알아야
      // GPU 없는 PC 라는 걸 인지하고 기대치를 조정할 수 있다.
      const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      onLog?.(timedOut
        ? `[비전] 판정이 ${Math.round((timeoutMs || 0) / 1000)}초를 넘어 중단 — 이 상품은 기본 방식으로 처리합니다(GPU 가속이 없으면 정상).`
        : `[비전] 판정 호출 실패(${String(e?.message || e).slice(0, 100)})`);
      return undefined; // undefined = 호출 자체 실패(폴백해도 소용없음)
    }
  };

  const compact = await ask(
    judgeBody
    + `유형 코드: P=product X=texture L=lifestyle G=logo_text D=delivery S=review_ss H=person O=other\n`
    + `출력은 JSON만. t 는 1번 칸부터 ${n}번 칸까지 **순서대로** 유형 코드 ${n}개:\n`
    + `{"t":["P","G",...],"bestMain":<번호>}`,
    Math.max(120, n * 8 + 60),
  );
  if (compact === undefined) return null;

  const codes = Array.isArray(compact?.t) ? compact.t : null;
  if (codes && codes.length >= n) {
    for (let i = 0; i < n; i++) {
      const c = String(codes[i] ?? '').trim().toLowerCase();
      // 코드 한 글자가 원칙이지만 모델이 유형 이름을 그대로 쓸 때도 받아준다.
      const type = CODE_TO_TYPE[c] || (VALID_TYPES.has(c) ? c : null);
      if (!type) { byIdx.clear(); break; }   // 하나라도 못 읽으면 압축 판정 전체를 버린다
      byIdx.set(i + 1, { type, product: type === 'product' });
    }
    if (byIdx.size === n) declaredBest = Number(compact.bestMain ?? compact.best);
  }

  // ── 2차(폴백): 압축 판정이 불완전하면 현행 스키마로 다시 묻는다 ──────────
  //   여기까지 오면 예전과 완전히 같은 프롬프트·같은 파싱이라 결과도 예전과 같다.
  if (byIdx.size !== n) {
    if (codes) onLog?.(`[비전] 압축 판정 불완전(${codes.length}/${n}칸) — 표준 형식으로 재확인`);
    const j = await ask(
      judgeBody + `출력은 JSON만: {"cells":[{"i":1,"type":"product","product":true},...(1~${n} 전부)],"bestMain":<번호>}`,
      700,
    );
    if (j === undefined) return null;
    if (!j || !Array.isArray(j.cells)) { onLog?.('[비전] 판정 JSON 파싱 실패 — 폴백'); return null; }
    byIdx.clear();
    for (const c of j.cells) {
      const i = Number(c.i);
      if (!Number.isInteger(i) || i < 1 || i > n) continue;
      let type = String(c.type || '').trim().toLowerCase();
      if (!VALID_TYPES.has(type)) type = c.product ? 'product' : 'other';
      byIdx.set(i, { type, product: !!c.product });
    }
    declaredBest = Number(j.bestMain);
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
  const declared = declaredBest;
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
export async function visionCurateProduct({ mainPool = [], detailPool = [], reviewPool = [], model, onLog, kind = 'generic', timeoutMs } = {}) {
  // 과일·음식은 누끼(배경제거)를 하면 오히려 어색하다 — 배가 공중에 뜬 것처럼 보인다(실측).
  //   그래서 ① 이미 누끼된 컷을 대표로 우대하지 않고(오히려 후순위),
  //          ② 리뷰컷(구매자 실사)도 대표 후보로 올린다. 실물이 잘 보이는 게 낫다.
  const isFresh = kind === 'fruit' || kind === 'food';
  if (!model) return null;
  const uniq = (arr) => [...new Set((arr || []).filter(Boolean))];
  const main = uniq(mainPool);
  const detail = uniq(detailPool).filter((p) => !main.includes(p));
  const review = uniq(reviewPool);

  // ── 후보 정리: 원본/누끼본 중복 제거 + 상세컷 몫 확보 ──────────────────────
  //   소싱 폴더 main_images 에는 원본(1.jpg…)과 소싱처가 누끼한 사본(converted_01.jpg…)이
  //   **둘 다** 들어온다(실측 56/56 = 100%). 같은 사진이 두 칸을 먹으니 격자 24칸이
  //   대표 후보만으로 차 버려서, 38%(21/56) 의 상품은 상세컷이 한 장도 심사되지 못했다
  //   (알로에젤: 원본 14 + 누끼 10 = 24칸 전부 소진 → 상세 0장 판정).
  //
  //   선호 계열을 먼저 채우고 남는 칸만 나머지 계열에 준다(짝을 못 찾는 컷도 유실 없음).
  //     · 과일·음식 : 누끼가 어색하므로 **원본** 우선
  //     · 그 외     : 쿠팡 대표컷 규격에 맞는 **누끼본** 우선
  const isCutFile = (p) => /(^|[\\/])converted[_-]?\d*/i.test(String(p));
  const cutFiles = main.filter(isCutFile);
  const rawFiles = main.filter((p) => !isCutFile(p));
  const preferred = isFresh ? rawFiles : cutFiles;
  const others = isFresh ? cutFiles : rawFiles;
  // 상세컷이 있으면 대표 후보가 격자를 다 먹지 않도록 몫을 나눈다(없으면 전부 대표에).
  const MAX_CELLS = 24;
  const mainBudget = detail.length ? 14 : MAX_CELLS;
  const mainForJudge = (preferred.length ? [...preferred, ...others] : main).slice(0, mainBudget);
  if (main.length > mainForJudge.length) {
    onLog?.(`[비전] 대표 후보 ${main.length}장 → ${mainForJudge.length}장으로 정리`
      + `(${isFresh ? '원본' : '누끼본'} 우선, 상세컷 심사 칸 확보)`);
  }

  // 격자 1: 대표 후보 + 상세컷 함께(대표는 상세컷으로도 승격 가능하므로 한 판에 심사).
  //   ⚠️ 격자 상한(24)을 넘는 컷은 "미판정"이 된다 → 아래 상세 루프에서 미판정=보존으로
  //      처리해 유실을 막는다(judgeImages 가 실제로 격자에 넣은 컷만 typeOf 에 담긴다).
  const combined = [...mainForJudge, ...detail].slice(0, MAX_CELLS);
  if (combined.length === 0 && review.length === 0) return null;

  // ⚡ 두 격자는 서로를 참조하지 않는다(대표/상세 판정과 리뷰컷 판정은 독립) → 동시에 묻는다.
  //    같은 격자·같은 프롬프트라 판정 결과는 순차일 때와 동일하고, 대기시간만 겹쳐진다.
  //    (ollama 가 동시요청을 안 받는 환경이면 그냥 큐잉될 뿐 — 예전과 같은 속도, 손해 없음)
  const [judged, rjudged] = await Promise.all([
    combined.length > 0 ? judgeImages(combined, { model, onLog, purpose: 'main', timeoutMs }) : Promise.resolve(null),
    review.length > 0 ? judgeImages(review, { model, onLog, purpose: 'review', timeoutMs }) : Promise.resolve(null),
  ]);

  const typeOf = new Map();      // path → type
  let bestMainPath = null;
  if (combined.length > 0) {
    if (!judged) return null;    // 대표 판정 실패 → 전체 폴백(반쪽 큐레이션 방지)
    for (const c of judged.cells) typeOf.set(c.path, c.type);
    if (judged.bestMain >= 0 && judged.cells[judged.bestMain]) bestMainPath = judged.cells[judged.bestMain].path;
  }

  // 격자 2: 리뷰컷(있을 때만).
  const reviewType = new Map();
  if (rjudged) for (const c of rjudged.cells) reviewType.set(c.path, c.type);

  const reasonKo = (t) => ({
    logo_text: '로고/글자 배너', delivery: '배송/안내 배너', review_ss: '후기/영수증 캡처',
    person: '사람 얼굴/인물', texture: '성분/질감 접사(상품 아님)', lifestyle: '연출컷', other: '상품 무관',
  }[t] || t);

  // ── 대표컷 지재권 정책 ────────────────────────────────────────────────────
  // 사용자 확정 규칙(2026-07-30):
  //   · 업체가 각 잡고 찍은 사진 = 지재권 위험 → 대표로 쓰지 않는다(최후수단)
  //   · 과일·신선식품            = 구매자 리뷰 실사를 쓴다(누끼가 어색함)
  //   · 일반 공산품              = 우리가 만든 누끼(흰 배경)를 쓴다
  //
  // 그래서 **리뷰 실사를 항상 대표 후보로 본다**(예전엔 과일·식품일 때만, 그 외에는
  //   "대표 후보가 하나도 없을 때"의 최후수단이었다 → 공산품은 누끼가 반려되면 업체
  //   스튜디오컷이 그대로 대표가 됐다).
  let promotedFromReview = null;
  const reviewMainCandidates = review.filter(
    (p) => reviewType.get(p) === 'product' || reviewType.get(p) === 'lifestyle',
  );
  if (!bestMainPath && reviewMainCandidates.length > 0) {
    const rp = review.find((p) => reviewType.get(p) === 'product') || reviewMainCandidates[0];
    if (rp) { bestMainPath = rp; promotedFromReview = rp; }
  }

  // ── 후보 랭킹 ─────────────────────────────────────────────────────────────
  //   VLM 이 product 로 본 컷 + 리뷰 실사를 한 줄에 놓고 sharp 지표로 정렬한다.
  //
  //   ⚠️ 기하 "잘림" 게이트는 제거했다. 잘림 판별은 실측에서 전 방법이 실패했고(기하 전 임계값,
  //      VLM 격자·비교·점수, VLM 단독 12전 12 "cut"), 게이트가 오히려 **온전한 컷을 밀어내고
  //      잘린 컷을 남겼다**(일리윤 실측). 점수에는 여전히 반영되므로 랭킹으로만 다룬다.
  const productCands = [
    ...combined.filter((p) => typeOf.get(p) === 'product'),
    ...reviewMainCandidates,
  ];
  let shortlist = [];
  let geoInfo = null;
  if (productCands.length > 1) {
    const geo = await measureCandidates(productCands, { onLog });
    if (geo) {
      const isReview = (p) => reviewMainCandidates.includes(p);
      // 가중치 = 지재권 안전도 × 품종 적합도.
      //   공산품: 누끼(1.30) > 리뷰 실사(1.05) > 일반 원본(1.00) > 업체 스튜디오컷(0.35)
      //   과일·식품: 리뷰 실사(1.25) > 일반 원본(1.00) > 누끼(0.60) > 업체 스튜디오컷(0.35)
      const rank = (p) => {
        const g = geo.get(p);
        if (!g) return 0;
        let adj = isFresh ? (g.cutout ? 0.6 : 1.0) : (g.cutout ? 1.3 : 1.0);
        if (isReview(p)) adj *= isFresh ? 1.25 : 1.05;   // 구매자 실사 = 지재권 위험 낮음
        // 업체 스튜디오컷은 강하게 뒤로. 누끼본·리뷰컷은 대상이 아니다.
        if (g.studio && !g.cutout && !isReview(p)) adj *= 0.35;
        return g.score * adj;
      };
      shortlist = [...productCands].sort((a, b) => rank(b) - rank(a));
      geoInfo = geo;
      const studioN = productCands.filter((p) => geo.get(p)?.studio && !geo.get(p)?.cutout && !isReview(p)).length;
      if (studioN > 0) onLog?.(`[비전] 업체 촬영 추정컷 ${studioN}장 — 지재권 위험으로 대표 후순위`);
    }
  }
  if (!shortlist.length) shortlist = productCands;

  // VLM 이 고른 컷이 정책에 어긋나면(업체 스튜디오컷 / 과일인데 누끼) 랭킹 1위로 교체.
  //   의미 판단은 VLM 이 낫지만, 지재권·품종 규칙은 사람이 정한 정책이라 이쪽이 우선한다.
  if (geoInfo && bestMainPath && shortlist.length) {
    const g = geoInfo.get(bestMainPath);
    const isReview = reviewMainCandidates.includes(bestMainPath);
    const ipRisk = g?.studio && !g.cutout && !isReview;
    const awkwardCutout = isFresh && g?.cutout;
    if (ipRisk || awkwardCutout) {
      const alt = shortlist.find((p) => {
        const gg = geoInfo.get(p);
        if (!gg) return false;
        if (ipRisk && gg.studio && !gg.cutout && !reviewMainCandidates.includes(p)) return false;
        if (awkwardCutout && gg.cutout) return false;
        return true;
      });
      if (alt && alt !== bestMainPath) {
        onLog?.(`[비전] 대표 교체(${ipRisk ? '업체 촬영 추정 — 지재권 회피' : '과일·음식은 누끼컷이 어색함'}): ${basename(bestMainPath)} → ${basename(alt)}`);
        bestMainPath = alt;
      }
    }
  }
  if (!bestMainPath && shortlist.length) bestMainPath = shortlist[0];
  if (bestMainPath && reviewMainCandidates.includes(bestMainPath) && !promotedFromReview) {
    promotedFromReview = bestMainPath;
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
