/**
 * 실제 상품 데이터로 옵션 추출 테스트
 * I:\내 드라이브의 상품 폴더에서 product.json을 읽어 추출 정확도 검증
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const BASE_DIR = 'I:\\내 드라이브';
const CAT_DETAILS = JSON.parse(readFileSync('./src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

// ═══ 폴더명 → 쿠팡 카테고리 코드 매핑 ═══
// 폴더명의 키워드로 coupang-cat-details.json에서 가장 적합한 카테고리 검색
const FOLDER_TO_CATEGORY = {};
const FOLDER_KEYWORDS = {
  '건강식품_프로바이오틱스_키즈유산균': '유산균',
  '건강식품_프로바이오틱스_성인유산균': '유산균',
  '건강식품_프로바이오틱스': '유산균',
  '건강식품_비타민_멀티비타민': '멀티비타민',
  '건강식품_비타민_비타민B': '비타민B',
  '건강식품_비타민_비타민D': '비타민D',
  '건강식품_비타민_기타비타민': '비타민',
  '건강식품_비타민': '비타민',
  '건강식품_영양제_루테인': '루테인',
  '건강식품_영양제_마그네슘': '마그네슘',
  '건강식품_다이어트': '다이어트',
  '건강식품_다이어트_가르시니아': '가르시니아',
  '건강식품_단백질보충제': '단백질',
  '건강식품_단백질보충제_단백질음료': '단백질음료',
  '건강식품_단백질보충제_단백질츄어블_정': '단백질',
  '건강식품_단백질보충제_단백질파우더': '단백질파우더',
  '건강식품_본사공식상품': '건강식품',
};

// 카테고리 자동 검색
for (const [folder, keyword] of Object.entries(FOLDER_KEYWORDS)) {
  for (const [code, cat] of Object.entries(CAT_DETAILS)) {
    if (cat.p && cat.p.includes(keyword) && cat.b && cat.b.length > 0) {
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
  const matches = [];
  let m;
  while ((m = re.exec(name)) !== null) {
    const prefix = name.slice(Math.max(0, m.index - 10), m.index);
    if (DOSAGE_PREFIX_RE.test(prefix)) continue;
    matches.push({ value: parseInt(m[1], 10), index: m.index });
  }
  if (matches.length === 0) return null;
  const reasonable = matches.filter(x => x.value <= 500);
  if (reasonable.length > 0) return reasonable[reasonable.length - 1].value;
  return matches[matches.length - 1].value;
}

function extractComposite(name) {
  const result = {};
  const volumeCountMatch = name.match(/(\d+(?:\.\d+)?)\s*(ml|mL|ML|㎖)\s*[xX×]\s*(\d+)\s*(개|입|팩|봉|병|통|EA|ea)?/i);
  if (volumeCountMatch) {
    result.volume = { value: parseFloat(volumeCountMatch[1]), unit: 'ml' };
    result.count = parseInt(volumeCountMatch[3], 10);
  }
  const weightCountMatch = name.match(/(\d+(?:\.\d+)?)\s*(g|kg|KG|㎏)\s*[xX×]\s*(\d+)\s*(개|입|팩|봉|병|통|EA|ea)?/i);
  if (weightCountMatch) {
    let wVal = parseFloat(weightCountMatch[1]);
    if (/kg/i.test(weightCountMatch[2])) wVal *= 1000;
    result.weight = { value: wVal, unit: 'g' };
    result.count = parseInt(weightCountMatch[3], 10);
  }
  const sheetPackMatch = name.match(/(\d+)\s*(매|장|매입)\s*[xX×]\s*(\d+)\s*(팩|개|입|봉|통)/i);
  if (sheetPackMatch) {
    result.perCount = parseInt(sheetPackMatch[1], 10);
    result.count = parseInt(sheetPackMatch[3], 10);
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
    ? /(\d+)\s*(개(?!입|월)|팩|세트|박스|봉|병|통|족|켤레|롤|EA|ea|P)(?!\s*[xX×])/gi
    : /(\d+)\s*(개(?!입|월)|팩|세트|박스|봉|병|통|족|켤레|롤|포(?!기)|EA|ea|P)(?!\s*[xX×])/gi;
  const allMatches = [];
  let m;
  while ((m = unitPattern.exec(name)) !== null) {
    allMatches.push({ value: parseInt(m[1], 10), unit: m[2] });
  }
  if (allMatches.length > 0) {
    return { value: allMatches[allMatches.length - 1].value, found: true };
  }
  const ipMatch = name.match(/(\d+)\s*입(?!\s*[xX×])/);
  if (ipMatch && !name.includes(ipMatch[1] + '개입')) {
    return { value: parseInt(ipMatch[1], 10), found: true };
  }
  if (!composite.perCount) {
    const sheetMatch = name.match(/(\d+)\s*(매|장)(?!\s*[xX×])/);
    if (sheetMatch) return { value: parseInt(sheetMatch[1], 10), found: true };
  }
  return { value: 1, found: false };
}

function extractVolumeMl(name, composite) {
  if (composite.volume) return composite.volume.value;
  const literMatch = name.match(/(\d+(?:\.\d+)?)\s*(리터|ℓ)(?!\s*[xX×])/i);
  if (literMatch) return parseFloat(literMatch[1]) * 1000;
  const lMatch = name.match(/(\d+(?:\.\d+)?)\s*L(?!\s*[xX×a-zA-Z])/);
  if (lMatch) { const val = parseFloat(lMatch[1]); if (val >= 0.1 && val <= 20) return val * 1000; }
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

// ═══ 메인: 전체 상품 스캔 + 추출 ═══

function scanProducts(baseDir) {
  const products = [];
  const categories = readdirSync(baseDir).filter(f => {
    const fp = join(baseDir, f);
    return statSync(fp).isDirectory() && f !== 'desktop.ini';
  });

  for (const catFolder of categories) {
    const catInfo = FOLDER_TO_CATEGORY[catFolder];
    if (!catInfo) {
      console.log(`  ⚠️ 카테고리 매핑 없음: ${catFolder}`);
      continue;
    }

    const catPath = join(baseDir, catFolder);
    // Recursive find product.json
    const findProducts = (dir) => {
      try {
        const items = readdirSync(dir);
        for (const item of items) {
          const fp = join(dir, item);
          try {
            if (statSync(fp).isDirectory()) {
              findProducts(fp);
            } else if (item === 'product.json') {
              try {
                const data = JSON.parse(readFileSync(fp, 'utf8'));
                products.push({
                  folder: catFolder,
                  catCode: catInfo.code,
                  catPath: catInfo.path,
                  buyOpts: catInfo.buyOpts,
                  name: data.name,
                  brand: data.brand || '',
                  price: data.price,
                  file: fp,
                });
              } catch (e) { /* skip invalid json */ }
            }
          } catch (e) { /* skip access errors */ }
        }
      } catch (e) { /* skip access errors */ }
    };
    findProducts(catPath);
  }
  return products;
}

console.log('='.repeat(70));
console.log('실제 상품 데이터 옵션 추출 테스트');
console.log('기준: I:\\내 드라이브');
console.log('='.repeat(70));

console.log('\n카테고리 매핑:');
for (const [folder, info] of Object.entries(FOLDER_TO_CATEGORY)) {
  console.log(`  ${folder} → ${info.code} (${info.path})`);
}

console.log('\n상품 스캔 중...');
const products = scanProducts(BASE_DIR);
console.log(`총 ${products.length}개 상품 발견\n`);

// ═══ 추출 실행 ═══
const results = {
  total: 0,
  extracted: 0,       // 택1 옵션 추출 성공
  fallback: 0,        // 택1 fallback "1" 사용
  countFound: 0,      // 수량 실제 추출
  countDefault: 0,    // 수량 기본값 1
  issues: [],         // 의심스러운 결과
};

for (const prod of products) {
  results.total++;
  const name = prod.name;
  const composite = extractComposite(name);

  // 택1 옵션 (캡슐/정, 용량, 중량)
  const choose1Opts = prod.buyOpts.filter(o => o.c1);
  const hasTabletOpt = prod.buyOpts.some(o => {
    const n = normalizeOptionName(o.n);
    return n.includes('캡슐') || n.includes('정');
  });

  let choose1Value = null;
  let choose1Name = null;
  let tabletFromSachet = false;

  for (const opt of choose1Opts) {
    if (choose1Value) break;
    const n = normalizeOptionName(opt.n);
    const unit = opt.u;

    if (n.includes('용량') && unit === 'ml') {
      const ml = extractVolumeMl(name, composite);
      if (ml !== null) { choose1Value = ml; choose1Name = n + '(ml)'; }
    } else if (n.includes('캡슐') || n.includes('정')) {
      const tablet = extractTabletCount(name);
      if (tablet !== null) {
        choose1Value = tablet; choose1Name = n + '(정)';
      } else {
        const sachet = extractSachetCount(name);
        if (sachet !== null) {
          choose1Value = sachet; choose1Name = n + '(포→정)';
          tabletFromSachet = true;
        }
      }
    } else if (n.includes('중량') && unit === 'g') {
      const g = extractWeightG(name, composite);
      if (g !== null) { choose1Value = g; choose1Name = n + '(g)'; }
    }
  }

  // 수량
  const countResult = extractCountRaw(name, composite, hasTabletOpt);

  // Step 1.5 곱셈 (non-sachet)
  let finalTablet = choose1Value;
  let finalCount = countResult.value;
  if (choose1Value && !tabletFromSachet && countResult.value > 1 && choose1Name && choose1Name.includes('정')) {
    finalTablet = choose1Value * countResult.value;
    finalCount = 1;
  }

  if (choose1Value) {
    results.extracted++;
  } else {
    results.fallback++;
  }
  if (countResult.found) {
    results.countFound++;
  } else {
    results.countDefault++;
  }

  // 의심스러운 케이스 감지
  const issues = [];

  // 1. 택1 추출 실패 (fallback "1")
  if (!choose1Value && choose1Opts.length > 0) {
    issues.push('택1 추출 실패 → fallback "1"');
  }

  // 2. 수량 기본값 사용인데 상품명에 숫자+수량단위 패턴 있을 수 있음
  if (!countResult.found) {
    // 포가 수량에서 제외되어서 못 잡힌 건지 확인
    const countWithSachet = extractCountRaw(name, composite, false);
    if (countWithSachet.found && countWithSachet.value > 1) {
      issues.push(`수량=${countWithSachet.value} 있지만 excludeSachet으로 놓침`);
    }
  }

  // 3. 정/캡슐 값이 비정상적으로 크거나 작음
  if (finalTablet && (finalTablet > 1000 || finalTablet < 1)) {
    issues.push(`비정상 정/캡슐 수: ${finalTablet}`);
  }

  // 4. 상품명에 "포"가 있는데 sachet 추출 실패
  if (name.match(/\d+\s*포/) && !tabletFromSachet && !choose1Value) {
    issues.push('상품명에 "포" 있지만 추출 실패');
  }

  // 5. mg 값이 중량으로 오인될 수 있는 경우
  if (choose1Name && choose1Name.includes('g') && name.match(/\d+mg/)) {
    const gVal = extractWeightG(name, composite);
    if (gVal && gVal < 10) {
      issues.push(`중량 ${gVal}g — mg 성분함량 오인 가능`);
    }
  }

  if (issues.length > 0) {
    results.issues.push({
      name: name.slice(0, 80),
      folder: prod.folder,
      choose1: choose1Value ? `${choose1Name}=${finalTablet}` : 'FAIL',
      count: `${finalCount}${countResult.found ? '' : '(기본)'}`,
      issues,
    });
  }
}

// ═══ 결과 출력 ═══
console.log('='.repeat(70));
console.log('결과 요약');
console.log('='.repeat(70));
console.log(`총 상품:           ${results.total}`);
console.log(`택1 추출 성공:     ${results.extracted} (${(results.extracted/results.total*100).toFixed(1)}%)`);
console.log(`택1 fallback "1":  ${results.fallback} (${(results.fallback/results.total*100).toFixed(1)}%)`);
console.log(`수량 실제 추출:    ${results.countFound} (${(results.countFound/results.total*100).toFixed(1)}%)`);
console.log(`수량 기본값(1):    ${results.countDefault} (${(results.countDefault/results.total*100).toFixed(1)}%)`);

if (results.issues.length > 0) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`문제 감지: ${results.issues.length}건`);
  console.log('='.repeat(70));

  // 이슈 유형별 그룹핑
  const issueTypes = {};
  for (const item of results.issues) {
    for (const issue of item.issues) {
      if (!issueTypes[issue]) issueTypes[issue] = [];
      issueTypes[issue].push(item);
    }
  }

  for (const [type, items] of Object.entries(issueTypes).sort((a,b) => b[1].length - a[1].length)) {
    console.log(`\n--- ${type} (${items.length}건) ---`);
    for (const item of items.slice(0, 10)) {
      console.log(`  [${item.folder.replace('건강식품_', '')}] ${item.name}`);
      console.log(`    → choose1: ${item.choose1}, 수량: ${item.count}`);
    }
    if (items.length > 10) {
      console.log(`  ... 외 ${items.length - 10}건`);
    }
  }
} else {
  console.log('\n문제 없음!');
}

// 택1 추출 실패 상품 전부 출력
if (results.fallback > 0) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`택1 추출 실패 상품 전체 (${results.fallback}건)`);
  console.log('='.repeat(70));
  const failItems = results.issues.filter(i => i.choose1 === 'FAIL');
  for (const item of failItems) {
    console.log(`  ${item.name}`);
    console.log(`    → 수량: ${item.count}`);
  }
}
