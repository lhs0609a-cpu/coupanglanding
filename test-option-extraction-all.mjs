/**
 * 전체 16,259 카테고리 옵션 추출 검증 테스트
 *
 * 각 카테고리별로 현실적인 상품명을 자동 생성 → 옵션 추출 → 검증
 */
import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('./src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

// ─── option-extractor 로직 복제 (ESM에서 직접 import 불가하므로) ───

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

function extractCount(name, composite) {
  if (composite.count) return composite.count;
  const match = name.match(/(\d+)\s*(개(?!입|월)|팩|세트|박스|봉|병|통|족|켤레|롤|포(?!기)|EA|ea|P)(?!\s*[xX×])/i);
  if (match) return parseInt(match[1], 10);
  const ipMatch = name.match(/(\d+)\s*입(?!\s*[xX×])/);
  if (ipMatch && !name.includes(ipMatch[1] + '개입')) return parseInt(ipMatch[1], 10);
  if (!composite.perCount) {
    const sheetMatch = name.match(/(\d+)\s*(매|장)(?!\s*[xX×])/);
    if (sheetMatch) return parseInt(sheetMatch[1], 10);
  }
  return 1;
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

function extractPerCount(name, composite) {
  if (composite.perCount) return composite.perCount;
  const match = name.match(/(\d+)\s*개입/);
  if (match) return parseInt(match[1], 10);
  return null;
}

function extractTabletCount(name) {
  const match = name.match(/(\d+)\s*(정|캡슐|알|타블렛|소프트젤|포(?!기|인))/);
  if (match) return parseInt(match[1], 10);
  return null;
}

function extractSize(name) {
  const match = name.match(/\b(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL|FREE|F|프리)\b/i);
  if (match) return match[1].toUpperCase();
  const numMatch = name.match(/(?:사이즈|SIZE)\s*:?\s*(\d{2,3})/i);
  if (numMatch) return numMatch[1];
  return null;
}

const KNOWN_COLORS = new Set([
  '블랙', '화이트', '레드', '블루', '그린', '옐로우', '핑크', '퍼플', '오렌지',
  '그레이', '브라운', '네이비', '베이지', '아이보리', '민트', '카키',
  '검정', '흰색', '빨강', '파랑', '초록', '노랑', '분홍', '보라', '주황',
  '회색', '갈색', '남색', '골드', '실버', '로즈골드', '크림', '와인',
]);

function extractColor(name) {
  const sortedColors = [...KNOWN_COLORS].sort((a, b) => b.length - a.length);
  const lower = name.toLowerCase();
  for (const color of sortedColors) {
    if (lower.includes(color.toLowerCase())) return color;
  }
  return null;
}

// ─── getRequiredFallback 복제 ───
function getRequiredFallback(optionName, productName) {
  const n = optionName.toLowerCase();
  if (n.includes('색상') || n.includes('컬러') || n === '색') return extractColor(productName) || '상세페이지 참조';
  if (n.includes('모델') || n.includes('품번')) return '자체제작';
  if (n.includes('사이즈') || n.includes('크기')) return extractSize(productName) || 'FREE';
  if (n.includes('구성')) return '본품';
  if (n.includes('맛') || n.includes('향')) return '상세페이지 참조';
  if (n === '용량') return '상세페이지 참조';
  if (n.includes('중량')) return '상세페이지 참조';
  if (n.includes('길이')) return '상세페이지 참조';
  if (n.includes('차종')) return '공용';
  if (n.includes('인원')) return '상세페이지 참조';
  if (n.includes('가로') || n.includes('세로')) return '상세페이지 참조';
  if (n.includes('신발')) return '상세페이지 참조';
  if (n.includes('수량')) return '1';
  if (n.includes('단계')) return '상세페이지 참조';
  if (n.includes('원료')) return '상세페이지 참조';
  if (n.includes('ram') || n.includes('메모리') || n.includes('저장')) return '상세페이지 참조';
  if (n.includes('전구')) return '상세페이지 참조';
  if (n.includes('높이') || n.includes('두께')) return '상세페이지 참조';
  if (n.includes('수산물') || n.includes('농산물')) return '상세페이지 참조';
  if (n.includes('개당')) return '상세페이지 참조';
  return null;
}

// ─── 카테고리별 현실적 상품명 생성기 ───
function generateTestProductName(categoryPath, buyOptions) {
  const parts = [];
  const leaf = categoryPath.split('>').pop().trim();
  const top = categoryPath.split('>')[0].trim();

  // 카테고리에 따라 현실적인 상품명 생성
  if (top === '도서' || top === '도서/음반/DVD') {
    parts.push('프로그래밍 입문서');
    parts.push(leaf);
    return parts.join(' ');
  }

  // 옵션에 맞는 숫자값 삽입
  for (const opt of buyOptions) {
    const n = opt.n;
    const u = opt.u || '';

    if (n === '수량') { parts.push('3개'); }
    else if (n.includes('캡슐') || n.includes('정')) { parts.push('120정'); }
    else if (n === '개당 용량' || n === '용량' || n === '최소 용량') { parts.push('500ml'); }
    else if (n === '개당 중량' || n === '중량' || n === '최소 중량' || n.includes('농산물') || n.includes('수산물')) { parts.push('250g'); }
    else if (n === '개당 수량') { parts.push('80매입'); }
    else if (n.includes('색상') || n.includes('컬러') || n === '색') { parts.push('블랙'); }
    else if (n.includes('사이즈') || n.includes('크기')) { parts.push('FREE'); }
    else if (n.includes('신발')) { parts.push('사이즈: 260'); }
    else if (n.includes('길이')) { parts.push('1.5m'); }
    else if (n.includes('높이')) { parts.push('높이 30cm'); }
    else if (n.includes('두께')) { parts.push('두께 5cm'); }
    else if (n.includes('가로')) { parts.push('가로 50cm'); }
    else if (n.includes('세로')) { parts.push('세로 70cm'); }
    else if (n === '총 수량') { parts.push('총 10개'); }
    else if (n.includes('모델') || n.includes('품번')) { parts.push('AB-1234'); }
    else if (n.includes('구성')) { parts.push('본품'); }
    else if (n.includes('맛')) { parts.push('딸기맛'); }
    else if (n.includes('향')) { parts.push('라벤더향'); }
    else if (n.includes('차종')) { parts.push('공용'); }
    else if (n.includes('단 수')) { parts.push('3단'); }
    else if (n.includes('단계')) { parts.push('3단계'); }
    else if (n.includes('인원')) { parts.push('4인'); }
    else if (n.includes('원료')) { parts.push('닭고기'); }
    else if (n.includes('메모리') || n.includes('RAM') || n.includes('ram')) { parts.push('16GB'); }
    else if (n.includes('저장')) { parts.push('512GB'); }
    else if (n.includes('전구')) { parts.push('전구색'); }
    else if (n.includes('출력') || n.includes('전력')) { parts.push('100W'); }
    else if (n.includes('배터리')) { parts.push('5000mAh'); }
    else if (n.includes('화면')) { parts.push('화면 55cm'); }
  }

  // 기본 상품명 구성
  parts.unshift(leaf);
  parts.push('프리미엄');
  return parts.join(' ');
}

// ─── extractOptionsFromDetails 복제 (핵심 로직) ───
function extractOptionsFromDetails(productName, buyOpts) {
  const composite = extractComposite(productName);
  const extracted = new Map();

  // 택1 옵션 존재 여부
  const hasTabletOpt = buyOpts.some(o => {
    const n = o.n.replace(/\(택1\)\s*/g, '').trim();
    return n.includes('캡슐') || n.includes('정');
  });

  // 1단계: 추출
  for (const opt of buyOpts) {
    const name = opt.n.replace(/\(택1\)\s*/g, '').trim();
    const unit = opt.u;
    let value = null;

    if (name === '수량' && unit === '개') {
      value = String(extractCount(productName, composite));
    } else if (name === '개당 용량' && unit === 'ml') {
      const ml = extractVolumeMl(productName, composite);
      if (ml !== null) value = String(ml);
    } else if (name === '개당 중량' && unit === 'g') {
      const g = extractWeightG(productName, composite);
      if (g !== null) value = String(g);
    } else if (name === '개당 수량' && unit === '개') {
      const perCount = extractPerCount(productName, composite);
      if (perCount !== null) value = String(perCount);
    } else if (name.includes('캡슐') || name.includes('정')) {
      const tabletCount = extractTabletCount(productName);
      if (tabletCount !== null) value = String(tabletCount);
    } else if (name === '사이즈' || name.includes('사이즈') || name === '크기') {
      value = extractSize(productName);
    } else if (name === '색상' || name.includes('색상') || name === '컬러' || name.includes('컬러')) {
      value = extractColor(productName);
    }

    if (value !== null) {
      extracted.set(opt.n, { value, unit });
    }
  }

  // 1.5단계: 캡슐/정 × 수량 총합 보정
  if (hasTabletOpt) {
    let tabletKey = null, tabletVal = 0;
    for (const [key, entry] of extracted) {
      const n = key.replace(/\(택1\)\s*/g, '').trim();
      if (n.includes('캡슐') || n.includes('정')) {
        tabletKey = key; tabletVal = parseInt(entry.value, 10) || 0; break;
      }
    }
    let countKey = null, countVal = 0;
    for (const [key, entry] of extracted) {
      if (key.replace(/\(택1\)\s*/g, '').trim() === '수량') {
        countKey = key; countVal = parseInt(entry.value, 10) || 0; break;
      }
    }
    if (tabletKey && countKey && tabletVal >= 1 && countVal > 1) {
      const total = tabletVal * countVal;
      extracted.set(tabletKey, { value: String(total), unit: extracted.get(tabletKey).unit });
      extracted.set(countKey, { value: '1', unit: '개' });
    }
    if (tabletKey && tabletVal <= 1) {
      const monthMatch = productName.match(/(\d+)\s*개월/);
      if (monthMatch) {
        const months = parseInt(monthMatch[1], 10);
        if (months >= 1 && months <= 24) {
          extracted.set(tabletKey, { value: String(months * 30), unit: extracted.get(tabletKey).unit });
          if (countKey) extracted.set(countKey, { value: '1', unit: '개' });
        }
      }
    }
  }

  // 2단계: 택1 그룹 해소 + 결과 조립
  const choose1Opts = buyOpts.filter(o => o.c1);
  let choose1Filled = false;
  const result = [];

  if (choose1Opts.length > 0) {
    const priority = ['개당 용량', '개당 캡슐', '개당 정', '개당 중량'];
    const sorted = [...choose1Opts].sort((a, b) => {
      const aIdx = priority.findIndex(p => a.n.includes(p));
      const bIdx = priority.findIndex(p => b.n.includes(p));
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    });
    for (const opt of sorted) {
      if (choose1Filled) break;
      const ext = extracted.get(opt.n);
      if (ext) {
        result.push({ name: opt.n, value: ext.value, unit: ext.u });
        choose1Filled = true;
      }
    }
  }

  // 비-택1 옵션
  for (const opt of buyOpts) {
    if (opt.c1) continue;
    const ext = extracted.get(opt.n);
    if (ext) {
      result.push({ name: opt.n, value: ext.value, unit: opt.u });
    } else if (opt.r) {
      const fallback = getRequiredFallback(opt.n, productName);
      if (fallback) {
        result.push({ name: opt.n, value: fallback, unit: opt.u });
      }
    }
  }

  // 택1 그룹 전체 실패
  if (choose1Opts.length > 0 && !choose1Filled) {
    const first = choose1Opts[0];
    if (first.r) {
      const fb = first.u === '개' ? '1' : first.u === 'g' ? '1' : first.u === 'ml' ? '1' : '상세페이지 참조';
      result.push({ name: first.n, value: fb, unit: first.u });
      choose1Filled = true;
    }
  }

  // totalUnitCount
  const count = composite.count || extractCount(productName, composite);
  const perCount = composite.perCount || null;
  const tabletForUnit = extractTabletCount(productName);
  let totalUnitCount;
  if (tabletForUnit !== null && tabletForUnit >= 1) {
    totalUnitCount = tabletForUnit * count;
  } else if (perCount) {
    totalUnitCount = perCount * count;
  } else {
    totalUnitCount = count;
  }

  return { buyOptions: result, choose1Filled, totalUnitCount };
}

// ─── 검증 실행 ───

const errors = [];
const warnings = [];
let totalTested = 0;
let passCount = 0;
let warnCount = 0;
let failCount = 0;

// 카테고리별 통계
const statsByTopCat = new Map();

for (const [code, cat] of Object.entries(data)) {
  if (!cat.b || cat.b.length === 0) continue;
  totalTested++;

  const path = cat.p || code;
  const topCat = path.split('>')[0];
  if (!statsByTopCat.has(topCat)) statsByTopCat.set(topCat, { total: 0, pass: 0, warn: 0, fail: 0 });
  const stats = statsByTopCat.get(topCat);
  stats.total++;

  const productName = generateTestProductName(path, cat.b);
  const result = extractOptionsFromDetails(productName, cat.b);

  // 검증: 필수옵션이 모두 채워졌는지
  const requiredOpts = cat.b.filter(o => o.r);
  const choose1Opts = cat.b.filter(o => o.c1 && o.r);
  const nonChoose1Required = cat.b.filter(o => o.r && !o.c1);

  let categoryPass = true;
  let categoryWarn = false;
  const issues = [];

  // 택1 그룹 확인
  if (choose1Opts.length > 0 && !result.choose1Filled) {
    issues.push(`택1 필수옵션 미충족: ${choose1Opts.map(o => o.n).join('/')}`);
    categoryPass = false;
  }

  // 비택1 필수옵션 확인
  for (const req of nonChoose1Required) {
    const filled = result.buyOptions.find(r => r.name === req.n);
    if (!filled) {
      issues.push(`필수옵션 미충족: ${req.n}`);
      categoryPass = false;
    } else if (filled.value === '상세페이지 참조' || filled.value === '자체제작') {
      // 폴백값으로 채워진 경우 - 등록은 되지만 정확하지 않음
      categoryWarn = true;
    } else {
      // 숫자값 검증 (숫자가 필요한 옵션)
      if (['개', 'ml', 'g', 'MB', 'cm', 'W', 'mAh'].includes(req.u)) {
        const numVal = parseFloat(filled.value);
        if (isNaN(numVal) && filled.value !== '상세페이지 참조' && filled.value !== 'FREE') {
          issues.push(`숫자 필요: ${req.n}="${filled.value}" (단위: ${req.u})`);
          categoryWarn = true;
        } else if (numVal <= 0) {
          issues.push(`양수 필요: ${req.n}=${numVal}`);
          categoryPass = false;
        }
      }
    }
  }

  // unitCount 검증 (건강식품)
  if (path.includes('건강식품') || path.includes('비타민') || path.includes('영양제')) {
    if (result.totalUnitCount <= 1) {
      issues.push(`건강식품 unitCount=${result.totalUnitCount} → 노출제한 위험`);
      categoryWarn = true;
    }
  }

  if (!categoryPass) {
    failCount++;
    stats.fail++;
    if (errors.length < 50) {
      errors.push({ code, path, productName, issues });
    }
  } else if (categoryWarn) {
    warnCount++;
    stats.warn++;
    if (warnings.length < 30) {
      warnings.push({ code, path, issues });
    }
  } else {
    passCount++;
    stats.pass++;
  }
}

// ─── 결과 출력 ───

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║    전체 카테고리 옵션 추출 검증 결과                  ║');
console.log('╠════════════════════════════════════════════════════════╣');
console.log(`║  테스트 카테고리:  ${String(totalTested).padStart(6)}                          ║`);
console.log(`║  ✅ PASS:          ${String(passCount).padStart(6)}  (${String(Math.round(passCount/totalTested*100)).padStart(3)}%)                   ║`);
console.log(`║  ⚠️  WARN (폴백):   ${String(warnCount).padStart(6)}  (${String(Math.round(warnCount/totalTested*100)).padStart(3)}%)                   ║`);
console.log(`║  ❌ FAIL:          ${String(failCount).padStart(6)}  (${String(Math.round(failCount/totalTested*100)).padStart(3)}%)                   ║`);
console.log('╚════════════════════════════════════════════════════════╝');
console.log();

// 대분류별 결과
console.log('=== 대분류별 결과 ===');
const sortedStats = [...statsByTopCat.entries()].sort((a, b) => b[1].total - a[1].total);
for (const [cat, s] of sortedStats) {
  const passRate = Math.round(s.pass / s.total * 100);
  const bar = '█'.repeat(Math.floor(passRate / 5)) + '░'.repeat(20 - Math.floor(passRate / 5));
  const failStr = s.fail > 0 ? ` ❌${s.fail}` : '';
  const warnStr = s.warn > 0 ? ` ⚠️${s.warn}` : '';
  console.log(`  ${cat.padEnd(20)} ${bar} ${passRate}% (${s.total}개)${failStr}${warnStr}`);
}

if (errors.length > 0) {
  console.log();
  console.log(`=== ❌ FAIL 상세 (${errors.length}건) ===`);
  for (const e of errors.slice(0, 30)) {
    console.log(`  [${e.code}] ${e.path}`);
    console.log(`    상품명: "${e.productName}"`);
    for (const issue of e.issues) {
      console.log(`    → ${issue}`);
    }
  }
}

if (warnings.length > 0) {
  console.log();
  console.log(`=== ⚠️ WARN 상세 (상위 ${Math.min(20, warnings.length)}건) ===`);
  for (const w of warnings.slice(0, 20)) {
    console.log(`  [${w.code}] ${w.path}`);
    for (const issue of w.issues) {
      console.log(`    → ${issue}`);
    }
  }
}

// 특수 검증: 건강식품 상세
console.log();
console.log('=== 건강식품 카테고리 상세 검증 ===');
let healthPass = 0, healthFail = 0, healthWarn = 0, healthTotal = 0;
const healthIssues = [];

for (const [code, cat] of Object.entries(data)) {
  if (!cat.b || cat.b.length === 0) continue;
  if (!cat.p || !cat.p.includes('건강식품')) continue;
  healthTotal++;

  const testNames = [
    `${cat.p.split('>').pop()} 120정 3개 프리미엄`,
    `${cat.p.split('>').pop()} 60캡슐 2통 500mg`,
    `${cat.p.split('>').pop()} 1정 30개 비타민`,
    `${cat.p.split('>').pop()} 2개월분 1캡슐 영양제`,
    `${cat.p.split('>').pop()} 500ml 2병`,
    `${cat.p.split('>').pop()} 250g 1개`,
  ];

  for (const name of testNames) {
    const result = extractOptionsFromDetails(name, cat.b);

    // 필수옵션 충족 확인
    const choose1 = cat.b.filter(o => o.c1 && o.r);
    const nonC1 = cat.b.filter(o => o.r && !o.c1);

    let ok = true;
    if (choose1.length > 0 && !result.choose1Filled) { ok = false; }
    for (const req of nonC1) {
      if (!result.buyOptions.find(r => r.name === req.n)) { ok = false; break; }
    }

    if (ok) healthPass++;
    else {
      healthFail++;
      if (healthIssues.length < 10) {
        healthIssues.push({ code, name, path: cat.p, opts: result.buyOptions.map(o => `${o.name}=${o.value}`) });
      }
    }
  }
}

console.log(`건강식품 테스트: ${healthTotal}개 카테고리 × 6개 상품명 = ${healthTotal * 6}건`);
console.log(`  ✅ PASS: ${healthPass}`);
console.log(`  ❌ FAIL: ${healthFail}`);

if (healthIssues.length > 0) {
  console.log();
  console.log('  건강식품 FAIL 상세:');
  for (const h of healthIssues) {
    console.log(`    [${h.code}] ${h.path}`);
    console.log(`      상품명: "${h.name}"`);
    console.log(`      추출: ${h.opts.join(', ')}`);
  }
}
