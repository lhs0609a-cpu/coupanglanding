import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('./src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

// option-extractor에서 사용하는 로직 재현
function getRequiredFallback(name, unit) {
  const n = name;
  const u = unit || '';

  if (n === '수량') return { value: '1', unit: u || '개' };
  if (n.includes('캡슐') || n.includes('정')) return { value: '1', unit: u || '개' };
  if (n.includes('용량')) return { value: '1', unit: u || 'ml' };
  if (n.includes('중량')) return { value: '1', unit: u || 'g' };
  if (n.includes('수량')) return { value: '1', unit: u || '개' };
  if (n.includes('색상') || n.includes('컬러')) return { value: '기본', unit: '' };
  if (n.includes('모델') || n.includes('품번')) return { value: '기본', unit: '' };
  if (n.includes('사이즈') || n.includes('크기')) return { value: 'FREE', unit: '' };
  if (n.includes('구성')) return { value: '기본구성', unit: '' };
  if (n.includes('맛') || n.includes('향')) return { value: '기본맛', unit: '' };
  if (n.includes('길이')) return { value: '1', unit: u || 'cm' };
  if (n.includes('인원')) return { value: '1', unit: u || '인' };
  if (n.includes('가로') || n.includes('세로')) return { value: '1', unit: u || 'cm' };
  if (n.includes('신발')) return { value: '250', unit: u || 'mm' };
  if (n.includes('단계')) return { value: '1단계', unit: '' };
  if (n.includes('원료') || n.includes('주원료')) return { value: '기본', unit: '' };
  if (n.includes('ram') || n.includes('메모리') || n.includes('저장')) return { value: '8', unit: u || 'GB' };
  if (n.includes('전구')) return { value: '1', unit: u || '개' };
  if (n.includes('높이')) return { value: '1', unit: u || 'cm' };
  if (n.includes('두께')) return { value: '1', unit: u || 'mm' };
  return null;
}

function generateNames(cat) {
  const path = cat.p || '';
  const leaf = path.split('>').pop().trim();
  const names = [];

  if (path.includes('건강식품')) {
    names.push(leaf + ' 프리미엄 120정 3개');
    names.push(leaf + ' 골드 60캡슐 2통 500mg');
    names.push(leaf + ' 1정 30개 고함량');
  } else if (path.includes('음료')) {
    names.push(leaf + ' 500ml 24개입');
    names.push(leaf + ' 1.5L 6개');
    names.push(leaf + ' 350ml 30개');
  } else if (path.includes('과일') || path.includes('채소') || path.includes('농산물')) {
    names.push(leaf + ' 1kg 국내산');
    names.push(leaf + ' 3kg 선물세트');
    names.push(leaf + ' 500g 2개');
  } else if (path.includes('수산') || path.includes('해산물')) {
    names.push(leaf + ' 1kg 냉동');
    names.push(leaf + ' 500g 3팩');
    names.push(leaf + ' 200g 5개입');
  } else if (path.includes('축산') || path.includes('정육')) {
    names.push(leaf + ' 1kg 냉장');
    names.push(leaf + ' 500g 2팩');
    names.push(leaf + ' 300g 3개입');
  } else {
    names.push(leaf + ' 500g 1개');
    names.push(leaf + ' 1kg 대용량');
    names.push(leaf + ' 300g 3개입');
  }
  return names;
}

// 식품 카테고리만 테스트
const foodCats = Object.entries(data).filter(([c, v]) => v.p && v.p.startsWith('식품'));

let failCount = 0;
for (const [code, cat] of foodCats) {
  if (!cat.b || cat.b.length === 0) continue;
  const names = generateNames(cat);

  for (const name of names) {
    const buyOptions = cat.b;
    const required = buyOptions.filter(o => o.r === true);
    if (required.length === 0) continue;

    // 필수옵션 체크
    const missing = [];
    for (const opt of required) {
      // 상품명에서 추출 시도
      let extracted = null;
      const n = opt.n;
      const u = opt.u || '';

      // 숫자 추출 패턴
      if (n.includes('용량') || n.includes('중량')) {
        const m = name.match(/(\d+(?:\.\d+)?)\s*(ml|mL|L|l|g|kg|KG|Kg|mg|oz)/i);
        if (m) extracted = { value: m[1], unit: m[2] };
      }
      if (n === '수량' || n.includes('수량')) {
        const m = name.match(/(\d+)\s*(개|팩|세트|박스|봉|병|통|EA|ea|입)/i);
        if (m) extracted = { value: m[1], unit: m[2] };
      }

      // fallback
      if (!extracted) {
        extracted = getRequiredFallback(n, u);
      }

      if (!extracted || !extracted.value || extracted.value === '' || extracted.value === '0') {
        missing.push(n + (u ? '(' + u + ')' : ''));
      }
    }

    if (missing.length > 0) {
      failCount++;
      console.log('FAIL: ' + cat.p + ' [' + code + ']');
      console.log('  상품명: ' + name);
      console.log('  미충족 필수옵션: ' + missing.join(', '));
      console.log('  전체 필수옵션: ' + required.map(o => o.n + (o.u ? '(' + o.u + ')' : '')).join(', '));
      console.log();
    }
  }
}
console.log('식품 FAIL 총: ' + failCount + '건');
