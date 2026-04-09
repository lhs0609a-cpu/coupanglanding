/**
 * 실제 상품 데이터 옵션 추출 테스트 (고속 버전)
 * Google Drive에서 각 카테고리당 첫 번째 batch의 상품만 샘플링
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const BASE_DIR = 'I:\\내 드라이브';
const CAT_DETAILS = JSON.parse(readFileSync('./src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

// ═══ 폴더명 → 쿠팡 카테고리 코드 매핑 ═══
const FOLDER_KEYWORDS = {
  '건강식품_프로바이오틱스_키즈유산균': ['유산균', '식품>건강식품'],
  '건강식품_프로바이오틱스_성인유산균': ['유산균', '식품>건강식품'],
  '건강식품_프로바이오틱스': ['유산균', '식품>건강식품'],
  '건강식품_비타민_멀티비타민': ['멀티비타민', '식품>건강식품'],
  '건강식품_비타민_비타민B': ['비타민B', '식품>건강식품'],
  '건강식품_비타민_비타민D': ['비타민D', '식품>건강식품'],
  '건강식품_비타민_기타비타민': ['비타민', '식품>건강식품'],
  '건강식품_비타민': ['비타민', '식품>건강식품'],
  '건강식품_영양제_루테인': ['루테인', '식품>건강식품'],
  '건강식품_영양제_마그네슘': ['마그네슘', '식품>건강식품'],
  '건강식품_다이어트': ['다이어트식품', '식품>건강식품'],
  '건강식품_다이어트_가르시니아': ['가르시니아', '식품>건강식품'],
  '건강식품_단백질보충제': ['단백질', '식품>건강식품'],
  '건강식품_단백질보충제_단백질음료': ['단백질음료', '식품>건강식품'],
  '건강식품_단백질보충제_단백질츄어블_정': ['단백질', '식품>건강식품'],
  '건강식품_단백질보충제_단백질파우더': ['단백질파우더', '식품>건강식품'],
  '건강식품_본사공식상품': ['홍삼', '식품>건강식품'],
};

const FOLDER_TO_CATEGORY = {};
for (const [folder, [keyword, pathPrefix]] of Object.entries(FOLDER_KEYWORDS)) {
  for (const [code, cat] of Object.entries(CAT_DETAILS)) {
    if (cat.p && cat.p.includes(keyword) && cat.p.startsWith(pathPrefix) && cat.b && cat.b.length > 0) {
      FOLDER_TO_CATEGORY[folder] = { code, path: cat.p, buyOpts: cat.b };
      break;
    }
  }
}

// ═══ 추출 로직 (option-extractor.ts 시뮬레이션) ═══
const TABLET_RE = /(\d+)\s*(정|캡슐|알|타블렛|소프트젤)/g;
const SACHET_RE = /(\d+)\s*포(?!기|인)/g;
const DOSAGE_PREFIX_RE = /(?:1일|하루|매일|일일)\s*$/;

function extractTabletCount(name) {
  const re = new RegExp(TABLET_RE.source, 'g');
  const matches = [];
  let m;
  while ((m = re.exec(name)) !== null) {
    const prefix = name.slice(Math.max(0, m.index - 10), m.index);
    if (DOSAGE_PREFIX_RE.test(prefix)) continue;
    const postfix = name.slice(m.index + m[0].length, m.index + m[0].length + 15);
    if (/^\s*[xX×]\s*\d+\s*(?:일|회)/.test(postfix)) continue;
    const dosePrefix2 = name.slice(Math.max(0, m.index - 8), m.index);
    if (/\d+\s*회\s*$/.test(dosePrefix2)) continue;
    matches.push({ value: parseInt(m[1], 10), index: m.index });
  }
  if (matches.length === 0) return null;
  const reasonable = matches.filter(x => x.value <= 500);
  if (reasonable.length > 0) return reasonable[reasonable.length - 1].value;
  return matches[matches.length - 1].value;
}

function extractSachetCount(name) {
  const re = new RegExp(SACHET_RE.source, 'g');
  const COMPOSITE_BEFORE_RE = /[xX×]\s*$/;
  const COMPOSITE_AFTER_RE = /^\s*[xX×]/;
  const matches = [];
  let m;
  while ((m = re.exec(name)) !== null) {
    const prefix = name.slice(Math.max(0, m.index - 10), m.index);
    if (DOSAGE_PREFIX_RE.test(prefix)) continue;
    // "Ng × 10포" — × 뒤 sachet은 포장 분해 → 제외
    if (COMPOSITE_BEFORE_RE.test(prefix)) continue;
    // "10포 × 3EA" — × 앞 sachet은 포장 분해 → 제외
    const postfix = name.slice(m.index + m[0].length, m.index + m[0].length + 10);
    if (COMPOSITE_AFTER_RE.test(postfix)) continue;
    matches.push({ value: parseInt(m[1], 10), index: m.index });
  }
  if (matches.length === 0) return null;
  const reasonable = matches.filter(x => x.value <= 500);
  if (reasonable.length > 0) return reasonable[reasonable.length - 1].value;
  return matches[matches.length - 1].value;
}

function extractComposite(name) {
  const result = {};
  const DOSE_AFTER = /^(?:포(?!기|인)|정|캡슐|알|타블렛|소프트젤)/;

  const vm = name.match(/(\d+(?:\.\d+)?)\s*(ml|mL|ML|㎖)\s*[xX×]\s*(\d+)/i);
  if (vm) {
    result.volume = { value: parseFloat(vm[1]), unit: 'ml' };
    const after = name.slice(vm.index + vm[0].length).trimStart();
    if (!DOSE_AFTER.test(after)) {
      result.count = parseInt(vm[3], 10);
    }
  }
  const wm = name.match(/(\d+(?:\.\d+)?)\s*(g|kg|KG|㎏)\s*[xX×]\s*(\d+)/i);
  if (wm) {
    let wVal = parseFloat(wm[1]);
    if (/kg/i.test(wm[2])) wVal *= 1000;
    result.weight = { value: wVal, unit: 'g' };
    const after = name.slice(wm.index + wm[0].length).trimStart();
    if (!DOSE_AFTER.test(after)) {
      result.count = parseInt(wm[3], 10);
    }
  }
  const plusMatch = name.match(/(\d+)\s*\+\s*(\d+)(?!\s*(?:ml|g|kg|mg|l|정|캡슐))/i);
  if (plusMatch && !result.count) {
    result.count = parseInt(plusMatch[1], 10) + parseInt(plusMatch[2], 10);
  }
  return result;
}

function extractCountRaw(name, composite, excludeSachet = false) {
  if (composite.count) return { value: composite.count, found: true };
  const unitPattern = excludeSachet
    ? /(\d+)\s*(개(?!입|월)|팩|세트|박스|봉|병|통|족|켤레|롤|EA|ea)(?!\s*[xX×])/gi
    : /(\d+)\s*(개(?!입|월)|팩|세트|박스|봉|병|통|족|켤레|롤|포(?!기)|EA|ea)(?!\s*[xX×])/gi;
  const allMatches = [];
  let m;
  while ((m = unitPattern.exec(name)) !== null) {
    allMatches.push({ value: parseInt(m[1], 10), unit: m[2] });
  }
  if (allMatches.length > 0) {
    return { value: allMatches[allMatches.length - 1].value, found: true };
  }
  return { value: 1, found: false };
}

function extractVolumeMl(name, composite) {
  if (composite.volume) return composite.volume.value;
  const literMatch = name.match(/(\d+(?:\.\d+)?)\s*(리터|ℓ)(?!\s*[xX×])/i);
  if (literMatch) return parseFloat(literMatch[1]) * 1000;
  const mlMatch = name.match(/(\d+(?:\.\d+)?)\s*(ml|mL|ML|㎖)(?!\s*[xX×])/i);
  if (mlMatch) return parseFloat(mlMatch[1]);
  return null;
}

function extractWeightG(name, composite) {
  if (composite.weight) return composite.weight.value;
  const kgMatch = name.match(/(\d+(?:\.\d+)?)\s*(kg|KG|㎏)(?!\s*[xX×])/i);
  if (kgMatch) return parseFloat(kgMatch[1]) * 1000;
  const gMatch = name.match(/(?<![mkμ])(\d+(?:\.\d+)?)\s*(g|그램)(?!\s*[xX×])/i);
  if (gMatch) return parseFloat(gMatch[1]);
  return null;
}

function normalizeOptionName(name) {
  let n = name.replace(/\(택\d+\)\s*/g, '').trim();
  if (n === '총 수량') n = '수량';
  return n;
}

// ═══ 빠른 상품 스캔 (각 카테고리에서 첫 date/batch만) ═══
function scanProductsFast(baseDir) {
  const products = [];
  let skipped = 0;

  const categories = readdirSync(baseDir).filter(f => {
    try { return statSync(join(baseDir, f)).isDirectory() && f !== 'desktop.ini'; }
    catch { return false; }
  });

  for (const catFolder of categories) {
    const catInfo = FOLDER_TO_CATEGORY[catFolder];
    if (!catInfo) {
      console.log(`  ⚠️ 매핑 없음: ${catFolder}`);
      skipped++;
      continue;
    }

    const catPath = join(baseDir, catFolder);
    // 첫 번째 날짜 폴더
    let dateDirs;
    try { dateDirs = readdirSync(catPath).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f)); }
    catch { continue; }
    if (dateDirs.length === 0) continue;

    // 모든 날짜 폴더 순회
    for (const dateDir of dateDirs) {
      const datePath = join(catPath, dateDir);
      let batchDirs;
      try { batchDirs = readdirSync(datePath).filter(f => f.startsWith('50-')); }
      catch { continue; }

      // 첫 2개 batch만
      for (const batchDir of batchDirs.slice(0, 2)) {
        const batchPath = join(datePath, batchDir);
        let productDirs;
        try { productDirs = readdirSync(batchPath).filter(f => f.startsWith('product_')); }
        catch { continue; }

        for (const prodDir of productDirs) {
          const jsonPath = join(batchPath, prodDir, 'product.json');
          try {
            if (!existsSync(jsonPath)) continue;
            const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
            products.push({
              folder: catFolder,
              catCode: catInfo.code,
              catPath: catInfo.path,
              buyOpts: catInfo.buyOpts,
              name: data.name,
              brand: data.brand || '',
              price: data.price,
            });
          } catch { /* skip */ }
        }
      }
    }
    console.log(`  ${catFolder}: ${products.length}개 (누적)`);
  }
  return { products, skipped };
}

console.log('='.repeat(70));
console.log('실제 상품 데이터 옵션 추출 테스트 (고속)');
console.log('='.repeat(70));

console.log('\n상품 스캔 중...');
const { products, skipped } = scanProductsFast(BASE_DIR);
console.log(`\n총 ${products.length}개 상품 로드 (매핑 실패 ${skipped}개 폴더)\n`);

// ═══ 추출 + 분석 ═══
const stats = {
  total: 0,
  choose1_extracted: 0,
  choose1_fallback: 0,
  count_found: 0,
  count_default: 0,
  sachet_used: 0,
  tablet_used: 0,
  volume_used: 0,
  weight_used: 0,
};
const issues = [];
const sampleResults = [];

for (const prod of products) {
  stats.total++;
  const name = prod.name;
  const composite = extractComposite(name);
  const choose1Opts = prod.buyOpts.filter(o => o.c1);
  const hasTabletOpt = prod.buyOpts.some(o => {
    const n = normalizeOptionName(o.n);
    return n.includes('캡슐') || n.includes('정');
  });

  let choose1Value = null;
  let choose1Name = null;
  let tabletFromSachet = false;
  let choose1Source = '';

  // 택1 우선순위: 용량 > 캡슐/정 > 중량
  const priority = ['용량', '캡슐', '정', '중량', '수량'];
  const sorted = [...choose1Opts].sort((a, b) => {
    const rawA = priority.findIndex(p => normalizeOptionName(a.n).includes(p));
    const rawB = priority.findIndex(p => normalizeOptionName(b.n).includes(p));
    return (rawA === -1 ? 99 : rawA) - (rawB === -1 ? 99 : rawB);
  });

  for (const opt of sorted) {
    if (choose1Value !== null) break;
    const n = normalizeOptionName(opt.n);
    const unit = opt.u;

    if (n.includes('용량') && unit === 'ml') {
      const ml = extractVolumeMl(name, composite);
      if (ml !== null) { choose1Value = ml; choose1Name = `${n}(ml)`; choose1Source = 'volume'; stats.volume_used++; }
    } else if (n.includes('캡슐') || n.includes('정')) {
      const tablet = extractTabletCount(name);
      if (tablet !== null) {
        choose1Value = tablet; choose1Name = `${n}(정)`; choose1Source = 'tablet'; stats.tablet_used++;
      } else {
        const sachet = extractSachetCount(name);
        if (sachet !== null) {
          choose1Value = sachet; choose1Name = `${n}(포→정)`; choose1Source = 'sachet';
          tabletFromSachet = true; stats.sachet_used++;
        }
      }
    } else if (n.includes('중량') && unit === 'g') {
      const g = extractWeightG(name, composite);
      if (g !== null) { choose1Value = g; choose1Name = `${n}(g)`; choose1Source = 'weight'; stats.weight_used++; }
    }
  }

  // 수량
  const countResult = extractCountRaw(name, composite, hasTabletOpt);
  let finalTablet = choose1Value;
  let finalCount = countResult.value;

  // Step 1.5 곱셈 (정/캡슐 + 수량, sachet 제외)
  if (choose1Value && !tabletFromSachet && countResult.value > 1 && choose1Source === 'tablet') {
    finalTablet = choose1Value * countResult.value;
    finalCount = 1;
  }

  if (choose1Value !== null) stats.choose1_extracted++;
  else stats.choose1_fallback++;
  if (countResult.found) stats.count_found++;
  else stats.count_default++;

  // 이슈 감지
  const prodIssues = [];

  if (!choose1Value && choose1Opts.length > 0) {
    prodIssues.push('택1 추출 실패');
  }
  if (finalTablet !== null && finalTablet > 500) {
    prodIssues.push(`정/캡슐 ${finalTablet} (비정상 고값)`);
  }
  if (name.match(/\d+\s*포/) && !tabletFromSachet && choose1Source !== 'tablet' && choose1Source !== 'volume' && choose1Source !== 'weight') {
    prodIssues.push('포 패턴 있지만 미추출');
  }

  if (prodIssues.length > 0) {
    issues.push({
      name: name.slice(0, 100),
      folder: prod.folder.replace('건강식품_', ''),
      choose1: choose1Value !== null ? `${choose1Name}=${finalTablet}` : 'FAIL→1',
      count: `${finalCount}${countResult.found ? '' : '(기본)'}`,
      issues: prodIssues,
    });
  }

  // 샘플 (카테고리별 첫 3개)
  const catSamples = sampleResults.filter(s => s.folder === prod.folder);
  if (catSamples.length < 3) {
    sampleResults.push({
      folder: prod.folder.replace('건강식품_', ''),
      name: name.slice(0, 70),
      choose1: choose1Value !== null ? `${choose1Name}=${finalTablet}` : 'FAIL→1',
      count: `수량=${finalCount}${countResult.found ? '' : '(기본)'}`,
    });
  }
}

// ═══ 결과 출력 ═══
console.log('='.repeat(70));
console.log('결과 요약');
console.log('='.repeat(70));
console.log(`총 상품:           ${stats.total}`);
console.log(`택1 추출 성공:     ${stats.choose1_extracted} (${(stats.choose1_extracted/stats.total*100).toFixed(1)}%)`);
console.log(`택1 추출 실패:     ${stats.choose1_fallback} (${(stats.choose1_fallback/stats.total*100).toFixed(1)}%)`);
console.log(`수량 실제 추출:    ${stats.count_found} (${(stats.count_found/stats.total*100).toFixed(1)}%)`);
console.log(`수량 기본값:       ${stats.count_default} (${(stats.count_default/stats.total*100).toFixed(1)}%)`);
console.log();
console.log('택1 추출 소스 분포:');
console.log(`  정/캡슐:  ${stats.tablet_used}`);
console.log(`  포→정:    ${stats.sachet_used}`);
console.log(`  용량(ml): ${stats.volume_used}`);
console.log(`  중량(g):  ${stats.weight_used}`);

console.log(`\n${'='.repeat(70)}`);
console.log('카테고리별 샘플 결과');
console.log('='.repeat(70));
let lastFolder = '';
for (const s of sampleResults) {
  if (s.folder !== lastFolder) {
    console.log(`\n[${s.folder}]`);
    lastFolder = s.folder;
  }
  console.log(`  ${s.name}`);
  console.log(`    → ${s.choose1}, ${s.count}`);
}

if (issues.length > 0) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`문제 감지: ${issues.length}건 / ${stats.total}건`);
  console.log('='.repeat(70));

  // 이슈 유형별 그룹핑
  const issueTypes = {};
  for (const item of issues) {
    for (const issue of item.issues) {
      if (!issueTypes[issue]) issueTypes[issue] = [];
      issueTypes[issue].push(item);
    }
  }

  for (const [type, items] of Object.entries(issueTypes).sort((a,b) => b[1].length - a[1].length)) {
    console.log(`\n--- ${type} (${items.length}건) ---`);
    for (const item of items.slice(0, 15)) {
      console.log(`  [${item.folder}] ${item.name}`);
      console.log(`    → ${item.choose1}, 수량=${item.count}`);
    }
    if (items.length > 15) console.log(`  ... 외 ${items.length - 15}건`);
  }
} else {
  console.log('\n문제 없음!');
}

// 실패율 최종
const failRate = stats.choose1_fallback / stats.total * 100;
console.log(`\n${'='.repeat(70)}`);
console.log(`최종 판정: 택1 추출 성공률 ${(100 - failRate).toFixed(1)}%`);
if (failRate > 5) {
  console.log('⚠️ 5% 초과 실패 — 개선 필요');
} else if (failRate > 0) {
  console.log('⚠️ 소수 실패 존재 — 검토 필요');
} else {
  console.log('✅ 100% 성공');
}
console.log('='.repeat(70));
