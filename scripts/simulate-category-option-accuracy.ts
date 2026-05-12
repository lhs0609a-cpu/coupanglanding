/**
 * 16,259 카테고리 × 임의 상품명 → 카테고리 매칭 + 옵션 추출 정확도 실측.
 *
 * 측정 항목:
 *  A. 카테고리 매처 정확도
 *     - leaf-only / brand+leaf+spec 2가지 변형
 *     - exact (코드 일치) / parent (path 부분 일치) / wrong / null
 *     - source 분포 (local_db / coupang_api / ai)
 *     - 평균 confidence
 *  B. 옵션 추출 정확도 (spec 박힌 변형만)
 *     - 카테고리 buyOptions 에 용량(ml)/중량(g)/수량(개)/사이즈/색상 있을 때만 측정
 *     - 의도 값과 비교 → match / mismatch / missing
 *
 * AI Tier 비활성화:
 *  - matcher Tier 3 (aiKeywordMatch): GEMINI/OPENAI 없으면 silently skip
 *  - option-extractor Layer 4: OPENAI 없으면 skip
 *  - adapter 인자 미전달 → Tier 1.5/2 Coupang API skip
 */
import { readFileSync, writeFileSync } from 'fs';

// console.warn 무력화 — 16k 카테고리 × 옵션 추출 시 'OPENAI_API_KEY 없음' 류 경고 spam 차단.
// 환경변수 VERBOSE=1 로 다시 활성화 가능.
if (process.env.VERBOSE !== '1') {
  console.warn = () => {};
}

import { matchCategory } from '../src/lib/megaload/services/category-matcher';
import { extractOptionsEnhanced } from '../src/lib/megaload/services/option-extractor';
import { getCategoryDetails } from '../src/lib/megaload/services/category-matcher';

const raw = JSON.parse(readFileSync('src/lib/megaload/data/coupang-cat-index.json', 'utf8')) as Array<[string, string, string, number]>;

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

// LIMIT 환경변수로 카테고리 수 제한 (smoke test 용). 0 또는 미설정 시 전체.
const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const CATEGORIES: CatRow[] = LIMIT > 0 ? ALL_CATEGORIES.slice(0, LIMIT) : ALL_CATEGORIES;

const BRANDS = ['프리미엄', '데일리', '베스트', '로얄', '에코', '플러스', '내츄럴', '스마트'];

interface SpecIntent {
  text: string;
  volumeMl?: number;
  weightG?: number;
  count?: number;
  size?: string;
  color?: string;
}

function buildSpec(idx: number): SpecIntent {
  const mod = idx % 4;
  if (mod === 0) return { text: '500ml 2개입', volumeMl: 500, count: 2 };
  if (mod === 1) return { text: '1kg 3개입', weightG: 1000, count: 3 };
  if (mod === 2) return { text: 'L사이즈 블랙', size: 'L', color: '블랙' };
  return { text: '50개입', count: 50 };
}

interface Variant {
  name: string;
  kind: 'leaf' | 'spec';
  spec?: SpecIntent;
}

function buildVariants(cat: CatRow, idx: number): Variant[] {
  const brand = BRANDS[idx % BRANDS.length];
  const spec = buildSpec(idx);
  return [
    { name: cat.leaf, kind: 'leaf' },
    { name: `${brand} ${cat.leaf} ${spec.text}`, kind: 'spec', spec },
  ];
}

interface Stats {
  totalMatches: number;
  byKind: Record<'leaf' | 'spec', {
    total: number;
    exact: number;          // categoryCode 일치
    pathLeaf: number;       // path 에 expected.leaf 포함 (부분 일치)
    wrong: number;
    nullResult: number;
    confSum: number;
    confCount: number;
    bySource: Record<string, number>;
  }>;
  options: {
    totalProbed: number;            // 옵션 추출 시도한 변형 수 (spec only)
    intentChecked: number;          // 카테고리에 해당 옵션이 있어 검증한 케이스 수
    counted: { match: number; mismatch: number; missing: number };
    volume:  { match: number; mismatch: number; missing: number };
    weight:  { match: number; mismatch: number; missing: number };
    size:    { match: number; mismatch: number; missing: number };
    color:   { match: number; mismatch: number; missing: number };
    confSum: number;
    confCount: number;
  };
  wrongSamples: Array<{ code: string; expected: string; got: string; product: string; kind: string }>;
  optionMismatchSamples: Array<{ code: string; leaf: string; product: string; field: string; intended: string; got: string }>;
  unknownCategorySamples: string[];
}

const stats: Stats = {
  totalMatches: 0,
  byKind: {
    leaf: { total: 0, exact: 0, pathLeaf: 0, wrong: 0, nullResult: 0, confSum: 0, confCount: 0, bySource: {} },
    spec: { total: 0, exact: 0, pathLeaf: 0, wrong: 0, nullResult: 0, confSum: 0, confCount: 0, bySource: {} },
  },
  options: {
    totalProbed: 0, intentChecked: 0,
    counted: { match: 0, mismatch: 0, missing: 0 },
    volume:  { match: 0, mismatch: 0, missing: 0 },
    weight:  { match: 0, mismatch: 0, missing: 0 },
    size:    { match: 0, mismatch: 0, missing: 0 },
    color:   { match: 0, mismatch: 0, missing: 0 },
    confSum: 0, confCount: 0,
  },
  wrongSamples: [],
  optionMismatchSamples: [],
  unknownCategorySamples: [],
};

const PROGRESS_LOG = 'simulate-cat-opt-progress.log';
const RESULT_JSON = 'simulate-cat-opt-result.json';

function logProgress(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  writeFileSync(PROGRESS_LOG, line, { flag: 'a' });
  console.log(msg);
}

async function run() {
  writeFileSync(PROGRESS_LOG, `=== START ${new Date().toISOString()} | categories=${CATEGORIES.length} ===\n`);
  const startedAt = Date.now();

  for (let ci = 0; ci < CATEGORIES.length; ci++) {
    const cat = CATEGORIES[ci];
    const variants = buildVariants(cat, ci);

    for (const v of variants) {
      stats.totalMatches++;
      const kindStat = stats.byKind[v.kind];
      kindStat.total++;

      let result;
      try {
        result = await matchCategory(v.name);
      } catch (err) {
        result = null;
      }

      if (!result) {
        kindStat.nullResult++;
      } else {
        kindStat.confSum += result.confidence;
        kindStat.confCount++;
        kindStat.bySource[result.source] = (kindStat.bySource[result.source] || 0) + 1;

        if (result.categoryCode === cat.code) {
          kindStat.exact++;
        } else if (result.categoryPath.includes(cat.leaf)) {
          kindStat.pathLeaf++;
        } else {
          kindStat.wrong++;
          if (stats.wrongSamples.length < 100) {
            stats.wrongSamples.push({
              code: cat.code,
              expected: cat.path,
              got: `${result.categoryCode} ${result.categoryPath}`,
              product: v.name,
              kind: v.kind,
            });
          }
        }
      }

      if (v.kind !== 'spec' || !v.spec) continue;

      // 옵션 추출 — 카테고리 buyOptions 가 의도 옵션과 매칭 가능할 때만 검증
      stats.options.totalProbed++;
      let details;
      try {
        details = await getCategoryDetails(cat.code);
      } catch {
        details = null;
      }
      if (!details || !details.buyOptions || details.buyOptions.length === 0) {
        if (stats.unknownCategorySamples.length < 50 && !details) {
          stats.unknownCategorySamples.push(`${cat.code} ${cat.path}`);
        }
        continue;
      }

      const buyOpts = details.buyOptions;
      const hasVolume = buyOpts.some(o => o.name.includes('용량') && o.unit === 'ml');
      const hasWeight = buyOpts.some(o => o.name.includes('중량') && o.unit === 'g');
      const hasCount  = buyOpts.some(o => o.name === '수량' && o.unit === '개');
      const hasSize   = buyOpts.some(o => o.name === '사이즈' || o.name.includes('사이즈') || o.name === '크기');
      const hasColor  = buyOpts.some(o => o.name === '색상' || o.name.includes('색상') || o.name === '컬러');

      const needsAnyIntent =
        (hasVolume && v.spec.volumeMl !== undefined) ||
        (hasWeight && v.spec.weightG !== undefined) ||
        (hasCount  && v.spec.count   !== undefined) ||
        (hasSize   && v.spec.size    !== undefined) ||
        (hasColor  && v.spec.color   !== undefined);

      if (!needsAnyIntent) continue;
      stats.options.intentChecked++;

      let extracted;
      try {
        extracted = await extractOptionsEnhanced({
          productName: v.name,
          categoryCode: cat.code,
          categoryPath: cat.path,
        });
      } catch {
        extracted = null;
      }

      if (!extracted) continue;
      stats.options.confSum += extracted.confidence;
      stats.options.confCount++;

      const findOpt = (predicate: (n: string, u?: string) => boolean) =>
        extracted.buyOptions.find(o => predicate(o.name, o.unit));

      function checkField(
        field: 'counted' | 'volume' | 'weight' | 'size' | 'color',
        intended: string | number | undefined,
        predicate: (n: string, u?: string) => boolean,
      ) {
        if (intended === undefined) return;
        const opt = findOpt(predicate);
        const bucket = stats.options[field];
        if (!opt) {
          bucket.missing++;
        } else if (String(opt.value) === String(intended)) {
          bucket.match++;
        } else {
          bucket.mismatch++;
          if (stats.optionMismatchSamples.length < 80) {
            stats.optionMismatchSamples.push({
              code: cat.code,
              leaf: cat.leaf,
              product: v.name,
              field,
              intended: String(intended),
              got: String(opt.value) + (opt.unit ? opt.unit : ''),
            });
          }
        }
      }

      if (hasVolume && v.spec.volumeMl !== undefined) checkField('volume', v.spec.volumeMl, (n, u) => n.includes('용량') && u === 'ml');
      if (hasWeight && v.spec.weightG !== undefined) checkField('weight', v.spec.weightG, (n, u) => n.includes('중량') && u === 'g');
      if (hasCount  && v.spec.count   !== undefined) checkField('counted', v.spec.count, (n, u) => n === '수량' && u === '개');
      if (hasSize   && v.spec.size    !== undefined) checkField('size', v.spec.size, (n) => n === '사이즈' || n.includes('사이즈') || n === '크기');
      if (hasColor  && v.spec.color   !== undefined) checkField('color', v.spec.color, (n) => n === '색상' || n.includes('색상') || n === '컬러');
    }

    if ((ci + 1) % 200 === 0) {
      const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
      const rate = ((ci + 1) / ((Date.now() - startedAt) / 1000)).toFixed(1);
      const etaMin = (((CATEGORIES.length - (ci + 1)) / parseFloat(rate)) / 60).toFixed(1);
      const leafStat = stats.byKind.leaf;
      const specStat = stats.byKind.spec;
      logProgress(
        `progress ${ci + 1}/${CATEGORIES.length} (${((ci + 1) / CATEGORIES.length * 100).toFixed(1)}%) | ` +
        `elapsed ${elapsedMin}min @ ${rate}cat/s | ETA ${etaMin}min | ` +
        `leaf-exact ${leafStat.exact}/${leafStat.total} (${(leafStat.exact / Math.max(1, leafStat.total) * 100).toFixed(1)}%) | ` +
        `spec-exact ${specStat.exact}/${specStat.total} (${(specStat.exact / Math.max(1, specStat.total) * 100).toFixed(1)}%) | ` +
        `option-checked ${stats.options.intentChecked}`
      );
    }
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  logProgress(`=== DONE in ${elapsedSec}s ===`);

  const report = {
    meta: {
      totalCategories: CATEGORIES.length,
      totalMatches: stats.totalMatches,
      elapsedSec: parseFloat(elapsedSec),
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
    },
    matcher: {
      leaf: {
        total: stats.byKind.leaf.total,
        exact: stats.byKind.leaf.exact,
        exactPct: +((stats.byKind.leaf.exact / Math.max(1, stats.byKind.leaf.total)) * 100).toFixed(2),
        pathLeaf: stats.byKind.leaf.pathLeaf,
        wrong: stats.byKind.leaf.wrong,
        nullResult: stats.byKind.leaf.nullResult,
        avgConfidence: +(stats.byKind.leaf.confSum / Math.max(1, stats.byKind.leaf.confCount)).toFixed(3),
        bySource: stats.byKind.leaf.bySource,
      },
      spec: {
        total: stats.byKind.spec.total,
        exact: stats.byKind.spec.exact,
        exactPct: +((stats.byKind.spec.exact / Math.max(1, stats.byKind.spec.total)) * 100).toFixed(2),
        pathLeaf: stats.byKind.spec.pathLeaf,
        wrong: stats.byKind.spec.wrong,
        nullResult: stats.byKind.spec.nullResult,
        avgConfidence: +(stats.byKind.spec.confSum / Math.max(1, stats.byKind.spec.confCount)).toFixed(3),
        bySource: stats.byKind.spec.bySource,
      },
    },
    options: {
      totalProbed: stats.options.totalProbed,
      intentChecked: stats.options.intentChecked,
      avgConfidence: +(stats.options.confSum / Math.max(1, stats.options.confCount)).toFixed(3),
      perField: {
        counted: stats.options.counted,
        volume: stats.options.volume,
        weight: stats.options.weight,
        size: stats.options.size,
        color: stats.options.color,
      },
      summary: {
        countedAccPct: +(stats.options.counted.match / Math.max(1, stats.options.counted.match + stats.options.counted.mismatch + stats.options.counted.missing) * 100).toFixed(2),
        volumeAccPct:  +(stats.options.volume.match  / Math.max(1, stats.options.volume.match  + stats.options.volume.mismatch  + stats.options.volume.missing)  * 100).toFixed(2),
        weightAccPct:  +(stats.options.weight.match  / Math.max(1, stats.options.weight.match  + stats.options.weight.mismatch  + stats.options.weight.missing)  * 100).toFixed(2),
        sizeAccPct:    +(stats.options.size.match    / Math.max(1, stats.options.size.match    + stats.options.size.mismatch    + stats.options.size.missing)    * 100).toFixed(2),
        colorAccPct:   +(stats.options.color.match   / Math.max(1, stats.options.color.match   + stats.options.color.mismatch   + stats.options.color.missing)   * 100).toFixed(2),
      },
    },
    samples: {
      wrong: stats.wrongSamples,
      optionMismatch: stats.optionMismatchSamples,
      unknownCategories: stats.unknownCategorySamples,
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
