/**
 * 16,259 카테고리 × 30 합성 상품 → 카테고리 매칭 + 옵션 추출 + 쿠팡 API 요구사항 충족 검증.
 *
 * 검증 항목 (쿠팡 API 요구사항과 100% 동일성):
 *  A. 카테고리 매처 정확도
 *     - exact: categoryCode 완전 일치
 *     - pathLeaf: categoryPath가 의도한 leaf 토큰 포함 (조부모 카테고리 등 부분 일치)
 *     - wrong: 전혀 다른 카테고리로 매칭
 *     - nullResult: 매칭 자체 실패
 *
 *  B. 쿠팡 API requirements 충족 검증 (가장 중요)
 *     - matched.requiredCovered: 쿠팡이 required=true 로 표시한 buyOption 을 모두 채웠는가
 *     - matched.requiredMissing: 채우지 못한 필수 옵션 수
 *     - matched.unknownOption: 쿠팡 스키마에 없는 옵션을 출력했는가
 *
 *  C. 옵션 값 정확도 (의도 spec과 일치)
 *     - 의도한 값(예: 500ml)을 그대로 추출했는지
 *
 *  D. notice category coverage
 *     - 카테고리에 noticeCategory 가 지정되어 있는지 (쿠팡 상품정보제공고시 요구)
 *
 * AI Tier 완전 비활성화 (deterministic 검증):
 *  - matcher Tier 3 (AI): API key 없으면 skip
 *  - option-extractor Layer 4 (AI): skip
 *  - adapter 미전달 → Tier 1.5/2 Coupang API skip
 */
import { readFileSync, writeFileSync } from 'fs';

// console.warn 무력화 — 16k 카테고리 × 30 변형 × 옵션 추출 시 spam 차단.
if (process.env.VERBOSE !== '1') {
  console.warn = () => {};
}

import { matchCategory, getCategoryDetails } from '../src/lib/megaload/services/category-matcher';
import { extractOptionsEnhanced } from '../src/lib/megaload/services/option-extractor';

const raw = JSON.parse(
  readFileSync('src/lib/megaload/data/coupang-cat-index.json', 'utf8')
) as Array<[string, string, string, number]>;

interface CatRow {
  code: string;
  path: string;
  leaf: string;
  depth: number;
}

const ALL_CATEGORIES: CatRow[] = raw.map(([code, fullSpace, leaf, depth]) => {
  const tokens = fullSpace.split(/\s+/).filter(Boolean);
  const leafParts = leaf.split(/[\s/(),\[\]]+/).filter(Boolean);
  const parentTokens = tokens.slice(0, Math.max(1, tokens.length - leafParts.length));
  const path = parentTokens.length > 0 ? parentTokens.join('>') + '>' + leaf : leaf;
  return { code, path, leaf, depth };
});

const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const VARIANTS_PER_CAT = parseInt(process.env.VARIANTS || '30', 10);
const CATEGORIES: CatRow[] = LIMIT > 0 ? ALL_CATEGORIES.slice(0, LIMIT) : ALL_CATEGORIES;

const BRANDS = ['프리미엄', '데일리', '베스트', '로얄', '에코', '플러스', '내츄럴', '스마트', '하이엔드', '오리진'];
const COLORS = ['블랙', '화이트', '레드', '블루', '그레이', '베이지', '핑크', '카키', '네이비', '브라운'];
const SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'FREE', '90', '100', '110', '120'];

interface SpecIntent {
  brand?: string;
  text: string;
  volumeMl?: number;
  weightG?: number;
  count?: number;
  size?: string;
  color?: string;
}

interface Variant {
  name: string;
  kind: string;
  spec: SpecIntent;
}

/**
 * 30개 변형 생성: 다양한 axis (수량/용량/중량/사이즈/색상/복합)로 합성.
 * 카테고리 leaf 가 모든 변형에 들어가야 매처가 leaf 토큰을 hit 할 수 있다.
 */
function buildVariants(cat: CatRow, ci: number): Variant[] {
  const leaf = cat.leaf;
  const b = (i: number) => BRANDS[(ci + i) % BRANDS.length];
  const c = (i: number) => COLORS[(ci + i) % COLORS.length];
  const s = (i: number) => SIZES[(ci + i) % SIZES.length];

  const variants: Variant[] = [
    // leaf 단독 / 브랜드 prefix
    { name: leaf, kind: 'leaf', spec: { text: '' } },
    { name: `${b(0)} ${leaf}`, kind: 'brand_leaf', spec: { brand: b(0), text: '' } },
    { name: `${leaf} ${b(1)}`, kind: 'leaf_brand', spec: { brand: b(1), text: '' } },

    // 수량 변형
    { name: `${leaf} 1개`,    kind: 'count_1',   spec: { count: 1, text: '1개' } },
    { name: `${b(2)} ${leaf} 2개입`, kind: 'count_2',   spec: { brand: b(2), count: 2, text: '2개입' } },
    { name: `${b(3)} ${leaf} 5개입`, kind: 'count_5',   spec: { brand: b(3), count: 5, text: '5개입' } },
    { name: `${b(4)} ${leaf} 10개입`,kind: 'count_10',  spec: { brand: b(4), count: 10, text: '10개입' } },
    { name: `${b(5)} ${leaf} 30개입`,kind: 'count_30',  spec: { brand: b(5), count: 30, text: '30개입' } },
    { name: `${b(6)} ${leaf} 100개입`,kind: 'count_100',spec: { brand: b(6), count: 100, text: '100개입' } },

    // 용량(ml/L) 변형
    { name: `${b(7)} ${leaf} 100ml`,  kind: 'vol_100',  spec: { brand: b(7), volumeMl: 100, text: '100ml' } },
    { name: `${b(8)} ${leaf} 250ml`,  kind: 'vol_250',  spec: { brand: b(8), volumeMl: 250, text: '250ml' } },
    { name: `${b(9)} ${leaf} 500ml`,  kind: 'vol_500',  spec: { brand: b(9), volumeMl: 500, text: '500ml' } },
    { name: `${b(0)} ${leaf} 1L`,     kind: 'vol_1L',   spec: { brand: b(0), volumeMl: 1000, text: '1L' } },

    // 중량(g/kg) 변형
    { name: `${b(1)} ${leaf} 50g`,    kind: 'wt_50',    spec: { brand: b(1), weightG: 50, text: '50g' } },
    { name: `${b(2)} ${leaf} 200g`,   kind: 'wt_200',   spec: { brand: b(2), weightG: 200, text: '200g' } },
    { name: `${b(3)} ${leaf} 500g`,   kind: 'wt_500',   spec: { brand: b(3), weightG: 500, text: '500g' } },
    { name: `${b(4)} ${leaf} 1kg`,    kind: 'wt_1kg',   spec: { brand: b(4), weightG: 1000, text: '1kg' } },
    { name: `${b(5)} ${leaf} 3kg`,    kind: 'wt_3kg',   spec: { brand: b(5), weightG: 3000, text: '3kg' } },

    // 사이즈 변형
    { name: `${b(6)} ${leaf} ${s(0)}사이즈`, kind: 'size_S',  spec: { brand: b(6), size: s(0), text: `${s(0)}사이즈` } },
    { name: `${b(7)} ${leaf} ${s(2)}사이즈`, kind: 'size_L',  spec: { brand: b(7), size: s(2), text: `${s(2)}사이즈` } },
    { name: `${b(8)} ${leaf} ${s(4)}`,       kind: 'size_X',  spec: { brand: b(8), size: s(4), text: s(4) } },

    // 색상 변형
    { name: `${b(9)} ${leaf} ${c(0)}`, kind: 'color_a', spec: { brand: b(9), color: c(0), text: c(0) } },
    { name: `${b(0)} ${leaf} ${c(3)}`, kind: 'color_b', spec: { brand: b(0), color: c(3), text: c(3) } },
    { name: `${b(1)} ${leaf} ${c(5)}`, kind: 'color_c', spec: { brand: b(1), color: c(5), text: c(5) } },

    // 복합 (브랜드 + 색상 + 사이즈)
    { name: `${b(2)} ${leaf} ${c(1)} ${s(1)}사이즈`,
      kind: 'combo_color_size', spec: { brand: b(2), color: c(1), size: s(1), text: `${c(1)} ${s(1)}사이즈` } },
    { name: `${b(3)} ${leaf} ${c(2)} ${s(3)}`,
      kind: 'combo_color_size2', spec: { brand: b(3), color: c(2), size: s(3), text: `${c(2)} ${s(3)}` } },

    // 복합 (용량 + 수량)
    { name: `${b(4)} ${leaf} 500ml 2개입`,
      kind: 'combo_vol_count', spec: { brand: b(4), volumeMl: 500, count: 2, text: '500ml 2개입' } },
    { name: `${b(5)} ${leaf} 1kg 3개입`,
      kind: 'combo_wt_count', spec: { brand: b(5), weightG: 1000, count: 3, text: '1kg 3개입' } },

    // 복합 (수량 + 색상)
    { name: `${b(6)} ${leaf} 10개입 ${c(4)}`,
      kind: 'combo_count_color', spec: { brand: b(6), count: 10, color: c(4), text: `10개입 ${c(4)}` } },

    // 노이즈가 들어간 자연어 형태
    { name: `[정품] ${b(7)} ${leaf} (대용량) 1kg`,
      kind: 'noisy_natural', spec: { brand: b(7), weightG: 1000, text: '1kg' } },
  ];

  // 30개로 자른다 (변동이 있을 때 안정성)
  return variants.slice(0, VARIANTS_PER_CAT);
}

// ─── stats 구조 ────────────────────────────────────────────────

interface FieldStat { match: number; mismatch: number; missing: number }

interface Stats {
  totalVariants: number;
  matcher: {
    exact: number;
    pathLeaf: number;
    wrong: number;
    nullResult: number;
    confSum: number;
    confCount: number;
    bySource: Record<string, number>;
  };
  coupangApi: {
    detailsAvailable: number;     // 매처가 반환한 categoryCode 에 details 가 있는지
    detailsMissing: number;       // categoryCode 는 매칭됐는데 details 가 없음 (스키마 누락)
    requiredAllCovered: number;   // 우리 buyOptions 가 모든 required field 를 채웠다
    requiredPartial: number;      // 일부만 채움
    requiredNoneCovered: number;  // 하나도 못 채움
    requiredFieldsExpected: number; // 누적 합 (required field 총 개수)
    requiredFieldsCovered: number;  // 누적 합 (실제 채운 required field 수)
    extractedHasUnknownName: number;// 추출 옵션 이름이 카테고리 스키마에 없음
    noticeCategoryDefined: number;
    noticeCategoryNull: number;
  };
  valueAccuracy: {
    volume: FieldStat;
    weight: FieldStat;
    counted: FieldStat;
    size: FieldStat;
    color: FieldStat;
  };
  wrongSamples: Array<{ code: string; expected: string; got: string; product: string; kind: string }>;
  schemaGapSamples: Array<{ code: string; product: string; expectedRequired: string[]; covered: string[] }>;
  unknownOptionSamples: Array<{ code: string; product: string; gotName: string; schemaNames: string[] }>;
  valueMismatchSamples: Array<{ code: string; product: string; field: string; intended: string; got: string }>;
}

const stats: Stats = {
  totalVariants: 0,
  matcher: { exact: 0, pathLeaf: 0, wrong: 0, nullResult: 0, confSum: 0, confCount: 0, bySource: {} },
  coupangApi: {
    detailsAvailable: 0, detailsMissing: 0,
    requiredAllCovered: 0, requiredPartial: 0, requiredNoneCovered: 0,
    requiredFieldsExpected: 0, requiredFieldsCovered: 0,
    extractedHasUnknownName: 0,
    noticeCategoryDefined: 0, noticeCategoryNull: 0,
  },
  valueAccuracy: {
    volume:  { match: 0, mismatch: 0, missing: 0 },
    weight:  { match: 0, mismatch: 0, missing: 0 },
    counted: { match: 0, mismatch: 0, missing: 0 },
    size:    { match: 0, mismatch: 0, missing: 0 },
    color:   { match: 0, mismatch: 0, missing: 0 },
  },
  wrongSamples: [],
  schemaGapSamples: [],
  unknownOptionSamples: [],
  valueMismatchSamples: [],
};

const PROGRESS_LOG = 'simulate-30x-progress.log';
const RESULT_JSON = 'simulate-30x-result.json';

function logProgress(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  writeFileSync(PROGRESS_LOG, line, { flag: 'a' });
  console.log(msg);
}

function checkValue(
  field: keyof Stats['valueAccuracy'],
  intended: string | number | undefined,
  extracted: { name: string; value: string; unit?: string }[],
  matcher: (n: string, u?: string) => boolean,
  product: string,
  code: string,
) {
  if (intended === undefined) return;
  const opt = extracted.find(o => matcher(o.name, o.unit));
  const bucket = stats.valueAccuracy[field];
  if (!opt) {
    bucket.missing++;
  } else if (String(opt.value) === String(intended)) {
    bucket.match++;
  } else {
    bucket.mismatch++;
    if (stats.valueMismatchSamples.length < 200) {
      stats.valueMismatchSamples.push({
        code, product, field, intended: String(intended),
        got: String(opt.value) + (opt.unit ? opt.unit : ''),
      });
    }
  }
}

async function run() {
  writeFileSync(PROGRESS_LOG, `=== START ${new Date().toISOString()} | categories=${CATEGORIES.length} × ${VARIANTS_PER_CAT} variants ===\n`);
  const startedAt = Date.now();

  for (let ci = 0; ci < CATEGORIES.length; ci++) {
    const cat = CATEGORIES[ci];
    const variants = buildVariants(cat, ci);

    // 카테고리 expected details 한번만 조회 (의도한 카테고리의 buyOptions/notice)
    let expectedDetails;
    try {
      expectedDetails = await getCategoryDetails(cat.code);
    } catch {
      expectedDetails = null;
    }

    for (const v of variants) {
      stats.totalVariants++;

      // ─── 1. 카테고리 매칭 ──────────────────────────────
      let result;
      try {
        result = await matchCategory(v.name);
      } catch {
        result = null;
      }

      if (!result) {
        stats.matcher.nullResult++;
        continue;
      }

      stats.matcher.confSum += result.confidence;
      stats.matcher.confCount++;
      stats.matcher.bySource[result.source] = (stats.matcher.bySource[result.source] || 0) + 1;

      const matchedSameCode = result.categoryCode === cat.code;
      const matchedLeafInPath = !matchedSameCode && result.categoryPath.includes(cat.leaf);

      if (matchedSameCode) {
        stats.matcher.exact++;
      } else if (matchedLeafInPath) {
        stats.matcher.pathLeaf++;
      } else {
        stats.matcher.wrong++;
        if (stats.wrongSamples.length < 200) {
          stats.wrongSamples.push({
            code: cat.code,
            expected: cat.path,
            got: `${result.categoryCode} ${result.categoryPath}`,
            product: v.name,
            kind: v.kind,
          });
        }
      }

      // ─── 2. 쿠팡 API requirements 검증 ─────────────────
      // 매처가 반환한 카테고리 코드의 schema 와 우리가 추출한 옵션을 대조
      let matchedDetails;
      try {
        matchedDetails = await getCategoryDetails(result.categoryCode);
      } catch {
        matchedDetails = null;
      }

      if (!matchedDetails) {
        stats.coupangApi.detailsMissing++;
        continue;
      }
      stats.coupangApi.detailsAvailable++;

      if (matchedDetails.noticeCategory) stats.coupangApi.noticeCategoryDefined++;
      else stats.coupangApi.noticeCategoryNull++;

      // 옵션 추출
      let extracted;
      try {
        extracted = await extractOptionsEnhanced({
          productName: v.name,
          categoryCode: result.categoryCode,
          categoryPath: result.categoryPath,
        });
      } catch {
        extracted = null;
      }
      if (!extracted) continue;

      const schemaNames = matchedDetails.buyOptions.map(o => o.name);
      const requiredNames = matchedDetails.buyOptions.filter(o => o.required).map(o => o.name);
      const requiredCovered = requiredNames.filter(rn =>
        extracted!.buyOptions.some(eo => eo.name === rn || eo.name.includes(rn) || rn.includes(eo.name))
      );

      stats.coupangApi.requiredFieldsExpected += requiredNames.length;
      stats.coupangApi.requiredFieldsCovered += requiredCovered.length;

      if (requiredNames.length === 0) {
        stats.coupangApi.requiredAllCovered++;
      } else if (requiredCovered.length === requiredNames.length) {
        stats.coupangApi.requiredAllCovered++;
      } else if (requiredCovered.length === 0) {
        stats.coupangApi.requiredNoneCovered++;
        if (stats.schemaGapSamples.length < 100) {
          stats.schemaGapSamples.push({
            code: result.categoryCode,
            product: v.name,
            expectedRequired: requiredNames,
            covered: requiredCovered,
          });
        }
      } else {
        stats.coupangApi.requiredPartial++;
        if (stats.schemaGapSamples.length < 100) {
          stats.schemaGapSamples.push({
            code: result.categoryCode,
            product: v.name,
            expectedRequired: requiredNames,
            covered: requiredCovered,
          });
        }
      }

      // unknown name 검사
      for (const eo of extracted.buyOptions) {
        const known = schemaNames.some(sn => sn === eo.name || sn.includes(eo.name) || eo.name.includes(sn));
        if (!known) {
          stats.coupangApi.extractedHasUnknownName++;
          if (stats.unknownOptionSamples.length < 50) {
            stats.unknownOptionSamples.push({
              code: result.categoryCode,
              product: v.name,
              gotName: eo.name,
              schemaNames,
            });
          }
          break; // 1 sample per variant
        }
      }

      // ─── 3. 값 정확도 (의도한 spec ↔ 추출한 값) ─────────
      // 매칭된 카테고리의 buyOptions 에 해당 필드가 있을 때만 측정
      const buyOpts = matchedDetails.buyOptions;
      const hasVolume = buyOpts.some(o => o.name.includes('용량') && o.unit === 'ml');
      const hasWeight = buyOpts.some(o => o.name.includes('중량') && o.unit === 'g');
      const hasCount  = buyOpts.some(o => o.name === '수량' && o.unit === '개');
      const hasSize   = buyOpts.some(o => o.name === '사이즈' || o.name.includes('사이즈') || o.name === '크기');
      const hasColor  = buyOpts.some(o => o.name === '색상' || o.name.includes('색상') || o.name === '컬러');

      if (hasVolume && v.spec.volumeMl !== undefined)
        checkValue('volume', v.spec.volumeMl, extracted.buyOptions, (n, u) => n.includes('용량') && u === 'ml', v.name, result.categoryCode);
      if (hasWeight && v.spec.weightG !== undefined)
        checkValue('weight', v.spec.weightG, extracted.buyOptions, (n, u) => n.includes('중량') && u === 'g', v.name, result.categoryCode);
      if (hasCount && v.spec.count !== undefined)
        checkValue('counted', v.spec.count, extracted.buyOptions, (n, u) => n === '수량' && u === '개', v.name, result.categoryCode);
      if (hasSize && v.spec.size !== undefined)
        checkValue('size', v.spec.size, extracted.buyOptions, (n) => n === '사이즈' || n.includes('사이즈') || n === '크기', v.name, result.categoryCode);
      if (hasColor && v.spec.color !== undefined)
        checkValue('color', v.spec.color, extracted.buyOptions, (n) => n === '색상' || n.includes('색상') || n === '컬러', v.name, result.categoryCode);
    }

    if ((ci + 1) % 200 === 0) {
      const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
      const rate = ((ci + 1) / ((Date.now() - startedAt) / 1000)).toFixed(2);
      const etaMin = (((CATEGORIES.length - (ci + 1)) / parseFloat(rate)) / 60).toFixed(1);
      logProgress(
        `[${ci + 1}/${CATEGORIES.length}] ${((ci + 1) / CATEGORIES.length * 100).toFixed(1)}% | ` +
        `elapsed ${elapsedMin}min @ ${rate}cat/s | ETA ${etaMin}min | ` +
        `exact ${stats.matcher.exact}/${stats.totalVariants} (${(stats.matcher.exact / Math.max(1, stats.totalVariants) * 100).toFixed(1)}%) | ` +
        `pathLeaf ${stats.matcher.pathLeaf} wrong ${stats.matcher.wrong} | ` +
        `req-full ${stats.coupangApi.requiredAllCovered} partial ${stats.coupangApi.requiredPartial} none ${stats.coupangApi.requiredNoneCovered}`
      );
    }
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  logProgress(`=== DONE in ${elapsedSec}s ===`);

  const totalVar = stats.totalVariants;
  const denomVal = (b: FieldStat) => Math.max(1, b.match + b.mismatch + b.missing);

  const report = {
    meta: {
      totalCategories: CATEGORIES.length,
      variantsPerCategory: VARIANTS_PER_CAT,
      totalVariants: totalVar,
      elapsedSec: parseFloat(elapsedSec),
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
    },
    matcher: {
      total: totalVar,
      exact: stats.matcher.exact,
      exactPct: +((stats.matcher.exact / Math.max(1, totalVar)) * 100).toFixed(2),
      pathLeaf: stats.matcher.pathLeaf,
      pathLeafPct: +((stats.matcher.pathLeaf / Math.max(1, totalVar)) * 100).toFixed(2),
      wrong: stats.matcher.wrong,
      wrongPct: +((stats.matcher.wrong / Math.max(1, totalVar)) * 100).toFixed(2),
      nullResult: stats.matcher.nullResult,
      avgConfidence: +(stats.matcher.confSum / Math.max(1, stats.matcher.confCount)).toFixed(3),
      bySource: stats.matcher.bySource,
    },
    coupangApi: {
      detailsAvailable: stats.coupangApi.detailsAvailable,
      detailsMissing: stats.coupangApi.detailsMissing,
      requiredAllCovered: stats.coupangApi.requiredAllCovered,
      requiredAllCoveredPct: +(stats.coupangApi.requiredAllCovered / Math.max(1, stats.coupangApi.detailsAvailable) * 100).toFixed(2),
      requiredPartial: stats.coupangApi.requiredPartial,
      requiredNoneCovered: stats.coupangApi.requiredNoneCovered,
      requiredFieldsExpected: stats.coupangApi.requiredFieldsExpected,
      requiredFieldsCovered: stats.coupangApi.requiredFieldsCovered,
      requiredFieldCoveragePct: +(stats.coupangApi.requiredFieldsCovered / Math.max(1, stats.coupangApi.requiredFieldsExpected) * 100).toFixed(2),
      extractedHasUnknownName: stats.coupangApi.extractedHasUnknownName,
      noticeCategoryDefined: stats.coupangApi.noticeCategoryDefined,
      noticeCategoryNull: stats.coupangApi.noticeCategoryNull,
      noticeCoveragePct: +(stats.coupangApi.noticeCategoryDefined / Math.max(1, stats.coupangApi.detailsAvailable) * 100).toFixed(2),
    },
    valueAccuracy: {
      volume: {
        ...stats.valueAccuracy.volume,
        accPct: +(stats.valueAccuracy.volume.match / denomVal(stats.valueAccuracy.volume) * 100).toFixed(2),
      },
      weight: {
        ...stats.valueAccuracy.weight,
        accPct: +(stats.valueAccuracy.weight.match / denomVal(stats.valueAccuracy.weight) * 100).toFixed(2),
      },
      counted: {
        ...stats.valueAccuracy.counted,
        accPct: +(stats.valueAccuracy.counted.match / denomVal(stats.valueAccuracy.counted) * 100).toFixed(2),
      },
      size: {
        ...stats.valueAccuracy.size,
        accPct: +(stats.valueAccuracy.size.match / denomVal(stats.valueAccuracy.size) * 100).toFixed(2),
      },
      color: {
        ...stats.valueAccuracy.color,
        accPct: +(stats.valueAccuracy.color.match / denomVal(stats.valueAccuracy.color) * 100).toFixed(2),
      },
    },
    samples: {
      wrong: stats.wrongSamples.slice(0, 80),
      schemaGap: stats.schemaGapSamples.slice(0, 60),
      unknownOption: stats.unknownOptionSamples.slice(0, 30),
      valueMismatch: stats.valueMismatchSamples.slice(0, 80),
    },
  };

  writeFileSync(RESULT_JSON, JSON.stringify(report, null, 2));
  logProgress(`결과 저장: ${RESULT_JSON}`);
}

run().catch((err) => {
  console.error('FATAL:', err);
  writeFileSync(PROGRESS_LOG, `FATAL: ${err instanceof Error ? err.stack : String(err)}\n`, { flag: 'a' });
  process.exit(1);
});
