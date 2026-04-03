// ============================================================
// 구매옵션 자동 추출 서비스 (5-Layer Extraction Pipeline)
//
// Layer 1: 정규식 (기존)           → ~65% 채움  | 무료
// Layer 2: tags/description 마이닝  → +10%      | 무료
// Layer 3: 상품정보 이미지 OCR      → +15%      | ~$0.01/상품
// Layer 4: AI 추론 (잔여 옵션)      → +8%       | ~$0.002/상품
// Layer 5: 스마트 fallback (개선)   → +2%       | 무료
// ============================================================

import { getCategoryDetails, type CategoryDetails } from './category-matcher';
import { OCR_TO_BUYOPTION } from '../data/ocr-field-mapping';

// ─── Types ───────────────────────────────────────────────────

export interface ExtractedOptions {
  buyOptions: { name: string; value: string; unit?: string }[];
  confidence: number;
  warnings: string[];  // missing required fields
  /** 총 수량 (unitCount용): perCount × count 또는 count. 쿠팡의 unitCount는 묶음 내 총 수량. */
  totalUnitCount?: number;
}

/** 5-Layer 추출을 위한 확장 컨텍스트 */
export interface ProductContext {
  productName: string;
  categoryCode: string;
  brand?: string;
  tags?: string[];
  description?: string;
  ocrSpecs?: Record<string, string>;  // Phase 2 OCR 결과
  categoryPath?: string;              // AI 추론에 활용
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
 * ⚠️ 주의: "콘드로이친1200정 60정" → 60만 추출 (1200은 성분 함량)
 * 상품명에 "성분명+숫자+정" 형태가 여러 번 나올 수 있음.
 * 마지막 매칭을 사용 — 실제 정제수는 상품명 끝부분에 위치.
 * 500 초과 숫자는 성분 함량일 가능성이 높으므로 건너뜀.
 */
function extractTabletCount(name: string): number | null {
  const TABLET_RE = /(\d+)\s*(정|캡슐|알|타블렛|소프트젤|포(?!기|인))/g;
  const matches: { value: number; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = TABLET_RE.exec(name)) !== null) {
    matches.push({ value: parseInt(m[1], 10), index: m.index });
  }
  if (matches.length === 0) return null;

  // 500 이하인 매칭만 후보 (500 초과는 성분 함량: 콘드로이친1200, 글루코사민1500 등)
  const reasonable = matches.filter(x => x.value <= 500);
  if (reasonable.length > 0) {
    // 후보 중 가장 마지막(상품명 뒤쪽) 것 사용
    return reasonable[reasonable.length - 1].value;
  }

  // 전부 500 초과면 가장 마지막 것 사용 (실제로 대용량일 수 있음)
  return matches[matches.length - 1].value;
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

// ─── Option value sanitization ──────────────────────────────

/**
 * 구매옵션 값을 쿠팡 API가 허용하는 형식으로 정규화한다.
 *
 * 핵심 규칙:
 * - unit이 있는 옵션 (ml, g, 개 등) → 값은 **숫자만** 허용
 *   예: "500g" → "500", "250ml" → "250"
 * - unit이 없는 옵션 (브랜드, 색상 등) → 텍스트 허용하되 특수문자 제거
 *
 * 이 함수를 거치지 않고 attributes에 들어가면:
 * "유효하지 않은 구매 옵션 값 혹은 단위가 존재합니다" 에러 발생
 */
function sanitizeBuyOptionValue(value: string, unit?: string): string | null {
  if (!value || value.trim() === '') return null;
  const trimmed = value.trim();

  if (unit) {
    // 단위가 있는 옵션 → 숫자만 추출
    // "500g" → "500", "1.5kg" → "1500" (kg→g), "250ml" → "250"
    const numericMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|mL|L|리터|ℓ|개|EA|ea)?/i);
    if (numericMatch) {
      let numVal = parseFloat(numericMatch[1]);
      const extractedUnit = (numericMatch[2] || '').toLowerCase();

      // 단위 변환: 옵션 단위와 추출된 단위가 다르면 변환
      if (unit === 'g' && extractedUnit === 'kg') numVal *= 1000;
      if (unit === 'ml' && (extractedUnit === 'l' || extractedUnit === '리터' || extractedUnit === 'ℓ')) numVal *= 1000;

      return String(numVal);
    }

    // 순수 숫자만 있는 경우
    const pureNum = trimmed.match(/^(\d+(?:\.\d+)?)$/);
    if (pureNum) return pureNum[1];

    // 숫자를 전혀 추출할 수 없으면 → null (이 값은 사용 불가)
    return null;
  }

  // 단위 없는 옵션 → 텍스트 그대로 (단, 빈 값/특수문자만은 제외)
  const cleaned = trimmed.replace(/[\x00-\x1f]/g, '').trim();
  return cleaned || null;
}

// ─── Main extraction logic ──────────────────────────────────

/**
 * 상품명과 카테고리 코드로 구매옵션 값을 자동 추출한다.
 *
 * 카테고리의 buyOptions 정의를 읽고, 각 옵션에 맞는 값을
 * 상품명에서 패턴 매칭으로 추출한다.
 */
export async function extractOptions(productName: string, categoryCode: string): Promise<ExtractedOptions> {
  const details = await getCategoryDetails(categoryCode);
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

  // 개당 캡슐/정 택1 옵션 존재 여부 확인
  const hasTabletOpt = buyOpts.some(o => {
    const n = normalizeOptionName(o.name);
    return n.includes('캡슐') || n.includes('정');
  });

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

  // ── 1.5단계: 개당 캡슐/정 × 수량 → 총합 보정 ──
  // 쿠팡은 "개당 캡슐/정" 값으로 단위가격을 계산함.
  // "1정 30개" → 개당캡슐/정=1, 수량=30 이면 단위가격=가격/1=전액 → 노출제한!
  // 정상: 개당캡슐/정=30(총정수), 수량=1 → 단위가격=가격/30 → 아이템위너
  if (hasTabletOpt) {
    let tabletKey: string | null = null;
    let tabletVal = 0;
    for (const [key, entry] of extracted) {
      const n = normalizeOptionName(key);
      if (n.includes('캡슐') || n.includes('정')) {
        tabletKey = key;
        tabletVal = parseInt(entry.value, 10) || 0;
        break;
      }
    }
    let countKey: string | null = null;
    let countVal = 0;
    for (const [key, entry] of extracted) {
      if (normalizeOptionName(key) === '수량') {
        countKey = key;
        countVal = parseInt(entry.value, 10) || 0;
        break;
      }
    }

    if (tabletKey && countKey && tabletVal >= 1 && countVal > 1) {
      // 총 정/캡슐 수를 개당 옵션에 넣고, 수량은 1로 고정
      // "1정 30개" → 개당=30, 수량=1
      // "60캡슐 2통" → 개당=120, 수량=1
      const totalTablets = tabletVal * countVal;
      const tabletEntry = extracted.get(tabletKey)!;
      extracted.set(tabletKey, { value: String(totalTablets), unit: tabletEntry.unit });
      extracted.set(countKey, { value: '1', unit: '개' });
    }

    // 개월분 기반 추정: "2개월 1캡슐" → 1캡슐/일 × 60일 = 60캡슐
    if (tabletKey && tabletVal <= 1) {
      const monthMatch = productName.match(/(\d+)\s*개월/);
      if (monthMatch) {
        const months = parseInt(monthMatch[1], 10);
        if (months >= 1 && months <= 24) {
          const estimatedTotal = months * 30; // 1개월 = 30일 기준
          const tabletEntry = extracted.get(tabletKey)!;
          extracted.set(tabletKey, { value: String(estimatedTotal), unit: tabletEntry.unit });
          if (countKey) extracted.set(countKey, { value: '1', unit: '개' });
        }
      }
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
      const fallback = getRequiredFallback(opt.name, productName, opt.unit);
      if (fallback) {
        // 단위형 옵션은 반드시 숫자여야 함 — 이중 안전장치
        if (opt.unit) {
          const numMatch = fallback.match(/(\d+(?:\.\d+)?)/);
          const safeValue = numMatch ? numMatch[1] : '1';
          result.push({ name: opt.name, value: safeValue, unit: opt.unit });
          warnings.push(`'${opt.name}' → 기본값 "${safeValue}${opt.unit}" 사용`);
        } else {
          result.push({ name: opt.name, value: fallback, unit: opt.unit });
          warnings.push(`'${opt.name}' → 기본값 "${fallback}" 사용`);
        }
      } else {
        warnings.push(`필수 옵션 '${opt.name}' 값을 추출할 수 없습니다.`);
      }
    }
  }

  // 택1 그룹 전체 실패 시 첫 번째 필수옵션에 안전한 기본값 설정
  if (choose1Opts.length > 0 && !choose1Filled) {
    const choose1Names = choose1Opts.map((o) => o.name).join('/');
    warnings.push(`택1 필수 옵션 '${choose1Names}' 중 하나도 추출할 수 없습니다.`);
    // 첫 번째 택1 옵션에 기본값 추가 (등록 실패 방지)
    const first = choose1Opts[0];
    if (first.required) {
      // 단위형 택1 옵션: 무조건 숫자 "1" (텍스트+단위 → API 에러)
      const fallbackValue = first.unit ? '1' : '상세페이지 참조';
      result.push({ name: first.name, value: fallbackValue, unit: first.unit });
      choose1Filled = true;
      warnings.push(`'${first.name}' → 기본값 "${fallbackValue}${first.unit || ''}" 사용`);
    }
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

  // totalUnitCount 계산: 정제수 × 수량 (또는 perCount × count)
  // 쿠팡의 unitCount는 "묶음 내 총 수량" — 단위가격 = 가격 ÷ unitCount
  // 예: "80매 x 10팩" → 80 × 10 = 800
  // 예: "120캡슐 2통" → 120 × 2 = 240
  // 예: "1정 30개" → 1 × 30 = 30
  const count = composite.count || extractCount(productName, composite);
  const perCount = composite.perCount || null;
  const tabletCountForUnit = extractTabletCount(productName);

  let totalUnitCount: number;
  if (tabletCountForUnit !== null && tabletCountForUnit >= 1) {
    // 건강보조식품: 정/캡슐 수 × 수량 = 총 정제 수
    totalUnitCount = tabletCountForUnit * count;
    // 개월분 보정: "2개월 1캡슐" → 1×1=1 이지만, 2×30=60이 맞음
    if (totalUnitCount <= 1) {
      const monthMatch = productName.match(/(\d+)\s*개월/);
      if (monthMatch) {
        const months = parseInt(monthMatch[1], 10);
        if (months >= 1 && months <= 24) totalUnitCount = months * 30;
      }
    }
  } else if (perCount) {
    totalUnitCount = perCount * count;
  } else {
    totalUnitCount = count;
  }

  return {
    buyOptions: result,
    confidence: Math.round(confidence * 100) / 100,
    warnings,
    totalUnitCount: totalUnitCount > 0 ? totalUnitCount : undefined,
  };
}

// ─── 필수 옵션 기본값 (추출 실패 시 쿠팡 등록 거부 방지) ──

/**
 * 추출 실패한 필수 옵션에 안전한 기본값을 반환한다.
 * 쿠팡이 허용하는 범용 값만 사용.
 * null이면 기본값 없음 → 경고만 출력.
 */
function getRequiredFallback(optionName: string, productName: string, unit?: string): string | null {
  const n = optionName.toLowerCase();

  // ── 단위형 옵션 최종 안전장치 ──
  // unit이 있는데 숫자를 추출할 수 없으면 "1" 반환 (텍스트 반환 절대 금지)
  // "상세페이지 참조" + unit → "상세페이지 참조ml" → 쿠팡 API 에러
  const numericFallback = unit ? '1' : null;

  // 색상 계열
  if (n.includes('색상') || n.includes('컬러') || n === '색') {
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
    return numericFallback;
  }

  // 중량 (택1이 아닌 별도 필수 — "아령 3kg" 등)
  if (n === '중량') {
    const g = extractWeightG(productName, {});
    if (g !== null) {
      // 단위에 맞게 숫자만 반환 (unit suffix 없이)
      if (unit === 'kg') return String(g / 1000);
      return String(g); // g 또는 기본
    }
    return numericFallback;
  }

  // 길이 (충전케이블 1m, 와이퍼 600mm 등)
  if (n.includes('길이') || n === '길이') {
    const mMatch = productName.match(/(\d+(?:\.\d+)?)\s*m(?!m|l|g|A|B|a|b|Hz)/);
    if (mMatch) return mMatch[1];
    const mmMatch = productName.match(/(\d+)\s*mm/i);
    if (mmMatch) return mmMatch[1];
    const cmMatch = productName.match(/(\d+(?:\.\d+)?)\s*cm/i);
    if (cmMatch) return cmMatch[1];
    return numericFallback;
  }

  // 차종
  if (n.includes('차종')) {
    return '공용';
  }

  // 사용가능인원
  if (n.includes('인원')) {
    return unit ? '1' : '상세페이지 참조';
  }

  // 가로길이/세로길이
  if (n.includes('가로') || n.includes('세로')) {
    const dimMatch = productName.match(/(\d+)\s*[xX×]\s*(\d+)/);
    if (dimMatch) {
      return n.includes('가로') ? dimMatch[1] : dimMatch[2];
    }
    return numericFallback;
  }

  // 신발사이즈
  if (n.includes('신발')) {
    const shoeMatch = productName.match(/(\d{3})\s*(mm)?/);
    if (shoeMatch) return shoeMatch[1];
    return '250'; // 250mm 기본값 (단위형이므로 텍스트 불가)
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
    return unit ? '1' : '상세페이지 참조';
  }

  // 주원료/원료
  if (n.includes('원료') || n.includes('주원료')) {
    return '상세페이지 참조';
  }

  // RAM/메모리
  if (n.includes('ram') || n.includes('메모리') || n.includes('저장')) {
    const memMatch = productName.match(/(\d+)\s*(GB|TB|MB)/i);
    if (memMatch) return memMatch[1]; // 숫자만 반환, unit은 opt.unit에서
    return numericFallback;
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
    if (wt !== null) {
      if (unit === 'kg') return String(wt / 1000);
      return String(wt);
    }
    return numericFallback;
  }

  // 개당 수량 (택1이 아닌 별도 필수 — 화장지 등)
  if (n === '개당 수량') {
    const pc = extractPerCount(productName, {});
    if (pc !== null) return String(pc);
    return numericFallback ?? '1';
  }

  // 출고희망일 (절임배추 등 신선식품)
  if (n.includes('출고') && n.includes('일')) {
    return '주문 확인 후 순차배송';
  }

  // 쌀 등급
  if (n.includes('쌀') && n.includes('등급')) {
    return '상등급';
  }

  // 계란 구수 (30구, 15구 등)
  if (n.includes('계란') && n.includes('구수')) {
    const eggMatch = productName.match(/(\d+)\s*(구|개|알)/);
    if (eggMatch) return eggMatch[1];
    return '30';
  }

  // 원두 분쇄타입
  if (n.includes('분쇄')) {
    if (productName.includes('분쇄') || productName.includes('그라인드') || productName.includes('드립'))
      return '분쇄';
    if (productName.includes('홀빈') || productName.includes('원두'))
      return '홀빈';
    return '홀빈';
  }

  // ── 매칭되지 않은 옵션: unit 여부에 따라 결정 ──
  return numericFallback;
}

// ═══════════════════════════════════════════════════════════════
// Layer 2: tags / description / brand 마이닝
// ═══════════════════════════════════════════════════════════════

const FLAVOR_KEYWORDS = new Set([
  '딸기', '레몬', '바닐라', '초코', '초콜릿', '카라멜', '민트', '블루베리',
  '라즈베리', '망고', '복숭아', '피치', '체리', '포도', '사과', '오렌지',
  '자몽', '라임', '코코넛', '바나나', '키위', '파인애플', '수박', '멜론',
  '무화과', '석류', '유자', '매실', '자두', '살구', '아사이', '크랜베리',
  '무향', '무맛', '플레인', '오리지널', '그린티', '녹차', '홍차', '얼그레이',
  '꿀', '허니', '시나몬', '생강', '로즈', '라벤더', '재스민', '캐모마일',
  '아몬드', '헤이즐넛', '피넛', '견과', '흑당', '말차', '모카', '에스프레소',
]);

const ORIGIN_KEYWORDS: Record<string, string> = {
  '국내산': '국내산', '국산': '국내산', '한국산': '국내산',
  '미국산': '미국산', '미국': '미국산', 'USA': '미국산',
  '독일산': '독일산', '독일': '독일산',
  '일본산': '일본산', '일본': '일본산',
  '중국산': '중국산', '중국': '중국산',
  '호주산': '호주산', '호주': '호주산', '뉴질랜드산': '뉴질랜드산',
  '캐나다산': '캐나다산', '프랑스산': '프랑스산', '이탈리아산': '이탈리아산',
  '스페인산': '스페인산', '인도산': '인도산', '베트남산': '베트남산',
  '태국산': '태국산', '필리핀산': '필리핀산', '인도네시아산': '인도네시아산',
  '대만산': '대만산', '스위스산': '스위스산', '영국산': '영국산',
};

interface Layer2Result {
  brand?: string;
  flavor?: string;
  origin?: string;
  modelName?: string;
  color?: string;
  size?: string;
}

/** tags, description, brand에서 추가 정보 마이닝 */
function mineProductContext(ctx: ProductContext): Layer2Result {
  const result: Layer2Result = {};

  // 브랜드 직접 채움
  if (ctx.brand && ctx.brand.trim()) {
    result.brand = ctx.brand.trim();
  }

  // tags에서 맛/향 키워드 추출
  if (ctx.tags && ctx.tags.length > 0) {
    const allTagText = ctx.tags.join(' ');
    for (const kw of FLAVOR_KEYWORDS) {
      if (allTagText.includes(kw)) {
        result.flavor = kw;
        break;
      }
    }
    // tags에서 원산지 추출
    for (const [keyword, normalized] of Object.entries(ORIGIN_KEYWORDS)) {
      if (allTagText.includes(keyword)) {
        result.origin = normalized;
        break;
      }
    }
    // tags에서 색상 추출 (Layer 1에서 못 찾은 경우)
    for (const tag of ctx.tags) {
      const tagLower = tag.toLowerCase();
      for (const color of KNOWN_COLORS) {
        if (tagLower === color.toLowerCase() || tagLower.includes(color.toLowerCase())) {
          result.color = color;
          break;
        }
      }
      if (result.color) break;
    }
  }

  // description에서 모델명 추출
  if (ctx.description) {
    const modelPatterns = [
      /모델명\s*[:：]\s*([^\n,]+)/,
      /모델\s*[:：]\s*([^\n,]+)/,
      /품번\s*[:：]\s*([^\n,]+)/,
      /형번\s*[:：]\s*([^\n,]+)/,
      /MODEL\s*[:：]\s*([^\n,]+)/i,
    ];
    for (const pat of modelPatterns) {
      const m = ctx.description.match(pat);
      if (m) {
        result.modelName = m[1].trim().slice(0, 50);
        break;
      }
    }
    // description에서 색상 추출
    if (!result.color) {
      const colorMatch = ctx.description.match(/색상\s*[:：]\s*([가-힣a-zA-Z]+)/);
      if (colorMatch) result.color = colorMatch[1];
    }
    // description에서 사이즈 추출
    if (!result.size) {
      const sizeMatch = ctx.description.match(/사이즈\s*[:：]\s*([^\n,]+)/);
      if (sizeMatch) result.size = sizeMatch[1].trim();
    }
    // description에서 원산지 추출
    if (!result.origin) {
      const originMatch = ctx.description.match(/원산지\s*[:：]\s*([^\n,]+)/);
      if (originMatch) result.origin = originMatch[1].trim();
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Layer 3: OCR Specs 매핑
// ═══════════════════════════════════════════════════════════════

/** OCR 스펙 데이터에서 buyOption 값 추출 */
function mapOcrSpecsToOptions(
  ocrSpecs: Record<string, string>,
  buyOpts: { name: string; required: boolean; unit?: string; choose1?: boolean }[]
): Map<string, string> {
  const mapped = new Map<string, string>();

  for (const [ocrField, ocrValue] of Object.entries(ocrSpecs)) {
    if (!ocrValue || ocrValue.trim() === '' || ocrValue === '-') continue;

    // OCR 필드명 → buyOption 후보 이름 목록
    const buyOptionNames = OCR_TO_BUYOPTION[ocrField];
    if (!buyOptionNames) continue;

    for (const buyOptName of buyOptionNames) {
      // 이 buyOption이 실제 카테고리에 존재하는지 확인
      const match = buyOpts.find(o => {
        const normalized = normalizeOptionName(o.name);
        return normalized === buyOptName || normalized.includes(buyOptName);
      });
      if (match && !mapped.has(match.name)) {
        // 단위가 있는 옵션은 숫자만 허용 → sanitize
        const sanitized = sanitizeBuyOptionValue(ocrValue.trim(), match.unit);
        if (sanitized) mapped.set(match.name, sanitized);
      }
    }
  }

  return mapped;
}

// ═══════════════════════════════════════════════════════════════
// Layer 4: AI 추론 (잔여 미충족 옵션 일괄 추론)
// ═══════════════════════════════════════════════════════════════

async function inferRemainingOptionsAI(
  unfilledOptions: { name: string; unit?: string }[],
  context: ProductContext,
  layer2: Layer2Result,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (unfilledOptions.length === 0) return result;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[option-extractor] OPENAI_API_KEY 없음 → AI 추론 스킵');
    return result;
  }

  const optionList = unfilledOptions.map(o => `- ${o.name}${o.unit ? ` (단위: ${o.unit})` : ''}`).join('\n');

  const contextParts: string[] = [
    `상품명: ${context.productName}`,
    context.brand ? `브랜드: ${context.brand}` : '',
    context.categoryPath ? `카테고리: ${context.categoryPath}` : '',
    context.tags?.length ? `태그: ${context.tags.join(', ')}` : '',
    context.description ? `설명: ${context.description.slice(0, 500)}` : '',
    context.ocrSpecs ? `OCR 스펙: ${JSON.stringify(context.ocrSpecs)}` : '',
    layer2.flavor ? `맛/향: ${layer2.flavor}` : '',
    layer2.origin ? `원산지: ${layer2.origin}` : '',
    layer2.modelName ? `모델명: ${layer2.modelName}` : '',
  ].filter(Boolean);

  const prompt = `당신은 쿠팡 상품 등록 전문가입니다.
아래 상품 정보를 바탕으로 미충족된 구매옵션 값을 추론하세요.

${contextParts.join('\n')}

미충족 옵션:
${optionList}

규칙:
- 확실한 값만 채우세요. 추측이 불확실하면 빈 문자열 ""로 두세요.
- 숫자 단위 옵션은 숫자만 반환 (예: "500" not "500ml")
- 색상은 한글로 (예: "블랙" not "black")
- JSON 객체로 응답: { "옵션명": "값", ... }`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      console.warn(`[option-extractor] AI 추론 API 오류: ${res.status}`);
      return result;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return result;

    const parsed = JSON.parse(content);
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'string' && val.trim() !== '') {
        result.set(key, val.trim());
      }
    }

    console.log(`[option-extractor] AI 추론 완료: ${result.size}개 옵션 채움 (비용 ~$0.002)`);
  } catch (err) {
    console.warn('[option-extractor] AI 추론 실패:', err instanceof Error ? err.message : err);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// 도서 카테고리 감지
// ═══════════════════════════════════════════════════════════════

const BOOK_CATEGORY_PREFIXES = [
  '72', // 도서 대분류 (쿠팡)
];

function isBookCategory(categoryCode: string, categoryPath?: string): boolean {
  if (categoryPath && /^도서[>\/]/.test(categoryPath)) return true;
  return BOOK_CATEGORY_PREFIXES.some(prefix => categoryCode.startsWith(prefix));
}

// ═══════════════════════════════════════════════════════════════
// extractOptionsEnhanced — 5-Layer Pipeline
// ═══════════════════════════════════════════════════════════════

/**
 * 5-Layer 추출 파이프라인으로 구매옵션을 추출한다.
 *
 * Layer 1: 정규식 (기존 extractOptionsFromDetails)
 * Layer 2: tags/description/brand 마이닝
 * Layer 3: OCR 스펙 매핑
 * Layer 4: AI 추론 (잔여 미충족 옵션)
 * Layer 5: 스마트 fallback (기존 getRequiredFallback 개선)
 */
export async function extractOptionsEnhanced(context: ProductContext): Promise<ExtractedOptions> {
  // 도서 카테고리 → 기존 로직 폴백
  if (isBookCategory(context.categoryCode, context.categoryPath)) {
    return extractOptions(context.productName, context.categoryCode);
  }

  const details = await getCategoryDetails(context.categoryCode);
  if (!details) {
    console.warn(`[option-extractor] Category ${context.categoryCode} not found in details DB`);
    return { buyOptions: [], confidence: 0, warnings: [`카테고리 ${context.categoryCode}를 찾을 수 없습니다.`] };
  }

  const buyOpts = details.buyOptions;
  if (!buyOpts || buyOpts.length === 0) {
    return { buyOptions: [], confidence: 1, warnings: [] };
  }

  // ── Layer 1: 정규식 추출 (기존 로직) ──
  const composite = extractComposite(context.productName);
  const layer1 = new Map<string, { value: string; unit?: string }>();
  const warnings: string[] = [];

  const hasTabletOpt = buyOpts.some(o => {
    const n = normalizeOptionName(o.name);
    return n.includes('캡슐') || n.includes('정');
  });

  for (const opt of buyOpts) {
    const name = normalizeOptionName(opt.name);
    const unit = opt.unit;
    let value: string | null = null;

    if (name === '수량' && unit === '개') {
      value = String(extractCount(context.productName, composite));
    } else if (name === '개당 용량' && unit === 'ml') {
      const ml = extractVolumeMl(context.productName, composite);
      if (ml !== null) value = String(ml);
    } else if (name === '개당 중량' && unit === 'g') {
      const g = extractWeightG(context.productName, composite);
      if (g !== null) value = String(g);
    } else if (name === '개당 수량' && unit === '개') {
      const perCount = extractPerCount(context.productName, composite);
      if (perCount !== null) value = String(perCount);
    } else if (name.includes('캡슐') || name.includes('정')) {
      const tabletCount = extractTabletCount(context.productName);
      if (tabletCount !== null) value = String(tabletCount);
    } else if (name === '사이즈' || name.includes('사이즈') || name === '크기') {
      value = extractSize(context.productName);
    } else if (name === '색상' || name.includes('색상') || name === '컬러' || name.includes('컬러')) {
      value = extractColor(context.productName);
    }

    if (value !== null) {
      layer1.set(opt.name, { value, unit });
    }
  }

  // ── Layer 2: tags/description/brand 마이닝 ──
  const layer2 = mineProductContext(context);

  // Layer 2 결과를 Layer 1에서 못 채운 옵션에 적용
  for (const opt of buyOpts) {
    if (layer1.has(opt.name)) continue;
    const name = normalizeOptionName(opt.name);

    if ((name.includes('브랜드')) && layer2.brand) {
      layer1.set(opt.name, { value: layer2.brand, unit: opt.unit });
    } else if ((name.includes('맛') || name.includes('향')) && layer2.flavor) {
      layer1.set(opt.name, { value: layer2.flavor, unit: opt.unit });
    } else if ((name.includes('원산지') || name.includes('제조국')) && layer2.origin) {
      layer1.set(opt.name, { value: layer2.origin, unit: opt.unit });
    } else if ((name.includes('모델') || name.includes('품번')) && layer2.modelName) {
      layer1.set(opt.name, { value: layer2.modelName, unit: opt.unit });
    } else if ((name.includes('색상') || name.includes('컬러')) && layer2.color) {
      layer1.set(opt.name, { value: layer2.color, unit: opt.unit });
    } else if ((name.includes('사이즈') || name.includes('크기')) && layer2.size) {
      layer1.set(opt.name, { value: layer2.size, unit: opt.unit });
    }
  }

  // ── Layer 3: OCR 스펙 매핑 ──
  if (context.ocrSpecs && Object.keys(context.ocrSpecs).length > 0) {
    const ocrMapped = mapOcrSpecsToOptions(context.ocrSpecs, buyOpts);
    for (const [optName, ocrValue] of ocrMapped) {
      if (!layer1.has(optName)) {
        layer1.set(optName, { value: ocrValue, unit: buyOpts.find(o => o.name === optName)?.unit });
      }
    }
  }

  // ── 택1 그룹 + 정/캡슐 보정 (기존 로직 재사용) ──
  if (hasTabletOpt) {
    let tabletKey: string | null = null;
    let tabletVal = 0;
    for (const [key, entry] of layer1) {
      const n = normalizeOptionName(key);
      if (n.includes('캡슐') || n.includes('정')) {
        tabletKey = key;
        tabletVal = parseInt(entry.value, 10) || 0;
        break;
      }
    }
    let countKey: string | null = null;
    let countVal = 0;
    for (const [key, entry] of layer1) {
      if (normalizeOptionName(key) === '수량') {
        countKey = key;
        countVal = parseInt(entry.value, 10) || 0;
        break;
      }
    }

    if (tabletKey && countKey && tabletVal >= 1 && countVal > 1) {
      const totalTablets = tabletVal * countVal;
      const tabletEntry = layer1.get(tabletKey)!;
      layer1.set(tabletKey, { value: String(totalTablets), unit: tabletEntry.unit });
      layer1.set(countKey, { value: '1', unit: '개' });
    }

    if (tabletKey && tabletVal <= 1) {
      const monthMatch = context.productName.match(/(\d+)\s*개월/);
      if (monthMatch) {
        const months = parseInt(monthMatch[1], 10);
        if (months >= 1 && months <= 24) {
          const estimatedTotal = months * 30;
          const tabletEntry = layer1.get(tabletKey)!;
          layer1.set(tabletKey, { value: String(estimatedTotal), unit: tabletEntry.unit });
          if (countKey) layer1.set(countKey, { value: '1', unit: '개' });
        }
      }
    }
  }

  // ── Layer 4: AI 추론 (필수 옵션 중 미충족분) ──
  const choose1Opts = buyOpts.filter(o => o.choose1);
  const choose1Filled = choose1Opts.some(o => layer1.has(o.name));
  const unfilledRequired: { name: string; unit?: string }[] = [];

  for (const opt of buyOpts) {
    if (layer1.has(opt.name)) continue;
    if (!opt.required) continue;
    if (opt.choose1 && choose1Filled) continue;
    unfilledRequired.push({ name: opt.name, unit: opt.unit });
  }

  if (unfilledRequired.length > 0) {
    const aiResults = await inferRemainingOptionsAI(unfilledRequired, context, layer2);
    for (const [optName, aiValue] of aiResults) {
      const opt = buyOpts.find(o => o.name === optName || normalizeOptionName(o.name) === optName);
      if (opt && !layer1.has(opt.name)) {
        // AI 추론 값도 sanitize — 숫자 옵션에 텍스트가 들어가는 것 방지
        const sanitized = sanitizeBuyOptionValue(aiValue, opt.unit);
        if (sanitized) {
          layer1.set(opt.name, { value: sanitized, unit: opt.unit });
        }
      }
    }
  }

  // ── 결과 조립 (택1 그룹 해소 + Layer 5 fallback) ──
  const result: { name: string; value: string; unit?: string }[] = [];
  let choose1FilledFinal = false;

  if (choose1Opts.length > 0) {
    const priority = ['개당 용량', '개당 캡슐', '개당 정', '개당 중량'];
    const sorted = [...choose1Opts].sort((a, b) => {
      const aIdx = priority.findIndex(p => normalizeOptionName(a.name).includes(p)) ?? 99;
      const bIdx = priority.findIndex(p => normalizeOptionName(b.name).includes(p)) ?? 99;
      return aIdx - bIdx;
    });

    for (const opt of sorted) {
      if (choose1FilledFinal) break;
      const ext = layer1.get(opt.name);
      if (ext) {
        result.push({ name: opt.name, value: ext.value, unit: ext.unit });
        choose1FilledFinal = true;
      }
    }
  }

  for (const opt of buyOpts) {
    if (opt.choose1) continue;
    const ext = layer1.get(opt.name);
    if (ext) {
      result.push({ name: opt.name, value: ext.value, unit: ext.unit });
    } else if (opt.required) {
      const fallback = getRequiredFallback(opt.name, context.productName, opt.unit);
      if (fallback) {
        // 단위형 옵션은 반드시 숫자여야 함 — 이중 안전장치
        if (opt.unit) {
          const numMatch = fallback.match(/(\d+(?:\.\d+)?)/);
          const safeValue = numMatch ? numMatch[1] : '1';
          result.push({ name: opt.name, value: safeValue, unit: opt.unit });
          warnings.push(`'${opt.name}' → 기본값 "${safeValue}${opt.unit}" 사용`);
        } else {
          result.push({ name: opt.name, value: fallback, unit: opt.unit });
          warnings.push(`'${opt.name}' → 기본값 "${fallback}" 사용`);
        }
      } else {
        warnings.push(`필수 옵션 '${opt.name}' 값을 추출할 수 없습니다.`);
      }
    }
  }

  if (choose1Opts.length > 0 && !choose1FilledFinal) {
    const choose1Names = choose1Opts.map(o => o.name).join('/');
    warnings.push(`택1 필수 옵션 '${choose1Names}' 중 하나도 추출할 수 없습니다.`);
    const first = choose1Opts[0];
    if (first.required) {
      // 단위형 택1 옵션: 무조건 숫자 "1" (텍스트+단위 → API 에러)
      const fallbackValue = first.unit ? '1' : '상세페이지 참조';
      result.push({ name: first.name, value: fallbackValue, unit: first.unit });
      choose1FilledFinal = true;
      warnings.push(`'${first.name}' → 기본값 "${fallbackValue}${first.unit || ''}" 사용`);
    }
  }

  // ── Confidence 계산 ──
  const nonChoose1Required = buyOpts.filter(o => o.required && !o.choose1);
  let totalRequired = nonChoose1Required.length;
  let filledRequired = 0;

  if (choose1Opts.some(o => o.required)) {
    totalRequired += 1;
    if (choose1FilledFinal) filledRequired += 1;
  }

  for (const req of nonChoose1Required) {
    if (result.some(r => r.name === req.name)) filledRequired += 1;
  }

  const confidence = totalRequired > 0 ? filledRequired / totalRequired : 1;

  // totalUnitCount
  const count = composite.count || extractCount(context.productName, composite);
  const perCount = composite.perCount || null;
  const tabletCountForUnit = extractTabletCount(context.productName);

  let totalUnitCount: number;
  if (tabletCountForUnit !== null && tabletCountForUnit >= 1) {
    totalUnitCount = tabletCountForUnit * count;
    if (totalUnitCount <= 1) {
      const monthMatch = context.productName.match(/(\d+)\s*개월/);
      if (monthMatch) {
        const months = parseInt(monthMatch[1], 10);
        if (months >= 1 && months <= 24) totalUnitCount = months * 30;
      }
    }
  } else if (perCount) {
    totalUnitCount = perCount * count;
  } else {
    totalUnitCount = count;
  }

  return {
    buyOptions: result,
    confidence: Math.round(confidence * 100) / 100,
    warnings,
    totalUnitCount: totalUnitCount > 0 ? totalUnitCount : undefined,
  };
}
