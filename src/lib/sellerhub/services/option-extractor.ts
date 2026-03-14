// ============================================================
// 구매옵션 자동 추출 서비스
// 상품명에서 수량, 용량, 중량, 사이즈, 색상 등을 자동 추출하여
// 카테고리별 구매옵션 값을 채운다.
// ============================================================

import { getCategoryDetails, type CategoryDetails } from './category-matcher';

// ─── Types ───────────────────────────────────────────────────

export interface ExtractedOptions {
  buyOptions: { name: string; value: string; unit?: string }[];
  confidence: number;
  warnings: string[];  // missing required fields
}

// ─── Known color list ────────────────────────────────────────

const KNOWN_COLORS = new Set([
  '블랙', '화이트', '레드', '블루', '그린', '옐로우', '핑크', '퍼플', '오렌지',
  '그레이', '브라운', '네이비', '베이지', '아이보리', '민트', '카키',
  '검정', '흰색', '빨강', '파랑', '초록', '노랑', '분홍', '보라', '주황',
  '회색', '갈색', '남색', '골드', '실버', '로즈골드', '크림', '와인',
  '스카이블루', '라벤더', '코랄', '차콜', '올리브',
  'black', 'white', 'red', 'blue', 'green', 'yellow', 'pink', 'purple',
  'orange', 'gray', 'grey', 'brown', 'navy', 'beige', 'ivory', 'mint',
  'khaki', 'gold', 'silver', 'cream', 'wine', 'coral', 'charcoal', 'olive',
]);

// ─── Size patterns ──────────────────────────────────────────

const SIZE_PATTERN = /\b(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL|FREE|F|프리)\b/i;

// ─── Extraction patterns ────────────────────────────────────

/**
 * 복합 패턴 처리:
 * - "50ml x 3개" → 용량: 50ml, 수량: 3
 * - "80매 x 10팩" → 개당수량: 80, 수량: 10
 * - "500g x 2개" → 중량: 500g, 수량: 2
 * - "1+1" → 수량: 2
 * - "2+1" → 수량: 3
 */
interface CompositeResult {
  volume?: { value: number; unit: string };
  weight?: { value: number; unit: string };
  count?: number;
  perCount?: number; // 개당 수량 (80매 x 10팩 → 80)
}

function extractComposite(name: string): CompositeResult {
  const result: CompositeResult = {};

  // "NNml x N개" pattern → 용량 + 수량
  const volumeCountMatch = name.match(/(\d+(?:\.\d+)?)\s*(ml|mL|ML|㎖)\s*[xX×]\s*(\d+)\s*(개|입|팩|봉|병|통|EA|ea)?/i);
  if (volumeCountMatch) {
    result.volume = { value: parseFloat(volumeCountMatch[1]), unit: 'ml' };
    result.count = parseInt(volumeCountMatch[3], 10);
  }

  // "NNg/kg x N개" pattern → 중량 + 수량
  const weightCountMatch = name.match(/(\d+(?:\.\d+)?)\s*(g|kg|KG|㎏)\s*[xX×]\s*(\d+)\s*(개|입|팩|봉|병|통|EA|ea)?/i);
  if (weightCountMatch) {
    let wVal = parseFloat(weightCountMatch[1]);
    if (/kg/i.test(weightCountMatch[2])) wVal *= 1000;
    result.weight = { value: wVal, unit: 'g' };
    result.count = parseInt(weightCountMatch[3], 10);
  }

  // "NN매 x N팩" pattern → 개당수량 + 수량 (물티슈, 마스크 등)
  const sheetPackMatch = name.match(/(\d+)\s*(매|장|매입)\s*[xX×]\s*(\d+)\s*(팩|개|입|봉|통)/i);
  if (sheetPackMatch) {
    result.perCount = parseInt(sheetPackMatch[1], 10);
    result.count = parseInt(sheetPackMatch[3], 10);
  }

  // "N+N" pattern (1+1=2, 2+1=3) — 뒤에 단위가 없을 때만
  const plusMatch = name.match(/(\d+)\s*\+\s*(\d+)(?!\s*(?:ml|g|kg|mg|l|정|캡슐))/i);
  if (plusMatch && !result.count) {
    result.count = parseInt(plusMatch[1], 10) + parseInt(plusMatch[2], 10);
  }

  return result;
}

/**
 * 수량 추출: N개, N입, N팩, N세트, N박스, N봉, N병, N통, NEA, N족
 *
 * 주의:
 * - "N개입"은 개당 수량이므로 제외
 * - "N매"가 "x" 앞에 있으면 개당 수량이므로 제외 (composite에서 처리)
 * - composite.count가 있으면 우선 사용
 */
function extractCount(name: string, composite: CompositeResult): number {
  if (composite.count) return composite.count;

  // "N개입", "N개월" 제외, "N매 x" 패턴도 제외 (composite에서 처리됨)
  // 수량 단위: 개, 팩, 세트, 박스, 봉, 병, 통, 족, 켤레, 롤, 포, EA, P
  const match = name.match(/(\d+)\s*(개(?!입|월)|팩|세트|박스|봉|병|통|족|켤레|롤|포(?!기)|EA|ea|P)(?!\s*[xX×])/i);
  if (match) return parseInt(match[1], 10);

  // "N입"도 수량이 될 수 있음 — 단, "N개입"과 구분 필요
  const ipMatch = name.match(/(\d+)\s*입(?!\s*[xX×])/);
  if (ipMatch && !name.includes(ipMatch[1] + '개입')) {
    return parseInt(ipMatch[1], 10);
  }

  // "N매"가 단독으로 있으면 (x 패턴이 아닌 경우) — 개당 수량이 아닌 총 수량
  if (!composite.perCount) {
    const sheetMatch = name.match(/(\d+)\s*(매|장)(?!\s*[xX×])/);
    if (sheetMatch) return parseInt(sheetMatch[1], 10);
  }

  return 1; // 기본값
}

/**
 * 개당 용량 (ml) 추출
 */
function extractVolumeMl(name: string, composite: CompositeResult): number | null {
  if (composite.volume) return composite.volume.value;

  // L/리터/ℓ → ml 변환
  const literMatch = name.match(/(\d+(?:\.\d+)?)\s*(리터|ℓ)(?!\s*[xX×])/i);
  if (literMatch) {
    return parseFloat(literMatch[1]) * 1000;
  }

  // "L" 단독은 사이즈 L과 혼동 가능 — 앞에 숫자+소수점이 있고 범위 체크
  const lMatch = name.match(/(\d+(?:\.\d+)?)\s*L(?!\s*[xX×a-zA-Z])/);
  if (lMatch) {
    const val = parseFloat(lMatch[1]);
    if (val >= 0.1 && val <= 20) return val * 1000;
  }

  const mlMatch = name.match(/(\d+(?:\.\d+)?)\s*(ml|mL|ML|㎖)(?!\s*[xX×])/i);
  if (mlMatch) return parseFloat(mlMatch[1]);

  return null;
}

/**
 * 개당 중량 (g) 추출
 *
 * ⚠️ 치명적 주의: mg는 절대 g로 변환하지 않음!
 * 상품명의 mg는 99% 성분 함량 (비타민C 1000mg, 루테인 20mg)이지
 * 제품 중량이 아님. mg → g 변환은 잘못된 옵션값을 생성함.
 */
function extractWeightG(name: string, composite: CompositeResult): number | null {
  if (composite.weight) return composite.weight.value;

  // kg → g 변환
  const kgMatch = name.match(/(\d+(?:\.\d+)?)\s*(kg|KG|㎏)(?!\s*[xX×])/i);
  if (kgMatch) return parseFloat(kgMatch[1]) * 1000;

  // g 직접 추출 — 단, 앞에 m이 붙은 mg는 제외!
  const gMatch = name.match(/(?<![mkμ])(\d+(?:\.\d+)?)\s*(g|그램)(?!\s*[xX×])/i);
  if (gMatch) return parseFloat(gMatch[1]);

  // mg는 무시 (성분 함량이므로 제품 중량이 아님)
  // mcg도 무시

  return null;
}

/**
 * 개당 수량 (개입) 추출
 * "80매 x 10팩" → perCount=80 (composite에서 처리)
 * "100개입" → 100
 */
function extractPerCount(name: string, composite: CompositeResult): number | null {
  if (composite.perCount) return composite.perCount;

  const match = name.match(/(\d+)\s*개입/);
  if (match) return parseInt(match[1], 10);

  return null;
}

/**
 * 개당 캡슐/정 수 추출 (건강보조식품)
 *
 * ⚠️ 주의: "비타민C 1000mg 120정" → 120정만 추출
 * mg 뒤의 숫자(1000)는 성분 함량이고, 정 앞의 숫자(120)가 정제 수
 * 정/캡슐 앞의 숫자가 성분 함량 뒤에 오는지 확인
 */
function extractTabletCount(name: string): number | null {
  // "비타민C 1000mg 120정 3개" → 120 추출
  // "콜라겐 2000mg 30포" → 30 추출
  // mg/mcg는 단위 리스트에 없으므로 자연스럽게 "1000mg"는 매칭 안 됨
  const match = name.match(/(\d+)\s*(정|캡슐|알|타블렛|소프트젤|포(?!기|인))/);
  if (match) return parseInt(match[1], 10);
  return null;
}

/**
 * 사이즈 추출
 */
function extractSize(name: string): string | null {
  const match = name.match(SIZE_PATTERN);
  if (match) return match[1].toUpperCase();

  // 숫자 사이즈 (의류: 90, 95, 100, 105, 110 / 신발: 230~300)
  const numMatch = name.match(/(?:사이즈|SIZE)\s*:?\s*(\d{2,3})/i);
  if (numMatch) return numMatch[1];

  return null;
}

/**
 * 색상 추출
 */
function extractColor(name: string): string | null {
  // 긴 색상명을 먼저 체크 (로즈골드 > 골드, 스카이블루 > 블루)
  const sortedColors = [...KNOWN_COLORS].sort((a, b) => b.length - a.length);
  const lower = name.toLowerCase();
  for (const color of sortedColors) {
    if (lower.includes(color.toLowerCase())) {
      return color;
    }
  }

  // "색상: XXX" 패턴
  const colorMatch = name.match(/색상\s*:?\s*([가-힣a-zA-Z]+)/);
  if (colorMatch) return colorMatch[1];

  return null;
}

// ─── Option name normalization ──────────────────────────────

/** 택1 그룹 이름에서 "(택1)" 제거 */
function normalizeOptionName(name: string): string {
  return name.replace(/\(택1\)\s*/g, '').trim();
}

// ─── Main extraction logic ──────────────────────────────────

/**
 * 상품명과 카테고리 코드로 구매옵션 값을 자동 추출한다.
 *
 * 카테고리의 buyOptions 정의를 읽고, 각 옵션에 맞는 값을
 * 상품명에서 패턴 매칭으로 추출한다.
 */
export function extractOptions(productName: string, categoryCode: string): ExtractedOptions {
  const details = getCategoryDetails(categoryCode);
  if (!details) {
    console.warn(`[option-extractor] Category ${categoryCode} not found in details DB`);
    return { buyOptions: [], confidence: 0, warnings: [`카테고리 ${categoryCode}를 찾을 수 없습니다.`] };
  }

  return extractOptionsFromDetails(productName, details);
}

/**
 * CategoryDetails를 직접 전달받아 추출 (getCategoryDetails를 이미 호출한 경우)
 */
export function extractOptionsFromDetails(productName: string, details: CategoryDetails): ExtractedOptions {
  const buyOpts = details.buyOptions;
  if (!buyOpts || buyOpts.length === 0) {
    return { buyOptions: [], confidence: 1, warnings: [] };
  }

  const composite = extractComposite(productName);
  const result: { name: string; value: string; unit?: string }[] = [];
  const warnings: string[] = [];

  // ── 1단계: 모든 옵션의 값을 먼저 추출 (순서 무관하게) ──
  const extracted = new Map<string, { value: string; unit?: string }>();

  for (const opt of buyOpts) {
    const name = normalizeOptionName(opt.name);
    const unit = opt.unit;
    let value: string | null = null;

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
      extracted.set(opt.name, { value, unit });
    }
  }

  // ── 2단계: 택1 그룹 해소 + 결과 조립 ──
  // 택1 그룹에서 값이 있는 것 중 우선순위: 용량(ml) > 캡슐/정 > 중량(g)
  const choose1Opts = buyOpts.filter((o) => o.choose1);
  let choose1Filled = false;

  if (choose1Opts.length > 0) {
    // 우선순위 정렬: 용량 > 캡슐/정 > 중량
    const priority = ['개당 용량', '개당 캡슐', '개당 정', '개당 중량'];
    const sorted = [...choose1Opts].sort((a, b) => {
      const aIdx = priority.findIndex(p => normalizeOptionName(a.name).includes(p)) ?? 99;
      const bIdx = priority.findIndex(p => normalizeOptionName(b.name).includes(p)) ?? 99;
      return aIdx - bIdx;
    });

    for (const opt of sorted) {
      if (choose1Filled) break;
      const ext = extracted.get(opt.name);
      if (ext) {
        result.push({ name: opt.name, value: ext.value, unit: ext.unit });
        choose1Filled = true;
      }
    }
  }

  // 비-택1 옵션 추가 (추출 실패 시 안전한 기본값)
  for (const opt of buyOpts) {
    if (opt.choose1) continue; // 이미 위에서 처리됨
    const ext = extracted.get(opt.name);
    if (ext) {
      result.push({ name: opt.name, value: ext.value, unit: ext.unit });
    } else if (opt.required) {
      // 기본값으로 채움 — 쿠팡 등록 거부 방지
      const fallback = getRequiredFallback(opt.name, productName);
      if (fallback) {
        result.push({ name: opt.name, value: fallback, unit: opt.unit });
        warnings.push(`'${opt.name}' → 기본값 "${fallback}" 사용`);
      } else {
        warnings.push(`필수 옵션 '${opt.name}' 값을 추출할 수 없습니다.`);
      }
    }
  }

  // 택1 그룹 전체 실패 시 경고 (기본값 불가)
  if (choose1Opts.length > 0 && !choose1Filled) {
    const choose1Names = choose1Opts.map((o) => o.name).join('/');
    warnings.push(`택1 필수 옵션 '${choose1Names}' 중 하나도 추출할 수 없습니다.`);
  }

  // ── Confidence 계산 ──
  const nonChoose1Required = buyOpts.filter((o) => o.required && !o.choose1);
  let totalRequired = nonChoose1Required.length;
  let filledRequired = 0;

  if (choose1Opts.some((o) => o.required)) {
    totalRequired += 1;
    if (choose1Filled) filledRequired += 1;
  }

  for (const req of nonChoose1Required) {
    if (result.some((r) => r.name === req.name)) filledRequired += 1;
  }

  const confidence = totalRequired > 0 ? filledRequired / totalRequired : 1;

  return {
    buyOptions: result,
    confidence: Math.round(confidence * 100) / 100,
    warnings,
  };
}

// ─── 필수 옵션 기본값 (추출 실패 시 쿠팡 등록 거부 방지) ──

/**
 * 추출 실패한 필수 옵션에 안전한 기본값을 반환한다.
 * 쿠팡이 허용하는 범용 값만 사용.
 * null이면 기본값 없음 → 경고만 출력.
 */
function getRequiredFallback(optionName: string, productName: string): string | null {
  const n = optionName.toLowerCase();

  // 색상 계열
  if (n.includes('색상') || n.includes('컬러') || n === '색') {
    // 상품명에서 다시 한번 색상 시도 (좀 더 넓은 매칭)
    const color = extractColor(productName);
    return color || '상세페이지 참조';
  }

  // 모델명/품번
  if (n.includes('모델') || n.includes('품번')) {
    return '자체제작';
  }

  // 사이즈
  if (n.includes('사이즈') || n.includes('크기')) {
    const size = extractSize(productName);
    return size || 'FREE';
  }

  // 구성/구성품
  if (n.includes('구성')) {
    return '본품';
  }

  // 맛/향
  if (n.includes('맛') || n.includes('향')) {
    return '상세페이지 참조';
  }

  // 용량 (택1이 아닌 별도 필수)
  if (n === '용량') {
    const ml = extractVolumeMl(productName, { count: undefined, volume: undefined, weight: undefined });
    if (ml !== null) return String(ml);
    return '상세페이지 참조';
  }

  // 중량 (택1이 아닌 별도 필수 — "아령 3kg" 등)
  if (n === '중량') {
    const g = extractWeightG(productName, {});
    if (g !== null) return g >= 1000 ? (g / 1000) + 'kg' : g + 'g';
    return '상세페이지 참조';
  }

  // 길이 (충전케이블 1m, 와이퍼 600mm 등)
  if (n.includes('길이') || n === '길이') {
    const mMatch = productName.match(/(\d+(?:\.\d+)?)\s*m(?!m|l|g|A|B|a|b|Hz)/);
    if (mMatch) return mMatch[1] + 'm';
    const mmMatch = productName.match(/(\d+)\s*mm/i);
    if (mmMatch) return mmMatch[1] + 'mm';
    const cmMatch = productName.match(/(\d+(?:\.\d+)?)\s*cm/i);
    if (cmMatch) return cmMatch[1] + 'cm';
    return '상세페이지 참조';
  }

  // 차종
  if (n.includes('차종')) {
    return '공용';
  }

  // 사용가능인원
  if (n.includes('인원')) {
    return '상세페이지 참조';
  }

  // 가로길이/세로길이
  if (n.includes('가로') || n.includes('세로')) {
    const dimMatch = productName.match(/(\d+)\s*[xX×]\s*(\d+)/);
    if (dimMatch) {
      return n.includes('가로') ? dimMatch[1] + 'mm' : dimMatch[2] + 'mm';
    }
    return '상세페이지 참조';
  }

  // 신발사이즈
  if (n.includes('신발')) {
    // 숫자 3자리 (230~300) 추출
    const shoeMatch = productName.match(/(\d{3})\s*(mm)?/);
    if (shoeMatch) return shoeMatch[1];
    return '상세페이지 참조';
  }

  // 총 수량
  if (n.includes('총') && n.includes('수량')) {
    return String(extractCount(productName, {}));
  }

  // 기저귀 단계
  if (n.includes('단계')) {
    const stageMatch = productName.match(/(\d)\s*단계/);
    if (stageMatch) return stageMatch[1] + '단계';
    if (productName.includes('신생아')) return '신생아';
    if (productName.includes('대형')) return '대형';
    if (productName.includes('특대')) return '특대형';
    return '상세페이지 참조';
  }

  // 주원료/원료
  if (n.includes('원료') || n.includes('주원료')) {
    return '상세페이지 참조';
  }

  // RAM/메모리
  if (n.includes('ram') || n.includes('메모리') || n.includes('저장')) {
    const memMatch = productName.match(/(\d+)\s*(GB|TB|MB)/i);
    if (memMatch) return memMatch[1] + memMatch[2].toUpperCase();
    return '상세페이지 참조';
  }

  // 전구 색상
  if (n.includes('전구') && n.includes('색상')) {
    if (productName.includes('주광색')) return '주광색';
    if (productName.includes('전구색')) return '전구색';
    if (productName.includes('주백색')) return '주백색';
    return '상세페이지 참조';
  }

  // 수산물/농산물 중량
  if ((n.includes('수산물') || n.includes('농산물')) && n.includes('중량')) {
    const wt = extractWeightG(productName, {});
    if (wt !== null) return wt >= 1000 ? (wt / 1000) + 'kg' : wt + 'g';
    return '상세페이지 참조';
  }

  // 개당 수량 (택1이 아닌 별도 필수 — 화장지 등)
  if (n === '개당 수량') {
    const pc = extractPerCount(productName, {});
    if (pc !== null) return String(pc);
    return '상세페이지 참조';
  }

  return null;
}
