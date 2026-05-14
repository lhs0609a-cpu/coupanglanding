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
import unitDict from '../data/unit-dictionary.json';

// ─── 단위 사전 → 정규식 빌드 ─────────────────────────────────
// unit-dictionary.json만 수정하면 추출 단위 즉시 확장. 코드 deploy 불필요.

function buildAlternation(items: string[]): string {
  // 길이 내림차순 정렬 — 긴 단위가 먼저 매칭되어야 ("베지캡슐" > "베지캡" > "캡슐")
  return [...items].sort((a, b) => b.length - a.length).map(escapeRe).join('|');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const COUNT_UNITS_RE = (() => {
  const u = unitDict.count.units;
  const neg = unitDict.count.negativeLookahead as Record<string, string>;
  // 부정형 lookahead가 필요한 단위는 별도 처리
  const parts = [...u].sort((a, b) => b.length - a.length).map(unit => {
    if (neg[unit]) return `${escapeRe(unit)}(?!${neg[unit]})`;
    return escapeRe(unit);
  });
  return parts.join('|');
})();

const COUNT_UNITS_RE_WITH_SACHET = (() => {
  const u = [...unitDict.count.units, ...unitDict.sachet.units];
  const neg = unitDict.count.negativeLookahead as Record<string, string>;
  const sachetNeg = unitDict.sachet.negativeLookahead;
  const parts = [...u].sort((a, b) => b.length - a.length).map(unit => {
    if (unit === '포') return `포(?!${sachetNeg})`;
    if (neg[unit]) return `${escapeRe(unit)}(?!${neg[unit]})`;
    return escapeRe(unit);
  });
  return parts.join('|');
})();

const TABLET_UNITS_RE = buildAlternation(unitDict.tablet.units);
const SACHET_UNITS_RE = `(?:${unitDict.sachet.units.map(escapeRe).join('|')})(?!${unitDict.sachet.negativeLookahead})`;
const VOL_ML_RE = unitDict.volume.ml.map(escapeRe).join('|');
const VOL_LITER_RE = unitDict.volume.literToMl.filter(s => s !== 'L').map(escapeRe).join('|');
const WT_G_RE = unitDict.weight.g.map(escapeRe).join('|');
const WT_KG_RE = unitDict.weight.kgToG.map(escapeRe).join('|');
const DOSAGE_PREFIX_RE_STR = unitDict.dosagePrefix.prefixes.map(escapeRe).join('|');

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
  displayName?: string;               // AI 생성 노출상품명 (스펙 폴백용)
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

  // ⚠️ dose 단위 감지: "Ng × 30포", "Ng × 112정" 등은 포장 구성 분해.
  // weight/volume는 추출하되, count 숫자 뒤에 dose 단위(포/정/캡슐/알)가 오면
  // count는 설정하지 않음 → 곱셈 폭발 방지.
  // "5g × 120포" → weight=5g, count=undefined
  // "500ml × 3개" → volume=500ml, count=3
  const DOSE_UNIT_AFTER_COUNT = /^(?:포(?!기|인)|정|캡슐|알|타블렛|소프트젤)/;

  // "NNml x N" pattern → 용량 (+수량)
  const vm = name.match(/(\d+(?:\.\d+)?)\s*(ml|mL|ML|㎖)\s*[xX×]\s*(\d+)/i);
  if (vm) {
    result.volume = { value: parseFloat(vm[1]), unit: 'ml' };
    const afterCount = name.slice(vm.index! + vm[0].length).trimStart();
    if (!DOSE_UNIT_AFTER_COUNT.test(afterCount)) {
      result.count = parseInt(vm[3], 10);
    }
  }

  // "NNL x N" pattern → 용량 (L→ml 변환) (+수량)
  // L은 의류 사이즈와 혼동되므로 직전이 알파벳이 아닌 경우만(즉 숫자만 앞)
  const vmL = name.match(/(?<![a-zA-Z])(\d+(?:\.\d+)?)\s*(L|리터|ℓ)\s*[xX×]\s*(\d+)/);
  if (vmL && !result.volume) {
    let val = parseFloat(vmL[1]);
    if (vmL[2] === 'L' && (val < 0.1 || val > 20)) {
      // L 사이즈 의류 등 무관 매칭 방지
    } else {
      val *= 1000;
      result.volume = { value: val, unit: 'ml' };
      const afterCount = name.slice(vmL.index! + vmL[0].length).trimStart();
      if (!DOSE_UNIT_AFTER_COUNT.test(afterCount)) {
        result.count = parseInt(vmL[3], 10);
      }
    }
  }

  // "NNg/kg x N" pattern → 중량 (+수량)
  const wm = name.match(/(\d+(?:\.\d+)?)\s*(g|kg|KG|㎏)\s*[xX×]\s*(\d+)/i);
  if (wm) {
    let wVal = parseFloat(wm[1]);
    if (/kg/i.test(wm[2])) wVal *= 1000;
    result.weight = { value: wVal, unit: 'g' };
    const afterCount = name.slice(wm.index! + wm[0].length).trimStart();
    if (!DOSE_UNIT_AFTER_COUNT.test(afterCount)) {
      result.count = parseInt(wm[3], 10);
    }
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
 * - excludeSachet=true: 카테고리에 캡슐/정 옵션이 있을 때, "포"를 수량에서 제외하여
 *   extractTabletCount와 이중 매칭 방지 (30포,3개 → count=3, tablet=30)
 */
interface CountResult {
  value: number;
  /** true: 실제 패턴 매칭됨, false: 기본값 1 (패턴 없음) */
  found: boolean;
}

/**
 * 수량 추출 (raw 버전) — found=false면 기본값 1.
 * Layer 1.5 displayName 폴백 판단에 사용.
 */
function extractCountRaw(name: string, composite: CompositeResult, excludeSachet = false): CountResult {
  if (composite.count) return { value: composite.count, found: true };

  // "N개입", "N개월" 제외, "N매 x" 패턴도 제외 (composite에서 처리됨)
  // excludeSachet=true일 때 "포"를 수량 단위에서 제외 (캡슐/정 옵션과 이중 매칭 방지)
  // 마지막 매치를 사용: 수량은 상품명 끝부분("...30포 3개")에 위치하는 경우가 많고,
  // 앞부분의 "1박스 세트" 등은 상품 구성 설명이지 실제 판매 수량이 아님
  // "포대"(쌀/곡물 포대 단위)는 항상 count 단위. "포(?!기|인|대)" sachet과 구분.
  // unit-dictionary.json에서 동적 빌드 — 새 단위는 사전에서 추가 (코드 변경 불필요)
  const unitPattern = excludeSachet
    ? new RegExp(`(\\d+)\\s*(${COUNT_UNITS_RE})(?!\\s*[xX×]\\s*\\d)`, 'gi')
    : new RegExp(`(\\d+)\\s*(${COUNT_UNITS_RE_WITH_SACHET})(?!\\s*[xX×]\\s*\\d)`, 'gi');
  const allMatches: { value: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = unitPattern.exec(name)) !== null) {
    allMatches.push({ value: parseInt(m[1], 10) });
  }
  if (allMatches.length > 0) {
    return { value: allMatches[allMatches.length - 1].value, found: true };
  }

  // "N입"도 수량이 될 수 있음 — 단, "N개입"과 구분 필요
  const ipMatch = name.match(/(\d+)\s*입(?!\s*[xX×]\s*\d)/);
  if (ipMatch && !name.includes(ipMatch[1] + '개입')) {
    return { value: parseInt(ipMatch[1], 10), found: true };
  }

  // "N매"가 단독으로 있으면 (x 패턴이 아닌 경우) — 개당 수량이 아닌 총 수량
  if (!composite.perCount) {
    const sheetMatch = name.match(/(\d+)\s*(매|장)(?!\s*[xX×]\s*\d)/);
    if (sheetMatch) return { value: parseInt(sheetMatch[1], 10), found: true };
  }

  // "N개입" — 묶음 수량으로 인식.
  //   volume/weight 동반: "250ml 24개입" → count=24 (24병 세트)
  //   단독: "50개입" → count=50 (50개 묶음)
  // 카테고리에 "개당 수량" 옵션이 별도로 있으면 extractPerCount에서 perCount로도 동시 매핑.
  const gaepipMatch = name.match(/(\d+)\s*개입/);
  if (gaepipMatch) return { value: parseInt(gaepipMatch[1], 10), found: true };

  return { value: 1, found: false }; // 기본값 (실제 패턴 없음)
}

function extractCount(name: string, composite: CompositeResult, excludeSachet = false): number {
  return extractCountRaw(name, composite, excludeSachet).value;
}

/**
 * 개당 용량 (ml) 추출
 */
function extractVolumeMl(name: string, composite: CompositeResult): number | null {
  if (composite.volume) return composite.volume.value;

  // L/리터/ℓ → ml 변환 (마지막 매치 우선)
  const literRe = /(\d+(?:\.\d+)?)\s*(리터|ℓ)(?!\s*[xX×]\s*\d)/gi;
  const literMatches: number[] = [];
  let lm: RegExpExecArray | null;
  while ((lm = literRe.exec(name)) !== null) {
    literMatches.push(parseFloat(lm[1]) * 1000);
  }
  if (literMatches.length > 0) return literMatches[literMatches.length - 1];

  // "L" 단독은 사이즈 L과 혼동 가능 — 0.1 ≤ val ≤ 20 범위만 인정
  const lRe = /(\d+(?:\.\d+)?)\s*L(?!\s*[xX×a-zA-Z])/g;
  const lMatches: number[] = [];
  let lm2: RegExpExecArray | null;
  while ((lm2 = lRe.exec(name)) !== null) {
    const val = parseFloat(lm2[1]);
    if (val >= 0.1 && val <= 20) lMatches.push(val * 1000);
  }
  if (lMatches.length > 0) return lMatches[lMatches.length - 1];

  const mlRe = /(\d+(?:\.\d+)?)\s*(ml|mL|ML|㎖)(?!\s*[xX×]\s*\d)/gi;
  const mlMatches: number[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = mlRe.exec(name)) !== null) {
    mlMatches.push(parseFloat(mm[1]));
  }
  if (mlMatches.length > 0) return mlMatches[mlMatches.length - 1];

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

  // kg → g 변환. 소수점 한글 콤마(2,74kg) 정규화 먼저 수행해 소수점 유실 방지.
  const normalized = name.replace(/(\d),(\d{1,2})(?=\s*(?:kg|KG|㎏|g|그램))/g, '$1.$2');

  // kg 매칭 — 마지막 매치 우선 (상품명 뒤쪽이 진짜 product spec)
  //   예: "원료 100g 함유, 제품 500g" → 500
  //   타이핑 오류 방어(2.74→274)는 실제 농산물 100kg 포대 등 정상값과 충돌하므로 제거.
  const kgRe = /(\d+(?:\.\d+)?)\s*(kg|KG|㎏)(?!\s*[xX×]\s*\d)/gi;
  const kgMatches: number[] = [];
  let km: RegExpExecArray | null;
  while ((km = kgRe.exec(normalized)) !== null) {
    kgMatches.push(parseFloat(km[1]) * 1000);
  }
  if (kgMatches.length > 0) {
    return kgMatches[kgMatches.length - 1];
  }

  // g 직접 추출 — 단, 앞에 m이 붙은 mg는 제외! 마지막 매치 우선.
  const gRe = /(?<![mkμ])(\d+(?:\.\d+)?)\s*(g|그램)(?!\s*[xX×]\s*\d)/gi;
  const gMatches: number[] = [];
  let gm: RegExpExecArray | null;
  while ((gm = gRe.exec(normalized)) !== null) {
    gMatches.push(parseFloat(gm[1]));
  }
  if (gMatches.length > 0) {
    return gMatches[gMatches.length - 1];
  }

  return null;
}

/**
 * 개당 수량 (개입) 추출
 * "80매 x 10팩" → perCount=80 (composite에서 처리)
 * "100개입" → 100
 *
 * 규칙:
 * - "N개입" + 별도 count 패턴(N개/N팩/N병/N세트/N박스/N봉/N통) 동반 →
 *     "N개입"은 perCount, count는 별도 → 둘 다 추출
 *     예: "135g 1개입, 2개" → perCount=1, count=2
 * - "N개입" 단독 + 용량/중량 →
 *     "N개입"은 묶음 수량(count)으로 처리 → perCount 아님
 *     예: "250ml 24개입" → count=24, perCount=null (24병 세트)
 * - "N개입" 단독 + 용량/중량 없음 → perCount
 *     예: "100개입" → perCount=100
 * - "N매" 단독 (composite의 perCount 패턴 외) → perCount 폴백
 *     예: "100매" → perCount=100 (count 옵션 없는 카테고리에서 의미 있음)
 */
function extractPerCount(name: string, composite: CompositeResult): number | null {
  if (composite.perCount) return composite.perCount;

  const gaepipMatch = name.match(/(\d+)\s*개입/);
  if (gaepipMatch) {
    // 다른 count 단위(N개/팩/병/세트/박스/봉/통)가 함께 있으면 → "N개입"은 perCount
    // 단, "N개입" 자체("...개")는 lookahead로 제외해야 함.
    const stripped = name.replace(gaepipMatch[0], '');
    const hasOtherCount = /\d+\s*(개(?!입|월|년)|팩|세트|박스|봉|병|통|족|켤레|롤)/.test(stripped);
    if (hasOtherCount) return parseInt(gaepipMatch[1], 10);

    // count 패턴 없음 → 용량/중량 있으면 묶음 수량(count)이므로 perCount 아님
    const hasVolumeOrWeight = /\d+\s*(ml|mL|ML|㎖|L|리터|ℓ|g|kg|㎏)/i.test(name);
    if (hasVolumeOrWeight) return null;

    // 용량/중량도 없음 → 단순 "100개입" → perCount
    return parseInt(gaepipMatch[1], 10);
  }

  // "N매" 폴백 (composite에서 매×팩 패턴 미매칭일 때 단독 매 수량으로 인정)
  const sheetMatch = name.match(/(\d+)\s*매(?!\s*[xX×]\s*\d)/);
  if (sheetMatch) return parseInt(sheetMatch[1], 10);

  return null;
}

/**
 * 개당 캡슐/정 수 추출 (건강보조식품)
 *
 * ⚠️ 주의: "콘드로이친1200정 60정" → 60만 추출 (1200은 성분 함량)
 * 상품명에 "성분명+숫자+정" 형태가 여러 번 나올 수 있음.
 * 마지막 매칭을 사용 — 실제 정제수는 상품명 끝부분에 위치.
 * 500 초과 숫자는 성분 함량일 가능성이 높으므로 건너뜀.
 *
 * ⚠️ 복용법 제외: "1일 2정", "하루 3캡슐", "매일 1정" 등은
 * 일일 복용량이지 총 정제수가 아니므로 제외한다.
 *
 * ⚠️ "포" 분리: 포(sachet/스틱)는 정/캡슐과 다른 포장 단위.
 * TABLET_RE에서 제외하고 extractSachetCount()로 별도 추출.
 * 포 단위는 수량과 곱하지 않음 (30포 3개 = 30정, 3개 ≠ 90정, 1개).
 */
function extractTabletCount(name: string): number | null {
  // ⚠️ "포" 제외 — 포는 포장단위이므로 extractSachetCount()에서 별도 처리
  // 단위 사전(unit-dictionary.json)에서 동적 빌드 — 새 단위 추가 시 사전 한 줄
  const TABLET_RE = new RegExp(`(\\d+)\\s*(${TABLET_UNITS_RE})(?![a-z가-힣])`, 'gi');
  // 복용법 감지: "1일", "하루", "매일", "N회" 직전의 매치는 일일 복용량
  const DOSAGE_PREFIX_RE = /(?:1일|하루|매일|일일)\s*$/;
  const DOSAGE_POSTFIX_RE = /^\s*[xX×]\s*\d+\s*(?:일|회)/;
  const matches: { value: number; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = TABLET_RE.exec(name)) !== null) {
    // "1일 2정", "하루 3캡슐" 등 복용법 패턴 제외
    const prefix = name.slice(Math.max(0, m.index - 10), m.index);
    if (DOSAGE_PREFIX_RE.test(prefix)) continue;
    // "2정 x 30일" 등 복용법 패턴 제외
    const postfix = name.slice(m.index + m[0].length, m.index + m[0].length + 15);
    if (DOSAGE_POSTFIX_RE.test(postfix)) continue;
    // "N회 분량" 직전 패턴: "1회 2정" → 1회 복용량
    const dosePrefix2 = name.slice(Math.max(0, m.index - 8), m.index);
    if (/\d+\s*회\s*$/.test(dosePrefix2)) continue;

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
 * 개당 포(sachet/스틱) 수 추출 — 정/캡슐과 별도 처리
 *
 * 포(sachet)는 포장 단위이므로 수량(N개)과 곱하지 않는다.
 * "30포 3개" → 개당캡슐/정=30, 수량=3 (NOT 90정, 1개)
 *
 * extractTabletCount가 null일 때만 폴백으로 사용.
 */
function extractSachetCount(name: string): number | null {
  // "포대"(쌀 포대 등 일반 단위), "포기"(채소 단위), "포인" 제외 — 사전의 sachet.negativeLookahead로 정의
  const SACHET_RE = new RegExp(`(\\d+)\\s*${SACHET_UNITS_RE}`, 'g');
  const DOSAGE_PREFIX_RE = /(?:1일|하루|매일|일일)\s*$/;
  // 복합 패턴 내 sachet 제외: "2g × 10포" (× 뒤), "10포 × 3EA" (× 앞)
  // 이런 패턴은 포장 구성 분해이지 제품 스펙이 아님.
  // 제품 스펙은 "30포, 3개" 형태로 × 없이 나타남.
  const COMPOSITE_BEFORE_RE = /[xX×]\s*$/;
  const COMPOSITE_AFTER_RE = /^\s*[xX×]/;
  const matches: { value: number; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = SACHET_RE.exec(name)) !== null) {
    const prefix = name.slice(Math.max(0, m.index - 10), m.index);
    if (DOSAGE_PREFIX_RE.test(prefix)) continue;
    // "Ng × 10포" — × 뒤에 오는 sachet은 포장 분해
    if (COMPOSITE_BEFORE_RE.test(prefix)) continue;
    // "10포 × 3EA" — × 앞에 오는 sachet은 포장 분해
    const postfix = name.slice(m.index + m[0].length, m.index + m[0].length + 10);
    if (COMPOSITE_AFTER_RE.test(postfix)) continue;
    matches.push({ value: parseInt(m[1], 10), index: m.index });
  }
  if (matches.length === 0) return null;
  const reasonable = matches.filter(x => x.value <= 500);
  if (reasonable.length > 0) return reasonable[reasonable.length - 1].value;
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

/** 택1 그룹 이름에서 "(택1)" 제거 + "총 수량" → "수량" 동의어 처리 */
function normalizeOptionName(name: string): string {
  let n = name.replace(/\(택\d+\)\s*/g, '').trim();
  if (n === '총 수량') n = '수량';
  return n;
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

  // 포(sachet) 여부 추적: 포 유래 값은 수량과 곱하지 않음
  let tabletFromSachet = false;

  for (const opt of buyOpts) {
    const name = normalizeOptionName(opt.name);
    const unit = opt.unit;
    let value: string | null = null;

    if ((name === '수량' || name === '총 수량') && unit === '개') {
      value = String(extractCount(productName, composite, hasTabletOpt));
    } else if (name.includes('용량') && unit === 'ml') {
      // "개당 용량", "최소 용량", "용량" 모두 매칭 (저장용량(MB)은 unit≠ml이므로 제외)
      const ml = extractVolumeMl(productName, composite);
      if (ml !== null) value = String(ml);
    } else if (name.includes('중량') && unit === 'g') {
      // "개당 중량", "최소 중량", "중량" 모두 매칭
      const g = extractWeightG(productName, composite);
      if (g !== null) value = String(g);
    } else if (name.includes('중량') && !unit) {
      // 농수산물 중량 등 schema 에 unit 없는 중량 옵션 — 단위 포함 문자열 반환.
      // 순수 숫자만 반환하면 쿠팡윙 UI 가 단위 dropdown 을 "없음"으로 표시 → "17000없음" 같은 anomaly.
      const g = extractWeightG(productName, composite);
      if (g !== null) {
        value = g >= 1000 && g % 100 === 0 ? `${g / 1000}kg` : `${g}g`;
      }
    } else if (name.includes('수량') && name !== '수량' && unit === '개') {
      const perCount = extractPerCount(productName, composite);
      if (perCount !== null) value = String(perCount);
    } else if (name.includes('캡슐') || name.includes('정')) {
      const tabletCount = extractTabletCount(productName);
      if (tabletCount !== null) {
        value = String(tabletCount);
      } else {
        // 정/캡슐 매치 없으면 포(sachet) 폴백 — 포 단위는 수량 곱셈 안 함
        const sachetCount = extractSachetCount(productName);
        if (sachetCount !== null) {
          value = String(sachetCount);
          tabletFromSachet = true;
        }
      }
    } else if ((name === '사이즈' || name.includes('사이즈') || name === '크기') && !opt.unit) {
      // 단위형(cm, mm 등)은 텍스트 사이즈(S/M/L) 부적합 → unit 없는 경우만
      value = extractSize(productName);
    } else if ((name === '색상' || name.includes('색상') || name === '컬러' || name.includes('컬러')) && !opt.unit) {
      // 단위형(개 등 — "색상 수(개)")은 색상명 부적합 → unit 없는 경우만
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
  //
  // ⚠️ 포(sachet) 유래 값은 곱하지 않음!
  // 포는 포장 단위이므로 "30포 3개" = 3개 패키지 × 30포 = 총 90포
  // → 개당캡슐/정=30, 수량=3 (NOT 90정, 1개)
  if (hasTabletOpt && !tabletFromSachet) {
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
  // 쿠팡 c1 그룹은 "최소 한 개" 의미 — 추출된 모든 c1 옵션은 모두 result에 포함
  // (예: 개당 수량 1개입, 개당 중량 135g 둘 다 추출됐으면 둘 다 등록)
  // 단, attribute groupNumber 단계에서 coupang-product-builder가 EXPOSED 그룹 수를
  // 정책상 1개로 줄임. 여기서는 추출 손실 없이 모두 보낸다.
  const choose1Opts = buyOpts.filter((o) => o.choose1);
  let choose1Filled = false;

  if (choose1Opts.length > 0) {
    // 우선순위 정렬: 추출된 값 중 어느 하나는 반드시 등록되도록 정렬
    // 추출 실패 시 폴백 우선순위: 용량(ml) > 캡슐/정 > 중량(g) > 수량(개)
    const priority = ['용량', '캡슐', '정', '중량', '수량'];
    const sorted = [...choose1Opts].sort((a, b) => {
      const rawA = priority.findIndex(p => normalizeOptionName(a.name).includes(p));
      const rawB = priority.findIndex(p => normalizeOptionName(b.name).includes(p));
      return (rawA === -1 ? 99 : rawA) - (rawB === -1 ? 99 : rawB);
    });

    for (const opt of sorted) {
      const ext = extracted.get(opt.name);
      if (ext) {
        result.push({ name: opt.name, value: ext.value, unit: ext.unit });
        choose1Filled = true;
        // break 제거: 추출된 c1 옵션 모두 등록 (Coupang은 groupNumber로 정리)
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
  // 예: "30포 3개" → 30 × 3 = 90 (포도 dose unit으로 계산)
  const tabletCountForUnit = extractTabletCount(productName);
  const sachetCountForUnit = tabletCountForUnit === null ? extractSachetCount(productName) : null;
  const doseCountForUnit = tabletCountForUnit ?? sachetCountForUnit;
  const countForUnit = composite.count || extractCount(productName, composite, doseCountForUnit !== null);
  const perCount = composite.perCount || null;

  let totalUnitCount: number;
  if (doseCountForUnit !== null && doseCountForUnit >= 1) {
    // 건강보조식품: 정/캡슐/포 수 × 수량 = 총 dose unit 수
    totalUnitCount = doseCountForUnit * countForUnit;
    // 개월분 보정: "2개월 1캡슐" → 1×1=1 이지만, 2×30=60이 맞음
    if (totalUnitCount <= 1) {
      const monthMatch = productName.match(/(\d+)\s*개월/);
      if (monthMatch) {
        const months = parseInt(monthMatch[1], 10);
        if (months >= 1 && months <= 24) totalUnitCount = months * 30;
      }
    }
  } else if (perCount) {
    totalUnitCount = perCount * countForUnit;
  } else {
    totalUnitCount = countForUnit;
  }

  // ── 정합성 검증: 단위중량 비현실 (예: "사과 10과 240g" = 24g/개) ──
  validateUnitWeightPlausibility(productName, result, warnings);

  return {
    buyOptions: result,
    confidence: Math.round(confidence * 100) / 100,
    warnings,
    totalUnitCount: totalUnitCount > 0 ? totalUnitCount : undefined,
  };
}

/**
 * 단위중량 비현실 검증 — 카테고리별 최소 단위중량과 비교.
 * 사과 10과 240g (24g/개) 같은 명백한 입력 오류를 감지하여 수량을 1로 안전 폴백.
 * 이를 안 잡으면 쿠팡 단위가격 폭주 + 표시광고법 위반.
 */
function validateUnitWeightPlausibility(
  productName: string,
  result: { name: string; value: string; unit?: string }[],
  warnings: string[],
): void {
  const MIN_UNIT_WEIGHT_G: { pattern: RegExp; minG: number; label: string }[] = [
    { pattern: /사과|배(?!송|치|터|터리)|망고|파인애플|수박|멜론|두리안/, minG: 100, label: '큰 과일' },
    { pattern: /감(?!자|기|미)|귤|오렌지|레몬|자몽|복숭아|키위|아보카도|석류/, minG: 50, label: '중간 과일' },
    { pattern: /닭고기|소고기|돼지고기|오리고기|한우|한돈|삼겹살|목살|등심|안심|갈비/, minG: 100, label: '육류' },
    { pattern: /감자|고구마|양파|당근|무(?!침|료|선|언|관)|배추|호박|가지/, minG: 80, label: '뿌리/엽채' },
  ];

  const lower = productName.toLowerCase();
  const matched = MIN_UNIT_WEIGHT_G.find(p => p.pattern.test(lower));
  if (!matched) return;

  const weightOpt = result.find(r => r.unit === 'g' && /중량|무게|순중량/.test(r.name));
  const countOpt = result.find(r => r.unit === '개' && (r.name === '수량' || r.name === '총 수량'));
  if (!weightOpt || !countOpt) return;

  const weightG = parseFloat(weightOpt.value);
  const count = parseInt(countOpt.value, 10);
  if (!Number.isFinite(weightG) || !Number.isFinite(count) || count <= 1) return;

  const perUnit = weightG / count;
  if (perUnit < matched.minG) {
    warnings.push(
      `[정합성] ${matched.label}(${weightG}g ÷ ${count}개 = ${perUnit.toFixed(0)}g/개) — 단위중량 ${matched.minG}g 미만, 입력 오류 의심. 수량을 1로 폴백.`,
    );
    countOpt.value = '1';
  }
}

// ─── 필수 옵션 기본값 (추출 실패 시 쿠팡 등록 거부 방지) ──

/**
 * 추출 실패한 필수 옵션에 안전한 기본값을 반환한다.
 * 쿠팡이 허용하는 범용 값만 사용.
 * null이면 기본값 없음 → 경고만 출력.
 */
function getRequiredFallback(optionName: string, productName: string, unit?: string): string | null {
  const n = optionName.toLowerCase();

  // ── 기본 폴백값 ──
  // 단위형: "1" (숫자 필수 — "상세페이지 참조ml" → API 에러 방지)
  // 텍스트형: "상세페이지 참조" (필수 옵션 누락 → 등록 거부 방지)
  const numericFallback = unit ? '1' : '상세페이지 참조';

  // 색상 계열 (단위형 "색상 수(개)" 등은 숫자 폴백)
  if ((n.includes('색상') || n.includes('컬러') || n === '색') && !unit) {
    const color = extractColor(productName);
    return color || '상세페이지 참조';
  }

  // 모델명/품번
  if (n.includes('모델') || n.includes('품번')) {
    return '자체제작';
  }

  // 사이즈 (단위형 "최대커버사이즈(cm)" 등은 숫자 폴백)
  if ((n.includes('사이즈') || n.includes('크기')) && !unit) {
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
  //   주의: 일부 카테고리(오렌지 등 신선식품)의 농산물 중량 옵션은 schema 에 unit 필드가 없음.
  //   unit=undefined 인 채 숫자만 반환하면 쿠팡윙 UI 에서 "17000없음" 처럼 표시되어 사용자 혼란.
  //   → 단위 미정의 카테고리는 value 에 단위 포함 문자열 반환 ("17kg" / "500g") — 윙은 free-text 수용.
  if ((n.includes('수산물') || n.includes('농산물')) && n.includes('중량')) {
    const wt = extractWeightG(productName, {});
    if (wt !== null) {
      if (unit === 'kg') return String(wt / 1000);
      if (unit === 'g') return String(wt);
      // unit 미정의 — 단위 포함 문자열
      if (wt >= 1000 && wt % 100 === 0) return `${wt / 1000}kg`;
      return `${wt}g`;
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
  // 단위형 → "1" (숫자 필수), 텍스트형 → "상세페이지 참조" (누락 방지)
  return unit ? '1' : '상세페이지 참조';
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

  // 포(sachet) 여부 추적: 포 유래 값은 수량과 곱하지 않음
  let tabletFromSachetEnhanced = false;

  for (const opt of buyOpts) {
    const name = normalizeOptionName(opt.name);
    const unit = opt.unit;
    let value: string | null = null;

    if (name === '수량' && unit === '개') {
      // extractCountRaw 사용: found=false(기본값 1)이면 value=null → Layer 1.5에서 displayName 시도
      const countResult = extractCountRaw(context.productName, composite, hasTabletOpt);
      if (countResult.found) value = String(countResult.value);
    } else if (name.includes('용량') && unit === 'ml') {
      const ml = extractVolumeMl(context.productName, composite);
      if (ml !== null) value = String(ml);
    } else if (name.includes('중량') && unit === 'g') {
      const g = extractWeightG(context.productName, composite);
      if (g !== null) value = String(g);
    } else if (name.includes('중량') && !unit) {
      // 농수산물 중량 등 schema 에 unit 없는 중량 옵션 — 단위 포함 문자열 반환.
      // 순수 숫자만 반환하면 쿠팡윙 UI 가 단위 dropdown 을 "없음"으로 표시 → "17000없음" 같은 anomaly.
      const g = extractWeightG(context.productName, composite);
      if (g !== null) {
        value = g >= 1000 && g % 100 === 0 ? `${g / 1000}kg` : `${g}g`;
      }
    } else if (name.includes('수량') && name !== '수량' && unit === '개') {
      const perCount = extractPerCount(context.productName, composite);
      if (perCount !== null) value = String(perCount);
    } else if (name.includes('캡슐') || name.includes('정')) {
      const tabletCount = extractTabletCount(context.productName);
      if (tabletCount !== null) {
        value = String(tabletCount);
      } else {
        // 정/캡슐 매치 없으면 포(sachet) 폴백 — 포 단위는 수량 곱셈 안 함
        const sachetCount = extractSachetCount(context.productName);
        if (sachetCount !== null) {
          value = String(sachetCount);
          tabletFromSachetEnhanced = true;
        }
      }
    } else if ((name === '사이즈' || name.includes('사이즈') || name === '크기') && !opt.unit) {
      // 단위형(cm, mm 등)은 텍스트 사이즈(S/M/L) 부적합 → unit 없는 경우만
      value = extractSize(context.productName);
    } else if ((name === '색상' || name.includes('색상') || name === '컬러' || name.includes('컬러')) && !opt.unit) {
      // 단위형(개 등 — "색상 수(개)")은 색상명 부적합 → unit 없는 경우만
      value = extractColor(context.productName);
    }

    if (value !== null) {
      layer1.set(opt.name, { value, unit });
    }
  }

  // ── Layer 1.5: displayName 폴백 (소스 상품명에서 스펙 미추출 시) ──
  // AI 생성 노출상품명에는 "10ml, 1개", "30포, 2개" 등 정확한 스펙 포함.
  // 소스 상품명(중국어/코드명)에 스펙 정보 없을 때 displayName으로 보완.
  if (context.displayName && context.displayName !== context.productName) {
    const displayComposite = extractComposite(context.displayName);
    for (const opt of buyOpts) {
      if (layer1.has(opt.name)) continue;
      const name = normalizeOptionName(opt.name);
      const unit = opt.unit;
      let value: string | null = null;

      if (name.includes('용량') && unit === 'ml') {
        const ml = extractVolumeMl(context.displayName, displayComposite);
        if (ml !== null) value = String(ml);
      } else if (name.includes('중량') && unit === 'g') {
        const g = extractWeightG(context.displayName, displayComposite);
        if (g !== null) value = String(g);
      } else if (name.includes('중량') && !unit) {
        const g = extractWeightG(context.displayName, displayComposite);
        if (g !== null) {
          value = g >= 1000 && g % 100 === 0 ? `${g / 1000}kg` : `${g}g`;
        }
      } else if (name.includes('캡슐') || name.includes('정')) {
        const tabletCount = extractTabletCount(context.displayName);
        if (tabletCount !== null) {
          value = String(tabletCount);
        } else {
          const sachetCount = extractSachetCount(context.displayName);
          if (sachetCount !== null) {
            value = String(sachetCount);
            tabletFromSachetEnhanced = true;
          }
        }
      } else if ((name === '수량' || name === '총 수량') && unit === '개') {
        // extractCountRaw 사용: displayName에 실제 수량 패턴이 있을 때만 설정
        const displayCountResult = extractCountRaw(context.displayName!, displayComposite, hasTabletOpt);
        if (displayCountResult.found) value = String(displayCountResult.value);
      } else if (name === '개당 수량' && unit === '개') {
        const perCount = extractPerCount(context.displayName, displayComposite);
        if (perCount !== null) value = String(perCount);
      }

      if (value !== null) {
        layer1.set(opt.name, { value, unit });
        warnings.push(`'${opt.name}' → displayName 폴백: "${value}${unit || ''}"`);
      }
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
    } else if ((name.includes('색상') || name.includes('컬러')) && layer2.color && !opt.unit) {
      // 단위형("색상 수(개)" 등)에 텍스트 색상 넣으면 API 에러
      layer1.set(opt.name, { value: layer2.color, unit: opt.unit });
    } else if ((name.includes('사이즈') || name.includes('크기')) && layer2.size && !opt.unit) {
      // 단위형("최대커버사이즈(cm)" 등)에 텍스트 사이즈 넣으면 API 에러
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
  // ⚠️ 포(sachet) 유래 값은 곱하지 않음 (30포 3개 → 30정,3개 NOT 90정,1개)
  if (hasTabletOpt && !tabletFromSachetEnhanced) {
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
        let sanitized = sanitizeBuyOptionValue(aiValue, opt.unit);
        // 농수산물 중량 등 schema unit 없는 중량 옵션: 순수 숫자면 단위 부착 (Wing "X없음" 방지).
        if (sanitized && !opt.unit && /중량|무게/.test(normalizeOptionName(opt.name)) && /^\d+(?:\.\d+)?$/.test(sanitized)) {
          const n = parseFloat(sanitized);
          sanitized = n >= 1000 && n % 100 === 0 ? `${n / 1000}kg` : `${n}g`;
        }
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
    const priority = ['용량', '캡슐', '정', '중량', '수량'];
    const sorted = [...choose1Opts].sort((a, b) => {
      const rawA = priority.findIndex(p => normalizeOptionName(a.name).includes(p));
      const rawB = priority.findIndex(p => normalizeOptionName(b.name).includes(p));
      return (rawA === -1 ? 99 : rawA) - (rawB === -1 ? 99 : rawB);
    });

    for (const opt of sorted) {
      const ext = layer1.get(opt.name);
      if (ext) {
        result.push({ name: opt.name, value: ext.value, unit: ext.unit });
        choose1FilledFinal = true;
        // break 제거: 추출된 모든 c1 옵션 등록 (Coupang groupNumber 단계에서 정리)
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

  // totalUnitCount — sourceName 우선, displayName 폴백
  let doseCountForUnit = extractTabletCount(context.productName)
    ?? extractSachetCount(context.productName);
  // displayName 폴백 (dose)
  if (doseCountForUnit === null && context.displayName) {
    doseCountForUnit = extractTabletCount(context.displayName)
      ?? extractSachetCount(context.displayName);
  }
  // count — sourceName에서 실제 매칭 우선, 없으면 displayName
  const countRawForUnit = extractCountRaw(context.productName, composite, doseCountForUnit !== null);
  let countForUnit: number;
  if (countRawForUnit.found) {
    countForUnit = countRawForUnit.value;
  } else if (context.displayName) {
    const dnCompForUnit = extractComposite(context.displayName);
    countForUnit = extractCount(context.displayName, dnCompForUnit, doseCountForUnit !== null);
  } else {
    countForUnit = 1;
  }
  const perCount = composite.perCount || null;

  let totalUnitCount: number;
  if (doseCountForUnit !== null && doseCountForUnit >= 1) {
    // 건강보조식품: 정/캡슐/포 수 × 수량 = 총 dose unit 수
    totalUnitCount = doseCountForUnit * countForUnit;
    if (totalUnitCount <= 1) {
      const monthMatch = context.productName.match(/(\d+)\s*개월/);
      if (monthMatch) {
        const months = parseInt(monthMatch[1], 10);
        if (months >= 1 && months <= 24) totalUnitCount = months * 30;
      }
    }
  } else if (perCount) {
    totalUnitCount = perCount * countForUnit;
  } else {
    totalUnitCount = countForUnit;
  }

  // ── 정합성 검증: 단위중량 비현실 (예: "사과 10과 240g" = 24g/개) ──
  validateUnitWeightPlausibility(context.productName, result, warnings);

  return {
    buyOptions: result,
    confidence: Math.round(confidence * 100) / 100,
    warnings,
    totalUnitCount: totalUnitCount > 0 ? totalUnitCount : undefined,
  };
}
