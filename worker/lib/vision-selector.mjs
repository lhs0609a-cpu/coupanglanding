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
/**
 * 측정 결과 캐시(경로 → 지표).
 * 한 상품 안에서 measureCandidates 는 두 번 불린다 — ① 격자에 넣을 대표 후보를 고를 때
 * ② VLM 이 통과시킨 후보의 기하 심사. 같은 사진을 두 번 재는 건 순수 낭비다(sharp 디코딩).
 * 실행 중 사진은 바뀌지 않으므로 경로로 캐시해도 안전하다. 상한을 둬 100개 배치에서도 안 붓는다.
 */
const _metCache = new Map();
const MET_CACHE_MAX = 4000;

async function measureCandidates(paths, { onLog } = {}) {
  const out = new Map();
  // ⚡ 측정은 순수 CPU(sharp) 라 서로 기다릴 이유가 없다 — 후보 20여 장이면 순차는 체감된다.
  //    결과는 경로별로 Map 에 넣으므로 완료 순서와 무관하다(판정 결과 동일).
  const measured = await Promise.all(paths.map(async (p) => {
    const hit = _metCache.get(p);
    if (hit !== undefined) return { p, met: hit };
    try {
      const met = await measureImage(p);
      if (_metCache.size >= MET_CACHE_MAX) _metCache.clear();   // 단순 상한(정확도에 무관)
      _metCache.set(p, met);
      return { p, met };
    } catch { return { p, met: null }; }
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

/**
 * 격자 셀 한 변(px) — 상품/텍스처/로고 구분에 충분한 크기.
 *
 * ⚡ 이 값이 곧 비전 호출 시간이다. 판정 비용은 **이미지 토큰 수**에 비례하고, 토큰은 격자
 *    픽셀에서 나온다. 실측(2026-08-25, RTX 4060 Ti · 24칸 고정 · prompt_eval_duration):
 *        300px  1240x1856  3,079토큰  prefill 3,718~3,811ms   ← 예전 기본값
 *        224px   936x1400  1,825토큰  prefill 1,638~1,708ms
 *      **176px   744x1112  1,255토큰  prefill 1,002~1,024ms**  ← 지금 기본값
 *        140px   600x 896  1,255토큰  prefill 1,007~1,017ms   ← 토큰이 더 안 줄어든다(바닥)
 *    176px 밑으로는 모델이 최소 패치 수로 내려앉아 **더 줄여도 빨라지지 않는다.**
 *
 * ✅ 176px 로 낮춘 근거 — 진짜 파이프라인(visionCurateProduct)으로 A/B(2026-08-25, 상품 12개):
 *        대표컷 동일        12/12   (같은 조건 재판정의 자기일치도 12/12)
 *        리뷰컷 집합일치      99%    (자기일치 100%)
 *        상세컷 집합일치      72%    (자기일치 95%)  ← 유일하게 벌어진 항목
 *        상품당 인식        20.6초 → 11.2초
 *    상세컷이 벌어지는 방향은 "덜 걸러낸다"(12→15, 0→11 처럼 더 남긴다)인데, **등록되는
 *    상세 본문은 리뷰컷만 쓰므로**(AllInOneRegisterPanel: detailUrls 는 항상 빈 배열 —
 *    소싱처 상세컷은 멤버십·적립 배너가 섞여 쓰지 않기로 확정) 등록물에는 닿지 않는다.
 *    등록물에 실제로 닿는 두 값(대표컷·리뷰컷)은 사실상 그대로다.
 *
 * ⚠️ 되돌리기: `MEGALOAD_VISION_CELL=300` 이면 즉시 예전 동작이다(재배포 불필요).
 *    상세컷 큐레이션을 등록에 다시 쓰기로 하면 이 값을 224~300 으로 올리고 A/B 를 다시 해야 한다.
 */
const CELL = Math.max(96, Number(process.env.MEGALOAD_VISION_CELL) || 176);
const GAP = 8;
const RED = '#E31837';

/**
 * 비전 단계 실측 누적치.
 * ---------------------------------------------------------------------------
 * 왜 남기나: 여기가 파이프라인에서 가장 비싼 구간인데, 지금까지 "인식 11.2초" 같은 값은
 * 사람이 한 번 재 보고 문서에 적은 것뿐이었다. 코드가 스스로 재지 않으면 다음 개선이
 * 빨라졌는지 느려졌는지 말로만 다투게 된다(설계도 §5 의 검증 항목).
 *   sheetMs = 격자 만드는 CPU 시간(sharp), vlmMs = 모델이 보는 시간(GPU), 둘은 성격이 다르다.
 *   compact/verbose = 압축 판정으로 끝났나, 표준 스키마로 다시 물었나(재질문은 6초짜리다).
 */
const _stats = {
  calls: 0, cells: 0, sheetMs: 0, vlmMs: 0,
  compact: 0, verbose: 0, timeouts: 0, failed: 0,
};
export function visionStats() { return { ..._stats }; }
export function resetVisionStats() {
  for (const k of Object.keys(_stats)) _stats[k] = 0;
}

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
  const t0 = Date.now();
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

  _stats.sheetMs += Date.now() - t0;
  _stats.cells += cells.length;
  return { b64: sheet.toString('base64'), usedPaths: cells.map((c) => c.path), cols, px: W * H };
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
export async function judgeImages(paths, { model, onLog, purpose = 'main', timeoutMs, onTimeout } = {}) {
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
    const t0 = Date.now();
    try {
      const res = await generateVision({
        model, system: JUDGE_SYSTEM, prompt, images: [sheet.b64],
        format: 'json', options: { num_predict: numPredict }, timeoutMs,
      });
      _stats.vlmMs += Date.now() - t0;
      _stats.calls += 1;
      return parseJsonLoose(res.text);
    } catch (e) {
      _stats.vlmMs += Date.now() - t0;
      _stats.calls += 1;
      // 상한 초과는 "이 PC 가 느린 것"이라 실패와 구분해 알린다 — 사용자가 원인을 알아야
      // GPU 없는 PC 라는 걸 인지하고 기대치를 조정할 수 있다.
      const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      // 상한 초과는 "이 PC 에선 비전이 못 돈다"는 신호다 — 호출부가 상품마다 같은 시간을
      //   또 태우지 않도록(회로차단) 알려준다. 실패(undefined)만으로는 원인을 구분 못 한다.
      if (timedOut) _stats.timeouts += 1; else _stats.failed += 1;
      if (timedOut) onTimeout?.();
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
    if (byIdx.size === n) { declaredBest = Number(compact.bestMain ?? compact.best); _stats.compact += 1; }
  }

  // ── 2차(폴백): 압축 판정이 불완전하면 현행 스키마로 다시 묻는다 ──────────
  //   여기까지 오면 예전과 완전히 같은 프롬프트·같은 파싱이라 결과도 예전과 같다.
  if (byIdx.size !== n) {
    _stats.verbose += 1;
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
export async function visionCurateProduct({ mainPool = [], detailPool = [], reviewPool = [], model, onLog, kind = 'generic', timeoutMs, onTimeout } = {}) {
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
  // 격자 칸 수도 곧 시간이다(칸이 줄면 이미지가 작아진다). 기본 24는 유지하고,
  //   A/B 로 확인한 뒤에만 낮춘다 — 상한을 넘는 컷은 "미판정"이 되기 때문이다(아래 보존 처리).
  const MAX_CELLS = Math.max(4, Number(process.env.MEGALOAD_VISION_CELLS) || 24);
  const mainBudget = detail.length ? Math.max(2, Math.round(MAX_CELLS * 0.58)) : MAX_CELLS;

  // ⚡ 기하 심사(measureCandidates)는 어차피 아래에서 부른다 — 그 점수를 **여기서 먼저** 써서
  //    격자에 넣을 대표 후보를 고른다(추가 비용 0, sharp CPU 라 GPU 와 겹쳐 돈다).
  //    예전엔 상한에 걸려 잘려 나가는 컷이 **파일명 순서**로 정해졌다. 대표가 될 만한 컷이
  //    뒤쪽에 있으면 심사조차 못 받았다(격자에 없으면 VLM 은 존재 자체를 모른다).
  //    계열 우선순위(과일=원본 / 공산품=누끼본)는 그대로 지킨다 — 그 안에서만 점수로 줄 세운다.
  const metricsForPick = main.length > mainBudget ? await measureCandidates(main, { onLog }) : null;
  const rank = (p) => {
    const m = metricsForPick?.get(p);
    if (!m) return 0;
    // 잘린 컷·업체 스튜디오컷은 대표로 못 쓰거나 위험하다 → 뒤로 민다(버리지는 않는다).
    return (m.score || 0) - (m.cropped ? 40 : 0) - (m.studio ? 15 : 0);
  };
  const byRank = (arr) => (metricsForPick ? [...arr].sort((a, b) => rank(b) - rank(a)) : arr);
  const ordered = preferred.length ? [...byRank(preferred), ...byRank(others)] : byRank(main);
  const mainForJudge = ordered.slice(0, mainBudget);
  if (main.length > mainForJudge.length) {
    onLog?.(`[비전] 대표 후보 ${main.length}장 → ${mainForJudge.length}장으로 정리`
      + `(${isFresh ? '원본' : '누끼본'} 우선${metricsForPick ? ' · 기하 점수 순' : ''}, 상세컷 심사 칸 확보)`);
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
    combined.length > 0 ? judgeImages(combined, { model, onLog, purpose: 'main', timeoutMs, onTimeout }) : Promise.resolve(null),
    review.length > 0 ? judgeImages(review, { model, onLog, purpose: 'review', timeoutMs, onTimeout }) : Promise.resolve(null),
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
