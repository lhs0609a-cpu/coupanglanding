import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('./src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

// getRequiredFallback이 커버하는 패턴
function isHandled(name) {
  if (name === '수량') return true;
  if (name.includes('캡슐') || name.includes('정')) return true;
  if (name.includes('용량')) return true;
  if (name.includes('중량')) return true;
  if (name.includes('수량')) return true;
  if (name.includes('색상') || name.includes('컬러')) return true;
  if (name.includes('모델') || name.includes('품번')) return true;
  if (name.includes('사이즈') || name.includes('크기')) return true;
  if (name.includes('구성')) return true;
  if (name.includes('맛') || name.includes('향')) return true;
  if (name.includes('길이')) return true;
  if (name.includes('인원')) return true;
  if (name.includes('가로') || name.includes('세로')) return true;
  if (name.includes('신발')) return true;
  if (name.includes('단계')) return true;
  if (name.includes('원료') || name.includes('주원료')) return true;
  if (name.includes('ram') || name.includes('메모리') || name.includes('저장')) return true;
  if (name.includes('전구')) return true;
  if (name.includes('높이')) return true;
  if (name.includes('두께')) return true;
  return false;
}

const missingByOption = new Map();
const missingByTopCat = new Map();
let totalRequired = 0;
let totalHandled = 0;
let totalMissing = 0;
let categoriesWithMissing = 0;

for (const [code, cat] of Object.entries(data)) {
  if (!cat.b || cat.b.length === 0) continue;
  let hasMissing = false;

  for (const opt of cat.b) {
    if (opt.r !== true) continue;
    totalRequired++;

    if (isHandled(opt.n)) {
      totalHandled++;
    } else {
      totalMissing++;
      hasMissing = true;
      missingByOption.set(opt.n, (missingByOption.get(opt.n) || 0) + 1);
      const topCat = (cat.p || '').split('>')[0] || 'unknown';
      missingByTopCat.set(topCat, (missingByTopCat.get(topCat) || 0) + 1);
    }
  }

  if (hasMissing) categoriesWithMissing++;
}

console.log('=== 필수옵션 커버리지 ===');
console.log(`총 필수옵션: ${totalRequired}`);
console.log(`처리됨: ${totalHandled} (${Math.round(totalHandled/totalRequired*100)}%)`);
console.log(`미처리: ${totalMissing} (${Math.round(totalMissing/totalRequired*100)}%)`);
console.log(`미처리 카테고리 수: ${categoriesWithMissing}`);
console.log();

console.log('=== 미처리 필수옵션 TOP 30 ===');
const sortedMissing = [...missingByOption.entries()].sort((a, b) => b[1] - a[1]);
for (const [name, count] of sortedMissing.slice(0, 30)) {
  console.log(`  ${name.padEnd(35)} ${String(count).padStart(5)}개 카테고리`);
}

console.log();
console.log('=== 대분류별 미처리 필수옵션 수 ===');
const sortedCat = [...missingByTopCat.entries()].sort((a, b) => b[1] - a[1]);
for (const [cat, count] of sortedCat) {
  console.log(`  ${cat.padEnd(25)} ${String(count).padStart(5)}개`);
}

// 건강식품 카테고리만 분석
console.log();
console.log('=== 건강식품 카테고리 필수옵션 분석 ===');
let healthTotal = 0;
let healthHandled = 0;
let healthMissing = 0;

for (const [code, cat] of Object.entries(data)) {
  if (!cat.b || cat.b.length === 0) continue;
  if (!cat.p || !cat.p.includes('건강식품')) continue;

  for (const opt of cat.b) {
    if (opt.r !== true) continue;
    healthTotal++;
    if (isHandled(opt.n)) {
      healthHandled++;
    } else {
      healthMissing++;
      console.log(`  ❌ ${cat.p} → ${opt.n} (${opt.u || '-'})`);
    }
  }
}
console.log(`건강식품 필수옵션: ${healthTotal}개 중 ${healthHandled}개 처리 (${healthMissing}개 미처리)`);
