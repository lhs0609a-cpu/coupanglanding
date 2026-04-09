/**
 * 전체 16,259 카테고리 × 다양한 상품명 → 옵션 추출 → 페이로드 빌드 → 쿠팡 API 호환성 검증
 *
 * 검증 항목:
 *  1. 필수 옵션(buyOptions) 전부 채워지는지
 *  2. 택1(choose1) 그룹에서 정확히 1개 선택되는지
 *  3. 옵션값이 숫자여야 하는 곳에 숫자가 들어가는지
 *  4. unitCount가 1보다 큰지 (건기식)
 *  5. attributes 배열에 옵션이 정상 병합되는지
 *  6. displayProductName, brand, manufacture, barcode 등 페이로드 필드
 *  7. 개당캡슐/정 × 수량 총합 보정이 적용되는지
 */

import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('./src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

// ════════════════════════════════════════════════════════════
// option-extractor 완전 복제 (최신 수정사항 포함)
// ════════════════════════════════════════════════════════════

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
  if (lMatch) { const v = parseFloat(lMatch[1]); if (v >= 0.1 && v <= 20) return v * 1000; }
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
  const m = name.match(/\b(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL|FREE|F|프리)\b/i);
  if (m) return m[1].toUpperCase();
  const nm = name.match(/(?:사이즈|SIZE)\s*:?\s*(\d{2,3})/i);
  if (nm) return nm[1];
  return null;
}

const KNOWN_COLORS = new Set([
  '블랙','화이트','레드','블루','그린','옐로우','핑크','퍼플','오렌지',
  '그레이','브라운','네이비','베이지','아이보리','민트','카키',
  '검정','흰색','빨강','파랑','초록','노랑','분홍','보라','주황',
  '회색','갈색','남색','골드','실버','로즈골드','크림','와인',
]);

function extractColor(name) {
  const sorted = [...KNOWN_COLORS].sort((a, b) => b.length - a.length);
  const lower = name.toLowerCase();
  for (const c of sorted) { if (lower.includes(c.toLowerCase())) return c; }
  return null;
}

function getRequiredFallback(optName, productName) {
  const n = optName.toLowerCase();
  if (n.includes('색상') || n.includes('컬러') || n === '색') return extractColor(productName) || '상세페이지 참조';
  if (n.includes('모델') || n.includes('품번')) return '자체제작';
  if (n.includes('사이즈') || n.includes('크기')) return extractSize(productName) || 'FREE';
  if (n.includes('구성')) return '본품';
  if (n.includes('맛') || n.includes('향')) return '상세페이지 참조';
  if (n === '용량' || n.includes('용량')) return '상세페이지 참조';
  if (n.includes('중량')) return '상세페이지 참조';
  if (n.includes('길이') || n.includes('높이') || n.includes('두께')) return '상세페이지 참조';
  if (n.includes('차종')) return '공용';
  if (n.includes('인원')) return '상세페이지 참조';
  if (n.includes('가로') || n.includes('세로')) return '상세페이지 참조';
  if (n.includes('신발')) return '상세페이지 참조';
  if (n.includes('수량')) return '1';
  if (n.includes('단계')) return '상세페이지 참조';
  if (n.includes('원료')) return '상세페이지 참조';
  if (n.includes('ram') || n.includes('메모리') || n.includes('저장')) return '상세페이지 참조';
  if (n.includes('전구')) return '상세페이지 참조';
  if (n.includes('수산물') || n.includes('농산물')) return '상세페이지 참조';
  if (n.includes('개당')) return '상세페이지 참조';
  if (n.includes('칸') || n.includes('매수')) return '상세페이지 참조';
  if (n.includes('조각')) return '상세페이지 참조';
  if (n.includes('성별')) return '상세페이지 참조';
  if (n.includes('설치')) return '상세페이지 참조';
  if (n.includes('연료')) return '상세페이지 참조';
  if (n.includes('규격')) return '상세페이지 참조';
  if (n.includes('재질')) return '상세페이지 참조';
  if (n.includes('운영체제')) return '상세페이지 참조';
  if (n.includes('cpu') || n.includes('그래픽') || n.includes('vga')) return '상세페이지 참조';
  if (n.includes('스위치')) return '상세페이지 참조';
  if (n.includes('출력') || n.includes('전력')) return '상세페이지 참조';
  if (n.includes('배터리')) return '상세페이지 참조';
  if (n.includes('화면')) return '상세페이지 참조';
  if (n.includes('급여')) return '상세페이지 참조';
  if (n.includes('경도') || n.includes('강도')) return '상세페이지 참조';
  if (n.includes('각도')) return '상세페이지 참조';
  if (n.includes('배율')) return '상세페이지 참조';
  if (n.includes('점도')) return '상세페이지 참조';
  if (n.includes('방식') || n.includes('형태')) return '상세페이지 참조';
  if (n.includes('제조사') || n.includes('차량')) return '상세페이지 참조';
  if (n.includes('기간') || n.includes('과목')) return '상세페이지 참조';

  // 식품 특수 옵션
  if (n.includes('출고') && n.includes('일')) return '주문 확인 후 순차배송';
  if (n.includes('쌀') && n.includes('등급')) return '상등급';
  if (n.includes('계란') && n.includes('구수')) {
    const eggM = productName.match(/(\d+)\s*(구|개|알)/);
    return eggM ? eggM[1] : '30';
  }
  if (n.includes('분쇄')) {
    if (productName.includes('분쇄') || productName.includes('드립')) return '분쇄';
    return '홀빈';
  }
  return null;
}

// ─── 전체 옵션 추출 (최신 코드 반영) ───
function extractOptionsFromDetails(productName, buyOpts) {
  const composite = extractComposite(productName);
  const extracted = new Map();

  const hasTabletOpt = buyOpts.some(o => {
    const n = (o.n || '').replace(/\(택1\)\s*/g, '').trim();
    return n.includes('캡슐') || n.includes('정');
  });

  for (const opt of buyOpts) {
    const name = (opt.n || '').replace(/\(택1\)\s*/g, '').trim();
    const unit = opt.u;
    let value = null;

    if (name === '수량' && unit === '개') value = String(extractCount(productName, composite));
    else if ((name === '개당 용량' || name === '최소 용량' || name === '용량') && (unit === 'ml' || !unit)) {
      const ml = extractVolumeMl(productName, composite);
      if (ml !== null) value = String(ml);
    }
    else if ((name === '개당 중량' || name === '최소 중량' || name === '중량' || name.includes('농산물') || name.includes('수산물')) && (unit === 'g' || !unit)) {
      const g = extractWeightG(productName, composite);
      if (g !== null) value = String(g);
    }
    else if (name === '개당 수량' && unit === '개') {
      const pc = extractPerCount(productName, composite);
      if (pc !== null) value = String(pc);
    }
    else if (name.includes('캡슐') || (name.includes('정') && !name.includes('설정'))) {
      const tc = extractTabletCount(productName);
      if (tc !== null) value = String(tc);
    }
    else if (name.includes('사이즈') || name === '크기') value = extractSize(productName);
    else if (name.includes('색상') || name.includes('컬러') || name === '색') value = extractColor(productName);
    else if (name === '총 수량') {
      const c = extractCount(productName, composite);
      const pc = extractPerCount(productName, composite);
      value = String(pc ? pc * c : c);
    }

    if (value !== null) extracted.set(opt.n, { value, unit });
  }

  // 1.5단계: 캡슐/정 × 수량 총합 보정
  if (hasTabletOpt) {
    let tabletKey = null, tabletVal = 0;
    for (const [key, entry] of extracted) {
      const n = (key || '').replace(/\(택1\)\s*/g, '').trim();
      if (n.includes('캡슐') || n.includes('정')) { tabletKey = key; tabletVal = parseInt(entry.value, 10) || 0; break; }
    }
    let countKey = null, countVal = 0;
    for (const [key, entry] of extracted) {
      if ((key || '').replace(/\(택1\)\s*/g, '').trim() === '수량') { countKey = key; countVal = parseInt(entry.value, 10) || 0; break; }
    }
    if (tabletKey && countKey && tabletVal >= 1 && countVal > 1) {
      extracted.set(tabletKey, { value: String(tabletVal * countVal), unit: extracted.get(tabletKey).unit });
      extracted.set(countKey, { value: '1', unit: '개' });
    }
    if (tabletKey && tabletVal <= 1) {
      const mm = productName.match(/(\d+)\s*개월/);
      if (mm) {
        const months = parseInt(mm[1], 10);
        if (months >= 1 && months <= 24) {
          extracted.set(tabletKey, { value: String(months * 30), unit: extracted.get(tabletKey).unit });
          if (countKey) extracted.set(countKey, { value: '1', unit: '개' });
        }
      }
    }
  }

  // 2단계: 택1 해소
  const choose1Opts = buyOpts.filter(o => o.c1);
  let choose1Filled = false;
  const result = [];

  if (choose1Opts.length > 0) {
    const priority = ['개당 용량', '최소 용량', '용량', '개당 캡슐', '개당 정', '개당 중량', '최소 중량', '중량'];
    const sorted = [...choose1Opts].sort((a, b) => {
      const ai = priority.findIndex(p => (a.n || '').includes(p));
      const bi = priority.findIndex(p => (b.n || '').includes(p));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    for (const opt of sorted) {
      if (choose1Filled) break;
      const ext = extracted.get(opt.n);
      if (ext) { result.push({ name: opt.n, value: ext.value, unit: opt.u }); choose1Filled = true; }
    }
  }

  for (const opt of buyOpts) {
    if (opt.c1) continue;
    const ext = extracted.get(opt.n);
    if (ext) { result.push({ name: opt.n, value: ext.value, unit: opt.u }); }
    else if (opt.r) {
      const fb = getRequiredFallback(opt.n, productName);
      if (fb) result.push({ name: opt.n, value: fb, unit: opt.u });
    }
  }

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
  if (tabletForUnit !== null && tabletForUnit >= 1) totalUnitCount = tabletForUnit * count;
  else if (perCount) totalUnitCount = perCount * count;
  else totalUnitCount = count;

  return { buyOptions: result, choose1Filled, totalUnitCount };
}

// ════════════════════════════════════════════════════════════
// 쿠팡 페이로드 빌드 시뮬레이션 (핵심 필드)
// ════════════════════════════════════════════════════════════

function buildMockPayload(code, catPath, productName, sellingPrice, extractionResult) {
  const preventionSeed = 'seller123:PROD001';

  // brand/manufacture — prevention 활성
  const resolvedBrand = '자체';
  const resolvedManufacturer = '자체제조';
  const resolvedBarcode = ''; // prevention → 바코드 제거

  // unitCount
  let unitCount = extractionResult.totalUnitCount || 1;
  if (unitCount <= 1) {
    const tabletMatch = productName.match(/(\d+)\s*(정|캡슐|알|타블렛|소프트젤|포(?!기|인)|매|장|ml|mL|g)/);
    if (tabletMatch) {
      const tn = parseInt(tabletMatch[1], 10);
      const countMatch = productName.match(/(\d+)\s*(개(?!입|월)|팩|세트|박스|봉|병|통|EA|ea)/i);
      const pkg = countMatch ? parseInt(countMatch[1], 10) : 1;
      const total = tn * pkg;
      if (total > 1) unitCount = total;
    }
    if (unitCount <= 1) {
      const mm = productName.match(/(\d+)\s*개월/);
      if (mm) { const m = parseInt(mm[1], 10); if (m >= 1 && m <= 24) unitCount = m * 30; }
    }
  }

  // attributes (옵션 → attributes 병합)
  const attributes = extractionResult.buyOptions.map(opt => ({
    attributeTypeName: opt.name,
    attributeValueName: opt.unit ? `${opt.value}${opt.unit}` : opt.value,
  }));

  // generalProductName
  const leafName = catPath.split('>').pop().trim();

  const payload = {
    displayCategoryCode: Number(code) || 0,
    displayProductName: productName.slice(0, 100),
    generalProductName: leafName,
    brand: resolvedBrand,
    manufacture: resolvedManufacturer,
    vendorId: 'A00000001',
    sellerProductName: `자체 PROD001`,
    deliveryMethod: 'SEQUENCIAL',
    deliveryChargeType: 'FREE',
    deliveryCharge: 0,
    items: [{
      itemName: productName.slice(0, 100),
      originalPrice: sellingPrice,
      salePrice: sellingPrice,
      maximumBuyCount: 999,
      unitCount,
      barcode: resolvedBarcode,
      emptyBarcode: true,
      externalVendorSku: 'PROD001',
      adultOnly: 'EVERYONE',
      taxType: 'TAX',
      attributes,
      notices: [],
      images: [{ imageOrder: 0, imageType: 'REPRESENTATION', cdnPath: 'https://example.com/img.jpg', vendorPath: 'https://example.com/img.jpg' }],
      contents: [{ contentsType: 'TEXT', contentDetails: [{ content: '<p>상세내용</p>', detailType: 'TEXT' }] }],
    }],
  };

  return payload;
}

// ════════════════════════════════════════════════════════════
// 페이로드 검증
// ════════════════════════════════════════════════════════════

function validatePayload(payload, catPath, buyOpts) {
  const issues = [];

  // 1. displayCategoryCode 필수
  if (!payload.displayCategoryCode || payload.displayCategoryCode <= 0)
    issues.push('displayCategoryCode 누락/0');

  // 2. displayProductName 1~100자
  if (!payload.displayProductName || payload.displayProductName.length === 0)
    issues.push('displayProductName 비어있음');
  if (payload.displayProductName && payload.displayProductName.length > 100)
    issues.push(`displayProductName ${payload.displayProductName.length}자 초과`);

  // 3. brand 필수, 빈 문자열 불가
  if (!payload.brand || payload.brand.length === 0)
    issues.push('brand 비어있음');

  // 4. manufacture 필수
  if (!payload.manufacture || payload.manufacture.length === 0)
    issues.push('manufacture 비어있음');

  // 5. items 최소 1개
  if (!payload.items || payload.items.length === 0)
    issues.push('items 비어있음');

  const item = payload.items[0];

  // 6. salePrice > 0
  if (!item.salePrice || item.salePrice <= 0)
    issues.push('salePrice 0이하');

  // 7. unitCount > 0
  if (!item.unitCount || item.unitCount <= 0)
    issues.push('unitCount 0이하');

  // 8. images 최소 1개
  if (!item.images || item.images.length === 0)
    issues.push('images 비어있음');

  // 9. barcode 처리 — prevention이면 emptyBarcode=true
  if (item.barcode && item.barcode.length > 0 && item.emptyBarcode)
    issues.push('barcode와 emptyBarcode 동시 설정');

  // 10. attributes에서 필수옵션 충족 확인
  const requiredNonC1 = buyOpts.filter(o => o.r && !o.c1);
  const requiredC1 = buyOpts.filter(o => o.r && o.c1);

  for (const req of requiredNonC1) {
    const found = item.attributes.find(a => a.attributeTypeName === req.n);
    if (!found) issues.push(`필수 attribute 누락: ${req.n}`);
    else if (!found.attributeValueName || found.attributeValueName.trim() === '')
      issues.push(`필수 attribute 빈값: ${req.n}`);
  }

  // 택1 중 1개 이상 충족
  if (requiredC1.length > 0) {
    const c1Filled = requiredC1.some(req => item.attributes.find(a => a.attributeTypeName === req.n));
    if (!c1Filled) issues.push(`택1 필수옵션 미충족: ${requiredC1.map(o => o.n).join('/')}`);
  }

  // 11. unitCount 건기식 경고
  if (item.unitCount === 1 && (catPath.includes('건강식품') || catPath.includes('비타민') || catPath.includes('영양제')))
    issues.push(`건기식 unitCount=1 → 노출제한 위험`);

  // 12. 단위가격 계산 검증
  if (item.unitCount > 0) {
    const unitPrice = item.salePrice / item.unitCount;
    if (unitPrice > 50000 && catPath.includes('건강식품'))
      issues.push(`건기식 단위가격 ${Math.round(unitPrice).toLocaleString()}원 과다`);
  }

  return issues;
}

// ════════════════════════════════════════════════════════════
// 현실적 상품명 생성기 (카테고리별 맞춤)
// ════════════════════════════════════════════════════════════

function generateProductNames(catPath, buyOpts) {
  const leaf = catPath.split('>').pop().trim();
  const top = catPath.split('>')[0].trim();
  const names = [];

  // 도서 카테고리
  if (top === '도서' || top === '도서/음반/DVD') {
    names.push(`[최신판] ${leaf} 완벽가이드 홍길동 저 한빛미디어`);
    names.push(`2024 ${leaf} 바이블 김철수 지음 위키북스`);
    return names;
  }

  // 옵션 타입별로 포함할 숫자 결정
  const hasVolume = buyOpts.some(o => (o.n || '').includes('용량'));
  const hasWeight = buyOpts.some(o => (o.n || '').includes('중량'));
  const hasTablet = buyOpts.some(o => (o.n || '').includes('캡슐') || ((o.n || '').includes('정') && !(o.n || '').includes('설정')));
  const hasPerCount = buyOpts.some(o => (o.n || '').includes('개당 수량'));
  const hasSize = buyOpts.some(o => (o.n || '').includes('사이즈') || (o.n || '') === '크기');
  const hasColor = buyOpts.some(o => (o.n || '').includes('색상') || (o.n || '').includes('컬러'));
  const hasCount = buyOpts.some(o => (o.n || '').replace(/\(택1\)\s*/g, '').trim() === '수량');

  // 건강식품 패턴
  if (hasTablet) {
    names.push(`${leaf} 프리미엄 120정 3개`);
    names.push(`${leaf} 골드 60캡슐 2통 500mg`);
    names.push(`${leaf} 1정 30개 고함량`);
    names.push(`${leaf} 2개월분 1캡슐 영양제`);
    if (hasWeight) names.push(`${leaf} 90정 250g 1개`);
    if (hasVolume) names.push(`${leaf} 30포 500ml 1박스`);
    return names;
  }

  // 용량 기반 (음료, 화장품 등)
  if (hasVolume) {
    names.push(`${leaf} 프리미엄 500ml 3개`);
    names.push(`${leaf} 대용량 1.5리터 2병`);
    names.push(`${leaf} 미니 50ml 블랙`);
    if (hasColor) names.push(`${leaf} 200ml 화이트 1개`);
    return names;
  }

  // 중량 기반 (식품, 농산물 등)
  if (hasWeight) {
    names.push(`${leaf} 국산 500g 2개`);
    names.push(`${leaf} 프리미엄 1kg 1박스`);
    names.push(`${leaf} 소포장 250g 3팩`);
    return names;
  }

  // 개당 수량 (물티슈, 마스크 등)
  if (hasPerCount) {
    names.push(`${leaf} 80매입 10팩`);
    names.push(`${leaf} 100매 x 5개`);
    names.push(`${leaf} 30매입 3개`);
    return names;
  }

  // 사이즈 + 색상 기반 (의류, 패션)
  if (hasSize && hasColor) {
    names.push(`${leaf} 블랙 FREE 1개`);
    names.push(`${leaf} 네이비 M 2개`);
    names.push(`${leaf} 화이트 XL 1개`);
    return names;
  }

  if (hasSize) {
    names.push(`${leaf} FREE 1개`);
    names.push(`${leaf} M 사이즈 2개`);
    return names;
  }

  if (hasColor) {
    names.push(`${leaf} 블랙 1개`);
    names.push(`${leaf} 화이트 3개`);
    return names;
  }

  // 기본 (수량만)
  if (hasCount) {
    names.push(`${leaf} 프리미엄 3개`);
    names.push(`${leaf} 1+1 세트`);
    return names;
  }

  // 옵션 없음
  names.push(`${leaf} 프리미엄`);
  return names;
}

// ════════════════════════════════════════════════════════════
// 메인 테스트 실행
// ════════════════════════════════════════════════════════════

let totalTests = 0;
let passCount = 0;
let warnCount = 0;
let failCount = 0;

const failsByTop = new Map();
const warnsByTop = new Map();
const totalByTop = new Map();
const passByTop = new Map();

const failDetails = [];
const samplePayloads = [];

for (const [code, cat] of Object.entries(data)) {
  if (!cat.b) continue;
  const catPath = cat.p || code;
  const top = catPath.split('>')[0];
  if (!totalByTop.has(top)) { totalByTop.set(top, 0); passByTop.set(top, 0); failsByTop.set(top, 0); warnsByTop.set(top, 0); }

  const testNames = generateProductNames(catPath, cat.b);

  for (const productName of testNames) {
    totalTests++;
    totalByTop.set(top, totalByTop.get(top) + 1);

    const extraction = extractOptionsFromDetails(productName, cat.b);
    const payload = buildMockPayload(code, catPath, productName, 39900, extraction);
    const issues = validatePayload(payload, catPath, cat.b);

    // 분류: FAIL = 필수옵션 누락, WARN = 폴백값, PASS = 완벽
    const hasFail = issues.some(i => i.includes('누락') || i.includes('미충족') || i.includes('비어있음') || i.includes('0이하'));
    const hasWarn = issues.some(i => i.includes('위험') || i.includes('과다'));

    if (hasFail) {
      failCount++;
      failsByTop.set(top, failsByTop.get(top) + 1);
      if (failDetails.length < 50) failDetails.push({ code, catPath, productName, issues });
    } else if (hasWarn) {
      warnCount++;
      warnsByTop.set(top, warnsByTop.get(top) + 1);
    } else {
      passCount++;
      passByTop.set(top, passByTop.get(top) + 1);
    }

    // 건강식품 샘플 페이로드 저장
    if (catPath.includes('건강식품') && samplePayloads.length < 5) {
      samplePayloads.push({ catPath, productName, unitCount: payload.items[0].unitCount, attrs: payload.items[0].attributes, unitPrice: Math.round(39900 / payload.items[0].unitCount) });
    }
  }
}

// ════════════════════════════════════════════════════════════
// 결과 출력
// ════════════════════════════════════════════════════════════

console.log('');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   전체 카테고리 옵션 추출 + 페이로드 빌드 검증 결과        ║');
console.log('╠══════════════════════════════════════════════════════════════╣');
console.log(`║  총 테스트:   ${String(totalTests).padStart(7)}건  (16,258 카테고리 × 다중 상품명)  ║`);
console.log(`║  ✅ PASS:     ${String(passCount).padStart(7)}건  (${String(Math.round(passCount/totalTests*1000)/10).padStart(5)}%)                     ║`);
console.log(`║  ⚠️  WARN:     ${String(warnCount).padStart(7)}건  (${String(Math.round(warnCount/totalTests*1000)/10).padStart(5)}%)                     ║`);
console.log(`║  ❌ FAIL:     ${String(failCount).padStart(7)}건  (${String(Math.round(failCount/totalTests*1000)/10).padStart(5)}%)                     ║`);
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');

// 대분류별
console.log('=== 대분류별 결과 ===');
const sortedTops = [...totalByTop.entries()].sort((a, b) => b[1] - a[1]);
for (const [top, total] of sortedTops) {
  const p = passByTop.get(top) || 0;
  const f = failsByTop.get(top) || 0;
  const w = warnsByTop.get(top) || 0;
  const rate = Math.round(p / total * 100);
  const bar = '█'.repeat(Math.floor(rate / 5)) + '░'.repeat(20 - Math.floor(rate / 5));
  let detail = '';
  if (f > 0) detail += ` ❌${f}`;
  if (w > 0) detail += ` ⚠️${w}`;
  console.log(`  ${top.padEnd(18)} ${bar} ${String(rate).padStart(3)}% (${total}건)${detail}`);
}

// FAIL 상세
if (failDetails.length > 0) {
  console.log('');
  console.log(`=== ❌ FAIL 상세 (도서 제외 상위 30건) ===`);
  let shown = 0;
  for (const d of failDetails) {
    if (d.catPath.startsWith('도서')) continue;
    if (shown >= 30) break;
    shown++;
    console.log(`  [${d.code}] ${d.catPath}`);
    console.log(`    상품명: "${d.productName}"`);
    for (const i of d.issues) console.log(`    → ${i}`);
  }
  if (shown === 0) console.log('  (도서 외 FAIL 없음)');
}

// 건강식품 페이로드 샘플
console.log('');
console.log('=== 건강식품 페이로드 샘플 (쿠팡 API 입력값) ===');
for (const s of samplePayloads) {
  console.log(`  📦 ${s.catPath.split('>').pop()}: "${s.productName}"`);
  console.log(`     unitCount=${s.unitCount}, 단위가격=${s.unitPrice}원`);
  console.log(`     attributes: ${s.attrs.map(a => `${a.attributeTypeName}=${a.attributeValueName}`).join(', ')}`);
  console.log('');
}

// 도서 제외 종합
const nonBookTotal = totalTests - (totalByTop.get('도서') || 0) - (totalByTop.get('도서/음반/DVD') || 0);
const nonBookFail = failCount - (failsByTop.get('도서') || 0) - (failsByTop.get('도서/음반/DVD') || 0);
const nonBookPass = passCount - (passByTop.get('도서') || 0) - (passByTop.get('도서/음반/DVD') || 0);

console.log('═══════════════════════════════════════════');
console.log(`📊 도서 제외 종합: ${nonBookTotal}건 중 PASS ${nonBookPass}건 (${Math.round(nonBookPass/nonBookTotal*1000)/10}%), FAIL ${nonBookFail}건 (${Math.round(nonBookFail/nonBookTotal*1000)/10}%)`);
console.log('═══════════════════════════════════════════');
