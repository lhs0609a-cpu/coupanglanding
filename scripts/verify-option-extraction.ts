#!/usr/bin/env tsx
/**
 * 옵션 추출 회귀 검증 — 카테고리별 랜덤 상품명 생성 후 옵션값 정확도 검증
 *
 * 설계:
 * 1. leaf 카테고리 중 buyOptions가 있는 것만 대상
 * 2. 카테고리의 필수 옵션 타입을 보고 템플릿 선택
 * 3. 각 카테고리당 100개 상품명 시드 기반 생성
 * 4. extractOptionsEnhanced 실행
 * 5. 생성 시 쓴 값(ground truth)과 추출값 1:1 비교 — consolidation·변환도 실패로 간주
 * 6. 실패 케이스 요약 + 원인별 집계
 *
 * 실행: node scripts/verify-option-bundle.cjs (esbuild 후)
 */

import catDetails from '../src/lib/megaload/data/coupang-cat-details.json';
import { extractOptionsEnhanced } from '../src/lib/megaload/services/option-extractor';
import { createSeededRandom, stringToSeed } from '../src/lib/megaload/services/seeded-random';

// ─── 카테고리 타입 ─────────────────────────────────────────
interface BuyOption {
  n: string;            // name
  r: boolean;           // required
  u?: string;           // unit
  c1?: boolean;         // choose1
}
interface CategoryData {
  p: string;            // path
  b?: BuyOption[];      // buyOptions
}

const ITEMS_PER_CATEGORY = 100;
const SELLER_SEED = 'verify-opt-2026';

// ─── 옵션명 → 템플릿 값 생성기 매핑 ─────────────────────────

interface SpecValue {
  optName: string;
  unit?: string;
  rawValue: string;     // 템플릿에 삽입된 원본 문자열 (예: "60캡슐", "2.5kg")
  expectedValue: string; // extractor가 반환해야 할 정규화 값 (예: "60", "2500")
}

// 브랜드 / 제품명 풀 (간단)
const BRANDS = ['네이처메이드', 'GNC', 'LG생활건강', '종근당', '옵티멈뉴트리션', '고려은단', '오뚜기', '삼다수'];
const FOOD_NAMES = ['프리미엄', '골드', '플러스', '컴플렉스', '파우더', '스틱', '캔디', '젤리'];
const HEALTH_INGREDIENTS = ['홍삼', '유산균', '오메가3', '비타민C', '루테인', '콜라겐', '밀크씨슬', '글루코사민', '프로폴리스', '코엔자임Q10'];

function randItem<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function normOptName(name: string): string {
  return name.replace(/\s+/g, '');
}

/**
 * 카테고리 타입에 맞춰 원본 값 + 상품명 템플릿을 생성.
 * 반환: { productName, specs: SpecValue[] }
 */
function generateProduct(
  cat: CategoryData,
  rng: () => number,
): { productName: string; specs: SpecValue[] } | null {
  const buyOpts = (cat.b || []).filter(o => o.r); // 필수 옵션만
  if (buyOpts.length === 0) return null;

  // 타입 감지 — 정확히 매칭되는 옵션명만 대상 (이상한 변종 제외)
  const findOpt = (predicate: (o: BuyOption) => boolean) => buyOpts.find(predicate);
  const tabletOpt = findOpt(o => {
    const n = normOptName(o.n);
    return n === '개당캡슐/정' || n === '캡슐수' || n === '정수' || n === '개당정' || n === '개당캡슐';
  });
  // "개당 중량"만 정확 매칭 (최대 측정 가능 중량 등은 제외)
  const weightOpt = findOpt(o => o.u === 'g' && normOptName(o.n) === '개당중량');
  const volumeOpt = findOpt(o => o.u === 'ml' && normOptName(o.n) === '개당용량');
  const countOpt = findOpt(o => normOptName(o.n) === '수량' && o.u === '개');
  const sizeOpt = findOpt(o => (normOptName(o.n) === '사이즈' || normOptName(o.n) === '크기') && !o.u);
  const colorOpt = findOpt(o => (normOptName(o.n) === '색상' || normOptName(o.n) === '컬러') && !o.u);

  // choose1 그룹에서 하나만 선택 — 나머지 choose1 옵션은 값 생성/검증에서 제외
  const choose1Opts = buyOpts.filter(o => o.c1);
  let chosenC1: BuyOption | null = null;
  if (choose1Opts.length > 0) chosenC1 = randItem(rng, choose1Opts);
  const isExcludedC1 = (opt?: BuyOption) => !!(opt && opt.c1 && chosenC1 && opt.n !== chosenC1.n);

  const useTablet = !!tabletOpt && !isExcludedC1(tabletOpt);
  const useWeight = !!weightOpt && !isExcludedC1(weightOpt);
  const useVolume = !!volumeOpt && !isExcludedC1(volumeOpt);
  const useCount = !!countOpt && !isExcludedC1(countOpt);
  const useSize = !!sizeOpt && !isExcludedC1(sizeOpt);
  const useColor = !!colorOpt && !isExcludedC1(colorOpt);

  const specs: SpecValue[] = [];
  const parts: string[] = [];

  // 브랜드/제품 이름 파트 (카테고리 L1에 따라 다름)
  const l1 = cat.p.split('>')[0];
  const brand = randItem(rng, BRANDS);
  parts.push(brand);

  if (l1.includes('식품') && cat.p.includes('건강식품')) {
    const ing = randItem(rng, HEALTH_INGREDIENTS);
    parts.push(ing);
    parts.push(randItem(rng, FOOD_NAMES));
  } else {
    // 범용: 카테고리 리프를 사용하되 특수기호·사이즈자·색상키워드 제거 (generator 오염 방지)
    const leaf = cat.p.split('>').pop() || '';
    const cleaned = leaf
      .replace(/[()\/]/g, ' ')
      .replace(/\b(XS|S|M|L|XL|XXL|XXXL)\b/g, '')  // 사이즈 자 제거
      .replace(/블랙|화이트|네이비|그레이|베이지|골드|실버|로즈골드/g, '')  // 색상 키워드 제거
      .replace(/LED|LCD|USB/g, '')  // 영문 기기 약자 제거
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length >= 2) parts.push(cleaned.slice(0, 12));
  }

  // ── 수량 결정 (tablet/weight/volume과 함께 쓰면 consolidation 위험 → 1로 고정) ──
  // 단, "수량"이 있는 카테고리에서 count>1이 필요한 경우도 있어 타입별 조절
  const tabletVal = useTablet ? 30 + Math.floor(rng() * 90) : 0;  // 30~119
  // 수량은 항상 1 — consolidation 트리거 회피 (원본값 그대로 검증하기 위함)
  const countVal = 1;

  // ── spec 값 조립 (choose1 배제 옵션은 값 자체를 상품명에 넣지 않음) ──
  if (useTablet && tabletOpt) {
    const unitWord = randItem(rng, ['정', '캡슐']);
    parts.push(`${tabletVal}${unitWord}`);
    specs.push({
      optName: tabletOpt.n,
      unit: tabletOpt.u,
      rawValue: `${tabletVal}${unitWord}`,
      expectedValue: String(tabletVal),
    });
  }

  if (useWeight && weightOpt) {
    const weightG = (1 + Math.floor(rng() * 10)) * 100;
    const useKg = rng() < 0.3 && weightG >= 1000;
    const rawW = useKg ? `${weightG / 1000}kg` : `${weightG}g`;
    parts.push(rawW);
    specs.push({
      optName: weightOpt.n,
      unit: 'g',
      rawValue: rawW,
      expectedValue: String(weightG),
    });
  }

  if (useVolume && volumeOpt) {
    const volMl = (1 + Math.floor(rng() * 10)) * 50;
    const rawV = `${volMl}ml`;
    parts.push(rawV);
    specs.push({
      optName: volumeOpt.n,
      unit: 'ml',
      rawValue: rawV,
      expectedValue: String(volMl),
    });
  }

  if (useCount && countOpt) {
    parts.push(`${countVal}개`);
    specs.push({
      optName: countOpt.n,
      unit: '개',
      rawValue: `${countVal}개`,
      expectedValue: String(countVal),
    });
  }

  if (useSize && sizeOpt) {
    const size = randItem(rng, ['S', 'M', 'L', 'XL']);
    parts.push(size);
    specs.push({
      optName: sizeOpt.n,
      unit: undefined,
      rawValue: size,
      expectedValue: size,
    });
  }

  if (useColor && colorOpt) {
    const color = randItem(rng, ['블랙', '화이트', '네이비', '그레이', '베이지']);
    parts.push(color);
    specs.push({
      optName: colorOpt.n,
      unit: undefined,
      rawValue: color,
      expectedValue: color,
    });
  }

  if (specs.length === 0) return null;
  return { productName: parts.join(' '), specs };
}

// ─── 메인 ─────────────────────────────────────────────────
interface Failure {
  code: string;
  path: string;
  productName: string;
  optName: string;
  expected: string;
  actual: string;
  reason: string;
}

async function main() {
  const startTime = Date.now();
  const allEntries = Object.entries(catDetails as Record<string, CategoryData>);
  // 도서/음반/DVD는 옵션 체계가 저자/출판사 기반이라 이 테스트 범위에서 제외
  const withBuyOpts = allEntries.filter(([, v]) => {
    if (!v.b || v.b.length === 0) return false;
    if (/^도서|^음반|^DVD/.test(v.p)) return false;
    // 우리 템플릿이 커버하는 타입이 하나라도 있어야 테스트 가능
    return v.b.some(o => {
      const n = normOptName(o.n);
      return (o.r && (
        (n.includes('캡슐') || n.includes('정')) ||
        (o.u === 'g' && n.includes('중량')) ||
        (o.u === 'ml' && n.includes('용량')) ||
        (n === '수량' && o.u === '개') ||
        (n.includes('사이즈') || n === '크기') ||
        (n.includes('색상') || n.includes('컬러'))
      ));
    });
  });
  console.log(`buyOptions 있는 leaf 카테고리: ${withBuyOpts.length}개`);
  console.log(`카테고리당 ${ITEMS_PER_CATEGORY}개 = 총 ${withBuyOpts.length * ITEMS_PER_CATEGORY}개 테스트\n`);
  console.log('='.repeat(80));

  const failures: Failure[] = [];
  let totalTested = 0;
  let totalSkipped = 0;
  let totalCategories = 0;

  const SAMPLE_LIMIT = parseInt(process.env.SAMPLE || '0', 10); // 0=전체
  const targets = SAMPLE_LIMIT > 0 ? withBuyOpts.slice(0, SAMPLE_LIMIT) : withBuyOpts;
  if (SAMPLE_LIMIT > 0) console.log(`[SAMPLE MODE] 처음 ${SAMPLE_LIMIT}개만 테스트\n`);
  for (const [code, catRaw] of targets) {
    const cat = catRaw as CategoryData;
    totalCategories++;
    const rng = createSeededRandom(stringToSeed(`verify::${code}`));

    for (let i = 0; i < ITEMS_PER_CATEGORY; i++) {
      const gen = generateProduct(cat, rng);
      if (!gen) {
        totalSkipped++;
        continue;
      }
      totalTested++;
      try {
        const extracted = await extractOptionsEnhanced({
          productName: gen.productName,
          categoryCode: code,
          categoryPath: cat.p,
        });
        // 각 expected spec에 대해 추출값 확인
        for (const spec of gen.specs) {
          const actual = extracted.buyOptions.find(o => o.name === spec.optName);
          if (!actual) {
            failures.push({
              code, path: cat.p,
              productName: gen.productName,
              optName: spec.optName,
              expected: spec.expectedValue,
              actual: '(추출 안 됨)',
              reason: 'missing',
            });
            continue;
          }
          if (actual.value !== spec.expectedValue) {
            const reason = parseInt(actual.value) === parseInt(spec.expectedValue) * 2
              ? 'consolidation'
              : parseInt(actual.value) > parseInt(spec.expectedValue) * 10
                ? 'scale_error'
                : 'value_mismatch';
            failures.push({
              code, path: cat.p,
              productName: gen.productName,
              optName: spec.optName,
              expected: spec.expectedValue,
              actual: actual.value,
              reason,
            });
          }
        }
      } catch (err) {
        failures.push({
          code, path: cat.p,
          productName: gen.productName,
          optName: '(exception)',
          expected: '',
          actual: String(err),
          reason: 'error',
        });
      }
    }

    if (totalCategories % 100 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r진행: ${totalCategories}/${targets.length} cats | 테스트 ${totalTested} | 실패 ${failures.length} | ${elapsed}s`);
    }
  }
  console.log();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('='.repeat(80));
  console.log(`완료 (${elapsed}s)`);
  console.log(`테스트: ${totalTested}개 (스킵: ${totalSkipped}개)`);
  console.log(`실패: ${failures.length}건`);
  console.log(`통과율: ${((1 - failures.length / Math.max(1, totalTested)) * 100).toFixed(2)}%`);

  // 원인별 집계
  const byReason = new Map<string, number>();
  for (const f of failures) byReason.set(f.reason, (byReason.get(f.reason) || 0) + 1);
  console.log('\n── 실패 원인별 ──');
  for (const [r, n] of [...byReason].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${r}: ${n}건`);
  }

  // 옵션명별 집계 TOP 20
  const byOpt = new Map<string, number>();
  for (const f of failures) byOpt.set(f.optName, (byOpt.get(f.optName) || 0) + 1);
  const sortedOpt = [...byOpt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log('\n── 실패 옵션명 TOP 20 ──');
  for (const [name, n] of sortedOpt) console.log(`  ${name.padEnd(20)} ${n}건`);

  // 카테고리별 집계 TOP 20
  const byCat = new Map<string, number>();
  for (const f of failures) byCat.set(f.path, (byCat.get(f.path) || 0) + 1);
  const sortedCat = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log('\n── 실패 카테고리 TOP 20 ──');
  for (const [p, n] of sortedCat) console.log(`  ${n}건 — ${p}`);

  // 샘플 20개
  console.log('\n── 실패 샘플 (최대 30건) ──');
  for (const f of failures.slice(0, 30)) {
    console.log(`  [${f.reason}] ${f.path}`);
    console.log(`    상품: ${f.productName}`);
    console.log(`    ${f.optName}: 기대=${f.expected}, 실제=${f.actual}`);
  }
  if (failures.length > 30) console.log(`  ... 외 ${failures.length - 30}건`);

  const fs = require('fs');
  fs.writeFileSync('scripts/verify-option-report.json', JSON.stringify({
    summary: {
      categories: withBuyOpts.length,
      totalTested, totalSkipped,
      failures: failures.length,
      passRate: ((1 - failures.length / Math.max(1, totalTested)) * 100).toFixed(2) + '%',
      elapsed,
    },
    byReason: Object.fromEntries(byReason),
    failures: failures.slice(0, 500),
  }, null, 2));
  console.log('\n리포트: scripts/verify-option-report.json');
}

main();
