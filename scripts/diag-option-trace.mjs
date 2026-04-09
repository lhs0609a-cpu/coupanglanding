// 두 상품명에 대해 option extraction 흐름 시뮬레이션
const names = [
  '프로바이오틱스 생유산균 장내세균 면역플러스 키즈유산균 락피도 아연 비타민d 30포 3개',
  '유익균 장건강유산균 프로바이오틱스 장내미생을 특별한 배합 키즈 어린이유산균 50포, 1개',
];

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

function extractCount(name, excludeSachet = false) {
  const unitPattern = excludeSachet
    ? /(\d+)\s*(개(?!입|월)|팩|세트|박스|봉|병|통|족|켤레|롤|EA|ea|P)(?!\s*[xX×])/gi
    : /(\d+)\s*(개(?!입|월)|팩|세트|박스|봉|병|통|족|켤레|롤|포(?!기)|EA|ea|P)(?!\s*[xX×])/gi;
  const allMatches = [];
  let m;
  while ((m = unitPattern.exec(name)) !== null) {
    allMatches.push({ value: parseInt(m[1], 10), unit: m[2] });
  }
  if (allMatches.length > 0) {
    return { value: allMatches[allMatches.length - 1].value, found: true, all: allMatches };
  }
  return { value: 1, found: false, all: [] };
}

console.log('='.repeat(70));
console.log('포(sachet) 상품 옵션 추출 진단');
console.log('='.repeat(70));

for (const name of names) {
  console.log('\n--- 상품명: ' + name);

  const tablet = extractTabletCount(name);
  console.log('  extractTabletCount:', tablet !== null ? tablet : 'null (매칭 없음)');

  const sachet = extractSachetCount(name);
  console.log('  extractSachetCount:', sachet !== null ? sachet : 'null (매칭 없음)');

  const hasTabletOpt = true; // 유산균 카테고리에는 캡슐/정 옵션 있음
  const tabletFromSachet = tablet === null && sachet !== null;
  console.log('  tabletFromSachet:', tabletFromSachet);

  const countExcl = extractCount(name, true);
  const countIncl = extractCount(name, false);
  console.log('  extractCount(excludeSachet=true):', JSON.stringify(countExcl));
  console.log('  extractCount(excludeSachet=false):', JSON.stringify(countIncl));

  // 최종 결과 시뮬레이션
  let tabletValue = null;
  let isSachet = false;
  if (tablet !== null) {
    tabletValue = tablet;
  } else if (sachet !== null) {
    tabletValue = sachet;
    isSachet = true;
  }

  const countValue = countExcl.value;

  console.log('\n  [Layer 1 결과]');
  console.log('  개당 캡슐/정:', tabletValue !== null ? tabletValue : 'null → 택1 미충족');
  console.log('  수량:', countValue);
  console.log('  sachet 유래:', isSachet);

  // Step 1.5 곱셈 보정
  if (tabletValue && !isSachet && countValue > 1) {
    console.log('\n  [Step 1.5 곱셈 보정]');
    console.log('  ' + tabletValue + ' × ' + countValue + ' = ' + (tabletValue * countValue));
    console.log('  결과: 개당캡슐/정=' + (tabletValue * countValue) + ', 수량=1');
  } else if (isSachet) {
    console.log('\n  [Step 1.5 곱셈 보정] SKIP (sachet 유래 → 곱하지 않음)');
    console.log('  결과: 개당캡슐/정=' + tabletValue + ', 수량=' + countValue);
  } else {
    console.log('\n  [Step 1.5] 해당 없음 (tablet null 또는 count=1)');
  }
}

// --- sourceName이 다른 경우 시뮬레이션 ---
console.log('\n\n' + '='.repeat(70));
console.log('sourceName이 원본(중국어/코드명)인 경우 시뮬레이션');
console.log('='.repeat(70));

const scenarios = [
  {
    sourceName: 'YQ-PRO-10 益生菌 乳酸菌 30包3盒',
    displayName: '프로바이오틱스 생유산균 장내세균 면역플러스 키즈유산균 락피도 아연 비타민d 30포 3개',
  },
  {
    sourceName: 'YQ-LGG-50P 益生菌 50包装',
    displayName: '유익균 장건강유산균 프로바이오틱스 장내미생을 특별한 배합 키즈 어린이유산균 50포, 1개',
  },
];

for (const { sourceName, displayName } of scenarios) {
  console.log('\n--- sourceName: ' + sourceName);
  console.log('    displayName: ' + displayName.slice(0, 50) + '...');

  // Layer 1 on sourceName
  const tablet = extractTabletCount(sourceName);
  const sachet = tablet === null ? extractSachetCount(sourceName) : null;
  const count = extractCount(sourceName, tablet !== null || sachet !== null);

  console.log('  [Layer 1 on sourceName]');
  console.log('  tablet:', tablet);
  console.log('  sachet:', sachet);
  console.log('  count:', count.value, count.found ? '(found)' : '(DEFAULT)');

  let tabletValue = tablet !== null ? tablet : (sachet !== null ? sachet : null);

  // Layer 1.5 on displayName (only if layer1 didn't set)
  console.log('\n  [Layer 1.5 on displayName]');
  const hasCountAlready = true; // extractCount ALWAYS returns a value
  console.log('  수량 already set by Layer 1 → SKIP displayName count');

  if (tabletValue === null) {
    const dnTablet = extractTabletCount(displayName);
    const dnSachet = dnTablet === null ? extractSachetCount(displayName) : null;
    console.log('  displayName tablet:', dnTablet);
    console.log('  displayName sachet:', dnSachet);
    tabletValue = dnTablet !== null ? dnTablet : (dnSachet !== null ? dnSachet : null);
    if (tabletValue !== null) {
      console.log('  → 캡슐/정 값 displayName에서 복구: ' + tabletValue);
    }
  } else {
    console.log('  캡슐/정 already set by Layer 1 → SKIP');
  }

  console.log('\n  [최종 결과]');
  if (tabletValue !== null) {
    console.log('  개당캡슐/정: ' + tabletValue);
  } else {
    console.log('  개당캡슐/정: null → 택1 fallback "1"');
  }
  console.log('  수량: ' + count.value + (count.found ? '' : ' (⚠️ default — displayName의 실제 수량 무시됨!)'));
}

console.log('\n\n' + '='.repeat(70));
console.log('핵심 버그 요약');
console.log('='.repeat(70));
console.log(`
1. extractCount()가 항상 기본값 1을 반환 → Layer 1에서 수량이 항상 설정됨
   → Layer 1.5에서 displayName의 실제 수량을 사용할 수 없음!
   예: sourceName에 수량 없음 → count=1(기본) → displayName "3개" 무시

2. sourceName에 한국어 스펙이 없으면 Layer 1에서 캡슐/정 추출 실패
   → Layer 1.5에서 displayName으로 복구 가능하지만, 수량은 복구 불가

3. 두 버그의 조합:
   sourceName: "YQ-PRO-10..." → tablet=null, count=1(기본)
   displayName: "...30포 3개"  → tablet=30(sachet), count=SKIP(이미 1)
   최종: 30정, 1개 (실제 기대: 30포, 3개)
`);
