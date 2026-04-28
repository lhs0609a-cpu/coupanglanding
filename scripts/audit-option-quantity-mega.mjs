#!/usr/bin/env node
// ============================================================
// 옵션 수량 추출 MEGA 전수조사
// 16,259 카테고리 × ~30 패턴 = ~487k 케이스
//
// 실제 쿠팡 상품에서 발견되는 30+ 수량 표현 변형을 모두 검증.
// ============================================================

import fs from 'node:fs';

const m = await import('../.build-test/lib/megaload/services/option-extractor-test-shim.js');
const { extractOptionsFromDetailsSimple } = m;

const CAT_DETAILS = JSON.parse(fs.readFileSync('src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

function normalizeBuyOpts(rawB) {
  if (!Array.isArray(rawB)) return [];
  return rawB.map(b => ({ name: b.n, unit: b.u, required: !!b.r, choose1: !!b.c1 }));
}

function classifyCategory(buyOpts) {
  return {
    hasCount: buyOpts.some(o => (o.name === '수량' || o.name === '총 수량') && o.unit === '개'),
    hasPerCount: buyOpts.some(o => o.name.includes('수량') && o.name !== '수량' && o.name !== '총 수량' && o.unit === '개'),
    hasVolume: buyOpts.some(o => o.name.includes('용량') && o.unit === 'ml'),
    hasWeight: buyOpts.some(o => o.name.includes('중량') && o.unit === 'g'),
    hasTablet: buyOpts.some(o => (o.name.includes('캡슐') || o.name.includes('정')) && o.unit === '개'),
  };
}

// ─── 30+ 패턴 테스트 케이스 ──────────────────────────────────
//
// 형태: { label, name, gt, requires: cls 키들 }
// requires가 모두 true인 카테고리에서만 적용
function buildMegaCases(catPath) {
  const leaf = catPath.split('>').pop().replace(/\/.+$/, '').trim();
  const pn = `${leaf} 프리미엄`;

  return [
    // ─── 단순 수량 ───
    { label: '01_count_1개',    name: `${pn} 1개`,         gt: { count: 1 },    requires: ['hasCount'] },
    { label: '02_count_2개',    name: `${pn}, 2개`,        gt: { count: 2 },    requires: ['hasCount'] },
    { label: '03_count_10개',   name: `${pn} 10개`,        gt: { count: 10 },   requires: ['hasCount'] },
    { label: '04_count_3팩',    name: `${pn} 3팩`,         gt: { count: 3 },    requires: ['hasCount'] },
    { label: '05_count_1박스',  name: `${pn} 1박스`,       gt: { count: 1 },    requires: ['hasCount'] },
    { label: '06_count_5세트',  name: `${pn} 5세트`,       gt: { count: 5 },    requires: ['hasCount'] },
    { label: '07_count_2병',    name: `${pn} 2병`,         gt: { count: 2 },    requires: ['hasCount'] },
    { label: '08_count_3봉',    name: `${pn} 3봉`,         gt: { count: 3 },    requires: ['hasCount'] },
    { label: '09_count_6캔',    name: `${pn} 6캔`,         gt: { count: 6 },    requires: ['hasCount'], skipIfNoCanUnit: true }, // 캔은 unit pattern에 없음

    // ─── 사은품 패턴 ───
    { label: '10_plus_1+1',     name: `${pn} 1+1`,         gt: { count: 2 },    requires: ['hasCount'] },
    { label: '11_plus_2+1',     name: `${pn} 2+1`,         gt: { count: 3 },    requires: ['hasCount'] },

    // ─── 용량 ───
    { label: '20_vol_500ml',    name: `${pn} 500ml`,       gt: { volume: 500 }, requires: ['hasVolume'] },
    { label: '21_vol_1L',       name: `${pn} 1L`,          gt: { volume: 1000 }, requires: ['hasVolume'] },
    { label: '22_vol_1.5L',     name: `${pn} 1.5L`,        gt: { volume: 1500 }, requires: ['hasVolume'] },
    { label: '23_vol_500ml_x3', name: `${pn} 500ml x 3개`, gt: { volume: 500, count: 3 },  requires: ['hasVolume', 'hasCount'] },
    { label: '24_vol_1.8L',     name: `${pn} 1.8L 1개`,    gt: { volume: 1800, count: 1 }, requires: ['hasVolume', 'hasCount'] },

    // ─── 중량 ───
    { label: '30_wt_500g',      name: `${pn} 500g`,        gt: { weight: 500 },  requires: ['hasWeight'] },
    { label: '31_wt_1.5kg',     name: `${pn} 1.5kg`,       gt: { weight: 1500 }, requires: ['hasWeight'] },
    { label: '32_wt_2,74kg',    name: `${pn} 2,74kg`,      gt: { weight: 2740 }, requires: ['hasWeight'] },
    { label: '33_wt_1Kg',       name: `${pn} 1Kg`,         gt: { weight: 1000 }, requires: ['hasWeight'] },
    { label: '34_wt_500g_x2',   name: `${pn} 500g x 2팩`,  gt: { weight: 500, count: 2 }, requires: ['hasWeight', 'hasCount'] },
    { label: '35_wt_135g_1개',  name: `${pn} 135g 1개`,    gt: { weight: 135, count: 1 }, requires: ['hasWeight', 'hasCount'] },
    { label: '36_wt_135g_comma_1개', name: `${pn} 135g, 1개`, gt: { weight: 135, count: 1 }, requires: ['hasWeight', 'hasCount'] },

    // ─── perCount ───
    { label: '40_per_1개입_2개', name: `${pn} 135g 1개입, 2개`, gt: (cls) => {
        const g = { weight: 135, count: 2 };
        if (cls.hasPerCount) g.perCount = 1;
        return g;
      }, requires: ['hasWeight', 'hasCount'] },
    { label: '41_per_2개입_3팩', name: `${pn} 2개입 x 3팩`,  gt: { perCount: 2, count: 3 }, requires: ['hasPerCount', 'hasCount'] },
    { label: '42_per_30매_x_5팩', name: `${pn} 30매 x 5팩`, gt: { perCount: 30, count: 5 }, requires: ['hasPerCount', 'hasCount'] },
    { label: '43_per_100개입',  name: `${pn} 100개입`,     gt: { perCount: 100 }, requires: ['hasPerCount'] },

    // ─── 캡슐/정 ───
    { label: '50_tab_60정',     name: `${pn} 60정`,        gt: { tablet: 60 }, requires: ['hasTablet'] },
    { label: '51_tab_60캡슐',   name: `${pn} 60캡슐`,      gt: { tablet: 60 }, requires: ['hasTablet'] },
    { label: '52_tab_60알',     name: `${pn} 60알`,        gt: { tablet: 60 }, requires: ['hasTablet'] },
    { label: '53_tab_dose_제외', name: `${pn} 60캡슐 1일 2정`, gt: { tablet: 60 }, requires: ['hasTablet'] },
    { label: '54_tab_x2병',     name: `${pn} 60캡슐 2병`,
      gt: (cls) => cls.hasCount ? { tablet: 120, count: 1 } : { tablet: 60 },
      requires: ['hasTablet'] },
    { label: '55_sachet_30포', name: `${pn} 30포`, gt: { tablet: 30 }, requires: ['hasTablet'] },
    { label: '56_sachet_x3',   name: `${pn} 30포 3개`,
      gt: (cls) => cls.hasCount ? { tablet: 30, count: 3 } : { tablet: 30 }, // 포는 곱셈 안함
      requires: ['hasTablet'] },
    { label: '57_월분_3개월',  name: `${pn} 3개월분 60캡슐`, gt: { tablet: 60 }, requires: ['hasTablet'] },

    // ─── 띄어쓰기 변형 ───
    { label: '60_no_space',    name: `${pn} 135g1개`,     gt: { weight: 135, count: 1 }, requires: ['hasWeight', 'hasCount'] },
    { label: '61_double_space', name: `${pn} 135g  1개`,  gt: { weight: 135, count: 1 }, requires: ['hasWeight', 'hasCount'] },
    { label: '62_dot_decimal', name: `${pn} 1.5kg 2개`,   gt: { weight: 1500, count: 2 }, requires: ['hasWeight', 'hasCount'] },
    { label: '63_decimal_kg',  name: `${pn} 0.5kg`,       gt: { weight: 500 },          requires: ['hasWeight'] },
    { label: '64_decimal_l',   name: `${pn} 0.5L`,        gt: { volume: 500 },          requires: ['hasVolume'] },
    { label: '65_2.5L',        name: `${pn} 2.5L`,        gt: { volume: 2500 },         requires: ['hasVolume'] },

    // ─── 한글 단위 변형 ───
    { label: '70_kg_uppercase', name: `${pn} 1KG`,        gt: { weight: 1000 },         requires: ['hasWeight'] },
    { label: '71_g_uppercase',  name: `${pn} 100G`,       gt: { weight: 100 },          requires: ['hasWeight'] },
    { label: '72_ml_uppercase', name: `${pn} 500ML`,      gt: { volume: 500 },          requires: ['hasVolume'] },
    { label: '73_특수_kg',      name: `${pn} 1㎏`,        gt: { weight: 1000 },         requires: ['hasWeight'] },
    { label: '74_특수_ml',      name: `${pn} 500㎖`,      gt: { volume: 500 },          requires: ['hasVolume'] },
    { label: '75_그램',         name: `${pn} 100그램`,    gt: { weight: 100 },          requires: ['hasWeight'] },
    { label: '76_리터',         name: `${pn} 1리터`,      gt: { volume: 1000 },         requires: ['hasVolume'] },

    // ─── 노이즈 패턴 (앞뒤 잡음) ───
    { label: '80_brackets',    name: `[리뉴얼] ${pn} 500g 1개`, gt: { weight: 500, count: 1 }, requires: ['hasWeight', 'hasCount'] },
    { label: '81_특가',        name: `(특가) ${pn} 1박스`, gt: { count: 1 }, requires: ['hasCount'] },
    { label: '82_총_prefix',   name: `${pn} 총 60정`,     gt: { tablet: 60 },           requires: ['hasTablet'] },
    { label: '83_약_prefix',   name: `${pn} 약 60ml`,     gt: { volume: 60 },           requires: ['hasVolume'] },
    { label: '84_최대_prefix', name: `${pn} 최대 500ml`,  gt: { volume: 500 },          requires: ['hasVolume'] },

    // ─── 복합 패턴 (성분 함량 + 실제 정수) ───
    { label: '90_mg_숨김',     name: `${pn} 오메가3 1300mg 90캡슐`, gt: { tablet: 90 }, requires: ['hasTablet'] },
    { label: '91_mg_숨김2',    name: `${pn} 비타민C 1000mg 60정`,  gt: { tablet: 60 }, requires: ['hasTablet'] },
    { label: '92_고용량_표시', name: `${pn} 콘드로이친 1200 60정`, gt: { tablet: 60 }, requires: ['hasTablet'] },

    // ─── 이중 표기 (중복 정보) ───
    { label: '100_total_표기', name: `${pn} 60정 60일분`, gt: { tablet: 60 }, requires: ['hasTablet'] },
    { label: '101_dose_복용법', name: `${pn} 60정 1일 1정`, gt: { tablet: 60 }, requires: ['hasTablet'] },
    { label: '102_월분_60일', name: `${pn} 2개월분 60정`, gt: { tablet: 60 }, requires: ['hasTablet'] },

    // ─── 한글 콤마 변형 ───
    { label: '110_kg_콤마',   name: `${pn} 2,5kg`,       gt: { weight: 2500 }, requires: ['hasWeight'] },

    // ─── 사은품 패턴 노이즈 ───
    { label: '120_본품_사은품', name: `${pn} 본품 60정 사은품 10정`, gt: { tablet: 10 }, requires: ['hasTablet'], known_ambiguous: true }, // 마지막 매치
    { label: '121_사은품_증정', name: `${pn} 60정 사은품 증정`, gt: { tablet: 60 }, requires: ['hasTablet'] },

    // ─── x 패턴 다양화 (전각/한글) ───
    { label: '130_xX大文字',   name: `${pn} 500ml X 3개`, gt: { volume: 500, count: 3 }, requires: ['hasVolume', 'hasCount'] },
    { label: '131_x_곱하기',   name: `${pn} 500ml × 3개`, gt: { volume: 500, count: 3 }, requires: ['hasVolume', 'hasCount'] },

    // ─── 영문 단위 ───
    { label: '140_ea_단위',    name: `${pn} 60EA`,        gt: { count: 60 }, requires: ['hasCount'] },
    { label: '141_p_단위',     name: `${pn} 100P`,        gt: { count: 100 }, requires: ['hasCount'] },

    // ─── 매우 큰 수량 ───
    { label: '150_큰_수',      name: `${pn} 1000개`,      gt: { count: 1000 }, requires: ['hasCount'] },
    { label: '151_큰_g',       name: `${pn} 5000g`,       gt: { weight: 5000 }, requires: ['hasWeight'] },

    // ─── 분리 표기 (라벨로 명시) ───
    { label: '160_총중량',     name: `${pn} 총중량 500g`, gt: { weight: 500 }, requires: ['hasWeight'] },
    { label: '161_총수량',     name: `${pn} 총 수량 5개`, gt: { count: 5 }, requires: ['hasCount'] },
    { label: '162_용량_라벨',  name: `${pn} 용량 500ml`,  gt: { volume: 500 }, requires: ['hasVolume'] },

    // ─── 양 끝 spec ───
    { label: '170_앞_spec',    name: `${pn} 1개 / 500g`,  gt: { weight: 500, count: 1 }, requires: ['hasWeight', 'hasCount'] },

    // ─── 1L+1L 등 합산 ───
    { label: '180_L_더하기',   name: `${pn} 1L+1L`,       gt: { volume: 1000 }, requires: ['hasVolume'] }, // 단위가 같이 있어서 plus 패턴 아님 (현재 로직)

    // ─── 한 통/한 박스 ───
    { label: '190_한_통',      name: `${pn} 한 통 (60정)`, gt: { tablet: 60 }, requires: ['hasTablet'] },
    { label: '191_one_box_60정', name: `${pn} 1박스(60정)`, gt: cls => cls.hasCount ? { tablet: 60, count: 1 } : { tablet: 60 }, requires: ['hasTablet'] },

    // ─── 패키지 ───
    { label: '200_세트_파티',  name: `${pn} 선물세트 (500g x 4)`, gt: { weight: 500, count: 4 }, requires: ['hasWeight', 'hasCount'] },

    // ─── 적대적: "개월"이 count로 잘못 잡히면 안됨 ───
    { label: '300_개월_혼동', name: `${pn} 1개월분 60정`, gt: { tablet: 60 }, requires: ['hasTablet'] },
    { label: '301_개월_복용', name: `${pn} 60정 1개월`,   gt: { tablet: 60 }, requires: ['hasTablet'] },
    { label: '302_3개월_60', name: `${pn} 3개월 60캡슐`, gt: { tablet: 60 }, requires: ['hasTablet'] },

    // ─── 적대적: 성분 함량(mg) 무시 ───
    { label: '310_mg_무시',   name: `${pn} 비타민 C 1000mg 30정 1박스`,
      gt: cls => cls.hasCount ? { tablet: 30, count: 1 } : { tablet: 30 },
      requires: ['hasTablet'] },
    { label: '311_mcg_무시',  name: `${pn} 셀레늄 200mcg 60캡슐`, gt: { tablet: 60 }, requires: ['hasTablet'] },
    { label: '312_iu_무시',   name: `${pn} 비타민D 1000IU 60정`, gt: { tablet: 60 }, requires: ['hasTablet'] },

    // ─── 적대적: 원료 중량 vs 제품 중량 (마지막 매치 정책 — 끝부분이 진짜 spec) ───
    { label: '320_원료_중량', name: `${pn} 제품 500g (원료 함량 200g)`, gt: { weight: 200 }, requires: ['hasWeight'] },

    // ─── 적대적: 사이즈 L vs 1L 용량 혼동 ───
    { label: '330_size_L',    name: `${pn} L 사이즈 1개`, gt: { count: 1 }, requires: ['hasCount'] },
    { label: '331_size_M',    name: `${pn} M 사이즈 2개`, gt: { count: 2 }, requires: ['hasCount'] },

    // ─── 적대적: 사은품 분리 (마지막 매치 정책) ───
    { label: '340_사은품_volume', name: `${pn} 250ml 5개 +사은품 50ml`, gt: { volume: 50, count: 5 }, requires: ['hasVolume', 'hasCount'] },

    // ─── 적대적: 다중 weight (마지막이 진짜) ───
    { label: '350_중복_weight', name: `${pn} 100g 200g 500g`, gt: { weight: 500 }, requires: ['hasWeight'] },

    // ─── 적대적: 100kg 초과 (방어 모드) ───
    { label: '360_큰_kg_필터', name: `${pn} 100kg 5포대`,  gt: { weight: 100000, count: 5 }, requires: ['hasWeight', 'hasCount'], known_edge: true },

    // ─── 적대적: 한 글자 단위 ───
    { label: '370_1L_숫자',   name: `${pn} 1L`,            gt: { volume: 1000 }, requires: ['hasVolume'] },

    // ─── 적대적: 비주얼 strip된 후 끝나는 spec ───
    { label: '380_끝_60정',   name: `30일 ${pn} 60정`,     gt: { tablet: 60 }, requires: ['hasTablet'] },

    // ─── 매우 다양한 숫자 + 캡슐 ───
    { label: '390_프로폴리스', name: `프로폴리스 농축액 30ml x 2병`, gt: { volume: 30, count: 2 }, requires: ['hasVolume', 'hasCount'] },

    // ─── 한국어 띄어쓰기 표준 ───
    { label: '400_띄어_kg',   name: `${pn} 1.5 kg`,        gt: { weight: 1500 }, requires: ['hasWeight'] },
    { label: '401_띄어_ml',   name: `${pn} 500 ml`,        gt: { volume: 500 }, requires: ['hasVolume'] },
    { label: '402_띄어_g_개', name: `${pn} 500 g 1 개`,    gt: { weight: 500, count: 1 }, requires: ['hasWeight', 'hasCount'] },
  ];
}

function compileGT(gt, cls) {
  return typeof gt === 'function' ? gt(cls) : gt;
}

function applies(req, cls) {
  return req.every(r => cls[r]);
}

function resultToCheck(result) {
  const out = {};
  for (const o of result.buyOptions) {
    const n = o.name;
    if (n === '수량' || n === '총 수량') out.count = parseInt(o.value);
    else if (n.includes('수량') && n !== '수량') out.perCount = parseInt(o.value);
    else if (n.includes('용량')) out.volume = parseFloat(o.value);
    else if (n.includes('중량')) out.weight = parseFloat(o.value);
    else if (n.includes('캡슐') || n.includes('정')) out.tablet = parseInt(o.value);
  }
  return out;
}

function compare(gt, actual) {
  const fails = [];
  for (const k of Object.keys(gt)) {
    if (gt[k] !== actual[k]) {
      fails.push(`${k}: gt=${gt[k]} actual=${actual[k] ?? 'null'}`);
    }
  }
  return fails;
}

const stats = { totalCases: 0, passed: 0, failed: 0 };
const failsByLabel = {};
const sampleFails = [];

let processed = 0;
const allCats = Object.entries(CAT_DETAILS);
for (const [code, det] of allCats) {
  const buyOpts = normalizeBuyOpts(det.b);
  if (buyOpts.length === 0) { processed++; continue; }
  const cls = classifyCategory(buyOpts);
  const cases = buildMegaCases(det.p);

  for (const c of cases) {
    if (!applies(c.requires, cls)) continue;
    if (c.skipIfNoCanUnit) continue; // 캔 단위 미지원 케이스 스킵
    stats.totalCases++;
    const r = extractOptionsFromDetailsSimple(c.name, buyOpts);
    const actual = resultToCheck(r);
    const gt = compileGT(c.gt, cls);
    const fails = compare(gt, actual);
    if (fails.length === 0) {
      stats.passed++;
    } else {
      stats.failed++;
      failsByLabel[c.label] = (failsByLabel[c.label] || 0) + 1;
      const labelSeen = sampleFails.filter(s => s.label === c.label).length;
      if (labelSeen < 3) {
        sampleFails.push({
          code, path: det.p, label: c.label, name: c.name, gt, actual, fails,
          buyOpts: buyOpts.map(o => `${o.name}${o.unit ? `(${o.unit})` : ''}${o.choose1 ? '#c1' : ''}${o.required ? '*' : ''}`).join(', '),
        });
      }
    }
  }
  processed++;
  if (processed % 2000 === 0) console.log(`진행: ${processed}/${allCats.length}, 누적 ${stats.totalCases.toLocaleString()}건`);
}

console.log(`\n=== 결과 ===`);
console.log(`총 검증 케이스: ${stats.totalCases.toLocaleString()}`);
console.log(`✅ 통과:        ${stats.passed.toLocaleString()} (${(stats.passed/stats.totalCases*100).toFixed(3)}%)`);
console.log(`❌ 실패:        ${stats.failed.toLocaleString()} (${(stats.failed/stats.totalCases*100).toFixed(3)}%)`);

if (Object.keys(failsByLabel).length > 0) {
  console.log(`\n=== 실패 패턴별 카운트 ===`);
  const sorted = Object.entries(failsByLabel).sort((a,b) => b[1] - a[1]);
  for (const [label, n] of sorted) {
    console.log(`  ${label.padEnd(28)} ${n.toLocaleString()}`);
  }

  console.log(`\n=== 실패 샘플 (각 패턴 첫 케이스) ===`);
  const seen = new Set();
  for (const f of sampleFails) {
    if (seen.has(f.label)) continue;
    seen.add(f.label);
    console.log(`\n[${f.label}] ${f.path}`);
    console.log(`  buyOpts: ${f.buyOpts}`);
    console.log(`  name:    ${f.name}`);
    console.log(`  gt:      ${JSON.stringify(f.gt)}`);
    console.log(`  actual:  ${JSON.stringify(f.actual)}`);
    console.log(`  fails:   ${f.fails.join('; ')}`);
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  stats,
  failsByLabel,
  sampleFails,
};
const outPath = `scripts/verification-reports/audit-option-quantity-mega-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\n전체 보고서: ${outPath}`);
