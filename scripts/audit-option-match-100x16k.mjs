// ─────────────────────────────────────────────────────────────────────────────
// 실측 시뮬레이션: 16,259 카테고리 × 100 랜덤 상품명 → 옵션/수량 매칭 무결점 검증
//
// 목적: 사용자가 입력하는 "상품명" 안의 옵션/수량 정보(용량·중량·수량·정/캡슐·개입·포)가
//       실제 프로덕션 파이프라인(extractOptionsEnhanced)을 통해 쿠팡 카테고리의
//       buyOptions(구매옵션) 스펙에 100% 정확히 매칭되는지를 ground-truth로 실측.
//
// 카테고리마다 buyOptions 정의를 읽어 "그 카테고리가 실제로 가진 옵션 차원"만 골라
//   - clean 70개: 숫자노이즈 없는 명확한 상품명 → 추출값/수량을 정답과 1:1 대조 (엄격)
//   - noisy 30개: 연식/모델명/1+1 등 숫자노이즈 포함 → 크래시 없음 + 필수커버리지 + 단위숫자 검증 (견고성)
//
// 검증 항목:
//   M_DIM   : 임베드한 옵션 차원(용량/중량/수량/정/개입/포)이 정확한 값으로 추출됐는지
//   M_TOTAL : totalUnitCount(묶음 총수량 = 단가계산 분모)가 공식대로 정확한지
//   M_REQ   : 카테고리의 모든 required buyOption이 채워졌는지 (택1 그룹은 ≥1)
//   M_NUM   : 단위형(unit 있는) 옵션 값이 순수 숫자인지 ("17000없음" 같은 anomaly 방지)
//   M_CRASH : 추출 자체가 예외 없이 끝났는지
//
// 실행(샤딩):  SHARDS=6 SHARD=0 node scripts/audit-option-match-100x16k.mjs
//             LIMIT=200 로 빠른 스모크 가능
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(import.meta.url, { interopDefault: true });
const oe = await jiti.import('../src/lib/megaload/services/option-extractor.ts');
const cm = await jiti.import('../src/lib/megaload/services/category-matcher.ts');

const SHARDS = parseInt(process.env.SHARDS || '1', 10);
const SHARD = parseInt(process.env.SHARD || '0', 10);
const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const NAMES_PER_CAT = parseInt(process.env.VARIANTS || '100', 10);
const CLEAN_RATIO = 0.7; // 70 clean / 30 noisy

const idx = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-index.json'), 'utf-8'));

// ── 시드 RNG (재현 가능) ──
function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

// ── 숫자 없는 노이즈 풀 (clean 상품명용) ──
const PREFIX = ['', '', '프리미엄', '국내산', '대용량', '[무료배송]', '인기', '정품', '신상', '명품', '가성비', '특가'];
const BRAND = ['', '', '메가로드', '코멤버스', '오가닉', '데일리', '내추럴'];
const SUFFIX = ['', '', '강력추천', '베스트셀러', '한정수량', '당일발송', '선물용', '실속형', '무료배송'];
// 숫자 노이즈 (noisy 상품명용) — 매칭을 흔드는 실제 패턴
const NOISE_NUM = ['2024년형', '2025신상', 'MX-7', 'V2', 'No.5', '1+1', '2+1', '12개월무이자', '4K', '24시간'];

const norm = (s) => (s || '').replace(/\s*\(택1\)\s*/g, '').replace(/\s+/g, ' ').trim();

// 카테고리의 옵션 차원 분류
function classify(buyOpts) {
  const c = { count: null, totalCount: null, volume: null, weightG: null, weightNo: null, perCount: null, tablet: null, others: [] };
  for (const o of buyOpts) {
    const n = norm(o.name);
    if (n === '수량' && o.unit === '개') c.count = o;
    else if (n === '총 수량' && o.unit === '개') c.totalCount = o;
    else if (n.includes('용량') && o.unit === 'ml') c.volume = o;
    else if (n.includes('중량') && o.unit === 'g') c.weightG = o;
    else if (n.includes('중량') && !o.unit) c.weightNo = o;
    else if (n.includes('수량') && n !== '수량' && o.unit === '개') c.perCount = o;
    else if (n.includes('캡슐') || n.includes('정')) c.tablet = o;
    else c.others.push(o);
  }
  return c;
}

// ── 상품명 + ground truth 생성 ──
// 반환: { name, gt: { dim, optName, expectVal, expectTotal } | null }
function genName(rng, leaf, cap, clean) {
  const pre = pick(rng, PREFIX);
  const brand = pick(rng, BRAND);
  const suf = pick(rng, SUFFIX);
  const wrap = (spec) => [pre, brand, leaf, spec, suf].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  // 차원 선택: 카테고리가 가진 것 중 랜덤
  const dims = [];
  if (cap.tablet) dims.push('tablet', 'sachet');
  if (cap.volume) dims.push('volume');
  if (cap.weightG) dims.push('weightG');
  if (cap.weightNo) dims.push('weightNo');
  if (cap.perCount) dims.push('perCount');
  if (cap.count && !cap.tablet) dims.push('count'); // tablet 카테고리는 count 단독 패턴 회피(곱셈규칙 간섭)

  if (dims.length === 0) {
    // 수량/용량/중량 차원이 없는 카테고리(색상/사이즈/원산지 등) → 커버리지만 검증
    return { name: wrap(''), gt: null };
  }

  const dim = pick(rng, dims);
  let spec = '', gt = null;
  const noise = clean ? '' : ' ' + pick(rng, NOISE_NUM);

  if (dim === 'count') {
    const C = randInt(rng, 1, 30);
    spec = `${C}개`;
    if (clean) gt = { dim, optName: cap.count.name, expectVal: String(C), expectTotal: C };
  } else if (dim === 'volume') {
    const V = pick(rng, [50, 100, 200, 250, 300, 500, 750, 1000]);
    const C = randInt(rng, 1, 12);
    spec = `${V}ml ${C}개`;
    if (clean) gt = { dim, optName: cap.volume.name, expectVal: String(V), expectTotal: cap.count ? C : C, countName: cap.count?.name, countVal: String(C) };
  } else if (dim === 'weightG') {
    const W = pick(rng, [50, 100, 150, 200, 300, 500]);
    const C = randInt(rng, 1, 10);
    spec = `${W}g ${C}개`;
    if (clean) gt = { dim, optName: cap.weightG.name, expectVal: String(W), expectTotal: C, countName: cap.count?.name, countVal: String(C) };
  } else if (dim === 'weightNo') {
    const W = pick(rng, [300, 500, 800]); // kg 변환 회피 위해 1000 미만/100배수 아닌 값
    const C = randInt(rng, 1, 10);
    spec = `${W}g ${C}개`;
    const ev = W >= 1000 && W % 100 === 0 ? `${W / 1000}kg` : `${W}g`;
    if (clean) gt = { dim, optName: cap.weightNo.name, expectVal: ev, expectTotal: C, countName: cap.count?.name, countVal: String(C) };
  } else if (dim === 'perCount') {
    const P = randInt(rng, 2, 50);
    const C = randInt(rng, 1, 10);
    spec = `${P}개입 ${C}팩`;
    if (clean) gt = { dim, optName: cap.perCount.name, expectVal: String(P), expectTotal: P * C, countName: cap.count?.name, countVal: String(C) };
  } else if (dim === 'tablet') {
    const T = pick(rng, [30, 60, 90, 120]);
    const N = randInt(rng, 1, 3);
    const unitWord = pick(rng, ['정', '캡슐']);
    spec = `${T}${unitWord} ${N}통`;
    const total = T * N;
    // 곱셈규칙: N>1 이면 개당=T*N, 수량=1
    if (clean) gt = { dim, optName: cap.tablet.name, expectVal: String(total), expectTotal: total, countName: cap.count?.name, countVal: '1', skipCountIf: N === 1 };
  } else if (dim === 'sachet') {
    const S = pick(rng, [10, 20, 30]);
    const N = randInt(rng, 1, 4);
    spec = `${S}포 ${N}박스`;
    // sachet: 곱셈 안함 → 개당=S, 수량=N, total=S*N
    if (clean) gt = { dim, optName: cap.tablet.name, expectVal: String(S), expectTotal: S * N, countName: cap.count?.name, countVal: String(N) };
  }

  return { name: wrap(spec) + noise, gt };
}

// ── 결과 누적 ──
const stats = {
  cats: 0, calls: 0, crash: 0,
  clean: 0, noisy: 0,
  M_DIM: { ok: 0, fail: 0, byDim: {} },
  M_TOTAL: { ok: 0, fail: 0 },
  M_REQ: { ok: 0, fail: 0 },
  M_NUM: { ok: 0, fail: 0 },
  failCats: { M_DIM: new Set(), M_TOTAL: new Set(), M_REQ: new Set(), M_NUM: new Set(), M_CRASH: new Set() },
  samples: { M_DIM: [], M_TOTAL: [], M_REQ: [], M_NUM: [], M_CRASH: [] },
};
function bumpDim(dim, ok) {
  const d = stats.M_DIM.byDim[dim] || (stats.M_DIM.byDim[dim] = { ok: 0, fail: 0 });
  if (ok) d.ok++; else d.fail++;
}

async function run() {
  const startAt = Date.now();
  // 샤드 분배
  let cats = idx.filter((_, i) => i % SHARDS === SHARD);
  if (LIMIT > 0) cats = cats.slice(0, LIMIT);
  console.log(`[shard ${SHARD}/${SHARDS}] ${cats.length} cats × ${NAMES_PER_CAT} names`);

  for (let ci = 0; ci < cats.length; ci++) {
    const [code, , leaf] = cats[ci];
    const codeStr = String(code);
    let details;
    try { details = await cm.getCategoryDetails(codeStr); } catch { continue; }
    if (!details || !details.buyOptions || details.buyOptions.length === 0) continue;
    const buyOpts = details.buyOptions;
    const cap = classify(buyOpts);
    const requiredNonC1 = buyOpts.filter(o => o.required && !o.choose1);
    const c1opts = buyOpts.filter(o => o.choose1);
    stats.cats++;

    const rng = makeRng((parseInt(codeStr, 10) || ci) + 7919);
    const cleanCount = Math.round(NAMES_PER_CAT * CLEAN_RATIO);

    for (let k = 0; k < NAMES_PER_CAT; k++) {
      const clean = k < cleanCount;
      const { name, gt } = genName(rng, leaf, cap, clean);
      clean ? stats.clean++ : stats.noisy++;
      stats.calls++;

      let ex;
      try {
        ex = await oe.extractOptionsEnhanced({ productName: name, categoryCode: codeStr, categoryPath: details.path || leaf });
      } catch (e) {
        stats.crash++; stats.failCats.M_CRASH.add(codeStr);
        if (stats.samples.M_CRASH.length < 25) stats.samples.M_CRASH.push({ code: codeStr, leaf, name, err: String(e.message || e).slice(0, 200) });
        continue;
      }
      const resultMap = new Map(ex.buyOptions.map(b => [b.name, b]));

      // M_NUM: 단위형 옵션 값 순수 숫자
      let numOk = true;
      for (const b of ex.buyOptions) {
        if (b.unit) {
          if (!/^\d+(\.\d+)?$/.test(b.value)) {
            numOk = false;
            if (stats.samples.M_NUM.length < 30) stats.samples.M_NUM.push({ code: codeStr, leaf, name, opt: b.name, val: b.value, unit: b.unit });
            break;
          }
        }
      }
      numOk ? stats.M_NUM.ok++ : (stats.M_NUM.fail++, stats.failCats.M_NUM.add(codeStr));

      // M_REQ: 필수 비택1 모두 채움 + 택1 그룹 ≥1
      let reqOk = true; let reqMiss = null;
      for (const o of requiredNonC1) {
        const b = resultMap.get(o.name);
        if (!b || b.value === '' || b.value == null) { reqOk = false; reqMiss = o.name; break; }
      }
      if (reqOk && c1opts.length > 0 && c1opts.some(o => o.required)) {
        const anyFilled = c1opts.some(o => { const b = resultMap.get(o.name); return b && b.value !== '' && b.value != null; });
        if (!anyFilled) { reqOk = false; reqMiss = '택1:' + c1opts.map(o => o.name).join('/'); }
      }
      reqOk ? stats.M_REQ.ok++ : (stats.M_REQ.fail++, stats.failCats.M_REQ.add(codeStr),
        stats.samples.M_REQ.length < 30 && stats.samples.M_REQ.push({ code: codeStr, leaf, name, missing: reqMiss, got: ex.buyOptions.map(b => `${b.name}=${b.value}`) }));

      // clean + gt 있을 때만 엄격 검증
      if (gt) {
        // M_DIM: 임베드 차원 정확 추출
        const b = resultMap.get(gt.optName);
        let dimOk = b && b.value === gt.expectVal;
        // count 동반 검증(곱셈규칙으로 count가 1이 되는 케이스 포함)
        if (dimOk && gt.countName && !gt.skipCountIf) {
          const cb = resultMap.get(gt.countName);
          if (gt.countVal != null && cb && cb.value !== gt.countVal) dimOk = false;
        }
        dimOk ? stats.M_DIM.ok++ : (stats.M_DIM.fail++, stats.failCats.M_DIM.add(codeStr));
        bumpDim(gt.dim, dimOk);
        if (!dimOk && stats.samples.M_DIM.length < 50)
          stats.samples.M_DIM.push({ code: codeStr, leaf, name, dim: gt.dim, opt: gt.optName, expect: gt.expectVal, got: b ? b.value : '(없음)', countExpect: gt.countVal, countGot: gt.countName ? (resultMap.get(gt.countName)?.value ?? '(없음)') : undefined, all: ex.buyOptions.map(x => `${x.name}=${x.value}`) });

        // M_TOTAL: totalUnitCount 공식 일치
        const totOk = ex.totalUnitCount === gt.expectTotal;
        totOk ? stats.M_TOTAL.ok++ : (stats.M_TOTAL.fail++, stats.failCats.M_TOTAL.add(codeStr),
          stats.samples.M_TOTAL.length < 50 && stats.samples.M_TOTAL.push({ code: codeStr, leaf, name, dim: gt.dim, expect: gt.expectTotal, got: ex.totalUnitCount, all: ex.buyOptions.map(x => `${x.name}=${x.value}`) }));
      }
    }

    if ((ci + 1) % 1000 === 0) {
      const el = ((Date.now() - startAt) / 1000).toFixed(0);
      console.log(`[shard ${SHARD}] ${ci + 1}/${cats.length} ${el}s | calls=${stats.calls} dimFail=${stats.M_DIM.fail} totFail=${stats.M_TOTAL.fail} reqFail=${stats.M_REQ.fail} numFail=${stats.M_NUM.fail} crash=${stats.crash}`);
    }
  }

  const elapsed = ((Date.now() - startAt) / 1000).toFixed(1);
  const out = {
    shard: SHARD, shards: SHARDS, elapsedSec: +elapsed,
    cats: stats.cats, calls: stats.calls, clean: stats.clean, noisy: stats.noisy, crash: stats.crash,
    M_DIM: { ...stats.M_DIM, byDim: stats.M_DIM.byDim },
    M_TOTAL: stats.M_TOTAL, M_REQ: stats.M_REQ, M_NUM: stats.M_NUM,
    failCats: Object.fromEntries(Object.entries(stats.failCats).map(([k, v]) => [k, [...v]])),
    samples: stats.samples,
  };
  const fn = `audit-optmatch-shard${SHARD}-of-${SHARDS}.json`;
  writeFileSync(fn, JSON.stringify(out, null, 2));
  console.log(`\n[shard ${SHARD}] done in ${elapsed}s → ${fn}`);
  console.log(`  calls=${stats.calls} | M_DIM fail=${stats.M_DIM.fail} | M_TOTAL fail=${stats.M_TOTAL.fail} | M_REQ fail=${stats.M_REQ.fail} | M_NUM fail=${stats.M_NUM.fail} | crash=${stats.crash}`);
}

run();
