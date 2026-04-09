/**
 * 수정 후 검증: sourceName과 displayName이 다른 경우
 * extractCountRaw를 사용하여 Layer 1.5가 수량을 올바르게 override하는지 확인
 */
import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('./src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

// 유산균 카테고리 찾기
const probioticsCategories = [];
for (const [code, cat] of Object.entries(data)) {
  if (cat.p && cat.p.includes('유산균')) {
    probioticsCategories.push({ code, path: cat.p, buyOpts: cat.b });
  }
}
console.log('유산균 카테고리:', probioticsCategories.length + '개');
if (probioticsCategories.length > 0) {
  const sample = probioticsCategories[0];
  console.log('  예시:', sample.code, sample.path);
  console.log('  buyOptions:');
  for (const opt of (sample.buyOpts || [])) {
    console.log('    -', opt.n, opt.u ? '(' + opt.u + ')' : '', opt.r ? '[필수]' : '', opt.c1 ? '[택1]' : '');
  }
}

console.log('\n=== 시뮬레이션: sourceName ≠ displayName ===\n');

const testCases = [
  {
    desc: '상품1: 30포 3개 (sourceName에 스펙 없음)',
    sourceName: 'YQ-PRO-10 益生菌 肠道健康 免疫PLUS',
    displayName: '프로바이오틱스 생유산균 장내세균 면역플러스 키즈유산균 락피도 아연 비타민d 30포 3개',
    expected: { tablet: '30', count: '3' },
  },
  {
    desc: '상품2: 50포 1개 (sourceName에 스펙 없음)',
    sourceName: 'YQ-LGG-50P 益生菌 特别配合',
    displayName: '유익균 장건강유산균 프로바이오틱스 장내미생을 특별한 배합 키즈 어린이유산균 50포, 1개',
    expected: { tablet: '50', count: '1' },
  },
  {
    desc: '상품3: 60정 2통 (sourceName에 스펙 있음)',
    sourceName: '루테인 오메가3 비타민D 60정 2통',
    displayName: '루테인 오메가3 비타민D 60정 2통 세트',
    expected: { tablet: '120', count: '1' },  // 60×2 곱셈
  },
  {
    desc: '상품4: sourceName에만 스펙 있고 displayName에 없음',
    sourceName: '프로바이오틱스 유산균 30포 3개',
    displayName: '프로바이오틱스 유산균 프리미엄',
    expected: { tablet: '30', count: '3' },
  },
  {
    desc: '상품5: 500ml 3개 (용량 + 수량)',
    sourceName: 'XYZ-TONER-500',
    displayName: '히알루론산 토너 500ml 3개',
    expected: { volume: '500', count: '3' },
  },
];

// 실제 extractOptionsEnhanced를 호출하려면 TypeScript 모듈이 필요하므로
// 여기서는 로직만 시뮬레이션

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
    allMatches.push({ value: parseInt(m[1], 10) });
  }
  if (allMatches.length > 0) {
    return { value: allMatches[allMatches.length - 1].value, found: true };
  }
  return { value: 1, found: false };
}

function extractVolumeMl(name, composite) {
  if (composite.volume) return composite.volume.value;
  const mlMatch = name.match(/(\d+(?:\.\d+)?)\s*(ml|mL|ML|㎖)(?!\s*[xX×])/i);
  if (mlMatch) return parseFloat(mlMatch[1]);
  return null;
}

let allPassed = true;

for (const tc of testCases) {
  console.log('---', tc.desc);
  const { sourceName, displayName, expected } = tc;

  // Simulate Layer 1 on sourceName
  const srcComposite = extractComposite(sourceName);
  const hasTabletOpt = true;

  let tabletValue = null;
  let tabletFromSachet = false;
  const srcTablet = extractTabletCount(sourceName);
  if (srcTablet !== null) {
    tabletValue = srcTablet;
  } else {
    const srcSachet = extractSachetCount(sourceName);
    if (srcSachet !== null) {
      tabletValue = srcSachet;
      tabletFromSachet = true;
    }
  }

  // 수량: extractCountRaw (NEW — found=false면 설정 안 함)
  const srcCountResult = extractCountRaw(sourceName, srcComposite, hasTabletOpt);
  let countSet = srcCountResult.found;
  let countValue = srcCountResult.found ? srcCountResult.value : null;

  // 용량
  let volumeValue = extractVolumeMl(sourceName, srcComposite);

  console.log('  Layer 1 (sourceName):');
  console.log('    tablet:', tabletValue, tabletFromSachet ? '(sachet)' : '');
  console.log('    count:', countValue, countSet ? '(found)' : '(NOT SET → Layer 1.5 시도)');
  console.log('    volume:', volumeValue);

  // Layer 1.5 on displayName
  if (displayName && displayName !== sourceName) {
    const dnComposite = extractComposite(displayName);

    // tablet/sachet fallback
    if (tabletValue === null) {
      const dnTablet = extractTabletCount(displayName);
      if (dnTablet !== null) {
        tabletValue = dnTablet;
      } else {
        const dnSachet = extractSachetCount(displayName);
        if (dnSachet !== null) {
          tabletValue = dnSachet;
          tabletFromSachet = true;
        }
      }
    }

    // count fallback (NEW — only if Layer 1 didn't find)
    if (!countSet) {
      const dnCountResult = extractCountRaw(displayName, dnComposite, hasTabletOpt);
      if (dnCountResult.found) {
        countValue = dnCountResult.value;
        countSet = true;
      }
    }

    // volume fallback
    if (volumeValue === null) {
      volumeValue = extractVolumeMl(displayName, dnComposite);
    }

    console.log('  Layer 1.5 (displayName):');
    console.log('    tablet:', tabletValue, tabletFromSachet ? '(sachet)' : '');
    console.log('    count:', countValue, countSet ? '(found)' : '(NOT SET)');
    console.log('    volume:', volumeValue);
  }

  // Default count
  if (!countSet) countValue = 1;

  // Step 1.5 multiplication (non-sachet only)
  if (tabletValue && !tabletFromSachet && countValue > 1) {
    const total = tabletValue * countValue;
    console.log('  Step 1.5: ' + tabletValue + ' × ' + countValue + ' = ' + total + '정, 수량=1');
    tabletValue = total;
    countValue = 1;
  }

  // Verify
  const actual = {};
  if (tabletValue) actual.tablet = String(tabletValue);
  if (countValue) actual.count = String(countValue);
  if (volumeValue) actual.volume = String(volumeValue);

  const pass = Object.keys(expected).every(k => actual[k] === expected[k]);
  console.log('  결과:', JSON.stringify(actual));
  console.log('  기대:', JSON.stringify(expected));
  console.log('  판정:', pass ? 'PASS' : 'FAIL');
  if (!pass) allPassed = false;
  console.log();
}

console.log('='.repeat(50));
console.log(allPassed ? 'ALL PASSED' : 'SOME FAILED');
